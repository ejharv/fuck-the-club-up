import "server-only";
import { cookies, headers } from "next/headers";
import { cf } from "./env";
import { hmacHex, safeEqual, sha256Hex } from "./crypto";

export type NightStatus = "collecting" | "reviewing" | "dropping" | "dropped" | "closed";

export type Night = {
  id: string;
  name: string;
  night_of: string;
  opens_at: string;
  closes_at: string;
  invite_details: string | null;
  location_text: string | null;
  dress_code: string | null;
  venues: string | null;
  capacity: number | null;
  max_plus_ones: number;
  invite_rules: string | null;
  invite_media_key: string | null;
  invite_media_kind: "video" | "photo" | null;
  status: NightStatus;
  max_files: number;
  max_bytes: number;
  per_device_files: number;
  album_open: number;
  drop_at: string | null;
  drop_fields: string | null;
  generations: number;
  generating_since: string | null;
  post_id: string | null;
  created_at: string;
};

export type NightUpload = {
  r2_key: string;
  kind: "photo" | "video" | "audio";
  content_type: string;
  size: number;
  nickname: string | null;
  device_id: string;
  decision: "pending" | "keep" | "toss";
  caption: string | null;
  is_cover: number;
  created_at: string;
};

export type Draft = {
  version: number;
  title: string;
  dek: string | null;
  night_label: string | null;
  damage: string | null;
  ride_home: string | null;
  body: string;
  songs: string | null; // JSON [{title, artist}]
  source: "claude" | "edit";
  created_at: string;
};

const NIGHT_COLUMNS = `id, name, night_of, opens_at, closes_at, invite_details, location_text, dress_code, venues, capacity, max_plus_ones, invite_rules, invite_media_key, invite_media_kind, status, max_files, max_bytes, per_device_files, album_open,
  drop_at, drop_fields, generations, generating_since, post_id, created_at`;

export async function getNight(id: string): Promise<Night | null> {
  const { DB } = await cf();
  return DB.prepare(`SELECT ${NIGHT_COLUMNS} FROM nights WHERE id = ?`).bind(id).first<Night>();
}

/** Look a night up by its link token. Only the hash is stored. */
export async function nightByToken(token: string): Promise<Night | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const { DB } = await cf();
  return DB.prepare(`SELECT ${NIGHT_COLUMNS} FROM nights WHERE token_hash = ?`).bind(await sha256Hex(token)).first<Night>();
}

export type { Venue } from "./venues";
export { parseVenueJson as parseVenues } from "./venues";

export type Phase = "invite" | "live" | "after" | "dropped";

/** What the link shows right now. */
export function phaseOf(n: Night, now = new Date()): Phase {
  if (n.status === "dropped" || (n.status === "dropping" && n.post_id)) return "dropped";
  if (n.status === "collecting" && now < new Date(n.opens_at)) return "invite";
  if (isCollecting(n, now)) return "live";
  return "after";
}

/** Uploads and accounts are accepted only while the link is collecting and inside its window. */
export function isCollecting(n: Night, now = new Date()) {
  return n.status === "collecting" && now >= new Date(n.opens_at) && now < new Date(n.closes_at);
}

/** Link holders can read drafts, leave notes and approve until the post drops. */
export function isReviewable(n: Night) {
  return n.status === "collecting" || n.status === "closed" || n.status === "reviewing" || (n.status === "dropping" && !n.post_id);
}

/** A drop that stopped partway (batch error, limits). Running it again resumes it. */
export function isStuckDrop(n: Pick<Night, "status" | "post_id">) {
  return n.status === "dropping" && !n.post_id;
}

export async function latestDraft(nightId: string): Promise<Draft | null> {
  const { DB } = await cf();
  return DB.prepare(
    "SELECT version, title, dek, night_label, damage, ride_home, body, songs, source, created_at FROM night_drafts WHERE night_id = ? ORDER BY version DESC LIMIT 1",
  )
    .bind(nightId)
    .first<Draft>();
}

export async function listAlbum(nightId: string): Promise<NightUpload[]> {
  const { DB } = await cf();
  const { results } = await DB.prepare(
    `SELECT r2_key, kind, content_type, size, nickname, device_id, decision, caption, is_cover, created_at
       FROM night_uploads WHERE night_id = ? AND uploaded = 1 ORDER BY created_at`,
  )
    .bind(nightId)
    .all<NightUpload>();
  return results;
}

// ---- Anonymous contributor identity ---------------------------------------
// A random device id in a cookie, plus a signed "passed Turnstile" cookie.
// Nothing here identifies a person; it only lets one phone edit its own
// account and keep one approval per draft.

export const DEVICE_COOKIE = "ftcu_device";
export const VERIFIED_COOKIE = "ftcu_ok";
const VERIFIED_TTL_MS = 12 * 3600 * 1000;

export async function deviceId(): Promise<string | null> {
  const v = (await cookies()).get(DEVICE_COOKIE)?.value;
  return v && /^[a-f0-9-]{36}$/.test(v) ? v : null;
}

export async function signVerified(secret: string, nightId: string, device: string) {
  const exp = Date.now() + VERIFIED_TTL_MS;
  return `${exp}.${await hmacHex(secret, `${nightId}.${device}.${exp}`)}`;
}

/** True when this device passed Turnstile for this night recently. */
export async function isVerified(secret: string, nightId: string, device: string | null): Promise<boolean> {
  if (!device) return false;
  const raw = (await cookies()).get(VERIFIED_COOKIE)?.value ?? "";
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmacHex(secret, `${nightId}.${device}.${exp}`));
}

/** Salted hash of the caller's IP, for rate limits and abuse checks. Never the raw IP. */
export async function ipHash(secret: string): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return (await hmacHex(secret, `ip:${ip}`)).slice(0, 32);
}

/** Workers rate limiting binding; absent in `next dev`, where it's skipped. */
export async function rateLimited(env: CloudflareEnv, key: string): Promise<boolean> {
  const limiter = (env as unknown as { DROP_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> } }).DROP_LIMITER;
  if (!limiter) return false;
  const { success } = await limiter.limit({ key });
  return !success;
}

export async function verifyTurnstile(env: CloudflareEnv, token: string, ip: string | null): Promise<boolean> {
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY ?? "");
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}

/** Default close: noon the day after the night, Michigan time. */
export function defaultClosesAt(nightOf: string): string {
  const [y, m, d] = nightOf.split("-").map(Number);
  // Noon Detroit is 16:00 or 17:00 UTC depending on DST; find the right one.
  for (const utcHour of [16, 17]) {
    const t = new Date(Date.UTC(y, m - 1, d + 1, utcHour));
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", hour12: false }).format(t));
    if (hour === 12) return t.toISOString();
  }
  return new Date(Date.UTC(y, m - 1, d + 1, 17)).toISOString();
}
