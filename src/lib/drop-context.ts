import "server-only";
import { NextResponse } from "next/server";
import { cf } from "./env";
import { deviceId, ipHash, isVerified, nightByToken } from "./nights";

/** Same response whether the token is wrong, expired or closed. */
export const closedResponse = () => NextResponse.json({ error: "This link's closed." }, { status: 404 });

export async function dropContext(token: string) {
  const env = await cf();
  const night = await nightByToken(token);
  // The link dies when it's regenerated (old hash gone) or when the admin closes
  // the album on a night that's no longer taking uploads or notes.
  if (!night || (!night.album_open && (night.status === "dropped" || night.status === "closed"))) return null;
  const device = await deviceId();
  const verified = await isVerified(env.AUTH_SECRET, night.id, device);
  // Private nights: only devices a host approved get past the invite.
  const allowed =
    !night.private_invite ||
    Boolean(device && (await env.DB.prepare("SELECT 1 FROM night_rsvps WHERE night_id = ? AND device_id = ? AND approved = 1").bind(night.id, device).first()));
  return { env, night, device, verified, allowed, ipHash: () => ipHash(env.AUTH_SECRET) };
}

export type DropContext = NonNullable<Awaited<ReturnType<typeof dropContext>>>;

/** A person who passed the bot check and, on a private night, was let in by a host. */
export function requireVerified(ctx: DropContext): ctx is DropContext & { device: string } {
  return Boolean(ctx.verified && ctx.device && ctx.allowed);
}

/** Passed the bot check (enough to RSVP or request a spot, even before approval). */
export function requireHuman(ctx: DropContext): ctx is DropContext & { device: string } {
  return Boolean(ctx.verified && ctx.device);
}

export const noStore = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
