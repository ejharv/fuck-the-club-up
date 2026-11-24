"use client";

import { useState } from "react";

export type AssistFields = { title: string; dek: string; night: string; damage: string; rideHome: string; body: string };
type Suggestion = Partial<AssistFields> & {
  songs?: Array<{ title: string; artist: string | null }>;
  titleOptions?: string[];
  dekOptions?: string[];
  headsUp: string[];
};

const MODES = [
  { mode: "polish", label: "Fix typos", hint: "Grammar and spelling only. Your words stay." },
  { mode: "tighten", label: "Tighten it", hint: "Cut the filler, keep the jokes." },
  { mode: "punch", label: "Punch it up", hint: "Funnier and sharper, same facts." },
  { mode: "write", label: "Write it from my notes", hint: "Turn rough notes into a full post." },
  { mode: "headline", label: "Title ideas", hint: "Three titles and three one-liners." },
] as const;

const FIELD_LABELS: Array<[keyof AssistFields, string]> = [
  ["title", "Title"],
  ["dek", "Dek"],
  ["night", "The night"],
  ["damage", "Damage"],
  ["rideHome", "Ride home"],
];

/**
 * Claude in the editor. You pick how much help; the suggestion shows next to
 * your text and only replaces it when you say so.
 */
export function ClaudeAssist({
  getFields,
  venues,
  onApply,
  onSongs,
}: {
  getFields: () => AssistFields;
  venues: Array<{ name: string; url: string }>;
  onApply: (patch: Partial<AssistFields>) => void;
  onSongs?: (songs: Array<{ title: string; artist: string | null }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<Suggestion | null>(null);

  async function ask(mode: string) {
    setBusy(mode);
    setError(null);
    setS(null);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, request: mode === "custom" ? request : undefined, venues, ...getFields() }),
      });
      const data = (await res.json().catch(() => ({}))) as Suggestion & { error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't help with that one. Try again.");
      else setS(data);
    } catch {
      setError("Couldn't connect. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  function useAll() {
    if (!s) return;
    const patch: Partial<AssistFields> = {};
    for (const k of ["title", "dek", "night", "damage", "rideHome", "body"] as const) if (s[k]) patch[k] = s[k];
    onApply(patch);
    if (s.songs?.length) onSongs?.(s.songs);
    setS(null);
  }

  const changedFields = s ? FIELD_LABELS.filter(([k]) => s[k]) : [];
  return (
    <section aria-label="Writing help" className="rounded-md border-2 border-dashed border-pink/70 p-4 sm:p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
        <span>
          <span className="display text-xl text-pink">Writing help</span>
          <span className="block text-sm text-dim">As much or as little help as you want. Nothing changes until you pick &quot;Use this&quot;.</span>
        </span>
        <span aria-hidden className="mono text-pink">{open ? "Close" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => ask(m.mode)}
                className="min-h-14 rounded border border-line bg-night-2 px-4 py-2 text-left hover:border-pink disabled:opacity-60"
              >
                <span className="block font-bold">{busy === m.mode ? "Working…" : m.label}</span>
                <span className="block text-sm text-dim">{m.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="claude-request" className="sr-only">Ask for something specific</label>
            <input
              id="claude-request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && request.trim() && (e.preventDefault(), ask("custom"))}
              maxLength={600}
              placeholder='Or ask for something: "make the Pizza House part funnier"'
              className="field sm:flex-1"
            />
            <button type="button" disabled={Boolean(busy) || !request.trim()} onClick={() => ask("custom")} className="min-h-11 rounded-full bg-pink px-5 font-bold text-night disabled:opacity-50">
              {busy === "custom" ? "Working…" : "Ask"}
            </button>
          </div>
          {busy && <p role="status" className="mt-3 text-sm text-dim">Reading your post. This takes about 10 to 20 seconds.</p>}
          {error && <p role="alert" className="mt-3 text-pink">{error}</p>}

          {s && (
            <div className="mt-5 rounded-md border border-pink/60 bg-night-2 p-4">
              {s.headsUp.length > 0 && (
                <ul className="mb-4 space-y-1 rounded border border-maize/60 p-3 text-sm">
                  <li className="mono text-maize">Heads up</li>
                  {s.headsUp.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              )}

              {(s.titleOptions?.length || s.dekOptions?.length) ? (
                <div className="space-y-4">
                  {s.titleOptions?.length ? (
                    <div>
                      <p className="mono text-pink">Titles</p>
                      <ul className="mt-2 space-y-2">
                        {s.titleOptions.map((t, i) => (
                          <li key={i}><button type="button" onClick={() => onApply({ title: t })} className="min-h-11 w-full rounded border border-line px-3 text-left hover:border-pink"><span className="font-bold">{t}</span> <span className="mono text-dim">Use</span></button></li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {s.dekOptions?.length ? (
                    <div>
                      <p className="mono text-pink">One-liners</p>
                      <ul className="mt-2 space-y-2">
                        {s.dekOptions.map((t, i) => (
                          <li key={i}><button type="button" onClick={() => onApply({ dek: t })} className="min-h-11 w-full rounded border border-line px-3 text-left hover:border-pink">{t} <span className="mono text-dim">Use</span></button></li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {changedFields.length > 0 && (
                    <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                      {changedFields.map(([k, label]) => (
                        <div key={k}><dt className="mono text-pink">{label}</dt><dd>{s[k]}</dd></div>
                      ))}
                    </dl>
                  )}
                  {s.body && (
                    <div>
                      <p className="mono text-pink">Suggested story</p>
                      <div className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded bg-night p-3 text-[0.95rem] leading-relaxed">{s.body}</div>
                    </div>
                  )}
                  {s.songs?.length ? <p className="mt-3 text-sm text-dim">Plus {s.songs.length} {s.songs.length === 1 ? "song" : "songs"} for the playlist.</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={useAll} className="min-h-11 rounded-full bg-pink px-6 font-bold text-night">Use this</button>
                    <button type="button" onClick={() => setS(null)} className="min-h-11 rounded-full border border-ink px-5 font-bold hover:border-pink">Keep mine</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
