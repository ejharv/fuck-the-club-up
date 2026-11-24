import { Markdown } from "./Markdown";
import { splitOnMarkers } from "@/lib/inline-media";

export type InlineItem = { src: string; kind: string; caption: string | null; credit?: string | null };

/**
 * A story with photos placed between paragraphs. `re` picks the marker kind
 * (draft [[photo:…]] or post [[media:…]]); `items` maps marker ids to files.
 * Unknown markers render nothing.
 */
export function StoryBody({ body, re, items }: { body: string; re: RegExp; items: Record<string, InlineItem> }) {
  const parts = splitOnMarkers(body, re);
  return (
    <>
      {parts.map((p, i) => {
        if ("text" in p) return <Markdown key={i}>{p.text}</Markdown>;
        const m = items[p.id];
        if (!m) return null;
        return (
          <figure key={i} className="my-8 max-w-3xl">
            {m.kind === "video" ? (
              <video src={m.src} controls playsInline preload="metadata" className="w-full rounded-md bg-black" />
            ) : (
              <a href={m.src} target="_blank" rel="noopener" className="block overflow-hidden rounded-md bg-night-2" aria-label={`Open full photo${m.caption ? `: ${m.caption}` : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.src} alt={m.caption ?? "Photo from the night"} loading="lazy" className="max-h-[80vh] w-full object-contain" />
              </a>
            )}
            {(m.caption || m.credit) && (
              <figcaption className="mt-1.5 text-sm leading-snug text-dim">
                {m.caption}
                {m.credit && <span className="mono">{m.caption ? " · " : ""}{m.credit}</span>}
              </figcaption>
            )}
          </figure>
        );
      })}
    </>
  );
}
