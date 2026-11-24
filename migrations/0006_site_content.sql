-- Editable site copy (home tagline, About page, house rules, footer, section
-- blurbs). Missing keys fall back to the defaults in src/lib/site-content.ts.
CREATE TABLE site_content (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL
);
