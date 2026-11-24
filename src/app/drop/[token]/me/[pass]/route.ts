import { NextResponse } from "next/server";
import { closedResponse, dropContext } from "@/lib/drop-context";
import { DEVICE_COOKIE, VERIFIED_COOKIE, checkMePass, rateLimited, signVerified } from "@/lib/nights";

/** A guest's personal link: signs this browser in as them, then opens the invite. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; pass: string }> }) {
  const { token, pass } = await params;
  const ctx = await dropContext(token);
  if (!ctx) return closedResponse();
  if (await rateLimited(ctx.env, `me:${await ctx.ipHash()}`)) return new NextResponse("Slow down a sec and try again.", { status: 429 });
  const device = await checkMePass(ctx.env.AUTH_SECRET, ctx.night.id, pass);
  const known = device
    ? await ctx.env.DB.prepare(
        "SELECT 1 FROM night_rsvps WHERE night_id = ?1 AND device_id = ?2 UNION ALL SELECT 1 FROM night_accounts WHERE night_id = ?1 AND device_id = ?2 LIMIT 1",
      )
        .bind(ctx.night.id, device)
        .first()
    : null;
  const url = new URL(`/drop/${token}${known ? "#rsvp" : ""}`, req.url);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  if (!device || !known) return res;
  const secure = url.protocol === "https:";
  res.cookies.set(DEVICE_COOKIE, device, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
  res.cookies.set(VERIFIED_COOKIE, await signVerified(ctx.env.AUTH_SECRET, ctx.night.id, device), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
