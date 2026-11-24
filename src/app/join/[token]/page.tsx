import type { Metadata } from "next";
import { signOutAction } from "@/app/actions";
import { cf } from "@/lib/env";
import { inviteFits, liveInvite, maskEmail } from "@/lib/invites";
import { requestOrigin } from "@/lib/origin";
import { currentMember, signedInEmail } from "@/lib/session";
import { JoinButtons } from "./JoinButtons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> };

/** The link preview in iMessage, WhatsApp, Discord… Opening the link grants nothing. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const env = await cf();
  const inv = await liveInvite(env.DB, (await params).token);
  const admin = inv?.role === "admin";
  const image = `${await requestOrigin()}/og/${admin ? "admin" : "crew"}-invite.png`;
  const title = admin ? "VIP: you're running the door" : "You're on the list";
  const description = admin ? "Admin access to Fuck The Club Up. Tap to claim it." : "You're in the crew. Tap to claim your spot.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630, alt: title }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function JoinPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const env = await cf();
  const inv = await liveInvite(env.DB, token);
  const [email, member] = await Promise.all([signedInEmail(), currentMember()]);

  if (!inv) {
    return (
      <section className="mx-auto max-w-2xl px-4 pt-16 sm:px-6">
        <h1 className="display text-[clamp(3rem,12vw,6rem)]">This invite&apos;s been used up.</h1>
        <p className="mt-6 text-lg text-dim">It expired, was already claimed, or got revoked. Ask whoever sent it for a fresh one.</p>
      </section>
    );
  }

  const admin = inv.role === "admin";
  const wrongAccount = Boolean(email && !inviteFits(inv, email)) || error === "WrongAccount";
  return (
    <section className="mx-auto max-w-2xl px-4 pt-14 sm:px-6">
      <p className="mono text-pink">{admin ? "VIP access" : "Crew access"}</p>
      <h1 className="display mt-4 text-[clamp(3rem,12vw,6.5rem)]">
        {admin ? (
          <>You&apos;re running <span className="text-maize">the door.</span></>
        ) : (
          <>You&apos;re on <span className="text-maize">the list.</span></>
        )}
      </h1>
      <p className="mt-6 text-lg">
        {admin
          ? "This makes you an admin: you can start nights, send party links, review photos, and drop posts."
          : "This puts you on the crew: you can sign in and post your own nights."}
      </p>
      {inv.email && <p className="mt-3 text-dim">For the Google account {maskEmail(inv.email)}.</p>}
      <div className="mt-6 rounded-md border-2 border-dashed border-maize p-4 text-sm">
        <p className="mono text-maize">House rules</p>
        <p className="mt-2">No names without a yes · Nobody drives · Punch up · Water between rounds</p>
      </div>

      {wrongAccount ? (
        <div className="mt-8">
          <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">
            You&apos;re signed in with a different Google account than this invite is for. Sign out, then open the link again and pick the right account.
          </p>
          <form action={signOutAction} className="mt-4">
            <button className="rounded-full border border-ink px-6 py-3 font-bold hover:border-maize hover:text-maize">Sign out</button>
          </form>
        </div>
      ) : member && (member.role === "admin" || !admin) ? (
        <p className="mt-8 text-lg">You&apos;re already in. Go have fun.</p>
      ) : (
        <JoinButtons token={token} signedIn={Boolean(email)} admin={admin} />
      )}
    </section>
  );
}
