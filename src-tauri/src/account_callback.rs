use crate::Result;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, TcpListener, TcpStream},
    sync::mpsc::{self, Receiver, TryRecvError},
    time::{Duration, Instant},
};

pub const LINK_LIFETIME: Duration = Duration::from_secs(600);

pub struct Callback {
    pub redirect: String,
    pub verifier: String,
    result: Receiver<String>,
    cancel: mpsc::Sender<()>,
}

impl Drop for Callback {
    fn drop(&mut self) {
        let _ = self.cancel.send(());
    }
}

impl Callback {
    pub fn start() -> Result<Self> {
        let mut random = [0u8; 48];
        getrandom::fill(&mut random).map_err(|_| "Could not start secure sign-in.")?;
        let verifier = URL_SAFE_NO_PAD.encode(&random[..32]);
        let path = format!("/viddy-auth/{}", URL_SAFE_NO_PAD.encode(&random[32..]));
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Could not open the sign-in listener.")?;
        listener.set_nonblocking(true).map_err(|_| "Could not configure the sign-in listener.")?;
        let addr = listener.local_addr().map_err(|_| "Could not open the sign-in listener.")?;
        let redirect = format!("http://{addr}{path}");
        let (send, result) = mpsc::channel();
        let (cancel, stop) = mpsc::channel();
        std::thread::Builder::new().name("viddy-account-callback".into()).spawn(move || {
            let expires = Instant::now() + LINK_LIFETIME;
            while Instant::now() < expires {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if let Some(code) = receive(stream, &path) {
                            let _ = send.send(code);
                            return;
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(_) => break,
                }
                if !matches!(stop.recv_timeout(Duration::from_millis(100)), Err(mpsc::RecvTimeoutError::Timeout)) {
                    return;
                }
            }
        }).map_err(|_| "Could not start the sign-in listener.")?;
        Ok(Self { redirect, verifier, result, cancel })
    }

    pub fn challenge(&self) -> String {
        URL_SAFE_NO_PAD.encode(Sha256::digest(self.verifier.as_bytes()))
    }

    pub fn poll(&self) -> Result<Option<String>> {
        match self.result.try_recv() {
            Ok(result) => Ok(Some(result)),
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => Err("That sign-in request expired. Send a fresh email.".into()),
        }
    }
}

fn query_code(target: &str, expected_path: &str) -> Option<String> {
    let (path, query) = target.split_once('?')?;
    if path != expected_path {
        return None;
    }
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{path}?{query}")).ok()?;
    let mut values = url.query_pairs().filter(|(key, _)| key == "code");
    let (_, code) = values.next()?;
    if values.next().is_some() || code.is_empty() || code.len() > 256 ||
        !code.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')) {
        return None;
    }
    Some(code.into_owned())
}

fn receive(mut stream: TcpStream, expected_path: &str) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_millis(500))).ok()?;
    stream.set_write_timeout(Some(Duration::from_millis(500))).ok()?;
    stream.set_nonblocking(false).ok()?;
    let mut line = String::new();
    BufReader::new(&mut stream).take(2048).read_line(&mut line).ok()?;
    let target = line.strip_prefix("GET ")?.split_once(' ')?.0;
    let code = query_code(target, expected_path);
    let (status, content) = if code.is_some() {
        ("200 OK", "Return to Viddy to finish signing in. You can close this tab.")
    } else if target == expected_path {
        ("200 OK", "This link did not finish signing in. Return to Viddy and request a fresh email.")
    } else {
        ("404 Not Found", "This sign-in request is unavailable.")
    };
    let html = format!("<!doctype html><meta charset=utf-8><title>Viddy sign-in</title><h1>Viddy</h1><p>{content}</p>");
    let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{html}", html.len());
    code
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_callback_passes_the_code_to_the_waiting_app() {
        let callback = Callback::start().unwrap();
        let url = reqwest::Url::parse(&callback.redirect).unwrap();
        let mut browser = TcpStream::connect((Ipv4Addr::LOCALHOST, url.port().unwrap())).unwrap();
        browser.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        write!(browser, "GET {}?code=example-code HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n", url.path()).unwrap();
        let mut reply = String::new();
        browser.read_to_string(&mut reply).unwrap();
        assert!(reply.starts_with("HTTP/1.1 200 OK"));
        assert!(!reply.contains("example-code"));
        assert_eq!(callback.result.recv_timeout(Duration::from_secs(2)).unwrap(), "example-code");
    }

    #[test]
    fn callback_accepts_code_only_for_the_pending_path() {
        let path = "/viddy-auth/specific";
        assert_eq!(query_code("/viddy-auth/specific?code=one-2", path).unwrap(), "one-2");
        assert!(query_code("/viddy-auth/other?code=one", path).is_none());
        assert!(query_code("/viddy-auth/specific?code=one&code=two", path).is_none());
    }
}
