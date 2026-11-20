use crate::account_callback::Callback;
use crate::{database, write_snapshot, AppData, Result, MAX_LIBRARY};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{async_runtime::Mutex, State};
use tauri_plugin_opener::OpenerExt;

const SERVICE: &str = "https://viddy-sync.sunshiinedolly.workers.dev";

#[derive(Default)]
pub struct Account(Mutex<Option<Session>>, Mutex<Option<Callback>>);

#[derive(Clone, Deserialize, Serialize)]
pub struct Identity { id: String, display_name: String }

// This type never leaves the native process or enters the library database.
#[derive(Clone, Deserialize, Serialize)]
struct Session { token: String, identity: Identity }

impl Session {
    fn valid(&self) -> bool {
        self.token.len() == 43 && self.token.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
            && self.identity.id.strip_prefix("discord:").is_some_and(|id|
                (16..=22).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit()))
            && self.identity.display_name.chars().count() <= 100
    }
}

fn vault(path: &Path) -> Result<keyring::Entry> {
    // Isolated profiles never read or modify production credentials.
    let scope = Sha256::digest(path.to_string_lossy().as_bytes());
    let scope = scope.iter().map(|b| format!("{b:02x}")).collect::<String>();
    keyring::Entry::new("Viddy.DiscordSession.v1", &scope)
        .map_err(|_| "Could not open secure account storage.".into())
}

fn load_session(path: &Path) -> Result<Option<Session>> {
    match vault(path)?.get_password() {
        Ok(raw) => {
            let session: Session = serde_json::from_str(&raw).map_err(|_| "Could not read the saved account. Log out and try again.")?;
            if !session.valid() { return Err("The saved account is invalid. Log out and try again.".into()); }
            Ok(Some(session))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not unlock your saved account. Your library is safe; try again after unlocking your device.".into()),
    }
}

fn clear_session(path: &Path) -> Result<()> {
    match vault(path)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the saved sign-in. Try logging out again.".into()),
    }
}

fn request(app: &AppData, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
    app.client.request(method, format!("{SERVICE}{path}"))
}

async fn checked(response: reqwest::Response) -> Result<reqwest::Response> {
    if response.status().is_success() { return Ok(response); }
    Err(match response.status().as_u16() {
        401 => "This sign-in request expired. Please try again.",
        429 => "Too many sign-in attempts. Please wait a few minutes.",
        413 => "Your library is too large to sync. Your local library is safe.",
        _ => "Viddy sync is temporarily unavailable. Your local library is safe.",
    }.into())
}

#[tauri::command]
pub fn account_configured() -> bool { true }

#[tauri::command]
pub async fn account_start(handle: tauri::AppHandle, app: State<'_, AppData>, account: State<'_, Account>) -> Result<()> {
    let mut pending = account.1.lock().await;
    let active = account.0.lock().await;
    if active.is_some() { return Err("Log out before opening another account.".into()); }
    let callback = Callback::start()?;
    let response = request(&app, reqwest::Method::POST, "/v1/auth/start")
        .json(&json!({"redirect_uri": callback.redirect, "code_challenge": callback.challenge()}))
        .send().await.map_err(|_| "Could not reach Discord sign-in. Check your connection and try again.")?;
    let data: Value = checked(response).await?.json().await.map_err(|_| "Invalid sign-in response.")?;
    let url = data["url"].as_str().and_then(|url| reqwest::Url::parse(url).ok())
        .filter(|url| url.scheme() == "https" && url.host_str() == Some("discord.com")
            && url.path() == "/oauth2/authorize" && url.username().is_empty() && url.password().is_none() && url.port().is_none())
        .ok_or("Invalid Discord sign-in address.")?;
    handle.opener().open_url(url.as_str(), None::<&str>).map_err(|_| "Could not open your browser for Discord sign-in.")?;
    *pending = Some(callback);
    Ok(())
}

#[tauri::command]
pub async fn account_restore(app: State<'_, AppData>, account: State<'_, Account>) -> Result<Option<SignIn>> {
    let mut active = account.0.lock().await;
    if active.is_none() { *active = load_session(&app.db)?; }
    let Some(session) = active.as_ref() else { return Ok(None); };
    let _guard = app.library_guard.lock().map_err(|_| "Library is busy.")?;
    let base = bind(&database(&app.db)?, &session.identity.id)?;
    Ok(Some(SignIn {identity: session.identity.clone(), base}))
}

#[tauri::command]
pub async fn account_cancel(account: State<'_, Account>) -> Result<()> {
    *account.1.lock().await = None;
    Ok(())
}

#[tauri::command]
pub async fn account_poll(app: State<'_, AppData>, account: State<'_, Account>) -> Result<Option<SignIn>> {
    let mut pending = account.1.lock().await;
    let Some(callback) = pending.as_ref() else { return Ok(None); };
    let code = match callback.poll() {
        Ok(Some(code)) => code,
        Ok(None) => return Ok(None),
        Err(error) => { *pending = None; return Err(error); }
    };
    let callback = pending.take().unwrap();
    let mut active = account.0.lock().await;
    if active.is_some() { return Err("Log out before opening another account.".into()); }
    let response = request(&app, reqwest::Method::POST, "/v1/auth/exchange")
        .json(&json!({"code": code, "code_verifier": callback.verifier}))
        .send().await.map_err(|_| "Could not finish sign-in. Please try again.")?;
    let session: Session = checked(response).await?.json().await.map_err(|_| "Invalid account response.")?;
    if !session.valid() { return Err("Invalid Discord session.".into()); }
    let base = {
        let _guard = app.library_guard.lock().map_err(|_| "Library is busy.")?;
        let mut conn = database(&app.db)?;
        let tx = conn.transaction().map_err(|_| "Could not link your account.")?;
        sync_table(&tx)?;
        // Reset the old provider's merge baseline, retaining every local library field.
        tx.execute("UPDATE account_sync SET owner=?1, base=NULL WHERE slot=1 AND owner NOT LIKE 'discord:%'", [&session.identity.id])
            .map_err(|_| "Could not migrate your local account link.")?;
        let base = bind(&tx, &session.identity.id)?;
        let raw = serde_json::to_string(&session).map_err(|_| "Could not save your sign-in.")?;
        vault(&app.db)?.set_password(&raw).map_err(|_| "Could not securely save your sign-in. Please try again.")?;
        if tx.commit().is_err() { let _ = clear_session(&app.db); return Err("Could not link your library.".into()); }
        base
    };
    let identity = session.identity.clone();
    *active = Some(session);
    Ok(Some(SignIn {identity, base}))
}

#[derive(Deserialize, Serialize)]
pub struct Binding {
    id: String,
    base: Option<Value>,
}

#[derive(Serialize)]
pub struct SignIn {
    identity: Identity,
    base: Option<Value>,
}

fn sync_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS account_sync (slot INTEGER PRIMARY KEY CHECK(slot = 1), owner TEXT NOT NULL, base TEXT);"
    ).map_err(|_| "Could not initialize local account sync.".into())
}

fn bind(conn: &Connection, id: &str) -> Result<Option<Value>> {
    sync_table(conn)?;
    conn.execute("INSERT OR IGNORE INTO account_sync (slot, owner) VALUES (1, ?1)", [id])
        .map_err(|_| "Could not link this local library.")?;
    let base: Option<Option<String>> = conn.query_row(
        "SELECT base FROM account_sync WHERE slot = 1 AND owner = ?1", [id], |row| row.get(0)
    ).optional().map_err(|_| "Could not read local account sync.")?;
    base.ok_or("This local library is linked to a different Viddy account.")?
        .map(|base| serde_json::from_str(&base).map_err(|_| "Could not read the last synced library.".into()))
        .transpose()
}

pub fn save_synced(path: &Path, data: &Value, binding: &Binding) -> Result<()> {
    let raw = data.to_string();
    let base = binding.base.as_ref().ok_or("Missing synced library.")?.to_string();
    if data.get("version").and_then(Value::as_u64) != Some(1) || raw.len() > MAX_LIBRARY || base.len() > MAX_LIBRARY {
        return Err("The library format or size is unsupported.".into());
    }
    let mut conn = database(path)?;
    let tx = conn.transaction().map_err(|_| "Could not open a library transaction.")?;
    let updated = tx.execute(
        "UPDATE account_sync SET base = ?1 WHERE slot = 1 AND owner = ?2",
        params![base, binding.id],
    ).map_err(|_| "Could not save the sync state.")?;
    if updated != 1 {
        return Err("This local library is linked to a different Viddy account.".into());
    }
    write_snapshot(&tx, &raw)?;
    tx.commit().map_err(|_| "Could not save the synced library.".into())
}

async fn authorized_response(app: &AppData, active: &mut Option<Session>, response: reqwest::Response) -> Result<reqwest::Response> {
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        clear_session(&app.db)?;
        *active = None;
        return Err("SIGNED_OUT: This device was signed out. Please sign in with Discord again.".into());
    }
    checked(response).await
}

#[derive(Deserialize, Serialize)]
pub struct Snapshot { revision: u32, data: Value }

#[tauri::command]
pub async fn account_read(app: State<'_, AppData>, account: State<'_, Account>, known_revision: Option<u32>) -> Result<Option<Snapshot>> {
    let mut active = account.0.lock().await;
    let session = active.as_ref().ok_or("Sign in to sync your library.")?;
    let mut query = request(&app, reqwest::Method::GET, "/v1/library").bearer_auth(&session.token);
    if let Some(revision) = known_revision { query = query.query(&[("revision", revision)]); }
    let response = query.send().await.map_err(|_| "You're offline. Your sign-in and local library are saved; sync will retry.")?;
    authorized_response(&app, &mut active, response).await?.json().await.map_err(|_| "Invalid cloud library response.".into())
}

#[tauri::command]
pub async fn account_write(app: State<'_, AppData>, account: State<'_, Account>, revision: u32, data: Value) -> Result<bool> {
    if data.get("version").and_then(Value::as_u64) != Some(1) || data.to_string().len() > 1_000_000 {
        return Err("The cloud library format or size is unsupported. Your local library is safe.".into());
    }
    let mut active = account.0.lock().await;
    let session = active.as_ref().ok_or("Sign in to sync your library.")?;
    let response = request(&app, reqwest::Method::PUT, "/v1/library").bearer_auth(&session.token)
        .json(&json!({"revision": revision, "data": data})).send().await
        .map_err(|_| "You're offline. Your sign-in and local library are saved; sync will retry.")?;
    authorized_response(&app, &mut active, response).await?.json().await.map_err(|_| "Invalid cloud save response.".into())
}

#[tauri::command]
pub async fn account_sign_out(app: State<'_, AppData>, account: State<'_, Account>) -> Result<()> {
    let mut pending = account.1.lock().await;
    let mut active = account.0.lock().await;
    // Do not report successful logout if the saved session could not be removed.
    let session = if active.is_some() { active.clone() } else { load_session(&app.db).ok().flatten() };
    clear_session(&app.db)?;
    *pending = None;
    *active = None;
    if let Some(session) = session {
        let _ = request(&app, reqwest::Method::POST, "/v1/logout").bearer_auth(session.token).send().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sync_checkpoint_and_library_are_saved_together_for_the_bound_account() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("library.sqlite3");
        let conn = database(&path).unwrap();
        assert_eq!(bind(&conn, "discord:1234567890123456").unwrap(), None);
        assert!(bind(&conn, "discord:9999999999999999").is_err());
        let cloud = json!({"version": 1, "favorites": ["vWG8Exo0QQ4"]});
        let wrong = Binding { id: "other".into(), base: Some(cloud.clone()) };
        assert!(save_synced(&path, &cloud, &wrong).is_err());
        assert_eq!(crate::read(&path).unwrap(), None);
        let own = Binding { id: "discord:1234567890123456".into(), base: Some(cloud.clone()) };
        save_synced(&path, &cloud, &own).unwrap();
        assert_eq!(crate::read(&path).unwrap(), Some(cloud.clone()));
        assert_eq!(bind(&conn, "discord:1234567890123456").unwrap(), Some(cloud));
    }

    #[test]
    #[ignore = "Writes only a temporary test credential to the native OS vault"]
    fn native_session_survives_reopening_and_is_isolated_and_removed_on_logout() {
        let temp = tempfile::tempdir().unwrap();
        let profile = temp.path().join("library.sqlite3");
        let other = temp.path().join("other.sqlite3");
        let session = Session { token: "a".repeat(43), identity: Identity { id: "discord:1234567890123456".into(), display_name: "Viddy vault test".into() } };
        vault(&profile).unwrap().set_password(&serde_json::to_string(&session).unwrap()).unwrap();
        let restored = load_session(&profile).unwrap().unwrap();
        assert_eq!(restored.token, session.token);
        assert_eq!(restored.identity.id, session.identity.id);
        assert!(load_session(&other).unwrap().is_none());
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--ignored", "--exact", "account::tests::separate_process_restores_only_the_test_session"])
            .env("VIDDY_VAULT_TEST_PROFILE", &profile).status().unwrap();
        clear_session(&profile).unwrap();
        assert!(status.success());
        assert!(load_session(&profile).unwrap().is_none());
    }

    #[test]
    #[ignore = "Child-process helper for the isolated vault persistence test"]
    fn separate_process_restores_only_the_test_session() {
        let Some(profile) = std::env::var_os("VIDDY_VAULT_TEST_PROFILE") else { return; };
        let session = load_session(Path::new(&profile)).unwrap().unwrap();
        assert_eq!(session.identity.id, "discord:1234567890123456");
        assert_eq!(session.token, "a".repeat(43));
    }
}
