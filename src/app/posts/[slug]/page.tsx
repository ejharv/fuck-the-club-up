import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteMedia, deletePost } from "@/app/actions";
import { Markdown } from "@/components/Markdown";
import { PlaceholderBadge } from "@/components/PostCard";
import { Wristband } from "@/components/Wristband";
import { getPost, type MediaRow } from "@/lib/db";
import { toEmbed } from "@/lib/embeds";
import { cf } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";
import { sectionBySlug } from "@/lib/sections";
import { currentMember } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getPost((await params).slug);
  if (!found) return {};
  const env = await cf();
  const { post } = found;
  return {
    title: post.title,
    description: post.dek ?? undefined,
    alternates: { canonical: `/posts/${post.slug}` },
    openGraph: post.cover_key ? { images: [mediaUrl(post.cover_key, env.MEDIA_PUBLIC_URL)] } : undefined,
  };
}

function RemoveMedia({ id }: { id: string }) {
  return (
    <form action={deleteMedia} className="mt-2">
      <input type="hidden" name="mediaId" value={id} />
      <button className="mono text-dim underline underline-offset-4 hover:text-pink">Remove this</button>
    </form>
  );
}

function MediaBlock({ item, base, canEdit }: { item: MediaRow; base: string | undefined; canEdit: boolean }) {
  const caption = (
    <>
      {item.caption && <figcaption className="mt-2 text-sm text-dim">{item.caption}</figcaption>}
      {canEdit && <RemoveMedia id={item.id} />}
    </>
  );
  if (item.kind === "embed" && item.url) {
    const embed = toEmbed(item.url);
    if (!embed) return null;
    return (
      <figure className="sm:col-span-2">
        <iframe
          src={embed.src}
          title={item.caption ?? `${embed.provider} embed`}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          className={`w-full rounded-md border-0 bg-night-2 ${embed.provider === "youtube" ? "aspect-video" : embed.tall ? "h-[380px]" : "h-[152px]"}`}
        />
        {caption}
      </figure>
    );
  }
  if (!item.r2_key) return null;
  const src = mediaUrl(item.r2_key, base);
  if (item.kind === "video") {
    return (
      <figure className="sm:col-span-2">
        <video src={src} controls playsInline preload="metadata" className="w-full rounded-md bg-black" />
        {caption}
      </figure>
    );
  }
  if (item.kind === "audio") {
    return (
      <figure className="rounded-md border border-line bg-night-2 p-4 sm:col-span-2">
        <p className="mono mb-3 text-maize">{item.caption ?? "Track from the night"}</p>
        <audio src={src} controls preload="none" className="w-full" />
        {canEdit && <RemoveMedia id={item.id} />}
      </figure>
    );
  }
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={item.caption ?? "Photo from the night"} loading="lazy" className="w-full rounded-md" />
      {caption}
    </figure>
  );
}

export default async function PostPage({ params }: Props) {
  const found = await getPost((await params).slug);
  if (!found) notFound();
  const { post, media } = found;
  const [env, member] = await Promise.all([cf(), currentMember()]);
  const section = sectionBySlug(post.section);
  const canEdit = Boolean(member && (member.email === post.author_email || member.role === "admin"));

  return (
    <article className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      {post.placeholder ? (
        <p className="mb-8 max-w-[65ch] rounded-md border border-pink/60 bg-pink/10 p-4">
          <PlaceholderBadge /> <span className="ml-2">This is a stand-in until it gets rewritten in the crew&apos;s own voice.</span>
        </p>
      ) : null}
      <p className="mono">
        <Link href={`/section/${post.section}`} className="text-maize hover:text-ink">
          {section?.name ?? post.section}
        </Link>
      </p>
      <h1 className="display mt-4 max-w-5xl text-[clamp(2.75rem,8vw,6.5rem)]">{post.title}</h1>
      {post.dek && <p className="mt-6 max-w-[55ch] text-2xl leading-snug">{post.dek}</p>}
      {canEdit && (
        <p className="mt-4">
          <Link href={`/posts/${post.slug}/edit`} className="mono text-maize underline underline-offset-4 hover:text-ink">
            Edit post
          </Link>
        </p>
      )}

      <div className="mt-8 max-w-4xl">
        <Wristband postedAt={post.published_at} nightOf={post.night_of} night={post.night} damage={post.damage} rideHome={post.ride_home} />
      </div>

      <div className="mt-10">
        <Markdown>{post.body}</Markdown>
      </div>

      {media.length > 0 && (
        <section aria-label="Photos, videos and music" className="mt-16 grid max-w-4xl gap-6 sm:grid-cols-2">
          {media.map((m) => (
            <MediaBlock key={m.id} item={m} base={env.MEDIA_PUBLIC_URL} canEdit={canEdit} />
          ))}
        </section>
      )}

      <p className="mt-16 border-t border-line pt-6 text-sm text-dim">
        In something you want gone?{" "}
        <Link href={`/takedown?post=${post.slug}`} className="underline underline-offset-4 hover:text-pink">
          Ask for a takedown
        </Link>
        . No questions asked.
      </p>

      {canEdit && (
        <form action={deletePost} className="mt-4">
          <input type="hidden" name="id" value={post.id} />
          <button className="text-sm text-dim underline underline-offset-4 hover:text-pink">Delete this post and its uploads</button>
        </form>
      )}
    </article>
  );
}
