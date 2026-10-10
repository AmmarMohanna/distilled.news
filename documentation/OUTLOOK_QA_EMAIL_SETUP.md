# QA verification email through Outlook

The isolated `distilled-news-sources-qa` Worker can send account verification and password-reset mail from `distilled.news@outlook.com` using Microsoft Graph. Production retains its Cloudflare Email binding. The QA Worker checks the authorized mailbox before submitting a message, and stores each renewed Microsoft refresh token encrypted in D1. A Graph `202 Accepted` means submission succeeded; delivery should also be checked in the recipient inbox and Outlook Sent Items.

## One-time Microsoft setup

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) with an account that can register applications. A free Azure account/subscription and a tenant may be needed. Open **Identity → Applications → App registrations → New registration**.
2. Name it `Distilled News QA Mail`. Select **Personal Microsoft accounts only** under supported account types. No redirect URI is needed for the device-code flow. Register the app and copy its **Application (client) ID** (a UUID, not a secret).
3. Under **Authentication → Advanced settings**, set **Allow public client flows** to **Yes**, then save.
4. Under **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add `Mail.Send` and `User.Read`. The setup script also requests `offline_access` for refresh-token renewal. Do not grant mailbox-reading or application-wide send permissions.
5. Apply the QA D1 migration (already applied to the current isolated QA database):

   ```powershell
   cd apps/worker
   node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config wrangler.sources-qa.toml
   cd ../..
   ```

6. From a terminal signed in to the **new QA Cloudflare account** with Wrangler, run at the repository root:

   ```powershell
   node scripts/setup-outlook-qa-mail.mjs YOUR_APPLICATION_CLIENT_ID
   ```

   Open the **exact URL returned by Microsoft in the script output** and enter its one-time code. In the current personal-account flow Microsoft returned `https://www.microsoft.com/link`; sending that code to a different device-login page caused rejection. Sign in as `distilled.news@outlook.com` and consent. Temporary Microsoft connection failures are retried while polling, preserving the active authorization session. The script checks the mailbox identity, installs `OUTLOOK_CLIENT_ID`, `OUTLOOK_TOKEN_ENCRYPTION_KEY`, and `OUTLOOK_REFRESH_TOKEN` directly as secrets on the isolated QA Worker, and clears any older encrypted token row after a reconnect. Do not paste tokens or login codes into chat, issues, or Git.

7. Deploy the isolated QA Worker:

   ```powershell
   cd apps/worker
   node node_modules/wrangler/bin/wrangler.js deploy --config wrangler.sources-qa.toml
   ```

8. Register a fresh QA account from the QA frontend. Confirm the verification message arrives, its link uses the QA Worker hostname, the link verifies the account, and the account can log in. Test password reset with the same mailbox. The existing failed signup should have been rolled back; if a username is taken, use a new QA username.

If Microsoft revokes the connection, rerun the setup script. Keep QA usage low and review any Outlook sending limits before larger tests.
