# PureTube

PureTube is a Windows desktop app for watching recent uploads from the YouTube channels you follow. Public feeds and the official embedded player work without a Google sign-in or API key.

[Download the latest Windows version](https://github.com/SunshiineDolly/PureTube/releases/latest) · [All releases](https://github.com/SunshiineDolly/PureTube/releases)

## Install and start

1. Download the latest **PureTube_*_x64-setup.exe** from GitHub Releases and run it. It installs for the current Windows user. Start Menu integration is automatic, and you can pin the running app to the taskbar.
2. Open **Your profile** to set an optional display name. No account, API key, or cloud setup is needed.
3. Switch to **Quiet**. PureTube checks followed channels on launch, every five minutes while open, and when it regains focus after a missed check. **Refresh** checks immediately. You can also paste a YouTube video link into the top bar and press Enter.
4. In **Manage follows**, paste a `UC...` channel ID, an ID-based `youtube.com/channel/...` URL, or a public feed URL. If the address bar shows an @handle, use the creator's **About → Share channel → Copy channel ID**.


This personal build has no Authenticode signature. Install only a copy you built or received from a source you trust. The installer can bootstrap WebView2 if the runtime is missing. You can install the runtime separately from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

The browsing layout uses a bright play-mark wordmark, icon category pills, grouped navigation, and larger thumbnails. All eight light/dark palettes remain available.

## Everyday use

- **Following** shows uploads only from creators you follow, newest first. Scrolling fetches older uploads from their public channel pages, beyond the short Atom feed. Filter by creator or date and refresh manually. Live broadcasts remain in their separate shelf.
- **Home and Discover** have different feeds. Home queries a rotating set of topics, balances creators and genres, and deprioritizes previously displayed videos. **New mix** rotates query sources, and **Not interested** removes a video from recommendations. Watched videos are excluded when history is on. Following is for channels you follow. Discover has a separate recommendation mix and topic browsing. Recommendation exposure records stay on this PC; Settings can reset recommendations.
- **Search** shows public YouTube videos inside PureTube. Suggestions appear as you type. Results default to **Newest first**; switch to **Relevance** or **Recent uploads** when needed. Search, Discover, and public channel tabs fetch additional results as you scroll. Public search may change when YouTube changes its site.
- **Hover previews** start muted after a short hover, stop when you move away, and are disabled when reduced motion is enabled. Availability follows YouTube embed rules.
- **Autoplay** chooses from your followed creators, related videos, and local interests. Up next has an eight-second countdown with Cancel and Play now. The toggle beside Up next or in Settings disables it. Shorts, live streams, scheduled events, dismissed videos, and content filters are respected. Playback choices in the current app session are not repeated in the autoplay queue.
- **Pop out** moves playback to a draggable, resizable mini player. Pin toggles keeping it above other windows. Return brings playback back into the main window. Minimize the main window or browse other pages while the mini player plays. Closing the main app also closes the mini player.
- **Downloads** saves completed public videos under your Windows Downloads/PureTube folder. Choose up to 720p, up to 1080p, or Best available on the watch page. The Downloads tab shows progress, cancellation, retry, and Open folder. First use downloads about 270 MB of checksum-pinned [yt-dlp](https://github.com/yt-dlp/yt-dlp), [Deno](https://github.com/denoland/deno), and [FFmpeg](https://github.com/yt-dlp/FFmpeg-Builds) helpers from their official releases. The helpers are verified before execution and stay outside the repository. Downloads use no account cookies and do not bypass restricted or DRM-protected videos. Closing PureTube stops its download processes; Retry can resume retained partial files. Save only content you have permission to download.
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

The executable is in `src-tauri/target/release/puretube.exe`. Versioned installers are in `src-tauri/target/release/bundle/nsis/`. Tauri downloads its packaging tools when needed. Builds trust the checked-in public update key. Publishing a new update requires its matching private key; ordinary builds do not produce signed update artifacts.

## Signed app updates

A signed build checks on launch and every six hours while it is open. **Settings → App updates** shows the installed version, last successful check, release notes, and download progress. **Update and restart** verifies the installer signature before installation and reopens PureTube afterward. It preserves the local library and preferences. Isolated smoke-test profiles cannot install updates. Older unsigned versions need the first updater-enabled release installed manually once.

The publishing machine keeps its encrypted signing key under `%LOCALAPPDATA%\PureTube\signing`, outside this repository. The password is protected with Windows DPAPI for the current account, and the directory is restricted to that account and SYSTEM. Preserve the key and its password in a secure independent backup; DPAPI files alone are not portable to another Windows account. The repository contains only the public verification key. The setup script refuses to replace an existing or mismatched key.

To build another signed release on the configured machine:

```powershell
.\scripts\Build-SignedRelease.ps1
```

Commit the matching source, version catalog, and release notes, then publish:

```powershell
.\scripts\Publish-Release.ps1 -NotesPath '.\releases\vVERSION.md'
```

The publisher requires SunshiineDolly, uploads a draft with the installer, `.sig`, `latest.json`, and checksums, verifies all uploaded hashes, and then marks it Latest. It refuses conflicting source tags and does not overwrite release assets. The public feed works without GitHub sign-in inside the app. `Publish-GitHub.ps1` is the initial historical-archive import tool, not the regular release workflow.

## Platform limits and data handling

- **Feed freshness.** Quiet Mode reads YouTube's [public Atom feeds](https://developers.google.com/youtube/data/guides/push_notifications) and sorts by publication time. A feed is a rolling window of recent public uploads and may lag behind the website. If a check fails, PureTube keeps the last successful results for that session and shows an error.
- **Shorts.** PureTube omits items identified as Shorts and rejects explicit Shorts links. There is no Shorts tab or setting. YouTube still controls its own embedded player and related cards.
- **Ads and availability.** The PureTube interface has no ad placements. Public feeds do not identify paid product placement. The [player](https://developers.google.com/youtube/iframe_api_reference) can still serve ads and show related videos. PureTube's optional autoplay queue is separate from YouTube's related cards. Private, region-restricted, age-restricted, deleted, or embedding-disabled videos can fail. The app sends a desktop embed referrer using [YouTube's WebView guidance](https://developers.google.com/youtube/terms/required-minimum-functionality). Public search can return fewer non-Shorts videos for a niche topic; PureTube cannot promise an exact copy of every result or YouTube's entire catalog.
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
