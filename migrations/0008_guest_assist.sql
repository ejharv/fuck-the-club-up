-- Claude help for guests writing their side of the story, capped per phone
-- and per night.
CREATE TABLE guest_assist_log (
  night_id    TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX guest_assist_by_night ON guest_assist_log (night_id, device_id);
