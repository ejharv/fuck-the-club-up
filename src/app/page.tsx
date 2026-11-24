import Link from "next/link";
import { PostGrid } from "@/components/PostCard";
import { listNewThisWeek, listPosts } from "@/lib/db";
import { cf } from "@/lib/env";
import { currentMember } from "@/lib/session";
import { listPlaces, listPlaylists } from "@/lib/collections";
import { getSiteContent } from "@/lib/site-content";
import { placeAnchor } from "@/lib/venues";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [posts, fresh, env, member, content, playlists, places] = await Promise.all([
    listPosts({ limit: 12 }),
    listNewThisWeek(),
    cf(),
    currentMember(),
    getSiteContent(),
    listPlaylists(),
    listPlaces(),
  ]);
  const recentSongs = playlists.flatMap((n) => n.tracks.map((t) => ({ ...t, slug: n.slug }))).slice(0, 6);

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-20">
        {content.homeKicker && <p className="mono text-pink">{content.homeKicker}</p>}
        <h1 className="display mt-4 text-[clamp(4rem,19vw,12.5rem)] sm:mt-5">
          <span className="block">Fuck</span>
          <span className="block">
            The <span className="text-maize">Club</span>
          </span>
          <span className="outlined block">Up</span>
        </h1>
        {content.homeLede && <p className="mt-6 max-w-xl text-lg leading-snug sm:mt-8 sm:text-xl">{content.homeLede}</p>}
      </section>

      {fresh.length > 0 && (
        <section aria-labelledby="fresh" className="mx-auto mb-14 max-w-6xl px-4 sm:mb-16 sm:px-6">
          <h2 id="fresh" className="display text-[2rem] text-pink sm:text-3xl">New this week</h2>
          <p className="mt-2 text-dim">Just posted, about nights from a while back.</p>
          <div className="mt-6">
            <PostGrid posts={fresh} mediaBase={env.MEDIA_PUBLIC_URL} />
          </div>
        </section>
      )}

      <section aria-labelledby="latest" className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="latest" className="display text-4xl">Latest</h2>
        <div className="mt-5 sm:mt-6">
          {posts.length ? (
            <PostGrid posts={posts} mediaBase={env.MEDIA_PUBLIC_URL} />
          ) : (
            <p className="text-dim">
              Nothing here yet. Doors open soon.{" "}
              {member && (
                <Link href="/new" className="text-maize underline underline-offset-4">
                  Write the first post
                </Link>
              )}
            </p>
          )}
        </div>
      </section>

      <section aria-label="From the night reports" className="mx-auto mt-16 grid max-w-6xl gap-px overflow-hidden rounded-md border border-line bg-line px-0 sm:mt-20 md:grid-cols-2">
        <div className="bg-night p-6">
          <h2 className="display text-3xl">
            <Link href="/playlists" className="text-maize hover:text-ink">Playlists</Link>
          </h2>
          {recentSongs.length ? (
            <ol className="mt-4 space-y-1">
              {recentSongs.map((t, i) => (
                <li key={i}>
                  <Link href={`/playlists#${t.slug}`} className="flex min-h-11 items-center gap-3 hover:text-maize">
                    <span className="mono text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <span className="truncate"><strong>{t.title}</strong>{t.artist ? <span className="text-dim"> · {t.artist}</span> : null}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-dim">Songs from the nights land here once a night report drops.</p>
          )}
        </div>
        <div className="bg-night p-6">
          <h2 className="display text-3xl">
            <Link href="/places" className="text-maize hover:text-ink">Places</Link>
          </h2>
          {places.length ? (
            <ul className="mt-4 space-y-1">
              {places.slice(0, 6).map((p) => (
                <li key={p.key}>
                  <Link href={`/places#${placeAnchor(p.key)}`} className="flex min-h-11 items-center justify-between gap-3 hover:text-maize">
                    <span className="truncate font-bold">{p.name}</span>
                    <span className="mono shrink-0 text-dim">{p.kind === "eat" ? "Eat" : "Party"} · {p.posts.length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-dim">Where to party and where to eat, built from the night reports.</p>
          )}
        </div>
      </section>
    </>
  );
}
