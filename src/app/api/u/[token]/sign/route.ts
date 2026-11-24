import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { ALLOWED_TYPES, MAX_BYTES } from "@/lib/media-rules";
import { ipHash, rateLimited } from "@/lib/nights";
import { PHONE_SESSION_MAX_FILES, liveSession } from "@/lib/phone-upload";
import { canPresign, localUploadsEnabled, presignPut } from "@/lib/r2-presign";

/** Signed upload target for a phone holding an "Add from phone" QR link. Counts as the session owner's upload. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const env = await cf();
  const s = await liveSession(env.DB, token);
  if (!s) return NextResponse.json({ error: "This QR code has expired. Make a new one in the editor." }, { status: 404 });
  if (await rateLimited(env, `phone:${await ipHash(env.AUTH_SECRET)}`)) return NextResponse.json({ error: "Slow down a sec." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  const type = ALLOWED_TYPES[contentType];
  if (!type) return NextResponse.json({ error: "Photos, videos and audio only." }, { status: 415 });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES[type.kind]) {
    return NextResponse.json({ error: `That file is over ${Math.round(MAX_BYTES[type.kind] / 1048576)} MB.` }, { status: 413 });
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE session_id = ?").bind(s.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= PHONE_SESSION_MAX_FILES) return NextResponse.json({ error: "That's the limit for one QR code. Make a new one." }, { status: 409 });
  if (!canPresign(env) && !localUploadsEnabled(env)) return NextResponse.json({ error: "Uploads aren't set up yet." }, { status: 503 });
  const key = `media/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${type.ext}`;
  await env.DB.prepare("INSERT INTO uploads (r2_key, email, kind, content_type, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(key, s.email, type.kind, contentType, new Date().toISOString(), s.id)
    .run();
  const uploadUrl = canPresign(env) ? await presignPut(env, key, contentType, size) : `/api/u/${token}/local/${key}`;
  return NextResponse.json({ key, uploadUrl, headers: { "Content-Type": contentType } }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
