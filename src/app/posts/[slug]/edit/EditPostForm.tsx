"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { updatePost } from "@/app/actions";
import { ClaudeAssist, type AssistFields } from "@/components/ClaudeAssist";
import { MediaPicker, pickerBusy, pickerFailed, type PickedItem } from "@/components/MediaPicker";
import { PhoneUploadQR } from "@/components/PhoneUploadQR";
import { VenuesEditor, blankVenue, type VenueRow } from "@/components/VenuesEditor";
import { MAX_FILES_PER_POST } from "@/lib/media-rules";
import { HOUSE_RULES } from "@/lib/sections";
import { linkPaste } from "@/lib/link-paste";
import { useFormDraft } from "@/lib/use-form-draft";
import { DraftRestore, DraftSavedNote } from "@/components/DraftRestore";
import { songsToLines } from "@/lib/tracks";

type Fields = {
  id: string;
  title: string;
  dek: string;
  section: string;
  night: string;
  nightOf: string;
  damage: string;
  rideHome: string;
  body: string;
};
type Media = { id: string; kind: string; caption: string; preview: string | null; label: string; isCover: boolean };

export function EditPostForm({
  post,
  media,
  today,
  venues: initialVenues,
  songsText,
}: {
  post: Fields;
  media: Media[];
  today: string;
  venues: VenueRow[];
  songsText: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [venues, setVenues] = useState<VenueRow[]>(initialVenues.length ? initialVenues : [blankVenue()]);
  const [songs, setSongs] = useState(songsText);
  const field = (name: string) => form.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
  const getFields = (): AssistFields => ({
    title: field("title")?.value ?? "",
    dek: field("dek")?.value ?? "",
    night: field("night")?.value ?? "",
    damage: field("damage")?.value ?? "",
    rideHome: field("rideHome")?.value ?? "",
    body: field("body")?.value ?? "",
  });
  const apply = (patch: Partial<AssistFields>) => {
    for (const [k, v] of Object.entries(patch)) {
      const el = field(k);
      if (el && typeof v === "string") el.value = v;
    }
  };
  const [items, setItems] = useState(media.map((m) => ({ ...m, remove: false })));
  const [cover, setCover] = useState<string | null>(media.find((m) => m.isCover)?.id ?? null);
  const [adding, setAdding] = useState<PickedItem[]>([]);
  const [newCover, setNewCover] = useState<string | null>(null);
  const uploading = pickerBusy(adding);
  const addFromPhone = useCallback((fresh: PickedItem[]) => setAdding((l) => [...l, ...fresh]), []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = useFormDraft({
    key: `ftcu-editpost:${post.id}`,
    form,
    extra: { venues, songs },
    setExtra: (e) => {
      if (Array.isArray(e?.venues) && e.venues.length) setVenues(e.venues);
      if (typeof e?.songs === "string") setSongs(e.songs);
    },
  });

  function submit(form: FormData) {
    setError(null);
    if (uploading) return setError("Wait for the uploads to finish.");
    if (pickerFailed(adding)) return setError("Remove the files that didn't upload, then save.");
    draft.saveNow();
    startTransition(async () => {
      draft.clear();
      const result = await updatePost({
        id: post.id,
        title: String(form.get("title") ?? ""),
        dek: String(form.get("dek") ?? ""),
        section: "night-reports",
        night: String(form.get("night") ?? ""),
        nightOf: String(form.get("nightOf") ?? ""),
        damage: String(form.get("damage") ?? ""),
        rideHome: String(form.get("rideHome") ?? ""),
        body: String(form.get("body") ?? ""),
        consent: form.get("consent") === "yes",
        media: items.filter((i) => !i.remove).map((i) => ({ id: i.id, caption: i.caption })),
        removeMediaIds: items.filter((i) => i.remove).map((i) => i.id),
        coverMediaId: cover,
        addMedia: adding.map((i) => ({ key: i.key, url: i.url, caption: i.caption })),
        coverNewKey: newCover,
        venues,
        songsText: songs,
      });
      if (result?.error) {
        setError(result.error);
        draft.resume();
      }
    });
  }

  return (
    <form ref={form} action={submit} className="mt-8 space-y-7">
      {draft.pending && <DraftRestore savedAt={draft.pending.savedAt} onRestore={draft.restore} onDiscard={draft.discard} />}
      <ClaudeAssist
        getFields={getFields}
        venues={venues.filter((v) => v.name).map((v) => ({ name: v.name, url: v.url }))}
        onApply={apply}
        onSongs={(s) => setSongs((cur) => [cur.trim(), songsToLines(s)].filter(Boolean).join("\n"))}
      />
      <div>
        <label htmlFor="title" className="mb-2 block font-bold">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={post.title} autoComplete="off" enterKeyHint="next" className="field text-xl" />
      </div>
      <div>
        <label htmlFor="dek" className="mb-2 block font-bold">Dek</label>
        <input id="dek" name="dek" maxLength={200} defaultValue={post.dek} autoComplete="off" enterKeyHint="next" className="field" />
      </div>

      <fieldset className="min-w-0 rounded-md border-2 border-dashed border-maize p-4 sm:p-5">
        <legend className="mono px-2 text-maize">Wristband</legend>
        <div className="mb-4">
          <label htmlFor="nightOf" className="mb-2 block text-sm font-bold">When was the night?</label>
          <input id="nightOf" name="nightOf" type="date" min="2000-01-01" max={today} defaultValue={post.nightOf} className="field sm:w-56" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="night" className="mb-2 block text-sm font-bold">The night</label>
            <input id="night" name="night" maxLength={80} defaultValue={post.night} className="field" />
          </div>
          <div>
            <label htmlFor="damage" className="mb-2 block text-sm font-bold">Damage</label>
            <input id="damage" name="damage" maxLength={80} defaultValue={post.damage} className="field" />
          </div>
          <div>
            <label htmlFor="rideHome" className="mb-2 block text-sm font-bold">Ride home</label>
            <input id="rideHome" name="rideHome" maxLength={160} required defaultValue={post.rideHome} className="field" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="body" className="mb-2 block font-bold">The story</label>
        <textarea id="body" name="body" required rows={14} maxLength={60000} defaultValue={post.body} onPaste={linkPaste} className="field leading-relaxed" />
        <p className="mt-1 text-sm text-dim">Paste links straight in. To link some words, select them and paste the link.</p>
      </div>

      {items.length > 0 && (
        <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4 sm:p-6">
          <legend className="mono px-2 text-maize">Photos, videos and music</legend>
          <ul className="space-y-4">
            {items.map((i) => (
              <li key={i.id} className={`flex gap-3 rounded-md bg-night-2 p-3 sm:gap-4 ${i.remove ? "opacity-40" : ""}`}>
                {i.preview ? (
                  <button
                    type="button"
                    disabled={i.remove}
                    onClick={() => { setCover(i.id); setNewCover(null); }}
                    aria-pressed={cover === i.id}
                    aria-label="Use as cover photo"
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded ${cover === i.id ? "ring-2 ring-maize" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.preview} alt="" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="mono grid h-20 w-20 shrink-0 place-items-center rounded bg-night text-maize">{i.kind}</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-dim">{i.remove ? "Will be deleted on save" : i.label}{!i.remove && cover === i.id ? " · cover" : ""}</p>
                  <input
                    value={i.caption}
                    disabled={i.remove}
                    onChange={(e) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, caption: e.target.value } : x)))}
                    maxLength={300}
                    aria-label="Caption"
                    placeholder="Caption (optional)"
                    enterKeyHint="done"
                    className="field mt-2 py-2 text-base"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, remove: !x.remove } : x)))}
                  className="-mr-1 -mt-3 inline-flex min-h-11 items-center self-start px-1 text-sm text-dim underline underline-offset-4 hover:text-pink"
                >
                  {i.remove ? "Keep" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-dim">Removed files are deleted for good when you save.</p>
        </fieldset>
      )}

      <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4 sm:p-6">
        <legend className="mono px-2 text-maize">Where we went</legend>
        <p className="mb-4 text-sm text-dim">These show up on the Places tab, linked back to this post.</p>
        <VenuesEditor rows={venues} setRows={setVenues} />
      </fieldset>

      <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4 sm:p-6">
        <legend className="mono px-2 text-maize">Add photos, videos and music</legend>
        <div className="mb-4">
          <PhoneUploadQR onFiles={addFromPhone} />
        </div>
        <MediaPicker
          items={adding}
          setItems={setAdding}
          coverKey={newCover}
          setCoverKey={(k) => { setNewCover(k); setCover(null); }}
          room={MAX_FILES_PER_POST - items.filter((i) => !i.remove).length}
        />
        <p className="mt-3 text-sm text-dim">Tap a new photo to make it the cover. New files are added at the end of the post.</p>
      </fieldset>

      <div>
        <label htmlFor="songs" className="mb-2 block font-bold">Songs of the night</label>
        <textarea id="songs" value={songs} onChange={(e) => setSongs(e.target.value)} rows={4} className="field font-mono text-[16px] leading-relaxed sm:text-sm" placeholder={"Paste a Spotify, SoundCloud, YouTube or Apple Music link\nor type: The Killers - Mr. Brightside"} />
        <p className="mt-1 text-sm text-dim">One per line. Music links in the post are included automatically.</p>
      </div>

      <label className="flex cursor-pointer gap-3 rounded-md border border-line bg-night-2 p-4">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-6 w-6 shrink-0 accent-[var(--maize)]" />
        <span>
          <strong>{HOUSE_RULES[0].title}</strong> Everyone named, tagged or shown in this post said yes.
        </span>
      </label>

      {error && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{error}</p>}

      <DraftSavedNote savedAt={draft.savedAt} />

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-night/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        <button disabled={pending || uploading} className="min-h-14 w-full rounded-full bg-maize px-8 text-lg font-bold text-night hover:bg-ink disabled:opacity-60 sm:w-auto">
          {pending ? "Saving…" : uploading ? "Uploading…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
