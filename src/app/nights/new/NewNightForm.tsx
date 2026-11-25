"use client";

import { useActionState } from "react";
import { createNight, type AdminResult } from "../actions";
import { InviteMediaField } from "./InviteMediaField";

export function NewNightForm() {
  const [state, action, pending] = useActionState<AdminResult, FormData>(createNight, undefined);
  return (
    <form action={action} className="mt-8 space-y-6">
      <div>
        <label htmlFor="name" className="mb-2 block font-bold">Name</label>
        <input id="name" name="name" required maxLength={100} autoComplete="off" enterKeyHint="next" className="field text-xl" placeholder="Halloween at the house" />
        <p className="mt-1 text-sm text-dim">Name the night, not the people. Guests add their own name or nickname when they RSVP.</p>
      </div>
      <fieldset className="min-w-0 grid gap-4 rounded-md border border-line p-4 sm:grid-cols-2">
        <legend className="mono px-2 text-maize">When</legend>
        <div>
          <label htmlFor="startsAt" className="mb-2 block font-bold">Party starts</label>
          <input id="startsAt" name="startsAt" type="datetime-local" required className="field min-h-12" />
        </div>
        <div>
          <label htmlFor="closesAt" className="mb-2 block font-bold">Photos close (optional)</label>
          <input id="closesAt" name="closesAt" type="datetime-local" className="field min-h-12" />
          <p className="mt-1 text-sm text-dim">Default: noon the next day.</p>
        </div>
      </fieldset>
      <div>
        <label htmlFor="location" className="mb-2 block font-bold">Where (optional)</label>
        <input id="location" name="location" maxLength={200} autoComplete="off" enterKeyHint="next" className="field" placeholder="Address or meetup spot" />
        <p className="mt-1 text-sm text-dim">Only people with the link see this. It never goes in the post.</p>
      </div>
      <InviteMediaField />
      <div>
        <label htmlFor="dressCode" className="mb-2 block font-bold">Dress code (optional)</label>
        <input id="dressCode" name="dressCode" maxLength={100} autoComplete="off" enterKeyHint="next" className="field" placeholder="All black, no exceptions" />
      </div>
      <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4">
        <legend className="mono px-2 text-maize">Guest list</legend>
        <div>
          <label htmlFor="capacity" className="mb-2 block font-bold">Guest limit</label>
          <input id="capacity" name="capacity" type="number" inputMode="numeric" min={1} max={5000} className="field sm:w-48" placeholder="No limit" />
        </div>
        <p className="mt-2 text-sm text-dim">Guests can share the invite, and everyone RSVPs for themselves. Once the limit is hit, new RSVPs go on a waitlist and move up automatically when spots open. You can change it later.</p>
      </fieldset>
      <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4">
        <legend className="mono px-2 text-maize">Private night</legend>
        <label className="flex cursor-pointer gap-3 py-1">
          <input type="checkbox" name="privateInvite" className="mt-1 h-6 w-6 shrink-0 accent-[var(--maize)]" />
          <span>
            <strong>Approval to get in</strong>
            <span className="block text-sm text-dim">People ask to come and you approve each one. Until then they only see the name, time and invite video, not the location, guest list or photos. No share button.</span>
          </span>
        </label>
        <label className="mt-2 flex cursor-pointer gap-3 py-1">
          <input type="checkbox" name="privatePost" className="mt-1 h-6 w-6 shrink-0 accent-[var(--maize)]" />
          <span>
            <strong>Write-up stays private</strong>
            <span className="block text-sm text-dim">The post stays off the public site, Places and Playlists. Only crew and people from the night can read it.</span>
          </span>
        </label>
        <p className="mt-2 text-sm text-dim">You can change both later.</p>
      </fieldset>
      <div>
        <label htmlFor="details" className="mb-2 block font-bold">The invite (optional)</label>
        <textarea id="details" name="details" rows={4} maxLength={2000} className="field" placeholder="Pregame at 9, Rick's by 10:30, Pizza House after." />
      </div>
      {state && "error" in state && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{state.error}</p>}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-night/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        <button disabled={pending} className="min-h-14 w-full rounded-full bg-maize px-8 text-lg font-bold text-night hover:bg-ink disabled:opacity-60 sm:w-auto">
          {pending ? "Creating…" : "Create the night"}
        </button>
      </div>
    </form>
  );
}
