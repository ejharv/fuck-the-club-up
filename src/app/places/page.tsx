import type { Metadata } from "next";
import Link from "next/link";
import { listPlaces, type PlaceSummary } from "@/lib/collections";
import { formatDate, formatDay } from "@/lib/format";
import { getSiteContent } from "@/lib/site-content";
import { placeAnchor } from "@/lib/venues";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Places",
  description: "Where to party and where to eat, from the night reports.",
  alternates: { canonical: "/places" },
};

function PlaceCard({ p }: { p: PlaceSummary }) {
  return (
    <li id={placeAnchor(p.key)} className="scroll-mt-24 rounded-md border border-line bg-night-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="display text-2xl text-ink">{p.name}</h3>
        {p.url && (
          <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="mono tap -mr-2 -mt-2 shrink-0 text-maize">
            Website
          </a>
        )}
      </div>
      <p className="mono mt-1 text-dim">In {p.posts.length} night {p.posts.length === 1 ? "report" : "reports"}</p>
      <ul className="mt-3 space-y-1">
        {p.posts.slice(0, 6).map((n) => (
          <li key={n.slug}>
            <Link href={`/posts/${n.slug}`} className="flex min-h-11 items-center justify-between gap-3 hover:text-maize">
              <span className="truncate">{n.title}</span>
              <span className="mono shrink-0 text-dim">{n.night_of ? formatDay(n.night_of) : formatDate(n.published_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function Places() {
  const [places, content] = await Promise.all([listPlaces(), getSiteContent()]);
  const party = places.filter((p) => p.kind === "party");
  const eat = places.filter((p) => p.kind === "eat");
  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="display text-[clamp(2.75rem,12vw,7rem)] text-maize">Places</h1>
      {content.placesIntro && <p className="mt-4 max-w-xl text-lg leading-snug sm:mt-5 sm:text-xl">{content.placesIntro}</p>}
      <nav aria-label="Jump to" className="mono mt-6 flex gap-2">
        <a href="#party" className="tap -ml-2 text-pink">Where to party ({party.length})</a>
        <a href="#eat" className="tap text-pink">Where to eat ({eat.length})</a>
      </nav>

      {[
        { id: "party", title: "Where to party", list: party, empty: "No bars or clubs yet." },
        { id: "eat", title: "Where to eat", list: eat, empty: "No late-night food yet." },
      ].map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="mt-12 scroll-mt-24">
          <h2 id={`${g.id}-h`} className="display text-3xl sm:text-4xl">{g.title}</h2>
          {g.list.length ? (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.list.map((p) => <PlaceCard key={p.key} p={p} />)}
            </ul>
          ) : (
            <p className="mt-4 text-dim">{g.empty} They show up here when a night report lists where the crew went.</p>
          )}
        </section>
      ))}
    </section>
  );
}
