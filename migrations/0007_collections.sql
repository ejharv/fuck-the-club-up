-- Night Reports becomes the only blog section. Places and playlists build
-- themselves from night reports and link back to them.

-- Places a post went to: name + the venue's own website + party/eat.
CREATE TABLE post_venues (
  post_id   TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  place_key TEXT NOT NULL,            -- normalized: website host, else lowercase name; groups the same place across posts
  name      TEXT NOT NULL,
  url       TEXT,
  kind      TEXT NOT NULL CHECK (kind IN ('party', 'eat')),
  PRIMARY KEY (post_id, position)
);
CREATE INDEX post_venues_by_place ON post_venues (place_key);

-- Songs of the night.
CREATE TABLE post_tracks (
  post_id   TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL,
  artist    TEXT,
  url       TEXT,                     -- Spotify/SoundCloud/YouTube link when someone added one
  source    TEXT NOT NULL CHECK (source IN ('link', 'mentioned', 'upload')),
  media_id  TEXT,                     -- uploaded audio file in the post, if any
  PRIMARY KEY (post_id, position)
);

-- Claude's draft carries the songs it spotted, editable before the drop.
ALTER TABLE night_drafts ADD COLUMN songs TEXT;   -- JSON [{title, artist}]

-- One blog section.
UPDATE posts SET section = 'night-reports' WHERE section != 'night-reports';
DELETE FROM posts WHERE placeholder = 1;

-- Claude writing help in the post editor: one row per request, for a daily cap per person.
CREATE TABLE assist_log (
  email       TEXT NOT NULL,
  mode        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX assist_log_by_email ON assist_log (email, created_at);

-- "Add from phone": a short-lived QR link that lets a signed-in crew member's
-- phone upload into the post they're editing, without signing in on the phone.
CREATE TABLE upload_sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,     -- SHA-256 of the QR link token
  email       TEXT NOT NULL,            -- the crew member who opened it; uploads count as theirs
  expires_at  TEXT NOT NULL,
  closed      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
ALTER TABLE uploads ADD COLUMN session_id TEXT;
ALTER TABLE uploads ADD COLUMN size INTEGER;
CREATE INDEX uploads_by_session ON uploads (session_id, created_at);

-- Party links are meant to be shared widely, so admins can see a night's link
-- any time. Stored encrypted with a key derived from AUTH_SECRET; lookups still
-- go through token_hash.
ALTER TABLE nights ADD COLUMN token_enc TEXT;

-- Partiful-style guest limits: an optional cap on total headcount (guests +
-- their +1s) and how many +1s each guest may bring. Over the cap, a "going"
-- RSVP is waitlisted; spots that open up go to the waitlist in order.
ALTER TABLE nights ADD COLUMN capacity INTEGER;                 -- NULL = no limit
ALTER TABLE nights ADD COLUMN max_plus_ones INTEGER NOT NULL DEFAULT 0;
ALTER TABLE night_rsvps ADD COLUMN plus_ones INTEGER NOT NULL DEFAULT 0;
ALTER TABLE night_rsvps ADD COLUMN waitlisted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE night_rsvps ADD COLUMN created_at TEXT;
UPDATE night_rsvps SET created_at = updated_at WHERE created_at IS NULL;

-- Co-hosts: admins add people (by Google email) who can run one night:
-- guest list, photos, places, draft, drop. Hosts can sign in with Google even
-- if they're not on the crew list; it gives them nothing beyond their nights.
CREATE TABLE night_hosts (
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  email       TEXT NOT NULL,            -- lowercase
  added_by    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (night_id, email)
);
CREATE INDEX night_hosts_by_email ON night_hosts (email);

-- Hosts can change the invite any time: party rules plus an invite video/photo.
ALTER TABLE nights ADD COLUMN invite_rules TEXT;          -- one rule per line
ALTER TABLE nights ADD COLUMN invite_media_key TEXT;      -- in the public MEDIA bucket
ALTER TABLE nights ADD COLUMN invite_media_kind TEXT;     -- 'video' or 'photo'
