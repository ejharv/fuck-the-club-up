"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { PickedItem } from "./MediaPicker";

/**
 * "Add from phone": shows a QR code; files sent from the phone appear in the
 * editor's media list as already-uploaded items.
 */
export function PhoneUploadQR({ onFiles }: { onFiles: (items: PickedItem[]) => void }) {
  const [session, setSession] = useState<{ id: string; url: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const seen = useRef(new Set<string>());

  async function start() {
    setError(null);
    const res = await fetch("/api/upload-sessions", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { id?: string; path?: string; expiresAt?: string; error?: string };
    if (!res.ok || !data.id || !data.path) return setError(data.error ?? "Couldn't make a QR code. Try again.");
    const url = `${window.location.origin}${data.path}`;
    setSession({ id: data.id, url, expiresAt: data.expiresAt! });
    setQr(await QRCode.toDataURL(url, { margin: 1, width: 300, color: { dark: "#0c0d1c", light: "#f2eee4" } }));
  }

  async function stop() {
    if (session) await fetch(`/api/upload-sessions/${session.id}`, { method: "DELETE" }).catch(() => {});
    setSession(null);
    setQr(null);
  }

  useEffect(() => {
    if (!session) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/upload-sessions/${session.id}`).catch(() => null);
      if (!alive || !res?.ok) return;
      const data = (await res.json()) as { live: boolean; files: Array<{ key: string; kind: "photo" | "video" | "audio"; preview: string | null }> };
      const fresh = data.files.filter((f) => !seen.current.has(f.key));
      if (fresh.length) {
        fresh.forEach((f) => seen.current.add(f.key));
        setReceived((n) => n + fresh.length);
        onFiles(fresh.map((f) => ({ id: crypto.randomUUID(), caption: "", key: f.key, kind: f.kind, preview: f.preview ?? undefined, progress: 1 })));
      }
      if (!data.live) setSession(null);
    };
    const t = setInterval(tick, 3000);
    tick();
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [session, onFiles]);

  if (!session) {
    return (
      <div>
        <button type="button" onClick={start} className="inline-flex min-h-11 items-center rounded-full border border-ink px-5 font-bold hover:border-maize hover:text-maize">
          Add from phone
        </button>
        {received > 0 && <span className="ml-3 text-sm text-maize">{received} received from your phone</span>}
        {error && <p role="alert" className="mt-2 text-sm text-pink">{error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-maize/70 bg-night-2 p-4 sm:flex-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt="QR code to add photos from your phone" className="h-40 w-40 rounded" />}
      <div className="min-w-0">
        <p className="font-bold">Scan with your phone&apos;s camera.</p>
        <p className="mt-1 text-sm text-dim">
          Pick photos and videos there; they land here in a few seconds. Works for 30 minutes, only for you. Don&apos;t share it.
        </p>
        <p role="status" className="mt-2 text-maize">{received ? `${received} received so far` : "Waiting for your phone…"}</p>
        <button type="button" onClick={stop} className="mono tap mt-1 -ml-2 text-dim hover:text-ink">Done</button>
      </div>
    </div>
  );
}
