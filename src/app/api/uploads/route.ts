import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { ALLOWED_TYPES, MAX_BYTES } from "@/lib/media-rules";
import { canPresign, localUploadsEnabled, presignPut } from "@/lib/r2-presign";
import { currentMember } from "@/lib/session";

/**
 * Hands a crew member a one-time upload target. The server picks the key, the
 * type is checked against an allowlist, and the upload is recorded so it can
 * only be attached to a post by the same person.
 */
export async function POST(req: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Sign in with a crew account to upload." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = typeof body?.size === "number" ? body.size : NaN;

  const type = ALLOWED_TYPES[contentType];
  if (!type) {
    return NextResponse.json({ error: "That file type isn't supported. Use JPG, PNG, WebP, GIF, MP4, MOV, WebM, MP3, M4A, WAV or OGG." }, { status: 415 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES[type.kind]) {
    const mb = Math.round(MAX_BYTES[type.kind] / 1024 / 1024);
    return NextResponse.json({ error: `${type.kind} files can be up to ${mb} MB.` }, { status: 413 });
  }

  const env = await cf();
  if (!canPresign(env) && !localUploadsEnabled(env)) {
    return NextResponse.json({ error: "Uploads aren't set up yet. The site admin needs to add the R2 API keys." }, { status: 503 });
  }
  const key = `media/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${type.ext}`;
  await env.DB.prepare(
    "INSERT INTO uploads (r2_key, email, kind, content_type, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(key, member.email, type.kind, contentType, new Date().toISOString())
    .run();

  // Local dev has no R2 API credentials, so it uploads through the Worker instead.
  const uploadUrl = canPresign(env) ? await presignPut(env, key, contentType, size) : `/api/uploads/local/${key}`;
  return NextResponse.json({ key, kind: type.kind, uploadUrl, headers: { "Content-Type": contentType } });
}
