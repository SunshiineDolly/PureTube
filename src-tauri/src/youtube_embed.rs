use std::{
    io::{BufRead, BufReader, Write},
    net::{Ipv4Addr, TcpListener, TcpStream},
    thread,
    time::Duration,
};
use tauri::Url;

#[derive(Default)]
pub struct EmbedOrigin(std::sync::OnceLock<Result<u16, ()>>);

#[tauri::command]
pub fn youtube_embed_port(state: tauri::State<'_, EmbedOrigin>) -> Result<u16, &'static str> {
    state.0.get_or_init(|| start().map_err(|_| ()))
        .as_ref()
        .copied()
        .map_err(|_| "Could not start the YouTube player.")
}

fn start() -> std::io::Result<u16> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    thread::Builder::new().name("youtube-embed".into()).spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { break };
            let _ = serve(stream, port);
        }
    })?;
    Ok(port)
}

fn serve(mut stream: TcpStream, port: u16) -> std::io::Result<()> {
    let timeout = Some(Duration::from_secs(1));
    stream.set_read_timeout(timeout)?;
    stream.set_write_timeout(timeout)?;
    let mut reader = BufReader::new(&mut stream);
    let mut request = String::new();
    use std::io::Read;
    reader.by_ref().take(4096).read_line(&mut request)?;
    let expected_host = format!("127.0.0.1:{port}");
    let mut valid_host = false;
    let mut headers = reader.take(8192);
    loop {
        let mut line = String::new();
        if headers.read_line(&mut line)? == 0 || line == "\r\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("host") {
                valid_host = value.trim() == expected_host;
            }
        }
    }
    let target = request.strip_prefix("GET ")
        .and_then(|request| request.split_once(' '))
        .and_then(|(path, _)| path.strip_prefix("/youtube?"))
        .filter(|_| valid_host)
        .and_then(embed_target);
    let Some(target) = target else {
        return stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    };

    // A document navigation makes WebKit send the loopback origin as the
    // referrer. An HTTP 3xx would retain the original tauri:// referrer.
    let escaped = target.as_str().replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;");
    let page = format!("<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=\"0;url={escaped}\">");
    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nReferrer-Policy: strict-origin-when-cross-origin\r\nContent-Security-Policy: default-src 'none'\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{page}", page.len())
}

fn embed_target(query: &str) -> Option<Url> {
    let request = Url::parse(&format!("http://localhost/?{query}")).ok()?;
    let (_, target) = request.query_pairs().find(|(key, _)| key == "target")?;
    let target = Url::parse(&target).ok()?;
    let id = target.path().strip_prefix("/embed/")?;
    (target.origin().ascii_serialization() == "https://www.youtube.com"
        && target.username().is_empty()
        && target.password().is_none()
        && id.len() == 11
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
        .then_some(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embed_target_accepts_only_official_video_embeds() {
        fn target(url: &str) -> Option<Url> {
            let mut request = Url::parse("http://127.0.0.1/youtube").unwrap();
            request.query_pairs_mut().append_pair("target", url);
            embed_target(request.query().unwrap())
        }

        let video = "https://www.youtube.com/embed/vWG8Exo0QQ4?autoplay=1&enablejsapi=1";
        assert_eq!(target(video).unwrap().as_str(), video);
        for invalid in [
            "https://www.youtube.com.example/embed/vWG8Exo0QQ4",
            "http://www.youtube.com/embed/vWG8Exo0QQ4",
            "https://www.youtube.com:444/embed/vWG8Exo0QQ4",
            "https://www.youtube.com/watch?v=vWG8Exo0QQ4",
            "https://www.youtube.com/embed/vWG8Exo0QQ4/extra",
        ] {
            assert!(target(invalid).is_none(), "{invalid}");
        }
    }
}
