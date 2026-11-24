import { NextResponse } from "next/server";
import { cf } from "@/lib/env";
import { serveObject } from "@/lib/serve-r2";
import { nightRole } from "@/lib/hosting";

/** Admin preview of a night's inbox. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; key: string[] }> }) {
  const { id, key: parts } = await params;
  if (!(await nightRole(id))) return new NextResponse(null, { status: 404 });
  const key = parts.join("/");
  if (!key.startsWith(`nights/${id}/`) || key.includes("..")) return new NextResponse(null, { status: 404 });
  const env = await cf();
  return serveObject(env.INBOX, key, req, { download: new URL(req.url).searchParams.get("dl") === "1" });
}
