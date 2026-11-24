-- Invite links that put someone on the crew list (or make them an admin).
-- Only a SHA-256 of the link token is stored. Admin invites are always locked
-- to one Google email, single use, and short-lived (enforced in code).
CREATE TABLE crew_invites (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'crew')),
  email        TEXT,                    -- lowercase; when set, only this Google account can use it
  label        TEXT,                    -- who it's for, shown to admins only
  max_uses     INTEGER NOT NULL DEFAULT 1,
  uses         INTEGER NOT NULL DEFAULT 0,
  expires_at   TEXT NOT NULL,
  revoked      INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX crew_invites_by_created ON crew_invites (created_at DESC);
