import type { Metadata } from "next";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { dropContext } from "@/lib/drop-context";
import { nightByToken } from "@/lib/nights";
import { cf } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";
import { requestOrigin } from "@/lib/origin";
import { formatDay } from "@/lib/format";
import { latestDraft, listAlbum, mePass, phaseOf } from "@/lib/nights";
import { parseVenueJson } from "@/lib/venues";
import { DropClient } from "./DropClient";
import { InAppNotice } from "@/components/InAppNotice";

export const dynamic = "force-dynamic";
/** The group-chat preview: the party invite image plus the night's name. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const night = await nightByToken((await params).token);
  const title = night ? `You're invited: ${night.name}` : "You're invited";
  const description = "RSVP here. The same link takes the photos and everyone's side of the story after.";
  const origin = await requestOrigin();
  const ownCard = night?.og_key ? mediaUrl(night.og_key, (await cf()).MEDIA_PUBLIC_URL) : null;
  const image = ownCard ? (ownCard.startsWith("http") ? ownCard : `${origin}${ownCard}`) : `${origin}/og/party-invite.png`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, alt: "You're invited" }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

function Closed() {
  return (
    <section className="mx-auto max-w-2xl px-4 pt-16 sm:px-6">
      <h1 className="display text-[clamp(3rem,12vw,6rem)]">This link&apos;s closed.</h1>
      <p className="mt-6 text-lg text-dim">If you still have photos from the night, ask whoever sent it for a fresh one.</p>
    </section>
  );
}

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });

export default async function DropPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await dropContext(token);
  if (!ctx) return <Closed />;
  const { env, night, device, verified } = ctx;
  const phase = phaseOf(night);
  const DB = env.DB;

  const hostNames = (
    await DB.prepare("SELECT display_name FROM night_hosts WHERE night_id = ? AND display_name IS NOT NULL AND display_name != '' ORDER BY created_at")
      .bind(night.id)
      .all<{ display_name: string }>()
  ).results.map((h) => h.display_name);
  const hostedBy = hostNames.length > 1 ? `${hostNames.slice(0, -1).join(", ")} & ${hostNames[hostNames.length - 1]}` : hostNames[0] ?? null;
  const [rsvps, mine, album, draft, accountCount, post] = await Promise.all([
    DB.prepare("SELECT device_id, nickname, answer, plus_ones, waitlisted FROM night_rsvps WHERE night_id = ? ORDER BY created_at")
      .bind(night.id)
      .all<{ device_id: string; nickname: string; answer: string; plus_ones: number; waitlisted: number }>(),
    device
      ? DB.prepare("SELECT nickname, body FROM night_accounts WHERE night_id = ? AND device_id = ?")
          .bind(night.id, device)
          .first<{ nickname: string; body: string }>()
      : null,
    night.album_open ? listAlbum(night.id) : Promise.resolve([]),
    latestDraft(night.id),
    DB.prepare("SELECT COUNT(*) AS n FROM night_accounts WHERE night_id = ?").bind(night.id).first<{ n: number }>(),
    night.post_id ? DB.prepare("SELECT slug FROM posts WHERE id = ?").bind(night.post_id).first<{ slug: string }>() : null,
  ]);

  let review: { approvals: number; approvedByMe: boolean; notes: Array<{ nickname: string | null; body: string }> } | null = null;
  if (draft) {
    const [ap, mineAp, notes] = await Promise.all([
      DB.prepare("SELECT COUNT(*) AS n FROM night_approvals WHERE night_id = ? AND version = ?").bind(night.id, draft.version).first<{ n: number }>(),
      device
        ? DB.prepare("SELECT 1 FROM night_approvals WHERE night_id = ? AND version = ? AND device_id = ?").bind(night.id, draft.version, device).first()
        : null,
      DB.prepare("SELECT nickname, body FROM night_notes WHERE night_id = ? AND version = ? ORDER BY created_at")
        .bind(night.id, draft.version)
        .all<{ nickname: string | null; body: string }>(),
    ]);
    review = { approvals: ap?.n ?? 0, approvedByMe: Boolean(mineAp), notes: notes.results };
  }

  const myRsvp = rsvps.results.find((r) => r.device_id === device) ?? null;
  const songRows = await DB.prepare("SELECT id, device_id, title, artist, url FROM night_songs WHERE night_id = ? ORDER BY created_at")
    .bind(night.id)
    .all<{ id: string; device_id: string; title: string; artist: string | null; url: string | null }>();
  const placeRows = await DB.prepare("SELECT id, name, url, kind FROM night_places WHERE night_id = ? AND device_id = ? ORDER BY created_at")
    .bind(night.id, device ?? "")
    .all<{ id: string; name: string; url: string | null; kind: string }>();
  const places = {
    approved: parseVenueJson(night.venues),
    mine: placeRows.results,
  };
  const songs = songRows.results.map((s) => ({ id: s.id, title: s.title, artist: s.artist, mine: s.device_id === device }));
  let me: { path: string; ics: string; google: string } | null = null;
  if (device && verified && (myRsvp || mine)) {
    const pass = await mePass(env.AUTH_SECRET, night.id, device);
    const path = `/drop/${token}/me/${pass}`;
    const origin = await requestOrigin();
    const g = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const google = new URL("https://calendar.google.com/calendar/render");
    google.searchParams.set("action", "TEMPLATE");
    google.searchParams.set("text", night.name);
    google.searchParams.set("dates", `${g(night.opens_at)}/${g(night.closes_at)}`);
    google.searchParams.set("details", `Your personal party link (don't share it, it signs in as you):\n${origin}${path}`);
    if (night.location_text) google.searchParams.set("location", night.location_text);
    me = { path, ics: `${path}/calendar.ics`, google: google.toString() };
  }
  const going = rsvps.results.filter((r) => r.answer === "going" && !r.waitlisted).map((r) => (r.plus_ones ? `${r.nickname} +${r.plus_ones}` : r.nickname));
  const maybe = rsvps.results.filter((r) => r.answer === "maybe").map((r) => r.nickname);
  const headcount = rsvps.results.filter((r) => r.answer === "going" && !r.waitlisted).reduce((n, r) => n + 1 + r.plus_ones, 0);
  const waitlistCount = rsvps.results.filter((r) => r.answer === "going" && r.waitlisted).length;
  const spotsLeft = night.capacity === null ? null : Math.max(0, night.capacity - headcount);

  const lede =
    phase === "invite"
      ? "This is the party link. RSVP now; once the night starts, this same link takes the photos."
      : phase === "live"
        ? "It's on. Drop your photos and videos and tell your side. Claude turns it all into one post."
        : phase === "after"
          ? "Photos and stories are in. Read the draft, leave notes, approve it when it's right."
          : "The night's been written up. Thanks for being there.";

  const client = (
      <DropClient
        token={token}
        phase={phase}
        verified={verified}
        siteKey={env.TURNSTILE_SITE_KEY}
        rsvp={myRsvp ? { nickname: myRsvp.nickname, answer: myRsvp.answer, plusOnes: myRsvp.plus_ones, waitlisted: Boolean(myRsvp.waitlisted) } : null}
        guestInfo={{ maxPlusOnes: night.max_plus_ones, spotsLeft, waitlist: waitlistCount }}
        account={mine ?? null}
        me={me}
        songs={songs}
        places={places}
        accountCount={accountCount?.n ?? 0}
        album={album.map((u) => ({ key: u.r2_key, kind: u.kind, nickname: u.nickname }))}
        draft={
          draft && phase !== "dropped"
            ? {
                version: draft.version,
                title: draft.title,
                dek: draft.dek,
                wristband: { night: draft.night_label, damage: draft.damage, rideHome: draft.ride_home },
                approvals: review!.approvals,
                approvedByMe: review!.approvedByMe,
                notes: review!.notes,
              }
            : null
        }
        draftBody={draft && phase !== "dropped" ? <Markdown>{draft.body}</Markdown> : null}
      />
  );

  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-10">
      <InAppNotice />
      <p className="mono text-pink">
        {phase === "invite" ? "You're invited" : phase === "live" ? "It's happening" : phase === "after" ? "The morning after" : "It dropped"}
      </p>
      <h1 className="display mt-3 break-words text-[clamp(2.5rem,11vw,6rem)]">{night.name}</h1>
      {hostedBy && <p className="mono mt-3 text-maize">Hosted by {hostedBy}</p>}
      {night.invite_media_key && phase !== "dropped" && (
        <div className="mt-6 overflow-hidden rounded-md border border-line bg-black">
          {night.invite_media_kind === "video" ? (
            <video src={mediaUrl(night.invite_media_key, env.MEDIA_PUBLIC_URL)} autoPlay muted loop playsInline controls preload="metadata" className="max-h-[70vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(night.invite_media_key, env.MEDIA_PUBLIC_URL)} alt="" className="max-h-[70vh] w-full object-contain" />
          )}
        </div>
      )}
      <p className="mt-4 text-lg leading-snug">{lede}</p>

      {(phase === "invite" || phase === "live") && !(verified && myRsvp) && (
        <section aria-labelledby="how-h" className="mt-6 rounded-md border border-line bg-night-2 p-4 sm:p-5">
          <h2 id="how-h" className="mono text-pink">How this works</h2>
          <ol className="mt-3 space-y-3">
            {[
              ["RSVP now", "Pick a name or nickname. No account, no app, no email."],
              ["On the night, use this same link", "Drop your photos and videos and write your side of the story."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="display grid h-8 w-8 shrink-0 place-items-center rounded-full bg-maize text-night">{i + 1}</span>
                <span>
                  <strong className="block leading-snug">{t}</strong>
                  <span className="text-sm text-dim">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {phase === "invite" && (
        <dl className="mt-6 grid gap-3 rounded-md border-2 border-dashed border-maize p-4 sm:grid-cols-2 sm:gap-4 sm:p-5">
          <div>
            <dt className="mono text-maize">When</dt>
            <dd className="mt-0.5 text-lg leading-snug">{timeFmt(night.opens_at)}</dd>
          </div>
          {night.location_text && (
            <div>
              <dt className="mono text-maize">Where</dt>
              <dd className="mt-0.5 text-lg leading-snug break-words">{night.location_text}</dd>
            </div>
          )}
          {night.dress_code && (
            <div>
              <dt className="mono text-maize">Dress code</dt>
              <dd className="mt-0.5 text-lg leading-snug">{night.dress_code}</dd>
            </div>
          )}
        </dl>
      )}

      {phase !== "invite" && (
        <p className="mt-3 text-dim">
          {formatDay(night.night_of)}
          {phase === "live" && ` · open until ${timeFmt(night.closes_at)}`}
        </p>
      )}

      {phase === "dropped" && post && (
        <Link
          href={`/posts/${post.slug}`}
          className="mt-8 flex min-h-16 items-center justify-between gap-4 rounded-md border-2 border-dashed border-maize p-5 text-lg hover:bg-night-2"
        >
          <span>The story is up.</span>
          <span className="font-bold text-maize underline underline-offset-4">Read it →</span>
        </Link>
      )}

      {client}

      {phase === "invite" && (
        <section className="mt-10 space-y-6">
          <div>
            <h2 className="mono text-maize">
              Who&apos;s coming{headcount ? ` (${headcount})` : ""}
              {spotsLeft !== null && <span className="text-dim"> · {spotsLeft ? `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left` : `full${waitlistCount ? `, ${waitlistCount} waitlisted` : ""}`}</span>}
            </h2>
            <p className="mt-2 text-lg">
              {going.length ? going.join(", ") : "Nobody yet. Be the first."}
              {maybe.length ? <span className="text-dim"> (maybe: {maybe.join(", ")})</span> : null}
            </p>
          </div>
          {night.invite_details && (
            <div>
              <h2 className="mono text-maize">The plan</h2>
              <p className="mt-2 whitespace-pre-line text-lg">{night.invite_details}</p>
            </div>
          )}
          {night.invite_rules && (
            <div>
              <h2 className="mono text-maize">Party rules</h2>
              <ol className="mt-2 space-y-1 text-lg">
                {night.invite_rules.split("\n").map((rule, i) => (
                  <li key={i} className="flex gap-3"><span className="display text-pink">{i + 1}</span><span>{rule}</span></li>
                ))}
              </ol>
            </div>
          )}
          <a
            href={`/api/drop/${token}/calendar`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-ink px-5 py-3 font-bold hover:border-maize hover:text-maize sm:w-auto"
          >
            Add to calendar
          </a>
        </section>
      )}
    </article>
  );
}
