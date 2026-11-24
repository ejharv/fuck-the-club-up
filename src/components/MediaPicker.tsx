"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toEmbed } from "@/lib/embeds";
import { ACCEPT_ATTR, ALLOWED_TYPES, MAX_BYTES } from "@/lib/media-rules";
import { putWithProgress, scrubPhoto } from "@/lib/scrub-photo";

export type PickedItem = {
  id: string;
  caption: string;
  file?: File;
  preview?: string;
  kind?: "photo" | "video" | "audio";
  key?: string;
  progress?: number;
  error?: string;
  url?: string;
};

/** Add photos, videos, tracks and links. Files upload straight to R2 as they're picked. */
export function MediaPicker({
  items,
  setItems,
  coverKey,
  setCoverKey,
  room,
}: {
  items: PickedItem[];
  setItems: Dispatch<SetStateAction<PickedItem[]>>;
  coverKey?: string | null;
  setCoverKey?: (k: string) => void;
  room: number;
}) {
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const patch = (id: string, p: Partial<PickedItem>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function upload(item: PickedItem) {
    try {
      const file = item.kind === "photo" ? await scrubPhoto(item.file!) : item.file!;
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!res.ok || !data.key || !data.uploadUrl) throw new Error(data.error ?? "Upload couldn't start.");
      await putWithProgress(data.uploadUrl, file, data.headers ?? {}, (p) => patch(item.id, { progress: p }));
      patch(item.id, { key: data.key, progress: 1 });
    } catch (e) {
      patch(item.id, { error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const added: PickedItem[] = [];
    for (const file of Array.from(files).slice(0, Math.max(room - items.length, 0))) {
      const type = ALLOWED_TYPES[file.type];
      const item: PickedItem = { id: crypto.randomUUID(), caption: "", file, kind: type?.kind, progress: 0 };
      if (!type) item.error = `${file.name}: that file type isn't supported.`;
      else if (file.size > MAX_BYTES[type.kind]) item.error = `${file.name} is over ${Math.round(MAX_BYTES[type.kind] / 1048576)} MB.`;
      else if (type.kind === "photo") item.preview = URL.createObjectURL(file);
      added.push(item);
    }
    setItems((l) => [...l, ...added]);
    added.filter((i) => !i.error).forEach(upload);
    if (input.current) input.current.value = "";
  }

  function addLink() {
    if (!toEmbed(link)) return setLinkError("Paste a YouTube, Spotify or SoundCloud link.");
    setItems((l) => [...l, { id: crypto.randomUUID(), caption: "", url: link.trim() }]);
    setLink("");
    setLinkError(null);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-ink px-5 font-bold sm:w-auto hover:border-maize hover:text-maize focus-within:outline focus-within:outline-2 focus-within:outline-pink">
          Add files
          <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="picker-link" className="sr-only">Music or video link</label>
        <input id="picker-link" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} inputMode="url" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" className="field min-w-0 sm:flex-1" placeholder="Paste a Spotify, SoundCloud or YouTube link" />
        <button type="button" onClick={addLink} className="min-h-11 shrink-0 rounded-full border border-ink px-5 font-bold hover:border-maize hover:text-maize">Add link</button>
      </div>
      {linkError && <p role="alert" className="mt-2 text-sm text-pink">{linkError}</p>}
      {items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex gap-3 rounded-md bg-night-2 p-3 sm:gap-4">
              {i.preview ? (
                <button
                  type="button"
                  onClick={() => i.key && setCoverKey?.(i.key)}
                  aria-pressed={!!i.key && coverKey === i.key}
                  aria-label="Use as cover photo"
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded ${i.key && coverKey === i.key ? "ring-2 ring-maize" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.preview} alt="" className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="mono grid h-20 w-20 shrink-0 place-items-center rounded bg-night text-maize">{i.url ? "Link" : (i.kind ?? "File")}</div>
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
                  <input value={i.caption} onChange={(e) => patch(i.id, { caption: e.target.value })} maxLength={300} aria-label="Caption" placeholder="Caption (optional)" enterKeyHint="done" className="field mt-2 py-2 text-base" />
                )}
              </div>
              <button type="button" onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))} className="-mr-1 -mt-3 inline-flex min-h-11 items-center self-start px-1 text-sm text-dim underline underline-offset-4 hover:text-pink">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const pickerBusy = (items: PickedItem[]) => items.some((i) => i.file && !i.key && !i.error);
export const pickerFailed = (items: PickedItem[]) => items.some((i) => i.error);
