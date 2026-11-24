/** Places a night or post went to. Shared by server and client code. */
export type VenueKind = "party" | "eat";
export type Venue = { name: string; url: string | null; kind: VenueKind };

export const VENUE_KINDS: Array<{ value: VenueKind; label: string }> = [
  { value: "party", label: "Party" },
  { value: "eat", label: "Eat" },
];

export const MAX_VENUES = 12;

/** Link shorteners hide where a link really goes, so they're refused. */
const SHORTENERS = new Set([
  "bit.ly", "bitly.com", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at",
  "rb.gy", "tiny.cc", "t.ly", "s.id", "v.gd", "lnkd.in", "trib.al", "bl.ink", "short.io", "shorte.st", "adf.ly", "linktr.ee",
  "qrco.de", "x.co", "u.to", "clck.ru", "soo.gd", "tr.im", "snip.ly", "urlz.fr", "2u.pw", "1url.com", "kutt.it", "shor.by",
]);
/** File types a place's website never needs to link to directly. */
const RISKY_FILE = /\.(exe|msi|apk|aab|ipa|dmg|pkg|app|bat|cmd|com|scr|pif|cpl|jar|js|mjs|vbs|vbe|wsf|ps1|psm1|sh|zip|rar|7z|tar|gz|tgz|iso|img|hta|lnk|reg|dll|deb|rpm|xlsm|docm|pptm)$/i;

/**
 * Normalize a place's website. Strict on purpose, since guests can submit these:
 * https only; a real public domain (no IPs, localhost, internal names, odd
 * ports or look-alike "xn--" domains); no logins in the link; no shorteners;
 * no downloadable/script files. Query strings and #fragments are dropped
 * (tracking or tokens only) unless `keepQuery` is set for crew.
 * Returns null for blanks, or an error for anything else that fails.
 */
export function cleanVenueUrl(raw: unknown, opts: { keepQuery?: boolean } = {}): string | null | { error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const bad = { error: "That website doesn't look right. Use the place's own site, like rickscafe.com." };
  if (s.length > 300 || /[\s<>"'`\\]|[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(s)) return bad;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return bad;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Websites have to start with http or https." };
  u.protocol = "https:";
  if (u.username || u.password) return bad;
  if (u.port && u.port !== "443") return bad;
  u.port = "";
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  if (
    labels.length < 2 ||
    host.length > 253 ||
    /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[") ||
    !labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ||
    labels.some((l) => l.startsWith("xn--")) ||
    !/^[a-z]{2,24}$/.test(labels[labels.length - 1]) ||
    /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|example|invalid|onion|arpa)$/.test(host)
  ) {
    return bad;
  }
  if (SHORTENERS.has(host.replace(/^www\./, ""))) return { error: "No short links. Use the place's full website." };
  if (RISKY_FILE.test(decodeURIComponent(u.pathname).replace(/\/+$/, ""))) return { error: "Link to the place's website, not a file." };
  u.hostname = host;
  u.hash = "";
  if (opts.keepQuery) {
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|igsh|si$|mc_)/i.test(k)) u.searchParams.delete(k);
  } else {
    u.search = "";
  }
  const out = u.toString();
  return out.length > 200 ? bad : out;
}

/** The domain to show next to a link, so people can see where it goes. */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The same place across posts: its website's host, otherwise its lowercased name. */
export function placeKey(name: string, url: string | null): string {
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      // fall through
    }
  }
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** URL-safe anchor for a place on /places. */
export const placeAnchor = (key: string) => key.replace(/[^a-z0-9]+/gi, "-");

/** Validate a list from a form. */
export function cleanVenues(input: unknown): Venue[] | { error: string } {
  const out: Venue[] = [];
  for (const v of (Array.isArray(input) ? input : []).slice(0, MAX_VENUES)) {
    const name = typeof v?.name === "string" ? v.name.trim().slice(0, 60) : "";
    const rawUrl = typeof v?.url === "string" ? v.url : "";
    if (!name && !rawUrl.trim()) continue;
    if (!name) return { error: "Every place needs a name." };
    const url = cleanVenueUrl(rawUrl, { keepQuery: true });
    if (url && typeof url === "object") return { error: `${name}: ${url.error}` };
    out.push({ name, url: url as string | null, kind: v?.kind === "eat" ? "eat" : "party" });
  }
  return out;
}

/** Parse the JSON stored on a night (older entries have no kind: treat as party). */
export function parseVenueJson(raw: string | null): Venue[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v)
      ? v
          .filter((x) => typeof x?.name === "string")
          .map((x) => ({ name: x.name, url: typeof x.url === "string" && x.url ? x.url : null, kind: x.kind === "eat" ? "eat" : "party" }))
      : [];
  } catch {
    return [];
  }
}
