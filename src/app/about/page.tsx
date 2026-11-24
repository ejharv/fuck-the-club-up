import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About",
  description: "What Fuck The Club Up is, and the house rules every post follows.",
  alternates: { canonical: "/about" },
};

export default async function About() {
  const c = await getSiteContent();
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="display text-[clamp(3rem,10vw,7rem)]">About</h1>
      <div className="mt-8 text-lg">
        <Markdown>{c.aboutBody}</Markdown>
      </div>

      <h2 className="display mt-16 text-4xl text-maize">House rules</h2>
      <ol className="mt-6 max-w-[65ch] space-y-4">
        {c.houseRules.map((rule, i) => (
          <li key={`${i}-${rule.title}`} className="grid grid-cols-[2rem_1fr] gap-2 text-lg">
            <span className="display text-pink">{i + 1}</span>
            <span>
              <strong>{rule.title}</strong> {rule.text}
            </span>
          </li>
        ))}
      </ol>

      {(c.storyTitle || c.storyBody) && (
        <div className="mt-16 max-w-[65ch] rounded-md border-2 border-dashed border-maize p-6">
          {c.storyTitle && <h2 className="display text-3xl">{c.storyTitle}</h2>}
          {c.storyBody && (
            <div className="mt-3 text-lg">
              <Markdown>{c.storyBody}</Markdown>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
