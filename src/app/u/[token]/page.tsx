import type { Metadata } from "next";
import { cf } from "@/lib/env";
import { liveSession } from "@/lib/phone-upload";
import { PhoneUploader } from "./PhoneUploader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add from phone", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PhonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = await cf();
  const s = await liveSession(env.DB, token);
  if (!s) {
    return (
      <section className="mx-auto max-w-xl px-4 pt-14 sm:px-6">
        <h1 className="display text-[clamp(2.5rem,11vw,4.5rem)]">This QR code expired.</h1>
        <p className="mt-5 text-lg text-dim">They last 30 minutes. Make a new one from the post editor.</p>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-xl px-4 pt-10 sm:px-6">
      <p className="mono text-pink">Add from phone</p>
      <h1 className="display mt-3 text-[clamp(2.5rem,11vw,4.5rem)]">Send it to the post.</h1>
      <p className="mt-4 text-lg">Pick photos and videos. They show up in the editor on your computer in a few seconds.</p>
      <PhoneUploader token={token} expiresAt={s.expires_at} />
    </section>
  );
}
