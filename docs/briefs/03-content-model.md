# Content model

Posts are Markdown files, e.g. `content/posts/<slug>.md`, with this frontmatter:

```yaml
---
title: "The pregame playlist that has never missed"
dek: "Forty minutes, three acts, zero skips."
date: 2026-11-21
section: pregame          # night-reports | the-guide | game-day | pregame | lore | survival
night: "Any Friday, 10:15 PM"
damage: "One Spotify subscription"
rideHome: "Not applicable yet, we're still in the kitchen"
placeholder: true         # shows a placeholder banner and badge
draft: false              # drafts are left out of the build
---
```

Validate the frontmatter at build time so a typo in `section` fails loudly.

## Routes
| Route | Page |
| --- | --- |
| `/` | Hero, latest posts (newest first), sections grid |
| `/posts/<slug>/` | One post |
| `/section/<slug>/` | Posts in one section, with an empty state ("Nothing here yet. Doors open soon.") |
| `/about/` | What the blog is, house rules, "Got a story? Send us the night. We change the names, keep the chaos." |

Every page is static: nothing needs a server. Add a canonical link to `https://fucktheclubup.com/...`, page titles like "Post title | Fuck The Club Up", and a description meta from the dek.
