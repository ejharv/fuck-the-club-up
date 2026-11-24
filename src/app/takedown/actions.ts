"use server";

import { cf } from "@/lib/env";
import { ipHash, rateLimited, verifyTurnstile } from "@/lib/nights";
import { clean } from "@/lib/post-fields";

export type TakedownResult = { error: string } | { ok: true } | undefined;

/** Public: anyone can ask for something to come down. Turnstile + rate limit against spam. */
export async function requestTakedown(_prev: TakedownResult, form: FormData): Promise<TakedownResult> {
  const env = await cf();
  if (await rateLimited(env, `takedown:${await ipHash(env.AUTH_SECRET)}`)) return { error: "Too many requests. Try again in a minute." };
  const turnstile = String(form.get("cf-turnstile-response") ?? "");
  if (!(await verifyTurnstile(env, turnstile, null))) return { error: "Couldn't confirm you're a person. Reload and try again." };
  const post = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(String(form.get("post") ?? "")).first<{ id: string }>();
  if (!post) return { error: "That post doesn't exist anymore." };
  const mediaId = String(form.get("mediaId") ?? "");
  const media = mediaId
    ? await env.DB.prepare("SELECT id FROM media WHERE id = ? AND post_id = ?").bind(mediaId, post.id).first<{ id: string }>()
    : null;
  const reason = clean(form.get("reason"), 1000);
  if (!media && !reason) return { error: "Pick the photo, or tell us what should come down." };
  await env.DB.prepare(
    "INSERT INTO takedown_requests (id, post_id, media_id, contact, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), post.id, media?.id ?? null, clean(form.get("contact"), 200), reason, new Date().toISOString())
    .run();
  return { ok: true };
}
