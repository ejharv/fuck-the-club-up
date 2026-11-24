import { closedResponse, dropContext } from "@/lib/drop-context";

const ics = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Add-to-calendar for the invite. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const ctx = await dropContext(token);
  if (!ctx) return closedResponse();
  const n = ctx.night;
  const end = new Date(new Date(n.opens_at).getTime() + 5 * 3600 * 1000).toISOString();
  const url = new URL(`/drop/${token}`, req.url).toString();
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fuck The Club Up//Invite//EN",
    "BEGIN:VEVENT",
    `UID:${n.id}@fucktheclubup.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(n.opens_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${ics(n.name)}`,
    n.location_text ? `LOCATION:${ics(n.location_text)}` : "",
    `DESCRIPTION:${ics(`${n.invite_details ?? ""}\n\nPhotos and the story go here after: ${url}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="invite.ics"',
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
