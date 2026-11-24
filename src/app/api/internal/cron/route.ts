import { NextResponse } from "next/server";
import { runDrop } from "@/lib/drop";
import { cf } from "@/lib/env";
import { isInternal } from "@/lib/internal-auth";

/**
 * Every 15 minutes (custom-worker.ts):
 * 1. Party links past their close time stop collecting (status closed, awaiting review).
 * 2. Nights scheduled to drop, whose time has come and that have kept files, drop.
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
  return NextResponse.json({ dropped });
}
