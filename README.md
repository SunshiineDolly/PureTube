# PureTube

PureTube is a Windows desktop app for watching recent uploads from the YouTube channels you follow. Public feeds and the official embedded player work without a Google sign-in or API key.

## Install and start

1. Run **PureTube_0.9.0_x64-setup.exe**. It installs for the current Windows user. Select the desktop shortcut on the finish page if you want one. Start Menu integration is automatic, and you can pin the running app to the taskbar.
2. Open **Your profile** to set an optional display name. No account, API key, or cloud setup is needed.
3. Switch to **Quiet**. PureTube checks followed channels on launch, every five minutes while open, and when it regains focus after a missed check. **Refresh** checks immediately. You can also paste a YouTube video link into the top bar and press Enter.
4. In **Manage follows**, paste a `UC...` channel ID, an ID-based `youtube.com/channel/...` URL, or a public feed URL. If the address bar shows an @handle, use the creator's **About → Share channel → Copy channel ID**.


This personal build has no Authenticode signature. Install only a copy you built or received from a source you trust. The installer can bootstrap WebView2 if the runtime is missing. You can install the runtime separately from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

The browsing layout uses a bright play-mark wordmark, icon category pills, grouped navigation, and larger thumbnails. All eight light/dark palettes remain available.

## Everyday use

- **Following** merges recent public uploads from followed creators newest-first. Filter by channel or date, refresh manually, or select **Load more** to show more items already in the retrieved feed. **Refresh** marks the existing feed checked; items published after the previous check receive a New badge when found. Other sort options apply to the loaded set.
- **Home and Discover** have different feeds. Home queries a rotating set of topics, balances creators and genres, and deprioritizes previously displayed videos. **New mix** rotates query sources, and **Not interested** removes a video from recommendations. Watched videos are excluded when history is on. Following is for channels you follow. Discover has a separate recommendation mix and topic browsing. Recommendation exposure records stay on this PC; Settings can reset recommendations.
- **Search** shows public YouTube videos inside PureTube. Suggestions appear as you type. Results default to **Newest first**; switch to **Relevance** or **Recent uploads** when needed. Search, Discover, and public channel tabs fetch additional results as you scroll. Public search may change when YouTube changes its site.
- **Hover previews** start muted after a short hover, stop when you move away, and are disabled when reduced motion is enabled. Availability follows YouTube embed rules.
- **Session counter** updates each second of active playback, including live streams, independently of saved progress. It pauses with the player and starts a new session when PureTube is relaunched.
- **Video quality** is chosen in YouTube’s player settings. Auto can select a lower resolution for the player size or connection. PureTube does not force a lower quality or transcode the video.
- **Watch** starts playback automatically on selection and uses the official player for controls, captions, and fullscreen. If YouTube blocks embedding, the watch page shows a message. **Share** opens a dismissible panel that closes when you copy the link.
- **Followed creators live now** are checked on their public channel live pages every 45 seconds while PureTube is visible and on return to the app. Active streams are shown above regular uploads on Home, Following, and Live, and marked in the sidebar. Very large follow lists are checked in rotating batches. A failed check retains the prior result internally but does not present it as confirmed live.
- **Live** separates current streams from scheduled events. Select **Remind me** to get an in-app notice when YouTube confirms the stream has gone live; PureTube must be running to check. Countdown times come from YouTube. **Go live** reconnects to the current broadcast position. YouTube live chat appears beside the player as a read-only viewer, with hide/show and reload controls. The sign-in input is removed, chat links cannot navigate out, and chat popups are blocked. A channel’s **Past streams** tab is for replays.
- **Creator pages** show the creator’s public banner, bio, and video shelves when available, plus Videos, Past streams, and About tabs. An active broadcast has a prominent LIVE NOW label and Watch live panel above every tab, using the same status as the sidebar. Videos and Past streams fetch older public uploads as you scroll.
- **Library** includes Favorites, Continue Watching, and custom collections. Watch Later and History have their own pages. Create a collection from Library, then add videos from the watch page. Importing a PureTube JSON backup replaces the current library and preferences; export first if you want to keep both versions.
- **Settings** includes eight light and dark palettes, content filters, Quiet Session, local privacy controls, watching reminders, launch on Windows startup, and minimize to tray. The tray menu can reopen or quit the app. Closing the window quits PureTube and removes its active tray icon. Launching again restores the existing window when it is already running, including when minimized to the tray. History and resume tracking can be disabled independently and existing history/progress cleared separately.

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

The executable is in `src-tauri/target/release/puretube.exe`. The installer is in `src-tauri/target/release/bundle/nsis/PureTube_0.9.0_x64-setup.exe`. Tauri downloads its packaging tools when needed. The regular build installs normally and uses manual upgrades until a signed update feed is configured. See below for signed release builds.

## Signed app updates

A signed build checks on launch and every six hours while it is open. **Settings → App updates** can check immediately, show release notes, and install the selected version after confirmation. PureTube requires HTTPS and verifies the installer signature with the public key embedded at build time. The ordinary unsigned build shows that updates are unconfigured.

1. Generate a Tauri signing key outside the repo using [Tauri's signing instructions](https://v2.tauri.app/plugin/updater/#signing-updates). Choose a strong passphrase and keep the private key and a backup in a secure location. Keep using the same signing key for subsequent releases.
2. From PowerShell, run:

```powershell
.\scripts\Build-SignedRelease.ps1 -PublicKeyPath 'C:\path\PureTube.key.pub' -PrivateKeyPath 'C:\path\PureTube.key'
```

3. Publish the installer, its `.sig`, and `latest.json` together. By default the manifest uses the latest public GitHub release of `SunshiineDolly/PureTube`. A private repo's release downloads are not accessible to the updater. Keep the source private by passing `-FeedUrl` and `-AssetBaseUrl` for a separate public HTTPS download location. No GitHub token is embedded in the application.
4. Install the first signed build manually to establish trust. For an update test, publish a signed newer version with the same key and verify it from the earlier signed build. If you use GitHub Releases, keep both the version tag and all three assets aligned with the source commit.

## Platform limits and data handling

- **Feed freshness.** Quiet Mode reads YouTube's [public Atom feeds](https://developers.google.com/youtube/data/guides/push_notifications) and sorts by publication time. A feed is a rolling window of recent public uploads and may lag behind the website. If a check fails, PureTube keeps the last successful results for that session and shows an error.
- **Shorts.** PureTube omits items identified as Shorts and rejects explicit Shorts links. There is no Shorts tab or setting. YouTube still controls its own embedded player and related cards.
- **Ads and availability.** The PureTube interface has no ad placements. Public feeds do not identify paid product placement. The [player](https://developers.google.com/youtube/iframe_api_reference) can still serve ads and show related content. [Player parameters](https://developers.google.com/youtube/player_parameters) allow autoplay to be off and related videos to be limited to the same channel, not eliminated. PureTube never queues the next video. Private, region-restricted, age-restricted, deleted, or embedding-disabled videos can fail. If playback reports error 153 in a given environment, update WebView2 and use **Open on YouTube** if YouTube still rejects the embed. The app sends a desktop embed referrer using [YouTube's WebView guidance](https://developers.google.com/youtube/terms/required-minimum-functionality).
- **Local profile and follows.** PureTube never connects a Google account. Your display name and follows are stored on this PC, and following or unfollowing here does not change your YouTube account.
- **Privacy and offline use.** PureTube has no analytics of its own. YouTube receives public search, autocomplete, feed, thumbnail, and playback requests. SQLite holds user selections and preferences, video/channel identifiers, and optional history/time records under `%APPDATA%\app.puretube.desktop`. When metadata is unavailable, local lists remain manageable by saved ID; video playback and metadata refresh require a connection. The last displayed recommendation IDs are retained locally for rotation. Restore an exported backup to move between PCs. You can delete local records from Settings. See [YouTube Terms](https://www.youtube.com/t/terms), [YouTube API developer policies](https://developers.google.com/youtube/terms/developer-policies), and [Google's privacy policy](https://policies.google.com/privacy). PureTube is independent of YouTube.
- **Distribution.** The app uses Tauri 2, React/TypeScript/Tailwind, SQLite, and a per-user NSIS installer. For broader distribution, validate player identity acceptance, branding and policy requirements, and configure Windows signing and a documented release process first.

## Verification checklist

Follow a public channel and confirm Following updates. Test channel and keyword filters, playback, Watch Later, Favorites, saved collections, and backup export/import. Confirm unsupported embeds show a playback message inside the app.

Run the Windows installer smoke test on a fresh Windows test account with no other PureTube installation:

```powershell
node tests/windows-smoke.mjs
```

It checks shortcuts, runs PureTube with a temporary profile, verifies the profile name and theme after relaunch, checks that Manage follows has no groups or CSV import, and uninstalls the test copy. Set `PURETUBE_LIVE_SMOKE=1` to also check real feeds, in-app public search, local search, the carousel, sharing, and playback. Rust tests cover the public search URL and result parser.
