import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { nightRole } from "@/lib/hosting";
import { MAX_BYTES, type FileKind } from "@/lib/media-rules";
import { localUploadsEnabled } from "@/lib/r2-presign";

/** Dev-only upload path for invite media (ALLOW_LOCAL_UPLOADS=1 and no R2 keys). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; key: string[] }> }) {
  const { id, key: parts } = await params;
  const env = await cf();
  if (!localUploadsEnabled(env)) return new NextResponse(null, { status: 404 });
  const access = await nightRole(id);
  if (!access) return new NextResponse(null, { status: 403 });
  const key = parts.join("/");
  const row = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0")
    .bind(key, access.email)
    .first<{ kind: FileKind; content_type: string }>();
  if (!row || req.headers.get("content-type") !== row.content_type) return new NextResponse(null, { status: 403 });
  const data = await req.arrayBuffer();
  if (data.byteLength > MAX_BYTES[row.kind]) return new NextResponse(null, { status: 413 });
  await env.MEDIA.put(key, data, { httpMetadata: { contentType: row.content_type } });
  return new NextResponse(null, { status: 200 });
}
