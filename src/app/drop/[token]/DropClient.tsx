"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addNote, rsvp, saveAccount, setApproval } from "@/app/drop/actions";
import { ACCEPT_ATTR, ALLOWED_TYPES } from "@/lib/media-rules";
import type { Phase } from "@/lib/nights";
import { putWithProgress, scrubPhoto } from "@/lib/scrub-photo";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string };
  }
}

type Draft = {
  version: number;
  title: string;
  dek: string | null;
  wristband: { night: string | null; damage: string | null; rideHome: string | null };
  approvals: number;
  approvedByMe: boolean;
  notes: Array<{ nickname: string | null; body: string }>;
};

const GUEST_MB = { photo: 25, video: 200, audio: 60 } as const;

function Turnstile({ token, siteKey }: { token: string; siteKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const id = "cf-turnstile-script";
    const render = () => {
      if (!box.current || !window.turnstile || box.current.childElementCount) return;
      window.turnstile.render(box.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: async (t: string) => {
          const res = await fetch(`/api/drop/${token}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turnstile: t }) });
          if (res.ok) router.refresh();
          else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't verify. Reload and try again.");
        },
      });
    };
    if (window.turnstile) return render();
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = id;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", render);
    return () => s?.removeEventListener("load", render);
  }, [token, siteKey, router]);
  return (
    <div className="mt-10 rounded-md border border-line bg-night-2 p-5">
      <p className="font-bold">Quick check that you&apos;re a person, then you&apos;re in.</p>
      <p className="mt-1 text-sm text-dim">No sign-up, no name. Your phone just remembers you for this night.</p>
      <div ref={box} className="mt-4 min-h-[65px]" />
      {error && <p role="alert" className="mt-2 text-pink">{error}</p>}
    </div>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ error: string } | { ok: true } | undefined>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r && "error" in r ? { ok: false, text: r.error } : { ok: true, text: okText });
    });
  return { pending, msg, run };
}

function Rsvp({ token, current }: { token: string; current: { nickname: string; answer: string } | null }) {
  const [nickname, setNickname] = useState(current?.nickname ?? "");
  const { pending, msg, run } = useAction();
  const choices = [
    ["going", "I'm in"],
    ["maybe", "Maybe"],
    ["cant", "Can't make it"],
  ] as const;
  return (
    <section className="mt-10">
      <h2 className="display text-3xl">RSVP</h2>
      <label htmlFor="rsvp-nick" className="mt-4 block font-bold">Your nickname</label>
      <input id="rsvp-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} className="field mt-2 sm:w-72" placeholder="What the group chat calls you" />
      <div className="mt-4 flex flex-wrap gap-3">
        {choices.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            aria-pressed={current?.answer === value}
            onClick={() => run(() => rsvp(token, nickname, value), value === "cant" ? "Got it. Next time." : "You're on the list.")}
            className={`rounded-full border px-5 py-2 font-bold ${current?.answer === value ? "border-maize bg-maize text-night" : "border-ink hover:border-maize hover:text-maize"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {msg && <p role="status" className={`mt-3 ${msg.ok ? "text-maize" : "text-pink"}`}>{msg.text}</p>}
      <p className="mt-6 text-sm text-dim">When the party starts, this same link opens for photos, videos and everyone&apos;s side of the story.</p>
    </section>
  );
}

type UploadItem = { id: string; name: string; progress: number; done: boolean; error?: string };

function Uploader({ token }: { token: string }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [nickname, setNickname] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const patch = (id: string, p: Partial<UploadItem>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function one(file: File, id: string) {
    try {
      const type = ALLOWED_TYPES[file.type];
      if (!type) throw new Error("That file type isn't supported.");
      if (file.size > GUEST_MB[type.kind] * 1048576 && type.kind !== "photo") throw new Error(`Over ${GUEST_MB[type.kind]} MB.`);
      const ready = type.kind === "photo" ? await scrubPhoto(file, 4096) : file;
      const res = await fetch(`/api/drop/${token}/uploads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentType: ready.type, size: ready.size, nickname, consent }),
      });
      const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!res.ok || !data.key || !data.uploadUrl) throw new Error(data.error ?? "Upload couldn't start.");
      await putWithProgress(data.uploadUrl, ready, data.headers ?? {}, (p) => patch(id, { progress: p }));
      const ok = await fetch(`/api/drop/${token}/uploads/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: data.key }) });
      if (!ok.ok) throw new Error(((await ok.json().catch(() => ({}))) as { error?: string }).error ?? "Upload didn't finish.");
      patch(id, { done: true, progress: 1 });
    } catch (e) {
      patch(id, { error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).map((f) => ({ file: f, id: crypto.randomUUID() }));
    setItems((l) => [...l, ...list.map(({ file, id }) => ({ id, name: file.name, progress: 0, done: false }))]);
    if (input.current) input.current.value = "";
    // Three at a time so phones on club wifi don't choke.
    const queue = [...list];
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await one(next.file, next.id);
    }));
    router.refresh();
  }

  const done = items.filter((i) => i.done).length;
  return (
    <section className="mt-10">
      <h2 className="display text-3xl">Drop your photos and videos</h2>
      <label htmlFor="up-nick" className="mt-4 block font-bold">Nickname (optional)</label>
      <input id="up-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} className="field mt-2 sm:w-72" />
      <label className="mt-4 flex gap-3 rounded-md border border-line bg-night-2 p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--maize)]" />
        <span>Everyone in these is cool with them going up, and I&apos;m 21+.</span>
      </label>
      <label className={`mt-4 block cursor-pointer rounded-md bg-maize px-6 py-5 text-center text-lg font-bold text-night ${consent ? "hover:bg-ink" : "pointer-events-none opacity-50"}`}>
        Add photos and videos
        <input ref={input} type="file" multiple accept={ACCEPT_ATTR} disabled={!consent} className="sr-only" onChange={(e) => add(e.target.files)} />
      </label>
      <p className="mt-2 text-sm text-dim">Photos get their location and camera info stripped before upload. Videos keep theirs.</p>
      {items.length > 0 && (
        <>
          <p role="status" className="mt-4 font-bold text-maize">
            {done === items.length ? `Got it, ${done} ${done === 1 ? "file" : "files"} in.` : `Uploading ${done} of ${items.length}…`}
          </p>
          <ul className="mt-3 space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded bg-night-2 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="truncate">{i.name}</span>
                  <span className={i.error ? "text-pink" : "text-dim"}>{i.error ?? (i.done ? "Done" : `${Math.round(i.progress * 100)}%`)}</span>
                </div>
                {!i.done && !i.error && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-night">
                    <div className="h-full bg-maize transition-[width]" style={{ width: `${i.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Account({ token, account, count }: { token: string; account: { nickname: string; body: string } | null; count: number }) {
  const [nickname, setNickname] = useState(account?.nickname ?? "");
  const [body, setBody] = useState(account?.body ?? "");
  const { pending, msg, run } = useAction();
  return (
    <section className="mt-12">
      <h2 className="display text-3xl">Your side of the story</h2>
      <p className="mt-2 text-dim">
        What happened, from where you were standing. Times, prices, the line, who did what (use nicknames). Claude stitches everyone&apos;s version into one post.
        {count > 0 && ` ${count} ${count === 1 ? "account" : "accounts"} in so far.`}
      </p>
      <label htmlFor="acct-nick" className="mt-4 block font-bold">Nickname</label>
      <input id="acct-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} className="field mt-2 sm:w-72" placeholder="The only name that shows up" />
      <label htmlFor="acct-body" className="mt-4 block font-bold">The night, according to you</label>
      <textarea id="acct-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000} className="field mt-2 leading-relaxed" placeholder="We got there at 10:40, which everyone agreed was too early…" />
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => saveAccount(token, nickname, body), account ? "Updated." : "Saved. You can edit it until the post drops.")}
        className="mt-3 rounded-full bg-maize px-6 py-3 font-bold text-night hover:bg-ink disabled:opacity-60"
      >
        {pending ? "Saving…" : account ? "Update my account" : "Save my account"}
      </button>
      {msg && <p role="status" className={`mt-3 ${msg.ok ? "text-maize" : "text-pink"}`}>{msg.text}</p>}
    </section>
  );
}

function Review({ token, draft, body, wrote }: { token: string; draft: Draft; body: ReactNode; wrote: boolean }) {
  const [note, setNote] = useState("");
  const [nickname, setNickname] = useState("");
  const noteAction = useAction();
  const approveAction = useAction();
  const facts = [
    ["The night", draft.wristband.night],
    ["Damage", draft.wristband.damage],
    ["Ride home", draft.wristband.rideHome],
  ].filter(([, v]) => v);
  return (
    <section className="mt-12">
      <h2 className="display text-3xl text-pink">The draft (version {draft.version})</h2>
      <p className="mt-2 text-dim">Read it, leave notes, approve it when it&apos;s right. Check that nobody&apos;s real name slipped in.</p>
      <div className="mt-6 rounded-md border border-line bg-night-2 p-5 sm:p-8">
        <h3 className="display text-[clamp(2rem,7vw,3.5rem)]">{draft.title}</h3>
        {draft.dek && <p className="mt-3 text-xl">{draft.dek}</p>}
        {facts.length > 0 && (
          <dl className="mt-5 grid gap-3 rounded border-2 border-dashed border-maize p-4 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="mono text-maize">{k}</dt>
                <dd className="mt-1">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-6">{body}</div>
      </div>

      {wrote && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={approveAction.pending}
            onClick={() => approveAction.run(() => setApproval(token, draft.version, !draft.approvedByMe), draft.approvedByMe ? "Approval taken back." : "Approved.")}
            className={`rounded-full px-6 py-3 font-bold ${draft.approvedByMe ? "border border-maize text-maize" : "bg-maize text-night hover:bg-ink"}`}
          >
            {draft.approvedByMe ? "Take back my approval" : "Approve this draft"}
          </button>
          <span className="text-dim">{draft.approvals} approved so far</span>
          {approveAction.msg && <span className={approveAction.msg.ok ? "text-maize" : "text-pink"}>{approveAction.msg.text}</span>}
        </div>
      )}

      <div className="mt-8">
        <h3 className="font-bold">Notes on this draft</h3>
        {draft.notes.length ? (
          <ul className="mt-3 space-y-2">
            {draft.notes.map((n, i) => (
              <li key={i} className="rounded bg-night-2 p-3">
                <span className="mono text-maize">{n.nickname ?? "Admin"}</span> <span>{n.body}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-dim">No notes yet.</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_1fr]">
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} aria-label="Your nickname" placeholder="Nickname" className="field" />
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} aria-label="Your note" placeholder='"I did NOT cry at Taco Bell"' className="field" />
        </div>
        <button
          type="button"
          disabled={noteAction.pending}
          onClick={() => noteAction.run(async () => { const r = await addNote(token, draft.version, nickname, note); if (r && "ok" in r) setNote(""); return r; }, "Note added.")}
          className="mt-3 rounded-full border border-ink px-5 py-2 font-bold hover:border-maize hover:text-maize"
        >
          Add note
        </button>
        {noteAction.msg && <p role="status" className={`mt-2 ${noteAction.msg.ok ? "text-maize" : "text-pink"}`}>{noteAction.msg.text}</p>}
      </div>
    </section>
  );
}

function Album({ token, items }: { token: string; items: Array<{ key: string; kind: string; nickname: string | null }> }) {
  if (!items.length) return null;
  const file = (k: string) => `/api/drop/${token}/file/${k}`;
  return (
    <section className="mt-12">
      <h2 className="display text-3xl">The album</h2>
      <p className="mt-2 text-dim">{items.length} {items.length === 1 ? "file" : "files"}. Anyone with this link can see and download them, so don&apos;t forward it around.</p>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((m) => (
          <li key={m.key} className="overflow-hidden rounded bg-night-2">
            {m.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file(m.key)} alt={m.nickname ? `From ${m.nickname}` : "From the night"} loading="lazy" className="aspect-square w-full object-cover" />
            ) : m.kind === "video" ? (
              <video src={file(m.key)} controls playsInline preload="none" className="aspect-square w-full bg-black object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center p-3"><audio src={file(m.key)} controls preload="none" className="w-full" /></div>
            )}
            <div className="flex items-center justify-between gap-2 p-2 text-sm">
              <span className="truncate text-dim">{m.nickname ?? ""}</span>
              <a href={`${file(m.key)}?dl=1`} className="mono shrink-0 text-maize underline underline-offset-4">Download</a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DropClient(props: {
  token: string;
  phase: Phase;
  verified: boolean;
  siteKey: string;
  rsvp: { nickname: string; answer: string } | null;
  account: { nickname: string; body: string } | null;
  accountCount: number;
  album: Array<{ key: string; kind: string; nickname: string | null }>;
  draft: Draft | null;
  draftBody: ReactNode;
}) {
  const { token, phase, verified } = props;
  const canAct = phase !== "dropped";
  return (
    <>
      {canAct && !verified && <Turnstile token={token} siteKey={props.siteKey} />}
      {verified && phase === "invite" && <Rsvp token={token} current={props.rsvp} />}
      {verified && phase === "live" && <Uploader token={token} />}
      {verified && (phase === "live" || phase === "after") && <Account token={token} account={props.account} count={props.accountCount} />}
      {verified && props.draft && <Review token={token} draft={props.draft} body={props.draftBody} wrote={Boolean(props.account)} />}
      {phase !== "invite" && <Album token={token} items={props.album} />}
    </>
  );
}
