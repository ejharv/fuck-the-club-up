/** Places a night or post went to. Shared by server and client code. */
export type VenueKind = "party" | "eat";
export type Venue = { name: string; url: string | null; kind: VenueKind };

export const VENUE_KINDS: Array<{ value: VenueKind; label: string }> = [
  { value: "party", label: "Party" },
  { value: "eat", label: "Eat" },
];

export const MAX_VENUES = 12;

/** Normalize a website: https only, no tracking params. Returns null for blanks, an error string for junk. */
export function cleanVenueUrl(raw: unknown): string | null | { error: string } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Websites have to start with http or https." };
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    return u.toString().slice(0, 300);
  } catch {
    return { error: "That website doesn't look right." };
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
    const url = cleanVenueUrl(rawUrl);
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
