"use client";

import { useActionState, useEffect, useRef } from "react";
import { addMember, type ActionResult } from "@/app/actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addMember, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && !state) form.current?.reset();
  }, [pending, state]);

  return (
    <form ref={form} action={action} className="mt-8 flex flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="email">Friend&apos;s Google email</label>
      <input id="email" name="email" type="email" required placeholder="friend@gmail.com" className="field sm:flex-1" />
      <label className="sr-only" htmlFor="role">Role</label>
      <select id="role" name="role" className="field sm:w-32">
        <option value="crew">Crew</option>
        <option value="admin">Admin</option>
      </select>
      <button disabled={pending} className="rounded-full bg-maize px-6 py-3 font-bold text-night hover:bg-ink disabled:opacity-60">
        {pending ? "Adding…" : "Add to crew"}
      </button>
      {state?.error && <p role="alert" className="text-sm text-maize sm:basis-full">{state.error}</p>}
    </form>
  );
}
