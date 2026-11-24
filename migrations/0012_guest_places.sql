-- Places guests suggest on the party link. They wait here until a host
-- approves them (then they join the night's places) or removes them.
CREATE TABLE night_places (
  id          TEXT PRIMARY KEY,
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  url         TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('party', 'eat')),
  created_at  TEXT NOT NULL
);
CREATE INDEX night_places_by_night ON night_places (night_id, created_at);
