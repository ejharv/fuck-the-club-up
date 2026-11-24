import "server-only";
import { sha256Hex } from "./crypto";

export type CrewInvite = {
  id: string;
  role: "admin" | "crew";
  email: string | null;
  label: string | null;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked: number;
  created_at: string;
};

export const JOIN_COOKIE = "ftcu_join";

export const INVITE_RULES = {
  /** Admin invites: locked to an email, single use, 48 hours max. */
  adminMaxHours: 48,
  crewMaxHours: 24 * 14,
  crewMaxUses: 25,
};

const COLUMNS = "id, role, email, label, max_uses, uses, expires_at, revoked, created_at";

/** The invite behind a link token, if it still works. Never reveals why it doesn't. */
export async function liveInvite(DB: D1Database, token: string): Promise<CrewInvite | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const inv = await DB.prepare(`SELECT ${COLUMNS} FROM crew_invites WHERE token_hash = ?`).bind(await sha256Hex(token)).first<CrewInvite>();
  if (!inv || inv.revoked || inv.uses >= inv.max_uses || new Date(inv.expires_at) <= new Date()) return null;
  return inv;
}

/** Can this Google email use this invite? */
export function inviteFits(inv: CrewInvite, email: string): boolean {
  return !inv.email || inv.email === email.toLowerCase();
}

/**
 * Redeem: atomically count the use (so a single-use link can't be claimed
 * twice by racing) and add the member. Never downgrades an existing admin.
 */
export async function redeemInvite(DB: D1Database, token: string, email: string, name: string | null): Promise<CrewInvite | null> {
  const inv = await liveInvite(DB, token);
  const lower = email.toLowerCase();
  if (!inv || !inviteFits(inv, lower)) return null;
  const claimed = await DB.prepare(
    "UPDATE crew_invites SET uses = uses + 1 WHERE id = ? AND revoked = 0 AND uses < max_uses AND expires_at > ?",
  )
    .bind(inv.id, new Date().toISOString())
    .run();
  if (!claimed.meta.changes) return null;
  await DB.prepare(
    `INSERT INTO members (email, name, role, added_by) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (email) DO UPDATE SET role = CASE WHEN members.role = 'admin' THEN 'admin' ELSE excluded.role END`,
  )
    .bind(lower, name, inv.role, `invite:${inv.id}`)
    .run();
  return inv;
}

/** "j***@gmail.com" so the join page can say who it's for without publishing the address. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}
