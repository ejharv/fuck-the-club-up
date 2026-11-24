import "server-only";
import { cf } from "./env";
import { getMember } from "./db";
import { NotAllowed, signedInEmail } from "./session";

/**
 * Who can run a night: any admin, or a co-host added to that night.
 * Re-checked in D1 on every call, like crew roles.
 */
export type NightRole = "admin" | "host";

export async function nightRole(nightId: string): Promise<{ role: NightRole; email: string } | null> {
  const email = await signedInEmail();
  if (!email) return null;
  const member = await getMember(email);
  if (member?.role === "admin") return { role: "admin", email };
  const { DB } = await cf();
  const host = await DB.prepare("SELECT 1 FROM night_hosts WHERE night_id = ? AND email = ?").bind(nightId, email).first();
  return host ? { role: "host", email } : null;
}

export async function requireNightAccess(nightId: string) {
  const r = await nightRole(nightId);
  if (!r) throw new NotAllowed("Only admins and this night's hosts can do that.");
  return r;
}

/** Admins, or the crew member who started this night: they can add/remove hosts and delete it. */
export async function canManageNight(night: { created_by: string }, email: string | null, role: NightRole | null): Promise<boolean> {
  if (role === "admin") return true;
  return Boolean(email && night.created_by.toLowerCase() === email.toLowerCase());
}

/** Crew members can host up to this many upcoming nights at once (admins: no limit). */
export const CREW_NIGHT_LIMIT = 3;

/** Is this email a host of any night? (Lets non-crew hosts sign in and see the Host link.) */
export async function isAnyHost(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { DB } = await cf();
  return Boolean(await DB.prepare("SELECT 1 FROM night_hosts WHERE email = ? LIMIT 1").bind(email.toLowerCase()).first());
}
