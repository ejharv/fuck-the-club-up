import "server-only";

/**
 * Headcount for a night: everyone "going" (not waitlisted) plus their +1s.
 * All changes go through these statements so the count can't overshoot the
 * cap, even when two people grab the last spot at the same time (each
 * statement checks and writes in one step).
 */

export type GuestCounts = { going: number; headcount: number; waitlist: number; maybe: number; capacity: number | null };

export async function guestCounts(DB: D1Database, nightId: string, capacity: number | null): Promise<GuestCounts> {
  const r = await DB.prepare(
    `SELECT
       SUM(CASE WHEN answer = 'going' AND waitlisted = 0 THEN 1 ELSE 0 END) AS going,
       SUM(CASE WHEN answer = 'going' AND waitlisted = 0 THEN 1 + plus_ones ELSE 0 END) AS headcount,
       SUM(CASE WHEN answer = 'going' AND waitlisted = 1 THEN 1 ELSE 0 END) AS waitlist,
       SUM(CASE WHEN answer = 'maybe' THEN 1 ELSE 0 END) AS maybe
     FROM night_rsvps WHERE night_id = ? AND approved = 1`,
  )
    .bind(nightId)
    .first<{ going: number | null; headcount: number | null; waitlist: number | null; maybe: number | null }>();
  return { going: r?.going ?? 0, headcount: r?.headcount ?? 0, waitlist: r?.waitlist ?? 0, maybe: r?.maybe ?? 0, capacity };
}

/**
 * Upsert one RSVP. For "going", the row is waitlisted when it wouldn't fit
 * under the cap (computed inside the same statement).
 */
export function rsvpStatement(DB: D1Database, nightId: string, device: string, nickname: string, answer: string, plusOnes: number, approved = 1) {
  const now = new Date().toISOString();
  return DB.prepare(
    `INSERT INTO night_rsvps (night_id, device_id, nickname, answer, plus_ones, approved, waitlisted, created_at, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?7,
       CASE WHEN ?4 = 'going' AND n.capacity IS NOT NULL AND
         (SELECT COALESCE(SUM(1 + r.plus_ones), 0) FROM night_rsvps r
           WHERE r.night_id = ?1 AND r.answer = 'going' AND r.waitlisted = 0 AND r.approved = 1 AND r.device_id != ?2) + 1 + ?5 > n.capacity
       THEN 1 ELSE 0 END,
       ?6, ?6
     FROM nights n WHERE n.id = ?1
     ON CONFLICT (night_id, device_id) DO UPDATE SET
       nickname = excluded.nickname, answer = excluded.answer, plus_ones = excluded.plus_ones,
       waitlisted = excluded.waitlisted, updated_at = excluded.updated_at,
       -- Keep your place in line if you were already waitlisted and stay "going".
       created_at = CASE WHEN night_rsvps.answer = 'going' AND excluded.answer = 'going' THEN night_rsvps.created_at ELSE excluded.created_at END`,
  ).bind(nightId, device, nickname, answer, plusOnes, now, approved);
}

/**
 * Move waitlisted guests up, oldest first, while they fit. Run after any change
 * that can free a spot (someone leaves, drops +1s, an admin removes someone or
 * raises the cap). Each promotion re-checks the cap in its own statement.
 */
export async function promoteWaitlist(DB: D1Database, nightId: string) {
  const { results } = await DB.prepare(
    "SELECT device_id FROM night_rsvps WHERE night_id = ? AND answer = 'going' AND waitlisted = 1 AND approved = 1 ORDER BY created_at LIMIT 50",
  )
    .bind(nightId)
    .all<{ device_id: string }>();
  if (!results.length) return;
  await DB.batch(
    results.map((r) =>
      DB.prepare(
        `UPDATE night_rsvps SET waitlisted = 0
          WHERE night_id = ?1 AND device_id = ?2 AND waitlisted = 1 AND EXISTS (
            SELECT 1 FROM nights n WHERE n.id = ?1 AND (n.capacity IS NULL OR
              (SELECT COALESCE(SUM(1 + x.plus_ones), 0) FROM night_rsvps x
                WHERE x.night_id = ?1 AND x.answer = 'going' AND x.waitlisted = 0 AND x.approved = 1)
              + 1 + (SELECT plus_ones FROM night_rsvps y WHERE y.night_id = ?1 AND y.device_id = ?2) <= n.capacity))`,
      ).bind(nightId, r.device_id),
    ),
  );
}

/** A host lets a request in: it joins the list (or the waitlist if the night is full). */
export function approveStatement(DB: D1Database, nightId: string, device: string) {
  return DB.prepare(
    `UPDATE night_rsvps SET approved = 1, updated_at = ?3,
       waitlisted = CASE WHEN answer = 'going' AND (SELECT capacity FROM nights WHERE id = ?1) IS NOT NULL AND
         (SELECT COALESCE(SUM(1 + r.plus_ones), 0) FROM night_rsvps r
           WHERE r.night_id = ?1 AND r.answer = 'going' AND r.waitlisted = 0 AND r.approved = 1) + 1 + plus_ones > (SELECT capacity FROM nights WHERE id = ?1)
       THEN 1 ELSE 0 END
     WHERE night_id = ?1 AND device_id = ?2 AND approved = 0`,
  ).bind(nightId, device, new Date().toISOString());
}
