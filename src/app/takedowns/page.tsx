import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteMedia } from "@/app/actions";
import { cf } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/media-url";
import { currentMember } from "@/lib/session";
import { resolveTakedown } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Takedowns", robots: { index: false } };

export default async function TakedownsPage() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/takedowns");
  if (me.role !== "admin") redirect("/");
  const env = await cf();
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.contact, t.reason, t.created_at, t.media_id, p.slug, p.title, m.r2_key, m.kind
       FROM takedown_requests t JOIN posts p ON p.id = t.post_id LEFT JOIN media m ON m.id = t.media_id
      WHERE t.status = 'open' ORDER BY t.created_at`,
  ).all<{ id: string; contact: string | null; reason: string | null; created_at: string; media_id: string | null; slug: string; title: string; r2_key: string | null; kind: string | null }>();

  return (
    <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-6">
      <h1 className="display text-[clamp(3rem,9vw,5rem)]">Takedowns</h1>
      <p className="mt-3 text-dim">{results.length ? `${results.length} open ${results.length === 1 ? "request" : "requests"}, oldest first.` : "Requests from the takedown form show up here."}</p>
      {results.length ? (
        <ul className="mt-6 space-y-4">
          {results.map((t) => (
            <li key={t.id} className="rounded-md border border-line bg-night-2 p-4 sm:p-5">
              <p className="mono text-dim">{formatDate(t.created_at)}</p>
              <p className="mt-1">
                On <Link href={`/posts/${t.slug}`} className="font-bold text-maize underline underline-offset-4">{t.title}</Link>
              </p>
              {t.r2_key && t.kind === "photo" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(t.r2_key, env.MEDIA_PUBLIC_URL)} alt="" className="mt-3 h-40 max-w-full rounded object-cover" />
              )}
              {t.reason && <p className="mt-3 whitespace-pre-line break-words">{t.reason}</p>}
              {t.contact && <p className="mt-2 break-all text-dim">Contact: {t.contact}</p>}
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
                {t.media_id && (
                  <form action={deleteMedia} className="grid">
                    <input type="hidden" name="mediaId" value={t.media_id} />
                    <input type="hidden" name="takedownId" value={t.id} />
                    <button className="min-h-11 rounded-full bg-pink px-5 font-bold text-night">Remove the file</button>
                  </form>
                )}
                <form action={resolveTakedown} className="grid">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="min-h-11 rounded-full border border-ink px-5 font-bold hover:border-maize hover:text-maize">Mark done</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-dim">No open requests.</p>
      )}
    </section>
  );
}
