/** Songs of the night. Shared by server and client code. */
export type Song = { title: string; artist: string | null; url?: string | null };

export const MAX_SONGS = 80;

/** Music links people can paste: Spotify, SoundCloud, YouTube, Apple Music, Tidal, Deezer, Bandcamp. */
const MUSIC_HOST = /^(open\.spotify\.com|spotify\.link|(on\.|m\.)?soundcloud\.com|((www|m|music)\.)?youtube\.com|youtu\.be|music\.apple\.com|(listen\.)?tidal\.com|(www\.)?deezer\.com|deezer\.page\.link|[a-z0-9-]+\.bandcamp\.com)$/i;

/** A cleaned music link, or null if it isn't one. */
export function musicLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/https?:\/\/\S+/);
  if (!m) return null;
  try {
    const u = new URL(m[0].replace(/[).,]+$/, ""));
    if (!MUSIC_HOST.test(u.hostname)) return null;
    u.protocol = "https:";
    // Spotify share links carry tracking params; the track id is all we need.
    if (/spotify\.com$/.test(u.hostname)) u.search = "";
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function cleanSongs(input: unknown): Song[] {
  const out: Song[] = [];
  for (const s of (Array.isArray(input) ? input : []).slice(0, MAX_SONGS)) {
    const url = musicLink(s?.url);
    const title = typeof s?.title === "string" ? s.title.trim().slice(0, 120) : "";
    if (!title && !url) continue;
    const artist = typeof s?.artist === "string" && s.artist.trim() ? s.artist.trim().slice(0, 120) : null;
    out.push(url ? { title, artist, url } : { title, artist });
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
        const url = musicLink(l);
        if (url) return { title: "", artist: null, url };
        // Any other link isn't a song; leave it out instead of using the URL as a title.
        if (/https?:\/\//i.test(l)) return { title: "", artist: null };
        const m = l.split(/\s+[-–—]\s+/);
        return m.length >= 2 ? { artist: m[0], title: m.slice(1).join(" - ") } : { title: l, artist: null };
      }),
  );
}

export const songsToLines = (songs: Song[]) => songs.map((s) => (s.url ? s.url : s.artist ? `${s.artist} - ${s.title}` : s.title)).join("\n");

/** SoundCloud search for a song with no link of its own. */
export const soundcloudSearch = (s: Song) => `https://soundcloud.com/search?q=${encodeURIComponent([s.artist, s.title].filter(Boolean).join(" "))}`;

/** A link to hear a song with no link of its own. */
export const spotifySearch = (s: Song) => `https://open.spotify.com/search/${encodeURIComponent([s.artist, s.title].filter(Boolean).join(" "))}`;
