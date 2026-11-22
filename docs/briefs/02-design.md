# Design

One dark "club at night" look. No light theme needed: it is a deliberate single look, so set the background and every color explicitly.

## Palette
| Token | Hex | Use |
| --- | --- | --- |
| night | #0c0d1c | Page background, deep navy-black |
| night-2 | #16182e | Cards and raised surfaces |
| ink | #f2eee4 | Body text |
| dim | #a7a6bd | Secondary text |
| maize | #ffcb05 | Main accent (links, tags, wristband) |
| pink | #ff3d8b | Hot accent, sparingly (kickers, placeholder badge, quotes) |
| line | #2b2d4a | Borders and dividers |

## Type (Google Fonts)
- **Display:** Bowlby One, uppercase, tight line height (about 0.9). Headlines, logo, card titles.
- **Body:** Archivo 400/500/700, 17px, line height 1.6, text about 65 characters wide.
- **Utility:** JetBrains Mono, small uppercase with letter spacing. Nav, tags, kickers, wristband.

## Layout and components
- **Header:** logo "Fuck The **Club** Up" (Club in maize), section links in small mono caps.
- **Light strip:** a 6px band under the header, alternating maize and pink dashes like stage lights.
- **Home hero:** giant stacked "FUCK / THE CLUB / UP", "CLUB" in maize, "UP" as outlined text. Kicker above: "Ann Arbor · after dark · est. 2026". One-line lede under it.
- **Post cards ("flyers"):** dark card, section and date tag in mono, uppercase display title, one-line dek. On hover, a slight tilt (-0.6deg) and a maize border. Placeholder posts show a small pink "Placeholder post" badge.
- **Sections grid:** six tiles with a 1px divider grid, name in maize display type, blurb under it.
- **Post page:** section tag, big display headline, dek, the dashed maize wristband, then the body. Blockquotes get a pink left border.
- **Footer:** one line about the site plus the house rules in mono caps.
- Respect `prefers-reduced-motion` (turn off the hover tilt). Visible focus outlines in pink.
