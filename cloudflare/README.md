# Viddy Discord and Cloudflare service

Use the Cloudflare Workers Free plan and D1 Free plan. The prepared service URL is https://viddy-sync.sunshiinedolly.workers.dev.

1. Create D1 database viddy-library and execute schema.sql. Existing tables/data are retained.
2. Deploy worker.mjs as the viddy-sync Worker. Bind the database as DB.
3. Set the plaintext variable DISCORD_CLIENT_ID to 1573479904048054412. Set DISCORD_CLIENT_SECRET as a Cloudflare encrypted secret, entered directly in the dashboard. Never put it in Git, the desktop build, chat, or a plaintext variable.
4. In the Viddy Discord application’s OAuth2 settings, register exactly https://viddy-sync.sunshiinedolly.workers.dev/oauth/discord/callback. Leave Public Client off: the Worker performs the confidential exchange. No bot permissions are needed.
5. Disable Worker request logs/traces before live sign-in so OAuth URLs are not retained in application observability.
6. Check GET /health returns discordConfigured true; test sign-in and library sync on two isolated devices/profiles, restart persistence, offline behavior, logout, and unauthorized requests before shipping.

The checked-in wrangler.jsonc contains public identifiers only. The same source can be deployed with Wrangler after an authorized Cloudflare login: wrangler deploy --config cloudflare/wrangler.jsonc. Do not create broad API tokens as a shortcut. Local SQLite tests use synthetic identities and no network: node --test cloudflare/worker.test.mjs.

Native session persistence uses keyring 3.6.3 with Windows and Apple native stores. Test-only profiles have separate credential namespaces. To run the cross-process vault and loopback tests: cargo test --manifest-path src-tauri/Cargo.toml --locked -- --include-ignored. These tests create and remove only a random temporary test credential.

No CORS or public unauthenticated library endpoint is enabled. The native app handles API requests. Library writes use compare-and-swap revisions; the client performs a three-way merge with an atomic local checkpoint. Capacity failures roll back writes and preserve the previous cloud snapshot. Worker errors do not echo request bodies, credentials, or OAuth codes.
