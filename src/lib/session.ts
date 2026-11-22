import "server-only";
import { auth } from "@/auth";
import { getMember, type Member } from "./db";

/**
 * The signed-in member, re-read from D1 on every call. Roles are never trusted
 * from the session cookie, so removing someone from the crew takes effect
 * immediately even though their JWT is still valid.
 */
export async function currentMember(): Promise<Member | null> {
  const session = await auth();
  return getMember(session?.user?.email);
}

export class NotAllowed extends Error {}

export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) throw new NotAllowed("Sign in with a crew account to do that.");
  return m;
}

export async function requireAdmin(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== "admin") throw new NotAllowed("Only admins can manage the crew.");
  return m;
}
