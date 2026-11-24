import { closedResponse, dropContext } from "@/lib/drop-context";
import { serveObject } from "@/lib/serve-r2";

/** The shared album: anyone holding the link can view and download, while the admin keeps the album open. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; key: string[] }> }) {
  const { token, key: parts } = await params;
  const ctx = await dropContext(token);
  if (!ctx || !ctx.night.album_open) return closedResponse();
  const key = parts.join("/");
  if (!key.startsWith(`nights/${ctx.night.id}/`) || key.includes("..")) return closedResponse();
  const row = await ctx.env.DB.prepare("SELECT 1 FROM night_uploads WHERE r2_key = ? AND night_id = ? AND uploaded = 1")
    .bind(key, ctx.night.id)
    .first();
  if (!row) return closedResponse();
  const download = new URL(req.url).searchParams.get("dl") === "1";
  return serveObject(ctx.env.INBOX, key, req, { download, filename: `ftcu-${key.split("/").pop()}` });
}
