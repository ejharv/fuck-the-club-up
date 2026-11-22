import Link from "next/link";
import type { PostRow } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/media-url";
import { sectionBySlug } from "@/lib/sections";

export function PlaceholderBadge() {
  return <span className="mono rounded-sm bg-pink px-2 py-0.5 text-night">Placeholder post</span>;
}

/** A post as a club flyer. */
export function PostCard({ post, mediaBase }: { post: PostRow; mediaBase: string | undefined }) {
  const section = sectionBySlug(post.section);
  return (
    <article className="flyer relative flex flex-col overflow-hidden rounded-md">
      {post.cover_key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(post.cover_key, mediaBase)} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-maize">
          <span>{section?.name ?? post.section}</span>
          <span className="text-dim">{formatDate(post.published_at)}</span>
          {post.placeholder ? <PlaceholderBadge /> : null}
        </p>
        <h3 className="display text-2xl sm:text-[1.7rem]">
          <Link href={`/posts/${post.slug}`} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>
        {post.dek && <p className="text-dim">{post.dek}</p>}
      </div>
    </article>
  );
}

export function PostGrid({ posts, mediaBase }: { posts: PostRow[]; mediaBase: string | undefined }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} mediaBase={mediaBase} />
      ))}
    </div>
  );
}
