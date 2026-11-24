import { redirect } from "next/navigation";
import { todayInDetroit } from "@/lib/post-fields";
import { currentMember } from "@/lib/session";
import { NewPostForm } from "./NewPostForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New post", robots: { index: false } };

export default async function NewPost() {
  if (!(await currentMember())) redirect("/login?next=/new");
  return (
    <section className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
      <h1 className="display text-[clamp(3rem,9vw,5.5rem)]">New post</h1>
      <NewPostForm today={todayInDetroit()} />
    </section>
  );
}
