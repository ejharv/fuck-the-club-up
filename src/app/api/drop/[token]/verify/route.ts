import { NextResponse } from "next/server";
import { closedResponse, dropContext, noStore } from "@/lib/drop-context";
import { DEVICE_COOKIE, VERIFIED_COOKIE, rateLimited, signVerified, verifyTurnstile } from "@/lib/nights";

/** Turnstile once per session; sets an anonymous device id and a signed "verified" cookie. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await dropContext((await params).token);
  if (!ctx) return closedResponse();
  const ip = await ctx.ipHash();
  if (await rateLimited(ctx.env, ip)) return NextResponse.json({ error: "Slow down a sec and try again." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { turnstile?: unknown } | null;
  const ok = typeof body?.turnstile === "string" && (await verifyTurnstile(ctx.env, body.turnstile, req.headers.get("cf-connecting-ip")));
  if (!ok) return NextResponse.json({ error: "Couldn't confirm you're a person. Reload and try again." }, { status: 403 });

  const device = ctx.device ?? crypto.randomUUID();
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  const secure = new URL(req.url).protocol === "https:";
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
