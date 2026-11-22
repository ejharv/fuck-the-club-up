import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostGrid } from "@/components/PostCard";
import { listPosts } from "@/lib/db";
import { cf } from "@/lib/env";
import { sectionBySlug } from "@/lib/sections";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const section = sectionBySlug((await params).slug);
  if (!section) return {};
  return { title: section.name, description: section.blurb, alternates: { canonical: `/section/${section.slug}` } };
}

export default async function SectionPage({ params }: Props) {
  const section = sectionBySlug((await params).slug);
  if (!section) notFound();
  const [posts, env] = await Promise.all([listPosts({ section: section.slug }), cf()]);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <p className="mono text-pink">Section</p>
      <h1 className="display mt-4 text-[clamp(3rem,10vw,7rem)] text-maize">{section.name}</h1>
      <p className="mt-5 max-w-xl text-xl">{section.blurb}</p>
      <div className="mt-12">
        {posts.length ? (
          <PostGrid posts={posts} mediaBase={env.MEDIA_PUBLIC_URL} />
        ) : (
          <p className="text-dim">Nothing here yet. Doors open soon.</p>
        )}
      </div>
    </section>
  );
}
