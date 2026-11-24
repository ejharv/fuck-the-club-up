"use server";

import { revalidatePath } from "next/cache";
import { dropContext, requireVerified } from "@/lib/drop-context";
import { clean } from "@/lib/post-fields";
import { UNLIMITED_PER_GUEST, UNLIMITED_PLUS_ONES, promoteWaitlist, rsvpStatement } from "@/lib/guests";
import { isReviewable, latestDraft, phaseOf, nameTaken } from "@/lib/nights";
import { LIMITS } from "@/lib/synthesis";

export type DropResult = { error: string } | { ok: true; waitlisted?: boolean } | undefined;

async function ctxFor(token: string) {
  const ctx = await dropContext(String(token));
  if (!ctx) return { error: "This link's closed." } as const;
  if (!requireVerified(ctx)) return { error: "Confirm you're a person first." } as const;
  return ctx;
}

const nick = (v: unknown) => clean(v, 40);

export async function rsvp(token: string, nickname: string, answer: string, plusOnes = 0): Promise<DropResult> {
  const ctx = await ctxFor(token);
  if ("error" in ctx) return ctx;
  if (phaseOf(ctx.night) !== "invite" && phaseOf(ctx.night) !== "live") return { error: "RSVPs are closed for this one." };
  const name = nick(nickname);
  if (!name) return { error: "Add your name or a nickname so the host knows who's coming." };
  if (!["going", "maybe", "cant"].includes(answer)) return { error: "Pick going, maybe or can't." };
  const plus = answer === "going" ? Math.trunc(Number(plusOnes) || 0) : 0;
  const allowed = ctx.night.max_plus_ones >= UNLIMITED_PLUS_ONES ? UNLIMITED_PER_GUEST : ctx.night.max_plus_ones;
  if (plus < 0 || plus > allowed) {
    return { error: allowed ? `You can bring up to ${allowed}.` : "This one's no +1s." };
  }
  if (await nameTaken(ctx.env.DB, ctx.night.id, ctx.device, name)) {
    return { error: `Someone already RSVPed as "${name}". Add an initial or pick another nickname. If that's you on another phone, use your personal link.` };
  }
  await rsvpStatement(ctx.env.DB, ctx.night.id, ctx.device, name, answer, plus).run();
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
    return { error: `"${name}" is already taken on this night. Pick another nickname, or use your personal link if that's you.` };
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
