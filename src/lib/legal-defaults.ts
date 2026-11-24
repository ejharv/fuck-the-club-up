/**
 * Default Privacy Policy and Terms, written to match what the site actually
 * does. Admins can edit both on /site; these are the fallbacks.
 * Not legal advice: have someone qualified review them as the site grows.
 */
export const LEGAL_UPDATED = "November 24, 2026";

export const DEFAULT_PRIVACY = `Fuck The Club Up ("we", "us") runs fucktheclubup.com, a blog where a crew of friends posts stories, photos and videos from nights out. This policy explains what we collect and what we do with it. We keep it short because we collect very little.

## What we collect

**If you sign in with Google** (crew members and admins only), we get your Google email address, name and profile picture. We use them to check that you're on the crew list and to show your name on our own admin screens. Posts never show who wrote them. We don't get your Google password or access to anything else in your Google account.

**If you use a party link** (an invite or photo drop for a night), you don't sign in. We store:
- what you choose to give us: an optional nickname, your RSVP, your account of the night, notes on the draft, your approval, and the photos, videos and audio you upload;
- if you choose to, your email address, used only to send your personal link and up to three emails about that night (a reminder on the day, when the draft is ready, and when it's posted). It's encrypted, never shown to anyone (including hosts), and deleted after the last email, when you unsubscribe, or when the night is deleted;
- a random ID in a cookie on your device, so you can edit your own story and approve once;
- a salted, one-way hash of your IP address, for rate limits and abuse prevention. We never store the IP itself.

Photos are re-encoded in your browser before upload, which removes location and camera data. **Videos keep their original data, including any location**, so check your phone's settings if that matters to you.

**If you send a takedown request,** we store what you write and any contact you choose to give.

**Basic logs.** Our hosting provider keeps standard request logs (for example IP address and browser) for security and debugging.

## How we use it

- To run the site: show the invite, collect the night's photos and stories, and publish posts.
- To write drafts: everyone's accounts of a night (nicknames only, never the party address) are sent to Anthropic's Claude model through Amazon Web Services to draft the post. People who were there review every draft before an admin publishes anything.
- To keep the site safe: bot checks, rate limits and takedowns.

We don't sell your data, we don't run ads, and we don't use third-party analytics or tracking.

## Who else handles it

- **Cloudflare** hosts the site, stores the database and files, and runs the bot check (Turnstile).
- **Google** handles sign-in for crew members.
- **Amazon Web Services (Bedrock)** runs the Claude model that writes drafts. Per AWS, prompts aren't used to train models.
- **Amazon Web Services (SES)** sends the optional party emails.
- Embedded players (**YouTube, Spotify, SoundCloud**) load from those services and follow their own privacy policies.

## What's public

Published posts, and the photos, videos and audio an admin chose to include, are public. Everything else stays private: the shared album (anyone holding that night's link can see it), accounts, notes, RSVPs and the party address. We use nicknames, not real names, and every post goes through house rule 1: no names without a yes.

## How long we keep it

- Published posts stay up until they're edited or deleted.
- A night's shared album and the accounts stay until an admin deletes that night.
- The device cookie lasts up to a year, and the bot-check cookie lasts up to 12 hours.
- Crew sign-in sessions last up to 30 days.

## Your choices

- **Something of you is up?** Use "Ask for a takedown" on any post. No questions asked.
- **Want your data deleted?** Contact us and we'll delete what we hold about you: your crew membership, your uploads and your accounts.
- **Under 21?** Don't use party links or post anything from nights with drinking.

## Contact

{{contact}}

We may update this policy. The date at the top shows the latest version.`;

export const DEFAULT_TERMS = `These terms cover your use of fucktheclubup.com ("the site"). By using it, you agree to them.

## Who can use it

- Anyone can read the site.
- You need to be **21 or older** to upload, RSVP to, or write about nights involving alcohol.
- Posting directly takes a crew account. Contributing to a night only needs that night's link.

## House rules

These are the rules, not suggestions:
1. **No names without a yes.** Don't name, tag or show anyone who hasn't agreed. Use nicknames.
2. **Nobody drives.** Don't glorify driving after drinking. Every recap says how people got home.
3. **Punch up.** Roast the playlist and the prices, not people.
4. **21+** for anything involving alcohol.
5. **Water between rounds.**

## What you can't post

Don't post anything that's illegal, that you don't have the right to share, or that shows someone who didn't agree to it. That includes harassment, hate, sexual content, other people's private information, and anything involving minors. Admins can remove anything at any time, for any reason.

## Your content

You keep ownership of what you upload and write. By submitting it, you give us permission to store it, edit it (including having Claude merge it into a post), and publish it on the site and its link previews. You can ask us to take it down at any time with the takedown link on any post.

## AI-written drafts

Posts from party links are drafted by an AI model from what people submitted, then reviewed by the people who were there and by an admin. Drafts can still get details wrong. If something about you is wrong, ask for a takedown or a correction.

## Party links

A party link works like a key. Anyone holding it can see that night's invite and shared album, so don't post it publicly. Admins can close or replace a link at any time.

## No warranties

The site is provided as-is, for fun, with no guarantees that it'll always be up or that content will be kept. To the extent the law allows, we aren't liable for damages from using it. Don't rely on anything here as advice, especially about getting home: plan a sober ride.

## Changes and contact

We may update these terms. The date at the top shows the latest version. Questions: {{contact}}`;

export const DEFAULT_CONTACT = "Use the **Ask for a takedown** link on any post, or message the crew directly.";
