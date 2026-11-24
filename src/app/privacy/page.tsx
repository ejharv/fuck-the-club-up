import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { LEGAL_UPDATED } from "@/lib/legal-defaults";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Fuck The Club Up collects, why, and how to get it deleted.",
  alternates: { canonical: "/privacy" },
};

export default async function Page() {
  const c = await getSiteContent();
  const body = c.privacyBody.replaceAll("{{contact}}", c.legalContact);
  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="display text-[clamp(2.75rem,9vw,6rem)]">Privacy Policy</h1>
      <p className="mono mt-4 text-dim">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-8 sm:mt-10">
        <Markdown>{body}</Markdown>
      </div>
    </section>
  );
}
