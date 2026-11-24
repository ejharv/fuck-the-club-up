"use client";

import { useRef, useState, useTransition } from "react";
import { createPost } from "@/app/actions";
import { ACCEPT_ATTR, ALLOWED_TYPES, MAX_BYTES, MAX_FILES_PER_POST } from "@/lib/media-rules";
import { toEmbed } from "@/lib/embeds";
import { putWithProgress as put, scrubPhoto } from "@/lib/scrub-photo";
import { HOUSE_RULES, SECTIONS } from "@/lib/sections";

type Item = {
  id: string;
  caption: string;
  // file uploads
  file?: File;
  preview?: string;
  kind?: "photo" | "video" | "audio";
  key?: string;
  progress?: number;
  error?: string;
  // embeds
  url?: string;
};

export function NewPostForm({ today }: { today: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverKey, setCoverKey] = useState<string | undefined>();
  const [section, setSection] = useState<string>("night-reports");
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (id: string, change: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  async function upload(item: Item) {
    try {
      const file = item.kind === "photo" ? await scrubPhoto(item.file!) : item.file!;
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!res.ok || !data.key || !data.uploadUrl) throw new Error(data.error ?? "Upload couldn't start.");
      await put(data.uploadUrl, file, data.headers ?? {}, (p) => patch(item.id, { progress: p }));
      patch(item.id, { key: data.key, progress: 1 });
    } catch (e) {
      patch(item.id, { error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_FILES_PER_POST - items.length;
    const added: Item[] = [];
    for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
      const type = ALLOWED_TYPES[file.type];
      const item: Item = { id: crypto.randomUUID(), caption: "", file, kind: type?.kind, progress: 0 };
      if (!type) item.error = `${file.name}: that file type isn't supported.`;
      else if (file.size > MAX_BYTES[type.kind]) item.error = `${file.name} is over ${Math.round(MAX_BYTES[type.kind] / 1048576)} MB.`;
      else if (type.kind === "photo") item.preview = URL.createObjectURL(file);
      added.push(item);
    }
    setItems((list) => [...list, ...added]);
    added.filter((i) => !i.error).forEach(upload);
    if (fileInput.current) fileInput.current.value = "";
  }

  function addLink() {
    if (!toEmbed(link)) {
      setLinkError("Paste a YouTube, Spotify or SoundCloud link.");
      return;
    }
    setItems((list) => [...list, { id: crypto.randomUUID(), caption: "", url: link.trim() }]);
    setLink("");
    setLinkError(null);
  }

  const uploading = items.some((i) => i.file && !i.key && !i.error);
  const failed = items.some((i) => i.error);

  function submit(form: FormData) {
    setError(null);
    if (uploading) return setError("Wait for the uploads to finish.");
    if (failed) return setError("Remove the files that didn't upload, then post.");
    startTransition(async () => {
      const result = await createPost({
        title: String(form.get("title") ?? ""),
        dek: String(form.get("dek") ?? ""),
        section: String(form.get("section") ?? ""),
        night: String(form.get("night") ?? ""),
        nightOf: String(form.get("nightOf") ?? ""),
        damage: String(form.get("damage") ?? ""),
        rideHome: String(form.get("rideHome") ?? ""),
        body: String(form.get("body") ?? ""),
        consent: form.get("consent") === "yes",
        coverKey,
        media: items.map((i) => ({ key: i.key, url: i.url, caption: i.caption })),
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
        <p className="mt-2 text-sm text-dim">{SECTIONS.find((s) => s.slug === section)?.blurb}</p>
      </div>

      <div>
        <label htmlFor="title" className="mb-2 block font-bold">Title</label>
        <input id="title" name="title" required maxLength={140} className="field text-xl" placeholder="The night the DJ played Mr. Brightside three times" />
      </div>

      <div>
        <label htmlFor="dek" className="mb-2 block font-bold">Dek</label>
        <input id="dek" name="dek" maxLength={200} className="field" placeholder="One line under the title, e.g. Three bars, one tow truck, zero regrets." />
      </div>

      <fieldset className="rounded-md border-2 border-dashed border-maize p-4 sm:p-5">
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
            <label htmlFor="rideHome" className="mb-2 block text-sm font-bold">
              Ride home{section === "night-reports" ? "" : " (optional)"}
            </label>
            <input id="rideHome" name="rideHome" maxLength={160} required={section === "night-reports"} className="field" placeholder="Two Ubers and the buddy rule" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="body" className="mb-2 block font-bold">The story</label>
        <textarea id="body" name="body" required rows={12} maxLength={60000} className="field leading-relaxed" placeholder="Start from the pregame. Short paragraphs, real details. Markdown works: **bold**, _italic_, ## headings, > quotes, lists." />
      </div>

      <fieldset className="rounded-md border border-dashed border-line p-4 sm:p-6">
        <legend className="mono px-2 text-maize">Photos, videos and music</legend>
        <p className="text-sm text-dim">
          Photos up to 25 MB, videos up to 400 MB, audio up to 60 MB. Tap a photo to make it the cover.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="cursor-pointer rounded-full border border-ink px-5 py-2 font-bold hover:border-maize hover:text-pink focus-within:outline focus-within:outline-2 focus-within:outline-pink">
            Add files
            <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="link" className="sr-only">Music or video link</label>
          <input id="link" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} className="field sm:flex-1" placeholder="Paste a Spotify, SoundCloud or YouTube link" />
          <button type="button" onClick={addLink} className="rounded-full border border-ink px-5 py-2 font-bold hover:border-maize hover:text-pink">
            Add link
          </button>
        </div>
        {linkError && <p role="alert" className="mt-2 text-sm text-pink">{linkError}</p>}

        {items.length > 0 && (
          <ul className="mt-6 space-y-4">
            {items.map((i) => (
              <li key={i.id} className="flex gap-4 rounded-md bg-night-2 p-3">
                {i.preview ? (
                  <button
                    type="button"
                    onClick={() => i.key && setCoverKey(i.key)}
                    aria-pressed={!!i.key && coverKey === i.key}
                    aria-label="Use as cover photo"
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded ${i.key && coverKey === i.key ? "ring-2 ring-maize" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.preview} alt="" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded bg-night text-sm font-bold text-maize">
                    {i.url ? "Link" : i.kind === "video" ? "Video" : i.kind === "audio" ? "Audio" : "File"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-dim">{i.file?.name ?? i.url}</p>
                  {i.error ? (
                    <p role="alert" className="mt-1 text-sm text-pink">{i.error}</p>
                  ) : i.file && !i.key ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-night" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((i.progress ?? 0) * 100)} aria-label="Upload progress">
                      <div className="h-full bg-maize transition-[width]" style={{ width: `${(i.progress ?? 0) * 100}%` }} />
                    </div>
                  ) : (
                    <input
                      value={i.caption}
                      onChange={(e) => patch(i.id, { caption: e.target.value })}
                      maxLength={300}
                      aria-label="Caption"
                      placeholder="Caption (optional)"
                      className="field mt-2 py-2 text-sm"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((list) => list.filter((x) => x.id !== i.id))}
                  className="self-start text-sm text-dim underline underline-offset-4 hover:text-pink"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <label className="flex gap-3 rounded-md border border-line bg-night-2 p-4">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--maize)]" />
        <span>
          <strong>{HOUSE_RULES[0].title}</strong> Everyone named, tagged or shown in this post said yes. Anyone who didn&apos;t gets a nickname and stays out of the photos.
        </span>
      </label>

      {error && <p role="alert" className="rounded-md border border-pink/60 bg-pink/10 p-4">{error}</p>}

      <button disabled={pending || uploading} className="rounded-full bg-maize px-8 py-4 text-lg font-bold text-night hover:bg-ink disabled:opacity-60">
        {pending ? "Publishing…" : uploading ? "Uploading…" : "Publish post"}
      </button>
    </form>
  );
}
