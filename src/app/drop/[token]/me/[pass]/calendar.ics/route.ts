import { closedResponse, dropContext } from "@/lib/drop-context";
import { checkMePass } from "@/lib/nights";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Calendar event for the night that carries the guest's personal link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; pass: string }> }) {
  const { token, pass } = await params;
  const ctx = await dropContext(token);
  if (!ctx) return closedResponse();
  if (!(await checkMePass(ctx.env.AUTH_SECRET, ctx.night.id, pass))) return new Response("Not found", { status: 404 });
  const link = new URL(`/drop/${token}/me/${pass}`, req.url).toString();
  const n = ctx.night;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fuck The Club Up//Invite//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${n.id}-${pass.slice(0, 8)}@fucktheclubup.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(n.opens_at)}`,
    `DTEND:${stamp(n.closes_at)}`,
    `SUMMARY:${esc(n.name)}`,
    n.location_text ? `LOCATION:${esc(n.location_text)}` : "",
    `URL:${link}`,
    `DESCRIPTION:${esc(`Your personal party link (photos, your side of the story, the album):\n${link}\n\nDon't share this one; it signs in as you. Share the regular invite instead.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="party.ics"',
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
