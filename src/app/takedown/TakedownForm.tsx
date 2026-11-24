"use client";

import Script from "next/script";
import { useActionState, useState } from "react";
import { requestTakedown, type TakedownResult } from "./actions";

export function TakedownForm({ post, siteKey, media }: { post: string; siteKey: string; media: Array<{ id: string; kind: string; src: string }> }) {
  const [state, action, pending] = useActionState<TakedownResult, FormData>(requestTakedown, undefined);
  const [picked, setPicked] = useState("");
  if (state && "ok" in state) {
    return <p role="status" className="mt-8 rounded-md border-2 border-dashed border-maize p-5 text-lg">Got it. An admin will look at it soon.</p>;
  }
  return (
    <form action={action} className="mt-8 space-y-6">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <input type="hidden" name="post" value={post} />
      <input type="hidden" name="mediaId" value={picked} />
      {media.length > 0 && (
        <fieldset>
          <legend className="mb-3 font-bold">Which one? (optional)</legend>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {media.map((m) => (
              <li key={m.id}>
                <button type="button" aria-pressed={picked === m.id} onClick={() => setPicked(picked === m.id ? "" : m.id)} className={`block w-full overflow-hidden rounded ${picked === m.id ? "ring-4 ring-pink" : ""}`}>
                  {m.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.src} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <video src={m.src} preload="metadata" muted className="aspect-square w-full object-cover" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div>
        <label htmlFor="reason" className="mb-2 block font-bold">What should come down, and why? (optional)</label>
        <textarea id="reason" name="reason" rows={4} maxLength={1000} className="field" />
      </div>
      <div>
        <label htmlFor="contact" className="mb-2 block font-bold">How to reach you (optional)</label>
        <input id="contact" name="contact" maxLength={200} className="field" placeholder="Email or @handle, only if you want a reply" />
      </div>
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="dark" />
      {state && "error" in state && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{state.error}</p>}
      <button disabled={pending} className="rounded-full bg-maize px-8 py-4 text-lg font-bold text-night hover:bg-ink disabled:opacity-60">
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
