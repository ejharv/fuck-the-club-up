"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Autosaves an editor to this device (localStorage) so a closed tab, a crash
 * or a dead battery never loses writing. Never publishes anything: on the next
 * visit it offers "Restore" or "Discard".
 *
 * It snapshots every named text field in the form, plus `extra` (state that
 * isn't a form field, like places or songs).
 */
type Snapshot<E> = { fields: Record<string, string>; extra: E; savedAt: number };

const readFields = (form: HTMLFormElement | null) => {
  const out: Record<string, string> = {};
  if (!form) return out;
  for (const el of Array.from(form.elements) as Array<HTMLInputElement | HTMLTextAreaElement>) {
    if (!el.name || !("value" in el)) continue;
    const type = (el as HTMLInputElement).type;
    if (["file", "checkbox", "radio", "hidden", "submit", "button"].includes(type)) continue;
    out[el.name] = el.value;
  }
  return out;
};

export function useFormDraft<E>({
  key,
  form,
  extra,
  setExtra,
  active = true,
}: {
  key: string;
  form: RefObject<HTMLFormElement | null>;
  extra: E;
  setExtra?: (e: E) => void;
  active?: boolean;
}) {
  const [pending, setPending] = useState<Snapshot<E> | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const checked = useRef(false);
  const baseline = useRef<string>("");
  const stopped = useRef(false);

  // On open: offer anything saved earlier that differs from what's on screen now.
  useEffect(() => {
    if (active) stopped.current = false;
    if (!active || checked.current) return;
    checked.current = true;
    baseline.current = JSON.stringify({ fields: readFields(form.current), extra });
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const snap = JSON.parse(raw) as Snapshot<E>;
      const hasText = Object.values(snap.fields ?? {}).some((v) => v && v.trim());
      if (hasText && JSON.stringify({ fields: snap.fields, extra: snap.extra }) !== baseline.current) setPending(snap);
      else localStorage.removeItem(key);
    } catch {
      // storage blocked or junk: ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);

  const saveNow = useCallback(() => {
    if (!active || pending || stopped.current) return;
    const fields = readFields(form.current);
    const body = JSON.stringify({ fields, extra });
    try {
      if (body === baseline.current) localStorage.removeItem(key);
      else {
        localStorage.setItem(key, JSON.stringify({ fields, extra, savedAt: Date.now() }));
        setSavedAt(Date.now());
      }
    } catch {
      // ignore
    }
  }, [active, pending, form, extra, key]);

  // Save shortly after typing stops, when state changes, and when the tab is hidden.
  useEffect(() => {
    if (!active) return;
    const el = form.current;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onInput = () => {
      clearTimeout(t);
      t = setTimeout(saveNow, 600);
    };
    const onHide = () => document.visibilityState === "hidden" && saveNow();
    el?.addEventListener("input", onInput);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(t);
      el?.removeEventListener("input", onInput);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [active, form, saveNow]);
  useEffect(() => {
    if (!active || !checked.current) return;
    const t = setTimeout(saveNow, 600);
    return () => clearTimeout(t);
  }, [extra, active, saveNow]);

  const restore = useCallback(() => {
    if (!pending) return;
    const f = form.current;
    if (f) {
      for (const [name, value] of Object.entries(pending.fields)) {
        const el = f.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && "value" in el) el.value = value;
      }
    }
    if (setExtra) setExtra(pending.extra);
    setPending(null);
    setSavedAt(pending.savedAt);
  }, [pending, form, setExtra]);

  const discard = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setPending(null);
  }, [key]);

  /** Call when publishing starts: deletes the copy and stops autosaving (no stray timer can re-save it). */
  const clear = useCallback(() => {
    stopped.current = true;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setSavedAt(null);
  }, [key]);

  /** Publishing failed: start autosaving again and save what's there now. */
  const resume = useCallback(() => {
    stopped.current = false;
    saveNow();
  }, [saveNow]);

  return { pending, savedAt, restore, discard, clear, resume, saveNow };
}
