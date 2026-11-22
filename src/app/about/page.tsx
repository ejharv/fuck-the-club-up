import type { Metadata } from "next";
import { HOUSE_RULES } from "@/lib/sections";

export const metadata: Metadata = {
  title: "About",
  description: "What Fuck The Club Up is, and the house rules every post follows.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="display text-[clamp(3rem,10vw,7rem)]">About</h1>
      <div className="mt-8 max-w-[65ch] space-y-5 text-lg">
        <p>
          Fuck The Club Up is a blog about going out in college and right after it: the nights, the places, and the
          stories that turned into lore. Ann Arbor first.
        </p>
        <p>It&apos;s written by a crew of friends recapping the weekend the way they would at brunch: loud, specific, and roasting themselves first.</p>
      </div>

      <h2 className="display mt-16 text-4xl text-maize">House rules</h2>
      <ol className="mt-6 max-w-[65ch] space-y-4">
        {HOUSE_RULES.map((rule, i) => (
          <li key={rule.title} className="grid grid-cols-[2rem_1fr] gap-2 text-lg">
            <span className="display text-pink">{i + 1}</span>
            <span>
              <strong>{rule.title}</strong> {rule.text}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-16 max-w-[65ch] rounded-md border-2 border-dashed border-maize p-6">
        <h2 className="display text-3xl">Got a story?</h2>
        <p className="mt-3 text-lg">Send us the night. We change the names, keep the chaos.</p>
      </div>
    </section>
  );
}
