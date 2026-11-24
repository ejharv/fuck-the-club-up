-- Optional guest emails for "your link + reminders". Encrypted, never shown,
-- deleted after the night's "it's up" email (or on unsubscribe / night delete).
CREATE TABLE night_emails (
  night_id      TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  email_enc     TEXT NOT NULL,
  email_hash    TEXT NOT NULL,
  email_hint    TEXT NOT NULL,              -- e.g. "j•••@gmail.com", shown only to that guest
  changes       INTEGER NOT NULL DEFAULT 0,
  sent_confirm  TEXT,
  sent_dayof    TEXT,
  sent_draft    TEXT,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (night_id, device_id)
);
CREATE UNIQUE INDEX night_emails_one_per_address ON night_emails (night_id, email_hash);
