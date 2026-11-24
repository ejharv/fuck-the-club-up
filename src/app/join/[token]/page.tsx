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
    <section className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 sm:pt-14">
      <p className="mono text-pink">{admin ? "VIP access" : "Crew access"}</p>
      <h1 className="display mt-4 break-words text-[clamp(2.75rem,12vw,6.5rem)]">
        {admin ? (
          <>You&apos;re running <span className="text-maize">the door.</span></>
        ) : (
          <>You&apos;re on <span className="text-maize">the list.</span></>
        )}
      </h1>
      <p className="mt-6 text-lg leading-snug">
        Fuck The Club Up is our blog about nights out: the parties, the bars, the food after, and the stories that turned into lore, written by the people who were there.
      </p>

      <section aria-labelledby="how-h" className="mt-8 rounded-md border border-line bg-night-2 p-4 sm:p-5">
        <h2 id="how-h" className="mono text-pink">How a night works</h2>
        <ol className="mt-3 space-y-3">
          {[
            ["One link", "Every night gets one link. Before: it's the invite, people RSVP with a nickname. During: it collects everyone's photos and videos."],
            ["Everyone's side", "After, everyone writes their side of the story. It all gets stitched into one funny write-up."],
            ["It drops", "The crew reads it, fixes it, approves it, and it goes up with the photos, the songs and the places."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="display grid h-8 w-8 shrink-0 place-items-center rounded-full bg-maize text-night">{i + 1}</span>
              <span>
                <strong className="block leading-snug">{t}</strong>
                <span className="text-sm text-dim">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="you-h" className="mt-6">
        <h2 id="you-h" className="display text-2xl">{admin ? "As an admin you can" : "On the crew you can"}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Host your own nights: send the invite, collect the photos and stories, drop the write-up.</li>
          <li>Write posts about any night, with writing help if you want it.</li>
          <li>Add co-hosts to your nights.</li>
          {admin && <li>Run the whole site: the crew list, invites, site text and takedown requests, plus every night.</li>}
        </ul>
      </section>

      <section aria-labelledby="claim-h" className="mt-6">
        <h2 id="claim-h" className="display text-2xl">Claiming it</h2>
        <p className="mt-2 text-dim">
          Tap the button and sign in with Google. That Google account becomes your login here. We never see your password, and your email never shows on the site. Posts don&apos;t say who wrote them.
        </p>
        {inv.email && <p className="mt-2 text-dim">This one is for the Google account {maskEmail(inv.email)}.</p>}
        {admin && !inv.email && <p className="mt-2 text-pink">This link works once. Don&apos;t forward it.</p>}
      </section>

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
            <button className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-ink px-6 py-3 font-bold hover:border-maize hover:text-maize sm:w-auto">Sign out</button>
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
