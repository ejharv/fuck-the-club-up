import "server-only";
import { cf } from "./env";
import { linkTitle } from "./oembed";
import { cleanSongs, type Song } from "./tracks";
import { placeKey, type Venue, type VenueKind } from "./venues";

/**
 * Places and playlists are built from night reports. A post's places and
 * songs are rewritten whenever the post is created, edited or dropped.
 */

export type TrackRow = { title: string; artist: string | null; url: string | null; source: "link" | "mentioned" | "upload"; media_id: string | null };

/** Statements that replace a post's places and songs. */
export async function collectionStatements(
  DB: D1Database,
  postId: string,
  venues: Venue[],
  songs: Song[],
  media: Array<{ id: string; kind: string; url: string | null; caption: string | null }>,
): Promise<D1PreparedStatement[]> {
  const tracks: TrackRow[] = [];
  const seen = new Set<string>();
  const add = (t: TrackRow) => {
    const k = t.url ? t.url : `${t.artist ?? ""}|${t.title}`.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    tracks.push(t);
  };
  // Links people added (titles from the services' oEmbed), then audio files, then songs named in accounts.
  const links = media.filter((m) => m.kind === "embed" && m.url);
  const titles = await Promise.all(links.map((m) => linkTitle(m.url!)));
  links.forEach((m, i) => add({ title: m.caption || titles[i].title, artist: m.caption ? null : titles[i].artist, url: m.url, source: "link", media_id: m.id }));
  media.filter((m) => m.kind === "audio").forEach((m) => add({ title: m.caption || "Audio from the night", artist: null, url: null, source: "upload", media_id: m.id }));
  const clean = cleanSongs(songs);
  const pasted = clean.filter((s) => s.url && !links.some((m) => m.url === s.url));
  const pastedTitles = await Promise.all(pasted.map((s) => (s.title ? null : linkTitle(s.url!))));
  pasted.forEach((s, i) => add({ title: s.title || pastedTitles[i]!.title, artist: s.title ? s.artist : pastedTitles[i]!.artist, url: s.url!, source: "link", media_id: null }));
  clean.filter((s) => !s.url).forEach((s) => add({ title: s.title, artist: s.artist, url: null, source: "mentioned", media_id: null }));

  return [
    DB.prepare("DELETE FROM post_venues WHERE post_id = ?").bind(postId),
    DB.prepare("DELETE FROM post_tracks WHERE post_id = ?").bind(postId),
    ...venues.map((v, i) =>
      DB.prepare("INSERT INTO post_venues (post_id, position, place_key, name, url, kind) VALUES (?, ?, ?, ?, ?, ?)").bind(
        postId, i, placeKey(v.name, v.url), v.name, v.url, v.kind,
      ),
    ),
    ...tracks.slice(0, 80).map((t, i) =>
      DB.prepare("INSERT INTO post_tracks (post_id, position, title, artist, url, source, media_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
        postId, i, t.title, t.artist, t.url, t.source, t.media_id,
      ),
    ),
  ];
}

export async function postVenues(postId: string): Promise<Array<Venue & { place_key: string }>> {
  const { DB } = await cf();
  const { results } = await DB.prepare("SELECT name, url, kind, place_key FROM post_venues WHERE post_id = ? ORDER BY position")
    .bind(postId)
    .all<Venue & { place_key: string }>();
  return results;
}

export async function postSongs(postId: string): Promise<TrackRow[]> {
  const { DB } = await cf();
  const { results } = await DB.prepare("SELECT title, artist, url, source, media_id FROM post_tracks WHERE post_id = ? ORDER BY position")
    .bind(postId)
    .all<TrackRow>();
  return results;
}

export type PlaceSummary = {
  key: string;
  name: string;
  url: string | null;
  kind: VenueKind;
  posts: Array<{ slug: string; title: string; night_of: string | null; published_at: string }>;
};

/** Every place in a night report, grouped across posts, most-visited first. */
export async function listPlaces(): Promise<PlaceSummary[]> {
  const { DB } = await cf();
  const { results } = await DB.prepare(
    `SELECT v.place_key, v.name, v.url, v.kind, p.slug, p.title, p.night_of, p.published_at
       FROM post_venues v JOIN posts p ON p.id = v.post_id
      WHERE p.private = 0
      ORDER BY COALESCE(p.night_of, substr(p.published_at, 1, 10)) DESC, p.published_at DESC`,
  ).all<{ place_key: string; name: string; url: string | null; kind: VenueKind; slug: string; title: string; night_of: string | null; published_at: string }>();
  const map = new Map<string, PlaceSummary>();
  for (const r of results) {
    let p = map.get(r.place_key);
    if (!p) {
      // Newest row wins for name/url/kind.
      p = { key: r.place_key, name: r.name, url: r.url, kind: r.kind, posts: [] };
      map.set(r.place_key, p);
    }
    if (!p.url && r.url) p.url = r.url;
    if (!p.posts.some((x) => x.slug === r.slug)) p.posts.push({ slug: r.slug, title: r.title, night_of: r.night_of, published_at: r.published_at });
  }
  return [...map.values()].sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name));
}

export type NightPlaylist = { slug: string; title: string; night_of: string | null; published_at: string; tracks: TrackRow[] };

/** Every night report's songs, newest night first. */
export async function listPlaylists(): Promise<NightPlaylist[]> {
  const { DB } = await cf();
  const { results } = await DB.prepare(
    `SELECT p.slug, p.title, p.night_of, p.published_at, t.title AS t_title, t.artist, t.url, t.source, t.media_id
       FROM post_tracks t JOIN posts p ON p.id = t.post_id
      WHERE p.private = 0
      ORDER BY COALESCE(p.night_of, substr(p.published_at, 1, 10)) DESC, p.published_at DESC, t.position`,
  ).all<{ slug: string; title: string; night_of: string | null; published_at: string; t_title: string; artist: string | null; url: string | null; source: TrackRow["source"]; media_id: string | null }>();
  const out: NightPlaylist[] = [];
  for (const r of results) {
    let n = out[out.length - 1];
    if (!n || n.slug !== r.slug) out.push((n = { slug: r.slug, title: r.title, night_of: r.night_of, published_at: r.published_at, tracks: [] }));
    n.tracks.push({ title: r.t_title, artist: r.artist, url: r.url, source: r.source, media_id: r.media_id });
  }
  return out;
}
