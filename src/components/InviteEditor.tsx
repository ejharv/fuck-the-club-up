"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setInviteMedia, updateInvite, type AdminResult } from "@/app/nights/actions";
import { putWithProgress, scrubPhoto } from "@/lib/scrub-photo";

export type InviteData = {
  name: string;
  opensAt: string;
  closesAt: string;
  location: string;
  dressCode: string;
  details: string;
  rules: string;
  mediaUrl: string | null;
  mediaKind: "video" | "photo" | null;
};

/** ISO → value for <input type="datetime-local">, in Michigan time. */
function toLocalInput(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso)).replace(", ", "T");
}

/** Hosts and admins can change the invite (and its video) any time before the drop. */
export function InviteEditor({ nightId, invite }: { nightId: string; invite: InviteData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const done = (r: AdminResult, okText: string) => {
    setMsg(r && "error" in r ? { ok: false, text: r.error } : { ok: true, text: okText });
    if (!(r && "error" in r)) router.refresh();
  };

  function save(form: FormData) {
    start(async () => {
      const r = await updateInvite(nightId, {
        name: String(form.get("name") ?? ""),
        startsAt: String(form.get("startsAt") ?? ""),
        closesAt: String(form.get("closesAt") ?? ""),
        location: String(form.get("location") ?? ""),
        dressCode: String(form.get("dressCode") ?? ""),
        details: String(form.get("details") ?? ""),
        rules: String(form.get("rules") ?? ""),
      });
      done(r, "Invite updated. Everyone with the link sees it now.");
    });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    try {
      const ready = file.type.startsWith("image/") && file.type !== "image/gif" ? await scrubPhoto(file) : file;
      const res = await fetch(`/api/nights/${nightId}/invite-media`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentType: ready.type, size: ready.size }),
      });
      const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!res.ok || !data.key || !data.uploadUrl) throw new Error(data.error ?? "Upload couldn't start.");
      setProgress(0);
      await putWithProgress(data.uploadUrl, ready, data.headers ?? {}, setProgress);
      const r = await setInviteMedia(nightId, data.key);
      done(r, "Invite video set.");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="mt-5 rounded-md border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-bold">
        Edit the invite
        <span className="mono text-maize">{open ? "Close" : "Open"}</span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-line p-4">
          <div>
            <p className="font-bold">Invite video or photo</p>
            <p className="mt-1 text-sm text-dim">Plays at the top of the invite, muted and looping. Go nuts.</p>
            {invite.mediaUrl && (
              <div className="mt-3 max-w-xs overflow-hidden rounded">
                {invite.mediaKind === "video" ? (
                  <video src={invite.mediaUrl} muted loop autoPlay playsInline className="w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={invite.mediaUrl} alt="" className="w-full" />
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ink px-5 font-bold hover:border-maize hover:text-maize focus-within:outline focus-within:outline-2 focus-within:outline-pink">
                {invite.mediaUrl ? "Replace" : "Add a video or photo"}
                <input type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              {invite.mediaUrl && (
                <button type="button" disabled={pending} onClick={() => start(async () => done(await setInviteMedia(nightId, null), "Removed."))} className="mono tap text-dim hover:text-pink">
                  Remove
                </button>
              )}
            </div>
            {progress !== null && (
              <div className="mt-3 h-1.5 max-w-xs overflow-hidden rounded bg-night" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Upload progress">
                <div className="h-full bg-maize" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </div>

          <form action={save} className="space-y-4">
            <div>
              <label htmlFor="inv-name" className="mb-1 block text-sm font-bold">Name of the night</label>
              <input id="inv-name" name="name" required maxLength={100} defaultValue={invite.name} className="field" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="inv-start" className="mb-1 block text-sm font-bold">Party starts</label>
                <input id="inv-start" name="startsAt" type="datetime-local" required defaultValue={toLocalInput(invite.opensAt)} className="field" />
              </div>
              <div>
                <label htmlFor="inv-close" className="mb-1 block text-sm font-bold">Photos close</label>
                <input id="inv-close" name="closesAt" type="datetime-local" required defaultValue={toLocalInput(invite.closesAt)} className="field" />
              </div>
            </div>
            <div>
              <label htmlFor="inv-loc" className="mb-1 block text-sm font-bold">Where</label>
              <input id="inv-loc" name="location" maxLength={200} defaultValue={invite.location} className="field" />
            </div>
            <div>
              <label htmlFor="inv-dress" className="mb-1 block text-sm font-bold">Dress code</label>
              <input id="inv-dress" name="dressCode" maxLength={100} defaultValue={invite.dressCode} className="field" />
            </div>
            <div>
              <label htmlFor="inv-details" className="mb-1 block text-sm font-bold">The plan</label>
              <textarea id="inv-details" name="details" rows={3} maxLength={2000} defaultValue={invite.details} className="field" />
            </div>
            <div>
              <label htmlFor="inv-rules" className="mb-1 block text-sm font-bold">Party rules</label>
              <textarea id="inv-rules" name="rules" rows={4} defaultValue={invite.rules} placeholder={"BYOB\nCostume or you're the bouncer\nNobody drives"} className="field" />
              <p className="mt-1 text-sm text-dim">One per line. They show on the invite.</p>
            </div>
            <button disabled={pending} className="min-h-12 w-full rounded-full bg-maize px-6 font-bold text-night hover:bg-ink disabled:opacity-60 sm:w-auto">
              {pending ? "Saving…" : "Save the invite"}
            </button>
          </form>
          {msg && <p role="status" className={msg.ok ? "text-maize" : "text-pink"}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
