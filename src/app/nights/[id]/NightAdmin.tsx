"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { Draft, NightStatus, Phase } from "@/lib/nights";
import { HOUSE_RULES, SECTIONS } from "@/lib/sections";
import {
  addAdminNote,
  bulkDecision,
  cancelSchedule,
  deleteNight,
  deleteUpload,
  dropNow,
  regenerateLink,
  removeAccount,
  saveDraftEdit,
  scheduleDrop,
  setAlbumOpen,
  setUploadWindow,
  setVenues,
  updateUpload,
  type AdminResult,
} from "../actions";

type Upload = { r2_key: string; kind: string; nickname: string | null; decision: string; caption: string | null; is_cover: number; size: number; src: string };

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<AdminResult>, after?: (r: AdminResult) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r && "error" in r) setError(r.error);
      else {
        after?.(r);
        router.refresh();
      }
    });
  return { pending, error, run };
}

function Panel({ title, children, tone = "line" }: { title: string; children: ReactNode; tone?: "line" | "maize" }) {
  return (
    <section className={`mt-10 rounded-md border ${tone === "maize" ? "border-2 border-dashed border-maize" : "border-line"} p-5 sm:p-6`}>
      <h2 className="display text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function LinkPanel({ nightId, freshLink, night }: { nightId: string; freshLink: string | null; night: { phase: Phase; status: NightStatus; opensAt: string; closesAt: string; albumOpen: boolean } }) {
  const [token, setToken] = useState(freshLink);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, error, run } = useRun();
  const url = token ? `${typeof window === "undefined" ? "" : window.location.origin}/drop/${token}` : null;
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#0c0d1c", light: "#f2eee4" } }).then(setQr);
    // Drop the token from the address bar so it isn't left in history.
    window.history.replaceState(null, "", `/nights/${nightId}`);
  }, [url, nightId]);

  return (
    <Panel title="The link" tone="maize">
      {url ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-dim">Copy it now. Only a fingerprint of it is stored, so this is the one time it&apos;s shown.</p>
            <p className="mt-3 break-all rounded bg-night-2 p-3 font-mono text-sm">{url}</p>
            <button
              type="button"
              onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}
              className="mt-3 rounded-full bg-maize px-5 py-2 font-bold text-night hover:bg-ink"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR code for the link" className="h-40 w-40 rounded" />}
        </div>
      ) : (
        <p className="mt-3 text-dim">The link was shown when you created the night. Lost it? Make a new one; the old one stops working.</p>
      )}
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="mono text-maize">Party starts</dt><dd>{timeFmt(night.opensAt)}</dd></div>
        <div><dt className="mono text-maize">Photos close</dt><dd>{timeFmt(night.closesAt)}</dd></div>
        <div><dt className="mono text-maize">Shared album</dt><dd>{night.albumOpen ? "Visible to link holders" : "Hidden"}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={() => run(() => regenerateLink(nightId), (r) => r && "token" in r && r.token && setToken(r.token))} className="rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">
          Regenerate link
        </button>
        {night.status === "collecting" && (
          <button type="button" disabled={pending} onClick={() => run(() => setUploadWindow(nightId, false))} className="rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">
            Close uploads now
          </button>
        )}
        {night.status === "closed" && (
          <button type="button" disabled={pending} onClick={() => run(() => setUploadWindow(nightId, true))} className="rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">
            Reopen uploads for 24 hours
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => setAlbumOpen(nightId, !night.albumOpen))} className="rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">
          {night.albumOpen ? "Hide shared album" : "Show shared album"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-pink">{error}</p>}
    </Panel>
  );
}

function UploadsPanel({ nightId, uploads }: { nightId: string; uploads: Upload[] }) {
  const { pending, error, run } = useRun();
  const kept = uploads.filter((u) => u.decision === "keep").length;
  return (
    <Panel title={`Photos and videos (${uploads.length})`}>
      <p className="mt-2 text-dim">Keep what goes in the post. Tossed files stay in the shared album; Delete removes a file everywhere. {kept} kept.</p>
      {uploads.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => run(() => bulkDecision(nightId, uploads.map((u) => u.r2_key), "keep"))} className="rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">Keep all</button>
          <button type="button" disabled={pending} onClick={() => run(() => bulkDecision(nightId, uploads.map((u) => u.r2_key), "toss"))} className="rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">Toss all</button>
        </div>
      )}
      <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {uploads.map((u) => (
          <li key={u.r2_key} className={`overflow-hidden rounded border ${u.decision === "keep" ? "border-maize" : u.decision === "toss" ? "border-line opacity-50" : "border-line"} bg-night-2`}>
            {u.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            ) : u.kind === "video" ? (
              <video src={u.src} controls playsInline preload="none" className="aspect-square w-full bg-black object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center p-2"><audio src={u.src} controls preload="none" className="w-full" /></div>
            )}
            <div className="space-y-2 p-2 text-sm">
              <p className="truncate text-dim">{u.nickname ?? "Anonymous"} · {u.size >= 1048576 ? `${(u.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(u.size / 1024))} KB`}{u.is_cover ? " · Cover" : ""}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} aria-pressed={u.decision === "keep"} onClick={() => run(() => updateUpload(nightId, u.r2_key, { decision: u.decision === "keep" ? "pending" : "keep" }))} className={`rounded px-2 py-1 font-bold ${u.decision === "keep" ? "bg-maize text-night" : "border border-line"}`}>Keep</button>
                <button type="button" disabled={pending} aria-pressed={u.decision === "toss"} onClick={() => run(() => updateUpload(nightId, u.r2_key, { decision: u.decision === "toss" ? "pending" : "toss" }))} className={`rounded px-2 py-1 font-bold ${u.decision === "toss" ? "bg-ink text-night" : "border border-line"}`}>Toss</button>
                {u.kind === "photo" && !u.is_cover && (
                  <button type="button" disabled={pending} onClick={() => run(() => updateUpload(nightId, u.r2_key, { cover: true }))} className="rounded border border-line px-2 py-1">Cover</button>
                )}
                <button type="button" disabled={pending} onClick={() => confirm("Delete this file from the album for good?") && run(() => deleteUpload(nightId, u.r2_key))} className="rounded px-2 py-1 text-pink underline">Delete</button>
              </div>
              <input
                defaultValue={u.caption ?? ""}
                maxLength={300}
                aria-label="Caption"
                placeholder="Caption"
                onBlur={(e) => e.target.value !== (u.caption ?? "") && run(() => updateUpload(nightId, u.r2_key, { caption: e.target.value }))}
                className="field py-1.5 text-sm"
              />
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-pink">{error}</p>}
    </Panel>
  );
}

function VenuesPanel({ nightId, venues }: { nightId: string; venues: Array<{ name: string; url: string }> }) {
  const [rows, setRows] = useState(venues.length ? venues : [{ name: "", url: "" }]);
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const set = (i: number, k: "name" | "url", v: string) => { setSaved(false); setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x))); };
  return (
    <Panel title="Places you went">
      <p className="mt-2 text-dim">Name and website. When Claude mentions one, it links to that website. Those are the only links a draft can have.</p>
      <ul className="mt-4 space-y-3">
        {rows.map((v, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
            <input value={v.name} onChange={(e) => set(i, "name", e.target.value)} maxLength={60} aria-label="Place name" placeholder="Rick's" className="field" />
            <input value={v.url} onChange={(e) => set(i, "url", e.target.value)} maxLength={300} aria-label="Website" placeholder="ricksamericancafe.com" className="field" />
            <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="text-sm text-dim underline hover:text-pink">Remove</button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows((r) => [...r, { name: "", url: "" }])} className="rounded-full border border-ink px-4 py-2 font-bold hover:border-maize hover:text-maize">Add a place</button>
        <button type="button" disabled={pending} onClick={() => run(() => setVenues(nightId, rows), () => setSaved(true))} className="rounded-full bg-maize px-4 py-2 font-bold text-night hover:bg-ink">Save places</button>
        {saved && <span className="text-maize">Saved.</span>}
      </div>
      {error && <p role="alert" className="mt-3 text-pink">{error}</p>}
    </Panel>
  );
}

function AccountsPanel({ nightId, accounts, rsvps }: { nightId: string; accounts: Array<{ device_id: string; nickname: string; body: string }>; rsvps: Array<{ nickname: string; answer: string }> }) {
  const { pending, error, run } = useRun();
  const going = rsvps.filter((r) => r.answer === "going").map((r) => r.nickname);
  return (
    <Panel title={`Accounts (${accounts.length})`}>
      {rsvps.length > 0 && <p className="mt-2 text-dim">RSVP&apos;d going: {going.join(", ") || "nobody yet"}.</p>}
      {accounts.length ? (
        <ul className="mt-4 space-y-4">
          {accounts.map((a) => (
            <li key={a.device_id} className="rounded bg-night-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-maize">{a.nickname}</span>
                <button type="button" disabled={pending} onClick={() => confirm(`Remove ${a.nickname}'s account?`) && run(() => removeAccount(nightId, a.device_id))} className="text-sm text-dim underline hover:text-pink">Remove</button>
              </div>
              <p className="mt-2 whitespace-pre-line">{a.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-dim">Nobody has written their side yet. Accounts open on the link when the party starts.</p>
      )}
      {error && <p role="alert" className="mt-3 text-pink">{error}</p>}
    </Panel>
  );
}

function DraftPanel({
  nightId,
  draft,
  body,
  review,
  accountCount,
  generations,
  maxGenerations,
}: {
  nightId: string;
  draft: Draft | null;
  body: ReactNode;
  review: { approvals: number; notes: Array<{ nickname: string | null; body: string }> };
  accountCount: number;
  generations: number;
  maxGenerations: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run } = useRun();

  async function generate(rewrite: boolean) {
    setBusy(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/nights/${nightId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rewrite }) });
      if (!res.ok) setGenError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Claude couldn't write the draft.");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function saveEdit(form: FormData) {
    run(
      () => saveDraftEdit(nightId, {
        title: String(form.get("title") ?? ""),
        dek: String(form.get("dek") ?? ""),
        nightLabel: String(form.get("nightLabel") ?? ""),
        damage: String(form.get("damage") ?? ""),
        rideHome: String(form.get("rideHome") ?? ""),
        body: String(form.get("body") ?? ""),
      }),
      () => setEditing(false),
    );
  }

  return (
    <Panel title={draft ? `Draft, version ${draft.version}` : "The draft"} tone="maize">
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !accountCount} onClick={() => generate(false)} className="rounded-full bg-maize px-5 py-3 font-bold text-night hover:bg-ink disabled:opacity-50">
          {busy ? "Claude is writing… keep this tab open" : draft ? "Write a fresh draft" : "Write the draft with Claude"}
        </button>
        {draft && (
          <button type="button" disabled={busy || !review.notes.length} onClick={() => generate(true)} className="rounded-full border border-maize px-5 py-3 font-bold text-maize disabled:opacity-50">
            Rewrite with the {review.notes.length} {review.notes.length === 1 ? "note" : "notes"}
          </button>
        )}
        <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-full border border-ink px-5 py-3 font-bold hover:border-maize hover:text-maize">
          {editing ? "Cancel edit" : draft ? "Edit the text" : "Write it by hand"}
        </button>
        <span className="text-sm text-dim">{generations} of {maxGenerations} Claude drafts used</span>
      </div>
      {!accountCount && <p className="mt-3 text-dim">Claude needs at least one account to work from.</p>}
      {genError && <p role="alert" className="mt-3 text-pink">{genError}</p>}

      {editing ? (
        <form action={saveEdit} className="mt-6 space-y-4">
          <input name="title" required maxLength={140} defaultValue={draft?.title ?? ""} aria-label="Title" placeholder="Title" className="field text-xl" />
          <input name="dek" maxLength={200} defaultValue={draft?.dek ?? ""} aria-label="Dek" placeholder="Dek" className="field" />
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="nightLabel" maxLength={80} defaultValue={draft?.night_label ?? ""} aria-label="The night" placeholder="The night" className="field" />
            <input name="damage" maxLength={80} defaultValue={draft?.damage ?? ""} aria-label="Damage" placeholder="Damage" className="field" />
            <input name="rideHome" maxLength={160} defaultValue={draft?.ride_home ?? ""} aria-label="Ride home" placeholder="Ride home" className="field" />
          </div>
          <textarea name="body" required rows={16} maxLength={60000} defaultValue={draft?.body ?? ""} aria-label="Body" className="field leading-relaxed" />
          <p className="text-sm text-dim">Link a place with [Rick&apos;s](https://its-website.com). Saving makes a new version, and approvals start over.</p>
          <button disabled={pending} className="rounded-full bg-maize px-6 py-3 font-bold text-night hover:bg-ink">Save as new version</button>
        </form>
      ) : draft ? (
        <div className="mt-6 rounded-md bg-night-2 p-5 sm:p-8">
          <h3 className="display text-[clamp(1.8rem,5vw,3rem)]">{draft.title}</h3>
          {draft.dek && <p className="mt-3 text-xl">{draft.dek}</p>}
          <p className="mono mt-4 text-maize">{[draft.night_label, draft.damage, draft.ride_home].filter(Boolean).join(" · ")}</p>
          <div className="mt-6">{body}</div>
        </div>
      ) : null}

      {draft && (
        <div className="mt-6">
          <p className="font-bold">{review.approvals} of {accountCount} people who wrote accounts have approved this version.</p>
          <p className="text-sm text-dim">The approval round is how house rule 1 gets checked: people read it for real names and things they didn&apos;t agree to.</p>
          <h3 className="mt-5 font-bold">Notes</h3>
          {review.notes.length ? (
            <ul className="mt-2 space-y-2">
              {review.notes.map((n, i) => (
                <li key={i} className="rounded bg-night-2 p-3"><span className="mono text-maize">{n.nickname ?? "Admin"}</span> {n.body}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-dim">No notes on this version yet.</p>
          )}
          <div className="mt-3 flex gap-3">
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} aria-label="Admin note" placeholder="Your note for the rewrite" className="field" />
            <button type="button" disabled={pending || !note} onClick={() => run(() => addAdminNote(nightId, note), () => setNote(""))} className="shrink-0 rounded-full border border-ink px-4 font-bold hover:border-maize hover:text-maize">Add</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-pink">{error}</p>}
    </Panel>
  );
}

function PublishPanel({ nightId, draft, status, dropAt, kept, approvals, accountCount }: { nightId: string; draft: Draft; status: NightStatus; dropAt: string | null; kept: number; approvals: number; accountCount: number }) {
  const [section, setSection] = useState("night-reports");
  const [when, setWhen] = useState("");
  const { pending, error, run } = useRun();
  const fields = (form: FormData) => ({
    title: draft.title,
    dek: draft.dek ?? "",
    section: String(form.get("section") ?? ""),
    night: draft.night_label ?? "",
    damage: draft.damage ?? "",
    rideHome: draft.ride_home ?? "",
    body: draft.body,
    consent: form.get("consent") === "yes",
  });
  const allApproved = accountCount > 0 && approvals >= accountCount;

  return (
    <Panel title="Drop it" tone="maize">
      {status === "reviewing" && dropAt ? (
        <div className="mt-4">
          <p className="text-lg">Scheduled to drop {timeFmt(dropAt)}.</p>
          <button type="button" disabled={pending} onClick={() => run(() => cancelSchedule(nightId))} className="mt-3 rounded-full border border-ink px-4 py-2 font-bold hover:border-maize hover:text-maize">Cancel the schedule</button>
        </div>
      ) : (
        <form
          action={(form) => {
            const intent = String(form.get("intent"));
            if (intent === "now" && !allApproved && !confirm(`Only ${approvals} of ${accountCount} approved version ${draft.version}. Drop anyway?`)) return;
            run(() => (intent === "now" ? dropNow(nightId, fields(form)) : scheduleDrop(nightId, fields(form), when)));
          }}
          className="mt-4 space-y-4"
        >
          <p className="text-dim">Publishes version {draft.version} with the {kept} kept {kept === 1 ? "file" : "files"}. Nothing goes public until you do this.</p>
          <div>
            <label htmlFor="drop-section" className="mb-2 block font-bold">Section</label>
            <select id="drop-section" name="section" value={section} onChange={(e) => setSection(e.target.value)} className="field sm:w-72">
              {SECTIONS.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
          <label className="flex gap-3 rounded-md border border-line bg-night-2 p-4">
            <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--maize)]" />
            <span><strong>{HOUSE_RULES[0].title}</strong> Everyone named or shown in the post and the kept files said yes.</span>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <button name="intent" value="now" disabled={pending} className="rounded-full bg-maize px-6 py-3 font-bold text-night hover:bg-ink disabled:opacity-60">
              {pending ? "Dropping…" : "Drop now"}
            </button>
            <span className="text-dim">or</span>
            <label className="sr-only" htmlFor="drop-at">Drop at</label>
            <input id="drop-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field w-auto" />
            <button name="intent" value="later" disabled={pending || !when} className="rounded-full border border-maize px-6 py-3 font-bold text-maize disabled:opacity-50">Schedule drop</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-pink">{error}</p>}
    </Panel>
  );
}

export function NightAdmin(props: {
  night: { id: string; status: NightStatus; phase: Phase; opensAt: string; closesAt: string; albumOpen: boolean; dropAt: string | null; generations: number; maxGenerations: number; hasPost: boolean };
  freshLink: string | null;
  uploads: Upload[];
  accounts: Array<{ device_id: string; nickname: string; body: string }>;
  rsvps: Array<{ nickname: string; answer: string }>;
  draft: Draft | null;
  draftBody: ReactNode;
  review: { approvals: number; notes: Array<{ nickname: string | null; body: string }> };
  venues: Array<{ name: string; url: string }>;
}) {
  const { night } = props;
  const dropped = night.status === "dropped" || (night.status === "dropping" && night.hasPost);
  const stuck = night.status === "dropping" && !night.hasPost;
  const { pending, run } = useRun();
  return (
    <>
      {stuck && (
        <p role="alert" className="mt-8 rounded-md border border-pink bg-pink/10 p-4">
          The last drop stopped partway. Use <strong>Drop now</strong> below to finish it; files already copied won&apos;t be copied twice. The cron will also retry within 15 minutes.
        </p>
      )}
      {!dropped && <LinkPanel nightId={night.id} freshLink={props.freshLink} night={night} />}
      <AccountsPanel nightId={night.id} accounts={props.accounts} rsvps={props.rsvps} />
      <UploadsPanel nightId={night.id} uploads={props.uploads} />
      {!dropped && <VenuesPanel nightId={night.id} venues={props.venues} />}
      {!dropped && (
        <DraftPanel
          nightId={night.id}
          draft={props.draft}
          body={props.draftBody}
          review={props.review}
          accountCount={props.accounts.length}
          generations={night.generations}
          maxGenerations={night.maxGenerations}
        />
      )}
      {!dropped && props.draft && (
        <PublishPanel
          nightId={night.id}
          draft={props.draft}
          status={night.status}
          dropAt={night.dropAt}
          kept={props.uploads.filter((u) => u.decision === "keep").length}
          approvals={props.review.approvals}
          accountCount={props.accounts.length}
        />
      )}
      <div className="mt-12 border-t border-line pt-6">
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm("Delete this night, its album and everyone's accounts? A dropped post stays up.") && run(() => deleteNight(night.id))}
          className="text-sm text-dim underline underline-offset-4 hover:text-pink"
        >
          Delete this night and its album
        </button>
      </div>
    </>
  );
}
