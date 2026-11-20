# Viddy for Mac — test build

This build packages the current Viddy app for Apple Silicon and Intel Macs running macOS 14 Sonoma or newer. It is a development test build, not an Apple-notarized release. macOS playback and desktop behavior still need testing on a real Mac.

## Get and install the app

1. Open the successful **Build Viddy for Mac** run in the repository's GitHub Actions tab. Download **Viddy-macOS-universal** under Artifacts (GitHub sign-in required).
2. Unzip the download, open the `.dmg`, and drag **Viddy** into **Applications**.
3. Open Viddy from Applications. If macOS blocks this trusted test build, open **System Settings → Privacy & Security**, find the Viddy message, and select **Open Anyway**, then confirm. No terminal security changes are needed.

Install this version once to enable signed Mac updates in Settings. Updates appear when a signed Mac archive is included in the GitHub release feed. Your library is stored separately.

## Downloads

Watching and browsing do not require Homebrew. Video downloads and direct stream previews use locally installed Mac helpers. If you want to test those features, install [Homebrew](https://brew.sh), then run:

```sh
brew install yt-dlp deno ffmpeg
```

Viddy looks in `/opt/homebrew/bin` (Apple Silicon) and `/usr/local/bin` (Intel). It does not download or run Windows helpers on Mac.

## Check on your Mac

- Launch, browse Home, search with **Command+K**, follow a creator, and play a video with sound. Try fullscreen, captions, seeking, and a live stream.
- Check the embedded player carefully: Mac uses WKWebView, while the Windows release uses WebView2 with a native YouTube referrer override. Embedded playback has not been verified on Mac. If YouTube reports error 153 or blocks embedding, try **Play in Viddy** to open the original YouTube watch page in its separate app window; report which path worked.
- Open the pop-out player, pin/unpin it, return to the main window, and browse with the docked player active.
- Save a playlist, quit, reopen, and confirm your library and preferences remain. Export/import a backup to bring your Windows library over.
- Test launch at login and minimize/close-to-menu-bar settings. Use **Quit Viddy** in the menu bar to exit when background mode is enabled.
- If helpers are installed, download a permitted public video, cancel a second download, and check Open folder.

App data is stored under `~/Library/Application Support/app.puretube.desktop`. The independent library backup is `~/Documents/Viddy/library-backup.sqlite3`. Downloads default to `~/Downloads/ViddyVids`.

## Build locally on a Mac

Install Xcode Command Line Tools (`xcode-select --install`), Node.js 24, and stable Rust. At the repository root:

```sh
npm ci
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

To build the universal disk image:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --ci --target universal-apple-darwin
```

The disk image appears under `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`. Tauri automatically applies `tauri.macos.conf.json` on macOS. The Mac workflow does not publish a public release or change the Windows updater feed.
