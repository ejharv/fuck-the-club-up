import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { MAX_BYTES, type FileKind } from "@/lib/media-rules";
import { localUploadsEnabled } from "@/lib/r2-presign";
import { currentMember } from "@/lib/session";

/** Dev-only upload path. Requires ALLOW_LOCAL_UPLOADS=1 (set only in .dev.vars) and no R2 keys. */
export async function PUT(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const env = await cf();
  if (!localUploadsEnabled(env)) return new NextResponse(null, { status: 404 });

  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const key = (await params).key.join("/");
  const upload = await env.DB.prepare(
    "SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0",
  )
    .bind(key, member.email)
    .first<{ kind: FileKind; content_type: string }>();
  if (!upload || req.headers.get("content-type") !== upload.content_type) {
    return NextResponse.json({ error: "Unknown upload." }, { status: 403 });
  }

  const data = await req.arrayBuffer();
  if (data.byteLength > MAX_BYTES[upload.kind]) return NextResponse.json({ error: "Too big." }, { status: 413 });
  await env.MEDIA.put(key, data, { httpMetadata: { contentType: upload.content_type } });
  return new NextResponse(null, { status: 200 });
}
