-- Brief 05, part 2, merged with the collaborative story flow. One link per
-- night, no sign-in, and it changes with the night:
--   before opens_at   party invite: details, RSVP, add to calendar
--   opens_at..closes  uploads to a private inbox + everyone's account
--   after             shared album, Claude draft, notes and approvals
--   dropped           links to the published post
-- Admins review everything and drop the post.
CREATE TABLE nights (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  night_of          TEXT NOT NULL,                 -- YYYY-MM-DD
  token_hash        TEXT NOT NULL UNIQUE,          -- SHA-256 of the link token, never the token
  opens_at          TEXT NOT NULL,                 -- party start: invite becomes the drop
  closes_at         TEXT NOT NULL,                 -- uploads and accounts stop here
  invite_details    TEXT,                          -- what's happening (plain text)
  location_text     TEXT,                          -- address; only ever shown to link holders
  dress_code        TEXT,
  venues            TEXT,                          -- JSON [{name, url}]: places Claude may link in the draft
  status            TEXT NOT NULL DEFAULT 'collecting'
                    CHECK (status IN ('collecting', 'reviewing', 'dropping', 'dropped', 'closed')),
  max_files         INTEGER NOT NULL DEFAULT 500,
  max_bytes         INTEGER NOT NULL DEFAULT 10737418240,
  per_device_files  INTEGER NOT NULL DEFAULT 60,
  album_open        INTEGER NOT NULL DEFAULT 1,    -- link holders can see and download the album
  drop_at           TEXT,
  drop_fields       TEXT,                          -- JSON post fields saved when a drop is scheduled
  generations       INTEGER NOT NULL DEFAULT 0,
  generating_since  TEXT,                          -- lock while Claude writes a draft
  post_id           TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX nights_by_status ON nights (status, drop_at);

-- RSVPs from the invite phase. Nickname only.
CREATE TABLE night_rsvps (
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  nickname    TEXT NOT NULL,
  answer      TEXT NOT NULL CHECK (answer IN ('going', 'maybe', 'cant')),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (night_id, device_id)
);

CREATE TABLE night_uploads (
  r2_key        TEXT PRIMARY KEY,                  -- in the private INBOX bucket
  night_id      TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'audio')),
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL,
  nickname      TEXT,
  device_id     TEXT NOT NULL,
  ip_hash       TEXT,
  consented_at  TEXT NOT NULL,
  uploaded      INTEGER NOT NULL DEFAULT 0,        -- set once the object is verified in R2
  decision      TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'keep', 'toss')),
  caption       TEXT,
  is_cover      INTEGER NOT NULL DEFAULT 0,
  copied_key    TEXT,                              -- key in MEDIA once copied on drop
  created_at    TEXT NOT NULL
);
CREATE INDEX night_uploads_by_night ON night_uploads (night_id, created_at);
CREATE INDEX night_uploads_by_device ON night_uploads (night_id, device_id);

-- One account of the night per device. Nicknames only: nothing ties it to a person.
CREATE TABLE night_accounts (
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  nickname    TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (night_id, device_id)
);

CREATE TABLE night_drafts (
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  dek         TEXT,
  night_label TEXT,
  damage      TEXT,
  ride_home   TEXT,
  body        TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('claude', 'edit')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (night_id, version)
);

CREATE TABLE night_notes (
  id          TEXT PRIMARY KEY,
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,                    -- draft version the note is about
  device_id   TEXT,                                -- NULL for notes from an admin
  nickname    TEXT,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX night_notes_by_version ON night_notes (night_id, version);

-- Approvals belong to one draft version; a new version starts over.
CREATE TABLE night_approvals (
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  device_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (night_id, version, device_id)
);

CREATE TABLE takedown_requests (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL,
  media_id    TEXT,
  contact     TEXT,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX takedowns_open ON takedown_requests (status, created_at);
