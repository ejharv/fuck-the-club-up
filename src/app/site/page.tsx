import { redirect } from "next/navigation";
import { DEFAULT_CONTENT, getSiteContent } from "@/lib/site-content";
import { SECTIONS } from "@/lib/sections";
import { currentMember } from "@/lib/session";
import { SiteEditor } from "./SiteEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit site", robots: { index: false } };

export default async function SitePage() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/site");
  if (me.role !== "admin") redirect("/");
  const content = await getSiteContent();
  return (
    <section className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
      <h1 className="display text-[clamp(3rem,9vw,5rem)]">Edit site</h1>
      <p className="mt-3 text-dim">
        The words on the home page, About page, footer and section pages. Posts are edited from each post&apos;s own page.
      </p>
      <SiteEditor content={content} defaults={DEFAULT_CONTENT} sections={SECTIONS.map((s) => ({ slug: s.slug, name: s.name }))} />
    </section>
  );
}
