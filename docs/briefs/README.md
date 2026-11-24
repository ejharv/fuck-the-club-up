# Briefs for fucktheclubup.com

Guidance for building the site. These are notes, not code: adapt them to this repo's Next.js setup.

| Brief | What it covers |
| --- | --- |
| [01-concept.md](01-concept.md) | Voice, house rules, sections, the "wristband", first 10 posts |
| [02-design.md](02-design.md) | Palette, type, layout and components |
| [03-content-model.md](03-content-model.md) | Post fields and routes (storage superseded, see below) |
| [04-launch-cloudflare.md](04-launch-cloudflare.md) | Domain at Porkbun, DNS move to Cloudflare (hosting superseded, see below) |
| [05-backdating-and-drop-links.md](05-backdating-and-drop-links.md) | Backdated posts, party drop links, takedowns (built; see below for how part 2 changed) |

Decisions so far:
- Host: Cloudflare **Workers** (Next.js via OpenNext), not Pages. Friends post from the site, so it needs a server.
- Posts are written in the app by crew members who sign in with Google, not as Markdown files in the repo. They're stored in Cloudflare D1, and photos, videos and audio go in Cloudflare R2.
- Only emails on the crew list can sign in. Admins manage the list at `/crew`.
- Domain: fucktheclubup.com, registered at Porkbun, with DNS moved to Cloudflare.

Still current: the voice, house rules, sections and wristband (01), the design (02), and the post fields and routes (03). Those fields are columns in `migrations/0001_init.sql` rather than frontmatter.

Superseded: 03's "Markdown files with frontmatter" and "every page is static", and 04's Pages build and connect steps. The DNS steps in 04 still apply. The deploy steps are in the root [README](../../README.md).

How brief 05 part 2 was built (decided with the site owner):
- The drop link is also the **party invite**: before the party it shows details and takes RSVPs; when the party starts it opens for uploads.
- People with the link also write **their account of the night**. Claude (Sonnet 4.6 on Bedrock) merges the accounts into one draft. Link holders read the draft, leave notes and approve each version; admins rewrite or edit, then drop.
- The uploads double as a **shared album** that link holders can view and download, which replaces the brief's "never reveal other uploads". The inbox bucket stays private; the album is served through the Worker to token holders only.
- **No names**: posts show no author, and contributors never sign in (nicknames only).
- **Albums are kept forever** (until the night is deleted), so there's no 30-day lifecycle rule on the inbox bucket.
- **No business directory.** Posts just link to venues' own websites: crew posts with normal Markdown links, Claude drafts with the per-night list of places and websites the admin enters.

