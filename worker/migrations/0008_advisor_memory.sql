-- Bassem's memory («ذاكرة باسم», src/memory.js): per member, the searches Bassem ran (platform directory, intel centre, web), the turns
-- of each live call, one deterministic summary per call and the facts the member stated. Read back at the start of the next call
-- (memoryContext → janna-session.js) and on demand (GET /api/advisor/memory?q=…).
-- PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS — no ALTER TABLE, no change to an existing table, no
-- seed rows. Safe on any database built from schema.sql (+0002–0006/0007) and safe to re-run. The integrator also appends this file
-- verbatim to schema.sql (new databases); tests exec schema.sql and then this file.
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0008_advisor_memory.sql
-- MEMORY POLICY (owner, 2026-11-18): the memory is PERMANENT and only grows — no member-facing deletion, no age-based retention, no
--   per-member row cap; the daily platform cron consolidates (a call without its final summary gets it rebuilt), it never deletes.
--   The only erasure is the owner's audited deletion of a whole member account for a formal legal data-subject request (Egyptian PDPL
--   151/2020: src/acc-members.js deleteMember, owner-only, reason required). E-mail addresses and phone numbers are masked BEFORE
--   storage; staff (Control Center bassem.read) can only read, and every staff read leaves one cc_audit row (bassem.memory_read).
-- kind: search | turn | summary | fact are written today; task | question | day are reserved for the next memory upgrade (tasks Bassem did,
--   questions the member asked, the daily consolidated digest) so they need no table rebuild. agent: bassem today; janna for her memory.
CREATE TABLE IF NOT EXISTS advisor_memory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL,                             -- members.id — only the member himself writes
  kind       TEXT NOT NULL CHECK (kind IN ('search', 'turn', 'summary', 'fact', 'task', 'question', 'day')),
  call_id    TEXT NOT NULL DEFAULT '',                  -- the live call ([A-Za-z0-9_.:-]{6,80}, the Anam session id); '' = outside a call
  at         TEXT NOT NULL,                             -- ISO time (server clock) of the first write; summaries / searches: the last update
  text       TEXT NOT NULL DEFAULT '',                  -- masked display text: turn / fact / summary line / query + best results (≤ 1,200)
  terms      TEXT NOT NULL DEFAULT '',                  -- " t1 t2 … " normalised search tokens (Arabic normalisation + English → Arabic)
  data_json  TEXT NOT NULL DEFAULT '{}',                -- kind-specific structure (≤ 6 KB): search {tool, query, market, count, results[≤5], sq,
                                                        --   new_since?} | turn {role, seq} | summary {topics, products, markets, opened, emails,
                                                        --   next, failed, said, tools, …} | fact {}
  hash       TEXT NOT NULL,                             -- de-duplication key within the member: a re-sent turn / search / fact updates its row
  agent      TEXT NOT NULL DEFAULT 'bassem' CHECK (agent IN ('bassem', 'janna'))   -- whose memory (Janna's: the next upgrade)
);
CREATE UNIQUE INDEX IF NOT EXISTS advisor_memory_dedup ON advisor_memory(member_id, hash);
CREATE INDEX IF NOT EXISTS advisor_memory_member ON advisor_memory(member_id, kind, id);
CREATE INDEX IF NOT EXISTS advisor_memory_call ON advisor_memory(member_id, call_id, kind);
CREATE INDEX IF NOT EXISTS advisor_memory_age ON advisor_memory(kind, at);
CREATE INDEX IF NOT EXISTS advisor_memory_when ON advisor_memory(member_id, at);   -- recall by day («امبارح», «آخر مرة»)
