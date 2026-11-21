#[cfg(target_os = "macos")]
#[path = "../src/youtube_embed.rs"]
mod youtube_embed;

#[cfg(target_os = "macos")]
#[tauri::command]
fn preview_check_result(app: tauri::AppHandle, report: serde_json::Value) {
    let path = std::env::var_os("VIDDY_PREVIEW_REPORT").expect("isolated report path");
    std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    println!("{report}");
    app.exit(if report["videoTimeAdvanced"] == true { 0 } else { 1 });
}

#[cfg(target_os = "macos")]
fn main() {
    use tauri::Manager;
    let profile = std::path::PathBuf::from(std::env::var_os("PURETUBE_ISOLATED_PROFILE").expect("isolated profile required"));
    assert!(profile.is_absolute());
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "app.viddy.native-preview-check".into();
    for config in &mut context.config_mut().app.windows { config.create = false; }
    tauri::Builder::default()
        .setup(move |app| {
            app.manage(youtube_embed::EmbedOrigin::default());
            let config = app.config().app.windows[0].clone();
            tauri::WebviewWindowBuilder::from_config(app, &config)?
                .data_directory(profile.join("webview"))
                .initialization_script_for_all_frames(include_str!("../../tests/mac-preview-native.js"))
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![youtube_embed::youtube_embed_port, preview_check_result])
        .run(context).expect("native preview check");
}

#[cfg(not(target_os = "macos"))]
fn main() { panic!("This check requires macOS WKWebView"); }
