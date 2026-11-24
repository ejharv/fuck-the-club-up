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
    <form action={deleteMedia}>
      <input type="hidden" name="mediaId" value={id} />
      <button className="mono tap -ml-2 text-dim underline underline-offset-4 hover:text-pink">Remove this</button>
    </form>
  );
}

function MediaBlock({ item, base, canEdit, wide }: { item: MediaRow; base: string | undefined; canEdit: boolean; wide?: boolean }) {
  const caption = (
    <>
      {item.caption && <figcaption className="mt-1.5 text-sm leading-snug text-dim">{item.caption}</figcaption>}
      {canEdit && <RemoveMedia id={item.id} />}
    </>
  );
  if (item.kind === "embed" && item.url) {
    const embed = toEmbed(item.url);
    if (!embed) return null;
    return (
      <figure className="col-span-2">
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
      <figure className="col-span-2">
        <video src={src} controls playsInline preload="metadata" className="w-full rounded-md bg-black" />
        {caption}
      </figure>
    );
  }
  if (item.kind === "audio") {
    return (
      <figure className="col-span-2 rounded-md border border-line bg-night-2 p-4">
        <p className="mono mb-3 text-maize">{item.caption ?? "Track from the night"}</p>
        <audio src={src} controls preload="none" className="w-full" />
        {canEdit && <RemoveMedia id={item.id} />}
      </figure>
    );
  }
  return (
    <figure className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <a href={src} target="_blank" rel="noopener" className="group block overflow-hidden rounded-md bg-night-2" aria-label={`Open full photo${item.caption ? `: ${item.caption}` : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={item.caption ?? "Photo from the night"}
          loading="lazy"
          className={`w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02] ${wide ? "aspect-[3/2] sm:aspect-video" : "aspect-square"}`}
        />
      </a>
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
  // Photos sit in a 2-up grid; with an odd count the first one runs full width so nothing is left hanging.
  const photos = media.filter((m) => m.kind === "photo" && m.r2_key);
  const loneLeadPhoto = photos.length % 2 === 1 ? photos[0].id : null;

  return (
    <article className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
      {post.placeholder ? (
        <p className="mb-8 max-w-[65ch] rounded-md border border-pink/60 bg-pink/10 p-4">
          <PlaceholderBadge /> <span className="ml-2">This is a stand-in until it gets rewritten in the crew&apos;s own voice.</span>
        </p>
      ) : null}
      <p className="mono -my-3">
        <Link href={`/section/${post.section}`} className="tap -ml-2 text-maize hover:text-ink">
          {section?.name ?? post.section}
        </Link>
      </p>
      <h1 className="display mt-3 max-w-5xl text-[clamp(2.5rem,11.5vw,6.5rem)] sm:mt-4 md:text-[clamp(3.5rem,8vw,6.5rem)]">{post.title}</h1>
      {post.dek && <p className="mt-4 max-w-[55ch] text-xl leading-snug sm:mt-6 sm:text-2xl">{post.dek}</p>}
      {canEdit && (
        <p className="mt-2">
          <Link href={`/posts/${post.slug}/edit`} className="mono tap -ml-2 text-maize underline underline-offset-4 hover:text-ink">
            Edit post
          </Link>
        </p>
      )}

      <div className="mt-6 max-w-4xl sm:mt-8">
        <Wristband postedAt={post.published_at} nightOf={post.night_of} night={post.night} damage={post.damage} rideHome={post.ride_home} />
      </div>

      <div className="mt-10">
        <Markdown>{post.body}</Markdown>
      </div>

      {media.length > 0 && (
        <section aria-label="Photos, videos and music" className="mt-12 grid max-w-4xl grid-cols-2 gap-x-2 gap-y-4 sm:mt-16 sm:gap-x-4 sm:gap-y-6">
          {media.map((m) => (
            <MediaBlock key={m.id} item={m} base={env.MEDIA_PUBLIC_URL} canEdit={canEdit} wide={m.id === loneLeadPhoto} />
          ))}
        </section>
      )}

      <p className="mt-12 border-t border-line pt-4 text-sm text-dim sm:mt-16 sm:pt-6">
        In something you want gone?{" "}
        <Link href={`/takedown?post=${post.slug}`} className="relative underline underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-pink">
          Ask for a takedown
        </Link>
        . No questions asked.
      </p>

      {canEdit && (
        <form action={deletePost} className="mt-4">
          <input type="hidden" name="id" value={post.id} />
          <button className="min-h-11 text-sm text-dim underline underline-offset-4 hover:text-pink">Delete this post and its uploads</button>
        </form>
      )}
    </article>
  );
}
