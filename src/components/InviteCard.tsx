"use client";

import { useEffect, useRef } from "react";
import { setInviteOg } from "@/app/nights/actions";
import { putWithProgress } from "@/lib/scrub-photo";

/**
 * Draws this night's link-preview card (1200x630 PNG) in the browser and
 * stores it whenever the name, start time or invite media changed since the
 * last draw. Runs quietly whenever an admin or host has the night open.
 */
export function InviteCard({
  nightId,
  name,
  opensAt,
  mediaUrl,
  mediaKind,
  storedSig,
}: {
  nightId: string;
  name: string;
  opensAt: string;
  mediaUrl: string | null;
  mediaKind: "video" | "photo" | null;
  storedSig: string | null;
}) {
  const sig = `v1|${name}|${opensAt}|${mediaUrl ?? ""}`;
  const running = useRef(false);

  useEffect(() => {
    if (sig === storedSig || running.current) return;
    running.current = true;
    (async () => {
      try {
        const blob = await drawCard(name, opensAt, mediaUrl, mediaKind);
        if (!blob) return;
        const res = await fetch(`/api/nights/${nightId}/invite-media`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contentType: "image/png", size: blob.size }),
        });
        const data = (await res.json()) as { key?: string; uploadUrl?: string; headers?: Record<string, string> };
        if (!res.ok || !data.key || !data.uploadUrl) return;
        await putWithProgress(data.uploadUrl, blob, data.headers ?? {}, () => {});
        await setInviteOg(nightId, data.key, sig);
      } catch {
        // Best effort: the generic card is used until this works.
      } finally {
        running.current = false;
      }
    })();
  }, [sig, storedSig, nightId, name, opensAt, mediaUrl, mediaKind]);

  return null;
}

const W = 1200;
const H = 630;

function cssFont(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

async function loadMedia(url: string, kind: "video" | "photo"): Promise<CanvasImageSource | null> {
  try {
    if (kind === "photo") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      return img;
    }
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve();
      v.onerror = () => reject(new Error("video"));
      setTimeout(() => reject(new Error("timeout")), 8000);
    });
    v.currentTime = Math.min(1, (v.duration || 2) / 3);
    await new Promise<void>((resolve) => {
      v.onseeked = () => resolve();
      setTimeout(resolve, 3000);
    });
    return v;
  } catch {
    return null;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function drawCard(name: string, opensAt: string, mediaUrl: string | null, mediaKind: "video" | "photo" | null): Promise<Blob | null> {
  const display = cssFont("--font-bowlby", "Impact");
  const mono = cssFont("--font-jetbrains", "monospace");
  const body = cssFont("--font-archivo", "sans-serif");
  await Promise.all([document.fonts.load(`100px ${display}`), document.fonts.load(`24px ${mono}`), document.fonts.load(`28px ${body}`)]).catch(() => {});

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#0c0d1c";
  ctx.fillRect(0, 0, W, H);

  // Backdrop: the invite photo/video frame on the right, faded into navy.
  const media = mediaUrl && mediaKind ? await loadMedia(mediaUrl, mediaKind) : null;
  if (media) {
    const mw = (media as HTMLVideoElement).videoWidth || (media as HTMLImageElement).naturalWidth;
    const mh = (media as HTMLVideoElement).videoHeight || (media as HTMLImageElement).naturalHeight;
    if (mw && mh) {
      const areaX = W * 0.42;
      const areaW = W - areaX;
      const scale = Math.max(areaW / mw, H / mh);
      ctx.drawImage(media, areaX + (areaW - mw * scale) / 2, (H - mh * scale) / 2, mw * scale, mh * scale);
      const g = ctx.createLinearGradient(areaX, 0, areaX + areaW * 0.55, 0);
      g.addColorStop(0, "rgba(12,13,28,1)");
      g.addColorStop(1, "rgba(12,13,28,0.15)");
      ctx.fillStyle = g;
      ctx.fillRect(areaX, 0, areaW, H);
    }
  } else {
    const glow = ctx.createRadialGradient(W * 0.8, H * 0.35, 20, W * 0.8, H * 0.35, 420);
    glow.addColorStop(0, "rgba(255,61,139,0.45)");
    glow.addColorStop(1, "rgba(255,61,139,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // Stage-light strips: maize and pink dashes, like the site header.
  for (const y of [0, H - 12]) {
    for (let x = 0; x < W; x += 80) {
      ctx.fillStyle = "#ffcb05";
      ctx.fillRect(x, y, 28, 12);
      ctx.fillStyle = "#ff3d8b";
      ctx.fillRect(x + 40, y, 28, 12);
    }
  }

  // Kicker.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ff3d8b";
  ctx.font = `500 24px ${mono}`;
  ctx.fillText("YOU'RE INVITED", 72, 104);

  // Night name: as big as fits in 3 lines.
  const maxW = media ? 620 : 980;
  let size = 132;
  let lines: string[] = [];
  for (; size >= 52; size -= 6) {
    ctx.font = `${size}px ${display}`;
    lines = wrap(ctx, name.toUpperCase(), maxW);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  ctx.fillStyle = "#f2eee4";
  const lh = size * 0.92;
  let y = 150 + size * 0.8;
  for (const l of lines.slice(0, 3)) {
    ctx.fillText(l, 68, y);
    y += lh;
  }

  // When.
  const when = new Date(opensAt)
    .toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })
    .toUpperCase();
  ctx.fillStyle = "#ffcb05";
  ctx.font = `500 28px ${mono}`;
  ctx.fillText(when, 72, Math.min(y + 18, H - 120));

  // Logo.
  ctx.font = `34px ${display}`;
  ctx.fillStyle = "#f2eee4";
  ctx.fillText("FUCK THE ", 72, H - 50);
  let x = 72 + ctx.measureText("FUCK THE ").width;
  ctx.fillStyle = "#ffcb05";
  ctx.fillText("CLUB", x, H - 50);
  x += ctx.measureText("CLUB ").width;
  ctx.fillStyle = "#f2eee4";
  ctx.fillText("UP", x, H - 50);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}
