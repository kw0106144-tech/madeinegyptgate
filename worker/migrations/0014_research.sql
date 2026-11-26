-- 0014_research.sql — «بحث وكتابة عميقة» (deep research & writing): one row per deep job of Bassem (Janna's jobs come later with her
-- phase), src/research.js. Owner 2026-11-20 «أنا عايز جنه وباسم يبقوا زي شات جي بي تي كده في البحث والتطوير والرد والعمل», his OK
-- «اعمله» 2026-11-21; design part A. The customer document (doc) has NO source and no link out, and stores deadlines, never a status
-- (the status is computed when it is read). The INTERNAL sources (sources: evidence id → origin, link, site, the date found, the query)
-- and what the checker removed (dropped) are read only by the data desk (roles data / admin / owner: GET /api/team/desk/research).
-- pack = the evidence pack between the job's steps, blanked when the job finishes. Retention (owner D5): a member's row is blanked at
-- expires_at = +365 days (researchCron: inputs, document, sources, title, keys; the kind, counts, cost and dates stay); a visitor's row
-- (Janna, later) +30 days. This table is NOT Bassem's memory (memory.js stays permanent). The owner's legal erasure deletes a member's rows.
-- Without this table the research endpoints answer 503 research_off and the owner switch research_bassem stays locked.
-- Purely additive and idempotent (CREATE … IF NOT EXISTS): safe to re-run.
-- Apply ONLY with the manual workflow: GitHub → Actions → d1-migrate → migration = 0014_research.sql, confirm = migate-db (backup first).
CREATE TABLE IF NOT EXISTS research_jobs (
  id          TEXT PRIMARY KEY,                       -- 'rj' + 20 characters; also the Workflow instance id
  who         TEXT NOT NULL,                          -- bassem | janna
  via         TEXT NOT NULL DEFAULT 'call',           -- call | chat | page (the owner's test stores no row)
  member_id   TEXT NOT NULL DEFAULT '',               -- the signed-in member; '' = an anonymous visitor (Janna, later)
  ticket_key  TEXT NOT NULL DEFAULT '',               -- visitors: 16 characters of the call / chat ticket's signature (never the ticket)
  net         TEXT NOT NULL DEFAULT '',               -- visitors: the keyed network hash (common.js ipHash), never an IP
  call_key    TEXT NOT NULL DEFAULT '',               -- HMAC(secret, member + job key + call chain), 32 characters: never the raw question
  label       TEXT NOT NULL DEFAULT '',               -- R1, R2 … within the member's recent jobs
  kind        TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'ar',             -- the document's language (doc_lang)
  voice_lang  TEXT NOT NULL DEFAULT 'ar',             -- the call's language: the persona's lines are built in it
  params      TEXT NOT NULL DEFAULT '{}',             -- the masked inputs (no contact, no person's name)
  state       TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','gathering','writing','checking','done','failed')),
  step        TEXT NOT NULL DEFAULT '{}',             -- progress {gather, write}
  eta_s       INTEGER NOT NULL DEFAULT 0,
  cap_hash    TEXT NOT NULL DEFAULT '',               -- visitors: sha256 of the document key (the key itself is never stored)
  title       TEXT NOT NULL DEFAULT '',
  doc         TEXT NOT NULL DEFAULT '',               -- the customer document JSON (research-render.js); deadlines only
  say         TEXT NOT NULL DEFAULT '',               -- the spoken result line (≤ 220)
  block       TEXT NOT NULL DEFAULT '',               -- the persona's context block (≤ 1,200)
  counts      TEXT NOT NULL DEFAULT '{}',             -- by type, and the platform's own counts apart
  partial     INTEGER NOT NULL DEFAULT 0,
  pack        TEXT NOT NULL DEFAULT '{}',             -- INTERNAL: the evidence pack between the steps (blanked when done)
  sources     TEXT NOT NULL DEFAULT '[]',             -- INTERNAL: evidence id → origin, link, site, found date, query
  dropped     TEXT NOT NULL DEFAULT '[]',             -- INTERNAL: the checker's removals {sec, i, rule, text ≤ 200 masked}
  model       TEXT NOT NULL DEFAULT '',
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  neurons     INTEGER NOT NULL DEFAULT 0,
  web_units   INTEGER NOT NULL DEFAULT 0,
  error       TEXT NOT NULL DEFAULT '',               -- a code only
  told        TEXT NOT NULL DEFAULT '',               -- '' | announced | told | cut — the call page's delivery outcome
  alive_at    TEXT NOT NULL DEFAULT '',               -- the call page's last heartbeat (the automatic e-mail waits for it to stop)
  mail_state  TEXT NOT NULL DEFAULT '',               -- '' | sent | failed | skipped
  mailed_at   TEXT NOT NULL DEFAULT '',
  team_state  TEXT NOT NULL DEFAULT '' CHECK (team_state IN ('','ok','hidden')),
  team_hidden TEXT NOT NULL DEFAULT '[]',             -- evidence ids the team hid from the document
  team_note   TEXT NOT NULL DEFAULT '',
  team_by     TEXT NOT NULL DEFAULT '',
  team_at     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  done_at     TEXT NOT NULL DEFAULT '',
  expires_at  TEXT NOT NULL DEFAULT ''                -- retention: members +365 days, visitors +30 days
);
CREATE INDEX IF NOT EXISTS research_member ON research_jobs(member_id, created_at);
CREATE INDEX IF NOT EXISTS research_state ON research_jobs(state, updated_at);
CREATE INDEX IF NOT EXISTS research_team ON research_jobs(team_state, created_at);
CREATE INDEX IF NOT EXISTS research_expires ON research_jobs(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS research_callkey ON research_jobs(who, member_id, ticket_key, call_key) WHERE call_key != '';
