import { redirect } from "next/navigation";
import { currentMember } from "@/lib/session";
import { NewNightForm } from "./NewNightForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New night", robots: { index: false } };

export default async function NewNight() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/nights/new");

  return (
    <section className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
      <h1 className="display text-[clamp(3rem,9vw,5rem)]">New night</h1>
      <p className="mt-3 text-dim">
        You&apos;ll get one link to share anywhere: group chats, stories, texts. Before the party it&apos;s the invite. When the party starts it opens for photos and everyone&apos;s side of the story. For a night that already happened, just pick its date.
      </p>
      <NewNightForm />
    </section>
  );
}
