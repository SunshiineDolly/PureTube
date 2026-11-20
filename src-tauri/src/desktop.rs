#[cfg(windows)]
pub fn configure_youtube_identity(
    webview: tauri::webview::PlatformWebview,
    on_video: Option<Box<dyn Fn(String) + Send + Sync>>,
) -> windows_core::Result<()> {
    use webview2_com::{
        take_pwstr, AddScriptToExecuteOnDocumentCreatedCompletedHandler,
        Microsoft::Web::WebView2::Win32::*, NewWindowRequestedEventHandler,
        WebResourceRequestedEventHandler,
    };
    use windows_core::{w, Interface, HSTRING, PCWSTR, PWSTR};
    crate::audio_branding::track(webview.environment());
    unsafe {
        let core = webview.controller().CoreWebView2()?;
        let script = HSTRING::from(include_str!("read-only-chat.js"));
        core.AddScriptToExecuteOnDocumentCreated(
            PCWSTR(script.as_ptr()),
            &AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(|_, _| Ok(()))),
        )?;
        let mut popup_token = 0;
        core.add_NewWindowRequested(
            &NewWindowRequestedEventHandler::create(Box::new(move |_, args| {
                if let Some(args) = args {
                    args.SetHandled(true)?;
                    let mut uri = PWSTR::null();
                    args.Uri(&mut uri)?;
                    if let Some(id) = embedded_video_id(&take_pwstr(uri)) {
                        if let Some(callback) = &on_video { callback(id); }
                    }
                }
                Ok(())
            })),
            &mut popup_token,
        )?;
        let url = w!("https://www.youtube.com/embed/*");
        if let Ok(modern) = core.cast::<ICoreWebView2_22>() {
            modern.AddWebResourceRequestedFilterWithRequestSourceKinds(
                url,
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_DOCUMENT,
            )?;
        } else {
            core.AddWebResourceRequestedFilter(url, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT)?;
        }
        let mut token = 0;
        core.add_WebResourceRequested(
            &WebResourceRequestedEventHandler::create(Box::new(|_, args| {
                if let Some(args) = args {
                    let request = args.Request()?;
                    let mut uri = PWSTR::null();
                    request.Uri(&mut uri)?;
                    if !take_pwstr(uri).starts_with("https://www.youtube.com/embed/") {
                        return Ok(());
                    }
                    // Identify this desktop app, as required by the YouTube embed documentation.
                    request
                        .Headers()?
                        .SetHeader(w!("Referer"), w!("https://app.puretube.desktop/"))?;
                }
                Ok(())
            })),
            &mut token,
        )?;
    }
    Ok(())
}

fn embedded_video_id(raw: &str) -> Option<String> {
    let url = reqwest::Url::parse(raw).ok()?;
    if url.scheme() != "https" { return None; }
    let id = match url.host_str()? {
        "youtu.be" => url.path().trim_start_matches('/').to_owned(),
        "youtube.com" | "www.youtube.com" | "m.youtube.com" if url.path() == "/watch" => url.query_pairs().find(|(k,_)| k=="v")?.1.into_owned(),
        "youtube.com" | "www.youtube.com" if url.path().starts_with("/live/") => url.path().trim_start_matches("/live/").to_owned(),
        _ => return None,
    };
    (id.len()==11 && id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-')).then_some(id)
}

pub fn configure_tray(app: &tauri::App) -> tauri::Result<()> {
    use super::{read, AppData, Manager, Value};
    use tauri::{
        Emitter,
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let open = MenuItem::with_id(app, "updates", "Check updates", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Viddy", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    fn restore(app: &tauri::AppHandle) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
    let mut tray = TrayIconBuilder::with_id("viddy")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Viddy")
        .on_menu_event(|app, e| match e.id.as_ref() {
            "updates" => {
                restore(app);
                let _ = app.emit_to("main", "open-update-settings", ());
            },
            "quit" => app.exit(0),
            _ => (),
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = e
            {
                restore(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    let tray = tray.build(app)?;
    let configured = app.state::<AppData>();
    let enabled = read(&configured.db)
        .ok()
        .flatten()
        .and_then(|v| Some(v.pointer("/settings/tray").and_then(Value::as_bool).unwrap_or(false)||v.pointer("/settings/closeToTray").and_then(Value::as_bool).unwrap_or(false)))
        .unwrap_or(false);
    tray.set_visible(enabled)?;
    Ok(())
}
