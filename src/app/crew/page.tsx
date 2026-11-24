import { redirect } from "next/navigation";
import { removeMember } from "@/app/actions";
import { listMembers } from "@/lib/db";
import { currentMember } from "@/lib/session";
import { AddMemberForm } from "./AddMemberForm";
import { InviteForm } from "./InviteForm";
import { revokeInvite } from "./invite-actions";
import { cf } from "@/lib/env";
import type { CrewInvite } from "@/lib/invites";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crew", robots: { index: false } };

export default async function CrewPage() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/crew");
  if (me.role !== "admin") redirect("/");
  const members = await listMembers();
  const env = await cf();
  const { results: invites } = await env.DB.prepare(
    `SELECT id, role, email, label, max_uses, uses, expires_at, revoked, created_at FROM crew_invites
      WHERE revoked = 0 AND uses < max_uses AND expires_at > ? ORDER BY created_at DESC`,
  )
    .bind(new Date().toISOString())
    .all<CrewInvite>();

  return (
    <section className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="display text-[clamp(3rem,9vw,6rem)] text-ink">The list</h1>
      <p className="mt-4 text-dim">
        Add a friend&apos;s Google email and they can sign in and post. Remove them and they lose access right away.
      </p>

      <InviteForm />

      {invites.length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold">Open invites</h2>
          <ul className="mt-3 space-y-2">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 rounded bg-night-2 p-3 text-sm">
                <span className={`mono ${i.role === "admin" ? "text-pink" : "text-maize"}`}>{i.role}</span>
                <span>{i.label ?? i.email ?? "Anyone with the link"}</span>
                <span className="text-dim">
                  {i.uses}/{i.max_uses} used · expires {new Date(i.expires_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })}
                </span>
                <form action={revokeInvite} className="ml-auto">
                  <input type="hidden" name="id" value={i.id} />
                  <button className="text-dim underline underline-offset-4 hover:text-pink">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-12 font-bold">Or add someone directly</h2>
      <AddMemberForm />

      <ul className="mt-10 border-t border-line">
        {members.map((m) => (
          <li key={m.email} className="flex items-center gap-4 border-b border-line py-4">
            {m.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.image} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div aria-hidden className="h-10 w-10 rounded-full border border-dashed border-line" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">{m.name ?? "Hasn't signed in yet"}</p>
              <p className="truncate text-sm text-dim">{m.email}</p>
            </div>
            <span className={`mono ${m.role === "admin" ? "text-pink" : "text-maize"}`}>
              {m.role === "admin" ? "Admin" : "Crew"}
            </span>
            {m.email !== me.email && (
              <form action={removeMember}>
                <input type="hidden" name="email" value={m.email} />
                <button className="text-sm text-dim underline underline-offset-4 hover:text-pink">Remove</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
