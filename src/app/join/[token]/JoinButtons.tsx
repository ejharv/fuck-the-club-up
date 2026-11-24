"use client";

import { useState, useTransition } from "react";
import { claimInvite, startJoin } from "../actions";

export function JoinButtons({ token, signedIn, admin }: { token: string; signedIn: boolean; admin: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (fn: () => Promise<{ error: string } | undefined>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  return (
    <div className="mt-8">
      {signedIn ? (
        <button type="button" disabled={pending} onClick={() => go(() => claimInvite(token))} className="rounded-full bg-maize px-8 py-4 text-lg font-bold text-night hover:bg-ink disabled:opacity-60">
          {pending ? "Claiming…" : admin ? "Claim admin access" : "Claim my spot"}
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => go(() => startJoin(token))} className="rounded-full bg-ink px-8 py-4 text-lg font-bold text-night hover:bg-maize disabled:opacity-60">
          {pending ? "Opening Google…" : "Continue with Google"}
        </button>
      )}
      {error && <p role="alert" className="mt-4 text-pink">{error}</p>}
    </div>
  );
}
