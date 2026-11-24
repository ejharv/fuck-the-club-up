import "server-only";
import { AwsClient } from "aws4fetch";
import { decryptText, encryptText, hmacHex, safeEqual } from "./crypto";
import { mePass } from "./nights";
import { SITE_URL } from "./sections";

/**
 * Optional guest emails: "your link + reminders" for a night. Sent through
 * Amazon SES from party@fucktheclubup.com with a send-only key. Addresses are
 * encrypted at rest, never shown to anyone (the guest sees a masked hint),
 * and deleted after the night's "it's up" email.
 */
export const FROM = "FTCU <party@fucktheclubup.com>";
export const MAX_EMAILS_PER_NIGHT = 300;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function cleanEmail(raw: unknown): string | null {
  const e = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (e.length > 254 || !EMAIL_RE.test(e) || !/\.[a-z]{2,24}$/.test(e)) return null;
  return e;
}

export const emailHash = (secret: string, email: string) => hmacHex(secret, `email:${email}`);
export const emailHint = (email: string) => {
  const [u, d] = email.split("@");
  return `${u.slice(0, 1)}•••@${d}`;
};
export const sealEmail = (secret: string, email: string) => encryptText(secret, `email:${email}`);
export async function openEmail(secret: string, sealed: string): Promise<string | null> {
  const v = await decryptText(secret, sealed);
  return v?.startsWith("email:") ? v.slice(6) : null;
}

/** Unsubscribe token for one guest's email on one night. */
export async function unsubToken(secret: string, nightId: string, device: string) {
  return `${nightId}.${device}.${(await hmacHex(secret, `unsub:${nightId}:${device}`)).slice(0, 32)}`;
}
export async function checkUnsubToken(secret: string, t: string): Promise<{ nightId: string; device: string } | null> {
  const parts = t.split(".");
  if (parts.length !== 3) return null;
  const [nightId, device, sig] = parts;
  const want = (await hmacHex(secret, `unsub:${nightId}:${device}`)).slice(0, 32);
  return safeEqual(sig, want) ? { nightId, device } : null;
}

export async function sendEmail(
  env: CloudflareEnv,
  msg: { to: string; subject: string; text: string; html: string; unsubscribeUrl: string },
): Promise<boolean> {
  const e = env as unknown as { SES_ACCESS_KEY_ID?: string; SES_SECRET_ACCESS_KEY?: string };
  if (!e.SES_ACCESS_KEY_ID || !e.SES_SECRET_ACCESS_KEY) return false;
  const aws = new AwsClient({ accessKeyId: e.SES_ACCESS_KEY_ID, secretAccessKey: e.SES_SECRET_ACCESS_KEY, service: "ses", region: "us-east-1" });
  const res = await aws.fetch("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [msg.to] },
      ConfigurationSetName: "fuck-the-club-up",
      Content: {
        Simple: {
          Subject: { Data: msg.subject, Charset: "UTF-8" },
          Body: { Text: { Data: msg.text, Charset: "UTF-8" }, Html: { Data: msg.html, Charset: "UTF-8" } },
        },
      },
    }),
  });
  if (!res.ok) console.error("ses send failed", res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });

export type EmailKind = "confirm" | "dayof" | "closing" | "draft" | "dropped";

/** One of the four guest emails. Plain, short, one button. */
export async function guestEmail(
  env: CloudflareEnv,
  kind: EmailKind,
  n: { id: string; name: string; opens_at: string; closes_at?: string; location_text: string | null },
  token: string,
  device: string,
  postSlug?: string | null,
) {
  const link = `${SITE_URL}/drop/${token}/me/${await mePass(env.AUTH_SECRET, n.id, device)}`;
  const unsubscribeUrl = `${SITE_URL}/api/email/unsubscribe?t=${encodeURIComponent(await unsubToken(env.AUTH_SECRET, n.id, device))}`;
  const name = n.name.slice(0, 100);
  const copy: Record<EmailKind, { subject: string; lines: string[]; button: string; url: string }> = {
    confirm: {
      subject: `You're in: ${name}`,
      lines: [
        `You're on the list for ${name}, ${when(n.opens_at)}${n.location_text ? ` at ${n.location_text}` : ""}.`,
        "This button is your personal link. It signs you back in as you from any phone or browser, so you can drop photos and tell your side on the night. Don't forward it.",
        "We'll email you when photos open, before they close, and when the write-up is ready. That's it.",
      ],
      button: "Open my invite",
      url: link,
    },
    dayof: {
      subject: `Photos are open: ${name}`,
      lines: [
        `${name} is on${n.location_text ? ` at ${n.location_text}` : ""}. Photos are open.`,
        "Tap below to drop your photos and videos as the night goes, then write your side of the story after. It's your personal link, so you're already signed in.",
      ],
      button: "Add my photos",
      url: link,
    },
    closing: {
      subject: `Last call: ${name}`,
      lines: [
        `Photos and stories for ${name} close ${n.closes_at ? when(n.closes_at) : "soon"}.`,
        "If you haven't yet, drop your photos and write your side of the night. Two minutes, tops. After that, it all gets written up.",
      ],
      button: "Add mine",
      url: link,
    },
    draft: {
      subject: `The write-up is ready: ${name}`,
      lines: ["Everyone's side of the night is now one draft. Read it, leave notes, and approve it if it's right."],
      button: "Read the draft",
      url: link,
    },
    dropped: {
      subject: `It's up: ${name}`,
      lines: ["The night report is live. Thanks for being there.", "This is the last email about this night. We've deleted your address."],
      button: "Read it",
      url: postSlug ? `${SITE_URL}/posts/${postSlug}` : link,
    },
  };
  const live = new Date(n.opens_at) <= new Date();
  if (kind === "confirm" && live) {
    copy.confirm.lines = [
      `You're in for ${name}, and photos are open now.`,
      "This button is your personal link. It signs you back in as you from any phone or browser: drop your photos and videos and write your side of the story. Don't forward it.",
      "We'll email you before photos close, and when the write-up is ready. That's it.",
    ];
    copy.confirm.button = "Add my photos";
  }
  const c = copy[kind];
  const text = `${c.lines.join("\n\n")}\n\n${c.button}: ${c.url}\n\n—\nFTCU\nYou're getting this because you added your email on a party invite. Unsubscribe and delete your email: ${unsubscribeUrl}\nIf this wasn't you, ignore it or unsubscribe and you won't hear from us again.`;
  // Deliberately plain: personal-looking mail lands in Gmail's Primary tab; designed layouts and big buttons go to Promotions.
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">
${c.lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("")}
<p style="margin:0 0 12px">${esc(c.button)}: <a href="${esc(c.url)}">${esc(c.url.replace(/^https:\/\//, "").slice(0, 60))}${c.url.length > 68 ? "…" : ""}</a></p>
<p style="margin:16px 0 0;color:#777;font-size:13px">FTCU<br>You got this because you added your email on a party invite. <a href="${esc(unsubscribeUrl)}" style="color:#777">Unsubscribe and delete my email</a>.</p>
</div>`;
  return { subject: c.subject, text, html, unsubscribeUrl };
}

export async function sendGuestEmail(
  env: CloudflareEnv,
  kind: EmailKind,
  row: { email_enc: string; device_id: string },
  n: { id: string; name: string; opens_at: string; closes_at?: string; location_text: string | null; token_enc: string | null },
  postSlug?: string | null,
): Promise<boolean> {
  const to = await openEmail(env.AUTH_SECRET, row.email_enc);
  const token = await decryptText(env.AUTH_SECRET, n.token_enc);
  if (!to || !token) return false;
  const m = await guestEmail(env, kind, n, token, row.device_id, postSlug);
  return sendEmail(env, { to, ...m });
}
