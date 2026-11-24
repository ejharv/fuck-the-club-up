import { NextResponse } from "next/server";
import { ASSIST_DAILY_LIMIT, ASSIST_MAX_CHARS, ASSIST_MODES, assist, type AssistMode } from "@/lib/assist";
import { BedrockError } from "@/lib/bedrock";
import { cf } from "@/lib/env";
import { currentMember } from "@/lib/session";
import { cleanVenues } from "@/lib/venues";

/** Claude writing help for crew members, capped per person per day. */
export async function POST(req: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Sign in with a crew account to use writing help." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const mode = String(body?.mode ?? "") as AssistMode;
  if (!(mode in ASSIST_MODES)) return NextResponse.json({ error: "Pick what kind of help you want." }, { status: 400 });
  const text = typeof body?.body === "string" ? body.body : "";
  if (!text.trim() && mode !== "headline") return NextResponse.json({ error: "Write something first, even rough notes." }, { status: 400 });
  if (text.length > ASSIST_MAX_CHARS) return NextResponse.json({ error: "That's too long to do in one go. Trim it a bit." }, { status: 413 });
  if (mode === "custom" && !(typeof body?.request === "string" && body.request.trim())) {
    return NextResponse.json({ error: "Say what you want changed." }, { status: 400 });
  }
  const venues = cleanVenues(body?.venues);
  const env = await cf();
  const since = new Date(Date.now() - 864e5).toISOString();
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM assist_log WHERE email = ? AND created_at > ?").bind(member.email, since).first<{ n: number }>();
  if ((used?.n ?? 0) >= ASSIST_DAILY_LIMIT) {
    return NextResponse.json({ error: `That's ${ASSIST_DAILY_LIMIT} writing-help requests in the last day. Try again tomorrow.` }, { status: 429 });
  }
  await env.DB.prepare("INSERT INTO assist_log (email, mode, created_at) VALUES (?, ?, ?)").bind(member.email, mode, new Date().toISOString()).run();
  const s = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : "");
  try {
    const out = await assist(env, {
      mode,
      request: s("request"),
      title: s("title"),
      dek: s("dek"),
      night: s("night"),
      damage: s("damage"),
      rideHome: s("rideHome"),
      body: text,
      venues: "error" in venues ? [] : venues,
    });
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BedrockError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
