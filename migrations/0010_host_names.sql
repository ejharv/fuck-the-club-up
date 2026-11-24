-- "Hosted by" on invites: each host's chosen display name (never their email).
-- Every night's creator becomes a host row so they can be named too.
-- Additive only: existing links, RSVPs and uploads are untouched.
ALTER TABLE night_hosts ADD COLUMN display_name TEXT;
INSERT OR IGNORE INTO night_hosts (night_id, email, added_by, created_at)
  SELECT id, lower(created_by), 'creator', created_at FROM nights;
