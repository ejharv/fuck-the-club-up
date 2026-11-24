import { NextResponse } from "next/server";
import { closedResponse, dropContext, noStore, requireVerified } from "@/lib/drop-context";
import { GUEST_MAX_BYTES } from "@/lib/drop";

/** After the PUT: check the object is really there and matches what was signed, then show it in the album. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await dropContext((await params).token);
  if (!ctx) return closedResponse();
  if (!requireVerified(ctx)) return NextResponse.json({ error: "Confirm you're a person first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  const row = await ctx.env.DB.prepare(
    "SELECT kind, content_type, size FROM night_uploads WHERE r2_key = ? AND night_id = ? AND device_id = ?",
  )
    .bind(key, ctx.night.id, ctx.device)
    .first<{ kind: "photo" | "video" | "audio"; content_type: string; size: number }>();
  if (!row) return NextResponse.json({ error: "Unknown upload." }, { status: 404 });
  const head = await ctx.env.INBOX.head(key);
  if (!head || head.httpMetadata?.contentType?.toLowerCase() !== row.content_type || head.size > GUEST_MAX_BYTES[row.kind]) {
    if (head) await ctx.env.INBOX.delete(key);
    await ctx.env.DB.prepare("DELETE FROM night_uploads WHERE r2_key = ?").bind(key).run();
    return NextResponse.json({ error: "That upload didn't come through right. Try it again." }, { status: 422 });
  }
  await ctx.env.DB.prepare("UPDATE night_uploads SET uploaded = 1, size = ? WHERE r2_key = ?").bind(head.size, key).run();
  return NextResponse.json({ ok: true }, { headers: noStore });
}
