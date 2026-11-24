"use client";

import { useActionState } from "react";
import { createNight, type AdminResult } from "../actions";

export function NewNightForm() {
  const [state, action, pending] = useActionState<AdminResult, FormData>(createNight, undefined);
  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label htmlFor="name" className="mb-2 block font-bold">Name</label>
        <input id="name" name="name" required maxLength={100} className="field text-xl" placeholder="Birthday Boy turns 27" />
        <p className="mt-1 text-sm text-dim">Shows on the invite. Use a nickname, not a real name.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startsAt" className="mb-2 block font-bold">Party starts</label>
          <input id="startsAt" name="startsAt" type="datetime-local" required className="field" />
        </div>
        <div>
          <label htmlFor="closesAt" className="mb-2 block font-bold">Photos close (optional)</label>
          <input id="closesAt" name="closesAt" type="datetime-local" className="field" />
          <p className="mt-1 text-sm text-dim">Default: noon the next day.</p>
        </div>
      </div>
      <div>
        <label htmlFor="location" className="mb-2 block font-bold">Where (optional)</label>
        <input id="location" name="location" maxLength={200} className="field" placeholder="Address or meetup spot" />
        <p className="mt-1 text-sm text-dim">Only people with the link see this. It never goes in the post.</p>
      </div>
      <div>
        <label htmlFor="dressCode" className="mb-2 block font-bold">Dress code (optional)</label>
        <input id="dressCode" name="dressCode" maxLength={100} className="field" placeholder="All black, no exceptions" />
      </div>
      <div>
        <label htmlFor="details" className="mb-2 block font-bold">The invite (optional)</label>
        <textarea id="details" name="details" rows={4} maxLength={2000} className="field" placeholder="Pregame at 9, Rick's by 10:30, Pizza House after." />
      </div>
      {state && "error" in state && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{state.error}</p>}
      <button disabled={pending} className="rounded-full bg-maize px-8 py-4 text-lg font-bold text-night hover:bg-ink disabled:opacity-60">
        {pending ? "Creating…" : "Create the night"}
      </button>
    </form>
  );
}
