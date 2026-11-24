"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encryptText, randomToken, sha256Hex } from "@/lib/crypto";
import { MAX_PLUS_ONES_LIMIT, UNLIMITED_PLUS_ONES, promoteWaitlist } from "@/lib/guests";
import { runDrop, type DropFields } from "@/lib/drop";
import { cf } from "@/lib/env";
import { defaultClosesAt, getNight, isStuckDrop, latestDraft } from "@/lib/nights";
import { clean, validatePostFields, type PostFieldsInput } from "@/lib/post-fields";
import { cleanSongs, type Song } from "@/lib/tracks";
import { cleanVenues, parseVenueJson } from "@/lib/venues";
import { requireNightAccess } from "@/lib/hosting";
import { NotAllowed, requireAdmin } from "@/lib/session";

export type AdminResult = { error: string } | { ok: true; token?: string } | undefined;

const fail = (e: unknown): AdminResult => {
  if (e instanceof NotAllowed) return { error: e.message };
  throw e;
};

/** Parses a datetime-local value as Michigan time (America/Detroit). */
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

/** Guest cap (blank = no limit) and +1s per guest. */
function guestLimits(capacityRaw: unknown, plusRaw: unknown): { capacity: number | null; maxPlusOnes: number } | { error: string } {
  const c = String(capacityRaw ?? "").trim();
  const capacity = c ? Math.trunc(Number(c)) : null;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 5000)) return { error: "The guest limit has to be between 1 and 5000, or blank for no limit." };
  const maxPlusOnes = Math.trunc(Number(plusRaw ?? 0) || 0);
  if (maxPlusOnes !== UNLIMITED_PLUS_ONES && (maxPlusOnes < 0 || maxPlusOnes > MAX_PLUS_ONES_LIMIT)) {
    return { error: `+1s can be 0 to ${MAX_PLUS_ONES_LIMIT}, or unlimited.` };
  }
  return { capacity, maxPlusOnes };
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

    const limits = guestLimits(form.get("capacity"), form.get("plusOnes"));
    if ("error" in limits) return limits;
    const token = randomToken();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO nights (id, name, night_of, token_hash, token_enc, capacity, max_plus_ones, opens_at, closes_at, invite_details, location_text, dress_code, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, name, nightOf, await sha256Hex(token), await encryptText(env.AUTH_SECRET, token), limits.capacity, limits.maxPlusOnes, opensAt, closesAt, clean(form.get("details"), 2000),
        clean(form.get("location"), 200), clean(form.get("dressCode"), 100), admin.email, new Date().toISOString())
      .run();
    // The creator is a host (so they can appear in "Hosted by").
    await env.DB.prepare("INSERT OR IGNORE INTO night_hosts (night_id, email, added_by, created_at) VALUES (?, ?, 'creator', ?)")
      .bind(id, admin.email, new Date().toISOString())
      .run();
        const mediaKey = String(form.get("mediaKey") ?? "");
    if (mediaKey) {
      const up = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0")
        .bind(mediaKey, admin.email)
        .first<{ kind: string; content_type: string }>();
      const head = up && (up.kind === "video" || up.kind === "photo") ? await env.MEDIA.head(mediaKey) : null;
      if (up && head && head.httpMetadata?.contentType?.toLowerCase() === up.content_type) {
        await env.DB.batch([
          env.DB.prepare("UPDATE nights SET invite_media_key = ?, invite_media_kind = ? WHERE id = ?").bind(mediaKey, up.kind, id),
          env.DB.prepare("UPDATE uploads SET used = 1 WHERE r2_key = ?").bind(mediaKey),
        ]);
      }
    }
    redirect(`/nights/${id}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return fail(e);
  }
}

/** Admins, or this night's co-hosts. */
async function adminNight(nightId: string) {
  const access = await requireNightAccess(String(nightId));
  const night = await getNight(String(nightId));
  if (!night) throw new NotAllowed("That night doesn't exist.");
  return { env: await cf(), night, access };
}

/** Admins only (creating nights, managing hosts, deleting). */
async function ownerNight(nightId: string) {
  await requireAdmin();
  const night = await getNight(String(nightId));
  if (!night) throw new NotAllowed("That night doesn't exist.");
  return { env: await cf(), night };
}

export async function regenerateLink(nightId: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const token = randomToken();
    await env.DB.prepare("UPDATE nights SET token_hash = ?, token_enc = ? WHERE id = ?")
      .bind(await sha256Hex(token), await encryptText(env.AUTH_SECRET, token), night.id)
      .run();
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

export type DraftEdit = { title: string; dek: string; nightLabel: string; damage: string; rideHome: string; body: string; songs?: Song[] };

/** Saving an edit makes a new version, which resets approvals. */
export async function saveDraftEdit(nightId: string, d: DraftEdit): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const title = clean(d.title, 140);
    const body = clean(d.body, 60_000);
    if (!title || !body) return { error: "The draft needs a title and a body." };
    const prev = await latestDraft(night.id);
    await env.DB.prepare(
      `INSERT INTO night_drafts (night_id, version, title, dek, night_label, damage, ride_home, body, songs, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'edit', ?)`,
    )
      .bind(night.id, (prev?.version ?? 0) + 1, title, clean(d.dek, 200), clean(d.nightLabel, 80), clean(d.damage, 80), clean(d.rideHome, 160), body,
        // Songs: the edited list if given, otherwise carry over the previous version's.
        d.songs ? JSON.stringify(cleanSongs(d.songs)) : (prev?.songs ?? null), new Date().toISOString())
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

/** Places you went (name, website, party/eat). Claude may link only these, and they attach to the post on drop. */
export async function setVenues(nightId: string, venues: Array<{ name: string; url: string; kind?: string }>): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const list = cleanVenues(venues);
    if ("error" in list) return { error: list.error };
    await env.DB.prepare("UPDATE nights SET venues = ? WHERE id = ?").bind(JSON.stringify(list), night.id).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Change the guest cap or +1s later. Raising the cap pulls people off the waitlist. */
export async function setGuestLimits(nightId: string, capacity: string, plusOnes: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    const limits = guestLimits(capacity, plusOnes);
    if ("error" in limits) return limits;
    await env.DB.batch([
      env.DB.prepare("UPDATE nights SET capacity = ?, max_plus_ones = ? WHERE id = ?").bind(limits.capacity, limits.maxPlusOnes, night.id),
      // Lowering the +1 limit trims existing +1s to fit.
      env.DB.prepare("UPDATE night_rsvps SET plus_ones = MIN(plus_ones, ?) WHERE night_id = ?").bind(limits.maxPlusOnes, night.id),
    ]);
    await promoteWaitlist(env.DB, night.id);
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Take someone off the guest list (and the waitlist moves up). */
export async function removeRsvp(nightId: string, deviceId: string): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    await env.DB.prepare("DELETE FROM night_rsvps WHERE night_id = ? AND device_id = ?").bind(night.id, deviceId).run();
    await promoteWaitlist(env.DB, night.id);
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Add a co-host by Google email. Admins only. */
export async function addHost(nightId: string, emailRaw: string): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    const { env, night } = await ownerNight(nightId);
    const email = String(emailRaw ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the Google email they sign in with." };
    await env.DB.prepare("INSERT OR IGNORE INTO night_hosts (night_id, email, added_by, created_at) VALUES (?, ?, ?, ?)")
      .bind(night.id, email, admin.email, new Date().toISOString())
      .run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeHost(nightId: string, email: string): Promise<AdminResult> {
  try {
    const { env, night } = await ownerNight(nightId);
    await env.DB.prepare("DELETE FROM night_hosts WHERE night_id = ? AND email = ?").bind(night.id, String(email).toLowerCase()).run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type InviteEdit = {
  name: string;
  startsAt: string; // datetime-local, Michigan time
  closesAt: string;
  location: string;
  dressCode: string;
  details: string;
  rules: string; // one per line
};

/** Hosts and admins can change the invite any time before the post drops. */
export async function updateInvite(nightId: string, f: InviteEdit): Promise<AdminResult> {
  try {
    const { env, night } = await adminNight(nightId);
    if (night.status === "dropped") return { error: "This night already dropped." };
    const name = clean(f.name, 100);
    if (!name) return { error: "Name the night." };
    const opensAt = detroitToIso(String(f.startsAt ?? ""));
    if (!opensAt) return { error: "Pick when the party starts." };
    const closesAt = detroitToIso(String(f.closesAt ?? ""));
    if (!closesAt) return { error: "Pick when photos close." };
    if (new Date(closesAt) <= new Date(opensAt)) return { error: "Photos have to close after the party starts." };
    const rules = String(f.rules ?? "")
      .split("\n")
      .map((l) => l.trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 12)
      .join("\n");
    // Moving the close time into the future reopens a closed link.
    const reopen = night.status === "closed" && new Date(closesAt) > new Date();
    await env.DB.prepare(
      `UPDATE nights SET name = ?, night_of = ?, opens_at = ?, closes_at = ?, location_text = ?, dress_code = ?, invite_details = ?, invite_rules = ?,
              status = CASE WHEN ? THEN 'collecting' ELSE status END WHERE id = ?`,
    )
      .bind(name, String(f.startsAt).slice(0, 10), opensAt, closesAt, clean(f.location, 200), clean(f.dressCode, 100), clean(f.details, 2000), rules || null, reopen ? 1 : 0, night.id)
      .run();
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Attach an uploaded video/photo (from /api/nights/[id]/invite-media) to the invite. */
export async function setInviteMedia(nightId: string, key: string | null): Promise<AdminResult> {
  try {
    const { env, night, access } = await adminNight(nightId);
    const old = night.invite_media_key;
    if (!key) {
      await env.DB.prepare("UPDATE nights SET invite_media_key = NULL, invite_media_kind = NULL WHERE id = ?").bind(night.id).run();
    } else {
      const up = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0")
        .bind(key, access.email)
        .first<{ kind: string; content_type: string }>();
      const head = up ? await env.MEDIA.head(key) : null;
      if (!up || !head || (up.kind !== "video" && up.kind !== "photo") || head.httpMetadata?.contentType?.toLowerCase() !== up.content_type) {
        return { error: "That upload didn't come through. Try again." };
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE nights SET invite_media_key = ?, invite_media_kind = ? WHERE id = ?").bind(key, up.kind, night.id),
        env.DB.prepare("UPDATE uploads SET used = 1 WHERE r2_key = ?").bind(key),
      ]);
    }
    if (old && old !== key) await env.MEDIA.delete(old);
    revalidatePath(`/nights/${night.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Store the night's drawn link-preview card (uploaded via /api/nights/[id]/invite-media). */
export async function setInviteOg(nightId: string, key: string, sig: string): Promise<AdminResult> {
  try {
    const { env, night, access } = await adminNight(nightId);
    const up = await env.DB.prepare("SELECT kind, content_type FROM uploads WHERE r2_key = ? AND email = ? AND used = 0")
      .bind(key, access.email)
      .first<{ kind: string; content_type: string }>();
    const head = up ? await env.MEDIA.head(key) : null;
    if (!up || up.content_type !== "image/png" || !head || head.size > 3 * 1048576) return { error: "The preview image didn't upload." };
    await env.DB.batch([
      env.DB.prepare("UPDATE nights SET og_key = ?, og_sig = ? WHERE id = ?").bind(key, String(sig).slice(0, 500), night.id),
      env.DB.prepare("UPDATE uploads SET used = 1 WHERE r2_key = ?").bind(key),
    ]);
    if (night.og_key && night.og_key !== key) await env.MEDIA.delete(night.og_key);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A host's name on the invite ("Hosted by …"). Hosts set their own; admins can set anyone's. */
export async function setHostName(nightId: string, email: string, nameRaw: string): Promise<AdminResult> {
  try {
    const { env, night, access } = await adminNight(nightId);
    const target = String(email ?? "").toLowerCase();
    if (access.role !== "admin" && access.email !== target) return { error: "You can only change your own name." };
    const name = clean(nameRaw, 40);
    const res = await env.DB.prepare("UPDATE night_hosts SET display_name = ? WHERE night_id = ? AND email = ?").bind(name, night.id, target).run();
    if (!res.meta.changes) {
      // An admin who isn't a host row yet (e.g. a night made before hosts existed) adds themselves.
      if (access.role === "admin" && access.email === target) {
        await env.DB.prepare("INSERT INTO night_hosts (night_id, email, added_by, created_at, display_name) VALUES (?, ?, ?, ?, ?)")
          .bind(night.id, target, target, new Date().toISOString(), name)
          .run();
      } else return { error: "That person isn't a host of this night." };
    }
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
  const admin = { email: (await requireNightAccess(night.id)).email };
  // Places and songs come from the night and its latest draft, never from the client.
  const draft = await latestDraft(night.id);
  let songs: Song[] = [];
  try {
    songs = cleanSongs(JSON.parse(draft?.songs ?? "[]"));
  } catch {
    songs = [];
  }
  const drop: DropFields = { ...fields, authorEmail: admin.email, venues: parseVenueJson(night.venues), songs };
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
    const { env, night } = await ownerNight(nightId);
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
