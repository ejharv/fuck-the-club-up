"use server";

import { revalidatePath } from "next/cache";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { cf } from "@/lib/env";
import { INVITE_RULES } from "@/lib/invites";
import { clean } from "@/lib/post-fields";
import { NotAllowed, requireAdmin } from "@/lib/session";

export type InviteResult = { error: string } | { ok: true; token: string; role: "admin" | "crew" } | undefined;

export async function createInvite(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  try {
    const admin = await requireAdmin();
    const role = form.get("role") === "admin" ? "admin" : "crew";
    // Crew invites never ask for an email: whoever opens the link claims it with their Google account.
    const email = form.get("role") === "admin" ? String(form.get("email") ?? "").trim().toLowerCase() : "";
    const hours = Number(form.get("hours") ?? 72);
    const uses = Number(form.get("uses") ?? 1);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };

    // Admin invites are always single use and short-lived; without an email, at most 24 hours.
    const maxHours = role === "admin" ? (email ? INVITE_RULES.adminMaxHours : 24) : INVITE_RULES.crewMaxHours;
    if (!Number.isFinite(hours) || hours < 1 || hours > maxHours) return { error: `${role === "admin" ? "Admin" : "Crew"} invites can last up to ${maxHours} hours.` };
    const maxUses = role === "admin" ? 1 : Math.trunc(uses);
    if (maxUses < 1 || maxUses > INVITE_RULES.crewMaxUses) return { error: `Crew invites can be used 1 to ${INVITE_RULES.crewMaxUses} times.` };
    if (email && maxUses > 1) return { error: "An invite locked to one email can only be used once." };

    const env = await cf();
    if (email) {
      const m = await env.DB.prepare("SELECT role FROM members WHERE email = ?").bind(email).first<{ role: string }>();
      if (m && (m.role === "admin" || role === "crew")) return { error: "That person is already on the list with that access." };
    }
    const token = randomToken();
    await env.DB.prepare(
      `INSERT INTO crew_invites (id, token_hash, role, email, label, max_uses, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), await sha256Hex(token), role, email || null, clean(form.get("label"), 60), maxUses,
        new Date(Date.now() + hours * 3600 * 1000).toISOString(), admin.email, new Date().toISOString())
      .run();
    revalidatePath("/crew");
    return { ok: true, token, role };
  } catch (e) {
    if (e instanceof NotAllowed) return { error: e.message };
    throw e;
  }
}

export async function revokeInvite(form: FormData): Promise<void> {
  await requireAdmin();
  const env = await cf();
  await env.DB.prepare("UPDATE crew_invites SET revoked = 1 WHERE id = ?").bind(String(form.get("id") ?? "")).run();
  revalidatePath("/crew");
}
