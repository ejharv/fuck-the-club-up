import Link from "next/link";
import { redirect } from "next/navigation";
import { cf } from "@/lib/env";
import { InviteCard } from "@/components/InviteCard";
import { mediaUrl } from "@/lib/media-url";
import { formatDay } from "@/lib/format";
import { phaseOf, type Night } from "@/lib/nights";
import { isAnyHost } from "@/lib/hosting";
import { currentMember, signedInEmail } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nights", robots: { index: false } };

const phaseLabel = { invite: "Invite out", live: "Live: collecting", after: "Ready to review", dropped: "Dropped" } as const;

export default async function NightsPage() {
  const email = await signedInEmail();
  if (!email) redirect("/login?next=/nights");
  const me = await currentMember();
  const isAdmin = me?.role === "admin";
  if (!isAdmin && !(await isAnyHost(email))) redirect("/");
  const env = await cf();
  const { results } = await env.DB.prepare(
    `SELECT n.*, (SELECT COUNT(*) FROM night_uploads u WHERE u.night_id = n.id AND u.uploaded = 1) AS files,
            (SELECT COUNT(*) FROM night_accounts a WHERE a.night_id = n.id) AS accounts,
            (SELECT COALESCE(SUM(1 + r.plus_ones), 0) FROM night_rsvps r WHERE r.night_id = n.id AND r.answer = 'going' AND r.waitlisted = 0) AS going
       FROM nights n
      WHERE ?1 = 1 OR EXISTS (SELECT 1 FROM night_hosts h WHERE h.night_id = n.id AND h.email = ?2)
      ORDER BY n.night_of DESC, n.created_at DESC`,
  )
    .bind(isAdmin ? 1 : 0, email)
    .all<Night & { files: number; accounts: number; going: number }>();

  return (
    <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[clamp(3rem,9vw,5.5rem)]">Nights</h1>
        {isAdmin && <Link href="/nights/new" className="inline-flex min-h-12 items-center rounded-full bg-maize px-6 font-bold text-night hover:bg-ink">
          New night
        </Link>}
      </div>
      {isAdmin && <nav aria-label="Admin" className="mono mt-4 flex flex-wrap gap-x-2 text-maize">
        <Link href="/crew" className="-ml-2 inline-flex min-h-11 items-center px-2 underline underline-offset-4">Crew and invites</Link>
        <Link href="/site" className="inline-flex min-h-11 items-center px-2 underline underline-offset-4">Edit site</Link>
        <Link href="/takedowns" className="inline-flex min-h-11 items-center px-2 underline underline-offset-4">Takedowns</Link>
      </nav>}
      <p className="mt-2 max-w-xl text-dim">
        Each night gets one link: an invite before, a photo drop and everyone&apos;s story during and after, then the post.
      </p>
      {/* Redraws any out-of-date link-preview card in the background, so opening this page is enough. */}
      {results.map((n) => (
        <InviteCard
          key={`card-${n.id}`}
          nightId={n.id}
          name={n.name}
          opensAt={n.opens_at}
          mediaUrl={n.invite_media_key ? mediaUrl(n.invite_media_key, env.MEDIA_PUBLIC_URL) : null}
          mediaKind={n.invite_media_kind}
          storedSig={n.og_sig}
        />
      ))}
      {results.length ? (
        <ul className="mt-8 border-t border-line">
          {results.map((n) => (
            <li key={n.id} className="border-b border-line">
              <Link href={`/nights/${n.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-4 hover:text-maize sm:grid-cols-[8rem_1fr_auto_auto] sm:gap-x-6 sm:py-5">
                <span className="mono col-start-1 text-maize">{formatDay(n.night_of)}</span>
                <span className="display col-start-1 text-2xl sm:col-start-2 sm:row-start-1">{n.name}</span>
                <span className="col-start-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim sm:col-start-3 sm:row-start-1">
                  <span className={`mono rounded border px-1.5 py-0.5 ${phaseOf(n) === "after" && n.status !== "reviewing" ? "border-maize text-maize" : phaseOf(n) === "live" ? "border-pink text-pink" : "border-line text-dim"}`}>
                    {n.status === "reviewing" ? "Drop scheduled" : phaseLabel[phaseOf(n)]}
                  </span>
                  <span>{n.going} going · {n.files} files · {n.accounts} {n.accounts === 1 ? "story" : "stories"}</span>
                </span>
                <span aria-hidden className="col-start-2 row-span-3 row-start-1 text-2xl text-dim group-hover:text-maize sm:col-start-4 sm:row-span-1">›</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-dim">No nights yet. Start one and send the link to the group chat.</p>
      )}
    </section>
  );
}
