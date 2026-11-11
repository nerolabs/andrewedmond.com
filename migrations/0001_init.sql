-- Lab Notes subscribers. A sign-up waits in `signups` until its confirm click;
-- only then does it become a subscriber. Unconfirmed sign-ups are deleted after 7 days.
CREATE TABLE signups (
  token        TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  consent      TEXT NOT NULL,           -- the sign-up wording the person saw
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);
CREATE INDEX signups_email ON signups (email, created_at);

CREATE TABLE subscribers (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  token           TEXT NOT NULL UNIQUE,  -- for unsubscribe links
  status          TEXT NOT NULL CHECK (status IN ('active', 'unsubscribed')),
  confirmed_at    TEXT NOT NULL,
  unsubscribed_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What each person agreed to, and when they withdrew it.
CREATE TABLE consent_log (
  id            INTEGER PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id),
  kind          TEXT NOT NULL CHECK (kind IN ('subscribe', 'unsubscribe')),
  text          TEXT,
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per approved "Send Lab Note" run: who started it and which run.
CREATE TABLE sends (
  id     INTEGER PRIMARY KEY,
  slug   TEXT NOT NULL,
  run_id TEXT NOT NULL,
  actor  TEXT,
  at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (slug, run_id)
);

-- Each subscriber gets each note at most once: the row is claimed before the email goes.
CREATE TABLE deliveries (
  subscriber_id INTEGER NOT NULL REFERENCES subscribers (id),
  slug          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('claimed', 'sent', 'failed')),
  resend_id     TEXT,
  error         TEXT,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subscriber_id, slug)
);
