import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { postSongs, postVenues } from "@/lib/collections";
import { getPost } from "@/lib/db";
import { songsToLines } from "@/lib/tracks";
import { cf } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";
import { todayInDetroit } from "@/lib/post-fields";
import { currentMember } from "@/lib/session";
import { EditPostForm } from "./EditPostForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit post", robots: { index: false } };

export default async function EditPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await currentMember();
  if (!member) redirect(`/login?next=/posts/${slug}/edit`);
  const found = await getPost(slug);
  if (!found) notFound();
  const { post, media } = found;
  if (post.author_email !== member.email && member.role !== "admin") redirect(`/posts/${slug}`);
  const env = await cf();

  return (
    <section className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <p className="mono text-pink">
        <Link href={`/posts/${slug}`} className="-ml-2 inline-flex min-h-11 items-center px-2 hover:text-ink">← Back to the post</Link>
      </p>
      <h1 className="display mt-1 text-[clamp(2.5rem,8vw,4.5rem)]">Edit post</h1>
      <EditPostForm
        venues={(await postVenues(post.id)).map((v) => ({ name: v.name, url: v.url ?? "", kind: v.kind }))}
        songsText={songsToLines((await postSongs(post.id)).filter((t) => t.source === "mentioned"))}
        today={todayInDetroit()}
        post={{
          id: post.id,
          title: post.title,
          dek: post.dek ?? "",
          section: post.section,
          night: post.night ?? "",
          nightOf: post.night_of ?? "",
          damage: post.damage ?? "",
          rideHome: post.ride_home ?? "",
          body: post.body,
        }}
        media={media.map((m) => ({
          id: m.id,
          kind: m.kind,
          caption: m.caption ?? "",
          preview: m.kind === "photo" && m.r2_key ? mediaUrl(m.r2_key, env.MEDIA_PUBLIC_URL) : null,
          label: m.kind === "embed" ? (m.url ?? "Link") : m.kind,
          isCover: Boolean(m.r2_key && m.r2_key === post.cover_key),
        }))}
      />
    </section>
  );
}
