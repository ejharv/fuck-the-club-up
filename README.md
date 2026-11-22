# fuck-the-club-up

The blog behind [fucktheclubup.com](https://fucktheclubup.com). Anyone can read it. Friends on the crew list sign in with Google to post stories, photos, videos and music.

Briefs for voice, design and content live in [`docs/briefs/`](docs/briefs/README.md).

## How it works

| Piece | What |
| --- | --- |
| App | Next.js 15 (App Router) on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare) |
| Database | Cloudflare D1: posts, media, crew list (`migrations/`) |
| Media | Cloudflare R2. Browsers upload straight to R2 with short-lived signed URLs, and files are served from `media.fucktheclubup.com` |
| Sign-in | Auth.js with Google. Only emails on the crew list can sign in |

This differs from brief 04, which planned a static site on Cloudflare Pages. In-app posting needs a server, so the site runs on Workers. The DNS steps in that brief still apply.

### Security model
- **Crew list.** Sign-in is refused for any Google account not in `members`. Every write re-checks the list in D1, so removing someone takes effect on their next request.
- **Admins.** Emails in `ADMIN_EMAILS` become admins on first sign-in. Admins manage the crew list at `/crew`.
- **Uploads.** The server picks the object key and allows only image, video and audio types (no SVG or HTML), with size caps. The signed upload URL locks both the content type and the exact size. Photos are re-encoded in the browser before upload, which strips GPS and other metadata. Videos keep their metadata. A post can only attach files its author uploaded, and each file is checked in R2 before the post is saved.
- **Rendering.** Post bodies are Markdown with raw HTML disabled. Embeds are limited to YouTube, Spotify and SoundCloud.
- **Headers.** The site sends CSP, HSTS and frame-denial headers. Media is served from a separate origin.
- **House rule 1.** Publishing requires confirming that everyone named or shown said yes.

## Local development

Requires Node 22 (`nvm use`).

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in AUTH_SECRET, Google client, ADMIN_EMAILS
npm run db:migrate:local
npm run dev                            # http://localhost:3000
```

Local dev emulates D1 and R2. With the R2 keys empty and `ALLOW_LOCAL_UPLOADS=1` in `.dev.vars`, uploads go through the local emulator. Production never allows that path. To test the real Workers runtime, run `npm run preview`.

## First deploy

1. `npx wrangler login`
2. Create the database, then paste its id into `wrangler.jsonc` → `d1_databases[0].database_id`:
   ```bash
   npx wrangler d1 create fuck-the-club-up
   npm run db:migrate:remote
   ```
3. Create the media bucket and allow browser uploads. First edit `r2-cors.json` so the `workers.dev` origin matches your real Worker URL:
   ```bash
   npx wrangler r2 bucket create fuck-the-club-up-media
   npx wrangler r2 bucket cors set fuck-the-club-up-media --file r2-cors.json
   ```
4. In the dashboard, create an R2 API token with **Object Read & Write** on that bucket only. Put your account id in `wrangler.jsonc` → `vars.R2_ACCOUNT_ID`.
5. Google Cloud Console → Credentials → OAuth client (Web). Authorized redirect URIs:
   - `https://fucktheclubup.com/api/auth/callback/google`
   - `https://www.fucktheclubup.com/api/auth/callback/google`
   - `https://fuck-the-club-up.<your-subdomain>.workers.dev/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
6. Add the secrets. `ADMIN_EMAILS` is your Google email, or several separated by commas. It's a secret so personal emails stay out of this public repo.
   ```bash
   npx wrangler secret put ADMIN_EMAILS
   npx wrangler secret put AUTH_SECRET          # openssl rand -base64 33
   npx wrangler secret put AUTH_GOOGLE_ID
   npx wrangler secret put AUTH_GOOGLE_SECRET
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   ```
7. `npm run deploy`

### Domain
- Move DNS from Porkbun to Cloudflare as described in [brief 04](docs/briefs/04-launch-cloudflare.md).
- Then, in the Worker's settings, add custom domains `fucktheclubup.com` and `www.fucktheclubup.com`.
- In the R2 bucket's settings, connect the custom domain `media.fucktheclubup.com` and set `vars.MEDIA_PUBLIC_URL` to `https://media.fucktheclubup.com`.

### Auto-deploy from GitHub
Workers & Pages → the Worker → Settings → Builds → connect this repo. Use build command `npx opennextjs-cloudflare build` and deploy command `npx opennextjs-cloudflare deploy`.

## Adding friends
Sign in, open **Crew** in the header, and add the Google email they use. They can sign in right away. Remove them there too.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server with local D1/R2 |
| `npm run preview` | Build for Workers and run locally in workerd |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing `wrangler.jsonc` |
| `npm run lint` | ESLint |

## Costs
- **Workers free plan.** 100k requests a day and 10 ms of CPU per request. Server-rendered pages can go over 10 ms. If the logs show error 1102, move to Workers Paid ($5/month).
- **D1.** The free tier is plenty for a blog.
- **R2.** 10 GB of storage free and no charge for serving media. Phone videos fill 10 GB quickly; after that it's about $0.015 per GB per month.
