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

/** Shared button looks. Every tap target is at least 48px tall for thumbs. */
const BTN_PRIMARY = "inline-flex min-h-12 items-center justify-center rounded-full bg-maize px-6 py-3 font-bold text-night hover:bg-ink disabled:opacity-60";
const BTN_GHOST = "inline-flex min-h-12 items-center justify-center rounded-full border border-ink px-5 py-3 font-bold hover:border-maize hover:text-maize disabled:opacity-60";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Turnstile({ token, siteKey, phase }: { token: string; siteKey: string; phase: Phase }) {
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
  const unlocks =
    phase === "invite" ? "then you can RSVP." : phase === "live" ? "then you can drop photos and tell your side." : "then you can read the draft and add yours.";
  return (
    <div className="mt-8 rounded-md border border-maize/60 bg-night-2 p-5">
      <p className="mono text-maize">Step 1 · one tap</p>
      <p className="mt-2 text-lg font-bold leading-snug">Quick check that you&apos;re a person, {unlocks}</p>
      <p className="mt-1 text-sm text-dim">No sign-up, no name. Your phone just remembers you for this night.</p>
      <div ref={box} className="mt-4 min-h-[65px] max-w-full overflow-hidden" />
      {error && <p role="alert" className="mt-2 text-pink">{error}</p>}
    </div>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ error: string } | { ok: true; waitlisted?: boolean } | undefined>, okText: string) =>
    start(async () => {
      const r = await fn();
      if (r && "error" in r) setMsg({ ok: false, text: r.error });
      else if (r && "waitlisted" in r && r.waitlisted) setMsg({ ok: true, text: "It's full, so you're on the waitlist. You'll move up automatically if a spot opens." });
      else setMsg({ ok: true, text: okText });
    });
  return { pending, msg, run };
}

type MyRsvp = { nickname: string; answer: string; plusOnes: number; waitlisted: boolean };
type GuestInfo = { maxPlusOnes: number; spotsLeft: number | null; waitlist: number };

function Rsvp({ token, current, info }: { token: string; current: MyRsvp | null; info: GuestInfo }) {
  const [nickname, setNickname] = useState(current?.nickname ?? "");
  const [plus, setPlus] = useState(current?.plusOnes ?? 0);
  const { pending, msg, run } = useAction();
  const choices = [
    ["going", "I'm in"],
    ["maybe", "Maybe"],
    ["cant", "Can't make it"],
  ] as const;
  const currentLabel = choices.find(([v]) => v === current?.answer)?.[1];
  const full = info.spotsLeft === 0 && !(current?.answer === "going" && !current.waitlisted);
  const send = (value: string) =>
    run(async () => {
      const r = await rsvp(token, nickname, value, value === "going" ? plus : 0);
      return r;
    }, value === "cant" ? "Got it. Next time." : value === "maybe" ? "Marked as maybe." : "You're in.");
  return (
    <section id="rsvp" className="mt-8 scroll-mt-4 rounded-md border border-line bg-night-2 p-5">
      <h2 className="display text-3xl">Are you coming?</h2>
      {current && currentLabel ? (
        <p className="mt-2 text-dim">
          {current.answer === "going" && current.waitlisted ? (
            <>You&apos;re on the <span className="font-bold text-pink">waitlist</span> as {current.nickname}. If a spot opens up, you&apos;re in automatically.</>
          ) : (
            <>You said <span className="font-bold text-maize">{currentLabel}</span> as {current.nickname}{current.plusOnes ? ` +${current.plusOnes}` : ""}. Tap another answer to change it.</>
          )}
        </p>
      ) : (
        <p className="mt-2 text-dim">Add your name or a nickname and tap an answer. That&apos;s it.</p>
      )}
      {info.spotsLeft !== null && (
        <p className={`mono mt-3 ${info.spotsLeft ? "text-maize" : "text-pink"}`}>
          {info.spotsLeft ? `${info.spotsLeft} ${info.spotsLeft === 1 ? "spot" : "spots"} left` : `Full${info.waitlist ? ` · ${info.waitlist} on the waitlist` : ""}`}
        </p>
      )}
      <label htmlFor="rsvp-nick" className="mt-4 block font-bold">Your name or nickname</label>
      <input
        id="rsvp-nick"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={40}
        autoComplete="nickname"
        enterKeyHint="done"
        className="field mt-2 min-h-12 sm:w-72"
        placeholder="Whatever you want to go by"
      />
      {info.maxPlusOnes >= 99 && (
        <div className="mt-4">
          <span id="plus-label" className="block font-bold">Bringing anyone?</span>
          <div className="mt-2 flex items-center gap-3" aria-labelledby="plus-label">
            <button type="button" aria-label="One fewer" onClick={() => setPlus((p) => Math.max(0, p - 1))} disabled={plus === 0} className="grid h-12 w-12 place-items-center rounded-full border border-line text-2xl font-bold hover:border-maize disabled:opacity-40">−</button>
            <span role="status" className="min-w-24 text-center text-lg font-bold">{plus === 0 ? "Just me" : `Me +${plus}`}</span>
            <button type="button" aria-label="One more" onClick={() => setPlus((p) => Math.min(50, p + 1))} disabled={plus >= 50} className="grid h-12 w-12 place-items-center rounded-full border border-line text-2xl font-bold hover:border-maize disabled:opacity-40">+</button>
          </div>
        </div>
      )}
      {info.maxPlusOnes > 0 && info.maxPlusOnes < 99 && (
        <div className="mt-4">
          <span id="plus-label" className="block font-bold">Bringing anyone?</span>
          <div role="radiogroup" aria-labelledby="plus-label" className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: info.maxPlusOnes + 1 }, (_, n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={plus === n}
                onClick={() => setPlus(n)}
                className={`min-h-11 min-w-14 rounded-full border px-4 font-bold ${plus === n ? "border-maize bg-maize text-night" : "border-line hover:border-maize"}`}
              >
                {n === 0 ? "Just me" : `+${n}`}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {choices.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            aria-pressed={current?.answer === value}
            onClick={() => send(value)}
            className={`min-h-12 rounded-full border px-3 py-2 font-bold leading-tight disabled:opacity-60 sm:px-5 ${
              current?.answer === value ? "border-maize bg-maize text-night" : "border-ink hover:border-maize hover:text-maize"
            }`}
          >
            {value === "going" && full ? "Join waitlist" : label}
          </button>
        ))}
      </div>
      {(pending || msg) && (
        <p role="status" aria-live="polite" className={`mt-3 ${pending ? "text-dim" : msg?.ok ? "text-maize" : "text-pink"}`}>
          {pending ? "Saving…" : msg?.text}
        </p>
      )}
    </section>
  );
}

/** Keeps a guest's spot when the invite was opened inside Snapchat/Instagram etc. */
function SaveSpot({ me }: { me: { path: string; ics: string; google: string } }) {
  const [copied, setCopied] = useState(false);
  const [env, setEnv] = useState<{ inApp: boolean; ios: boolean; android: boolean; url: string }>({ inApp: false, ios: false, android: false, url: me.path });
  useEffect(() => {
    const ua = navigator.userAgent;
    setEnv({
      inApp: /Snapchat|Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Twitter|LinkedInApp|Line\//i.test(ua),
      ios: /iPhone|iPad|iPod/i.test(ua),
      android: /Android/i.test(ua),
      url: `${location.origin}${me.path}`,
    });
  }, [me.path]);
  const openOut = env.ios
    ? `x-safari-${env.url}`
    : env.android
      ? `intent://${env.url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`
      : env.url;
  async function copy() {
    try {
      await navigator.clipboard.writeText(env.url);
      setCopied(true);
    } catch {
      window.prompt("Copy your link:", env.url);
    }
  }
  const btn = "inline-flex min-h-11 items-center justify-center rounded-full border border-ink px-4 text-sm font-bold hover:border-maize hover:text-maize";
  return (
    <section aria-labelledby="spot-h" className="mt-6 rounded-md border-2 border-dashed border-maize p-5">
      <h2 id="spot-h" className="display text-2xl">Save your spot</h2>
      <p className="mt-2 text-dim">
        {env.inApp
          ? "You opened this inside an app, and it might forget you. Save your personal link so you're ready on the night: it gets you back in as you, from any phone or browser."
          : "Your personal link gets you back in as you, from any phone or browser. Save it so you're ready on the night."}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a href={me.ics} className={btn}>Add to calendar (iPhone/Outlook)</a>
        <a href={me.google} target="_blank" rel="noopener noreferrer" className={btn}>Add to Google Calendar</a>
        <button type="button" onClick={copy} className={btn}>{copied ? "Copied" : "Copy my link"}</button>
        {env.inApp && (env.ios || env.android) && (
          <a href={openOut} className={`${btn} border-maize bg-maize text-night hover:bg-ink hover:text-night`}>
            Open in {env.ios ? "Safari" : "Chrome"}
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-dim">Don&apos;t share this one: it signs in as you. Share the regular invite instead.</p>
    </section>
  );
}

/** Small, capped Claude help for a guest's story. Suggestions only replace the text on "Use this". */
function GuestClaude({ token, text, onUse }: { token: string; text: string; onUse: (t: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [s, setS] = useState<{ text: string; headsUp: string[] } | null>(null);
  const modes = [
    ["polish", "Clean it up"],
    ["funnier", "Make it funnier"],
    ["story", "Turn my notes into a story"],
  ] as const;
  async function ask(mode: string) {
    setBusy(mode);
    setErr(null);
    setS(null);
    try {
      const res = await fetch(`/api/drop/${token}/assist`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, text }) });
      const data = (await res.json().catch(() => ({}))) as { text?: string; headsUp?: string[]; left?: number; error?: string };
      if (typeof data.left === "number") setLeft(data.left);
      if (!res.ok || !data.text) setErr(data.error ?? "Claude couldn't help with that one.");
      else setS({ text: data.text, headsUp: data.headsUp ?? [] });
    } catch {
      setErr("Couldn't reach Claude. Check your connection.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-3 rounded-md border border-dashed border-pink/60 p-3">
      <p className="text-sm"><span className="mono text-pink">Ask Claude</span> <span className="text-dim">{left === null ? "A few tries per person." : `${left} ${left === 1 ? "try" : "tries"} left.`}</span></p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {modes.map(([m, label]) => (
          <button key={m} type="button" disabled={Boolean(busy) || text.trim().length < 10 || left === 0} onClick={() => ask(m)} className="min-h-11 rounded-full border border-line px-3 text-sm font-bold hover:border-pink disabled:opacity-50">
            {busy === m ? "Working…" : label}
          </button>
        ))}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-pink">{err}</p>}
      {s && (
        <div className="mt-3 rounded bg-night p-3">
          {s.headsUp.length > 0 && <ul className="mb-2 space-y-1 text-sm text-maize">{s.headsUp.map((h, i) => <li key={i}>{h}</li>)}</ul>}
          <p className="whitespace-pre-wrap leading-relaxed">{s.text}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { onUse(s.text); setS(null); }} className="min-h-11 rounded-full bg-pink px-5 font-bold text-night">Use this</button>
            <button type="button" onClick={() => setS(null)} className="min-h-11 rounded-full border border-ink px-4 font-bold">Keep mine</button>
          </div>
          <p className="mt-2 text-xs text-dim">Using it only changes the box above. Hit save to keep it.</p>
        </div>
      )}
    </div>
  );
}

type UploadItem = { id: string; name: string; progress: number; done: boolean; error?: string };

function Uploader({ token }: { token: string }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [nickname, setNickname] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [inView, setInView] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLLabelElement>(null);
  const patch = (id: string, p: Partial<UploadItem>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...p } : i)));

  // Show a thumb-reach bar at the bottom of the screen whenever the big upload button is off screen.
  useEffect(() => {
    const el = pick.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "0px 0px -80px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
  const failed = items.filter((i) => i.error).length;
  const active = items.length - done - failed;
  const overall = items.length ? items.reduce((s, i) => s + (i.done || i.error ? 1 : i.progress), 0) / items.length : 0;
  const summary = active
    ? `Uploading… ${done} of ${items.length} in`
    : done
      ? `Got it, ${plural(done, "file")} in.`
      : "Nothing went up.";

  return (
    <section id="photos" className="mt-8 scroll-mt-4">
      <h2 className="display text-3xl">Drop your photos and videos</h2>
      <p className="mt-2 text-dim">Straight from your camera roll. Pick as many as you want.</p>

      <label htmlFor="up-nick" className="mt-5 block font-bold">
        Name or nickname <span className="font-normal text-dim">(optional, for credit)</span>
      </label>
      <input
        id="up-nick"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={40}
        autoComplete="nickname"
        enterKeyHint="done"
        className="field mt-2 min-h-12 sm:w-72"
      />

      <label className={`mt-4 flex min-h-12 cursor-pointer items-start gap-3 rounded-md border bg-night-2 p-4 ${consent ? "border-maize" : "border-line"}`}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--maize)]" />
        <span>Everyone in these is cool with them going up, and I&apos;m 21+.</span>
      </label>

      <label
        ref={pick}
        className={`mt-4 flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-md bg-maize px-6 py-4 text-center text-night ${consent ? "hover:bg-ink" : "pointer-events-none opacity-50"}`}
      >
        <span className="text-lg font-bold">{items.length ? "Add more photos and videos" : "Add photos and videos"}</span>
        {!consent && <span className="mono mt-1">Tick the box above first</span>}
        <input id="up-files" ref={input} type="file" multiple accept={ACCEPT_ATTR} disabled={!consent} className="sr-only" onChange={(e) => add(e.target.files)} />
      </label>
      <p className="mt-2 text-sm text-dim">Photos get their location and camera info stripped before upload. Videos keep theirs.</p>

      {items.length > 0 && (
        <div className={`mt-5 rounded-md border p-4 ${!active && done ? "border-maize bg-maize/10" : "border-line bg-night-2"}`}>
          <p role="status" aria-live="polite" className={`display ${!active && done ? "text-2xl text-maize" : "text-xl"}`}>
            {summary}
          </p>
          {failed > 0 && <p className="mt-1 text-sm text-pink">{plural(failed, "file")} didn&apos;t make it. See below.</p>}
          {active > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded bg-night" aria-hidden>
              <div className="h-full bg-maize transition-[width]" style={{ width: `${overall * 100}%` }} />
            </div>
          )}
          {!active && done > 0 && <p className="mt-1 text-sm text-dim">Keep them coming. The album updates as people upload.</p>}
          <ul className="mt-3 space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded bg-night p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{i.name}</span>
                  <span className={`shrink-0 ${i.error ? "text-pink" : i.done ? "text-maize" : "text-dim"}`}>
                    {i.error ? "Failed" : i.done ? "Done ✓" : `${Math.round(i.progress * 100)}%`}
                  </span>
                </div>
                {i.error && <p className="mt-1 text-pink">{i.error}</p>}
                {!i.done && !i.error && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-night-2">
                    <div className="h-full bg-maize transition-[width]" style={{ width: `${i.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sticky bottom bar: one-thumb access to uploading (and its progress) from anywhere on the page. */}
      {!inView && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t sm:hidden border-line bg-night/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {active > 0 ? (
              <a href="#photos" className="flex min-h-12 flex-1 flex-col justify-center">
                <span className="font-bold">{summary}</span>
                <span className="mt-1 h-1.5 overflow-hidden rounded bg-night-2">
                  <span className="block h-full bg-maize transition-[width]" style={{ width: `${overall * 100}%` }} />
                </span>
              </a>
            ) : consent ? (
              <label htmlFor="up-files" className={`${BTN_PRIMARY} flex-1 cursor-pointer text-lg`}>
                {done ? `Add more · ${done} in` : "Add photos and videos"}
              </label>
            ) : (
              <a href="#photos" className={`${BTN_PRIMARY} flex-1 text-lg`}>
                Add photos and videos
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Account({ token, account, defaultName, count }: { token: string; account: { nickname: string; body: string } | null; defaultName: string; count: number }) {
  const [nickname, setNickname] = useState(account?.nickname ?? defaultName);
  const [body, setBody] = useState(account?.body ?? "");
  const { pending, msg, run } = useAction();
  return (
    <section id="story" className="mt-14 scroll-mt-4">
      <h2 className="display text-3xl">Your side of the story</h2>
      <p className="mt-2 text-dim">
        What happened, from where you were standing. Times, prices, the line, who did what. Use nicknames for other people unless they said yes. Claude stitches everyone&apos;s version into one post.
      </p>
      {count > 0 && <p className="mono mt-3 text-maize">{plural(count, "account")} in so far</p>}
      <label htmlFor="acct-nick" className="mt-5 block font-bold">Your name or nickname <span className="font-normal text-dim">(this is what shows up)</span></label>
      <input
        id="acct-nick"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={40}
        autoComplete="nickname"
        className="field mt-2 min-h-12 sm:w-72"
        placeholder="The only name that shows up"
      />
      <label htmlFor="acct-body" className="mt-4 block font-bold">The night, according to you</label>
      <textarea
        id="acct-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        maxLength={4000}
        className="field mt-2 leading-relaxed"
        placeholder="We got there at 10:40, which everyone agreed was too early…"
      />
      <p className="mt-1 text-right text-xs text-dim">{body.length} / 4000</p>
      <GuestClaude token={token} text={body} onUse={setBody} />
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => saveAccount(token, nickname, body), account ? "Updated." : "Saved. You can edit it until the post drops.")}
        className={`${BTN_PRIMARY} mt-2 w-full sm:w-auto`}
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
    <section id="draft" className="mt-14 scroll-mt-4">
      <p className="mono text-pink">Claude&apos;s draft · version {draft.version}</p>
      <h2 className="display mt-2 text-3xl">Is this how it went?</h2>
      <p className="mt-2 text-dim">Read it, leave notes, approve it when it&apos;s right. Check that nobody&apos;s real name slipped in.</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="mono text-maize">
          {plural(draft.approvals, "approval")} · {plural(draft.notes.length, "note")}
        </span>
        <a href="#review" className="mono inline-flex min-h-11 items-center text-ink underline underline-offset-4">
          Skip to {wrote ? "approve and notes" : "notes"} ↓
        </a>
      </p>
      <div className="mt-4 rounded-md border border-line bg-night-2 p-4 sm:p-8">
        <h3 className="display text-[clamp(2rem,9vw,3.5rem)] break-words">{draft.title}</h3>
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
        <div className="mt-6 break-words">{body}</div>
      </div>

      <div id="review" className="mt-6 scroll-mt-4 rounded-md border border-line p-4 sm:p-5">
        {wrote ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={approveAction.pending}
              onClick={() => approveAction.run(() => setApproval(token, draft.version, !draft.approvedByMe), draft.approvedByMe ? "Approval taken back." : "Approved.")}
              className={draft.approvedByMe ? `${BTN_GHOST} w-full border-maize text-maize sm:w-auto` : `${BTN_PRIMARY} w-full sm:w-auto`}
            >
              {approveAction.pending ? "Saving…" : draft.approvedByMe ? "Take back my approval" : "Approve this draft"}
            </button>
            <span className="text-dim">
              {draft.approvedByMe ? "You approved this. " : ""}
              {plural(draft.approvals, "approval")} so far
            </span>
            {approveAction.msg && (
              <span role="status" className={approveAction.msg.ok ? "text-maize" : "text-pink"}>
                {approveAction.msg.text}
              </span>
            )}
          </div>
        ) : (
          <p className="text-dim">
            Approving is for people who wrote their side.{" "}
            <a href="#story" className="text-maize underline underline-offset-4">Add yours</a> and the approve button shows up here.
          </p>
        )}

        <h3 className="mt-6 font-bold">Notes on this draft</h3>
        {draft.notes.length ? (
          <ul className="mt-3 space-y-2">
            {draft.notes.map((n, i) => (
              <li key={i} className="rounded bg-night-2 p-3">
                <p className="mono text-maize">{n.nickname ?? "Admin"}</p>
                <p className="mt-1 break-words">{n.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-dim">No notes yet. Something wrong? Say so.</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_1fr]">
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} aria-label="Your name or nickname" placeholder="Name or nickname" autoComplete="nickname" className="field min-h-12" />
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} aria-label="Your note" placeholder='"I did NOT cry at Taco Bell"' enterKeyHint="send" className="field min-h-12" />
        </div>
        <button
          type="button"
          disabled={noteAction.pending}
          onClick={() => noteAction.run(async () => { const r = await addNote(token, draft.version, nickname, note); if (r && "ok" in r) setNote(""); return r; }, "Note added.")}
          className={`${BTN_GHOST} mt-3 w-full sm:w-auto`}
        >
          {noteAction.pending ? "Adding…" : "Add note"}
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
    <section id="album" className="mt-14 scroll-mt-4">
      <h2 className="display text-3xl">The album</h2>
      <p className="mt-2 text-dim">
        {plural(items.length, "file")}. Anyone with this link can see and download them.
      </p>
      <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {items.map((m) => (
          <li key={m.key} className="min-w-0 overflow-hidden rounded bg-night-2">
            {m.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file(m.key)} alt={m.nickname ? `From ${m.nickname}` : "From the night"} loading="lazy" className="aspect-square w-full object-cover" />
            ) : m.kind === "video" ? (
              <video src={file(m.key)} controls playsInline preload="none" className="aspect-square w-full bg-black object-cover" />
            ) : (
              <div className="grid aspect-square place-items-center p-3"><audio src={file(m.key)} controls preload="none" className="w-full" /></div>
            )}
            <div className="flex items-center justify-between gap-1 pl-2 text-sm">
              <span className="min-w-0 truncate text-dim">{m.nickname ?? ""}</span>
              <a
                href={`${file(m.key)}?dl=1`}
                aria-label={`Download ${m.kind}${m.nickname ? ` from ${m.nickname}` : ""}`}
                className="mono inline-flex min-h-11 shrink-0 items-center px-2 text-maize underline underline-offset-4"
              >
                Save ↓
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Jump links for the long live/after page, so nobody has to scroll-hunt one-handed. */
function JumpNav({ links }: { links: Array<[string, string]> }) {
  if (links.length < 2) return null;
  return (
    <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <a key={href} href={href} className="mono inline-flex min-h-11 items-center rounded-full border border-line bg-night-2 px-3 hover:border-maize hover:text-maize">
          {label}
        </a>
      ))}
    </nav>
  );
}

export function DropClient(props: {
  token: string;
  phase: Phase;
  verified: boolean;
  siteKey: string;
  rsvp: MyRsvp | null;
  guestInfo: GuestInfo;
  account: { nickname: string; body: string } | null;
  me: { path: string; ics: string; google: string } | null;
  accountCount: number;
  album: Array<{ key: string; kind: string; nickname: string | null }>;
  draft: Draft | null;
  draftBody: ReactNode;
}) {
  const { token, phase, verified } = props;
  const canAct = phase !== "dropped";
  const showAccount = verified && (phase === "live" || phase === "after");
  const showDraft = verified && Boolean(props.draft);
  const showAlbum = phase !== "invite" && props.album.length > 0;
  const jump: Array<[string, string]> = [];
  if (verified && phase === "live") jump.push(["#photos", "Photos"]);
  // After the night, the draft is the thing to act on, so it goes first.
  const draftFirst = phase === "after";
  if (showDraft && draftFirst) jump.push(["#draft", "Draft"]);
  if (showAccount) jump.push(["#story", "Your side"]);
  if (showDraft && !draftFirst) jump.push(["#draft", "Draft"]);
  if (showAlbum) jump.push(["#album", "Album"]);
  const review = showDraft ? <Review token={token} draft={props.draft!} body={props.draftBody} wrote={Boolean(props.account)} /> : null;
  return (
    <>
      {canAct && !verified && <Turnstile token={token} siteKey={props.siteKey} phase={phase} />}
      {verified && phase === "invite" && <Rsvp token={token} current={props.rsvp} info={props.guestInfo} />}
      {verified && canAct && props.me && <SaveSpot me={props.me} />}
      {verified && phase !== "invite" && <JumpNav links={jump} />}
      {verified && phase === "live" && <Uploader token={token} />}
      {showDraft && draftFirst && review}
      {showAccount && <Account token={token} account={props.account} defaultName={props.rsvp?.nickname ?? ""} count={props.accountCount} />}
      {showDraft && !draftFirst && review}
      {phase !== "invite" && <Album token={token} items={props.album} />}
      {/* Room so the sticky upload bar never covers the last thing on the page. */}
      {verified && phase === "live" && <div aria-hidden className="h-24 sm:hidden" />}
    </>
  );
}
