#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_opener::OpenerExt;

const MAX_LIBRARY: usize = 4 * 1024 * 1024;
type Result<T> = std::result::Result<T, String>;
type Cache = HashMap<String, (Instant, Value)>;
struct AppData {
    db: PathBuf,
    client: reqwest::Client,
    cache: Mutex<Cache>,
    isolated: bool,
}

fn database(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path).map_err(|_| "Could not open the local library.")?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.execute_batch("CREATE TABLE IF NOT EXISTS library (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL);")
        .map_err(|_| "Could not initialize the local library.")?;
    Ok(conn)
}
fn read(path: &Path) -> Result<Option<Value>> {
    let raw: Option<String> = database(path)?
        .query_row("SELECT data FROM library WHERE id=1", [], |row| row.get(0))
        .optional()
        .map_err(|_| "Could not read the local library.")?;
    raw.map(|item| serde_json::from_str(&item).map_err(|_| "The local library is damaged.".into()))
        .transpose()
}
fn write(path: &Path, data: Value) -> Result<()> {
    let raw = data.to_string();
    if data.get("version").and_then(Value::as_u64) != Some(1) || raw.len() > MAX_LIBRARY {
        return Err("The library format or size is unsupported.".into());
    }
    database(path)?
        .execute(
            "INSERT INTO library VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            params![raw],
        )
        .map_err(|_| "Could not save the local library.")?;
    Ok(())
}
#[tauri::command]
fn load(state: State<AppData>) -> Result<Option<Value>> {
    read(&state.db)
}
#[tauri::command]
fn save(app: tauri::AppHandle, state: State<AppData>, data: Value) -> Result<()> {
    let show_tray = data
        .pointer("/settings/tray")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    write(&state.db, data)?;
    if let Some(tray) = app.tray_by_id("puretube") {
        let _ = tray.set_visible(show_tray);
    }
    Ok(())
}
fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new("app.puretube.desktop", "youtube-data-api")
        .map_err(|_| "Windows Credential Manager is unavailable.".into())
}
fn credential() -> Result<Option<String>> {
    match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read Windows Credential Manager.".into()),
    }
}
#[tauri::command]
fn has_key(state: State<AppData>) -> Result<bool> {
    Ok(!state.isolated && credential()?.is_some())
}
#[tauri::command]
fn set_key(state: State<AppData>, key: String) -> Result<()> {
    if state.isolated {
        return Err("Credentials are unavailable in an isolated profile.".into());
    }
    let key = key.trim();
    let entry = entry()?;
    if key.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err("Could not remove the saved API key.".into()),
        }
    } else {
        if key.len() > 128
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err("Enter a valid Google API key.".into());
        }
        entry
            .set_password(key)
            .map_err(|_| "Could not save the API key.")?;
    }
    state.cache.lock().unwrap().clear();
    Ok(())
}

#[tauri::command]
async fn youtube(
    state: State<'_, AppData>,
    endpoint: String,
    query: Map<String, Value>,
    refresh: bool,
) -> Result<Value> {
    let allowed = match endpoint.as_str() {
        "search" => &[
            "part",
            "q",
            "type",
            "order",
            "maxResults",
            "pageToken",
            "videoDuration",
            "videoEmbeddable",
            "safeSearch",
        ][..],
        "channels" => &["part", "id", "forHandle", "maxResults"][..],
        "videos" => &["part", "id"][..],
        "playlistItems" => &["part", "playlistId", "maxResults", "pageToken"][..],
        "playlists" => &["part", "channelId", "maxResults", "pageToken"][..],
        _ => return Err("Unknown YouTube endpoint.".into()),
    };
    let mut args = Vec::new();
    for (k, v) in &query {
        let value = v.as_str().filter(|s| s.len() <= 2048);
        if !allowed.contains(&k.as_str()) || value.is_none() {
            return Err("Invalid YouTube request.".into());
        }
        args.push((k.as_str(), value.unwrap()));
    }
    let cache_key = format!("{endpoint}:{}", Value::Object(query.clone()));
    if !refresh {
        if let Some((at, data)) = state.cache.lock().unwrap().get(&cache_key) {
            if at.elapsed() < Duration::from_secs(600) {
                return Ok(data.clone());
            }
        }
    }
    let key = (if state.isolated { None } else { credential()? })
        .ok_or("Add a YouTube Data API key in Settings to browse YouTube.")?;
    let response = state
        .client
        .get(format!("https://www.googleapis.com/youtube/v3/{endpoint}"))
        .header("x-goog-api-key", key)
        .query(&args)
        .send()
        .await
        .map_err(|_| "Could not reach YouTube. Your local library is still available.")?;
    let status = response.status();
    let data: Value = response
        .json()
        .await
        .map_err(|_| "YouTube returned an unreadable response.")?;
    if !status.is_success() {
        return Err(api_error(status.as_u16(), &data).into());
    }
    let mut cache = state.cache.lock().unwrap();
    if cache.len() >= 128 {
        cache.retain(|_, (at, _)| at.elapsed() < Duration::from_secs(600));
    }
    if cache.len() >= 128 {
        cache.clear();
    }
    cache.insert(cache_key, (Instant::now(), data.clone()));
    Ok(data)
}

fn api_error(status: u16, data: &Value) -> &'static str {
    let reason = data
        .pointer("/error/errors/0/reason")
        .and_then(Value::as_str)
        .unwrap_or("");
    match (status, reason) {
        (429, _) | (_, "quotaExceeded" | "dailyLimitExceeded" | "rateLimitExceeded" | "userRateLimitExceeded") => "The YouTube API quota has been reached. Check your Google Cloud project quota and try again later.",
        (_, "keyInvalid" | "accessNotConfigured" | "forbidden") => "Check that your API key is valid, permits this request, and has YouTube Data API v3 enabled.",
        (400 | 403, _) => "YouTube rejected the request. Check the API key restrictions and project quota in Google Cloud.",
        _ => "YouTube could not complete this request. Please try again later.",
    }
}

#[tauri::command]
async fn public_feed(state: State<'_, AppData>, id: String) -> Result<String> {
    if id.len() != 24
        || !id.starts_with("UC")
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Enter a valid YouTube channel ID (it starts with UC).".into());
    }
    let mut response = state
        .client
        .get("https://www.youtube.com/feeds/videos.xml")
        .query(&[("channel_id", id)])
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send()
        .await
        .map_err(|_| "Could not reach YouTube's public feed.")?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            404 => "YouTube has no public feed for this channel. Check the channel ID.",
            429 => "YouTube is rate limiting feed checks. Try again in a few minutes.",
            _ => "YouTube's public feed is temporarily unavailable.",
        }
        .into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read YouTube's public feed.")?
    {
        if bytes.len() + chunk.len() > 1_048_576 {
            return Err("YouTube returned an unexpectedly large feed.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "YouTube returned an unreadable feed.".into())
}

#[tauri::command]
fn open_search(app: tauri::AppHandle, query: String) -> Result<()> {
    if query.trim().is_empty() || query.chars().count() > 256 {
        return Err("Enter a YouTube search of up to 256 characters.".into());
    }
    let url = reqwest::Url::parse_with_params(
        "https://www.youtube.com/results",
        &[("search_query", query)],
    )
    .map_err(|_| "Could not build the search URL.")?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "Could not open your browser.".into())
}

#[tauri::command]
fn open_info(app: tauri::AppHandle, page: String) -> Result<()> {
    let url = match page.as_str() {
        "youtube" => "https://www.youtube.com/",
        "terms" => "https://www.youtube.com/t/terms",
        "privacy" => "https://policies.google.com/privacy",
        _ => return Err("Unknown page.".into()),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Could not open your browser.".into())
}
#[tauri::command]
fn open_video(app: tauri::AppHandle, id: String) -> Result<()> {
    if id.len() != 11
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid video ID.".into());
    }
    app.opener()
        .open_url(
            format!("https://www.youtube.com/watch?v={id}"),
            None::<&str>,
        )
        .map_err(|_| "Could not open your browser.".into())
}
#[tauri::command]
async fn export_library(app: tauri::AppHandle, data: Value) -> Result<bool> {
    let raw = serde_json::to_vec_pretty(&data).map_err(|_| "Could not format the backup.")?;
    if let Some(FilePath::Path(path)) = app
        .dialog()
        .file()
        .set_file_name("PureTube-library.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file()
    {
        std::fs::write(path, raw).map_err(|_| "Could not write the selected backup file.")?;
        return Ok(true);
    }
    Ok(false)
}
#[tauri::command]
async fn import_library(app: tauri::AppHandle) -> Result<Option<Value>> {
    use std::io::Read;
    if let Some(FilePath::Path(path)) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    {
        let file = std::fs::File::open(path).map_err(|_| "Could not open the selected backup.")?;
        let mut bytes = Vec::new();
        file.take((MAX_LIBRARY + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "Could not read the selected backup.")?;
        if bytes.len() > MAX_LIBRARY {
            return Err("This backup is too large.".into());
        }
        return serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| "This is not a valid JSON backup.".into());
    }
    Ok(None)
}
#[tauri::command]
fn startup(app: tauri::AppHandle, state: State<AppData>, enabled: Option<bool>) -> Result<bool> {
    if state.isolated {
        return Ok(false);
    }
    let manager = app.autolaunch();
    match enabled {
        Some(true) => manager.enable().map_err(|e| e.to_string())?,
        Some(false) => manager.disable().map_err(|e| e.to_string())?,
        None => (),
    }
    manager.is_enabled().map_err(|e| e.to_string())
}
fn main() {
    // A separate profile makes installer checks safe on a machine with an existing library.
    let profile = std::env::var_os("PURETUBE_ISOLATED_PROFILE").map(PathBuf::from);
    let builder = tauri::Builder::default();
    let builder = if profile.is_none() {
        builder.plugin(tauri_plugin_window_state::Builder::default().build())
    } else {
        builder
    };
    builder
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::Resized(_) = event {
                if window.is_minimized().unwrap_or(false) {
                    let Some(state) = window.try_state::<AppData>() else {
                        return;
                    };
                    if read(&state.db)
                        .ok()
                        .flatten()
                        .and_then(|v| v.pointer("/settings/tray").and_then(Value::as_bool))
                        .unwrap_or(false)
                    {
                        let _ = window.hide();
                    }
                }
            }
        })
        .setup(move |app| {
            let isolated = profile.is_some();
            let dir = match profile {
                Some(dir) if dir.is_absolute() => dir,
                Some(_) => return Err("PURETUBE_ISOLATED_PROFILE must be an absolute path".into()),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .redirect(reqwest::redirect::Policy::none())
                .build()?;
            app.manage(AppData {
                db: dir.join("library.sqlite3"),
                client,
                cache: Mutex::new(HashMap::new()),
                isolated,
            });
            desktop::configure_tray(app)?;
            #[cfg(windows)]
            if let Some(main) = app.get_webview_window("main") {
                main.with_webview(|webview| {
                    let _ = desktop::configure_youtube_identity(webview);
                })?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load,
            save,
            has_key,
            set_key,
            youtube,
            public_feed,
            open_search,
            open_video,
            open_info,
            export_library,
            import_library,
            startup
        ])
        .run(tauri::generate_context!())
        .expect("Could not launch PureTube");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn api_errors_explain_quota_and_credentials_without_echoing_google_payload() {
        assert!(api_error(
            403,
            &json!({"error":{"errors":[{"reason":"quotaExceeded"}]}})
        )
        .contains("quota has been reached"));
        assert!(api_error(429, &Value::Null).contains("quota has been reached"));
        assert!(api_error(
            403,
            &json!({"error":{"errors":[{"reason":"accessNotConfigured"}]}})
        )
        .contains("has YouTube Data API v3 enabled"));
        assert!(
            !api_error(503, &json!({"error":{"message":"request-secret"}}))
                .contains("request-secret")
        );
    }
    #[test]
    fn persists_beyond_connection_and_replaces_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("library.db");
        assert_eq!(read(&path).unwrap(), None);
        let value = json!({"version": 1, "follows": ["creator"], "history": {"video": 42}});
        write(&path, value.clone()).unwrap();
        assert_eq!(read(&path).unwrap(), Some(value.clone()));
        assert!(write(&path, json!({"version": 9})).is_err());
        assert_eq!(read(&path).unwrap(), Some(value));
        let empty = json!({"version": 1});
        write(&path, empty.clone()).unwrap();
        assert_eq!(read(&path).unwrap(), Some(empty));
    }
}
