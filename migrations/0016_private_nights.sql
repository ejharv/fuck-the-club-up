-- Private nights: hosts approve who gets in, and/or the write-up stays off the public site.
ALTER TABLE nights ADD COLUMN private_invite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nights ADD COLUMN private_post INTEGER NOT NULL DEFAULT 0;
ALTER TABLE night_rsvps ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;  -- 0 = request waiting for a host
ALTER TABLE posts ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
