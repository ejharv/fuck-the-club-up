import Link from "next/link";

/** Six tiles separated by a 1px divider grid. */
export function SectionsGrid({ sections }: { sections: Array<{ slug: string; name: string; blurb: string }> }) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((s) => (
        <li key={s.slug} className="bg-night">
          <Link href={`/section/${s.slug}`} className="group block h-full p-5 transition-colors hover:bg-night-2 sm:p-6">
            <h3 className="display text-2xl text-maize">{s.name}</h3>
            <p className="mt-1.5 leading-snug text-dim sm:mt-2">{s.blurb}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
