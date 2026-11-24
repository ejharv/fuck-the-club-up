import { NextResponse } from "next/server";
import { BedrockError } from "@/lib/bedrock";
import { cf } from "@/lib/env";
import { getNight, latestDraft, parseVenues } from "@/lib/nights";
import { LIMITS, buildPrompt, sanitizeDraftBody, writeDraft } from "@/lib/synthesis";
import { nightRole } from "@/lib/hosting";

/**
 * Admin asks Claude for a draft (or a rewrite using the notes on the latest
 * draft). The browser waits on this request, about 15 to 40 seconds. A lock
 * on the night stops double clicks from paying twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!(await nightRole(id))) return NextResponse.json({ error: "Only admins and this night's hosts can do that." }, { status: 403 });
  const env = await cf();
  const night = await getNight(id);
  if (!night) return NextResponse.json({ error: "That night doesn't exist." }, { status: 404 });
  if (night.status === "dropped" || night.post_id) {
    return NextResponse.json({ error: "This night already dropped. Edit the post instead." }, { status: 409 });
  }
  if (night.generations >= LIMITS.generationsPerNight) {
    return NextResponse.json({ error: `That's ${LIMITS.generationsPerNight} drafts for this night. Edit the text directly from here.` }, { status: 429 });
  }
  const { rewrite } = ((await req.json().catch(() => ({}))) ?? {}) as { rewrite?: boolean };

  const { results: accounts } = await env.DB.prepare("SELECT nickname, body FROM night_accounts WHERE night_id = ? ORDER BY updated_at")
    .bind(id)
    .all<{ nickname: string; body: string }>();
  if (!accounts.length) return NextResponse.json({ error: "Nobody has written their account yet. Share the link first." }, { status: 400 });

  const venues = parseVenues(night.venues);
  const previous = rewrite ? await latestDraft(id) : null;
  const notes = previous
    ? (
        await env.DB.prepare("SELECT nickname, body FROM night_notes WHERE night_id = ? AND version = ? ORDER BY created_at")
          .bind(id, previous.version)
          .all<{ nickname: string | null; body: string }>()
      ).results
    : [];

  // Take the lock (stale after 3 minutes in case a request died).
  const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const lock = await env.DB.prepare(
    "UPDATE nights SET generating_since = ?, generations = generations + 1 WHERE id = ? AND (generating_since IS NULL OR generating_since < ?)",
  )
    .bind(new Date().toISOString(), id, stale)
    .run();
  if (!lock.meta.changes) return NextResponse.json({ error: "Claude is already writing this one. Hang tight." }, { status: 409 });

  let succeeded = false;
  try {
    const { results: captions } = await env.DB.prepare(
      "SELECT nickname, kind, caption FROM night_uploads WHERE night_id = ? AND uploaded = 1 AND decision != 'toss' AND caption IS NOT NULL AND caption != '' ORDER BY created_at",
    )
      .bind(id)
      .all<{ nickname: string | null; kind: string; caption: string }>();
    const prompt = buildPrompt({ nightName: night.name, nightOf: night.night_of, accounts, venues, previous, notes, captions });
    const out = await writeDraft(env, prompt);
    const body = sanitizeDraftBody(out.body, new Set(venues.map((v) => v.url).filter((u): u is string => Boolean(u))));
    const version = (previous?.version ?? (await latestDraft(id))?.version ?? 0) + 1;
    await env.DB.prepare(
      `INSERT INTO night_drafts (night_id, version, title, dek, night_label, damage, ride_home, body, songs, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'claude', ?)`,
    )
      .bind(id, version, out.title, out.dek, out.night_label, out.damage, out.ride_home, body, JSON.stringify(out.songs), new Date().toISOString())
      .run();
    succeeded = true;
    return NextResponse.json({ version });
  } catch (e) {
    if (e instanceof BedrockError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  } finally {
    // Release the lock; a failed call doesn't use up one of the night's drafts.
    await env.DB.prepare(
      `UPDATE nights SET generating_since = NULL${succeeded ? "" : ", generations = MAX(generations - 1, 0)"} WHERE id = ?`,
    )
      .bind(id)
      .run();
  }
}
