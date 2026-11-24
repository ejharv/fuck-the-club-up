"use client";

import type { Dispatch, SetStateAction } from "react";
import { MAX_VENUES, VENUE_KINDS, type VenueKind } from "@/lib/venues";

export type VenueRow = { name: string; url: string; kind: VenueKind };
export const blankVenue = (): VenueRow => ({ name: "", url: "", kind: "party" });

/** Where the night went: name, website (optional), and Party or Eat. Feeds the Places tab. */
export function VenuesEditor({ rows, setRows, onChange }: { rows: VenueRow[]; setRows: Dispatch<SetStateAction<VenueRow[]>>; onChange?: () => void }) {
  const set = (i: number, patch: Partial<VenueRow>) => {
    onChange?.();
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((v, i) => (
          <li key={i} className="grid gap-2 rounded bg-night-2 p-3 sm:grid-cols-[13rem_1fr_auto_auto] sm:items-center sm:bg-transparent sm:p-0">
            <input value={v.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={60} aria-label="Place name" placeholder="Rick's" autoComplete="off" enterKeyHint="next" className="field" />
            <input
              value={v.url}
              onChange={(e) => set(i, { url: e.target.value })}
              maxLength={300}
              aria-label="Website (optional)"
              placeholder="Website (optional)"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="field"
            />
            <div role="radiogroup" aria-label={`${v.name || "Place"}: party or eat`} className="grid grid-cols-2 overflow-hidden rounded border border-line">
              {VENUE_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={v.kind === k.value}
                  onClick={() => set(i, { kind: k.value })}
                  className={`mono min-h-11 px-4 ${v.kind === k.value ? (k.value === "eat" ? "bg-pink text-night" : "bg-maize text-night") : "text-dim hover:text-ink"}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { onChange?.(); setRows((r) => r.filter((_, j) => j !== i)); }} className="mono tap justify-self-end text-dim hover:text-pink">
              Remove
            </button>
          </li>
        ))}
      </ul>
      {rows.length < MAX_VENUES && (
        <button type="button" onClick={() => { onChange?.(); setRows((r) => [...r, blankVenue()]); }} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-ink px-5 font-bold hover:border-maize hover:text-maize">
          Add a place
        </button>
      )}
    </div>
  );
}
