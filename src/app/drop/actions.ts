"use server";

import { revalidatePath } from "next/cache";
import { dropContext, requireVerified } from "@/lib/drop-context";
import { clean } from "@/lib/post-fields";
import { promoteWaitlist, rsvpStatement } from "@/lib/guests";
import { isReviewable, latestDraft, phaseOf, nameTaken } from "@/lib/nights";
import { LIMITS } from "@/lib/synthesis";
import { songsFromLines } from "@/lib/tracks";
import { cleanVenueUrl, placeKey } from "@/lib/venues";

const PLACES_PER_GUEST = 5;
const PLACES_PER_NIGHT = 30;
const LINKISH = /https?:|www\.|\.(com|net|org|io|co|ly|gg|me|app|link)\b/i;

/** Guests suggest a place (name, optional website, party/eat). A host approves it before it goes anywhere. */
export async function addGuestPlace(token: string, nameRaw: string, urlRaw: string, kindRaw: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  if (!isReviewable(ctx.night)) return { error: "This night already dropped." };
  const name = clean(nameRaw, 60);
  if (!name) return { error: "What's the place called?" };
  if (LINKISH.test(name)) return { error: "Put the website in the website box, not the name." };
  const url = cleanVenueUrl(urlRaw);
  if (url && typeof url === "object") return url;
  const kind = kindRaw === "eat" ? "eat" : "party";
  const used = await ctx.env.DB.prepare(
    "SELECT SUM(CASE WHEN device_id = ? THEN 1 ELSE 0 END) AS mine, COUNT(*) AS total FROM night_places WHERE night_id = ?",
  )
    .bind(ctx.device, ctx.night.id)
    .first<{ mine: number | null; total: number }>();
  if ((used?.mine ?? 0) >= PLACES_PER_GUEST) return { error: `That's your ${PLACES_PER_GUEST} places for this night.` };
  if ((used?.total ?? 0) >= PLACES_PER_NIGHT) return { error: "The hosts have plenty of places to look at already." };
  const dup = await ctx.env.DB.prepare("SELECT name, url FROM night_places WHERE night_id = ?").bind(ctx.night.id).all<{ name: string; url: string | null }>();
  if (dup.results.some((p) => placeKey(p.name, p.url) === placeKey(name, url))) return { error: "Someone already added that place." };
  await ctx.env.DB.prepare("INSERT INTO night_places (id, night_id, device_id, name, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), ctx.night.id, ctx.device, name, url, kind, new Date().toISOString())
    .run();
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}

export async function removeGuestPlace(token: string, id: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  await ctx.env.DB.prepare("DELETE FROM night_places WHERE id = ? AND night_id = ? AND device_id = ?").bind(String(id), ctx.night.id, ctx.device).run();
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}

const SONGS_PER_GUEST = 10;
const SONGS_PER_NIGHT = 50;

/** Guests add songs by name only ("Artist - Title"). No guest-supplied links: the site builds the Spotify/SoundCloud links itself. */
export async function addGuestSongs(token: string, text: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  if (!isReviewable(ctx.night)) return { error: "This night already dropped." };
  const raw = String(text ?? "").slice(0, 600);
  if (/https?:|www\.|\.(com|net|org|io|co|ly|gg|me|app|link)\b/i.test(raw)) {
    return { error: "No links here. Just type the song, like: The Killers - Mr. Brightside" };
  }
  const songs = songsFromLines(raw).slice(0, 5);
  if (!songs.length) return { error: "Type the song, like: The Killers - Mr. Brightside" };
  const used = await ctx.env.DB.prepare(
    "SELECT SUM(CASE WHEN device_id = ? THEN 1 ELSE 0 END) AS mine, COUNT(*) AS total FROM night_songs WHERE night_id = ?",
  )
    .bind(ctx.device, ctx.night.id)
    .first<{ mine: number | null; total: number }>();
  const room = Math.min(SONGS_PER_GUEST - (used?.mine ?? 0), SONGS_PER_NIGHT - (used?.total ?? 0));
  if (room <= 0) return { error: (used?.mine ?? 0) >= SONGS_PER_GUEST ? `That's your ${SONGS_PER_GUEST} songs for this night.` : "The playlist for this night is full." };
  const picked = songs.slice(0, room);
  const named = picked;
  const now = new Date().toISOString();
  await ctx.env.DB.batch(
    named.map((s) =>
      ctx.env.DB.prepare("INSERT INTO night_songs (id, night_id, device_id, title, artist, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
        crypto.randomUUID(), ctx.night.id, ctx.device, s.title, s.artist, null, now,
      ),
    ),
  );
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}

/** A song picked from search results. Same checks as typed songs: names only, never links. */
export async function addGuestSongPick(token: string, title: string, artist: string): Promise<DropResult> {
  const t = String(title ?? "").replace(/\s+[-–—]\s+/g, " ").trim();
  const a = String(artist ?? "").trim();
  if (!t || !a) return { error: "Pick a song." };
  return addGuestSongs(token, `${a} - ${t}`);
}

export async function removeGuestSong(token: string, id: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  await ctx.env.DB.prepare("DELETE FROM night_songs WHERE id = ? AND night_id = ? AND device_id = ?").bind(String(id), ctx.night.id, ctx.device).run();
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}

export type DropResult = { error: string } | { ok: true; waitlisted?: boolean } | undefined;

async function ctxFor(token: string) {
  const ctx = await dropContext(String(token));
  if (!ctx) return { error: "This link's closed." } as const;
  if (!requireVerified(ctx)) return { error: "Confirm you're a person first." } as const;
  return ctx;
}

const nick = (v: unknown) => clean(v, 40);

export async function rsvp(token: string, nickname: string, answer: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  if (phaseOf(ctx.night) !== "invite" && phaseOf(ctx.night) !== "live") return { error: "RSVPs are closed for this one." };
  const name = nick(nickname);
  if (!name) return { error: "Add your name or a nickname so the host knows who's coming." };
  if (!["going", "maybe", "cant"].includes(answer)) return { error: "Pick going, maybe or can't." };
  if (await nameTaken(ctx.env.DB, ctx.night.id, ctx.device, name)) {
    return { error: `Someone already RSVPed as "${name}". Add an initial or pick another nickname. If that's you (say you RSVPed in Snapchat), ask the host to send you your link.` };
  }
  await rsvpStatement(ctx.env.DB, ctx.night.id, ctx.device, name, answer, 0).run();
  await promoteWaitlist(ctx.env.DB, ctx.night.id);
  const mine = await ctx.env.DB.prepare("SELECT waitlisted FROM night_rsvps WHERE night_id = ? AND device_id = ?")
    .bind(ctx.night.id, ctx.device)
    .first<{ waitlisted: number }>();
  revalidatePath(`/drop/${token}`);
  return { ok: true, waitlisted: Boolean(mine?.waitlisted) };
}

export async function saveAccount(token: string, nickname: string, body: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  const phase = phaseOf(ctx.night);
  if (phase === "invite") return { error: "Accounts open when the party starts." };
  if (!isReviewable(ctx.night)) return { error: "This night already dropped." };
  const name = nick(nickname);
  const text = clean(body, LIMITS.accountChars);
  if (!name) return { error: "Pick a nickname. It's the only name that shows up." };
  if (!text || text.length < 20) return { error: "Give us a little more than that. What actually happened?" };
  if (await nameTaken(ctx.env.DB, ctx.night.id, ctx.device, name)) {
    return { error: `"${name}" is already taken on this night. Pick another nickname. If that's you, ask the host to send you your link.` };
  }
  await ctx.env.DB.prepare(
    `INSERT INTO night_accounts (night_id, device_id, nickname, body, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (night_id, device_id) DO UPDATE SET nickname = excluded.nickname, body = excluded.body, updated_at = excluded.updated_at`,
  )
    .bind(ctx.night.id, ctx.device, name, text, new Date().toISOString())
    .run();
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}

export async function addNote(token: string, version: number, nickname: string, body: string): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  if (!isReviewable(ctx.night)) return { error: "This night already dropped." };
  const draft = await latestDraft(ctx.night.id);
  if (!draft || draft.version !== Number(version)) return { error: "There's a newer draft. Reload to see it." };
  const text = clean(body, LIMITS.noteChars);
  if (!text) return { error: "Write the note first." };
  const count = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM night_notes WHERE night_id = ? AND version = ? AND device_id = ?")
    .bind(ctx.night.id, draft.version, ctx.device)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 8) return { error: "That's plenty of notes on this draft. Wait for the next one." };
  await ctx.env.DB.prepare(
    "INSERT INTO night_notes (id, night_id, version, device_id, nickname, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), ctx.night.id, draft.version, ctx.device, nick(nickname) ?? "Someone", text, new Date().toISOString())
    .run();
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}

export async function setApproval(token: string, version: number, approve: boolean): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  if (!isReviewable(ctx.night)) return { error: "This night already dropped." };
  const draft = await latestDraft(ctx.night.id);
  if (!draft || draft.version !== Number(version)) return { error: "There's a newer draft. Reload to see it." };
  const wrote = await ctx.env.DB.prepare("SELECT 1 FROM night_accounts WHERE night_id = ? AND device_id = ?")
    .bind(ctx.night.id, ctx.device)
    .first();
  if (!wrote) return { error: "Only people who wrote an account approve the draft." };
  await ctx.env.DB.prepare(
    approve
      ? "INSERT OR IGNORE INTO night_approvals (night_id, version, device_id, created_at) VALUES (?, ?, ?, ?)"
      : "DELETE FROM night_approvals WHERE night_id = ? AND version = ? AND device_id = ? AND ? IS NOT NULL",
  )
    .bind(ctx.night.id, draft.version, ctx.device, new Date().toISOString())
    .run();
  revalidatePath(`/drop/${token}`);
  return { ok: true };
}
