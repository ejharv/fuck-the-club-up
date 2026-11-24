/**
 * Photos placed inside a story. Drafts use [[photo:abcd1234]] (first 8 hex of
 * a night upload's id); published posts use [[media:<media row id>]]. Each
 * marker sits on its own line between paragraphs. Shared by server and client.
 */
export const PHOTO_RE = /\[\[photo:([0-9a-f]{8})\]\]/g;
export const MEDIA_RE = /\[\[media:([0-9a-f-]{36})\]\]/g;
/** A photo placed in the editor before the post is saved: short id of its upload key. */
export const NEW_RE = /\[\[new:([0-9a-f]{8})\]\]/g;

/** Short id for a night upload, from its key ".../<uuid>.<ext>". */
export function uploadShortId(r2Key: string): string {
  return (r2Key.split("/").pop() ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 8).toLowerCase();
}

/** Keep only markers for known ids, each once, each on its own line, never before the first paragraph. */
export function cleanMarkers(body: string, re: RegExp, allowed: Set<string>, prefix: "photo" | "media"): string {
  const seen = new Set<string>();
  const marked = body.replace(new RegExp(re.source, "g"), (_m, id: string) => {
    const k = id.toLowerCase();
    if (!allowed.has(k) || seen.has(k)) return "";
    seen.add(k);
    return `\n\n[[${prefix}:${k}]]\n\n`;
  });
  const blocks = marked.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const isMarker = (b: string) => b.startsWith(`[[${prefix}:`) && b.endsWith("]]");
  const lead: string[] = [];
  while (blocks.length && isMarker(blocks[0])) lead.push(blocks.shift()!);
  if (lead.length) blocks.splice(blocks.length ? 1 : 0, 0, ...lead);
  return blocks.join("\n\n");
}

/** Body without any markers (excerpts, places that don't render photos). */
export const stripMarkers = (body: string) =>
  body.replace(PHOTO_RE, "").replace(MEDIA_RE, "").replace(NEW_RE, "").replace(/\n{3,}/g, "\n\n").trim();

/** Split a body into text chunks and marker ids, in order. */
export function splitOnMarkers(body: string, re: RegExp): Array<{ text: string } | { id: string }> {
  const parts: Array<{ text: string } | { id: string }> = [];
  let last = 0;
  for (const m of body.matchAll(new RegExp(re.source, "g"))) {
    const before = body.slice(last, m.index);
    if (before.trim()) parts.push({ text: before });
    parts.push({ id: m[1].toLowerCase() });
    last = m.index! + m[0].length;
  }
  const rest = body.slice(last);
  if (rest.trim()) parts.push({ text: rest });
  return parts;
}

/** Turn [[new:…]] markers into [[media:…]] once uploads have media ids, then tidy. */
export function resolveNewMarkers(body: string, keyToId: Map<string, string>, allMediaIds: Iterable<string>): string {
  const byShort = new Map([...keyToId].map(([key, id]) => [uploadShortId(key), id]));
  const replaced = body.replace(NEW_RE, (_m, s: string) => (byShort.has(s) ? `[[media:${byShort.get(s)}]]` : ""));
  return cleanMarkers(replaced, MEDIA_RE, new Set(allMediaIds), "media");
}
