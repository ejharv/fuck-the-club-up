"use client";

import QRCode from "qrcode";
import { useActionState, useEffect, useState } from "react";
import { createInvite, type InviteResult } from "./invite-actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteResult, FormData>(createInvite, undefined);
  const [role, setRole] = useState<"crew" | "admin">("crew");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = state && "token" in state ? `${window.location.origin}/join/${state.token}` : null;

  useEffect(() => {
    setCopied(false);
    if (link) QRCode.toDataURL(link, { margin: 1, width: 280, color: { dark: "#0c0d1c", light: "#f2eee4" } }).then(setQr);
    else setQr(null);
  }, [link]);

  return (
    <div className="mt-10 rounded-md border-2 border-dashed border-maize p-5">
      <h2 className="display text-2xl">Send an invite link</h2>
      <p className="mt-2 text-dim">The link previews with a fun image in the group chat. Opening it does nothing until they sign in with Google and claim it.</p>
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="inv-role" className="mb-2 block font-bold">Access</label>
          <select id="inv-role" name="role" value={role} onChange={(e) => setRole(e.target.value as "crew" | "admin")} className="field">
            <option value="crew">Crew: can post</option>
            <option value="admin">Admin: runs nights and the crew</option>
          </select>
        </div>
        <div>
          <label htmlFor="inv-email" className="mb-2 block font-bold">Their Google email{role === "admin" ? "" : " (optional)"}</label>
          <input id="inv-email" name="email" type="email" required={role === "admin"} className="field" placeholder="friend@gmail.com" />
        </div>
        <div>
          <label htmlFor="inv-label" className="mb-2 block font-bold">Who it&apos;s for (just for you)</label>
          <input id="inv-label" name="label" maxLength={60} className="field" placeholder="Lefty" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="inv-hours" className="mb-2 block font-bold">Expires</label>
            <select id="inv-hours" name="hours" className="field" defaultValue={role === "admin" ? "24" : "72"} key={role}>
              <option value="1">1 hour</option>
              <option value="24">1 day</option>
              <option value="48">2 days</option>
              {role === "crew" && <option value="72">3 days</option>}
              {role === "crew" && <option value="168">1 week</option>}
            </select>
          </div>
          <div>
            <label htmlFor="inv-uses" className="mb-2 block font-bold">Uses</label>
            <input id="inv-uses" name="uses" type="number" min={1} max={role === "admin" ? 1 : 25} defaultValue={1} disabled={role === "admin"} className="field" key={role} />
          </div>
        </div>
        {role === "admin" && (
          <p className="text-sm text-pink sm:col-span-2">Admin invites only work for that one Google account, once, within 2 days. Forwarding it to anyone else does nothing.</p>
        )}
        <button disabled={pending} className="rounded-full bg-maize px-6 py-3 font-bold text-night hover:bg-ink disabled:opacity-60 sm:col-span-2 sm:justify-self-start">
          {pending ? "Making it…" : "Make the link"}
        </button>
      </form>
      {state && "error" in state && <p role="alert" className="mt-4 text-pink">{state.error}</p>}
      {link && (
        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-dim">Copy it now. Only a fingerprint is stored, so this is the one time it&apos;s shown.</p>
            <p className="mt-2 break-all rounded bg-night-2 p-3 font-mono text-sm">{link}</p>
            <button type="button" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }} className="mt-3 rounded-full bg-maize px-5 py-2 font-bold text-night hover:bg-ink">
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR code for the invite" className="h-36 w-36 rounded" />}
        </div>
      )}
    </div>
  );
}
