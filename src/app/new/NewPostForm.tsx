"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { createPost } from "@/app/actions";
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

const FIELD_NAMES: Record<keyof AssistFields, string> = { title: "title", dek: "dek", night: "night", damage: "damage", rideHome: "rideHome", body: "body" };

export function NewPostForm({ today }: { today: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<PickedItem[]>([]);
  const [coverKey, setCoverKey] = useState<string | null>(null);
  const [venues, setVenues] = useState<VenueRow[]>([blankVenue()]);
  const [songs, setSongs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uploading = pickerBusy(items);
  const draft = useFormDraft({
    key: "ftcu-newpost",
    form,
    extra: { venues, songs },
    setExtra: (e) => {
      if (Array.isArray(e?.venues) && e.venues.length) setVenues(e.venues);
      if (typeof e?.songs === "string") setSongs(e.songs);
    },
  });

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
      const el = field(FIELD_NAMES[k as keyof AssistFields]);
      if (el && typeof v === "string") el.value = v;
    }
  };
  const addFromPhone = useCallback((fresh: PickedItem[]) => setItems((l) => [...l, ...fresh]), []);

  function submit(data: FormData) {
    setError(null);
    if (uploading) return setError("Wait for the uploads to finish.");
    if (pickerFailed(items)) return setError("Remove the files that didn't upload, then post.");
    draft.saveNow();
    startTransition(async () => {
      draft.clear();
      const result = await createPost({
        title: String(data.get("title") ?? ""),
        dek: String(data.get("dek") ?? ""),
        section: "night-reports",
        night: String(data.get("night") ?? ""),
        nightOf: String(data.get("nightOf") ?? ""),
        damage: String(data.get("damage") ?? ""),
        rideHome: String(data.get("rideHome") ?? ""),
        body: String(data.get("body") ?? ""),
        consent: data.get("consent") === "yes",
        coverKey: coverKey ?? undefined,
        media: items.map((i) => ({ key: i.key, url: i.url, caption: i.caption })),
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
        <input id="title" name="title" required maxLength={140} autoComplete="off" enterKeyHint="next" className="field text-xl" placeholder="The night the DJ played Mr. Brightside three times" />
      </div>

      <div>
        <label htmlFor="dek" className="mb-2 block font-bold">Dek</label>
        <input id="dek" name="dek" maxLength={200} autoComplete="off" enterKeyHint="next" className="field" placeholder="One line under the title, e.g. Three bars, one tow truck, zero regrets." />
      </div>

      <fieldset className="min-w-0 rounded-md border-2 border-dashed border-maize p-4 sm:p-5">
        <legend className="mono px-2 text-maize">Wristband</legend>
        <div className="mb-4">
          <label htmlFor="nightOf" className="mb-2 block text-sm font-bold">When was the night?</label>
          <input id="nightOf" name="nightOf" type="date" min="2000-01-01" max={today} className="field sm:w-56" />
          <p className="mt-1 text-sm text-dim">Optional. An old night slots into the timeline where it happened.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="night" className="mb-2 block text-sm font-bold">The night</label>
            <input id="night" name="night" maxLength={80} className="field" placeholder="Saturday, game day" />
          </div>
          <div>
            <label htmlFor="damage" className="mb-2 block text-sm font-bold">Damage</label>
            <input id="damage" name="damage" maxLength={80} className="field" placeholder="$20 and my dignity" />
          </div>
          <div>
            <label htmlFor="rideHome" className="mb-2 block text-sm font-bold">Ride home</label>
            <input id="rideHome" name="rideHome" maxLength={160} required className="field" placeholder="Two Ubers and the buddy rule" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="body" className="mb-2 block font-bold">The story</label>
        <textarea id="body" name="body" required rows={12} maxLength={60000} onPaste={linkPaste} className="field leading-relaxed" placeholder="Start from the pregame. Short paragraphs, real details. Rough notes are fine: writing help can turn them into a post." />
        <p className="mt-1 text-sm text-dim">Paste links straight in. To link some words, select them and paste the link.</p>
      </div>

      <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4 sm:p-6">
        <legend className="mono px-2 text-maize">Where we went</legend>
        <p className="mb-4 text-sm text-dim">These show up on the Places tab, linked back to this post.</p>
        <VenuesEditor rows={venues} setRows={setVenues} />
      </fieldset>

      <fieldset className="min-w-0 rounded-md border border-dashed border-line p-4 sm:p-6">
        <legend className="mono px-2 text-maize">Photos, videos and music</legend>
        <p className="mb-4 text-sm text-dim">Photos up to 25 MB, videos up to 400 MB, audio up to 60 MB. Tap a photo to make it the cover.</p>
        <div className="mb-4">
          <PhoneUploadQR onFiles={addFromPhone} />
        </div>
        <MediaPicker items={items} setItems={setItems} coverKey={coverKey} setCoverKey={setCoverKey} room={MAX_FILES_PER_POST} />
      </fieldset>

      <div>
        <label htmlFor="songs" className="mb-2 block font-bold">Songs of the night</label>
        <textarea id="songs" value={songs} onChange={(e) => setSongs(e.target.value)} rows={4} className="field font-mono text-[16px] leading-relaxed sm:text-sm" placeholder={"Paste a Spotify, SoundCloud, YouTube or Apple Music link\nor type: The Killers - Mr. Brightside"} />
        <p className="mt-1 text-sm text-dim">One per line. In Spotify or SoundCloud tap Share → Copy link, then paste it here. They go on the Playlists tab.</p>
      </div>

      <label className="flex cursor-pointer gap-3 rounded-md border border-line bg-night-2 p-4">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-6 w-6 shrink-0 accent-[var(--maize)]" />
        <span>
          <strong>{HOUSE_RULES[0].title}</strong> Everyone named, tagged or shown in this post said yes. Anyone who didn&apos;t gets a nickname and stays out of the photos.
        </span>
      </label>

      {error && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{error}</p>}
      <DraftSavedNote savedAt={draft.savedAt} />

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-night/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6">
        <button disabled={pending || uploading} className="min-h-14 w-full rounded-full bg-maize px-8 text-lg font-bold text-night hover:bg-ink disabled:opacity-60 sm:w-auto">
          {pending ? "Publishing…" : uploading ? "Uploading…" : "Publish post"}
        </button>
      </div>
    </form>
  );
}
