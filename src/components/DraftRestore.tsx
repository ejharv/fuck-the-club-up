"use client";

/** "You have unsaved writing from earlier" prompt for editors using useFormDraft. */
export function DraftRestore({ savedAt, onRestore, onDiscard }: { savedAt: number; onRestore: () => void; onDiscard: () => void }) {
  const when = new Date(savedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div role="alert" className="rounded-md border-2 border-maize bg-maize/10 p-4">
      <p className="font-bold">You have unsaved writing from {when} on this device.</p>
      <p className="mt-1 text-sm text-dim">Bring it back to keep going, or start from what&apos;s here.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRestore} className="inline-flex min-h-11 items-center rounded-full bg-maize px-5 font-bold text-night hover:bg-ink">
          Restore it
        </button>
        <button type="button" onClick={onDiscard} className="inline-flex min-h-11 items-center rounded-full border border-ink px-4 font-bold">
          Discard
        </button>
      </div>
    </div>
  );
}

/** Small "saved on this device" line under an editor. */
export function DraftSavedNote({ savedAt }: { savedAt: number | null }) {
  if (!savedAt) return <p className="text-xs text-dim">Your writing autosaves on this device until you publish.</p>;
  return (
    <p role="status" className="text-xs text-dim">
      Autosaved on this device at {new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
    </p>
  );
}
