import type { Metadata } from "next";
import { PostGrid } from "@/components/PostCard";
import { listPosts } from "@/lib/db";
import { cf } from "@/lib/env";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Night Reports",
  description: "Recaps of the nights worth remembering, told by the people who remember them.",
  alternates: { canonical: "/night-reports" },
};

export default async function NightReports() {
  const [posts, env, content] = await Promise.all([listPosts({ limit: 200 }), cf(), getSiteContent()]);
  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="display text-[clamp(2.75rem,12vw,7rem)] text-maize">Night Reports</h1>
      <p className="mt-4 max-w-xl text-lg leading-snug sm:mt-5 sm:text-xl">{content.sectionBlurbs["night-reports"]}</p>
      <div className="mt-10 sm:mt-12">
        {posts.length ? <PostGrid posts={posts} mediaBase={env.MEDIA_PUBLIC_URL} /> : <p className="text-dim">Nothing here yet. Doors open soon.</p>}
      </div>
    </section>
  );
}
