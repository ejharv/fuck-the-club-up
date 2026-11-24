"use client";

import { useEffect, useState } from "react";
import { browserEnv, browserName, openOutHref, type BrowserEnv } from "@/lib/in-app";

/** Shown only inside Snapchat/Instagram/etc.: the page works here, but a real browser remembers you. */
export function InAppNotice() {
  const [env, setEnv] = useState<BrowserEnv | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => setEnv(browserEnv()), []);
  if (!env?.inApp || hidden) return null;
  const href = openOutHref(location.href.split("#")[0], env);
  return (
    <div role="note" className="mb-6 rounded-md border border-maize bg-maize/10 p-4">
      <p className="font-bold">You opened this in {env.inApp}.</p>
      <p className="mt-1 text-sm text-dim">
        You can RSVP here, but {env.inApp} doesn&apos;t always keep you signed in. Open it in {browserName(env)} so your RSVP is still there on the night.
        {env.ios || env.android ? "" : ` Tap ••• and choose "Open in browser".`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(env.ios || env.android) && (
          <a href={href} className="inline-flex min-h-11 items-center rounded-full bg-maize px-5 font-bold text-night hover:bg-ink">
            Open in {browserName(env)}
          </a>
        )}
        <button type="button" onClick={() => setHidden(true)} className="inline-flex min-h-11 items-center rounded-full border border-ink px-4 text-sm font-bold">
          Stay here
        </button>
      </div>
      {(env.ios || env.android) && <p className="mt-2 text-xs text-dim">Button not working? Tap ••• (top corner) → &quot;Open in browser&quot;.</p>}
    </div>
  );
}
