-- 0011_calls_report.sql — «تقرير مكالمات جنة وباسم اليومي» / the daily calls report (owner, 2026-11-20: «لازم يجيلي علي الايميل تقرير يومي
-- بايه اللي هي قالته للناس ومين كلمها …»; worker/src/calls-report.js, calls-review.js, calls-render.js).
--   call_sessions  one row per live-call token the Worker minted (src/janna-session.js): the random tag of the call's Anam clientLabel
--                  («madeinegyptgate-<agent>-<lang>.<tag>»), the member ONLY when that token request carried his own full sign-in (Bearer
--                  v2, never an e-mailed link), else Janna's random page visitor id as subject 'v:<id>', the staff flag, the platform's
--                  app (ios / android) and which context the persona got. Never an e-mail, a phone, an IP or a user agent. The report
--                  fills session_id once Anam lists the session.
--   call_reviews   one row per reviewed conversation (phase 2: the Control Center page «مكالمات جنة وباسم»): the automatic verdict, the
--                  rule codes and a masked summary; pruned after the report's keep_days (default 180, 0 = keep).
-- PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS — no ALTER, no DROP, no change to an existing table, no
-- seed rows; safe to re-run. Also appended verbatim to schema.sql. Until it is applied everything keeps working: the report goes out with
-- the other identity joins and the note «شغّل 0011», and the session token never waits for it (a missing table writes nothing).
-- The owner's audited legal erasure (src/acc-memory.js eraseMemory, src/acc-members.js deleteMember) deletes the person's rows of both.
-- Apply ONLY with the manual GitHub workflow, which backs up first, AFTER the code that uses it is live:
--   Actions → d1-migrate → Run workflow: migration = 0011_calls_report.sql, confirm = migate-db
CREATE TABLE IF NOT EXISTS call_sessions (
  tag         TEXT PRIMARY KEY,                         -- 12 random base32 characters, the end of the call's Anam clientLabel
  agent       TEXT NOT NULL CHECK (agent IN ('janna', 'bassem')),
  lang        TEXT NOT NULL DEFAULT 'ar',
  subject     TEXT NOT NULL DEFAULT '',                 -- 'v:' + Janna's random page visitor id, else ''
  member_id   TEXT NOT NULL DEFAULT '',                 -- members.id ONLY with that request's own full sign-in (Bearer v2, not an e-mailed link)
  staff       INTEGER NOT NULL DEFAULT 0,               -- 1 = the platform's team (Control Center staff / ADMIN_EMAILS)
  app         TEXT NOT NULL DEFAULT '',                 -- ios | android (the platform's own apps, MIGApp user agent) | '' (a browser)
  ctx         TEXT NOT NULL DEFAULT '',                 -- member | visitor | knowledge | '' — the context block the persona got
  created_at  TEXT NOT NULL,
  session_id  TEXT NOT NULL DEFAULT ''                  -- the Anam session id, filled by the report
);
CREATE INDEX IF NOT EXISTS call_sessions_created ON call_sessions(created_at);
CREATE INDEX IF NOT EXISTS call_sessions_subject ON call_sessions(subject, created_at);
CREATE INDEX IF NOT EXISTS call_sessions_member ON call_sessions(member_id, created_at);
CREATE INDEX IF NOT EXISTS call_sessions_session ON call_sessions(session_id);

CREATE TABLE IF NOT EXISTS call_reviews (
  session_id    TEXT PRIMARY KEY,                       -- the conversation's first Anam session id
  day           TEXT NOT NULL,                          -- the Cairo day of the report
  agent         TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',               -- members.id, or 'v:' + a Janna visitor id ('' = not known)
  kind          TEXT NOT NULL DEFAULT '',               -- customer | team | outside
  verdict       TEXT NOT NULL DEFAULT '',               -- the automatic rating (calls-review.js)
  flags         TEXT NOT NULL DEFAULT '',               -- rule codes with their turns
  summary_json  TEXT NOT NULL DEFAULT '{}',             -- masked like the report (no transcript, no contact data from a call)
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS call_reviews_day ON call_reviews(day, verdict);
CREATE INDEX IF NOT EXISTS call_reviews_subject ON call_reviews(subject, day);
