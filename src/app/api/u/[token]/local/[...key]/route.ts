import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { MAX_BYTES, type FileKind } from "@/lib/media-rules";
import { liveSession } from "@/lib/phone-upload";
import { localUploadsEnabled } from "@/lib/r2-presign";

/** Dev-only upload path for phone sessions (ALLOW_LOCAL_UPLOADS=1 and no R2 keys). */
export async function PUT(req: Request, { params }: { params: Promise<{ token: string; key: string[] }> }) {
  const { token, key: parts } = await params;
  const env = await cf();
  if (!localUploadsEnabled(env)) return new NextResponse(null, { status: 404 });
  const s = await liveSession(env.DB, token);
  if (!s) return new NextResponse(null, { status: 404 });
  const key = parts.join("/");
  const row = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND session_id = ? AND used = 0")
    .bind(key, s.id)
    .first<{ kind: FileKind; content_type: string }>();
  if (!row || req.headers.get("content-type") !== row.content_type) return new NextResponse(null, { status: 403 });
  const data = await req.arrayBuffer();
  if (data.byteLength > MAX_BYTES[row.kind]) return new NextResponse(null, { status: 413 });
  await env.MEDIA.put(key, data, { httpMetadata: { contentType: row.content_type } });
  return new NextResponse(null, { status: 200 });
}
