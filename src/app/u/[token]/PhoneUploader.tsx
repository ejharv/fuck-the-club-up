"use client";

import { useRef, useState } from "react";
import { ACCEPT_ATTR, ALLOWED_TYPES, MAX_BYTES } from "@/lib/media-rules";
import { putWithProgress, scrubPhoto } from "@/lib/scrub-photo";

type Row = { id: string; name: string; progress: number; done: boolean; error?: string };

export function PhoneUploader({ token, expiresAt }: { token: string; expiresAt: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const patch = (id: string, p: Partial<Row>) => setRows((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function one(file: File, id: string) {
    try {
      const type = ALLOWED_TYPES[file.type];
      if (!type) throw new Error("Photos, videos and audio only.");
      if (type.kind !== "photo" && file.size > MAX_BYTES[type.kind]) throw new Error(`Over ${Math.round(MAX_BYTES[type.kind] / 1048576)} MB.`);
      const ready = type.kind === "photo" ? await scrubPhoto(file, 4096) : file;
      const res = await fetch(`/api/u/${token}/sign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentType: ready.type, size: ready.size }) });
      const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!res.ok || !data.key || !data.uploadUrl) throw new Error(data.error ?? "Upload couldn't start.");
      await putWithProgress(data.uploadUrl, ready, data.headers ?? {}, (p) => patch(id, { progress: p }));
      const done = await fetch(`/api/u/${token}/done`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: data.key }) });
      if (!done.ok) throw new Error(((await done.json().catch(() => ({}))) as { error?: string }).error ?? "Upload didn't finish.");
      patch(id, { done: true, progress: 1 });
    } catch (e) {
      patch(id, { error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).map((f) => ({ f, id: crypto.randomUUID() }));
    setRows((l) => [...l, ...list.map(({ f, id }) => ({ id, name: f.name, progress: 0, done: false }))]);
    if (input.current) input.current.value = "";
    const queue = [...list];
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let n = queue.shift(); n; n = queue.shift()) await one(n.f, n.id);
    }));
  }

  const done = rows.filter((r) => r.done).length;
  const until = new Date(expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });
  return (
    <div className="mt-8">
      <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-md bg-maize px-6 text-lg font-bold text-night hover:bg-ink focus-within:outline focus-within:outline-2 focus-within:outline-pink">
        {rows.length ? "Add more" : "Choose photos and videos"}
        <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" onChange={(e) => add(e.target.files)} />
      </label>
      <p className="mt-2 text-sm text-dim">Photos lose their location and camera data before upload. Videos keep theirs. This code works until {until}.</p>
      {rows.length > 0 && (
        <>
          <p role="status" className="mt-6 font-bold text-maize">
            {done === rows.length ? `Sent ${done} to the editor.` : `Sending ${done} of ${rows.length}…`}
          </p>
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded bg-night-2 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{r.name}</span>
                  <span className={r.error ? "text-pink" : "text-dim"}>{r.error ?? (r.done ? "Sent" : `${Math.round(r.progress * 100)}%`)}</span>
                </div>
                {!r.done && !r.error && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-night">
                    <div className="h-full bg-maize transition-[width]" style={{ width: `${r.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
