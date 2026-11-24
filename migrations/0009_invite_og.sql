-- Per-night link-preview image, drawn in the host's browser and stored in MEDIA.
ALTER TABLE nights ADD COLUMN og_key TEXT;
ALTER TABLE nights ADD COLUMN og_sig TEXT;   -- what it was drawn from (name|start|media); redraw when it changes
