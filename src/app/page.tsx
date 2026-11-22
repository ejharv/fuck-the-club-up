import Link from "next/link";
import { PostGrid } from "@/components/PostCard";
import { SectionsGrid } from "@/components/SectionsGrid";
import { listPosts } from "@/lib/db";
import { cf } from "@/lib/env";
import { currentMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [posts, env, member] = await Promise.all([listPosts({ limit: 12 }), cf(), currentMember()]);

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <p className="mono text-pink">Ann Arbor · after dark · est. 2026</p>
        <h1 className="display mt-5 text-[clamp(4rem,17vw,12.5rem)]">
          <span className="block">Fuck</span>
          <span className="block">
            The <span className="text-maize">Club</span>
          </span>
          <span className="outlined block">Up</span>
        </h1>
        <p className="mt-8 max-w-xl text-xl">
          The nights, the places, and the stories that turned into lore. Told by the people who remember them.
        </p>
      </section>

      <section aria-labelledby="latest" className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="latest" className="display text-4xl">Latest</h2>
        <div className="mt-6">
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

      <section aria-labelledby="sections" className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <h2 id="sections" className="display text-4xl">Sections</h2>
        <div className="mt-6">
          <SectionsGrid />
        </div>
      </section>
    </>
  );
}
