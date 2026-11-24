# fuck-the-club-up

The blog behind [fucktheclubup.com](https://fucktheclubup.com). Anyone can read it.

Every night starts as a **party invite** and ends as a **post**. An admin creates a night and drops one link in the group chat. That link changes as the night goes:

| When | The link shows |
| --- | --- |
| Before the party | The invite: what, when, where, dress code, RSVP with a nickname, add to calendar |
| Party starts → link closes | Photo/video uploads and a box for each person's side of the story |
| After | The shared album (view and download), Claude's draft, notes and approvals |
| Dropped | A link to the published post |

Nobody signs in to use the link: no accounts, nothing tied to a person, nicknames only. Admins review everything and decide what goes public. Crew members (Google sign-in) can also write posts directly at `/new`.

Briefs for voice, design and content live in [`docs/briefs/`](docs/briefs/README.md).

## How it works

| Piece | What |
| --- | --- |
| App | Next.js 15 (App Router) on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare). `custom-worker.ts` adds a 15-minute cron |
| Database | Cloudflare D1 (`migrations/`) |
| Media | R2 `fuck-the-club-up-media`: published files, served from `media.fucktheclubup.com` |
| Inbox | R2 `fuck-the-club-up-inbox`: **private**. Party uploads and the shared album. Never gets a public domain |
| Drafts | Claude Sonnet 4.6 on Amazon Bedrock, called with a dedicated IAM user that can only invoke that model |
| Sign-in | Auth.js with Google, crew list only. Party-link guests never sign in |
| Bots | Cloudflare Turnstile on party links and the takedown form, plus a Workers rate limit |

### A night, step by step
1. **Admin → Nights → New night.** Name, start time, optional close time, address, dress code. You get the link and a QR code once; only a SHA-256 fingerprint of it is stored. **Regenerate link** kills the old one.
2. **Invite phase.** Guests pass Turnstile once (sets an anonymous device cookie) and RSVP with a nickname.
3. **Live.** When the party starts, guests upload (photos re-encoded in the browser to strip GPS; 25 MB photos, 200 MB videos, 60 MB audio; per-night and per-device limits) and write their account.
4. **Review.** On the night's admin page: keep or toss each file, pick a cover, list the places you went with their websites, then **Write the draft with Claude** (about 15 seconds, roughly 2¢). Guests read the draft on the link, leave notes, and approve. **Rewrite with the notes** or edit the text by hand; each save is a new version and approvals start over.
5. **Drop now**, or schedule a drop time (the cron publishes it). Kept files are copied from the private inbox to public media in batches, and the post goes up with the night's date.

### Claude and names
- Claude is told to use nicknames only, invent descriptive nicknames for everyone else, never write URLs or real names, and treat guests' text as material rather than instructions.
- Claude links place names only to the websites listed for that night; any other link it writes is flattened to plain text. Crew-written posts can link anything with normal Markdown.
- Approvals are the real check for house rule 1: the approval screen asks people to look for real names.

### Security model
- **Crew list.** Google sign-in is refused for anyone not in `members`. Every write re-checks D1, so removing someone takes effect immediately.
- **Admins.** Emails in `ADMIN_EMAILS` become admins on first sign-in. Nights, the crew list and takedowns are admin-only.
- **Party links.** 32-byte random tokens, stored hashed. Writes need a Turnstile-verified device cookie (HMAC-signed, 12 hours). Same "closed" response for wrong, regenerated or closed links. `no-referrer` and `noindex` on every party page.
- **Uploads.** Server-chosen keys, an allowlist of image/video/audio types (no SVG or HTML), and signed URLs that lock content type and exact size. Every upload is checked in R2 after the PUT, and again before it's published. Party uploads go to the private inbox; nothing reaches the public bucket without an admin's drop.
- **Rendering.** Markdown with raw HTML disabled. Embeds limited to YouTube, Spotify and SoundCloud. Files are served with `nosniff` and a sandboxing CSP.
- **Privacy.** Posts show no author. The party address only shows on the invite and never reaches Claude or the post. Guests' IPs are stored only as salted hashes.
- **Crawlers.** `robots.txt` keeps crawlers off party links and admin pages.
- **Takedowns.** Every post links to `/takedown`. Admins get a badge, can remove a single file in one click, and mark the request done.

## Local development

Requires Node 22 (`nvm use`).

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in AUTH_SECRET, Google client, ADMIN_EMAILS, Bedrock keys
npm run db:migrate:local
npm run dev                            # http://localhost:3000
```

- Local dev emulates D1 and both R2 buckets. With the R2 keys empty and `ALLOW_LOCAL_UPLOADS=1`, uploads go through the local emulator; production never allows that path.
- `.dev.vars.example` uses Cloudflare's always-pass Turnstile test keys.
- To test the real Workers runtime (including the cron), run `npm run preview`.

## First deploy

1. `npx wrangler login`
2. Create the database, then paste its id into `wrangler.jsonc` → `d1_databases[0].database_id`:
   ```bash
   npx wrangler d1 create fuck-the-club-up
   npm run db:migrate:remote
   ```
3. Create both buckets. Edit `r2-cors.json` first so the `workers.dev` origin matches your real Worker URL. Shared albums are kept forever (until you delete the night), so the inbox has no auto-delete rule.
   ```bash
   npx wrangler r2 bucket create fuck-the-club-up-media
   npx wrangler r2 bucket create fuck-the-club-up-inbox
   npx wrangler r2 bucket cors set fuck-the-club-up-media --file r2-cors.json
   npx wrangler r2 bucket cors set fuck-the-club-up-inbox --file r2-cors.json
   # Optional, if storage ever matters: auto-delete album files after N days
   # npx wrangler r2 bucket lifecycle add fuck-the-club-up-inbox expire-albums --expire-days 90
   ```
   Never connect a custom domain or r2.dev URL to the inbox bucket.
4. In the R2 dashboard, create an API token with **Object Read & Write** on those two buckets only. Put your account id in `wrangler.jsonc` → `vars.R2_ACCOUNT_ID`.
5. **Google OAuth** (Cloud Console → Credentials → OAuth client, Web). Authorized redirect URIs:
   - `https://fucktheclubup.com/api/auth/callback/google`
   - `https://www.fucktheclubup.com/api/auth/callback/google`
   - `https://fuck-the-club-up.<your-subdomain>.workers.dev/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
6. **Turnstile.** In the Cloudflare dashboard → Turnstile, add a widget for `fucktheclubup.com` (and the workers.dev host). Put the site key in `wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY`.
7. **Bedrock.** The IAM user `fuck-the-club-up-bedrock` already exists in the AWS account and can only invoke Claude Sonnet 4.6. Make a production access key for it (separate from your local one):
   ```bash
   aws iam create-access-key --user-name fuck-the-club-up-bedrock
   ```
8. Add the secrets:
   ```bash
   npx wrangler secret put ADMIN_EMAILS          # your Google email(s), comma-separated
   npx wrangler secret put AUTH_SECRET           # openssl rand -base64 33
   npx wrangler secret put AUTH_GOOGLE_ID
   npx wrangler secret put AUTH_GOOGLE_SECRET
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   npx wrangler secret put BEDROCK_ACCESS_KEY_ID
   npx wrangler secret put BEDROCK_SECRET_ACCESS_KEY
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put CRON_SECRET           # openssl rand -hex 32
   ```
9. `npm run deploy`

### Domain
- Move DNS from Porkbun to Cloudflare as described in [brief 04](docs/briefs/04-launch-cloudflare.md).
- In the Worker's settings, add custom domains `fucktheclubup.com` and `www.fucktheclubup.com`.
- In the **media** bucket's settings (never the inbox), connect `media.fucktheclubup.com` and set `vars.MEDIA_PUBLIC_URL` to `https://media.fucktheclubup.com`.

### Auto-deploy from GitHub
Workers & Pages → the Worker → Settings → Builds → connect this repo. Use build command `npx opennextjs-cloudflare build` and deploy command `npx opennextjs-cloudflare deploy`.

## Adding friends
- **To post directly (crew):** sign in, open **Crew** in the header, add the Google email they use.
- **For a night:** just send them the night's link. No account needed.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server with local D1/R2 |
| `npm run preview` | Build for Workers and run locally in workerd |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing `wrangler.jsonc` or `.dev.vars` |
| `npm run lint` | ESLint |

## Costs
- **Workers free plan.** 100k requests a day and 10 ms of CPU per request; R2 and D1 calls count toward 50 subrequests per request. Drops copy files in small batches so they fit. If the logs show error 1102 (CPU), move to Workers Paid ($5/month).
- **R2.** 10 GB stored free, no charge for serving. A big night (about 200 photos and 20 videos) is roughly 2 to 3 GB before tossing. Shared albums are kept until you delete the night. Past the free 10 GB, a 3 GB night costs about 50¢ a year; deleting a night from its admin page removes its album.
- **Bedrock.** About 2¢ per Claude draft, capped at 12 drafts per night. Failed calls don't count.
- **Turnstile, cron, D1.** Free at this size.
