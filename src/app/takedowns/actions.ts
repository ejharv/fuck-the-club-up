"use server";

import { revalidatePath } from "next/cache";
import { cf } from "@/lib/env";
import { requireAdmin } from "@/lib/session";

export async function resolveTakedown(form: FormData): Promise<void> {
  await requireAdmin();
  const env = await cf();
  await env.DB.prepare("UPDATE takedown_requests SET status = 'done', resolved_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), String(form.get("id") ?? ""))
    .run();
  revalidatePath("/takedowns");
}
