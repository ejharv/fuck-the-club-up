import "server-only";

/** A song search result. Art is only ever an Apple/Deezer image URL we checked. */
export type SongHit = { title: string; artist: string; art: string | null };

const ART = /^https:\/\/(is\d+-ssl\.mzstatic\.com|e-cdns-images\.dzcdn\.net|cdn-images\.dzcdn\.net)\//;
const text = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 120) : "");
const art = (v: unknown) => (typeof v === "string" && ART.test(v) ? v : null);

/** Apple's public catalog search (no key needed), with Deezer's as a fallback. */
export async function searchSongs(q: string): Promise<SongHit[]> {
  try {
    const u = new URL("https://itunes.apple.com/search");
    u.search = new URLSearchParams({ term: q, media: "music", entity: "song", limit: "8", country: "US" }).toString();
    const res = await fetch(u, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const d = (await res.json()) as { results?: Array<{ trackName?: string; artistName?: string; artworkUrl100?: string }> };
      const hits = (d.results ?? []).map((r) => ({ title: text(r.trackName), artist: text(r.artistName), art: art(r.artworkUrl100) })).filter((h) => h.title && h.artist);
      if (hits.length) return dedupe(hits);
    }
  } catch {
    // fall through to Deezer
  }
  try {
    const res = await fetch(`https://api.deezer.com/search?limit=8&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const d = (await res.json()) as { data?: Array<{ title?: string; artist?: { name?: string }; album?: { cover_small?: string } }> };
    return dedupe((d.data ?? []).map((r) => ({ title: text(r.title), artist: text(r.artist?.name), art: art(r.album?.cover_small) })).filter((h) => h.title && h.artist));
  } catch {
    return [];
  }
}

function dedupe(hits: SongHit[]): SongHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.artist}|${h.title}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
