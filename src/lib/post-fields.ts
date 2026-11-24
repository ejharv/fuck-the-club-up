import "server-only";
import { sectionBySlug } from "./sections";

/** Fields shared by /new, the edit page and dropping a night. One validator so the rules can't drift. */
export type PostFieldsInput = {
  title: string;
  dek?: string;
  section: string;
  night?: string;
  nightOf?: string;
  damage?: string;
  rideHome?: string;
  body: string;
  /** House rule 1: everyone named or shown agreed. */
  consent: boolean;
};

export type PostFields = {
  title: string;
  dek: string | null;
  section: string;
  night: string | null;
  nightOf: string | null;
  damage: string | null;
  rideHome: string | null;
  body: string;
};

export const clean = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s.slice(0, max) : null;
};

/** Today's date in Ann Arbor, YYYY-MM-DD. */
export function todayInDetroit(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A real calendar date, not in the future, not before 2000. */
export function validNightOf(value: string | null): string | null | { error: string } {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Use a real date for the night." };
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { error: "Use a real date for the night." };
  if (y < 2000) return { error: "The night has to be in 2000 or later." };
  if (value > todayInDetroit()) return { error: "The night can't be in the future." };
  return value;
}

export function validatePostFields(input: PostFieldsInput): PostFields | { error: string } {
  const title = clean(input.title, 140);
  const body = clean(input.body, 60_000);
  if (!title) return { error: "Give the post a title." };
  if (!body) return { error: "Write the post before publishing it." };
  const section = sectionBySlug(String(input.section ?? ""))?.slug;
  if (!section) return { error: "Pick a section for the post." };
  const rideHome = clean(input.rideHome, 160);
  if (section === "night-reports" && !rideHome) return { error: "Night reports have to say how everyone got home." };
  const nightOf = validNightOf(clean(input.nightOf, 10));
  if (nightOf && typeof nightOf === "object") return nightOf;
  if (input.consent !== true) {
    return { error: "Confirm that everyone named or shown in this post said yes. Use nicknames for anyone who didn't." };
  }
  return {
    title,
    dek: clean(input.dek, 200),
    section,
    night: clean(input.night, 80),
    nightOf,
    damage: clean(input.damage, 80),
    rideHome,
    body,
  };
}

export function slugify(title: string) {
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

export type MediaInsert = { kind: string; key: string | null; url: string | null; type: string | null; caption: string | null };

/** Statements that insert a post and its media. Run them in one D1 batch. */
export function insertPostStatements(
  DB: D1Database,
  f: PostFields,
  media: MediaInsert[],
  coverKey: string | null,
  authorEmail: string,
) {
  const id = crypto.randomUUID();
  const slug = slugify(f.title);
  const now = new Date().toISOString();
  const stmts = [
    DB.prepare(
      `INSERT INTO posts (id, slug, title, dek, section, night, night_of, damage, ride_home, body, cover_key,
                          author_email, author_name, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).bind(id, slug, f.title, f.dek, f.section, f.night, f.nightOf, f.damage, f.rideHome, f.body, coverKey, authorEmail, now, now),
    ...media.map((m, i) =>
      DB.prepare(
        "INSERT INTO media (id, post_id, position, kind, r2_key, url, content_type, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), id, i, m.kind, m.key, m.url, m.type, m.caption),
    ),
  ];
  return { id, slug, stmts };
}
