import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { ALLOWED_TYPES, MAX_BYTES, type FileKind } from "@/lib/media-rules";
import { liveSession } from "@/lib/phone-upload";

/** After the PUT: check the file really landed as signed, then the editor can see it. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const env = await cf();
  const s = await liveSession(env.DB, (await params).token);
  if (!s) return NextResponse.json({ error: "This QR code has expired." }, { status: 404 });
  const { key } = ((await req.json().catch(() => ({}))) ?? {}) as { key?: string };
  const row = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND session_id = ? AND used = 0")
    .bind(String(key ?? ""), s.id)
    .first<{ kind: FileKind; content_type: string }>();
  if (!row) return NextResponse.json({ error: "Unknown upload." }, { status: 404 });
  const head = await env.MEDIA.head(String(key));
  if (!head || head.httpMetadata?.contentType?.toLowerCase() !== row.content_type || !ALLOWED_TYPES[row.content_type] || head.size > MAX_BYTES[row.kind]) {
    if (head) await env.MEDIA.delete(String(key));
    await env.DB.prepare("DELETE FROM uploads WHERE r2_key = ?").bind(String(key)).run();
    return NextResponse.json({ error: "That upload didn't come through right. Try again." }, { status: 422 });
  }
  await env.DB.prepare("UPDATE uploads SET size = ? WHERE r2_key = ?").bind(head.size, String(key)).run();
  return NextResponse.json({ ok: true });
}
