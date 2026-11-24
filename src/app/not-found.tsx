import Link from "next/link";

export const metadata = { robots: { index: false } };

export default function NotFound() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16">
      <h1 className="display max-w-5xl text-[clamp(3rem,13vw,9rem)] text-ink">Nobody remembers this one.</h1>
      <p className="mt-6 text-lg text-dim">That page doesn&apos;t exist, or it was deleted.</p>
      <Link href="/" className="mt-5 inline-block py-3 font-bold text-maize underline underline-offset-4 hover:text-ink">
        Back to the latest posts
      </Link>
    </section>
  );
}
