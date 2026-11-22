/**
 * Turns a pasted music/video link into an iframe URL, but only for hosts we
 * trust. Anything else is rejected, so posts can't embed arbitrary pages.
 */
export type Embed = { provider: "youtube" | "spotify" | "soundcloud"; src: string; tall: boolean };

export function toEmbed(raw: string): Embed | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "music.youtube.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})/)?.[1];
    return id && /^[\w-]{11}$/.test(id)
      ? { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, tall: true }
      : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{11}$/.test(id)
      ? { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, tall: true }
      : null;
  }
  if (host === "open.spotify.com") {
    const m = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})/);
    return m
      ? { provider: "spotify", src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, tall: m[1] !== "track" && m[1] !== "episode" }
      : null;
  }
  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    if (!/^\/[\w-]+\/[\w-]+/.test(u.pathname)) return null;
    const target = `https://soundcloud.com${u.pathname}`;
    const set = u.pathname.split("/")[2] === "sets";
    return {
      provider: "soundcloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(target)}&color=%23ff9f1c&visual=false&show_comments=false`,
      tall: set,
    };
  }
  return null;
}
