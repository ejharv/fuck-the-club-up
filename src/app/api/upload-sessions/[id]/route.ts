import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";
import { currentMember } from "@/lib/session";

/** The editor polls this to pick up files sent from the phone. Owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const env = await cf();
  const id = (await params).id;
  const s = await env.DB.prepare("SELECT email, expires_at, closed FROM upload_sessions WHERE id = ?").bind(id).first<{ email: string; expires_at: string; closed: number }>();
  if (!s || s.email !== member.email) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { results } = await env.DB.prepare(
    "SELECT r2_key, kind, content_type FROM uploads WHERE session_id = ? AND email = ? AND size IS NOT NULL AND used = 0 ORDER BY created_at",
  )
    .bind(id, member.email)
    .all<{ r2_key: string; kind: string; content_type: string }>();
  return NextResponse.json(
    {
      live: !s.closed && new Date(s.expires_at) > new Date(),
      expiresAt: s.expires_at,
      files: results.map((r) => ({ key: r.r2_key, kind: r.kind, preview: r.kind === "photo" ? mediaUrl(r.r2_key, env.MEDIA_PUBLIC_URL) : null })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Close the session early (editor saved or the person clicked Done). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const env = await cf();
  await env.DB.prepare("UPDATE upload_sessions SET closed = 1 WHERE id = ? AND email = ?").bind((await params).id, member.email).run();
  return NextResponse.json({ ok: true });
}
