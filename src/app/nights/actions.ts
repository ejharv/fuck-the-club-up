"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { runDrop, type DropFields } from "@/lib/drop";
import { cf } from "@/lib/env";
import { defaultClosesAt, getNight, isStuckDrop, latestDraft } from "@/lib/nights";
import { clean, validatePostFields, type PostFieldsInput } from "@/lib/post-fields";
import { NotAllowed, requireAdmin } from "@/lib/session";

export type AdminResult = { error: string } | { ok: true; token?: string } | undefined;

const fail = (e: unknown): AdminResult => {
  if (e instanceof NotAllowed) return { error: e.message };
  throw e;
};

/** Parses a datetime-local value as Ann Arbor time. */
function detroitToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  for (const offset of [4, 5]) {
    const guess = new Date(Date.UTC(y, m - 1, day, hh + offset, mm));
    const back = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(guess).replace(", ", "T");
    if (back === local) return guess.toISOString();
  }
  return null;
}

export async function createNight(_prev: AdminResult, form: FormData): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const env = await cf();
    const name = clean(form.get("name"), 100);
    const startsLocal = String(form.get("startsAt") ?? "");
    if (!name) return { error: "Name the night." };
    const opensAt = detroitToIso(startsLocal);
    if (!opensAt) return { error: "Pick when the party starts." };
    const nightOf = startsLocal.slice(0, 10);
    const closesLocal = String(form.get("closesAt") ?? "");
    let closesAt = closesLocal ? detroitToIso(closesLocal) : defaultClosesAt(nightOf);
    if (!closesAt) return { error: "Pick a real close time." };
    if (new Date(closesAt) <= new Date()) closesAt = new Date(Date.now() + 7 * 864e5).toISOString(); // past nights: a week to collect
    if (new Date(closesAt) <= new Date(opensAt)) return { error: "The link has to close after the party starts." };

    const token = randomToken();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO nights (id, name, night_of, token_hash, opens_at, closes_at, invite_details, location_text, dress_code, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, name, nightOf, await sha256Hex(token), opensAt, closesAt, clean(form.get("details"), 2000),
        clean(form.get("location"), 200), clean(form.get("dressCode"), 100), admin.email, new Date().toISOString())
      .run();
    redirect(`/nights/${id}?link=${encodeURIComponent(token)}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return fail(e);
  }
}

async function adminNight(nightId: string) {
  await requireAdmin();
  const night = await getNight(String(nightId));
  if (!night) throw new NotAllowed("That night doesn't exist.");
  return { env: await cf(), night };
}

export async function regenerateLink(nightId: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const token = randomToken();
    await env.DB.prepare("UPDATE nights SET token_hash = ? WHERE id = ?").bind(await sha256Hex(token), night.id).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true, token };
  } catch (e) {
    return fail(e);
  }
}

export async function setUploadWindow(nightId: string, open: boolean): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    if (open) {
      const closes = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      await env.DB.prepare("UPDATE nights SET status = 'collecting', closes_at = ? WHERE id = ? AND status IN ('collecting', 'closed')")
        .bind(closes, night.id)
        .run();
    } else {
      await env.DB.prepare("UPDATE nights SET status = 'closed', closes_at = ? WHERE id = ? AND status = 'collecting'")
        .bind(new Date().toISOString(), night.id)
        .run();
    }
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setAlbumOpen(nightId: string, open: boolean): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    await env.DB.prepare("UPDATE nights SET album_open = ? WHERE id = ?").bind(open ? 1 : 0, night.id).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUpload(
  nightId: string,
  key: string,
  change: { decision?: "keep" | "toss" | "pending"; caption?: string; cover?: boolean },
): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const stmts: D1PreparedStatement[] = [];
    if (change.decision && ["keep", "toss", "pending"].includes(change.decision)) {
      stmts.push(env.DB.prepare("UPDATE night_uploads SET decision = ? WHERE r2_key = ? AND night_id = ?").bind(change.decision, key, night.id));
    }
    if (typeof change.caption === "string") {
      stmts.push(env.DB.prepare("UPDATE night_uploads SET caption = ? WHERE r2_key = ? AND night_id = ?").bind(clean(change.caption, 300), key, night.id));
    }
    if (change.cover) {
      stmts.push(env.DB.prepare("UPDATE night_uploads SET is_cover = 0 WHERE night_id = ?").bind(night.id));
      stmts.push(env.DB.prepare("UPDATE night_uploads SET is_cover = 1, decision = 'keep' WHERE r2_key = ? AND night_id = ? AND kind = 'photo'").bind(key, night.id));
    }
    if (stmts.length) await env.DB.batch(stmts);
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkDecision(nightId: string, keys: string[], decision: "keep" | "toss"): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const list = keys.slice(0, 200);
    if (list.length) {
      await env.DB.batch(list.map((k) => env.DB.prepare("UPDATE night_uploads SET decision = ? WHERE r2_key = ? AND night_id = ?").bind(decision, k, night.id)));
    }
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Removes a file from the album and the inbox for good. */
export async function deleteUpload(nightId: string, key: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    if (!key.startsWith(`nights/${night.id}/`)) return { error: "Unknown file." };
    await env.INBOX.delete(key);
    await env.DB.prepare("DELETE FROM night_uploads WHERE r2_key = ? AND night_id = ?").bind(key, night.id).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAccount(nightId: string, deviceId: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    await env.DB.prepare("DELETE FROM night_accounts WHERE night_id = ? AND device_id = ?").bind(night.id, deviceId).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type DraftEdit = { title: string; dek: string; nightLabel: string; damage: string; rideHome: string; body: string };

/** Saving an edit makes a new version, which resets approvals. */
export async function saveDraftEdit(nightId: string, d: DraftEdit): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const title = clean(d.title, 140);
    const body = clean(d.body, 60_000);
    if (!title || !body) return { error: "The draft needs a title and a body." };
    const prev = await latestDraft(night.id);
    await env.DB.prepare(
      `INSERT INTO night_drafts (night_id, version, title, dek, night_label, damage, ride_home, body, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'edit', ?)`,
    )
      .bind(night.id, (prev?.version ?? 0) + 1, title, clean(d.dek, 200), clean(d.nightLabel, 80), clean(d.damage, 80), clean(d.rideHome, 160), body, new Date().toISOString())
      .run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addAdminNote(nightId: string, body: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const draft = await latestDraft(night.id);
    const text = clean(body, 600);
    if (!draft || !text) return { error: "Write a note on the current draft." };
    await env.DB.prepare("INSERT INTO night_notes (id, night_id, version, device_id, nickname, body, created_at) VALUES (?, ?, ?, NULL, NULL, ?, ?)")
      .bind(crypto.randomUUID(), night.id, draft.version, text, new Date().toISOString())
      .run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Places you went, with their websites. Claude may link only these. */
export async function setVenues(nightId: string, venues: Array<{ name: string; url: string }>): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const clean_: Array<{ name: string; url: string }> = [];
    for (const v of (Array.isArray(venues) ? venues : []).slice(0, 12)) {
      const name = clean(v?.name, 60);
      const raw = String(v?.url ?? "").trim();
      if (!name && !raw) continue;
      if (!name) return { error: "Every website needs a place name." };
      let url: URL;
      try {
        url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      } catch {
        return { error: `${name}: that website doesn't look right.` };
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return { error: `${name}: websites have to start with http or https.` };
      clean_.push({ name, url: url.toString().slice(0, 300) });
    }
    await env.DB.prepare("UPDATE nights SET venues = ? WHERE id = ?").bind(JSON.stringify(clean_), night.id).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function dropFieldsFor(
  nightId: string,
  input: PostFieldsInput,
): Promise<{ ok: false; error: string } | { ok: true; env: CloudflareEnv; night: NonNullable<Awaited<ReturnType<typeof getNight>>>; drop: DropFields }> {
  const { env, night } = await adminNight(nightId);
  if (night.status === "dropped" || (night.status === "dropping" && !isStuckDrop(night))) throw new NotAllowed("This night already dropped.");
  const fields = validatePostFields({ ...input, nightOf: night.night_of });
  if ("error" in fields) return { ok: false, error: fields.error };
  const admin = await requireAdmin();
  const drop: DropFields = { ...fields, authorEmail: admin.email };
  return { ok: true, env, night, drop };
}

export async function dropNow(nightId: string, input: PostFieldsInput): Promise<AdminResult> {
  let slug: string | null = null;
  try {
    const r = await dropFieldsFor(nightId, input);
    if (!r.ok) return { error: r.error };
    const { env, night, drop } = r;
    await env.DB.prepare("UPDATE nights SET drop_fields = ?, drop_at = NULL WHERE id = ?").bind(JSON.stringify(drop), night.id).run();
    let postId: string | null = null;
    try {
      postId = await runDrop(env, night.id);
    } catch (e) {
      console.error("drop failed partway", night.id, e);
    }
    if (!postId) {
      // Let the cron pick it up too, so a stuck drop always finishes eventually.
      await env.DB.prepare("UPDATE nights SET drop_at = ? WHERE id = ? AND post_id IS NULL").bind(new Date().toISOString(), night.id).run();
      revalidatePath(`/nights/${night.id}`);
      return { error: "The drop stopped partway. Hit Drop now again to finish it (files already copied won't copy twice), or the next 15-minute cron run will." };
    }
    slug = (await env.DB.prepare("SELECT slug FROM posts WHERE id = ?").bind(postId).first<{ slug: string }>())?.slug ?? null;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/");
  redirect(slug ? `/posts/${slug}` : `/nights/${nightId}`);
}

export async function scheduleDrop(nightId: string, input: PostFieldsInput, dropAtLocal: string): Promise<AdminResult> {
  try {
    const r = await dropFieldsFor(nightId, input);
    if (!r.ok) return { error: r.error };
    const at = detroitToIso(dropAtLocal);
    if (!at || new Date(at) <= new Date()) return { error: "Pick a drop time in the future." };
    const { env, night, drop } = r;
    const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM night_uploads WHERE night_id = ? AND decision = 'keep' AND uploaded = 1")
      .bind(night.id)
      .first<{ n: number }>();
    if (!kept?.n) return { error: "Keep at least one photo or video before scheduling, or use Drop now." };
    await env.DB.prepare("UPDATE nights SET status = 'reviewing', drop_at = ?, drop_fields = ? WHERE id = ?")
      .bind(at, JSON.stringify(drop), night.id)
      .run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelSchedule(nightId: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    await env.DB.prepare("UPDATE nights SET status = CASE WHEN closes_at > ? THEN 'collecting' ELSE 'closed' END, drop_at = NULL WHERE id = ? AND status = 'reviewing'")
      .bind(new Date().toISOString(), night.id)
      .run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Deletes the night, its inbox files and everything people wrote. A dropped post stays. */
export async function deleteNight(nightId: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    for (let i = 0; i < 20; i++) {
      const listed = await env.INBOX.list({ prefix: `nights/${night.id}/`, limit: 40 });
      if (!listed.objects.length) break;
      await env.INBOX.delete(listed.objects.map((o) => o.key));
      if (!listed.truncated) break;
    }
    await env.DB.prepare("DELETE FROM nights WHERE id = ?").bind(night.id).run();
  } catch (e) {
    return fail(e);
  }
  redirect("/nights");
}
