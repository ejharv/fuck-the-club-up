import { NextResponse } from "next/server";
import { closedResponse, dropContext, requireVerified } from "@/lib/drop-context";
import { GUEST_MAX_BYTES } from "@/lib/drop";
import { localUploadsEnabled } from "@/lib/r2-presign";

/** Dev-only: upload into the local INBOX emulator. Off unless ALLOW_LOCAL_UPLOADS=1 and no R2 keys. */
export async function PUT(req: Request, { params }: { params: Promise<{ token: string; key: string[] }> }) {
  const { token, key: parts } = await params;
  const ctx = await dropContext(token);
  if (!ctx) return closedResponse();
  if (!localUploadsEnabled(ctx.env)) return new NextResponse(null, { status: 404 });
  if (!requireVerified(ctx)) return NextResponse.json({ error: "Not verified." }, { status: 401 });
  const key = parts.join("/");
  const row = await ctx.env.DB.prepare(
    "SELECT kind, content_type FROM night_uploads WHERE r2_key = ? AND night_id = ? AND device_id = ? AND uploaded = 0",
  )
    .bind(key, ctx.night.id, ctx.device)
    .first<{ kind: "photo" | "video" | "audio"; content_type: string }>();
  if (!row || req.headers.get("content-type") !== row.content_type) return NextResponse.json({ error: "Unknown upload." }, { status: 403 });
  const data = await req.arrayBuffer();
  if (data.byteLength > GUEST_MAX_BYTES[row.kind]) return NextResponse.json({ error: "Too big." }, { status: 413 });
  await ctx.env.INBOX.put(key, data, { httpMetadata: { contentType: row.content_type } });
  return new NextResponse(null, { status: 200 });
}
