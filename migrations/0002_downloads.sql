-- Tool downloads, counted by the Worker: one row per day, file and kind of client.
-- No IP address, user agent or anything else about the person is stored.
CREATE TABLE downloads (
  day   TEXT NOT NULL,                                          -- YYYY-MM-DD, UTC
  path  TEXT NOT NULL,                                          -- e.g. /tools/mac-organizer-handoff/MAC_ORGANIZER_HANDOFF.md
  agent TEXT NOT NULL CHECK (agent IN ('browser', 'script', 'bot')),
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, agent)
);
