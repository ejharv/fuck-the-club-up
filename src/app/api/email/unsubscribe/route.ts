import { cf } from "@/lib/env";
import { checkUnsubToken } from "@/lib/email";

const page = (title: string, body: string, form = "") =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#0c0d1c;color:#f2eee4;font-family:Arial,Helvetica,sans-serif;padding:40px 16px"><div style="max-width:480px;margin:0 auto">
<h1 style="text-transform:uppercase;font-size:26px">${title}</h1><p style="font-size:17px;line-height:1.5">${body}</p>${form}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );

async function remove(t: string) {
  const env = await cf();
  const who = await checkUnsubToken(env.AUTH_SECRET, t);
  if (!who) return false;
  await env.DB.prepare("DELETE FROM night_emails WHERE night_id = ? AND device_id = ?").bind(who.nightId, who.device).run();
  return true;
}

/** Shows a confirm button (so link scanners that open emails don't unsubscribe people). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const env = await cf();
  if (!(await checkUnsubToken(env.AUTH_SECRET, t))) return page("Link expired", "That unsubscribe link doesn't work anymore. If you're still getting emails, reply to one and we'll sort it out.");
  return page(
    "Stop these emails?",
    "We'll delete your email address for this night. You can still use the invite link.",
    `<form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(t)}"><button style="background:#ffcb05;color:#0c0d1c;border:0;border-radius:999px;padding:14px 24px;font-weight:bold;font-size:16px">Unsubscribe and delete my email</button></form>`,
  );
}

/** The button above, and mail apps' one-click unsubscribe (List-Unsubscribe-Post). */
export async function POST(req: Request) {
  const ok = await remove(new URL(req.url).searchParams.get("t") ?? "");
  return ok ? page("Done", "Your email is deleted. You won't hear from us about this night again.") : page("Link expired", "That unsubscribe link doesn't work anymore.");
}
