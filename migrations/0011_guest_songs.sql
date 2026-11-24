-- Songs guests add on the party link (pasted Spotify/SoundCloud/YouTube/Apple
-- Music links or "Artist - Title"). Merged into the post's playlist on drop.
CREATE TABLE night_songs (
  id          TEXT PRIMARY KEY,
  night_id    TEXT NOT NULL REFERENCES nights (id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT,
  url         TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX night_songs_by_night ON night_songs (night_id, created_at);
