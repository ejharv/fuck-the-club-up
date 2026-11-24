/** In-app browsers (Snapchat, Instagram, …) and how to hop out of them. Client-side only. */
export type BrowserEnv = { inApp: string | null; ios: boolean; android: boolean };

const APPS: Array<[RegExp, string]> = [
  [/Snapchat/i, "Snapchat"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/TikTok|musical_ly|BytedanceWebview/i, "TikTok"],
  [/Twitter/i, "X"],
  [/LinkedInApp/i, "LinkedIn"],
  [/GroupMe/i, "GroupMe"],
  [/\bLine\//i, "Line"],
];

export function browserEnv(): BrowserEnv {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return { inApp: APPS.find(([re]) => re.test(ua))?.[1] ?? null, ios: /iPhone|iPad|iPod/i.test(ua), android: /Android/i.test(ua) };
}

/** A link that opens `url` in the phone's real browser (Safari on iOS 17+, Chrome on Android). */
export function openOutHref(url: string, env: BrowserEnv): string {
  if (env.ios) return `x-safari-${url}`;
  if (env.android) return `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
  return url;
}

export const browserName = (env: BrowserEnv) => (env.ios ? "Safari" : env.android ? "Chrome" : "your browser");
