import Link from "next/link";
import { SECTIONS } from "@/lib/sections";

/** Six tiles separated by a 1px divider grid. */
export function SectionsGrid() {
  return (
    <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {SECTIONS.map((s) => (
        <li key={s.slug} className="bg-night">
          <Link href={`/section/${s.slug}`} className="block h-full p-6 hover:bg-night-2">
            <h3 className="display text-2xl text-maize">{s.name}</h3>
            <p className="mt-2 text-dim">{s.blurb}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
