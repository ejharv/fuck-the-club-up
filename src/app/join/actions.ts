"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { cf } from "@/lib/env";
import { JOIN_COOKIE, liveInvite, redeemInvite } from "@/lib/invites";
import { currentMember, signedInEmail } from "@/lib/session";

export type JoinResult = { error: string } | undefined;

/** Remember the invite for the Google round trip, then sign in. */
export async function startJoin(token: string): Promise<JoinResult> {
  const env = await cf();
  if (!(await liveInvite(env.DB, String(token)))) return { error: "This invite doesn't work anymore. Ask for a new one." };
  (await cookies()).set(JOIN_COOKIE, String(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });
  await signIn("google", { redirectTo: `/join/${token}` });
}

/** The signed-in person takes their spot. Only now does anything change. */
export async function claimInvite(token: string): Promise<JoinResult> {
  const env = await cf();
  const email = await signedInEmail();
  if (!email) return { error: "Sign in with Google first." };
  const existing = await currentMember();
  const inv = await liveInvite(env.DB, String(token));
  if (existing && (existing.role === "admin" || inv?.role !== "admin")) {
    (await cookies()).delete(JOIN_COOKIE);
    redirect("/");
  }
  const redeemed = await redeemInvite(env.DB, String(token), email, null);
  if (!redeemed) {
    return { error: inv ? "This invite is for a different Google account. Sign out and use the one it was sent to." : "This invite doesn't work anymore. Ask for a new one." };
  }
  (await cookies()).delete(JOIN_COOKIE);
  redirect(redeemed.role === "admin" ? "/nights" : "/");
}
