import "server-only";

/**
 * Title of a Spotify/SoundCloud/YouTube link via the services' public oEmbed
 * endpoints, so links on a post show up in its playlist by name. Best effort:
 * short timeout, falls back to a generic label.
 */
const ENDPOINTS: Array<[RegExp, (u: string) => string]> = [
  [/^https:\/\/open\.spotify\.com\//, (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`],
  [/^https:\/\/(on\.)?soundcloud\.com\//, (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}`],
  [/^https:\/\/((www|m|music)\.)?youtube\.com\/|^https:\/\/youtu\.be\//, (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`],
];

export async function linkTitle(url: string): Promise<{ title: string; artist: string | null }> {
  const hit = ENDPOINTS.find(([re]) => re.test(url));
  const fallback = { title: /spotify/.test(url) ? "Spotify track" : /soundcloud/.test(url) ? "SoundCloud track" : "YouTube video", artist: null };
  if (!hit) return fallback;
  try {
    const res = await fetch(hit[1](url), { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return fallback;
    const d = (await res.json()) as { title?: string; author_name?: string };
    const title = (d.title ?? "").trim().slice(0, 120);
    return title ? { title, artist: d.author_name?.trim().slice(0, 120) || null } : fallback;
  } catch {
    return fallback;
  }
}
