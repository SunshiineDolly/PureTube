#[cfg(windows)]
pub fn configure_youtube_identity(
    webview: tauri::webview::PlatformWebview,
) -> windows_core::Result<()> {
    use webview2_com::{
        take_pwstr, AddScriptToExecuteOnDocumentCreatedCompletedHandler,
        Microsoft::Web::WebView2::Win32::*, NewWindowRequestedEventHandler,
        WebResourceRequestedEventHandler,
    };
    use windows_core::{w, Interface, HSTRING, PCWSTR, PWSTR};
    unsafe {
        let core = webview.controller().CoreWebView2()?;
        let script = HSTRING::from(include_str!("read-only-chat.js"));
        core.AddScriptToExecuteOnDocumentCreated(
            PCWSTR(script.as_ptr()),
            &AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(|_, _| Ok(()))),
        )?;
        let mut popup_token = 0;
        core.add_NewWindowRequested(
            &NewWindowRequestedEventHandler::create(Box::new(|_, args| {
                if let Some(args) = args {
                    args.SetHandled(true)?;
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

pub fn configure_tray(app: &tauri::App) -> tauri::Result<()> {
    use super::{read, AppData, Manager, Value};
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let open = MenuItem::with_id(app, "open", "Open Viddy", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Viddy", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    fn restore(app: &tauri::AppHandle) {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
    let mut tray = TrayIconBuilder::with_id("puretube")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Viddy")
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => restore(app),
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
        .and_then(|v| v.pointer("/settings/tray").and_then(Value::as_bool))
        .unwrap_or(false);
    tray.set_visible(enabled)?;
    Ok(())
}
