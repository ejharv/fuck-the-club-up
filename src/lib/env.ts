import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Per-request Cloudflare bindings (D1, R2, vars, secrets). */
export async function cf(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}
