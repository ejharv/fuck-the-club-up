import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { decryptText } from "@/lib/crypto";
import { mePass } from "@/lib/nights";
import { mediaUrl } from "@/lib/media-url";
import { cf } from "@/lib/env";
import { formatDay } from "@/lib/format";
import { getNight, latestDraft, parseVenues, phaseOf } from "@/lib/nights";
import { nightRole } from "@/lib/hosting";
import { signedInEmail } from "@/lib/session";
import { LIMITS } from "@/lib/synthesis";
import { NightAdmin } from "./NightAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Night", robots: { index: false }, referrer: "no-referrer" };

export default async function NightAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ link?: string }>;
}) {
  const { id } = await params;
  if (!(await signedInEmail())) redirect(`/login?next=/nights/${id}`);
  const access = await nightRole(id);
  if (!access) redirect("/");
  const night = await getNight(id);
  if (!night) notFound();
  await searchParams;
  const tokenRow = await (await cf()).DB.prepare("SELECT token_enc FROM nights WHERE id = ?").bind(id).first<{ token_enc: string | null }>();
  const link = await decryptText((await cf()).AUTH_SECRET, tokenRow?.token_enc ?? null);
  const env = await cf();
  const DB = env.DB;

  const [uploads, accounts, rsvps, draft, post, hosts] = await Promise.all([
    DB.prepare(
      "SELECT r2_key, kind, nickname, decision, caption, is_cover, size FROM night_uploads WHERE night_id = ? AND uploaded = 1 ORDER BY created_at",
    )
      .bind(id)
      .all<{ r2_key: string; kind: string; nickname: string | null; decision: string; caption: string | null; is_cover: number; size: number }>(),
    DB.prepare("SELECT device_id, nickname, body, updated_at FROM night_accounts WHERE night_id = ? ORDER BY updated_at")
      .bind(id)
      .all<{ device_id: string; nickname: string; body: string; updated_at: string }>(),
    DB.prepare("SELECT device_id, nickname, answer, plus_ones, waitlisted FROM night_rsvps WHERE night_id = ? ORDER BY created_at")
      .bind(id)
      .all<{ device_id: string; nickname: string; answer: string; plus_ones: number; waitlisted: number }>(),
    latestDraft(id),
    night.post_id ? DB.prepare("SELECT slug FROM posts WHERE id = ?").bind(night.post_id).first<{ slug: string }>() : null,
    DB.prepare("SELECT email, display_name FROM night_hosts WHERE night_id = ? ORDER BY created_at").bind(id).all<{ email: string; display_name: string | null }>(),
  ]);
  const guestPlaces = await DB.prepare("SELECT id, name, url, kind FROM night_places WHERE night_id = ? ORDER BY created_at")
    .bind(id)
    .all<{ id: string; name: string; url: string | null; kind: string }>();
  const guestSongs = await DB.prepare("SELECT id, title, artist, NULL AS url FROM night_songs WHERE night_id = ? ORDER BY created_at")
    .bind(id)
    .all<{ id: string; title: string; artist: string | null; url: string | null }>();

  let review = { approvals: 0, notes: [] as Array<{ nickname: string | null; body: string }> };
  if (draft) {
    const [ap, notes] = await Promise.all([
      DB.prepare(
        "SELECT COUNT(*) AS n FROM night_approvals a JOIN night_accounts c ON c.night_id = a.night_id AND c.device_id = a.device_id WHERE a.night_id = ? AND a.version = ?",
      )
        .bind(id, draft.version)
        .first<{ n: number }>(),
      DB.prepare("SELECT nickname, body FROM night_notes WHERE night_id = ? AND version = ? ORDER BY created_at")
        .bind(id, draft.version)
        .all<{ nickname: string | null; body: string }>(),
    ]);
    review = { approvals: ap?.n ?? 0, notes: notes.results };
  }

  const phase = phaseOf(night);
  return (
    <section className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
      <p className="mono text-pink">
        <Link href="/nights" className="hover:text-ink">Nights</Link> / {formatDay(night.night_of)}
      </p>
      <h1 className="display mt-3 text-[clamp(2.5rem,8vw,5rem)]">{night.name}</h1>
      {post && (
        <p className="mt-4 rounded-md border-2 border-dashed border-maize p-4">
          Dropped.{" "}
          <Link href={`/posts/${post.slug}`} className="font-bold text-maize underline underline-offset-4">See the post</Link>
          {" "}(edit it there).
        </p>
      )}
      <NightAdmin
        night={{
          id: night.id,
          status: night.status,
          phase,
          opensAt: night.opens_at,
          closesAt: night.closes_at,
          albumOpen: Boolean(night.album_open),
          dropAt: night.drop_at,
          generations: night.generations,
          maxGenerations: LIMITS.generationsPerNight,
          hasPost: Boolean(night.post_id),
        }}
        invite={{
          name: night.name,
          opensAt: night.opens_at,
          closesAt: night.closes_at,
          location: night.location_text ?? "",
          dressCode: night.dress_code ?? "",
          details: night.invite_details ?? "",
          rules: night.invite_rules ?? "",
          mediaUrl: night.invite_media_key ? mediaUrl(night.invite_media_key, env.MEDIA_PUBLIC_URL) : null,
          mediaKind: night.invite_media_kind,
          ogSig: night.og_sig,
        }}
        freshLink={link ?? null}
        uploads={uploads.results.map((u) => ({ ...u, src: `/api/nights/${id}/file/${u.r2_key}` }))}
        accounts={accounts.results}
        rsvps={await Promise.all(
          rsvps.results.map(async (r) => ({ ...r, mePath: link ? `/drop/${link}/me/${await mePass(env.AUTH_SECRET, night.id, r.device_id)}` : null })),
        )}
        guestLimits={{ capacity: night.capacity, maxPlusOnes: night.max_plus_ones }}
        isAdmin={access.role === "admin"}
        hosts={hosts.results.map((h) => ({ email: h.email, name: h.display_name ?? "" }))}
        me={access.email}
        guestSongs={guestSongs.results}
        guestPlaces={guestPlaces.results}
        draft={draft}
        draftBody={draft ? <Markdown>{draft.body}</Markdown> : null}
        review={review}
        venues={parseVenues(night.venues)}
      />
    </section>
  );
}
