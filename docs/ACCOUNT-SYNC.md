# Viddy account sync

Viddy uses one Supabase project for both desktop builds. The app can be used locally without an account.

## Configure the service

Viddy uses the configured Supabase project. For public sign-in, connect a verified sender to Supabase under Authentication → Emails → SMTP Settings. Test delivery to an address outside the project team before publishing. To use another project:

1. Create a Supabase project. Run the [library migration](../supabase/migrations/20261120_account_sync.sql) once in its SQL Editor.
2. Enable email sign-in and allow new users. Add `http://127.0.0.1:*/viddy-auth/*` under Authentication → URL Configuration → Redirect URLs. The default email template opens the sign-in link on the device that requested it. Viddy also accepts codes when the template includes `{{ .Token }}`. Configure SMTP if you need to send codes to addresses outside the Supabase organization. The built-in sender is intended for testing and restricts eligible recipients.
3. Set the following environment variables before building on Windows and macOS. For CI, define them as repository variables and pass them to the Tauri build step. Both builds must use the same project.

   - `VIDDY_SUPABASE_URL` is the project URL, such as `https://yourproject.supabase.co`.
   - `VIDDY_SUPABASE_PUBLISHABLE_KEY` is the project's `sb_publishable_…` key. This key is embedded in the app. Keep Supabase secret and service-role keys out of desktop builds.

The app uses the Viddy test project by default. The local library works without signing in.

## Test Windows to Mac

1. In Windows Viddy, open **Settings → Viddy account**, enter your email, and select **Continue with email**. Open the sign-in email on Windows while Viddy is running. Wait for the synced status.
2. On the Mac, enter the same email in **Settings → Viddy account** and select **Continue with email** and open the new email on the Mac. Check History, Watch Later, Favorites, and a playlist from Windows. Verify that a partially watched video resumes.
3. Add a favorite on the Mac. Select **Sync now** on both devices and confirm it appears on Windows. Remove the favorite from one device and repeat to verify removal.

Viddy checks again when the window gains focus, the device reconnects, or the periodic check runs. Sign out to pause syncing. Each local library is linked to one account. The sign-in session is held in memory and a fresh sign-in email is required after restarting Viddy. Desktop preferences, recommendation activity, and downloaded files stay on the device.
