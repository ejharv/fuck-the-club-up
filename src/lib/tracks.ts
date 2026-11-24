/** Songs of the night. Shared by server and client code. */
export type Song = { title: string; artist: string | null; url?: string | null };

export const MAX_SONGS = 40;

export function cleanSongs(input: unknown): Song[] {
  const out: Song[] = [];
  for (const s of (Array.isArray(input) ? input : []).slice(0, MAX_SONGS)) {
    const title = typeof s?.title === "string" ? s.title.trim().slice(0, 120) : "";
    if (!title) continue;
    const artist = typeof s?.artist === "string" && s.artist.trim() ? s.artist.trim().slice(0, 120) : null;
    out.push({ title, artist });
  }
  return out;
}

/** Parse "Artist - Title" (or just "Title") lines from a textarea. */
export function songsFromLines(text: string): Song[] {
  return cleanSongs(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.split(/\s+[-–—]\s+/);
        return m.length >= 2 ? { artist: m[0], title: m.slice(1).join(" - ") } : { title: l, artist: null };
      }),
  );
}

export const songsToLines = (songs: Song[]) => songs.map((s) => (s.artist ? `${s.artist} - ${s.title}` : s.title)).join("\n");

/** A link to hear a song with no link of its own. */
export const spotifySearch = (s: Song) => `https://open.spotify.com/search/${encodeURIComponent([s.artist, s.title].filter(Boolean).join(" "))}`;
