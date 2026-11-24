# Brief 06: business model and what to build next

Why the next features exist and in what order to build them. These are notes, not code: adapt them to the repo as it stands. When this brief lands, add it to the table in [README.md](README.md).

## The idea in one line
Partiful owns the invite and LineLeap owns the door. Nobody owns the story after the night, and the story is what sells the next night. FTCU's link already runs the whole night (invite, uploads, everyone's side of it, Claude's draft, the drop), so the recap is the wedge.

- **Hosts and guests use it free.** Every night a host runs brings their guests to the link.
- **Venues pay.** A recap of a night at a bar is an ad the bar didn't have to make.
- **Don't fight either company head-on.** Win the nights they ignore: house parties, birthdays, org socials, and a bar's slow weeknights, when there's no line to skip.

## Who pays, and roughly what (prices are guesses to test)
1. **Venue partner plan:** about $149 a month. One hosted recap night a month, the venue's own page, a spot on an upcoming-nights list, and a message to people who follow the venue.
2. **Paid entry and tickets:** about 5% + $0.50 per paid ticket, free tickets free, the processor's fee on top. For comparison, Partiful's ticketing takes about 11% and Posh about 10% + $0.99.
3. Later: sponsored recaps from non-alcohol brands on 21+ nights, a Pro plan for orgs and promoters, merch.

## Build order
Each step reuses what's already here. Don't start a step that needs payments or venue accounts before steps 1 to 3 are live.

1. **Anyone can host.** Today admins create nights (`/nights/new`) and add co-hosts (`night_hosts`, `src/lib/hosting.ts`). Let any signed-in Google account create a night, with limits (for example 2 nights a week and a storage cap per night). Keep the drop to the public blog behind an admin's review, so a host's night can end as a private album without becoming a post.
2. **"That's me, take it out."** On the album in `src/app/drop/[token]/DropClient.tsx`, anyone with the link can flag a photo or video they're in before the drop. A flagged file can't be kept or published until an admin clears the flag. Show the flag count on the night's admin page. This is the consent fix and a selling point.
3. **Recap story card.** A 9:16 image of a dropped night (cover, title, two or three kept shots, the post's address) sized for Instagram and Snapchat stories, with a share button on the post. Reuse the link-preview card work from `migrations/0009_invite_og.sql`. Only kept, published files go on it.
4. **Installable site and push alerts.** See [brief 07](07-installable-site-and-push.md).
5. **Follow a host or venue.** Opt-in, its own table, separate from `night_emails`, so the promise that night emails are deleted after the night still holds. A follower gets told when that host or venue lists a new night. One-tap unfollow.
6. **Venue pages.** `/places` already groups posts by `post_venues.place_key`. Each place becomes a page with its recaps and upcoming nights, plus a "claim this page" request an admin approves. **Decision needed first:** the README says "No business directory", so check with the site owner before building this.
7. **Upcoming nights.** A public list of nights a host or venue chooses to list. The invite stays as it is; listing is opt-in per night and never shows the address (only link holders see it, as now).
8. **Paid entry.** Payments go straight to the host or venue through a payments platform with connected accounts. The personal guest links (`/drop/[token]/me/[pass]`) become the ticket, shown as a QR code and checked in at the door by the host.
9. **Venue dashboard.** Per night: RSVPs, check-ins, uploads, recap views. Count, don't track: no per-person data beyond what the night already stores.

## Rules that don't change
- Nicknames only, no author on posts, the address never reaches Claude or the post.
- Nothing goes public without an admin's review.
- 21+ for anything with alcohol. FTCU never sells or promotes drinks itself; venues check ID at the door.
- No alcohol-brand sponsorship of nights run by student groups. Michigan rule R 436.1861 bars alcohol suppliers from promo events on campus or sponsored by student groups that are mostly under 21.

## Not now: a native app
Keep guests on the link: they upload from the group chat with no download, and an app would cut those uploads. Do brief 07 instead. Build an app (Expo, for hosts and venues only) when one of these is true: big video uploads keep failing because the phone locks or the browser closes, venues need a fast door scanner for paid entry, or hosts run nights every week and want their guest lists and alerts in one place.
