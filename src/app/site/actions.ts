"use server";

import { revalidatePath } from "next/cache";
import { cf } from "@/lib/env";
import { CONTENT_LIMITS, DEFAULT_CONTENT, type HouseRule } from "@/lib/site-content";
import { SECTIONS } from "@/lib/sections";
import { NotAllowed, requireAdmin } from "@/lib/session";

export type SiteResult = { error: string } | { ok: true } | undefined;

export type SiteInput = {
  homeKicker: string;
  homeLede: string;
  aboutBody: string;
  houseRules: HouseRule[];
  storyTitle: string;
  storyBody: string;
  footerLine: string;
  footerRules: string;
  sectionBlurbs: Record<string, string>;
  privacyBody: string;
  termsBody: string;
  legalContact: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Saves every field. A field equal to its default is removed, so the site
 * falls back to the original copy. An emptied field is stored empty, which
 * hides that bit of the page (e.g. the story box).
 */
export async function saveSiteContent(input: SiteInput): Promise<SiteResult> {
  try {
    const admin = await requireAdmin();
    const env = await cf();
    const L = CONTENT_LIMITS;
    const values: Record<string, string> = {
      homeKicker: str(input.homeKicker, L.short),
      homeLede: str(input.homeLede, L.medium),
      aboutBody: str(input.aboutBody, L.long),
      storyTitle: str(input.storyTitle, L.short),
      storyBody: str(input.storyBody, L.medium),
      footerLine: str(input.footerLine, L.medium),
      footerRules: str(input.footerRules, L.medium),
      privacyBody: str(input.privacyBody, L.legal),
      termsBody: str(input.termsBody, L.legal),
      legalContact: str(input.legalContact, L.medium),
    };
    if (!values.privacyBody || !values.termsBody) return { error: "The privacy policy and terms can't be empty. Reset them to the original instead." };
    const rules = (Array.isArray(input.houseRules) ? input.houseRules : [])
      .slice(0, L.rules)
      .map((r) => ({ title: str(r?.title, 80), text: str(r?.text, 300) }))
      .filter((r) => r.title);
    if (!rules.length) return { error: "Keep at least one house rule." };
    values.houseRules = JSON.stringify(rules);
    const blurbs: Record<string, string> = {};
    for (const s of SECTIONS) blurbs[s.slug] = str(input.sectionBlurbs?.[s.slug], 200) || s.blurb;
    values.sectionBlurbs = JSON.stringify(blurbs);

    const defaults: Record<string, string> = {
      ...Object.fromEntries(Object.entries(DEFAULT_CONTENT).filter(([, v]) => typeof v === "string")),
      houseRules: JSON.stringify(DEFAULT_CONTENT.houseRules),
      sectionBlurbs: JSON.stringify(DEFAULT_CONTENT.sectionBlurbs),
    } as Record<string, string>;
    const now = new Date().toISOString();
    await env.DB.batch(
      Object.entries(values).map(([key, value]) =>
        value === defaults[key]
          ? env.DB.prepare("DELETE FROM site_content WHERE key = ?").bind(key)
          : env.DB.prepare(
              `INSERT INTO site_content (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
               ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
            ).bind(key, value, admin.email, now),
      ),
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof NotAllowed) return { error: e.message };
    throw e;
  }
}
