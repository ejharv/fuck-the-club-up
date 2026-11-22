# Briefs for fucktheclubup.com

Guidance for building the site. These are notes, not code: adapt them to this repo's Next.js setup.

| Brief | What it covers |
| --- | --- |
| [01-concept.md](01-concept.md) | Voice, house rules, sections, the "wristband", first 10 posts |
| [02-design.md](02-design.md) | Palette, type, layout and components |
| [03-content-model.md](03-content-model.md) | Post fields and routes (storage superseded, see below) |
| [04-launch-cloudflare.md](04-launch-cloudflare.md) | Domain at Porkbun, DNS move to Cloudflare (hosting superseded, see below) |

Decisions so far:
- Host: Cloudflare **Workers** (Next.js via OpenNext), not Pages. Friends post from the site, so it needs a server.
- Posts are written in the app by crew members who sign in with Google, not as Markdown files in the repo. They're stored in Cloudflare D1, and photos, videos and audio go in Cloudflare R2.
- Only emails on the crew list can sign in. Admins manage the list at `/crew`.
- Domain: fucktheclubup.com, registered at Porkbun, with DNS moved to Cloudflare.

Still current: the voice, house rules, sections and wristband (01), the design (02), and the post fields and routes (03). Those fields are columns in `migrations/0001_init.sql` rather than frontmatter.

Superseded: 03's "Markdown files with frontmatter" and "every page is static", and 04's Pages build and connect steps. The DNS steps in 04 still apply. The deploy steps are in the root [README](../../README.md).
