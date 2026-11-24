import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { nightRole } from "@/lib/hosting";
import { ALLOWED_TYPES, MAX_BYTES } from "@/lib/media-rules";
import { canPresign, localUploadsEnabled, presignPut } from "@/lib/r2-presign";

/** Signed upload for a night's invite video/photo. Admins and this night's hosts. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const access = await nightRole(id);
  if (!access) return NextResponse.json({ error: "Only admins and this night's hosts can do that." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  const type = ALLOWED_TYPES[contentType];
  if (!type || type.kind === "audio") return NextResponse.json({ error: "Use a video, a photo or a GIF." }, { status: 415 });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES[type.kind]) {
    return NextResponse.json({ error: `That file is over ${Math.round(MAX_BYTES[type.kind] / 1048576)} MB.` }, { status: 413 });
  }
  const env = await cf();
  if (!canPresign(env) && !localUploadsEnabled(env)) return NextResponse.json({ error: "Uploads aren't set up yet." }, { status: 503 });
  const key = `media/invites/${crypto.randomUUID()}.${type.ext}`;
  await env.DB.prepare("INSERT INTO uploads (r2_key, email, kind, content_type, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(key, access.email, type.kind, contentType, new Date().toISOString())
    .run();
  const uploadUrl = canPresign(env) ? await presignPut(env, key, contentType, size) : `/api/nights/${id}/invite-media/local/${key}`;
  return NextResponse.json({ key, uploadUrl, headers: { "Content-Type": contentType } }, { headers: { "cache-control": "no-store" } });
}
