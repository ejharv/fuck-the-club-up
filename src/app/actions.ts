"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { cf } from "@/lib/env";
import { toEmbed } from "@/lib/embeds";
import { ALLOWED_TYPES, MAX_BYTES, MAX_FILES_PER_POST, type FileKind } from "@/lib/media-rules";
import { clean, insertPostStatements, validatePostFields, type MediaInsert, type PostFieldsInput } from "@/lib/post-fields";
import { safePath } from "@/lib/safe-path";
import { NotAllowed, requireAdmin, requireMember } from "@/lib/session";

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safePath(formData.get("next")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export type ActionResult = { error: string } | undefined;

export type NewPostInput = PostFieldsInput & {
  media: Array<{ key?: string; url?: string; caption?: string }>;
  coverKey?: string;
};

/**
 * Every file must be an upload this member made, actually present in R2, and
 * still matching the type and size it was signed for. Links must be embeds we
 * allow. Used by new posts and by adding media to an existing post.
 */
async function verifyNewMedia(
  env: CloudflareEnv,
  email: string,
  items: Array<{ key?: string; url?: string; caption?: string }>,
): Promise<{ media: MediaInsert[] } | { error: string }> {
  const media: MediaInsert[] = [];
  for (const item of items) {
    const caption = clean(item.caption, 300);
    if (item.url) {
      const embed = toEmbed(item.url);
      if (!embed) return { error: "Links must be YouTube, Spotify or SoundCloud." };
      media.push({ kind: "embed", key: null, url: item.url.trim(), type: null, caption });
      continue;
    }
    if (!item.key) return { error: "One of the files didn't upload. Remove it and try again." };
    const upload = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0")
      .bind(item.key, email)
      .first<{ kind: FileKind; content_type: string }>();
    const head = upload ? await env.MEDIA.head(item.key) : null;
    if (!upload || !head) return { error: "One of the files didn't upload. Remove it and try again." };
    const actualType = head.httpMetadata?.contentType?.toLowerCase();
    if (actualType !== upload.content_type || !ALLOWED_TYPES[upload.content_type] || head.size > MAX_BYTES[upload.kind]) {
      await env.MEDIA.delete(item.key);
      return { error: "One of the files didn't match what was uploaded. Remove it and try again." };
    }
    media.push({ kind: upload.kind, key: item.key, url: null, type: upload.content_type, caption });
  }
  return { media };
}

export async function createPost(input: NewPostInput): Promise<ActionResult> {
  let slug: string;
  try {
    const member = await requireMember();
    const env = await cf();

    const fields = validatePostFields(input);
    if ("error" in fields) return fields;
    if (!Array.isArray(input.media) || input.media.length > MAX_FILES_PER_POST) {
      return { error: `Posts can have up to ${MAX_FILES_PER_POST} photos, videos, tracks and links.` };
    }

    const verified = await verifyNewMedia(env, member.email, input.media);
    if ("error" in verified) return verified;
    const media = verified.media;

    const firstPhoto = media.find((m) => m.kind === "photo")?.key ?? null;
    const coverKey = media.some((m) => m.kind === "photo" && m.key === input.coverKey) ? input.coverKey! : firstPhoto;

    const insert = insertPostStatements(env.DB, fields, media, coverKey, member.email);
    slug = insert.slug;
    await env.DB.batch([
      ...insert.stmts,
      ...media
        .filter((m) => m.key)
        .map((m) => env.DB.prepare("UPDATE uploads SET used = 1 WHERE r2_key = ?").bind(m.key)),
    ]);
  } catch (e) {
    if (e instanceof NotAllowed) return { error: e.message };
    throw e;
  }
  revalidatePath("/");
  redirect(`/posts/${slug}`);
}

/** Author or admin. Returns the post's id and author. */
async function requirePostEditor(postId: string) {
  const member = await requireMember();
  const env = await cf();
  const post = await env.DB.prepare("SELECT id, slug, author_email FROM posts WHERE id = ?")
    .bind(postId)
    .first<{ id: string; slug: string; author_email: string }>();
  if (!post) throw new NotAllowed("That post doesn't exist anymore.");
  if (post.author_email !== member.email && member.role !== "admin") {
    throw new NotAllowed("Only the person who posted this, or an admin, can change it.");
  }
  return { env, member, post };
}

export type EditPostInput = PostFieldsInput & {
  id: string;
  media: Array<{ id: string; caption?: string }>;
  removeMediaIds: string[];
  coverMediaId?: string | null;
  /** New uploads (keys from /api/uploads) and links to add at the end. */
  addMedia?: Array<{ key?: string; url?: string; caption?: string }>;
  /** Use one of the new uploads as the cover. */
  coverNewKey?: string | null;
};

export async function updatePost(input: EditPostInput): Promise<ActionResult> {
  let slug: string;
  try {
    const { env, post, member } = await requirePostEditor(String(input.id));
    slug = post.slug;
    const fields = validatePostFields(input);
    if ("error" in fields) return fields;
    const adding = Array.isArray(input.addMedia) ? input.addMedia : [];

    const { results: existing } = await env.DB.prepare("SELECT id, kind, r2_key FROM media WHERE post_id = ?")
      .bind(post.id)
      .all<{ id: string; kind: string; r2_key: string | null }>();
    const byId = new Map(existing.map((m) => [m.id, m]));
    const remove = (input.removeMediaIds ?? []).filter((id) => byId.has(id));
    const keep = existing.filter((m) => !remove.includes(m.id));
    if (keep.length + adding.length > MAX_FILES_PER_POST) {
      return { error: `Posts can have up to ${MAX_FILES_PER_POST} photos, videos, tracks and links.` };
    }
    const added = await verifyNewMedia(env, member.email, adding);
    if ("error" in added) return added;
    const newCover = added.media.find((m) => m.kind === "photo" && m.key === input.coverNewKey);
    const coverKey =
      newCover?.key ??
      (keep.find((m) => m.id === input.coverMediaId && m.kind === "photo") ?? keep.find((m) => m.kind === "photo"))?.r2_key ??
      added.media.find((m) => m.kind === "photo")?.key ??
      null;
    const maxPos = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS p FROM media WHERE post_id = ?").bind(post.id).first<{ p: number }>();

    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE posts SET title = ?, dek = ?, section = ?, night = ?, night_of = ?, damage = ?, ride_home = ?, body = ?,
                          cover_key = ?, updated_at = ? WHERE id = ?`,
      ).bind(fields.title, fields.dek, fields.section, fields.night, fields.nightOf, fields.damage, fields.rideHome,
        fields.body, coverKey, now, post.id),
      ...(input.media ?? [])
        .filter((m) => byId.has(m.id) && !remove.includes(m.id))
        .map((m) => env.DB.prepare("UPDATE media SET caption = ? WHERE id = ? AND post_id = ?").bind(clean(m.caption, 300), m.id, post.id)),
      ...remove.map((id) => env.DB.prepare("DELETE FROM media WHERE id = ? AND post_id = ?").bind(id, post.id)),
      ...added.media.map((m, i) =>
        env.DB.prepare(
          "INSERT INTO media (id, post_id, position, kind, r2_key, url, content_type, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), post.id, (maxPos?.p ?? -1) + 1 + i, m.kind, m.key, m.url, m.type, m.caption),
      ),
      ...added.media
        .filter((m) => m.key)
        .map((m) => env.DB.prepare("UPDATE uploads SET used = 1 WHERE r2_key = ?").bind(m.key)),
    ]);
    const keys = remove.map((id) => byId.get(id)!.r2_key).filter((k): k is string => Boolean(k));
    if (keys.length) await env.MEDIA.delete(keys);
  } catch (e) {
    if (e instanceof NotAllowed) return { error: e.message };
    throw e;
  }
  revalidatePath("/");
  revalidatePath(`/posts/${slug}`);
  redirect(`/posts/${slug}`);
}

async function adminPost(postId: string) {
  await requireAdmin();
  const env = await cf();
  const post = await env.DB.prepare("SELECT id, slug FROM posts WHERE id = ?").bind(postId).first<{ id: string; slug: string }>();
  if (!post) throw new NotAllowed("That post doesn't exist anymore.");
  return post;
}

/** Fast takedown of one photo/video/track from a published post. */
export async function deleteMedia(formData: FormData): Promise<void> {
  const mediaId = String(formData.get("mediaId") ?? "");
  const env = await cf();
  const row = await env.DB.prepare("SELECT post_id, r2_key FROM media WHERE id = ?")
    .bind(mediaId)
    .first<{ post_id: string; r2_key: string | null }>();
  if (!row) return;
  const takedownId = formData.get("takedownId");
  const { post } = takedownId ? { post: await adminPost(row.post_id) } : await requirePostEditor(row.post_id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM media WHERE id = ?").bind(mediaId),
    env.DB.prepare("UPDATE posts SET cover_key = NULL WHERE id = ? AND cover_key = ?").bind(post.id, row.r2_key),
  ]);
  if (row.r2_key) await env.MEDIA.delete(row.r2_key);
  if (takedownId) {
    await env.DB.prepare("UPDATE takedown_requests SET status = 'done', resolved_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), String(takedownId))
      .run();
  }
  revalidatePath(`/posts/${post.slug}`);
  revalidatePath("/takedowns");
}

export async function deletePost(formData: FormData): Promise<void> {
  const member = await requireMember();
  const env = await cf();
  const id = String(formData.get("id") ?? "");
  const post = await env.DB.prepare("SELECT author_email FROM posts WHERE id = ?").bind(id).first<{ author_email: string }>();
  if (!post) return;
  if (post.author_email !== member.email && member.role !== "admin") {
    throw new NotAllowed("Only the person who posted this, or an admin, can delete it.");
  }
  const { results } = await env.DB.prepare("SELECT r2_key FROM media WHERE post_id = ? AND r2_key IS NOT NULL")
    .bind(id)
    .all<{ r2_key: string }>();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM media WHERE post_id = ?").bind(id),
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id),
  ]);
  if (results.length) await env.MEDIA.delete(results.map((r) => r.r2_key));
  revalidatePath("/");
  redirect("/");
}

export async function addMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = formData.get("role") === "admin" ? "admin" : "crew";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the Google email your friend signs in with." };
    const env = await cf();
    await env.DB.prepare(
      `INSERT INTO members (email, role, added_by) VALUES (?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET role = excluded.role`,
    )
      .bind(email, role, admin.email)
      .run();
  } catch (e) {
    if (e instanceof NotAllowed) return { error: e.message };
    throw e;
  }
  revalidatePath("/crew");
}

export async function removeMember(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").toLowerCase();
  if (email === admin.email) throw new NotAllowed("You can't remove yourself.");
  const env = await cf();
  await env.DB.prepare("DELETE FROM members WHERE email = ?").bind(email).run();
  revalidatePath("/crew");
}
