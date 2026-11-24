"use client";

import { useState, useTransition } from "react";
import { updatePost } from "@/app/actions";
import { MediaPicker, pickerBusy, pickerFailed, type PickedItem } from "@/components/MediaPicker";
import { MAX_FILES_PER_POST } from "@/lib/media-rules";
import { HOUSE_RULES, SECTIONS } from "@/lib/sections";

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

export function EditPostForm({ post, media, today }: { post: Fields; media: Media[]; today: string }) {
  const [section, setSection] = useState(post.section);
  const [items, setItems] = useState(media.map((m) => ({ ...m, remove: false })));
  const [cover, setCover] = useState<string | null>(media.find((m) => m.isCover)?.id ?? null);
  const [adding, setAdding] = useState<PickedItem[]>([]);
  const [newCover, setNewCover] = useState<string | null>(null);
  const uploading = pickerBusy(adding);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    setError(null);
    if (uploading) return setError("Wait for the uploads to finish.");
    if (pickerFailed(adding)) return setError("Remove the files that didn't upload, then save.");
    startTransition(async () => {
      const result = await updatePost({
        id: post.id,
        title: String(form.get("title") ?? ""),
        dek: String(form.get("dek") ?? ""),
        section: String(form.get("section") ?? ""),
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
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={submit} className="mt-8 space-y-6">
      <div>
        <label htmlFor="section" className="mb-2 block font-bold">Section</label>
        <select id="section" name="section" value={section} onChange={(e) => setSection(e.target.value)} className="field">
          {SECTIONS.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="title" className="mb-2 block font-bold">Title</label>
        <input id="title" name="title" required maxLength={140} defaultValue={post.title} className="field text-xl" />
      </div>
      <div>
        <label htmlFor="dek" className="mb-2 block font-bold">Dek</label>
        <input id="dek" name="dek" maxLength={200} defaultValue={post.dek} className="field" />
      </div>

      <fieldset className="rounded-md border-2 border-dashed border-maize p-4 sm:p-5">
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
            <label htmlFor="rideHome" className="mb-2 block text-sm font-bold">Ride home{section === "night-reports" ? "" : " (optional)"}</label>
            <input id="rideHome" name="rideHome" maxLength={160} required={section === "night-reports"} defaultValue={post.rideHome} className="field" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="body" className="mb-2 block font-bold">The story</label>
        <textarea id="body" name="body" required rows={14} maxLength={60000} defaultValue={post.body} className="field leading-relaxed" />
      </div>

      {items.length > 0 && (
        <fieldset className="rounded-md border border-dashed border-line p-4 sm:p-6">
          <legend className="mono px-2 text-maize">Photos, videos and music</legend>
          <ul className="space-y-4">
            {items.map((i) => (
              <li key={i.id} className={`flex gap-4 rounded-md bg-night-2 p-3 ${i.remove ? "opacity-40" : ""}`}>
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
                  <p className="truncate text-sm text-dim">{i.label}</p>
                  <input
                    value={i.caption}
                    disabled={i.remove}
                    onChange={(e) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, caption: e.target.value } : x)))}
                    maxLength={300}
                    aria-label="Caption"
                    placeholder="Caption (optional)"
                    className="field mt-2 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, remove: !x.remove } : x)))}
                  className="self-start text-sm text-dim underline underline-offset-4 hover:text-pink"
                >
                  {i.remove ? "Keep" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-dim">Removed files are deleted for good when you save.</p>
        </fieldset>
      )}

      <fieldset className="rounded-md border border-dashed border-line p-4 sm:p-6">
        <legend className="mono px-2 text-maize">Add photos, videos and music</legend>
        <MediaPicker
          items={adding}
          setItems={setAdding}
          coverKey={newCover}
          setCoverKey={(k) => { setNewCover(k); setCover(null); }}
          room={MAX_FILES_PER_POST - items.filter((i) => !i.remove).length}
        />
        <p className="mt-3 text-sm text-dim">Tap a new photo to make it the cover. New files are added at the end of the post.</p>
      </fieldset>

      <label className="flex gap-3 rounded-md border border-line bg-night-2 p-4">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--maize)]" />
        <span>
          <strong>{HOUSE_RULES[0].title}</strong> Everyone named, tagged or shown in this post said yes.
        </span>
      </label>

      {error && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{error}</p>}

      <button disabled={pending || uploading} className="rounded-full bg-maize px-8 py-4 text-lg font-bold text-night hover:bg-ink disabled:opacity-60">
        {pending ? "Saving…" : uploading ? "Uploading…" : "Save changes"}
      </button>
    </form>
  );
}
