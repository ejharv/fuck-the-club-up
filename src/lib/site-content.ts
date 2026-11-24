import "server-only";
import { cache } from "react";
import { cf } from "./env";
import { DEFAULT_CONTACT, DEFAULT_PRIVACY, DEFAULT_TERMS } from "./legal-defaults";
import { HOUSE_RULES, SECTIONS } from "./sections";

/**
 * Site copy admins can edit on /site. Everything has a default (the original
 * copy from the briefs), so an empty table renders the site exactly as before.
 */
export type HouseRule = { title: string; text: string };

export type SiteContent = {
  homeKicker: string;
  homeLede: string;
  aboutBody: string; // markdown
  houseRules: HouseRule[];
  storyTitle: string;
  storyBody: string; // markdown
  footerLine: string;
  footerRules: string;
  sectionBlurbs: Record<string, string>;
  playlistsIntro: string;
  placesIntro: string;
  privacyBody: string; // markdown, {{contact}} is replaced with legalContact
  termsBody: string; // markdown
  legalContact: string; // markdown
};

export const DEFAULT_CONTENT: SiteContent = {
  homeKicker: "After dark · est. 2026",
  homeLede: "The nights, the places, and the stories that turned into lore. Told by the people who remember them.",
  aboutBody:
    "Fuck The Club Up is a blog about going out in college and right after it: the nights, the places, and the stories that turned into lore. Wherever the night goes.\n\nIt's written by a crew of friends recapping the weekend the way they would at brunch: loud, specific, and roasting themselves first.",
  houseRules: HOUSE_RULES.map((r) => ({ title: r.title, text: r.text })),
  storyTitle: "Got a story?",
  storyBody: "Send us the night. We change the names, keep the chaos.",
  footerLine: "Going out, written by the people who were there.",
  footerRules: "No names without a yes · Nobody drives · Water between rounds",
  sectionBlurbs: Object.fromEntries(SECTIONS.map((s) => [s.slug, s.blurb])),
  playlistsIntro: "Every song from every night: the ones people linked and the ones that got named in the story. Tap a night to read what happened.",
  placesIntro: "Where the crew actually went, pulled from the night reports. Each place links to the nights it shows up in.",
  privacyBody: DEFAULT_PRIVACY,
  termsBody: DEFAULT_TERMS,
  legalContact: DEFAULT_CONTACT,
};

export const CONTENT_LIMITS = {
  short: 160,
  medium: 400,
  long: 8000,
  legal: 30000,
  rules: 10,
};

/** One D1 read per request, shared by the layout and the page. */
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  const { DB } = await cf();
  const { results } = await DB.prepare("SELECT key, value FROM site_content").all<{ key: string; value: string }>();
  const c: SiteContent = { ...DEFAULT_CONTENT, sectionBlurbs: { ...DEFAULT_CONTENT.sectionBlurbs } };
  for (const { key, value } of results) {
    try {
      if (key === "houseRules") {
        const rules = JSON.parse(value);
        if (Array.isArray(rules)) c.houseRules = rules.filter((r) => typeof r?.title === "string").map((r) => ({ title: r.title, text: String(r.text ?? "") }));
      } else if (key === "sectionBlurbs") {
        const b = JSON.parse(value);
        for (const s of SECTIONS) if (typeof b?.[s.slug] === "string" && b[s.slug].trim()) c.sectionBlurbs[s.slug] = b[s.slug];
      } else if (key in c && typeof (c as Record<string, unknown>)[key] === "string") {
        (c as Record<string, unknown>)[key] = value;
      }
    } catch {
      // Ignore a malformed row; the default stays.
    }
  }
  return c;
});

/** Sections with their (possibly edited) blurbs. Slugs and names stay fixed: they're in URLs and the brief. */
export async function sectionsWithBlurbs() {
  const c = await getSiteContent();
  return SECTIONS.map((s) => ({ ...s, blurb: c.sectionBlurbs[s.slug] ?? s.blurb }));
}
