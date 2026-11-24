# Brief 05: backdated posts and party drop links

Two features for the crew blog. These are notes, not code: adapt them to the repo as it stands (Next.js 15 on Cloudflare Workers via OpenNext, D1, R2, Auth.js with a crew list). When this brief lands, add it to the table in [README.md](README.md).

Ship in the order under "Build order". Part 1 is small and independent. Part 2 depends on the site being deployed with real R2 keys and the custom domain.

## Part 1: backdated posts

### Problem
`posts.published_at` is always the moment of publishing, and the feed sorts by it. `night` is free text ("Saturday, game day"). There's no way to post about a night from last spring and have it sit where it happened, and no way to edit a post after publishing.

### Changes
1. **Migration `0003_night_of.sql`:** add `night_of TEXT` (ISO date, `YYYY-MM-DD`, nullable) to `posts`. Add an index on `COALESCE(night_of, substr(published_at, 1, 10)) DESC`, or sort in the query if D1 won't index the expression.
2. **New post form (`/new`):** add an optional date input labeled "When was the night?". Keep the free-text `night` field as the vibe line. Validate server-side in `createPost`: a real calendar date, not in the future, not before 2000.
3. **Sorting:** `listPosts` (home and section pages) orders by `COALESCE(night_of, published_at) DESC, published_at DESC`. A backdated post slots into the timeline where the night happened.
4. **Display:** `PostCard` and `Wristband` show the night's date when `night_of` is set ("Oct 4, 2025"). For a backdated post, also show a small "Posted Nov 24, 2026" so it's honest. Use `formatDate` (America/Detroit). Format a bare date without time-zone shifting it a day.
5. **Edit page `/posts/[slug]/edit`:** for the author or an admin. Edit title, dek, section, night, night date, damage, ride home, body, captions, cover, and remove individual media (deleting the R2 object). Re-run the same validation as `createPost`, including the house rule 1 consent box. Set `updated_at`.
6. **Per-media delete for admins** from the post page, for fast takedowns. Shared with Part 2.

Optional: a "New this week" strip on the home page (by `published_at`) so a freshly posted old night still gets seen.

## Part 2: party drop links

### The flow
1. An admin opens `/nights/new`, names the night, picks its date, and gets a share link like `https://fucktheclubup.com/drop/<token>` plus a QR code.
2. They drop the link in the group chat. Anyone with it can upload photos and videos from their phone without signing in.
3. The link closes automatically (default: noon the day after the night, in America/Detroit).
4. The admin reviews everything at `/nights/[id]`, keeps or tosses each file, picks a cover, writes the recap.
5. **Drop now** publishes the post, or the admin sets a drop time and a cron trigger publishes it then. Nothing is ever public before an admin has reviewed it.

The same flow works for past nights: create a night with an old date and send the link to whoever has the photos. The resulting post uses Part 1's `night_of`.

### Data (migration `0004_nights.sql`)
- `nights`: `id`, `name`, `night_of` (date), `token_hash` (SHA-256 of the token, never the token itself), `opens_at`, `closes_at`, `status` (`collecting` | `reviewing` | `dropped` | `closed`), `max_files` (default 500), `max_bytes` (default 10 GB), `per_device_files` (default 60), `drop_at` (nullable), `post_id` (nullable, set on drop), `created_by`, `created_at`.
- `night_uploads`: `r2_key` (in the inbox bucket), `night_id`, `kind`, `content_type`, `size`, `nickname` (optional, max 40 chars), `device_id` (random id from a cookie), `ip_hash`, `consented_at`, `decision` (`pending` | `keep` | `toss`), `caption`, `created_at`.

### Storage: a separate private inbox bucket
The media bucket is served publicly from `media.fucktheclubup.com`, and an R2 custom domain exposes the whole bucket. Party uploads must never land there.
- Create `fuck-the-club-up-inbox` with **no** public domain or r2.dev access. Add a binding `INBOX` in `wrangler.jsonc` and its own CORS rule (PUT from the site origins only).
- Presigned PUTs from the drop page target the inbox bucket. Reuse `presignPut`, parameterized by bucket.
- The review page shows previews through an admin-only Worker route that streams from `INBOX`, with the same locked-down headers as `src/app/media/[...key]/route.ts`.
- On drop, copy kept files into `MEDIA` under `media/YYYY-MM/<uuid>.<ext>`, insert `media` rows, then delete everything for that night from `INBOX`.
- Add an R2 lifecycle rule on the inbox bucket that deletes objects older than 30 days.

### Drop page `/drop/[token]`
- Mobile-first, one big "Add photos and videos" button, progress per file, "Got it, N files in" when done.
- Look up the night by hashing the token. If it's missing, closed or past `closes_at`, show a friendly "This link's closed" page (same response whether the token is wrong or expired).
- Optional nickname field. A required box: "Everyone in these is cool with them going up, and I'm 21+."
- Re-encode photos in the browser before upload, as `/new` already does, so GPS and other metadata are stripped. Add a line under the button that videos keep their location data.
- `noindex`, no links to it from the site, and `Referrer-Policy: no-referrer` so the token doesn't leak.

### Upload route `POST /api/drop/[token]/uploads`
Same shape as `src/app/api/uploads/route.ts`, but authorized by the night token instead of a crew session:
- Valid token, status `collecting`, now between `opens_at` and `closes_at`.
- Type from `ALLOWED_TYPES`. Size caps for guests: photo 25 MB, video 200 MB, audio 60 MB.
- Enforce per-night file count and total bytes, and per-device file count, in D1 before signing.
- Verify a Cloudflare Turnstile token once per session (store a short-lived signed cookie after the first pass).
- Rate-limit by IP with the Workers rate limiting binding (for example 30 sign requests a minute).
- The server picks the key. Record the row in `night_uploads` before returning the signed URL. Store `ip_hash` (salted), not the raw IP.
- On review or drop, `head` each object in `INBOX` and check type and size match what was signed, as `createPost` does now.

### Admin pages
- `/nights`: list of nights with status, upload count, links to review.
- `/nights/new`: name, date, close time, limits. Shows the link and a QR code once, with a button to copy. Only the hash is stored, so offer **Regenerate link** (new token, old one dies) and **Close link**.
- `/nights/[id]`: grid of uploads with keep/toss per item, bulk select, captions, cover pick, then the post fields (prefilled: title from the night name, section `night-reports`, `night_of` from the night). Require house rule 1 consent and "ride home" for night reports, same as `/new`.
- **Drop now** runs the copy-and-publish in one go. **Drop at** sets `drop_at` and status `reviewing`.
- All of this is admin-only (`requireAdmin`). Crew reviewers can come later.

### Scheduled drops
- Add a cron trigger in `wrangler.jsonc` (every 15 minutes). OpenNext's worker needs a `scheduled` handler; wrap the generated worker or add a small custom entry that calls the same drop function.
- The cron only drops nights in status `reviewing` with `drop_at <= now` and at least one kept file. It never touches `collecting` nights.
- It also flips `collecting` nights past `closes_at` to `closed` (awaiting review).

### Takedowns
- Every post page gets a "Want something taken down?" link to `/takedown?post=<slug>`: which photo (pick from thumbnails), optional contact, short reason. Store in a `takedown_requests` table and show a count badge to admins in the header.
- Admins can delete a single media item from the post page (Part 1, step 6) and mark the request done.

## Security checklist
- Tokens: 32 random bytes, base64url, stored as SHA-256. Constant-time compare not needed since lookup is by hash.
- Inbox bucket is private. Nothing from it is ever served on a public URL.
- No SVG, HTML or other executable types, as today.
- Drop page and its API never reveal other uploads, counts beyond the uploader's own, or the night's details beyond its name.
- Everything public goes through admin review. No auto-publish path.

## Costs to note in the README
- R2: 10 GB free, then about $0.015 per GB a month, free egress. A big night (around 200 photos, 20 videos) is roughly 2 to 3 GB before tossing.
- Turnstile, cron triggers and D1 at this size: free.
- Workers: free plan may be enough; Workers Paid is $5 a month if CPU limits bite.

## Build order
1. Part 1: `night_of`, date picker, sorting, display, edit page, per-media delete.
2. Deploy the site (README "First deploy") if it isn't already.
3. Inbox bucket, `nights` and `night_uploads`, drop page, upload route, Turnstile, rate limit.
4. Admin pages and Drop now.
5. Cron drops, takedown form, lifecycle rule.
