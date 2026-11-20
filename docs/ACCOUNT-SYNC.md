# Viddy account sync

Open **Settings → Viddy account → Continue with Discord**. Approve the Discord sign-in in your browser and return to Viddy. No email delivery, account key, Discord bot, or Supabase account is needed.

Your sign-in is saved in Windows Credential Manager or macOS Keychain and restored when Viddy starts, including offline. Closing the app, rebooting, or losing your connection does not sign you out. Explicit logout removes this device’s saved session. A confirmed server revocation also signs this device out; connection errors and free capacity limits do not.

The first sync merges your local profile, watch history, resume positions, follows and groups, favorites, Watch Later, saved video metadata, and playlists. Settings, downloaded files, local recommendation activity, and backup files remain on each device. Offline changes sync when the connection returns. Sync runs on startup, when returning to Viddy, after reconnecting, every minute while open, and with **Sync now**.

A device’s library stays linked to its Discord account after logout to prevent accidental merging into somebody else’s account. Existing local libraries linked to the former email/key service migrate on the first explicit Discord sign-in. The old merge checkpoint is reset; local content is retained. Data that exists only in the old cloud service must first be synced to a device using the old app. This update does not delete old cloud data.

## Hosting

The backend is a Cloudflare Worker with D1. See [Cloudflare setup](../cloudflare/README.md). Discord supplies only an account ID and display name through the identify scope. Discord messages, servers, contacts, and email are not requested. The Worker does not retain Discord access tokens. The app receives its own opaque token through a one-time desktop PKCE exchange; D1 stores only its SHA-256 hash.

Sessions have no time-based expiration. Each PC/Mac has a separate session. Online logout revokes the current device’s session; offline logout deletes it locally and does not contact the service. Other devices stay signed in.

The service is intended for Cloudflare’s Free plan. Limits are 1 MB per synced library, 200 MB total library JSON, 2,000 accounts, and 20,000 device sessions, with short-lived sign-in state and rate limiting. Cloudflare’s daily request/database quotas still apply; reaching them pauses sync while local libraries remain usable. Do not enable a paid plan or billing to increase these limits.
