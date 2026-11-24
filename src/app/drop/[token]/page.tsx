import type { Metadata } from "next";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { dropContext } from "@/lib/drop-context";
import { formatDay } from "@/lib/format";
import { latestDraft, listAlbum, phaseOf } from "@/lib/nights";
import { DropClient } from "./DropClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're invited", robots: { index: false, follow: false }, referrer: "no-referrer" };

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

  const [rsvps, mine, album, draft, accountCount, post] = await Promise.all([
    DB.prepare("SELECT device_id, nickname, answer FROM night_rsvps WHERE night_id = ? ORDER BY updated_at")
      .bind(night.id)
      .all<{ device_id: string; nickname: string; answer: string }>(),
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
  const going = rsvps.results.filter((r) => r.answer === "going").map((r) => r.nickname);
  const maybe = rsvps.results.filter((r) => r.answer === "maybe").map((r) => r.nickname);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <p className="mono text-pink">
        {phase === "invite" ? "You're invited" : phase === "live" ? "It's happening" : phase === "after" ? "The morning after" : "It dropped"}
      </p>
      <h1 className="display mt-3 text-[clamp(2.75rem,11vw,6rem)]">{night.name}</h1>

      {phase === "invite" && (
        <dl className="mt-8 grid gap-4 rounded-md border-2 border-dashed border-maize p-5 sm:grid-cols-2">
          <div>
            <dt className="mono text-maize">When</dt>
            <dd className="mt-1 text-lg">{timeFmt(night.opens_at)}</dd>
          </div>
          {night.location_text && (
            <div>
              <dt className="mono text-maize">Where</dt>
              <dd className="mt-1 text-lg">{night.location_text}</dd>
            </div>
          )}
          {night.dress_code && (
            <div>
              <dt className="mono text-maize">Dress code</dt>
              <dd className="mt-1 text-lg">{night.dress_code}</dd>
            </div>
          )}
          <div>
            <dt className="mono text-maize">Coming</dt>
            <dd className="mt-1 text-lg">
              {going.length ? going.join(", ") : "Be the first"}
              {maybe.length ? <span className="text-dim"> (maybe: {maybe.join(", ")})</span> : null}
            </dd>
          </div>
        </dl>
      )}
      {phase === "invite" && night.invite_details && <p className="mt-6 whitespace-pre-line text-lg">{night.invite_details}</p>}
      {phase === "invite" && (
        <p className="mt-4">
          <a href={`/api/drop/${token}/calendar`} className="mono text-maize underline underline-offset-4">
            Add to calendar
          </a>
        </p>
      )}

      {phase !== "invite" && (
        <p className="mt-4 text-dim">
          {formatDay(night.night_of)}
          {phase === "live" && ` · photos and accounts open until ${timeFmt(night.closes_at)}`}
        </p>
      )}

      {phase === "dropped" && post && (
        <p className="mt-8 rounded-md border-2 border-dashed border-maize p-5 text-lg">
          The story is up.{" "}
          <Link href={`/posts/${post.slug}`} className="font-bold text-maize underline underline-offset-4">
            Read it
          </Link>
        </p>
      )}

      <DropClient
        token={token}
        phase={phase}
        verified={verified}
        siteKey={env.TURNSTILE_SITE_KEY}
        rsvp={myRsvp ? { nickname: myRsvp.nickname, answer: myRsvp.answer } : null}
        account={mine ?? null}
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
    </article>
  );
}
