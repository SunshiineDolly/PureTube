# PureTube

PureTube is a local-first Windows 10/11 desktop app for deliberate YouTube browsing. It starts in Quiet Mode on first launch, has a native window, and does not require a Google sign-in. Quiet Mode and video playback do not require a YouTube Data API key. A key is optional for in-app Discover and expanded channel details.

## Install and start

1. Run **PureTube_0.1.1_x64-setup.exe**. It installs for the current Windows user. Select the desktop shortcut on the finish page if you want one. Start Menu integration is automatic, and you can pin the running app to the taskbar.
2. Open PureTube and select **Follow a channel**. Paste a YouTube `UC...` channel ID, an ID-based `youtube.com/channel/...` link, or its public XML feed URL. On the creator's YouTube page, open **About → Share channel → Copy channel ID** if the address bar shows an @handle. 
3. Switch to **Quiet**. PureTube checks followed channels on launch, every five minutes while open, and when it regains focus after a missed check. **Refresh** checks immediately. You can also paste a YouTube video link into the top bar and press Enter.
4. For optional in-app Discover, enable **YouTube Data API v3** in [Google Cloud Console](https://console.cloud.google.com/). Create a key under **APIs & Services → Credentials**, restrict it to YouTube Data API v3, and enter it under **Settings → Optional YouTube API key**. PureTube stores it in Windows Credential Manager and leaves it out of backups.


This personal build has no Authenticode signature. Install only a copy you built or received from a source you trust. The installer can bootstrap WebView2 if the runtime is missing. You can install the runtime separately from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

## Everyday use

- **Quiet** merges recent public uploads from followed creators newest-first. Filter by channel or date, refresh manually, or select **Load more** to show more items already in the retrieved feed. **Refresh** marks the existing feed checked; items published after the previous check receive a New badge when found. Other sort options apply to the loaded set.
- **Discover** begins with your chosen topics and loads results after a search or topic selection. Choose videos or channels, order, and video length. In-app search results use YouTube's relevance or publication-date order. Without a key, Discover can open the search in your browser.
- **Watch** uses the official player controls, including available speeds, captions, and fullscreen. Focus Player hides navigation and details. Ctrl+K focuses search; Escape exits Focus when the app has keyboard focus. Open on YouTube is available for embeds that fail.
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

The executable is in `src-tauri/target/release/puretube.exe`. The installer is in `src-tauri/target/release/bundle/nsis/PureTube_0.1.1_x64-setup.exe`. Tauri downloads its packaging tools when needed. Run a newer trusted installer to update. Signed automatic updates require a signing setup and release hosting and are not configured.

## Platform limits and data handling

- **Feed and quotas.** Quiet Mode reads YouTube's [public Atom feeds](https://developers.google.com/youtube/data/guides/push_notifications) and uses the actual publication timestamps. A feed is a rolling window of recent public uploads. YouTube controls when an upload enters that window; updates can lag behind the website, and uploads can fall out of the window while the app is closed. If a check fails, the app keeps the last successful results for that session and shows an error. Optional API-backed channel pages can fetch older uploads. Search has its own daily quota; every additional search page consumes another search call. YouTube documents the current default in its [Data API overview](https://developers.google.com/youtube/data/getting-started#quota). Large follow lists take more requests. Successful API responses are cached in memory for 10 minutes; downloads of audiovisual content are not supported.
- **Shorts.** The [video resource](https://developers.google.com/youtube/v3/docs/videos) has no reliable public Shorts classification or source aspect ratio. PureTube recognizes explicit Shorts URLs and creator tags in titles, with a duration check for description-only tags. It does not remove every short-duration video. Untagged Shorts can be missed, especially in public feeds, which lack duration and paid-placement metadata. In those feeds a description tag is used even when the duration is unknown; tagged regular videos can be excluded. The YouTube player controls its own related cards and can surface Shorts independently of app filters.
- **Ads and availability.** The PureTube interface has no ad placements; videos flagged by the API for paid product placement are excluded where that disclosure is available. The [player](https://developers.google.com/youtube/iframe_api_reference) can still serve ads and show related content. [Player parameters](https://developers.google.com/youtube/player_parameters) allow autoplay to be off and related videos to be limited to the same channel, not eliminated. PureTube never queues the next video. Private, region-restricted, age-restricted, deleted, or embedding-disabled videos can fail. If playback reports error 153 in a given environment, update WebView2 and use **Open on YouTube** if YouTube still rejects the embed. The app sends a desktop embed referrer using [YouTube's WebView guidance](https://developers.google.com/youtube/terms/required-minimum-functionality). 
- **Accounts and imports.** Public feeds and the embedded player do not need a project key. In-app Data API queries need a project key, while [reading Google account subscriptions](https://developers.google.com/youtube/data/guides/implementation/subscriptions) requires a user's OAuth authorization. Account sync and Google Takeout import are outside this version. Add channels by handle or ID, or restore a previously exported PureTube library.
- **Privacy and offline use.** PureTube has no analytics of its own. Google receives the API requests, thumbnail requests, and playback traffic necessary for the chosen actions. SQLite holds user selections and preferences, video/channel identifiers, and optional history/time records under `%APPDATA%\app.puretube.desktop`. When metadata is unavailable, local lists remain manageable by saved ID; video playback and metadata refresh require a connection. Restore an exported backup to move between PCs. You can delete local records and remove the key from Settings. See [YouTube Terms](https://www.youtube.com/t/terms), [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies), and [Google's privacy policy](https://policies.google.com/privacy). PureTube is independent of YouTube.
- **Distribution.** The app uses Tauri 2, React/TypeScript/Tailwind, SQLite, and a per-user NSIS installer. For broader distribution, validate player identity acceptance, branding and policy requirements, and configure Windows signing and a documented release process first.

## Verification checklist

Use a valid restricted API key for in-app Discover cases. Search for a video and a channel; follow the channel and confirm Quiet shows only followed creators; test pagination, topic search, and channel and keyword filters. Play an embeddable video, pause or leave the player, reopen it to check resume, then save it in Watch Later, Favorites, and a collection. Test backup export/import and verify data survives restart. Confirm unsupported embeds present the browser option. Try resize, maximize, minimize, and tray restore with more than one display if available.

Run the Windows installer smoke test on a fresh Windows test account with no other PureTube installation:

```powershell
node tests/windows-smoke.mjs
```

It installs to a temporary directory, checks the Start Menu and desktop links, launches the app with an isolated profile, verifies a preference after restart, and uninstalls the test copy. It leaves the regular library and credentials alone. It does not need an API key. Set the environment variable `PURETUBE_LIVE_SMOKE=1` before running it to also verify a real feed, the elapsed-time refresh, and embedded playback.



