# Viddy account sync

Open **Settings → Viddy account → Create a private account**. Save the generated key in a password manager before creating the account. On another device, paste it into **Account key** and select **Sign in with key**. Keep the key private. Viddy cannot recover a lost key.

The first sync merges your profile, watch history, resume positions, follows, favorites, Watch Later, and playlists. Your local library remains available offline. Preferences, recommendation activity, and downloaded files stay on the device. Signing out stops syncing. Enter your key again after restarting Viddy.

If you already have an email account, sign in using the existing email option, then choose **Add a private key**. That key opens your existing synced library.

## Hosting

The configured Supabase project does not need an email provider or domain for private signup. Apply the library migration and the private-account migration under `supabase/migrations` before enabling this build. The current database caps private accounts at 128 and limits each cloud snapshot to 2 MiB to keep storage bounded. The service is subject to the hosting plan's quotas.

The private table denies direct access to the API roles. Requests authenticate with a randomly generated key, and the database stores its SHA-256 verifier. The update function checks the expected revision to prevent stale writes.
