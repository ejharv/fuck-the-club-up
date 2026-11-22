import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/actions";
import { safePath } from "@/lib/safe-path";
import { currentMember } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crew sign in", robots: { index: false } };

const messages: Record<string, string> = {
  NotOnTheList: "That Google account isn't on the crew list. Ask whoever runs the site to add your email.",
  AccessDenied: "That Google account isn't on the crew list. Ask whoever runs the site to add your email.",
  Configuration: "Sign-in isn't set up correctly yet. Check the Google client ID and secret.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  if (await currentMember()) redirect(safePath(next));
  const message = error ? (messages[error] ?? "Sign-in didn't go through. Try again.") : null;

  return (
    <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
      <h1 className="flyer max-w-3xl text-[clamp(3.5rem,11vw,8rem)] text-ink">Crew only past this point.</h1>
      <p className="mt-6 max-w-xl text-lg text-dim">
        Anyone can read. To post you need to be on the crew list. Sign in with the Google account you gave the admin.
      </p>
      {message && (
        <p role="alert" className="mt-6 max-w-xl rounded-md border border-pink/60 bg-pink/10 p-4 text-ink">
          {message}
        </p>
      )}
      <form action={signInWithGoogle} className="mt-8">
        <input type="hidden" name="next" value={safePath(next, "/new")} />
        <button className="rounded-full bg-ink px-6 py-3 font-bold text-night hover:bg-maize">
          Continue with Google
        </button>
      </form>
    </section>
  );
}
