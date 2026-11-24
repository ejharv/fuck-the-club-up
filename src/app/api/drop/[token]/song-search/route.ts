import { NextResponse } from "next/server";
import { closedResponse, dropContext, requireVerified } from "@/lib/drop-context";
import { rateLimited } from "@/lib/nights";
import { searchSongs } from "@/lib/song-search";

/** Song search for guests on the party link (verified phones only, rate limited). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ctx = await dropContext((await params).token);
  if (!ctx) return closedResponse();
  if (!requireVerified(ctx)) return NextResponse.json({ error: "Confirm you're a person first." }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (await rateLimited(ctx.env, `songsearch:${await ctx.ipHash()}`)) return NextResponse.json({ error: "Slow down a sec." }, { status: 429 });
  return NextResponse.json({ results: await searchSongs(q) }, { headers: { "cache-control": "no-store" } });
}
