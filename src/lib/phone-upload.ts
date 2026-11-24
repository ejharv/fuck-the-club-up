import "server-only";
import { sha256Hex } from "./crypto";

/** "Add from phone" QR sessions: short-lived, owned by one crew member. */
export const PHONE_SESSION_MINUTES = 30;
export const PHONE_SESSION_MAX_FILES = 60;

export type PhoneSession = { id: string; email: string; expires_at: string; closed: number };

export async function liveSession(DB: D1Database, token: string): Promise<PhoneSession | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const s = await DB.prepare("SELECT id, email, expires_at, closed FROM upload_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).first<PhoneSession>();
  if (!s || s.closed || new Date(s.expires_at) <= new Date()) return null;
  // The owner must still be on the crew list.
  const m = await DB.prepare("SELECT 1 FROM members WHERE email = ?").bind(s.email).first();
  return m ? s : null;
}
