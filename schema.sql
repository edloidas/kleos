-- Requests to support an organization that is not enabled yet.
CREATE TABLE IF NOT EXISTS waitlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  org        TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_org_email ON waitlist (org, email);
