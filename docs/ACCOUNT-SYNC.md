# Viddy account sync

Open **Settings → Viddy account** and choose **Create account** or **Log in**. Enter your email address, then open the one-time link on the same device while Viddy is running.

The first sync merges your profile, watch history, resume positions, follows, favorites, Watch Later, and playlists. Your local library remains available offline. Preferences, recommendation activity, and downloaded files stay on the device. Signing out stops syncing. Enter your key again after restarting Viddy.

If you previously created an account with a key, choose **Use an existing account key**.

## Hosting

Public email signup requires a working SMTP sender. Supabase’s default sender only delivers to the project team. The desktop redirect allowlist must include `http://127.0.0.1:*/viddy-auth/*`.

The existing key-account endpoint remains available for compatibility. Its private storage is bounded by the hosting plan.
