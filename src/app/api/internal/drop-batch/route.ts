import { NextResponse } from "next/server";
import { copyBatch } from "@/lib/drop";
import { cf } from "@/lib/env";
import { isInternal } from "@/lib/internal-auth";

/** One batch of a drop, in its own request so it gets its own subrequest budget. */
export async function POST(req: Request) {
  const env = await cf();
  if (!isInternal(req, env)) return new NextResponse(null, { status: 404 });
  const { nightId } = (await req.json()) as { nightId: string };
  const left = await copyBatch(env, String(nightId));
  console.log(`drop batch: night ${nightId}, ${left} files left`);
  return NextResponse.json({ left });
}
