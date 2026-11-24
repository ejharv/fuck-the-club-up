import { NextResponse } from "next/server";
import { BedrockError } from "@/lib/bedrock";
import { closedResponse, dropContext, requireVerified } from "@/lib/drop-context";
import { GUEST_ASSIST, GUEST_MODES, guestAssist, type GuestMode } from "@/lib/guest-assist";
import { isReviewable, phaseOf, rateLimited } from "@/lib/nights";

/** Claude help for a guest's story: verified phone, open night, 5 per phone, 100 per night. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await dropContext((await params).token);
  if (!ctx) return closedResponse();
  if (!requireVerified(ctx)) return NextResponse.json({ error: "Confirm you're a person first." }, { status: 401 });
  if (phaseOf(ctx.night) === "invite" || !isReviewable(ctx.night)) return NextResponse.json({ error: "Writing help is open while the night's stories are." }, { status: 409 });
  if (await rateLimited(ctx.env, `gassist:${await ctx.ipHash()}`)) return NextResponse.json({ error: "Slow down a sec." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { mode?: unknown; text?: unknown } | null;
  const mode = String(body?.mode ?? "") as GuestMode;
  const text = typeof body?.text === "string" ? body.text : "";
  if (!(mode in GUEST_MODES)) return NextResponse.json({ error: "Pick what kind of help you want." }, { status: 400 });
  if (text.trim().length < 10) return NextResponse.json({ error: "Write a little first, even rough notes." }, { status: 400 });
  if (text.length > GUEST_ASSIST.maxChars) return NextResponse.json({ error: "That's too long. Trim it a bit." }, { status: 413 });

  const { env, night, device } = ctx;
  const used = await env.DB.prepare(
    "SELECT SUM(CASE WHEN device_id = ? THEN 1 ELSE 0 END) AS mine, COUNT(*) AS total FROM guest_assist_log WHERE night_id = ?",
  )
    .bind(device, night.id)
    .first<{ mine: number | null; total: number }>();
  const mine = used?.mine ?? 0;
  if (mine >= GUEST_ASSIST.perDevice) return NextResponse.json({ error: `That's your ${GUEST_ASSIST.perDevice} writing-help tries for this night.`, left: 0 }, { status: 429 });
  if ((used?.total ?? 0) >= GUEST_ASSIST.perNight) return NextResponse.json({ error: "Writing help is used up for this night." }, { status: 429 });
  await env.DB.prepare("INSERT INTO guest_assist_log (night_id, device_id, created_at) VALUES (?, ?, ?)").bind(night.id, device, new Date().toISOString()).run();
  try {
    const out = await guestAssist(env, mode, text);
    return NextResponse.json({ ...out, left: GUEST_ASSIST.perDevice - mine - 1 }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BedrockError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
