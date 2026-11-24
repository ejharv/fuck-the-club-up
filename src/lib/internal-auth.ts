import "server-only";
import { safeEqual } from "./crypto";

/** Internal routes (cron, drop batches) require the shared CRON_SECRET. */
export function isInternal(req: Request, env: CloudflareEnv): boolean {
  const secret = env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  return secret.length >= 16 && safeEqual(given, secret);
}
