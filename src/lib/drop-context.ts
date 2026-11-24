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
  return { env, night, device, verified, ipHash: () => ipHash(env.AUTH_SECRET) };
}

export type DropContext = NonNullable<Awaited<ReturnType<typeof dropContext>>>;

export function requireVerified(ctx: DropContext): ctx is DropContext & { device: string } {
  return Boolean(ctx.verified && ctx.device);
}

export const noStore = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
