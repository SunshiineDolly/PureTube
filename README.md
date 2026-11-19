# PureTube

PureTube is a Windows desktop app for watching recent uploads from the YouTube channels you follow. Public feeds and the official embedded player work without a Google sign-in or API key.

## Install and start

1. Run **PureTube_0.1.2_x64-setup.exe**. It installs for the current Windows user. Select the desktop shortcut on the finish page if you want one. Start Menu integration is automatic, and you can pin the running app to the taskbar.
2. Open **Subscriptions → Import YouTube subscriptions**. In [Google Takeout](https://takeout.google.com/settings/takeout/custom/youtube), select YouTube and YouTube Music, limit the export to subscriptions, download and extract the archive, then select its subscriptions CSV in PureTube. The import adds channels without replacing previous follows or adding blocked channels.
3. Switch to **Quiet**. PureTube checks followed channels on launch, every five minutes while open, and when it regains focus after a missed check. **Refresh** checks immediately. You can also paste a YouTube video link into the top bar and press Enter.
4. To add channels individually, paste a `UC...` channel ID, an ID-based `youtube.com/channel/...` URL, or a public feed URL in Subscriptions. If the address bar shows an @handle, use the creator's **About → Share channel → Copy channel ID**.


This personal build has no Authenticode signature. Install only a copy you built or received from a source you trust. The installer can bootstrap WebView2 if the runtime is missing. You can install the runtime separately from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

## Everyday use

- **Quiet** merges recent public uploads from followed creators newest-first. Filter by channel or date, refresh manually, or select **Load more** to show more items already in the retrieved feed. **Refresh** marks the existing feed checked; items published after the previous check receive a New badge when found. Other sort options apply to the loaded set.
- **Watch** uses the official player controls, including available speeds, captions, and fullscreen. Focus Player hides navigation and details. Ctrl+K focuses the video link field; Escape exits Focus when the app has keyboard focus. Open on YouTube is available for embeds that fail.
- **Library** includes Favorites, Continue Watching, and custom collections. Watch Later and History have their own pages. Create a collection from Library, then add videos from the watch page. Importing a PureTube JSON backup replaces the current library and preferences; export first if you want to keep both versions.
- **Settings** includes appearance, content filters, Quiet Session, local privacy controls, watching reminders, launch on Windows startup, and minimize to tray. The tray menu can reopen or quit the app. History and resume tracking can be disabled independently and existing history/progress cleared separately.

## Build from source

Install current [Node.js](https://nodejs.org/) (Node 24 was used), the stable x64 MSVC [Rust toolchain](https://rustup.rs/), and [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/): Visual Studio C++ Build Tools with **Desktop development with C++**, a Windows SDK, and WebView2. Run in PowerShell at the repository root:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm.cmd run tauri dev
```

Stop the dev app before making the installer:

```powershell
npm.cmd run tauri build -- --ci
```

The executable is in `src-tauri/target/release/puretube.exe`. The installer is in `src-tauri/target/release/bundle/nsis/PureTube_0.1.2_x64-setup.exe`. Tauri downloads its packaging tools when needed. Run a newer trusted installer to update. Signed automatic updates require a signing setup and release hosting and are not configured.

## Platform limits and data handling

- **Feed freshness.** Quiet Mode reads YouTube's [public Atom feeds](https://developers.google.com/youtube/data/guides/push_notifications) and sorts by publication time. A feed is a rolling window of recent public uploads and may lag behind the website. If a check fails, PureTube keeps the last successful results for that session and shows an error.
- **Shorts.** The [video resource](https://developers.google.com/youtube/v3/docs/videos) has no reliable public Shorts classification or source aspect ratio. PureTube recognizes explicit Shorts URLs and creator tags in titles, with a duration check for description-only tags. It does not remove every short-duration video. Untagged Shorts can be missed, especially in public feeds, which lack duration and paid-placement metadata. In those feeds a description tag is used even when the duration is unknown; tagged regular videos can be excluded. The YouTube player controls its own related cards and can surface Shorts independently of app filters.
- **Ads and availability.** The PureTube interface has no ad placements. Public feeds do not identify paid product placement. The [player](https://developers.google.com/youtube/iframe_api_reference) can still serve ads and show related content. [Player parameters](https://developers.google.com/youtube/player_parameters) allow autoplay to be off and related videos to be limited to the same channel, not eliminated. PureTube never queues the next video. Private, region-restricted, age-restricted, deleted, or embedding-disabled videos can fail. If playback reports error 153 in a given environment, update WebView2 and use **Open on YouTube** if YouTube still rejects the embed. The app sends a desktop embed referrer using [YouTube's WebView guidance](https://developers.google.com/youtube/terms/required-minimum-functionality).
- **Accounts and imports.** [Reading your YouTube subscriptions directly](https://developers.google.com/youtube/data/guides/implementation/subscriptions) requires OAuth authorization and YouTube Data API setup. PureTube reads the Takeout CSV locally instead. It imports channels once per file selection; later subscription changes on YouTube are not synced automatically. New public uploads from imported channels continue to refresh.
- **Privacy and offline use.** PureTube has no analytics of its own. Google receives public feed requests, thumbnail requests, and playback traffic. The subscription CSV stays on this device. SQLite holds user selections and preferences, video/channel identifiers, and optional history/time records under `%APPDATA%\app.puretube.desktop`. When metadata is unavailable, local lists remain manageable by saved ID; video playback and metadata refresh require a connection. Restore an exported backup to move between PCs. You can delete local records from Settings. See [YouTube Terms](https://www.youtube.com/t/terms), [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies), and [Google's privacy policy](https://policies.google.com/privacy). PureTube is independent of YouTube.
- **Distribution.** The app uses Tauri 2, React/TypeScript/Tailwind, SQLite, and a per-user NSIS installer. For broader distribution, validate player identity acceptance, branding and policy requirements, and configure Windows signing and a documented release process first.

## Verification checklist

Import a Takeout CSV, reimport it to verify it skips existing follows, and confirm the feed shows only followed creators. Test channel and keyword filters, playback, Watch Later, Favorites, saved collections, and backup export/import. Confirm unsupported embeds present the browser option.

Run the Windows installer smoke test on a fresh Windows test account with no other PureTube installation:

```powershell
node tests/windows-smoke.mjs
```

It installs to a temporary directory, checks the Start Menu and desktop links, launches the app with an isolated profile, verifies a preference after restart, imports a sample subscriptions CSV twice, and uninstalls the test copy. It leaves the regular library and credentials alone. It does not need an API key. Set the environment variable `PURETUBE_LIVE_SMOKE=1` before running it to also verify a real feed, the elapsed-time refresh, and embedded playback.
