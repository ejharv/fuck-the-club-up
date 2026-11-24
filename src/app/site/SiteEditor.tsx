"use client";

import { useState, useTransition } from "react";
import type { HouseRule, SiteContent } from "@/lib/site-content";
import { saveSiteContent } from "./actions";

type Props = { content: SiteContent; defaults: SiteContent; sections: Array<{ slug: string; name: string }> };

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  def,
  rows,
  max,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  def: string;
  rows?: number;
  max: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-bold">{label}</label>
        {value !== def && (
          <button type="button" onClick={() => onChange(def)} className="text-sm text-dim underline underline-offset-4 hover:text-maize">
            Reset to original
          </button>
        )}
      </div>
      {rows ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={max} className="field leading-relaxed" />
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} className="field" />
      )}
      {hint && <p className="mt-1 text-sm text-dim">{hint}</p>}
    </div>
  );
}

export function SiteEditor({ content, defaults, sections }: Props) {
  const [c, setC] = useState<SiteContent>(content);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => {
    setMsg(null);
    setC((x) => ({ ...x, [k]: v }));
  };
  const setRule = (i: number, k: keyof HouseRule, v: string) => set("houseRules", c.houseRules.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  function save() {
    start(async () => {
      const r = await saveSiteContent(c);
      setMsg(r && "error" in r ? { ok: false, text: r.error } : { ok: true, text: "Saved. It's live." });
    });
  }

  return (
    <div className="mt-8 space-y-10 pb-28">
      <fieldset className="space-y-5">
        <legend className="display mb-4 text-2xl text-maize">Home page</legend>
        <Field id="homeKicker" label="Line above the big logo" value={c.homeKicker} def={defaults.homeKicker} onChange={(v) => set("homeKicker", v)} max={160} />
        <Field id="homeLede" label="Line under the big logo" value={c.homeLede} def={defaults.homeLede} onChange={(v) => set("homeLede", v)} rows={2} max={400} />
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="display mb-4 text-2xl text-maize">About page</legend>
        <Field id="aboutBody" label="What the blog is" hint="Markdown works: **bold**, _italic_, [links](https://…), blank line between paragraphs." value={c.aboutBody} def={defaults.aboutBody} onChange={(v) => set("aboutBody", v)} rows={8} max={8000} />
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-bold">House rules</span>
            {JSON.stringify(c.houseRules) !== JSON.stringify(defaults.houseRules) && (
              <button type="button" onClick={() => set("houseRules", defaults.houseRules)} className="text-sm text-dim underline underline-offset-4 hover:text-maize">
                Reset to original
              </button>
            )}
          </div>
          <ol className="space-y-3">
            {c.houseRules.map((r, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[1.5rem_14rem_1fr_auto] sm:items-start">
                <span className="display pt-2 text-pink">{i + 1}</span>
                <input value={r.title} onChange={(e) => setRule(i, "title", e.target.value)} maxLength={80} aria-label={`Rule ${i + 1}`} className="field" />
                <input value={r.text} onChange={(e) => setRule(i, "text", e.target.value)} maxLength={300} aria-label={`Rule ${i + 1} detail`} placeholder="Detail (optional)" className="field" />
                <button type="button" onClick={() => set("houseRules", c.houseRules.filter((_, j) => j !== i))} className="pt-2 text-sm text-dim underline hover:text-pink">Remove</button>
              </li>
            ))}
          </ol>
          {c.houseRules.length < 10 && (
            <button type="button" onClick={() => set("houseRules", [...c.houseRules, { title: "", text: "" }])} className="mt-3 rounded-full border border-ink px-4 py-2 text-sm font-bold hover:border-maize hover:text-maize">
              Add a rule
            </button>
          )}
          <p className="mt-2 text-sm text-dim">The first rule is the one people confirm when they post, so keep it about names and consent.</p>
        </div>
        <Field id="storyTitle" label="Story box heading" value={c.storyTitle} def={defaults.storyTitle} onChange={(v) => set("storyTitle", v)} max={160} />
        <Field id="storyBody" label="Story box text" hint="Add a contact link here, e.g. [DM us](https://instagram.com/…), or clear both story fields to hide the box." value={c.storyBody} def={defaults.storyBody} onChange={(v) => set("storyBody", v)} rows={2} max={400} />
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="display mb-4 text-2xl text-maize">Section blurbs</legend>
        {sections.map((s) => (
          <Field
            key={s.slug}
            id={`blurb-${s.slug}`}
            label={s.name}
            value={c.sectionBlurbs[s.slug] ?? ""}
            def={defaults.sectionBlurbs[s.slug]}
            onChange={(v) => set("sectionBlurbs", { ...c.sectionBlurbs, [s.slug]: v })}
            max={200}
          />
        ))}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="display mb-4 text-2xl text-maize">Privacy and terms</legend>
        <Field id="legalContact" label="How people reach you" hint="Shown where the policies say {{contact}}. An email works best, e.g. [hello@fucktheclubup.com](mailto:hello@fucktheclubup.com)." value={c.legalContact} def={defaults.legalContact} onChange={(v) => set("legalContact", v)} rows={2} max={400} />
        <Field id="privacyBody" label="Privacy policy" hint="Markdown. Update it if you change what the site collects." value={c.privacyBody} def={defaults.privacyBody} onChange={(v) => set("privacyBody", v)} rows={16} max={30000} />
        <Field id="termsBody" label="Terms of service" hint="Markdown." value={c.termsBody} def={defaults.termsBody} onChange={(v) => set("termsBody", v)} rows={16} max={30000} />
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="display mb-4 text-2xl text-maize">Footer</legend>
        <Field id="footerLine" label="Footer line" value={c.footerLine} def={defaults.footerLine} onChange={(v) => set("footerLine", v)} max={400} />
        <Field id="footerRules" label="Footer rules strip" value={c.footerRules} def={defaults.footerRules} onChange={(v) => set("footerRules", v)} max={400} />
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <button type="button" disabled={pending} onClick={save} className="rounded-full bg-maize px-8 py-3 font-bold text-night hover:bg-ink disabled:opacity-60">
            {pending ? "Saving…" : "Save changes"}
          </button>
          {msg && <span role="status" className={msg.ok ? "text-maize" : "text-pink"}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}
