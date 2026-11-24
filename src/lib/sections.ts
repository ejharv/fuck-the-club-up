/** Sections from docs/briefs/01-concept.md. */
export const SECTIONS = [
  { slug: "night-reports", name: "Night Reports", blurb: "Recaps of the nights worth remembering, told by the people who remember them." },
] as const;

export type SectionSlug = (typeof SECTIONS)[number]["slug"];

export const sectionBySlug = (slug: string) => SECTIONS.find((s) => s.slug === slug);

export const HOUSE_RULES = [
  { title: "No names without a yes.", text: "Nobody appears by name, face or tag unless they agreed. Everyone else gets a nickname." },
  { title: "Nobody drives.", text: "Every recap says how the crew got home." },
  { title: "Punch up.", text: "Roast the bouncer's playlist, not someone having a bad night." },
  { title: "21+ for anything with a wristband.", text: "" },
  { title: "Water between rounds.", text: "" },
];

export const SITE_URL = "https://fucktheclubup.com";
