-- Crew list: only these emails can sign in. Admins can manage the list.
CREATE TABLE members (
  email       TEXT PRIMARY KEY,          -- always lowercase
  name        TEXT,
  image       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'crew')),
  added_by    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Fields follow docs/briefs/03-content-model.md (title, dek, section, night,
-- damage, rideHome, placeholder), stored in D1 instead of frontmatter.
CREATE TABLE posts (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  dek           TEXT,
  section       TEXT NOT NULL CHECK (section IN ('night-reports', 'the-guide', 'game-day', 'pregame', 'lore', 'survival')),
  night         TEXT,                      -- "Saturday, game day"
  damage        TEXT,                      -- "$20 and my dignity"
  ride_home     TEXT,                      -- how everyone got home
  body          TEXT NOT NULL,             -- markdown, rendered without raw HTML
  cover_key     TEXT,
  placeholder   INTEGER NOT NULL DEFAULT 0,
  author_email  TEXT NOT NULL,
  author_name   TEXT,
  published_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX posts_by_published ON posts (published_at DESC);
CREATE INDEX posts_by_section ON posts (section, published_at DESC);

CREATE TABLE media (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'audio', 'embed')),
  r2_key        TEXT,                      -- uploaded files
  url           TEXT,                      -- embeds (Spotify / SoundCloud / YouTube)
  content_type  TEXT,
  caption       TEXT
);
CREATE INDEX media_by_post ON media (post_id, position);

-- Every presigned upload is recorded so a post can only attach files its
-- author actually uploaded.
CREATE TABLE uploads (
  r2_key        TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  used          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX uploads_by_email ON uploads (email, used);
