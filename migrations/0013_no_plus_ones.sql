-- +1s are gone: guests share the invite instead. Columns stay (always 0).
UPDATE nights SET max_plus_ones = 0;
UPDATE night_rsvps SET plus_ones = 0;
