"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { Draft, NightStatus, Phase } from "@/lib/nights";
import { HOUSE_RULES } from "@/lib/sections";
import { InviteCard } from "@/components/InviteCard";
import { InviteEditor, type InviteData } from "@/components/InviteEditor";
import { VenuesEditor, blankVenue, type VenueRow } from "@/components/VenuesEditor";
import { linkPaste } from "@/lib/link-paste";
import { songsFromLines, songsToLines, type Song } from "@/lib/tracks";
import type { Venue } from "@/lib/venues";
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
  setGuestLimits,
  addHost,
  removeHost,
  removeNightSong,
  approveGuestPlace,
  removeGuestPlaceAdmin,
  setHostName,
  removeRsvp,
  setVenues,
  updateUpload,
  type AdminResult,
} from "../actions";

type Upload = { r2_key: string; kind: string; nickname: string | null; decision: string; caption: string | null; is_cover: number; size: number; src: string };

const timeFmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });

// Shared button looks. Every tap target is at least 44px tall.
const btnGhost = "inline-flex min-h-11 items-center justify-center rounded-full border border-ink px-4 text-sm font-bold hover:border-maize hover:text-maize disabled:opacity-50";
const btnMaize = "inline-flex min-h-11 items-center justify-center rounded-full bg-maize px-5 font-bold text-night hover:bg-ink disabled:opacity-50";
const btnMaizeOutline = "inline-flex min-h-11 items-center justify-center rounded-full border border-maize px-5 font-bold text-maize disabled:opacity-50";
const textBtn = "inline-flex min-h-11 items-center px-2 text-sm text-dim underline underline-offset-4 hover:text-pink";

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

/** One step of the night. A <details> so it can fold away; its contents stay mounted, so unsaved edits survive. */
function Panel({ id, step, title, meta, children, tone = "line" }: { id: string; step: number; title: string; meta?: ReactNode; children: ReactNode; tone?: "line" | "maize" }) {
  return (
    <details
      id={id}
      open
      className={`group mt-6 scroll-mt-20 rounded-md ${tone === "maize" ? "border-2 border-dashed border-maize" : "border border-line"} sm:mt-8`}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="mono grid h-7 w-7 shrink-0 place-items-center rounded-full border border-maize text-maize">{step}</span>
        <div className="min-w-0 flex-1">
          <h2 className="display block text-xl sm:text-2xl">{title}</h2>
          {meta && <span className="mono mt-1 block text-dim">{meta}</span>}
        </div>
        <span aria-hidden className="mono shrink-0 text-dim transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="px-4 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </details>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="mt-3 rounded-md border border-pink/60 bg-pink/10 p-3 text-sm">{error}</p> : null;
}

type Step = { id: string; n: number; label: string; value?: string; done?: boolean };

/** Sticky strip: where the night stands, and a thumb-reachable jump to each step. */
function StatusBar({ steps, next }: { steps: Step[]; next: string | null }) {
  return (
    <nav aria-label="Steps for this night" className="sticky top-0 z-30 -mx-4 mt-6 border-y border-line bg-night/95 backdrop-blur sm:-mx-6">
      <ol className="flex gap-2 overflow-x-auto px-4 py-2 sm:px-6 [scrollbar-width:none]">
        {steps.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={s.id === next ? "step" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-bold ${
                s.id === next ? "border-maize bg-maize text-night" : s.done ? "border-line text-ink" : "border-line text-dim"
              }`}
            >
              <span className="mono" aria-hidden>{s.done && s.id !== next ? "✓" : s.n}</span>
              {s.label}
              {s.value && <span className={`mono ${s.id === next ? "text-night" : "text-maize"}`}>{s.value}</span>}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function LinkPanel({ nightId, freshLink, night, invite }: { nightId: string; freshLink: string | null; night: { phase: Phase; status: NightStatus; opensAt: string; closesAt: string; albumOpen: boolean }; invite: InviteData }) {
  const [token, setToken] = useState(freshLink);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, error, run } = useRun();
  const url = token ? `${typeof window === "undefined" ? "" : window.location.origin}/drop/${token}` : null;
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: "#0c0d1c", light: "#f2eee4" } }).then(setQr);
  }, [url]);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const uploadsState = night.status === "collecting" ? (night.phase === "invite" ? "Invite out" : "Open") : night.status === "closed" ? "Closed" : "Done";

  return (
    <Panel id="link" step={1} title="The link" tone="maize" meta={`Uploads ${uploadsState.toLowerCase()} · album ${night.albumOpen ? "shared" : "hidden"}`}>
      {url ? (
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-dim">Share it anywhere: group chats, stories, texts. Everyone who opens it adds their own name or nickname.</p>
            <p suppressHydrationWarning className="mt-3 break-all rounded bg-night-2 p-3 font-mono text-sm">{url}</p>
            <div className="mt-3 grid gap-2 sm:flex sm:gap-3">
              <button
                type="button"
                onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}
                className={`${btnMaize} w-full sm:w-auto`}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => navigator.share({ title: "You're invited", url }).catch(() => {})}
                  className={`${btnGhost} w-full sm:w-auto`}
                >
                  Share
                </button>
              )}
            </div>
            <p className="mt-3 text-sm text-dim">
              Anyone with the link can also see this night&apos;s shared album. If the link goes really wide, hide the album below.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR code for the link" className="h-48 w-48 justify-self-center rounded sm:h-40 sm:w-40" />}
        </div>
      ) : (
        <p className="text-dim">This night was made before links could be shown again. Make a new one below; the old one stops working.</p>
      )}
      <InviteEditor nightId={nightId} invite={invite} />
      <InviteCard nightId={nightId} name={invite.name} opensAt={invite.opensAt} mediaUrl={invite.mediaUrl} mediaKind={invite.mediaKind} storedSig={invite.ogSig} />
      <dl className="mt-5 grid grid-cols-2 gap-3 rounded bg-night-2 p-3 text-sm sm:grid-cols-3">
        <div><dt className="mono text-maize">Party starts</dt><dd>{timeFmt(night.opensAt)}</dd></div>
        <div><dt className="mono text-maize">Photos close</dt><dd>{timeFmt(night.closesAt)}</dd></div>
        <div className="col-span-2 sm:col-span-1"><dt className="mono text-maize">Shared album</dt><dd>{night.albumOpen ? "Visible to link holders" : "Hidden"}</dd></div>
      </dl>
      <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {night.status === "collecting" && (
          <button type="button" disabled={pending} onClick={() => run(() => setUploadWindow(nightId, false))} className={btnGhost}>
            Close uploads now
          </button>
        )}
        {night.status === "closed" && (
          <button type="button" disabled={pending} onClick={() => run(() => setUploadWindow(nightId, true))} className={btnGhost}>
            Reopen uploads for 24 hours
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => run(() => setAlbumOpen(nightId, !night.albumOpen))} className={btnGhost}>
          {night.albumOpen ? "Hide shared album" : "Show shared album"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => regenerateLink(nightId), (r) => r && "token" in r && r.token && setToken(r.token))} className={btnGhost}>
          Regenerate link
        </button>
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function UploadsPanel({ nightId, uploads }: { nightId: string; uploads: Upload[] }) {
  const { pending, error, run } = useRun();
  const kept = uploads.filter((u) => u.decision === "keep").length;
  const tossed = uploads.filter((u) => u.decision === "toss").length;
  const undecided = uploads.length - kept - tossed;
  return (
    <Panel id="photos" step={4} title="Photos and videos" meta={uploads.length ? `${kept} kept · ${tossed} tossed · ${undecided} to decide` : "None yet"}>
      <p className="text-dim">Keep what goes in the post. Tossed files stay in the shared album; Delete removes a file everywhere.</p>
      {uploads.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <button type="button" disabled={pending} onClick={() => run(() => bulkDecision(nightId, uploads.map((u) => u.r2_key), "keep"))} className={btnGhost}>Keep all</button>
          <button type="button" disabled={pending} onClick={() => run(() => bulkDecision(nightId, uploads.map((u) => u.r2_key), "toss"))} className={btnGhost}>Toss all</button>
        </div>
      )}
      {uploads.length === 0 && <p className="mt-3 text-dim">Nothing uploaded yet. Files show up here as people drop them on the link.</p>}
      <ul className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 ${pending ? "opacity-80" : ""}`}>
        {uploads.map((u) => {
          const keep = u.decision === "keep";
          const toss = u.decision === "toss";
          return (
            <li key={u.r2_key} className={`relative overflow-hidden rounded bg-night-2 ${keep ? "border-2 border-maize" : "border border-line"}`}>
              <div className={toss ? "opacity-40 grayscale" : ""}>
                {u.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                ) : u.kind === "video" ? (
                  <video src={u.src} controls playsInline preload="none" className="aspect-square w-full bg-black object-cover" />
                ) : (
                  <div className="grid aspect-square place-items-center p-2"><audio src={u.src} controls preload="none" className="w-full" /></div>
                )}
              </div>
              <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                {keep && <span className="mono rounded bg-maize px-1.5 py-0.5 text-night">Kept</span>}
                {toss && <span className="mono rounded bg-night px-1.5 py-0.5 text-dim">Tossed</span>}
                {u.is_cover ? <span className="mono rounded bg-pink px-1.5 py-0.5 text-night">Cover</span> : null}
              </div>
              <div className="space-y-2 p-2 text-sm">
                <p className="truncate text-dim">{u.nickname ?? "Anonymous"} · {u.size >= 1048576 ? `${(u.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(u.size / 1024))} KB`}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" disabled={pending} aria-pressed={keep} onClick={() => run(() => updateUpload(nightId, u.r2_key, { decision: keep ? "pending" : "keep" }))} className={`min-h-11 rounded font-bold ${keep ? "bg-maize text-night" : "border border-line hover:border-maize"}`}>Keep</button>
                  <button type="button" disabled={pending} aria-pressed={toss} onClick={() => run(() => updateUpload(nightId, u.r2_key, { decision: toss ? "pending" : "toss" }))} className={`min-h-11 rounded font-bold ${toss ? "bg-ink text-night" : "border border-line hover:border-ink"}`}>Toss</button>
                  {u.kind === "photo" && !u.is_cover ? (
                    <button type="button" disabled={pending} onClick={() => run(() => updateUpload(nightId, u.r2_key, { cover: true }))} className="min-h-11 rounded border border-line text-dim hover:border-pink hover:text-ink">Cover</button>
                  ) : (
                    <span aria-hidden className="grid min-h-11 place-items-center text-xs text-dim">{u.is_cover ? "Is cover" : ""}</span>
                  )}
                  <button type="button" disabled={pending} onClick={() => confirm("Delete this file from the album for good?") && run(() => deleteUpload(nightId, u.r2_key))} className="min-h-11 rounded text-pink underline underline-offset-4">Delete</button>
                </div>
                <input
                  defaultValue={u.caption ?? ""}
                  maxLength={300}
                  aria-label="Caption"
                  placeholder="Caption"
                  enterKeyHint="done"
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  onBlur={(e) => e.target.value !== (u.caption ?? "") && run(() => updateUpload(nightId, u.r2_key, { caption: e.target.value }))}
                  className="field py-2 text-base"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <ErrorLine error={error} />
    </Panel>
  );
}

function GuestPlacesPanel({ nightId, places }: { nightId: string; places: Array<{ id: string; name: string; url: string | null; kind: string }> }) {
  const { pending, error, run } = useRun();
  return (
    <section aria-labelledby="gplaces-h" className="mt-6 rounded-md border-2 border-dashed border-pink p-4 sm:mt-8 sm:p-5">
      <h2 id="gplaces-h" className="display text-xl">Places from guests ({places.length})</h2>
      <p className="mt-1 text-sm text-dim">
        Waiting for you. Approve adds it to this night&apos;s places (and the post when it drops). Check the website before you approve: it&apos;s shown in full below.
      </p>
      <ul className="mt-3 divide-y divide-line rounded border border-line">
        {places.map((p) => (
          <li key={p.id} className="space-y-2 p-3">
            <p>
              <strong>{p.name}</strong> <span className="mono text-xs text-dim">{p.kind === "eat" ? "Eat" : "Party"}</span>
            </p>
            {p.url ? <p className="mono break-all text-sm text-maize">{p.url}</p> : <p className="text-sm text-dim">No website</p>}
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => run(() => approveGuestPlace(nightId, p.id))} className={btnGhost}>Approve</button>
              <button type="button" disabled={pending} onClick={() => run(() => removeGuestPlaceAdmin(nightId, p.id))} className={textBtn}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
    </section>
  );
}

function GuestSongsPanel({ nightId, songs }: { nightId: string; songs: Array<{ id: string; title: string; artist: string | null; url: string | null }> }) {
  const { pending, error, run } = useRun();
  return (
    <section aria-labelledby="gsongs-h" className="mt-6 rounded-md border border-line p-4 sm:mt-8 sm:p-5">
      <h2 id="gsongs-h" className="display text-xl">Songs from guests ({songs.length})</h2>
      <p className="mt-1 text-sm text-dim">Added on the party link. They go on the post&apos;s playlist when it drops, after the draft&apos;s songs.</p>
      <ul className="mt-3 divide-y divide-line rounded border border-line">
        {songs.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 p-3">
            <span className="min-w-0 truncate">
              <strong>{s.title}</strong>
              {s.artist && <span className="text-dim"> · {s.artist}</span>}
            </span>
            <button type="button" disabled={pending} onClick={() => run(() => removeNightSong(nightId, s.id))} className={textBtn}>Remove</button>
          </li>
        ))}
      </ul>
      <ErrorLine error={error} />
    </section>
  );
}

function VenuesPanel({ nightId, venues }: { nightId: string; venues: Venue[] }) {
  const [rows, setRows] = useState<VenueRow[]>(venues.length ? venues.map((v) => ({ name: v.name, url: v.url ?? "", kind: v.kind })) : [blankVenue()]);
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const named = venues.filter((v) => v.name).length;
  return (
    <Panel id="places" step={5} title="Places you went" meta={named ? `${named} saved` : "None saved"}>
      <p className="text-dim">Name, website, and whether it was for partying or eating. Place names in the draft link to these websites, and when the night drops they show up on the Places tab, linked back to this night.</p>
      <div className="mt-4">
        <VenuesEditor rows={rows} setRows={setRows} onChange={() => setSaved(false)} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={pending} onClick={() => run(() => setVenues(nightId, rows), () => setSaved(true))} className={btnMaize}>{pending ? "Saving…" : "Save places"}</button>
        {saved && <span role="status" className="text-maize">Saved.</span>}
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function HostRow({ nightId, host, canEdit, canRemove, isMe }: { nightId: string; host: { email: string; name: string }; canEdit: boolean; canRemove: boolean; isMe: boolean }) {
  const { pending, error, run } = useRun();
  const [name, setName] = useState(host.name);
  const [saved, setSaved] = useState(false);
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-dim">{host.email}{isMe ? " (you)" : ""}</span>
        {canRemove && (
          <button type="button" disabled={pending} onClick={() => confirm(`Remove ${host.email} as a host?`) && run(() => removeHost(nightId, host.email))} className={textBtn}>
            Remove
          </button>
        )}
      </div>
      {canEdit ? (
        <div className="flex gap-2">
          <label htmlFor={`hn-${host.email}`} className="sr-only">Name on the invite</label>
          <input
            id={`hn-${host.email}`}
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false); }}
            maxLength={40}
            placeholder={isMe ? "Your name on the invite" : "Their name on the invite"}
            className="field flex-1"
          />
          <button type="button" disabled={pending || name === host.name} onClick={() => run(() => setHostName(nightId, host.email, name), () => setSaved(true))} className={btnGhost}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <p className="font-bold">{host.name || <span className="font-normal text-dim">No name set yet</span>}</p>
      )}
      {saved && <p role="status" className="text-sm text-maize">Saved. It shows on the invite as &quot;Hosted by&quot;.</p>}
      <ErrorLine error={error} />
    </li>
  );
}

function HostsPanel({ nightId, hosts, isAdmin, me }: { nightId: string; hosts: Array<{ email: string; name: string }>; isAdmin: boolean; me: string }) {
  const { pending, error, run } = useRun();
  const [email, setEmail] = useState("");
  const list = isAdmin && !hosts.some((h) => h.email === me) ? [{ email: me, name: "" }, ...hosts] : hosts;
  return (
    <section aria-labelledby="hosts-h" className="mt-6 rounded-md border border-line p-4 sm:mt-8 sm:p-5">
      <h2 id="hosts-h" className="display text-xl">Hosts</h2>
      <p className="mt-1 text-sm text-dim">
        Names here show on the invite as &quot;Hosted by …&quot;. Emails never show. Co-hosts can run this night: guest list, photos, places, draft and drop.
      </p>
      <ul className="mt-3 divide-y divide-line rounded border border-line">
        {list.map((h) => (
          <HostRow key={h.email} nightId={nightId} host={h} canEdit={isAdmin || h.email === me} canRemove={isAdmin && h.email !== me} isMe={h.email === me} />
        ))}
      </ul>
      {isAdmin && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="host-email" className="sr-only">Co-host&apos;s Google email</label>
          <input
            id="host-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Add a co-host by Google email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="field sm:flex-1"
          />
          <button type="button" disabled={pending || !email} onClick={() => run(() => addHost(nightId, email), () => setEmail(""))} className={btnGhost}>
            Add host
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </section>
  );
}

type Rsvp = { device_id: string; nickname: string; answer: string; plus_ones: number; waitlisted: number; mePath: string | null };

/** Copies a guest's personal link so a host can send it to someone who got locked out (e.g. RSVPed inside Snapchat). */
function CopyGuestLink({ path, name }: { path: string; name: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        } catch {
          window.prompt(`${name}'s personal link. Only send it to them:`, url);
        }
      }}
      className={textBtn}
      title={`Copy ${name}'s personal link. It signs in as them, so only send it to them.`}
    >
      {done ? "Copied" : "Copy link"}
    </button>
  );
}

function GuestsPanel({ nightId, rsvps, limits }: { nightId: string; rsvps: Rsvp[]; limits: { capacity: number | null } }) {
  const { pending, error, run } = useRun();
  const [capacity, setCapacity] = useState(limits.capacity === null ? "" : String(limits.capacity));
  const going = rsvps.filter((g) => g.answer === "going" && !g.waitlisted);
  const waitlist = rsvps.filter((g) => g.answer === "going" && g.waitlisted);
  const maybe = rsvps.filter((g) => g.answer === "maybe");
  const cant = rsvps.filter((g) => g.answer === "cant");
  const headcount = going.length;
  const groups: Array<[string, Rsvp[]]> = [
    ["Going", going],
    ["Waitlist", waitlist],
    ["Maybe", maybe],
    ["Can't make it", cant],
  ];
  return (
    <Panel
      id="guests"
      step={2}
      title="Guest list"
      meta={`${headcount}${limits.capacity !== null ? ` of ${limits.capacity}` : ""} going${waitlist.length ? ` · ${waitlist.length} waitlisted` : ""}`}
    >
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="g-cap" className="mb-1 block text-sm font-bold">Guest limit</label>
          <input id="g-cap" value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" inputMode="numeric" min={1} max={5000} placeholder="No limit" className="field sm:w-32" />
        </div>
        <button type="button" disabled={pending} onClick={() => run(() => setGuestLimits(nightId, capacity))} className={btnGhost}>
          {pending ? "Saving…" : "Save limit"}
        </button>
      </div>
      <p className="mt-2 text-sm text-dim">Raising the limit lets people in off the waitlist, oldest first.</p>
      <div className="mt-5 space-y-5">
        {groups.map(([label, list]) =>
          list.length ? (
            <div key={label}>
              <p className="mono text-maize">{label} ({list.length})</p>
              <ul className="mt-2 divide-y divide-line rounded border border-line">
                {list.map((g) => (
                  <li key={g.device_id} className="flex min-h-12 items-center justify-between gap-3 px-3">
                    <span className="min-w-0 flex-1 truncate">{g.nickname}</span>
                    {g.mePath && <CopyGuestLink path={g.mePath} name={g.nickname} />}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirm(`Take ${g.nickname} off the guest list?`) && run(() => removeRsvp(nightId, g.device_id))}
                      className={textBtn}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        {!rsvps.length && <p className="text-dim">No RSVPs yet. Share the link.</p>}
        {rsvps.length > 0 && (
          <p className="text-sm text-dim">
            Someone locked out (say they RSVPed inside Snapchat and now it doesn&apos;t know them)? Tap Copy link next to their name and send it to just them. It signs them back in as themselves.
          </p>
        )}
      </div>
      <ErrorLine error={error} />
    </Panel>
  );
}

function AccountsPanel({ nightId, accounts, rsvps }: { nightId: string; accounts: Array<{ device_id: string; nickname: string; body: string }>; rsvps: Array<{ nickname: string; answer: string }> }) {
  const { pending, error, run } = useRun();
  const going = rsvps.filter((r) => r.answer === "going").map((r) => r.nickname);
  return (
    <Panel id="accounts" step={3} title="Stories" meta={`${accounts.length} written · ${going.length} going`}>
      {rsvps.length > 0 && <p className="text-dim">RSVP&apos;d going: {going.join(", ") || "nobody yet"}.</p>}
      {accounts.length ? (
        <ul className="mt-4 space-y-3">
          {accounts.map((a) => (
            <li key={a.device_id} className="rounded bg-night-2 p-4">
              <div className="-my-2 flex items-center justify-between gap-3">
                <span className="mono text-maize">{a.nickname}</span>
                <button type="button" disabled={pending} onClick={() => confirm(`Remove ${a.nickname}'s story?`) && run(() => removeAccount(nightId, a.device_id))} className={`${textBtn} -mr-2`}>Remove</button>
              </div>
              <p className="mt-2 whitespace-pre-line">{a.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-dim">Nobody has written their side yet. Stories open on the link when the party starts.</p>
      )}
      <ErrorLine error={error} />
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
  const draftSongs: Song[] = (() => {
    try {
      const v = JSON.parse(draft?.songs ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  })();

  async function generate(rewrite: boolean) {
    setBusy(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/nights/${nightId}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rewrite }) });
      if (!res.ok) setGenError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't write the draft.");
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
        songs: songsFromLines(String(form.get("songs") ?? "")),
      }),
      () => setEditing(false),
    );
  }

  const allApproved = accountCount > 0 && review.approvals >= accountCount;

  return (
    <Panel
      id="draft"
      step={6}
      title={draft ? `Draft, version ${draft.version}` : "The draft"}
      tone="maize"
      meta={draft ? `${review.approvals} of ${accountCount} approved · ${review.notes.length} ${review.notes.length === 1 ? "note" : "notes"}` : "Not written yet"}
    >
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <button type="button" disabled={busy || !accountCount} onClick={() => generate(false)} className={btnMaize}>
          {busy ? "Writing the draft… keep this tab open" : draft ? "Write a fresh draft" : "Write the draft"}
        </button>
        {draft && (
          <button type="button" disabled={busy || !review.notes.length} onClick={() => generate(true)} className={btnMaizeOutline}>
            Rewrite with the {review.notes.length} {review.notes.length === 1 ? "note" : "notes"}
          </button>
        )}
        <button type="button" onClick={() => setEditing((e) => !e)} className={btnGhost}>
          {editing ? "Cancel edit" : draft ? "Edit the text" : "Write it by hand"}
        </button>
      </div>
      <p className="mono mt-3 text-dim">{generations} of {maxGenerations} drafts used</p>
      {!accountCount && <p className="mt-3 text-dim">The draft needs at least one story to work from.</p>}
      <ErrorLine error={genError} />

      {editing ? (
        <form action={saveEdit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="draft-title" className="mb-1 block text-sm font-bold">Title</label>
            <input id="draft-title" name="title" required maxLength={140} defaultValue={draft?.title ?? ""} placeholder="Title" className="field text-xl" />
          </div>
          <div>
            <label htmlFor="draft-dek" className="mb-1 block text-sm font-bold">Dek</label>
            <input id="draft-dek" name="dek" maxLength={200} defaultValue={draft?.dek ?? ""} placeholder="One line under the title" className="field" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="draft-night" className="mb-1 block text-sm font-bold">The night</label>
              <input id="draft-night" name="nightLabel" maxLength={80} defaultValue={draft?.night_label ?? ""} className="field" />
            </div>
            <div>
              <label htmlFor="draft-damage" className="mb-1 block text-sm font-bold">Damage</label>
              <input id="draft-damage" name="damage" maxLength={80} defaultValue={draft?.damage ?? ""} className="field" />
            </div>
            <div>
              <label htmlFor="draft-ride" className="mb-1 block text-sm font-bold">Ride home</label>
              <input id="draft-ride" name="rideHome" maxLength={160} defaultValue={draft?.ride_home ?? ""} className="field" />
            </div>
          </div>
          <div>
            <label htmlFor="draft-body" className="mb-1 block text-sm font-bold">Body</label>
            <textarea id="draft-body" name="body" required rows={16} maxLength={60000} defaultValue={draft?.body ?? ""} onPaste={linkPaste} className="field leading-relaxed" />
            <p className="mt-1 text-sm text-dim">Paste links straight in. To link some words, select them and paste the link.</p>
            <p className="mt-1 text-sm text-dim">Link a place with [Rick&apos;s](https://its-website.com). Saving makes a new version, and approvals start over.</p>
          </div>
          <div>
            <label htmlFor="draft-songs" className="mb-1 block text-sm font-bold">Songs of the night</label>
            <textarea id="draft-songs" name="songs" rows={5} defaultValue={songsToLines(draftSongs)} placeholder={"Paste a Spotify, SoundCloud, YouTube or Apple Music link\nor type: The Killers - Mr. Brightside"} className="field font-mono text-sm leading-relaxed" />
            <p className="mt-1 text-sm text-dim">One per line, &quot;Artist - Title&quot; or just the title. They go on the post and the Playlists tab.</p>
          </div>
          <div className="sticky bottom-0 -mx-4 border-t border-line bg-night/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <button disabled={pending} className={`${btnMaize} w-full sm:w-auto`}>{pending ? "Saving…" : "Save as new version"}</button>
          </div>
        </form>
      ) : draft ? (
        <div className="mt-6 rounded-md bg-night-2 p-4 sm:p-8">
          <h3 className="display text-[clamp(1.8rem,5vw,3rem)]">{draft.title}</h3>
          {draft.dek && <p className="mt-3 text-xl">{draft.dek}</p>}
          <p className="mono mt-4 text-maize">{[draft.night_label, draft.damage, draft.ride_home].filter(Boolean).join(" · ")}</p>
          <div className="mt-6">{body}</div>
          {draftSongs.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <p className="mono text-maize">Songs of the night ({draftSongs.length})</p>
              <ol className="mt-2 space-y-1 text-sm">
                {draftSongs.map((t, i) => <li key={i}><strong>{t.title}</strong>{t.artist ? <span className="text-dim"> · {t.artist}</span> : null}</li>)}
              </ol>
            </div>
          )}
        </div>
      ) : null}

      {draft && (
        <div className="mt-6">
          <p className={`rounded-md border p-3 font-bold ${allApproved ? "border-maize text-maize" : "border-line"}`}>
            {review.approvals} of {accountCount} people who wrote accounts have approved this version.
          </p>
          <p className="mt-2 text-sm text-dim">The approval round is how house rule 1 gets checked: people read it for real names and things they didn&apos;t agree to.</p>
          <h3 className="mono mt-6 text-maize">Notes on this version</h3>
          {review.notes.length ? (
            <ul className="mt-2 space-y-2">
              {review.notes.map((n, i) => (
                <li key={i} className="rounded bg-night-2 p-3"><span className="mono text-maize">{n.nickname ?? "Admin"}</span> {n.body}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-dim">No notes on this version yet.</p>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={600}
              aria-label="Admin note"
              placeholder="Your note for the rewrite"
              enterKeyHint="send"
              onKeyDown={(e) => { if (e.key === "Enter" && note && !pending) { e.preventDefault(); run(() => addAdminNote(nightId, note), () => setNote("")); } }}
              className="field min-w-0"
            />
            <button type="button" disabled={pending || !note} onClick={() => run(() => addAdminNote(nightId, note), () => setNote(""))} className={`${btnGhost} shrink-0`}>Add</button>
          </div>
        </div>
      )}
      <ErrorLine error={error} />
    </Panel>
  );
}

function PublishPanel({ nightId, draft, status, dropAt, kept, approvals, accountCount }: { nightId: string; draft: Draft; status: NightStatus; dropAt: string | null; kept: number; approvals: number; accountCount: number }) {
  const [when, setWhen] = useState("");
  const { pending, error, run } = useRun();
  const fields = (form: FormData) => ({
    title: draft.title,
    dek: draft.dek ?? "",
    section: "night-reports",
    night: draft.night_label ?? "",
    damage: draft.damage ?? "",
    rideHome: draft.ride_home ?? "",
    body: draft.body,
    consent: form.get("consent") === "yes",
  });
  const allApproved = accountCount > 0 && approvals >= accountCount;

  return (
    <Panel
      id="drop"
      step={7}
      title="Drop it"
      tone="maize"
      meta={status === "reviewing" && dropAt ? `Scheduled ${timeFmt(dropAt)}` : `Version ${draft.version} · ${kept} ${kept === 1 ? "file" : "files"} · ${allApproved ? "all approved" : `${approvals} of ${accountCount} approved`}`}
    >
      {status === "reviewing" && dropAt ? (
        <div>
          <p className="text-lg">Scheduled to drop {timeFmt(dropAt)}.</p>
          <button type="button" disabled={pending} onClick={() => run(() => cancelSchedule(nightId))} className={`${btnGhost} mt-3`}>Cancel the schedule</button>
        </div>
      ) : (
        <form
          action={(form) => {
            const intent = String(form.get("intent"));
            if (intent === "now" && !allApproved && !confirm(`Only ${approvals} of ${accountCount} approved version ${draft.version}. Drop anyway?`)) return;
            run(() => (intent === "now" ? dropNow(nightId, fields(form)) : scheduleDrop(nightId, fields(form), when)));
          }}
          className="space-y-4"
        >
          <p className="text-dim">Publishes version {draft.version} with the {kept} kept {kept === 1 ? "file" : "files"}. Nothing goes public until you do this.</p>
          {!allApproved && (
            <p className="rounded-md border border-pink/60 bg-pink/10 p-3 text-sm">Only {approvals} of {accountCount} people have approved this version.</p>
          )}
          <label className="flex cursor-pointer gap-3 rounded-md border border-line bg-night-2 p-4">
            <input type="checkbox" name="consent" value="yes" required className="mt-1 h-6 w-6 shrink-0 accent-[var(--maize)]" />
            <span><strong>{HOUSE_RULES[0].title}</strong> Everyone named or shown in the post and the kept files said yes.</span>
          </label>
          <button name="intent" value="now" disabled={pending} className={`${btnMaize} min-h-14 w-full text-lg sm:w-auto sm:px-8`}>
            {pending ? "Dropping…" : "Drop now"}
          </button>
          <div className="rounded-md border border-line p-3">
            <label className="mono mb-2 block text-dim" htmlFor="drop-at">Or schedule it</label>
            <div className="grid gap-2 sm:flex sm:items-center sm:gap-3">
              <input id="drop-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field min-h-11 sm:w-auto" />
              <button name="intent" value="later" disabled={pending || !when} className={btnMaizeOutline}>Schedule drop</button>
            </div>
          </div>
        </form>
      )}
      <ErrorLine error={error} />
    </Panel>
  );
}

export function NightAdmin(props: {
  night: { id: string; status: NightStatus; phase: Phase; opensAt: string; closesAt: string; albumOpen: boolean; dropAt: string | null; generations: number; maxGenerations: number; hasPost: boolean };
  invite: InviteData;
  freshLink: string | null;
  uploads: Upload[];
  accounts: Array<{ device_id: string; nickname: string; body: string }>;
  rsvps: Rsvp[];
  guestLimits: { capacity: number | null };
  isAdmin: boolean;
  hosts: Array<{ email: string; name: string }>;
  me: string;
  guestPlaces: Array<{ id: string; name: string; url: string | null; kind: string }>;
  guestSongs: Array<{ id: string; title: string; artist: string | null; url: string | null }>;
  draft: Draft | null;
  draftBody: ReactNode;
  review: { approvals: number; notes: Array<{ nickname: string | null; body: string }> };
  venues: Venue[];
}) {
  const { night } = props;
  const dropped = night.status === "dropped" || (night.status === "dropping" && night.hasPost);
  const stuck = night.status === "dropping" && !night.hasPost;
  const { pending, run } = useRun();

  const kept = props.uploads.filter((u) => u.decision === "keep").length;
  const undecided = props.uploads.filter((u) => u.decision !== "keep" && u.decision !== "toss").length;
  const accountCount = props.accounts.length;
  const approvals = props.review.approvals;
  const guestHeadcount = props.rsvps.filter((g) => g.answer === "going" && !g.waitlisted).length;
  const steps: Step[] = [
    ...(!dropped ? [{ id: "link", n: 1, label: "Link", done: night.phase !== "invite" && night.phase !== "live" }] : []),
    { id: "guests", n: 2, label: "Guests", value: String(guestHeadcount), done: guestHeadcount > 0 },
    { id: "accounts", n: 3, label: "Stories", value: String(accountCount), done: accountCount > 0 },
    { id: "photos", n: 4, label: "Photos", value: props.uploads.length ? `${kept}/${props.uploads.length}` : "0", done: props.uploads.length > 0 && undecided === 0 },
    ...(!dropped
      ? [
          { id: "places", n: 5, label: "Places", value: String(props.venues.filter((v) => v.name).length), done: props.venues.some((v) => v.name) },
          { id: "draft", n: 6, label: "Draft", value: props.draft ? `v${props.draft.version} · ${approvals}/${accountCount} ok` : undefined, done: !!props.draft && accountCount > 0 && approvals >= accountCount },
        ]
      : []),
    ...(!dropped && props.draft ? [{ id: "drop", n: 7, label: night.status === "reviewing" ? "Scheduled" : "Drop" }] : []),
  ];
  // The one step that needs attention next.
  const next = dropped
    ? null
    : stuck
      ? "drop"
      : night.phase === "invite" || night.phase === "live"
        ? accountCount === 0 ? "link" : null
        : undecided > 0
          ? "photos"
          : !props.draft
            ? "draft"
            : approvals < accountCount
              ? "draft"
              : "drop";

  const phaseText = dropped
    ? "Dropped"
    : stuck
      ? "Drop stopped partway"
      : night.status === "reviewing"
        ? `Drop scheduled for ${night.dropAt ? timeFmt(night.dropAt) : "later"}`
        : { invite: "Invite is out", live: "Live: collecting photos and stories", after: "Ready to review", dropped: "Dropped" }[night.phase];

  return (
    <>
      <p className="mono mt-4 text-maize">{phaseText}</p>
      <StatusBar steps={steps} next={next} />
      {stuck && (
        <p role="alert" className="mt-6 rounded-md border border-pink bg-pink/10 p-4">
          The last drop stopped partway. Use <strong>Drop now</strong> below to finish it; files already copied won&apos;t be copied twice. The cron will also retry within 15 minutes.
        </p>
      )}
      {!dropped && <LinkPanel nightId={night.id} freshLink={props.freshLink} night={night} invite={props.invite} />}
      <HostsPanel nightId={night.id} hosts={props.hosts} isAdmin={props.isAdmin} me={props.me} />
      {!dropped && <GuestsPanel nightId={night.id} rsvps={props.rsvps} limits={props.guestLimits} />}
      <AccountsPanel nightId={night.id} accounts={props.accounts} rsvps={props.rsvps} />
      <UploadsPanel nightId={night.id} uploads={props.uploads} />
      {!dropped && props.guestPlaces.length > 0 && <GuestPlacesPanel nightId={night.id} places={props.guestPlaces} />}
      {!dropped && <VenuesPanel nightId={night.id} venues={props.venues} />}
      {!dropped && props.guestSongs.length > 0 && <GuestSongsPanel nightId={night.id} songs={props.guestSongs} />}
      {!dropped && (
        <DraftPanel
          nightId={night.id}
          draft={props.draft}
          body={props.draftBody}
          review={props.review}
          accountCount={accountCount}
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
          kept={kept}
          approvals={approvals}
          accountCount={accountCount}
        />
      )}
      {props.isAdmin && (
        <div className="mt-12 border-t border-line pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm("Delete this night, its album and everyone's stories? A dropped post stays up.") && run(() => deleteNight(night.id))}
            className={`${textBtn} -ml-2`}
          >
            Delete this night and its album
          </button>
        </div>
      )}
    </>
  );
}
