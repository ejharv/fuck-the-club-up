import "server-only";
import { cf } from "./env";
import type { MediaKind } from "./media-rules";

export type Role = "admin" | "crew";
export type Member = { email: string; name: string | null; image: string | null; role: Role; created_at: string };

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  dek: string | null;
  section: string;
  night: string | null;
  damage: string | null;
  ride_home: string | null;
  body: string;
  cover_key: string | null;
  placeholder: number;
  author_email: string;
  author_name: string | null;
  published_at: string;
};

export type MediaRow = {
  id: string;
  kind: MediaKind;
  r2_key: string | null;
  url: string | null;
  content_type: string | null;
  caption: string | null;
};

export async function getMember(email: string | null | undefined): Promise<Member | null> {
  if (!email) return null;
  const { DB } = await cf();
  return DB.prepare("SELECT email, name, image, role, created_at FROM members WHERE email = ?")
    .bind(email.toLowerCase())
    .first<Member>();
}

export async function listMembers(): Promise<Member[]> {
  const { DB } = await cf();
  const { results } = await DB.prepare(
    "SELECT email, name, image, role, created_at FROM members ORDER BY role, created_at",
  ).all<Member>();
  return results;
}

const LIST_COLUMNS = `id, slug, title, dek, section, night, damage, ride_home, '' AS body, cover_key,
  placeholder, author_email, author_name, published_at`;

/** Newest first, optionally limited to one section. */
export async function listPosts({ section, limit = 60 }: { section?: string; limit?: number } = {}): Promise<PostRow[]> {
  const { DB } = await cf();
  const stmt = section
    ? DB.prepare(`SELECT ${LIST_COLUMNS} FROM posts WHERE section = ? ORDER BY published_at DESC LIMIT ?`).bind(section, limit)
    : DB.prepare(`SELECT ${LIST_COLUMNS} FROM posts ORDER BY published_at DESC LIMIT ?`).bind(limit);
  const { results } = await stmt.all<PostRow>();
  return results;
}

export async function getPost(slug: string): Promise<{ post: PostRow; media: MediaRow[] } | null> {
  const { DB } = await cf();
  const post = await DB.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first<PostRow>();
  if (!post) return null;
  const { results } = await DB.prepare(
    "SELECT id, kind, r2_key, url, content_type, caption FROM media WHERE post_id = ? ORDER BY position",
  )
    .bind(post.id)
    .all<MediaRow>();
  return { post, media: results };
}
