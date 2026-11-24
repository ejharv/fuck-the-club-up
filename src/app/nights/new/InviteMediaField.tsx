"use client";

import { useState } from "react";
import { putWithProgress, scrubPhoto } from "@/lib/scrub-photo";

/** Optional invite video/photo on the New night form. Uploads right away; the key rides along with the form. */
export function InviteMediaField() {
  const [key, setKey] = useState("");
  const [preview, setPreview] = useState<{ url: string; video: boolean } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setKey("");
    try {
      const ready = file.type.startsWith("image/") && file.type !== "image/gif" ? await scrubPhoto(file) : file;
      setPreview({ url: URL.createObjectURL(ready), video: ready.type.startsWith("video/") });
      const res = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentType: ready.type, size: ready.size }) });
      const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!res.ok || !data.key || !data.uploadUrl) throw new Error(data.error ?? "Upload couldn't start.");
      setProgress(0);
      await putWithProgress(data.uploadUrl, ready, data.headers ?? {}, setProgress);
      setKey(data.key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setPreview(null);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <span className="mb-2 block font-bold">Invite video or photo (optional)</span>
      <input type="hidden" name="mediaKey" value={key} />
      {preview && (
        <div className="mb-3 max-w-xs overflow-hidden rounded border border-line">
          {preview.video ? (
            <video src={preview.url} muted loop autoPlay playsInline className="w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="" className="w-full" />
          )}
        </div>
      )}
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ink px-5 font-bold hover:border-maize hover:text-maize focus-within:outline focus-within:outline-2 focus-within:outline-pink">
        {preview ? "Pick a different one" : "Add a video or photo"}
        <input type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {progress !== null && <p role="status" className="mt-2 text-sm text-dim">Uploading… {Math.round(progress * 100)}%</p>}
      {key && <p role="status" className="mt-2 text-sm text-maize">Ready. It plays at the top of the invite.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-pink">{error}</p>}
    </div>
  );
}
