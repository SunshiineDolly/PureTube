use crate::{database, write_snapshot, AppData, Result, MAX_LIBRARY};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::{async_runtime::Mutex, State};

#[derive(Default)]
pub struct Account(Mutex<Option<Session>>);

#[derive(Clone, Deserialize, Serialize)]
pub struct Identity {
    id: String,
    email: String,
}

#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
    user: Identity,
}

struct Session {
    tokens: Tokens,
    refresh_at: Instant,
}

fn config() -> Result<(&'static str, &'static str)> {
    let url = option_env!("VIDDY_SUPABASE_URL").unwrap_or("https://hsmnntzonyjhmnuzmuga.supabase.co").trim_end_matches('/');
    let key = option_env!("VIDDY_SUPABASE_PUBLISHABLE_KEY").unwrap_or("sb_publishable_njzZqwCCIegLCcoE_QBfzQ_oWgI8A-a");
    let project = url.strip_prefix("https://").and_then(|url| url.strip_suffix(".supabase.co"));
    if !project.is_some_and(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
        || !key.starts_with("sb_publishable_")
    {
        return Err("Account sync is unavailable in this build.".into());
    }
    Ok((url, key))
}

fn request(app: &AppData, method: reqwest::Method, path: &str) -> Result<reqwest::RequestBuilder> {
    let (url, key) = config()?;
    Ok(app.client.request(method, format!("{url}{path}")).header("apikey", key))
}

fn session(tokens: Tokens) -> Session {
    let refresh_at = Instant::now() + Duration::from_secs(tokens.expires_in.min(86_400).saturating_sub(60));
    Session { tokens, refresh_at }
}

#[tauri::command]
pub fn account_configured() -> bool {
    config().is_ok()
}

#[tauri::command]
pub async fn account_send_code(app: State<'_, AppData>, email: String, create: bool) -> Result<()> {
    let email = email.trim();
    if email.len() > 254 || !email.contains('@') {
        return Err("Enter a valid email address.".into());
    }
    let response = request(&app, reqwest::Method::POST, "/auth/v1/otp")?
        .json(&json!({"email":email,"create_user":create}))
        .send().await.map_err(|_| "Could not reach the account service.")?;
    match response.status().as_u16() {
        200..=299 => Ok(()),
        429 => Err("Too many requests. Wait a moment before requesting another code.".into()),
        _ => Err("Could not send a code. Check the email and account service settings.".into()),
    }
}

fn verification(email: &str, input: &str, endpoint: &str) -> Result<Value> {
    let invalid = || "Paste the sign-in link from your email, or enter the code.".to_string();
    if (6..=10).contains(&input.len()) && input.bytes().all(|b| b.is_ascii_digit()) {
        return Ok(json!({"email":email,"token":input,"type":"email"}));
    }
    if input.len() > 2048 {
        return Err(invalid());
    }
    let url = reqwest::Url::parse(input).map_err(|_| invalid())?;
    if url.origin().ascii_serialization() != endpoint || url.path() != "/auth/v1/verify"
        || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some()
    {
        return Err(invalid());
    }
    let mut token = None;
    let mut kind = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "token" if token.is_none() => token = Some(value),
            "type" if kind.is_none() => kind = Some(value),
            "token" | "type" => return Err(invalid()),
            _ => {}
        }
    }
    let token = token.filter(|value| value.len() == 56 && value.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or_else(&invalid)?;
    let kind = kind.filter(|value| matches!(value.as_ref(), "signup" | "magiclink" | "email"))
        .ok_or_else(invalid)?;
    Ok(json!({"token_hash":token,"type":kind}))
}

#[tauri::command]
pub async fn account_verify(app: State<'_, AppData>, account: State<'_, Account>, email: String, code: String) -> Result<SignIn> {
    let mut active = account.0.lock().await;
    if active.is_some() {
        return Err("Sign out before starting another session.".into());
    }
    let email = email.trim();
    let payload = verification(email, code.trim(), config()?.0)?;
    let response = request(&app, reqwest::Method::POST, "/auth/v1/verify")?
        .json(&payload)
        .send().await.map_err(|_| "Could not reach the account service.")?;
    let tokens: Tokens = response.error_for_status().map_err(|_| "The sign-in link or code is invalid or expired. Request a new email.")?
        .json().await.map_err(|_| "The account service returned an invalid session.")?;
    let identity = tokens.user.clone();
    if !identity.email.eq_ignore_ascii_case(email) {
        return Err("This sign-in email belongs to a different address.".into());
    }
    let base = {
        let _guard = app.library_guard.lock().map_err(|_| "Library is busy.")?;
        bind(&database(&app.db)?, &identity.id)?
    };
    *active = Some(session(tokens));
    Ok(SignIn { identity, base })
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

async fn authorized(
    app: &AppData, session_state: &mut Option<Session>, method: reqwest::Method, path: &str
) -> Result<reqwest::RequestBuilder> {
    let active = session_state.as_ref().ok_or("Sign in to sync your library.")?;
    if Instant::now() >= active.refresh_at {
        let response = request(app, reqwest::Method::POST, "/auth/v1/token?grant_type=refresh_token")?
            .json(&json!({"refresh_token":active.tokens.refresh_token}))
            .send().await.map_err(|_| "Could not reach the account service.")?;
        if matches!(response.status().as_u16(), 400 | 401 | 403) {
            *session_state = None;
            return Err("Your session expired. Sign out in Settings and sign in again.".into());
        }
        let tokens = response.error_for_status().map_err(|_| "Could not refresh the account session.")?
            .json().await.map_err(|_| "The account service returned an invalid session.")?;
        *session_state = Some(session(tokens));
    }
    Ok(request(app, method, path)?.bearer_auth(&session_state.as_ref().unwrap().tokens.access_token))
}

#[derive(Deserialize, Serialize)]
pub struct Snapshot {
    revision: u32,
    data: Value,
}

#[tauri::command]
pub async fn account_read(app: State<'_, AppData>, account: State<'_, Account>, known_revision: Option<u32>) -> Result<Option<Snapshot>> {
    let mut active = account.0.lock().await;
    let mut query = authorized(&app, &mut active, reqwest::Method::GET, "/rest/v1/viddy_library?select=revision,data&limit=1").await?;
    if let Some(revision) = known_revision {
        query = query.query(&[("revision", format!("neq.{revision}"))]);
    }
    let response = query.send().await.map_err(|_| "Could not reach the account service.")?;
    let rows: Vec<Snapshot> = response.error_for_status().map_err(|_| "Could not read your cloud library.")?
        .json().await.map_err(|_| "The cloud library returned invalid data.")?;
    Ok(rows.into_iter().next())
}

#[tauri::command]
pub async fn account_write(app: State<'_, AppData>, account: State<'_, Account>, revision: u32, data: Value) -> Result<bool> {
    if data.get("version").and_then(Value::as_u64) != Some(1) || data.to_string().len() > MAX_LIBRARY {
        return Err("The library format or size is unsupported.".into());
    }
    let mut active = account.0.lock().await;
    let response = authorized(&app, &mut active, reqwest::Method::POST, "/rest/v1/rpc/viddy_write_library").await?
        .json(&json!({"expected":revision,"snapshot":data}))
        .send().await.map_err(|_| "Could not reach the account service.")?;
    response.error_for_status().map_err(|_| "Could not save your cloud library.")?
        .json().await.map_err(|_| "The cloud library returned an invalid save result.".into())
}

#[tauri::command]
pub async fn account_sign_out(account: State<'_, Account>) -> Result<()> {
    *account.0.lock().await = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_in_link_uses_only_the_configured_verification_endpoint() {
        let endpoint = "https://demo.supabase.co";
        let email = "test@example.com";
        let token = "a".repeat(56);
        for kind in ["magiclink", "signup"] {
            let link = format!("{endpoint}/auth/v1/verify?token={token}&type={kind}&redirect_to=http%3A%2F%2Flocalhost%3A3000");
            assert_eq!(verification(email, &link, endpoint).unwrap(), json!({"token_hash":token,"type":kind}));
        }
        assert_eq!(verification(email, "123456", endpoint).unwrap(), json!({"email":email,"token":"123456","type":"email"}));
        let wrong_project = format!("https://other.supabase.co/auth/v1/verify?token={token}&type=magiclink");
        assert!(verification(email, &wrong_project, endpoint).is_err());
        let wrong_action = format!("{endpoint}/auth/v1/verify?token={token}&type=recovery");
        assert!(verification(email, &wrong_action, endpoint).is_err());
    }

    #[test]
    fn sync_checkpoint_and_library_are_saved_together_for_the_bound_account() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("library.sqlite3");
        let conn = database(&path).unwrap();
        assert_eq!(bind(&conn, "owner").unwrap(), None);
        assert!(bind(&conn, "different-account").is_err());

        let cloud = json!({"version": 1, "favorites": ["vWG8Exo0QQ4"]});
        let wrong = Binding { id: "different-account".into(), base: Some(cloud.clone()) };
        assert!(save_synced(&path, &cloud, &wrong).is_err());
        assert_eq!(crate::read(&path).unwrap(), None);

        let own = Binding { id: "owner".into(), base: Some(cloud.clone()) };
        save_synced(&path, &cloud, &own).unwrap();
        assert_eq!(crate::read(&path).unwrap(), Some(cloud.clone()));
        assert_eq!(bind(&conn, "owner").unwrap(), Some(cloud));
    }
}
