import type { ClipboardEvent } from "react";

/**
 * Paste a link over selected words to turn them into a link ([words](url)).
 * With nothing selected, the plain URL is pasted; posts link bare URLs anyway.
 */
export function linkPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  const url = e.clipboardData.getData("text/plain").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return;
  const { selectionStart: a, selectionEnd: b, value } = el;
  const picked = value.slice(a, b);
  if (a === b || /\n/.test(picked) || /^https?:\/\//i.test(picked.trim())) return;
  e.preventDefault();
  const text = `[${picked.replace(/[[\]]/g, "")}](${url.replace(/\)/g, "%29")})`;
  // execCommand keeps native undo; fall back to setting the value.
  el.focus();
  if (!document.execCommand?.("insertText", false, text)) {
    el.setRangeText(text, a, b, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
