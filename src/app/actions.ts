"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { cf } from "@/lib/env";
import { toEmbed } from "@/lib/embeds";
import { ALLOWED_TYPES, MAX_BYTES, MAX_FILES_PER_POST, type FileKind } from "@/lib/media-rules";
import { safePath } from "@/lib/safe-path";
import { sectionBySlug } from "@/lib/sections";
import { NotAllowed, requireAdmin, requireMember } from "@/lib/session";

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safePath(formData.get("next")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export type ActionResult = { error: string } | undefined;

export type NewPostInput = {
  title: string;
  dek?: string;
  section: string;
  night?: string;
  damage?: string;
  rideHome?: string;
  body: string;
  /** House rule 1: everyone named or shown agreed. */
  consent: boolean;
  media: Array<{ key?: string; url?: string; caption?: string }>;
  coverKey?: string;
};

const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s.slice(0, max) : null;
};

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${base || "post"}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createPost(input: NewPostInput): Promise<ActionResult> {
  let slug: string;
  try {
    const member = await requireMember();
    const env = await cf();

    const title = clean(input.title, 140);
    const body = clean(input.body, 60_000);
    if (!title) return { error: "Give the post a title." };
    if (!body) return { error: "Write the post before publishing it." };
    const section = sectionBySlug(String(input.section ?? ""))?.slug;
    if (!section) return { error: "Pick a section for the post." };
    const rideHome = clean(input.rideHome, 160);
    if (section === "night-reports" && !rideHome) return { error: "Night reports have to say how everyone got home." };
    if (input.consent !== true) {
      return { error: "Confirm that everyone named or shown in this post said yes. Use nicknames for anyone who didn't." };
    }
    if (!Array.isArray(input.media) || input.media.length > MAX_FILES_PER_POST) {
      return { error: `Posts can have up to ${MAX_FILES_PER_POST} photos, videos, tracks and links.` };
    }

    // Every file must be an upload this member made, actually present in R2,
    // and still matching the type and size it was signed for.
    const media: Array<{ kind: string; key: string | null; url: string | null; type: string | null; caption: string | null }> = [];
    for (const item of input.media) {
      const caption = clean(item.caption, 300);
      if (item.url) {
        const embed = toEmbed(item.url);
        if (!embed) return { error: "Links must be YouTube, Spotify or SoundCloud." };
        media.push({ kind: "embed", key: null, url: item.url.trim(), type: null, caption });
        continue;
      }
      if (!item.key) return { error: "One of the files didn't upload. Remove it and try again." };
      const upload = await env.DB.prepare(
        "SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0",
      )
        .bind(item.key, member.email)
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

    const firstPhoto = media.find((m) => m.kind === "photo")?.key ?? null;
    const coverKey = media.some((m) => m.kind === "photo" && m.key === input.coverKey) ? input.coverKey! : firstPhoto;

    const id = crypto.randomUUID();
    slug = slugify(title);
    const now = new Date().toISOString();
    const stmts = [
      env.DB.prepare(
        `INSERT INTO posts (id, slug, title, dek, section, night, damage, ride_home, body, cover_key,
                            author_email, author_name, published_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id, slug, title, clean(input.dek, 200), section, clean(input.night, 80), clean(input.damage, 80),
        rideHome, body, coverKey, member.email, member.name, now, now,
      ),
      ...media.map((m, i) =>
        env.DB.prepare(
          "INSERT INTO media (id, post_id, position, kind, r2_key, url, content_type, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), id, i, m.kind, m.key, m.url, m.type, m.caption),
      ),
      ...media
        .filter((m) => m.key)
        .map((m) => env.DB.prepare("UPDATE uploads SET used = 1 WHERE r2_key = ?").bind(m.key)),
    ];
    await env.DB.batch(stmts);
  } catch (e) {
    if (e instanceof NotAllowed) return { error: e.message };
    throw e;
  }
  revalidatePath("/");
  redirect(`/posts/${slug}`);
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
