use crate::Result;
use tauri::Manager;
#[tauri::command]
pub fn close_original_player(app: tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("original-player") {
        window
            .close()
            .map_err(|_| "Could not close YouTube playback.")?
    }
    Ok(())
}
#[tauri::command]
pub async fn original_player(app: tauri::AppHandle, id: String, dark: bool, comments: Option<bool>) -> Result<()> {
    if id.len() != 11
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Invalid video ID.".into());
    }
    let show_comments = comments.unwrap_or(false);
    let mut url = reqwest::Url::parse_with_params(
        "https://www.youtube.com/watch",
        &[("v", id.as_str()), ("autoplay", if show_comments { "0" } else { "1" }), ("wide", "1")],
    )
    .map_err(|_| "Invalid video.")?;
    if show_comments {
        url.set_fragment(Some("comments"));
    }
    if let Some(window) = app.get_webview_window("original-player") {
        window
            .navigate(url)
            .map_err(|_| "Could not open the original player.")?;
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }
    let window=tauri::WebviewWindowBuilder::new(&app,"original-player",tauri::WebviewUrl::External(url))
 .title("Viddy — YouTube playback").theme(Some(if dark{tauri::Theme::Dark}else{tauri::Theme::Light})).inner_size(1100.,760.).min_inner_size(650.,450.)
 .on_navigation(|url|url.scheme()=="https"&&url.username().is_empty()&&url.password().is_none()&&matches!(url.host_str(),Some("www.youtube.com"|"consent.youtube.com")))
 .initialization_script("(()=>{const add=()=>{if(document.getElementById('puretube-original-style'))return;const style=document.createElement('style');style.id='puretube-original-style';style.textContent='ytd-mini-guide-renderer,ytd-guide-renderer,ytd-reel-shelf-renderer,ytd-rich-shelf-renderer[is-shorts],#secondary{display:none!important}ytd-watch-flexy:not([fullscreen]) #primary{max-width:1500px!important;margin:auto!important}';(document.head||document.documentElement)?.appendChild(style)};new MutationObserver(add).observe(document,{childList:true,subtree:true});add();if(location.hash==='#comments'){const jump=()=>{const target=document.querySelector('ytd-comments#comments');if(!target?.getClientRects().length)return;target.scrollIntoView({block:'start'});obs.disconnect();clearTimeout(limit)};const obs=new MutationObserver(jump);const limit=setTimeout(()=>obs.disconnect(),15000);obs.observe(document,{childList:true,subtree:true});jump()}})()")
 .build().map_err(|_|"Could not open YouTube playback inside Viddy.")?;
    #[cfg(windows)]
    window
        .with_webview(|v| {
            let _ = crate::desktop::configure_youtube_identity(v, None);
        })
        .map_err(|_| "Could not initialize YouTube playback.")?;
    Ok(())
}
