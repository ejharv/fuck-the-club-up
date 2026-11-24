import { NextResponse } from "next/server";
import { closedResponse, dropContext, noStore, requireVerified } from "@/lib/drop-context";
import { GUEST_MAX_BYTES } from "@/lib/drop";
import { ALLOWED_TYPES } from "@/lib/media-rules";
import { isCollecting, rateLimited } from "@/lib/nights";
import { canPresign, localUploadsEnabled, presignPut } from "@/lib/r2-presign";

/**
 * Hands a guest a one-time upload URL into the private INBOX bucket. Checked
 * here, before signing: the link is live, the type is allowed, and the
 * night's and this device's limits aren't used up.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const ctx = await dropContext(token);
  if (!ctx || !isCollecting(ctx.night)) return closedResponse();
  if (!requireVerified(ctx)) return NextResponse.json({ error: "Confirm you're a person first." }, { status: 401 });
  const ip = await ctx.ipHash();
  if (await rateLimited(ctx.env, ip)) return NextResponse.json({ error: "That's a lot of uploads at once. Wait a minute and keep going." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { contentType?: unknown; size?: unknown; nickname?: unknown; consent?: unknown } | null;
  if (body?.consent !== true) {
    return NextResponse.json({ error: "Tick the box: everyone in these is cool with it, and you're 21+." }, { status: 400 });
  }
  const contentType = typeof body?.contentType === "string" ? body.contentType.toLowerCase() : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  const type = ALLOWED_TYPES[contentType];
  if (!type) return NextResponse.json({ error: "That file type isn't supported. Photos, videos and audio only." }, { status: 415 });
  if (!Number.isFinite(size) || size <= 0 || size > GUEST_MAX_BYTES[type.kind]) {
    return NextResponse.json({ error: `${type.kind === "photo" ? "Photos" : type.kind === "video" ? "Videos" : "Audio files"} can be up to ${Math.round(GUEST_MAX_BYTES[type.kind] / 1048576)} MB.` }, { status: 413 });
  }

  const { env, night, device } = ctx;
  if (!canPresign(env) && !localUploadsEnabled(env)) {
    return NextResponse.json({ error: "Uploads aren't set up yet. Tell whoever sent the link." }, { status: 503 });
  }
  // Failed PUTs on bad club wifi don't use up the limits: only confirmed uploads
  // and ones signed in the last 15 minutes count.
  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes,
            SUM(CASE WHEN device_id = ? THEN 1 ELSE 0 END) AS mine
       FROM night_uploads WHERE night_id = ? AND (uploaded = 1 OR created_at > ?)`,
  )
    .bind(device, night.id, new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .first<{ files: number; bytes: number; mine: number }>();
  if ((totals?.files ?? 0) >= night.max_files || (totals?.bytes ?? 0) + size > night.max_bytes) {
    return NextResponse.json({ error: "This night's album is full. Tell whoever sent the link." }, { status: 409 });
  }
  if ((totals?.mine ?? 0) >= night.per_device_files) {
    return NextResponse.json({ error: `You've hit the ${night.per_device_files}-file limit for this night. Pick your best ones.` }, { status: 409 });
  }

  const nickname = typeof body?.nickname === "string" ? body.nickname.trim().slice(0, 40) || null : null;
  const key = `nights/${night.id}/${crypto.randomUUID()}.${type.ext}`;
  await env.DB.prepare(
    `INSERT INTO night_uploads (r2_key, night_id, kind, content_type, size, nickname, device_id, ip_hash, consented_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(key, night.id, type.kind, contentType, size, nickname, device, ip, new Date().toISOString(), new Date().toISOString())
    .run();

  const uploadUrl = canPresign(env)
    ? await presignPut(env, key, contentType, size, env.INBOX_BUCKET_NAME)
    : `/api/drop/${token}/local/${key}`;
  return NextResponse.json({ key, kind: type.kind, uploadUrl, headers: { "Content-Type": contentType } }, { headers: noStore });
}
