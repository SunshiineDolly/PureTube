use crate::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    id: String,
    video_id: String,
    title: String,
    status: String,
    percent: f64,
    message: String,
    file: Option<String>,
    quality: u32,
}
pub struct Downloads {
    jobs: Mutex<Vec<Job>>,
    children: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    cancelled: Mutex<HashSet<String>>,
    tools: Mutex<()>,
    root: PathBuf,
    record: PathBuf,
}
impl Downloads {
    pub fn new(root: PathBuf, record: PathBuf) -> Self {
        let mut jobs: Vec<Job> = fs::read(&record)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        jobs.truncate(200);
        for job in &mut jobs {
            if matches!(job.status.as_str(), "preparing" | "downloading" | "merging") {
                job.status = "interrupted".into();
                job.message =
                    "PureTube closed before this download finished. Try again to resume.".into();
            }
        }
        Self {
            jobs: Mutex::new(jobs),
            children: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashSet::new()),
            tools: Mutex::new(()),
            root,
            record,
        }
    }
    fn stopped(&self, id: &str) -> bool {
        self.cancelled.lock().unwrap().contains(id)
    }
    fn update(
        &self,
        app: &tauri::AppHandle,
        id: &str,
        status: &str,
        percent: f64,
        message: &str,
        file: Option<String>,
    ) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(job) = jobs.iter_mut().find(|job| job.id == id) {
            job.status = status.into();
            job.percent = percent.clamp(0., 100.);
            job.message = message.into();
            if file.is_some() {
                job.file = file;
            }
        }
        let _ = fs::write(&self.record, serde_json::to_vec(&*jobs).unwrap_or_default());
        let _ = app.emit_to("main", "downloads-changed", &*jobs);
    }
    pub fn shutdown(&self) {
        let children = self.children.lock().unwrap();
        for (id, child) in children.iter() {
            self.cancelled.lock().unwrap().insert(id.clone());
            kill(child);
        }
    }
}
fn kill(child: &Arc<Mutex<Child>>) {
    if let Ok(mut child) = child.lock() {
        if child.try_wait().ok().flatten().is_none() {
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill.exe")
                    .args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            let _ = child.kill();
        }
    }
}
fn digest(path: &Path) -> Result<String> {
    let mut file = File::open(path).map_err(|_| "Could not read a download helper.")?;
    let mut hash = Sha256::new();
    let mut chunk = [0; 65536];
    loop {
        let count = file
            .read(&mut chunk)
            .map_err(|_| "Could not verify a download helper.")?;
        if count == 0 {
            break;
        }
        hash.update(&chunk[..count]);
    }
    Ok(hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
#[derive(Deserialize)]
struct ToolFile {
    name: String,
    sha256: String,
}
#[derive(Deserialize)]
struct Tool {
    name: String,
    url: String,
    sha256: String,
    files: Vec<ToolFile>,
}
fn prepare(
    app: &tauri::AppHandle,
    state: &Downloads,
    id: &str,
) -> Result<HashMap<String, PathBuf>> {
    let _guard = state.tools.lock().map_err(|_| "Download setup is busy.")?;
    let root = PathBuf::from(
        std::env::var_os("LOCALAPPDATA").ok_or("Windows app-data folder is unavailable.")?,
    )
    .join("PureTube/download-tools");
    let tools: Vec<Tool> = serde_json::from_str(include_str!("../download-tools.json"))
        .map_err(|_| "Invalid download tool manifest.")?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("PureTube-downloads")
        .build()
        .map_err(|_| "Could not initialize download setup.")?;
    let mut executables = HashMap::new();
    for (index, tool) in tools.iter().enumerate() {
        if state.stopped(id) {
            return Err("Cancelled".into());
        }
        let dir = root.join(format!("{}-{}", tool.name, &tool.sha256[..12]));
        fs::create_dir_all(&dir).map_err(|_| "Could not create the download tools folder.")?;
        let ready = tool
            .files
            .iter()
            .all(|f| digest(&dir.join(&f.name)).ok().as_deref() == Some(f.sha256.as_str()));
        if !ready {
            state.update(
                app,
                id,
                "preparing",
                0.,
                &format!("Preparing downloads ({}/{})…", index + 1, tools.len()),
                None,
            );
            let archive = dir.join("package.download");
            if digest(&archive).ok().as_deref() != Some(tool.sha256.as_str()) {
                let mut response = client
                    .get(&tool.url)
                    .send()
                    .and_then(|r| r.error_for_status())
                    .map_err(|_| "Download setup could not reach GitHub. Try again later.")?;
                let mut output =
                    File::create(&archive).map_err(|_| "Could not save a download helper.")?;
                let mut bytes = 0usize;
                let mut buffer = [0; 65536];
                loop {
                    if state.stopped(id) {
                        return Err("Cancelled".into());
                    }
                    let n = response
                        .read(&mut buffer)
                        .map_err(|_| "Download setup was interrupted. Try again.")?;
                    if n == 0 {
                        break;
                    }
                    bytes += n;
                    if bytes > 260 * 1024 * 1024 {
                        return Err("Download helper exceeds its expected size.".into());
                    }
                    output
                        .write_all(&buffer[..n])
                        .map_err(|_| "Not enough space for download setup.")?;
                }
                drop(output);
                if digest(&archive)? != tool.sha256 {
                    return Err(
                        "Download helper checksum did not match. Nothing was executed.".into(),
                    );
                }
            }
            if tool.url.ends_with(".zip") {
                let mut zip = zip::ZipArchive::new(
                    File::open(&archive).map_err(|_| "Could not read the helper archive.")?,
                )
                .map_err(|_| "Could not open the helper archive.")?;
                for file in &tool.files {
                    let mut found = false;
                    for n in 0..zip.len() {
                        let mut entry = zip
                            .by_index(n)
                            .map_err(|_| "Could not extract a download helper.")?;
                        let entry_name = entry
                            .name()
                            .map_err(|_| "Invalid helper archive filename.")?;
                        if Path::new(entry_name.as_ref())
                            .file_name()
                            .and_then(|s| s.to_str())
                            == Some(file.name.as_str())
                        {
                            if found || entry.size() > 400 * 1024 * 1024 {
                                return Err("Unexpected helper archive contents.".into());
                            }
                            found = true;
                            let mut output = File::create(dir.join(&file.name))
                                .map_err(|_| "Could not save the download helper.")?;
                            std::io::copy(&mut entry, &mut output)
                                .map_err(|_| "Not enough space for the download helper.")?;
                        }
                    }
                    if !found {
                        return Err("A required download helper is missing.".into());
                    }
                }
            } else {
                fs::copy(&archive, dir.join(&tool.files[0].name))
                    .map_err(|_| "Could not install the download helper.")?;
            }
            for file in &tool.files {
                if digest(&dir.join(&file.name))? != file.sha256 {
                    return Err(
                        "Download executable verification failed. Nothing was executed.".into(),
                    );
                }
            }
            let _ = fs::remove_file(&archive);
        }
        for file in &tool.files {
            executables.insert(file.name.clone(), dir.join(&file.name));
        }
    }
    Ok(executables)
}
fn worker(app: tauri::AppHandle, id: String) -> Result<()> {
    let state = app.state::<Downloads>();
    let job = state
        .jobs
        .lock()
        .unwrap()
        .iter()
        .find(|j| j.id == id)
        .cloned()
        .ok_or("Download not found.")?;
    let tools = prepare(&app, &state, &id)?;
    if state.stopped(&id) {
        return Err("Cancelled".into());
    }
    fs::create_dir_all(&state.root).map_err(|_| "Could not create Downloads/PureTube.")?;
    let height = if job.quality == 0 {
        String::new()
    } else {
        format!("[height<={}]", job.quality)
    };
    let format = format!("bv*{height}[ext=mp4]+ba[ext=m4a]/b{height}[ext=mp4]/b{height}");
    let mut cmd = Command::new(&tools["yt-dlp.exe"]);
    cmd.args([
        "--ignore-config",
        "--no-playlist",
        "--no-cache-dir",
        "--no-warnings",
        "--newline",
        "--progress",
        "--progress-template",
        "download:PT_PROGRESS:%(progress._percent_str)s",
        "--print",
        "after_move:PT_FILE:%(filepath)s",
        "--no-simulate",
        "--windows-filenames",
        "--no-overwrites",
        "--match-filter",
        "!is_live & !is_upcoming",
        "--merge-output-format",
        "mp4",
        "-f",
        &format,
        "--js-runtimes",
        &format!("deno:{}", tools["deno.exe"].display()),
        "--ffmpeg-location",
        tools["ffmpeg.exe"]
            .parent()
            .unwrap()
            .to_str()
            .ok_or("Invalid helper folder.")?,
        "-P",
        state.root.to_str().ok_or("Invalid downloads folder.")?,
        "-o",
        "%(title).120B [%(id)s].%(ext)s",
        "--",
        &format!("https://www.youtube.com/watch?v={}", job.video_id),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let mut child = cmd
        .spawn()
        .map_err(|_| "Could not start the verified download helper.")?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let errors = std::thread::spawn(move || {
        let mut output = String::new();
        let _ = BufReader::new(stderr)
            .take(32000)
            .read_to_string(&mut output);
        output
    });
    let child = Arc::new(Mutex::new(child));
    state
        .children
        .lock()
        .unwrap()
        .insert(id.clone(), child.clone());
    state.update(&app, &id, "downloading", 0., "Downloading…", None);
    let mut output = None;
    for line in BufReader::new(stdout)
        .lines()
        .map_while(std::result::Result::ok)
    {
        if let Some(p) = line
            .strip_prefix("PT_PROGRESS:")
            .and_then(|v| v.trim().trim_end_matches('%').parse::<f64>().ok())
        {
            state.update(&app, &id, "downloading", p, "Downloading…", None);
        } else if let Some(file) = line.strip_prefix("PT_FILE:") {
            let path = PathBuf::from(file.trim());
            if let (Ok(path), Ok(root)) = (path.canonicalize(), state.root.canonicalize()) {
                if path.starts_with(root) && path.is_file() {
                    output = Some(path.to_string_lossy().into_owned());
                }
            }
        } else if line.contains("[Merger]") {
            state.update(&app, &id, "merging", 100., "Finishing your video…", None);
        }
    }
    let status = loop {
        if let Some(status) = child
            .lock()
            .unwrap()
            .try_wait()
            .map_err(|_| "Could not finish the download.")?
        {
            break status;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    state.children.lock().unwrap().remove(&id);
    let error = errors.join().unwrap_or_default();
    if state.stopped(&id) {
        state.update(
            &app,
            &id,
            "cancelled",
            0.,
            "Cancelled. Partial files can be resumed by downloading again.",
            None,
        );
        return Ok(());
    }
    if !status.success() || output.is_none() {
        return Err(if error.contains("Sign in")||error.contains("sign in"){ "YouTube requires sign-in for this download. PureTube downloads public, unrestricted videos without account cookies." }else if error.contains("unavailable")||error.contains("not available"){ "This video is not available for download." }else{"The video could not be downloaded. Check your connection and disk space, then try again."}.into());
    }
    state.update(
        &app,
        &id,
        "complete",
        100.,
        "Saved to Downloads/PureTube",
        output,
    );
    Ok(())
}
#[tauri::command]
pub fn download_list(state: State<Downloads>) -> Vec<Job> {
    state.jobs.lock().unwrap().clone()
}
#[tauri::command]
pub fn download_video(
    app: tauri::AppHandle,
    state: State<Downloads>,
    video_id: String,
    title: String,
    quality: u32,
) -> Result<String> {
    if video_id.len() != 11
        || !video_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || ![0, 720, 1080].contains(&quality)
    {
        return Err("Invalid video or download quality.".into());
    }
    let mut jobs = state.jobs.lock().unwrap();
    if jobs
        .iter()
        .filter(|j| matches!(j.status.as_str(), "preparing" | "downloading" | "merging"))
        .count()
        >= 2
    {
        return Err("Two downloads are already running. Wait for one to finish.".into());
    }
    if let Some(job) = jobs.iter().find(|j| {
        j.video_id == video_id
            && matches!(j.status.as_str(), "preparing" | "downloading" | "merging")
    }) {
        return Ok(job.id.clone());
    }
    let id = format!(
        "{}-{}",
        video_id,
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    jobs.insert(
        0,
        Job {
            id: id.clone(),
            video_id,
            title: title.chars().take(400).collect(),
            status: "preparing".into(),
            percent: 0.,
            message: "Preparing download…".into(),
            file: None,
            quality,
        },
    );
    jobs.truncate(200);
    drop(jobs);
    let task = id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = worker(app.clone(), task.clone()) {
            let state = app.state::<Downloads>();
            let cancelled = state.stopped(&task);
            state.update(
                &app,
                &task,
                if cancelled { "cancelled" } else { "failed" },
                0.,
                if cancelled {
                    "Download cancelled."
                } else {
                    &error
                },
                None,
            );
        }
    });
    Ok(id)
}
#[tauri::command]
pub fn download_cancel(state: State<Downloads>, id: String) {
    state.cancelled.lock().unwrap().insert(id.clone());
    if let Some(child) = state.children.lock().unwrap().get(&id) {
        kill(child)
    }
}
#[tauri::command]
pub fn open_downloads(app: tauri::AppHandle, state: State<Downloads>) -> Result<()> {
    fs::create_dir_all(&state.root).map_err(|_| "Could not open Downloads/PureTube.")?;
    app.opener()
        .open_path(state.root.to_string_lossy(), None::<&str>)
        .map_err(|_| "Could not open the downloads folder.".into())
}
