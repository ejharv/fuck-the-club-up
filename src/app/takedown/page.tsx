import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/db";
import { cf } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";
import { TakedownForm } from "./TakedownForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask for a takedown", robots: { index: false } };

export default async function TakedownPage({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  const slug = (await searchParams).post ?? "";
  const found = slug ? await getPost(slug) : null;
  if (!found) notFound();
  const env = await cf();
  return (
    <section className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
      <h1 className="display text-[clamp(2.75rem,9vw,5rem)]">Want something taken down?</h1>
      <p className="mt-4 text-lg">
        From <strong>{found.post.title}</strong>. No questions asked; an admin looks at every request. House rule 1: no names or faces without a yes.
      </p>
      <TakedownForm
        post={slug}
        siteKey={env.TURNSTILE_SITE_KEY}
        media={found.media
          .filter((m) => m.r2_key && (m.kind === "photo" || m.kind === "video"))
          .map((m) => ({ id: m.id, kind: m.kind, src: mediaUrl(m.r2_key!, env.MEDIA_PUBLIC_URL) }))}
      />
    </section>
  );
}
