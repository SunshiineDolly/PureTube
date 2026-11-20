use std::{
    collections::{HashMap, HashSet},
    ptr,
    sync::{LazyLock, Mutex, Once},
    thread,
    time::Duration,
};
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment, ICoreWebView2Environment8},
    ProcessInfosChangedEventHandler,
};
use windows::Win32::{
    Media::Audio::{
        eRender, AudioSessionStateExpired, IAudioSessionControl2, IAudioSessionManager2,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    },
    System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    },
};
use windows_core::{w, Interface, HSTRING, PCWSTR};

type ProcessLists = HashMap<usize, HashSet<u32>>;
static PROCESSES: LazyLock<Mutex<ProcessLists>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static WORKER: Once = Once::new();

struct Registration(usize);

impl Registration {
    fn update(&self, environment: &ICoreWebView2Environment8) -> windows_core::Result<()> {
        let mut ids = HashSet::new();
        unsafe {
            let processes = environment.GetProcessInfos()?;
            let mut count = 0;
            processes.Count(&mut count)?;
            for index in 0..count {
                let mut id = 0;
                processes.GetValueAtIndex(index)?.ProcessId(&mut id)?;
                if id > 0 {
                    ids.insert(id as u32);
                }
            }
        }
        PROCESSES.lock().unwrap().insert(self.0, ids);
        Ok(())
    }
}

impl Drop for Registration {
    fn drop(&mut self) {
        PROCESSES.lock().unwrap().remove(&self.0);
    }
}

pub fn track(environment: ICoreWebView2Environment) {
    let Ok(modern) = environment.cast::<ICoreWebView2Environment8>() else {
        return;
    };
    let key = environment.as_raw() as usize;
    {
        let mut lists = PROCESSES.lock().unwrap();
        if lists.contains_key(&key) {
            return;
        }
        lists.insert(key, HashSet::new());
    }
    let registration = Registration(key);
    let _ = registration.update(&modern);
    let changed = ProcessInfosChangedEventHandler::create(Box::new(move |sender, _| {
        if let Some(environment) = sender.and_then(|env| env.cast::<ICoreWebView2Environment8>().ok()) {
            let _ = registration.update(&environment);
        }
        Ok(())
    }));
    let mut token = 0;
    if unsafe { modern.add_ProcessInfosChanged(&changed, &mut token) }.is_ok() {
        WORKER.call_once(|| {
            let _ = thread::Builder::new()
                .name("viddy-audio-branding".into())
                .spawn(brand_audio);
        });
    }
}

fn brand_audio() {
    let Ok(executable) = std::env::current_exe() else {
        return;
    };
    let icon = HSTRING::from(executable.as_os_str());
    unsafe {
        if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
            return;
        }
        let devices = CoCreateInstance::<_, IMMDeviceEnumerator>(
            &MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER,
        );
        if let Ok(devices) = devices {
            let mut branded = HashMap::new();
            loop {
                let ids: HashSet<u32> = PROCESSES.lock().unwrap().values()
                    .flatten().copied().collect();
                if ids.is_empty() {
                    branded.clear();
                } else if let Ok(active) = devices.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
                    let mut current = HashMap::new();
                    for index in 0..active.GetCount().unwrap_or(0) {
                        let Ok(sessions) = active.Item(index)
                            .and_then(|device| device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None))
                            .and_then(|manager| manager.GetSessionEnumerator()) else {
                            continue;
                        };
                        for index in 0..sessions.GetCount().unwrap_or(0) {
                            let Ok(session) = sessions.GetSession(index)
                                .and_then(|session| session.cast::<IAudioSessionControl2>()) else {
                                continue;
                            };
                            if !session.GetProcessId().is_ok_and(|pid| ids.contains(&pid))
                                || session.GetState().ok() == Some(AudioSessionStateExpired) {
                                continue;
                            }
                            let Ok(identifier) = session.GetSessionInstanceIdentifier() else {
                                continue;
                            };
                            let key = identifier.to_string();
                            CoTaskMemFree(Some(identifier.0.cast()));
                            let Ok(key) = key else { continue };
                            if let Some(existing) = branded.remove(&key) {
                                current.insert(key, existing);
                            } else if session.SetDisplayName(w!("Viddy"), ptr::null()).is_ok()
                                && session.SetIconPath(PCWSTR(icon.as_ptr()), ptr::null()).is_ok() {
                                // Core Audio keeps these labels for the lifetime of the session control.
                                current.insert(key, session);
                            }
                        }
                    }
                    branded = current;
                }
                thread::sleep(Duration::from_millis(1250));
            }
        }
        CoUninitialize();
    }
}
