import Link from "next/link";

export const metadata = { robots: { index: false } };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
      <h1 className="display text-[clamp(3.5rem,12vw,9rem)] text-ink">Nobody remembers this one.</h1>
      <p className="mt-6 text-lg text-dim">That page doesn&apos;t exist, or it was deleted.</p>
      <Link href="/" className="mt-8 inline-block font-bold text-maize underline underline-offset-4">
        Back to the latest posts
      </Link>
    </section>
  );
}
