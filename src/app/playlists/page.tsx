import type { Metadata } from "next";
import Link from "next/link";
import { listPlaylists } from "@/lib/collections";
import { formatDate, formatDay } from "@/lib/format";
import { getSiteContent } from "@/lib/site-content";
import { spotifySearch } from "@/lib/tracks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Playlists",
  description: "Every song from every night out, linked to the night it soundtracked.",
  alternates: { canonical: "/playlists" },
};

export default async function Playlists() {
  const [nights, content] = await Promise.all([listPlaylists(), getSiteContent()]);
  const total = nights.reduce((n, x) => n + x.tracks.length, 0);
  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="display text-[clamp(2.75rem,12vw,7rem)] text-maize">Playlists</h1>
      {content.playlistsIntro && <p className="mt-4 max-w-xl text-lg leading-snug sm:mt-5 sm:text-xl">{content.playlistsIntro}</p>}
      {total > 0 && <p className="mono mt-4 text-dim">{total} {total === 1 ? "song" : "songs"} · {nights.length} {nights.length === 1 ? "night" : "nights"}</p>}

      {nights.length ? (
        <div className="mt-10 grid gap-6 sm:mt-12 lg:grid-cols-2">
          {nights.map((n) => (
            <article key={n.slug} id={n.slug} className="scroll-mt-24 rounded-md border border-line bg-night-2 p-5 sm:p-6">
              <p className="mono text-pink">{n.night_of ? formatDay(n.night_of) : formatDate(n.published_at)}</p>
              <h2 className="display mt-2 text-2xl sm:text-3xl">
                <Link href={`/posts/${n.slug}`} className="hover:text-maize">{n.title}</Link>
              </h2>
              <ol className="mt-5 divide-y divide-line border-y border-line">
                {n.tracks.map((t, i) => {
                  const href = t.url ?? (t.source === "upload" ? `/posts/${n.slug}` : spotifySearch(t));
                  const external = !href.startsWith("/");
                  return (
                    <li key={i}>
                      <a
                        href={href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
                        className="grid min-h-12 grid-cols-[2rem_1fr_auto] items-center gap-2 py-2.5 hover:text-maize"
                      >
                        <span className="mono text-dim">{String(i + 1).padStart(2, "0")}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{t.title}</span>
                          {t.artist && <span className="block truncate text-sm text-dim">{t.artist}</span>}
                        </span>
                        <span className="mono text-maize">{t.url ? "Play" : t.source === "upload" ? "Listen" : "Find it"}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
              <Link href={`/posts/${n.slug}`} className="mono tap mt-3 -ml-2 text-maize">Read the night</Link>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-dim">No songs yet. They show up here when a night report drops with music in it.</p>
      )}
    </section>
  );
}
