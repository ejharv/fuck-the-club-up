import "server-only";
import { MEDIA_RE, PHOTO_RE, cleanMarkers, uploadShortId } from "./inline-media";
import { collectionStatements } from "./collections";
import { insertPostStatements, type MediaInsert, type PostFields } from "./post-fields";
import type { Song } from "./tracks";
import type { Venue } from "./venues";
import { ALLOWED_TYPES } from "./media-rules";

/**
 * Publishing a night: copy kept files from the private INBOX to public MEDIA,
 * then insert the post. On the Workers free plan every R2/D1 call counts
 * toward 50 subrequests per request, so files are copied in batches, each in
 * its own request to this Worker (WORKER_SELF_REFERENCE). Locally, and as a
 * fallback, batches run inline.
 */

export const COPY_BATCH = 8; // ~2 R2 calls per file + 3 D1 calls stays well under 50

export const GUEST_MAX_BYTES = { photo: 25 * 1048576, video: 200 * 1048576, audio: 60 * 1048576 } as const;

export type DropFields = PostFields & { authorEmail: string; venues?: Venue[]; songs?: Song[] };

/** Copies up to COPY_BATCH kept files. Returns how many are left. */
export async function copyBatch(env: CloudflareEnv, nightId: string): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT r2_key, kind, content_type, size FROM night_uploads
      WHERE night_id = ? AND uploaded = 1 AND decision = 'keep' AND copied_key IS NULL
      ORDER BY created_at LIMIT ?`,
  )
    .bind(nightId, COPY_BATCH)
    .all<{ r2_key: string; kind: "photo" | "video" | "audio"; content_type: string; size: number }>();

  const updates: D1PreparedStatement[] = [];
  for (const u of results) {
    const obj = await env.INBOX.get(u.r2_key);
    const type = obj?.httpMetadata?.contentType?.toLowerCase();
    if (!obj || type !== u.content_type || !ALLOWED_TYPES[u.content_type] || obj.size > GUEST_MAX_BYTES[u.kind]) {
      // Missing or doesn't match what was signed: leave it out of the post.
      updates.push(env.DB.prepare("UPDATE night_uploads SET decision = 'toss' WHERE r2_key = ?").bind(u.r2_key));
      continue;
    }
    const dst = `media/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ALLOWED_TYPES[u.content_type].ext}`;
    await env.MEDIA.put(dst, obj.body, { httpMetadata: { contentType: u.content_type } });
    updates.push(env.DB.prepare("UPDATE night_uploads SET copied_key = ? WHERE r2_key = ?").bind(dst, u.r2_key));
  }
  if (updates.length) await env.DB.batch(updates);

  const left = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM night_uploads WHERE night_id = ? AND uploaded = 1 AND decision = 'keep' AND copied_key IS NULL",
  )
    .bind(nightId)
    .first<{ n: number }>();
  return left?.n ?? 0;
}

/** Inserts the post from copied files and marks the night dropped. Idempotent. */
export async function finishDrop(env: CloudflareEnv, nightId: string): Promise<string | null> {
  const night = await env.DB.prepare("SELECT status, night_of, drop_fields, post_id FROM nights WHERE id = ?")
    .bind(nightId)
    .first<{ status: string; night_of: string; drop_fields: string | null; post_id: string | null }>();
  if (!night || !night.drop_fields) return null;
  if (night.post_id) return night.post_id;
  const f = JSON.parse(night.drop_fields) as DropFields;

  const { results: files } = await env.DB.prepare(
    `SELECT r2_key, copied_key, kind, content_type, caption, is_cover FROM night_uploads
      WHERE night_id = ? AND decision = 'keep' AND copied_key IS NOT NULL ORDER BY created_at`,
  )
    .bind(nightId)
    .all<{ r2_key: string; copied_key: string; kind: string; content_type: string; caption: string | null; is_cover: number }>();
  const media: MediaInsert[] = files.map((m) => ({ kind: m.kind, key: m.copied_key, url: null, type: m.content_type, caption: m.caption }));
  const cover = files.find((m) => m.is_cover && m.kind === "photo")?.copied_key ?? files.find((m) => m.kind === "photo")?.copied_key ?? null;

  // Media ids are made here so photos placed in the story ([[photo:…]]) can point at them ([[media:…]]).
  const ids = files.map(() => crypto.randomUUID());
  const byShort = new Map(files.map((m, i) => [uploadShortId(m.r2_key), ids[i]]));
  const body = cleanMarkers(
    f.body.replace(PHOTO_RE, (_m, s: string) => (byShort.has(s) ? `[[media:${byShort.get(s)}]]` : "")),
    MEDIA_RE,
    new Set(ids),
    "media",
  );
  const insert = insertPostStatements(env.DB, { ...f, body, nightOf: night.night_of }, media, cover, f.authorEmail, ids);
  const collections = await collectionStatements(env.DB, insert.id, f.venues ?? [], f.songs ?? [], insert.mediaRows);
  await env.DB.batch([
    ...insert.stmts,
    ...collections,
    env.DB.prepare("UPDATE nights SET status = 'dropped', post_id = ?, drop_at = NULL WHERE id = ? AND post_id IS NULL").bind(insert.id, nightId),
  ]);
  return insert.id;
}

/** Runs a whole drop: batches through the self binding when it's there, inline otherwise. */
export async function runDrop(env: CloudflareEnv, nightId: string): Promise<string | null> {
  await env.DB.prepare("UPDATE nights SET status = 'dropping' WHERE id = ? AND status != 'dropped'").bind(nightId).run();
  const self = (env as unknown as { WORKER_SELF_REFERENCE?: Fetcher }).WORKER_SELF_REFERENCE;
  let useSelf = Boolean(self && (env.CRON_SECRET ?? "").length >= 16);
  for (let i = 0; i < 60; i++) {
    let left: number | null = null;
    if (useSelf) {
      let res: Response | null = null;
      try {
        res = await self!.fetch("https://self.internal/api/internal/drop-batch", {
          method: "POST",
          headers: { "x-cron-secret": env.CRON_SECRET!, "content-type": "application/json" },
          body: JSON.stringify({ nightId }),
        });
      } catch (e) {
        // `next dev` has no running Worker behind the binding: copy inline instead.
        console.warn("self binding unreachable, copying inline", e);
        useSelf = false;
      }
      if (res && !res.ok) throw new Error(`drop batch failed: ${res.status}`);
      if (res) left = ((await res.json()) as { left: number }).left;
    }
    if (left === null) left = await copyBatch(env, nightId);
    if (left === 0) break;
  }
  return finishDrop(env, nightId);
}
