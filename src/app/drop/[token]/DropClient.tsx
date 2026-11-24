"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { soundcloudSearch, spotifySearch } from "@/lib/tracks";
import { browserEnv, browserName, openOutHref, type BrowserEnv } from "@/lib/in-app";
import { linkDomain, type Venue } from "@/lib/venues";
import { addNote, rsvp, saveAccount, setApproval, addGuestSongs, addGuestSongPick, removeGuestSong, addGuestPlace, removeGuestPlace, setUploadCaption, setGuestEmail, removeGuestEmail } from "@/app/drop/actions";
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
  const [stuck, setStuck] = useState(false);
  const [env, setEnv] = useState<BrowserEnv | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setEnv(browserEnv()), []);
  useEffect(() => {
    // If the check hasn't shown up or finished in 10s (common in some in-app browsers), say so.
    setStuck(false);
    const t = setTimeout(() => {
      // Turnstile draws into a shadow root, so check that it loaded and drew something at all.
      if (!window.turnstile || !box.current?.childElementCount) setStuck(true);
    }, 10000);
    const id = "cf-turnstile-script";
    const render = () => {
      if (!box.current || !window.turnstile || box.current.childElementCount) return;
      window.turnstile.render(box.current, {
        sitekey: siteKey,
        theme: "dark",
        "error-callback": () => setStuck(true),
        "timeout-callback": () => setStuck(true),
        callback: async (t: string) => {
          setStuck(false);
          const res = await fetch(`/api/drop/${token}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turnstile: t }) });
          if (res.ok) router.refresh();
          else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't verify. Reload and try again.");
        },
      });
    };
    if (window.turnstile) {
      render();
      return () => clearTimeout(t);
    }
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = id;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.addEventListener("error", () => setStuck(true));
      document.head.appendChild(s);
    }
    s.addEventListener("load", render);
    return () => {
      clearTimeout(t);
      s?.removeEventListener("load", render);
    };
  }, [token, siteKey, router, attempt]);
  const retry = () => {
    if (box.current) box.current.innerHTML = "";
    setError(null);
    setAttempt((a) => a + 1);
  };
  const unlocks =
    phase === "invite" ? "then you can RSVP." : phase === "live" ? "then you can drop photos and tell your side." : "then you can read the draft and add yours.";
  return (
    <div className="mt-8 rounded-md border border-maize/60 bg-night-2 p-5">
      <p className="mono text-maize">Step 1 · one tap</p>
      <p className="mt-2 text-lg font-bold leading-snug">Quick check that you&apos;re a person, {unlocks}</p>
      <p className="mt-1 text-sm text-dim">No sign-up, no name. Your phone just remembers you for this night.</p>
      <div ref={box} className="mt-4 min-h-[65px] max-w-full overflow-hidden" />
      {error && <p role="alert" className="mt-2 text-pink">{error}</p>}
      {stuck && (
        <div role="alert" className="mt-3 rounded border border-pink/60 bg-pink/10 p-3">
          <p className="font-bold">The check isn&apos;t loading{env?.inApp ? ` inside ${env.inApp}` : ""}.</p>
          <p className="mt-1 text-sm text-dim">
            {env?.inApp ? `Open the link in ${browserName(env)} and it'll work. ` : "Check your connection. "}
            Or tap ••• → &quot;Open in browser&quot;.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {env && (env.ios || env.android) && (
              <a href={openOutHref(location.href.split("#")[0], env)} className="inline-flex min-h-11 items-center rounded-full bg-maize px-5 font-bold text-night">
                Open in {browserName(env)}
              </a>
            )}
            <button type="button" onClick={retry} className="inline-flex min-h-11 items-center rounded-full border border-ink px-4 font-bold">Try again</button>
          </div>
        </div>
      )}
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

type MyRsvp = { nickname: string; answer: string; waitlisted: boolean };
type GuestInfo = { spotsLeft: number | null; waitlist: number };

function Rsvp({ token, current, info }: { token: string; current: MyRsvp | null; info: GuestInfo }) {
  const [nickname, setNickname] = useState(current?.nickname ?? "");
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
      const r = await rsvp(token, nickname, value);
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
            <>You said <span className="font-bold text-maize">{currentLabel}</span> as {current.nickname}. Tap another answer to change it.</>
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

/** Guests suggest places with an optional website. Links only show once a host approves them. */
function GuestPlaces({ token, places }: { token: string; places: { approved: Venue[]; mine: Array<{ id: string; name: string; url: string | null; kind: string }> } }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("party");
  const { pending, msg, run } = useAction();
  return (
    <section id="places" aria-labelledby="places-h" className="mt-10 scroll-mt-4">
      <h2 id="places-h" className="display text-3xl">Where we went</h2>
      <p className="mt-2 text-dim">Add the bars, parties and food spots. A host checks each one before it goes on the post and the Places tab.</p>
      {places.approved.length > 0 && (
        <ul className="mt-3 space-y-1">
          {places.approved.map((v, i) => (
            <li key={i}>
              {v.url ? (
                <a href={v.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-bold underline underline-offset-4 hover:text-maize">{v.name}</a>
              ) : (
                <strong>{v.name}</strong>
              )}
              {v.url && <span className="mono text-xs text-dim"> {linkDomain(v.url)}</span>}
              <span className="mono text-xs text-dim"> · {v.kind === "eat" ? "Eat" : "Party"}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 space-y-2 rounded-md border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await addGuestPlace(token, name, url, kind);
            if (r && "ok" in r) { setName(""); setUrl(""); }
            return r;
          }, "Added. A host will check it.");
        }}
      >
        <label htmlFor="place-name" className="block text-sm font-bold">Place</label>
        <input id="place-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" placeholder="Rick's" className="field" />
        <label htmlFor="place-url" className="block text-sm font-bold">Website (optional)</label>
        <input id="place-url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={300} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="rickscafe.com" className="field" />
        <div role="radiogroup" aria-label="Kind of place" className="flex gap-2 pt-1">
          {[["party", "Party"], ["eat", "Eat"]].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)} className={`min-h-11 rounded-full border px-5 font-bold ${kind === v ? "border-maize bg-maize text-night" : "border-ink hover:border-maize"}`}>{l}</button>
          ))}
          <button disabled={pending || !name.trim()} className="ml-auto min-h-11 rounded-full bg-maize px-5 font-bold text-night hover:bg-ink disabled:opacity-60">{pending ? "Adding…" : "Add place"}</button>
        </div>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-maize" : "text-pink"}`}>{msg.text}</p>}
      </form>
      {places.mine.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded border border-line">
          {places.mine.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate"><strong>{p.name}</strong> <span className="text-sm text-dim">waiting for a host{p.url ? ` · ${linkDomain(p.url)}` : ""}</span></span>
              <button type="button" disabled={pending} onClick={() => run(() => removeGuestPlace(token, p.id), "Removed.")} className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-dim underline hover:text-pink">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type GuestSong = { id: string; title: string; artist: string | null; mine: boolean };

/** Guests type songs for the night's playlist; the Spotify/SoundCloud links are built here, never typed. */
function GuestSongs({ token, songs }: { token: string; songs: GuestSong[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ title: string; artist: string; art: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");
  const { pending, msg, run } = useAction();
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setSearched("");
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/drop/${token}/song-search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const d = (await res.json().catch(() => ({}))) as { results?: Array<{ title: string; artist: string; art: string | null }> };
        setHits(d.results ?? []);
        setSearched(term);
      } catch {
        // aborted or offline: keep what's there
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, token]);
  const pick = (title: string, artist: string) =>
    run(async () => {
      const r = await addGuestSongPick(token, title, artist);
      if (r && "ok" in r) {
        setQ("");
        setHits([]);
      }
      return r;
    }, `Added ${title}.`);
  const typed = () =>
    run(async () => {
      const r = await addGuestSongs(token, q);
      if (r && "ok" in r) {
        setQ("");
        setHits([]);
      }
      return r;
    }, "Added.");
  return (
    <section id="songs" aria-labelledby="songs-h" className="mt-10 scroll-mt-4">
      <h2 id="songs-h" className="display text-3xl">Songs of the night</h2>
      <p className="mt-2 text-dim">Search what played and tap it. They end up on the post&apos;s playlist with Spotify and SoundCloud buttons.</p>
      <div className="mt-3">
        <label htmlFor="song-in" className="sr-only">Search for a song</label>
        <input
          id="song-in"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (hits[0]) pick(hits[0].title, hits[0].artist);
            }
          }}
          placeholder="Search a song or artist"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={80}
          className="field"
        />
        {searching && <p className="mt-2 text-sm text-dim">Searching…</p>}
        {hits.length > 0 && (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded border border-line" aria-label="Results">
            {hits.map((h) => (
              <li key={`${h.artist}|${h.title}`}>
                <button type="button" disabled={pending} onClick={() => pick(h.title, h.artist)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-night-2 disabled:opacity-60">
                  {h.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.art} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-sm object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="h-11 w-11 shrink-0 rounded-sm bg-night-2" />
                  )}
                  <span className="min-w-0">
                    <strong className="block truncate">{h.title}</strong>
                    <span className="block truncate text-sm text-dim">{h.artist}</span>
                  </span>
                  <span className="mono ml-auto shrink-0 text-maize">Add</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!searching && searched && searched === q.trim() && (
          <button type="button" disabled={pending} onClick={typed} className="mt-2 inline-flex min-h-11 items-center text-sm text-dim underline underline-offset-4 hover:text-maize">
            {hits.length ? `Not there? Add "${q.trim()}" as typed` : `No matches. Add "${q.trim()}" as typed`}
          </button>
        )}
      </div>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-maize" : "text-pink"}`}>{msg.text}</p>}
      {songs.length > 0 && (
        <ol className="mt-4 divide-y divide-line rounded border border-line">
          {songs.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                <strong>{s.title}</strong>
                {s.artist && <span className="text-dim"> · {s.artist}</span>}
              </span>
              <a href={spotifySearch(s)} target="_blank" rel="noopener noreferrer" className="mono inline-flex min-h-11 shrink-0 items-center px-1 text-xs text-dim hover:text-maize">Spotify</a>
              <a href={soundcloudSearch(s)} target="_blank" rel="noopener noreferrer" className="mono inline-flex min-h-11 shrink-0 items-center px-1 text-xs text-dim hover:text-maize">SoundCloud</a>
              {s.mine && (
                <button type="button" disabled={pending} onClick={() => run(() => removeGuestSong(token, s.id), "Removed.")} className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-dim underline hover:text-pink">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Lets anyone pass the invite on: the phone's share sheet, or copy as a fallback. Always the plain invite link. */
function ShareInvite({ token, name, rsvped }: { token: string; name: string; rsvped: boolean }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${location.origin}/drop/${token}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `You're invited: ${name}`, text: `You're invited: ${name}`, url });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy the invite link:", url);
    }
  }
  return (
    <section aria-label="Share the invite" className="mt-6 flex flex-col items-start gap-2 rounded-md border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-dim">{rsvped ? "Bringing people? Send them the invite so they can RSVP themselves." : "Know someone who should come? Send them the invite."}</p>
      <button type="button" onClick={share} className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-pink px-6 font-bold text-night hover:bg-ink">
        {copied ? "Link copied" : "Share the invite"}
      </button>
    </section>
  );
}

/** Keeps a guest's spot when the invite was opened inside Snapchat/Instagram etc. */
function SaveSpot({ token, me, emailHint }: { token: string; me: { path: string }; emailHint: string | null }) {
  const [copied, setCopied] = useState(false);
  const [inApp, setInApp] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(!emailHint);
  const [hint, setHint] = useState(emailHint);
  const { pending, msg, run } = useAction();
  useEffect(() => setInApp(browserEnv().inApp), []);
  async function copy() {
    const url = `${location.origin}${me.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy your link:", url);
    }
  }
  return (
    <section aria-labelledby="spot-h" className={`mt-6 rounded-md border-2 p-5 ${hint ? "border-line" : "border-dashed border-maize"}`}>
      <h2 id="spot-h" className="display text-2xl">{hint ? "You're set" : "Get your link by email"}</h2>
      {hint && !editing ? (
        <p className="mt-2 text-dim">
          Your link and a reminder on the day go to <strong className="text-ink">{hint}</strong>. Open it from the email and you&apos;re back in as you.
        </p>
      ) : (
        <>
          <p className="mt-2 text-dim">
            {inApp
              ? `${inApp} doesn't always keep you signed in. Get your personal link by email and you can get back in from any phone or browser. Optional.`
              : "We'll email your personal link and a reminder on the day, so you can get back in from any phone or browser. Optional."}
          </p>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await setGuestEmail(token, email);
                if (r && "hint" in r) {
                  setHint(r.hint);
                  setEditing(false);
                  setEmail("");
                }
                return r;
              }, "Sent. Check your email (and spam, just in case).");
            }}
          >
            <label htmlFor="guest-email" className="sr-only">Your email</label>
            <input
              id="guest-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              maxLength={254}
              className="field sm:flex-1"
            />
            <button disabled={pending || !email.includes("@")} className={`${BTN_PRIMARY} shrink-0`}>
              {pending ? "Sending…" : "Email me my link"}
            </button>
          </form>
          <p className="mt-2 text-xs text-dim">Only used for this night: nobody else sees it, and it&apos;s deleted after the write-up goes up. Every email has unsubscribe.</p>
        </>
      )}
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-maize" : "text-pink"}`}>{msg.text}</p>}
      <div className="-mx-2 mt-2 flex flex-wrap">
        {hint && !editing && (
          <>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 items-center px-2 text-sm text-dim underline hover:text-maize">Change email</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(async () => { const r = await removeGuestEmail(token); if (r && "ok" in r) { setHint(null); setEditing(true); } return r; }, "Email removed.")}
              className="inline-flex min-h-11 items-center px-2 text-sm text-dim underline hover:text-pink"
            >
              Stop emails
            </button>
          </>
        )}
        <button type="button" onClick={copy} className="inline-flex min-h-11 items-center px-2 text-sm text-dim underline hover:text-maize">
          {copied ? "Copied. Don't share it: it signs in as you." : "Or copy my link"}
        </button>
      </div>
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

/**
 * The guest's side of the story. Autosaves twice over: to this phone as they
 * type (so a closed tab or a Snapchat reload never loses it) and to the
 * server a couple of seconds after they stop typing.
 */
function Account({ token, account, defaultName, count }: { token: string; account: { nickname: string; body: string } | null; defaultName: string; count: number }) {
  const key = `ftcu-story:${token}`;
  const [nickname, setNickname] = useState(account?.nickname ?? defaultName);
  const [body, setBody] = useState(account?.body ?? "");
  const [saved, setSaved] = useState({ nickname: account?.nickname ?? "", body: account?.body ?? "" });
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "local" | "error" | "restored"; text?: string }>({ kind: "idle" });
  const [hasSaved, setHasSaved] = useState(Boolean(account));
  const saving = useRef(false);

  // Bring back anything typed on this phone that never reached the server.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const local = JSON.parse(raw) as { nickname?: string; body?: string };
      if (local.body && local.body.trim() && local.body !== (account?.body ?? "")) {
        setBody(local.body);
        if (local.nickname) setNickname(local.nickname);
        setStatus({ kind: "restored", text: "Brought back what you were writing on this phone." });
      }
    } catch {
      // storage blocked: server autosave still works
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a copy on the phone on every keystroke.
  useEffect(() => {
    try {
      if (body.trim()) localStorage.setItem(key, JSON.stringify({ nickname, body }));
    } catch {
      // ignore
    }
  }, [key, nickname, body]);

  const save = useCallback(
    async (manual: boolean) => {
      const n = nickname.trim();
      const b = body.trim();
      if (saving.current) return;
      if (!manual && n === saved.nickname.trim() && b === saved.body.trim()) return;
      if (!n || b.length < 20) {
        if (manual) setStatus({ kind: "error", text: !n ? "Add your name or nickname first." : "Give us a little more than that. What actually happened?" });
        else if (b) setStatus({ kind: "local", text: !n ? "Saved on this phone. Add your name to save it for real." : "Saved on this phone. Keep going." });
        return;
      }
      saving.current = true;
      setStatus((prev) => ({ kind: "saving", text: prev.text?.startsWith("Brought back") ? prev.text : undefined }));
      try {
        const r = await saveAccount(token, nickname, body);
        if (r && "error" in r) setStatus({ kind: "error", text: r.error });
        else {
          setSaved({ nickname, body });
          setHasSaved(true);
          setStatus((prev) => ({
            kind: "saved",
            text: manual
              ? "Saved. You can keep editing until the post drops."
              : prev.kind === "restored" || prev.text?.startsWith("Brought back")
                ? "Brought back what you were writing on this phone, and saved it."
                : "Saved",
          }));
          try {
            localStorage.removeItem(key);
          } catch {
            // ignore
          }
        }
      } catch {
        setStatus({ kind: "local", text: "Couldn't reach the server. It's saved on this phone; we'll try again." });
      } finally {
        saving.current = false;
      }
    },
    [token, key, nickname, body, saved],
  );

  // Autosave 2.5s after they stop typing, and when they leave the page.
  useEffect(() => {
    const t = setTimeout(() => save(false), 2500);
    return () => clearTimeout(t);
  }, [nickname, body, save]);
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") save(false);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [save]);

  const color = status.kind === "error" ? "text-pink" : status.kind === "saving" || status.kind === "local" ? "text-dim" : "text-maize";
  return (
    <section id="story" className="mt-14 scroll-mt-4">
      <h2 className="display text-3xl">Your side of the story</h2>
      <p className="mt-2 text-dim">
        What happened, from where you were standing. Times, prices, the line, who did what. Use nicknames for other people unless they said yes. Claude stitches everyone&apos;s version into one post.
      </p>
      {count > 0 && <p className="mono mt-3 text-maize">{plural(count, "story", "stories")} in so far</p>}
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
        onBlur={() => save(false)}
        rows={6}
        maxLength={4000}
        className="field mt-2 leading-relaxed"
        placeholder="We got there at 10:40, which everyone agreed was too early…"
      />
      <div className="mt-1 flex items-start justify-between gap-3 text-xs">
        <p role="status" aria-live="polite" className={`min-w-0 ${color}`}>
          {status.kind === "saving" ? "Saving…" : status.text ?? "Saves automatically as you type."}
        </p>
        <p className="shrink-0 text-dim">{body.length} / 4000</p>
      </div>
      <GuestClaude token={token} text={body} onUse={setBody} />
      <button type="button" disabled={status.kind === "saving"} onClick={() => save(true)} className={`${BTN_PRIMARY} mt-2 w-full sm:w-auto`}>
        {status.kind === "saving" ? "Saving…" : hasSaved ? "Save changes" : "Save my story"}
      </button>
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

type AlbumItem = { key: string; kind: string; nickname: string | null; caption: string | null; mine: boolean };

/** A guest's caption on their own upload: saves when they leave the box or hit enter. */
function CaptionEdit({ token, item }: { token: string; item: AlbumItem }) {
  const [value, setValue] = useState(item.caption ?? "");
  const [saved, setSaved] = useState(item.caption ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  async function save() {
    if (value.trim() === saved.trim()) return;
    setState("saving");
    const r = await setUploadCaption(token, item.key, value);
    if (r && "error" in r) setState(r.error);
    else {
      setSaved(value);
      setState("saved");
    }
  }
  return (
    <div className="px-2 pb-2">
      <label htmlFor={`cap-${item.key}`} className="sr-only">Caption your {item.kind}</label>
      <input
        id={`cap-${item.key}`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        maxLength={200}
        enterKeyHint="done"
        placeholder="Add a caption"
        className="w-full rounded border border-line bg-night px-2 py-2 text-sm focus:border-maize"
      />
      {state !== "idle" && (
        <p role="status" className={`mt-1 text-xs ${state === "saving" ? "text-dim" : state === "saved" ? "text-maize" : "text-pink"}`}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state}
        </p>
      )}
    </div>
  );
}

function Album({ token, items, canCaption }: { token: string; items: AlbumItem[]; canCaption: boolean }) {
  if (!items.length) return null;
  const file = (k: string) => `/api/drop/${token}/file/${k}`;
  return (
    <section id="album" className="mt-14 scroll-mt-4">
      <h2 className="display text-3xl">The album</h2>
      <p className="mt-2 text-dim">
        {plural(items.length, "file")}. Anyone with this link can see and download them.{canCaption && items.some((m) => m.mine) ? " Caption yours: captions go in the post with the photo." : ""}
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
            {m.mine && canCaption ? (
              <CaptionEdit token={token} item={m} />
            ) : (
              m.caption && <p className="px-2 pb-2 text-sm leading-snug">{m.caption}</p>
            )}
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
  emailHint: string | null;
  nightName: string;
  songs: GuestSong[];
  places: { approved: Venue[]; mine: Array<{ id: string; name: string; url: string | null; kind: string }> };
  accountCount: number;
  album: AlbumItem[];
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
      {(phase === "invite" || phase === "live") && <ShareInvite token={token} name={props.nightName} rsvped={Boolean(props.rsvp)} />}
      {verified && canAct && props.me && <SaveSpot token={token} me={props.me} emailHint={props.emailHint} />}
      {verified && canAct && <GuestSongs token={token} songs={props.songs} />}
      {verified && canAct && phase !== "invite" && <GuestPlaces token={token} places={props.places} />}
      {verified && phase !== "invite" && <JumpNav links={jump} />}
      {verified && phase === "live" && <Uploader token={token} />}
      {showDraft && draftFirst && review}
      {showAccount && <Account token={token} account={props.account} defaultName={props.rsvp?.nickname ?? ""} count={props.accountCount} />}
      {showDraft && !draftFirst && review}
      {phase !== "invite" && <Album token={token} items={props.album} canCaption={verified && canAct} />}
      {/* Room so the sticky upload bar never covers the last thing on the page. */}
      {verified && phase === "live" && <div aria-hidden className="h-24 sm:hidden" />}
    </>
  );
}
