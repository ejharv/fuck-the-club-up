import { NextResponse } from "next/server";
import { runDrop } from "@/lib/drop";
import { sendGuestEmail, type EmailKind } from "@/lib/email";
import { cf } from "@/lib/env";
import { isInternal } from "@/lib/internal-auth";

/**
 * Every 15 minutes (custom-worker.ts):
 * 1. Party links past their close time stop collecting (status closed, awaiting review).
 * 2. Nights scheduled to drop, whose time has come and that have kept files, drop.
 * 3. Guest emails that are due (photos open, last call, draft ready, it's up), a few dozen per run.
 * It never publishes anything an admin hasn't scheduled.
 */
export async function POST(req: Request) {
  const env = await cf();
  if (!isInternal(req, env)) return new NextResponse(null, { status: 404 });
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE nights SET status = 'closed' WHERE status = 'collecting' AND closes_at <= ?").bind(now).run();

  const { results } = await env.DB.prepare(
    `SELECT n.id FROM nights n
      WHERE n.status IN ('reviewing', 'dropping') AND n.drop_at IS NOT NULL AND n.drop_at <= ? AND n.drop_fields IS NOT NULL
        AND EXISTS (SELECT 1 FROM night_uploads u WHERE u.night_id = n.id AND u.decision = 'keep' AND u.uploaded = 1)
      LIMIT 3`,
  )
    .bind(now)
    .all<{ id: string }>();
  const dropped: string[] = [];
  for (const { id } of results) {
    try {
      if (await runDrop(env, id)) dropped.push(id);
    } catch (e) {
      console.error("scheduled drop failed", id, e);
    }
  }
  const emailed = await sendDueEmails(env).catch((e) => {
    console.error("guest emails failed", e);
    return 0;
  });
  return NextResponse.json({ dropped, emailed });
}

type DueRow = { night_id: string; device_id: string; email_enc: string; name: string; opens_at: string; closes_at: string; location_text: string | null; token_enc: string | null; slug: string | null };

/** Sends what's due, capped per run to stay inside the Worker's subrequest limit. */
async function sendDueEmails(env: CloudflareEnv): Promise<number> {
  const now = new Date();
  const iso = now.toISOString();
  const cols = "e.night_id, e.device_id, e.email_enc, n.name, n.opens_at, n.closes_at, n.location_text, n.token_enc";
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600e3).toISOString();
  const due: Array<[EmailKind, string, unknown[]]> = [
    // "Photos are open": once the night starts and uploads open. People who signed up after it started
    // already got that in their "you're in" email.
    ["dayof", `SELECT ${cols}, NULL AS slug FROM night_emails e JOIN nights n ON n.id = e.night_id
       WHERE e.sent_dayof IS NULL AND n.status = 'collecting' AND n.opens_at <= ? AND n.closes_at > ? AND e.created_at < n.opens_at LIMIT 20`, [iso, iso]],
    // Last call: 3h before close (24h for windows of 2+ days), never within 4h of the start.
    ["closing", `SELECT ${cols}, NULL AS slug FROM night_emails e JOIN nights n ON n.id = e.night_id
       WHERE e.sent_closing IS NULL AND (e.sent_dayof IS NULL OR e.sent_dayof <= ?) AND n.status = 'collecting' AND n.closes_at > ? AND n.opens_at <= ?
         AND (julianday(n.closes_at) - julianday(?)) * 24 <= CASE WHEN (julianday(n.closes_at) - julianday(n.opens_at)) * 24 >= 48 THEN 24 ELSE 3 END
       LIMIT 20`, [fourHoursAgo, iso, fourHoursAgo, iso]],
    // Draft ready: collection over, a draft exists, not dropped yet.
    ["draft", `SELECT ${cols}, NULL AS slug FROM night_emails e JOIN nights n ON n.id = e.night_id
       WHERE e.sent_draft IS NULL AND n.closes_at <= ? AND n.status IN ('collecting', 'closed', 'reviewing')
         AND EXISTS (SELECT 1 FROM night_drafts d WHERE d.night_id = n.id) LIMIT 20`, [iso]],
    // It's up: last email, then the address is deleted.
    ["dropped", `SELECT ${cols}, p.slug AS slug FROM night_emails e JOIN nights n ON n.id = e.night_id JOIN posts p ON p.id = n.post_id
       WHERE n.status = 'dropped' LIMIT 20`, []],
  ];
  let sent = 0;
  for (const [kind, q, binds] of due) {
    if (sent >= 40) break;
    const { results } = await env.DB.prepare(q).bind(...binds).all<DueRow>();
    for (const r of results.slice(0, 40 - sent)) {
      const ok = await sendGuestEmail(env, kind, r, { id: r.night_id, name: r.name, opens_at: r.opens_at, closes_at: r.closes_at, location_text: r.location_text, token_enc: r.token_enc }, r.slug).catch(() => false);
      sent += ok ? 1 : 0;
      // Mark even on failure so a bad address can't retry forever; the drop email always ends in deletion.
      const mark =
        kind === "dropped"
          ? env.DB.prepare("DELETE FROM night_emails WHERE night_id = ? AND device_id = ?")
          : env.DB.prepare(`UPDATE night_emails SET ${kind === "dayof" ? "sent_dayof" : kind === "closing" ? "sent_closing" : "sent_draft"} = ? WHERE night_id = ? AND device_id = ?`);
      await (kind === "dropped" ? mark.bind(r.night_id, r.device_id) : mark.bind(iso, r.night_id, r.device_id)).run();
    }
  }
  return sent;
}
