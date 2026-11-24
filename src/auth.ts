import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { cf } from "@/lib/env";
import { JOIN_COOKIE, inviteFits, liveInvite } from "@/lib/invites";

/**
 * Google sign-in, gated by the `members` table in D1. If your email isn't on
 * the crew list you can't sign in, unless you arrived through a working crew
 * invite link meant for your email (the /join page sets a short-lived cookie).
 * Signing in through an invite grants nothing by itself: the person still
 * claims it on the /join page. Emails in ADMIN_EMAILS become admins on their
 * first sign-in so the site can be bootstrapped.
 *
 * Config is built per request because D1 and secrets only exist inside a
 * request on Workers.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const env = await cf();
  return {
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google" || !profile?.email || profile.email_verified !== true) {
          return false;
        }
        const email = profile.email.toLowerCase();
        const admins = (env.ADMIN_EMAILS ?? "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);

        if (admins.includes(email)) {
          await env.DB.prepare(
            `INSERT INTO members (email, name, image, role, added_by) VALUES (?1, ?2, ?3, 'admin', 'bootstrap')
             ON CONFLICT (email) DO UPDATE SET role = 'admin', name = ?2, image = ?3`,
          )
            .bind(email, profile.name ?? null, (profile.picture as string | undefined) ?? null)
            .run();
          return true;
        }

        const member = await env.DB.prepare("SELECT email FROM members WHERE email = ?").bind(email).first();
        if (!member) {
          const joinToken = (await cookies()).get(JOIN_COOKIE)?.value;
          const invite = joinToken ? await liveInvite(env.DB, joinToken) : null;
          if (invite && inviteFits(invite, email)) return true;
          return invite ? `/join/${joinToken}?error=WrongAccount` : "/login?error=NotOnTheList";
        }

        await env.DB.prepare("UPDATE members SET name = ?2, image = ?3 WHERE email = ?1")
          .bind(email, profile.name ?? null, (profile.picture as string | undefined) ?? null)
          .run();
        return true;
      },
      async jwt({ token, profile }) {
        if (profile?.email) token.email = profile.email.toLowerCase();
        return token;
      },
    },
  };
});
