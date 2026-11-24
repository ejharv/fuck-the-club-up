import { NextResponse } from "next/server";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { cf } from "@/lib/env";
import { PHONE_SESSION_MINUTES } from "@/lib/phone-upload";
import { currentMember } from "@/lib/session";

/** Start an "Add from phone" session; the token is returned once, for the QR code. */
export async function POST() {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Sign in with a crew account first." }, { status: 401 });
  const env = await cf();
  const token = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PHONE_SESSION_MINUTES * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO upload_sessions (id, token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, await sha256Hex(token), member.email, expiresAt, new Date().toISOString())
    .run();
  return NextResponse.json({ id, path: `/u/${token}`, expiresAt }, { headers: { "cache-control": "no-store" } });
}
