# Brief 07: installable site and push alerts

Make fucktheclubup.com install to the home screen like an app, and send push alerts for the same moments the guest emails cover. These are notes, not code: adapt them to the repo as it stands. When this brief lands, add it to the table in [README.md](README.md).

Why: it gets most of what an app would give (an icon, alerts) without asking guests to download anything. See brief 06, "Not now: a native app".

## Part 1: installable site

1. **Manifest.** Add `src/app/manifest.ts` (Next.js metadata route): name "Fuck The Club Up", short name "FTCU", `display: "standalone"`, `start_url: "/"`, background and theme colors from the site palette in `globals.css`. Icons at 192 and 512 px PNG, plus a maskable 512 px version, made from the existing `src/app/icon.svg`. Keep `src/app/apple-icon.png` for iOS.
2. **Service worker.** `public/sw.js`, registered from a small client component in `src/app/layout.tsx`, scope `/`.
   - Cache only static build assets and the icons. Never cache HTML or API responses, and never anything under `/drop/`, `/u/`, `/api/`, `/nights/` or `/media/`: those carry tokens or private files.
   - Handle `push` and `notificationclick` (Part 2). No offline mode for now.
3. **iOS hint.** iPhone has no install prompt. On a phone in Safari, show a dismissible one-line hint on the drop page ("Add to Home Screen to get alerts") with a short how-to. Remember the dismissal on the device.
4. **Guests' own link.** If a guest installs from a night's page, the home-screen icon should open their personal link (`/drop/[token]/me/[pass]`) rather than the home page. Decide whether to serve a per-guest manifest on that route or to keep `start_url: "/"` and skip this. Whatever you pick, the token must never appear in a cached file or a public manifest.

## Part 2: push alerts

### Moments (match the guest emails)
- Day-of reminder, "photos are open", last call, "the draft is ready", "it's up". Same timing and wording rules as the emails in `src/lib/email.ts`, sent from the existing cron (`custom-worker.ts` → `src/app/api/internal/cron/route.ts`).

### Opting in
- On the drop page, next to the optional email box: a "Get alerts" button. Ask the browser for notification permission only when it's tapped, never on load.
- A guest can turn alerts off from the same page.

### Data (new migration, next number after the latest in `migrations/`)
- `night_push`: `night_id`, `device_id`, `endpoint_enc`, `keys_enc` (the subscription, encrypted like `night_emails.email_enc`), `sent_dayof`, `sent_open`, `sent_closing`, `sent_draft`, `sent_up`, `created_at`. Primary key `(night_id, device_id)`. `ON DELETE CASCADE` from `nights`.
- Delete a night's rows after its "it's up" alert, on opt-out, and on night delete, so push follows the same promise as email. Delete a row when the push service answers 404 or 410.

### Sending
- VAPID keys: public key in `wrangler.jsonc` vars, private key as a secret (`npx wrangler secret put VAPID_PRIVATE_KEY`). Add both to `.dev.vars.example` and the README's secrets list.
- Encrypt payloads per RFC 8291 and sign with VAPID (RFC 8292) using Web Crypto. If you use a library, check it runs in workerd first; Node-only push libraries won't.
- Keep payloads short and free of names, addresses or tokens: a title, one line, and the path to open. `notificationclick` opens the guest's own link.
- Batch like the email cron (it already sends 20 at a time) to stay under the Workers free plan's subrequest limit.

## Checks before calling it done
- Lighthouse shows the site as installable on Android Chrome.
- On an iPhone, adding to the home screen opens standalone, and alerts arrive after opting in.
- No token, address or private file shows up in Cache Storage (check in DevTools → Application).
- Opting out stops alerts, and the rows are gone after the night's "it's up".
