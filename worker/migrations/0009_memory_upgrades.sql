-- 0009 — memory upgrades (owner, 2026-11-18 23:50: «ذاكرة باسم وجنة مهمين جداً … ذاكرة محدّثة يومياً، وأي تاسكات عملوها أو أسئلة
-- اتسألوها تتخزن عندهم، عشان ذاكرتهم هي اللي هتخلّي بنك معلوماتهم يكبر»):
--   memory_tasks    the tasks Bassem / Janna started, promised or were asked to do (src/tasks.js): open / done / cancelled, due date,
--                   the call they came from; created from tool outcomes and the client's requests, closed when the matching tool succeeds
--   memory_briefs   «ملخص العميل»: ONE persistent brief per client and persona (≤ 1,500 characters), refreshed by the daily job
--                   (src/daily.js) and given to every call at its start
--   janna_visitors  Janna's visitors (src/visitor.js): the random first-party visitor id the page keeps, KEYED HASHES of the e-mail /
--                   mobile they gave her (never the address or the number), the member account they registered (link), stage, interest
--   knowledge_bank  «بنك المعلومات» (src/knowledge.js): every question asked to Janna or Bassem with personal data stripped (no names,
--                   companies, e-mails, phones or ids), the best short answer, its source and counters; «محتاجة إجابة» for the team
-- Janna's call memory itself lives in advisor_memory (0008) with agent = 'janna' and member_id = 'v:' + the visitor id, and the daily
-- digest of a client's day is advisor_memory kind 'day' (both already allowed by 0008), so 0008 needs no change.
-- PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS — no ALTER, no DROP, no change to an existing table, no
-- seed rows. Safe on any database built from schema.sql (+0006 / 0007 / 0008) and safe to re-run. Also appended verbatim to schema.sql.
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0009_memory_upgrades.sql
-- MEMORY POLICY (owner, 2026-11-18): the memory is permanent — no member-facing or visitor-facing deletion and no age-based deletion.
--   The ONLY erasure is the owner's audited Control Center action for a formal legal data-subject request (Egyptian PDPL 151/2020):
--   POST /api/admin/cc/memory/erase (owner only, one person per call, legal reason required, one cc_audit row) and the account deletion
--   (src/acc-members.js deleteMember). A storage safety valve far above any real client (50,000 raw call turns / 10,000 searches per
--   client) may remove raw turns / searches ONLY when they are already covered by that client's day digest (kind 'day') and older than
--   30 days; summaries, day digests, facts, tasks, briefs and the knowledge bank are never pruned.
CREATE TABLE IF NOT EXISTS memory_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,                             -- whose task: members.id, or 'v:' + a Janna visitor id
  agent       TEXT NOT NULL DEFAULT 'bassem' CHECK (agent IN ('bassem', 'janna')),
  kind        TEXT NOT NULL DEFAULT 'other',             -- follow | deal | email | whatsapp | schedule | meeting | profile | register | quote | search | other
  title       TEXT NOT NULL,                             -- masked, cleaned text (≤ 160 characters)
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  source      TEXT NOT NULL DEFAULT 'tool',              -- request (the client asked) | promise (the persona said she / he would) | failed (a tool
                                                         --   that did not happen) | tool (a tool started it) | persona (the tasks tool) | staff
  due         TEXT NOT NULL DEFAULT '',                  -- Cairo local time 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'; '' = no date
  call_id     TEXT NOT NULL DEFAULT '',                  -- the live call it came from ('' = outside a call)
  ref         TEXT NOT NULL DEFAULT '',                  -- an item / deal reference when one is known
  tkey        TEXT NOT NULL,                             -- de-duplication key within (subject, agent)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  done_at     TEXT NOT NULL DEFAULT '',
  done_by     TEXT NOT NULL DEFAULT '',                  -- tool:<name> | persona | cron:<why>
  data_json   TEXT NOT NULL DEFAULT '{}'                 -- {seq, family, words…}
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_tasks_key ON memory_tasks(subject, agent, tkey);
CREATE INDEX IF NOT EXISTS memory_tasks_open ON memory_tasks(subject, agent, status, due);
CREATE INDEX IF NOT EXISTS memory_tasks_status ON memory_tasks(status, kind, updated_at);
CREATE INDEX IF NOT EXISTS memory_tasks_day ON memory_tasks(subject, created_at);

CREATE TABLE IF NOT EXISTS memory_briefs (
  subject     TEXT NOT NULL,                             -- members.id, or 'v:' + a Janna visitor id
  agent       TEXT NOT NULL DEFAULT 'bassem' CHECK (agent IN ('bassem', 'janna')),
  text        TEXT NOT NULL DEFAULT '',                  -- «ملخص العميل», ≤ 1,500 characters, masked
  data_json   TEXT NOT NULL DEFAULT '{}',                -- the sections {who, makes, markets, history, topics, deals, tasks, promises, prefs}
  day         TEXT NOT NULL DEFAULT '',                  -- the Cairo day the daily job built it for
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (subject, agent)
);

CREATE TABLE IF NOT EXISTS janna_visitors (
  visitor_id    TEXT PRIMARY KEY,                        -- the random first-party id the page keeps in localStorage ([0-9a-f]{32})
  member_id     TEXT NOT NULL DEFAULT '',                -- members.id once linked
  link_via      TEXT NOT NULL DEFAULT '',                -- session (signed in on that browser) | email | phone (matched by the daily job)
  linked_at     TEXT NOT NULL DEFAULT '',
  email_hash    TEXT NOT NULL DEFAULT '',                -- keyed hash (HMAC) of the normalised e-mail the visitor gave Janna — never the address
  phone_hash    TEXT NOT NULL DEFAULT '',                -- keyed hash (HMAC) of the normalised mobile — never the number
  first_at      TEXT NOT NULL,
  last_at       TEXT NOT NULL,
  calls         INTEGER NOT NULL DEFAULT 0,
  stage         TEXT NOT NULL DEFAULT 'new',             -- new | browsing | interested | lead | registering | member
  interest_json TEXT NOT NULL DEFAULT '{}',              -- {products[], markets[], sections[], plans[]}
  lang          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS janna_visitors_member ON janna_visitors(member_id);
CREATE INDEX IF NOT EXISTS janna_visitors_email ON janna_visitors(email_hash);
CREATE INDEX IF NOT EXISTS janna_visitors_phone ON janna_visitors(phone_hash);
CREATE INDEX IF NOT EXISTS janna_visitors_last ON janna_visitors(last_at);

CREATE TABLE IF NOT EXISTS knowledge_bank (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  qkey         TEXT NOT NULL UNIQUE,                     -- hash of the normalised question (intent + sorted content words)
  question     TEXT NOT NULL,                            -- the question, personal data stripped (≤ 200 characters)
  intent       TEXT NOT NULL DEFAULT 'other',            -- plans | register | payment | tenders | rfq | export | markets | factories | products | bassem | meeting | platform | other
  terms        TEXT NOT NULL DEFAULT '',                 -- " t1 t2 … " normalised words (lookup + near-duplicate merge)
  answer       TEXT NOT NULL DEFAULT '',                 -- the best short answer given (personal data stripped, ≤ 400 characters)
  source       TEXT NOT NULL DEFAULT '',                 -- the tool / data source of that answer (janna_lookup, bassem_intel, …), conversation, team
  source_rank  INTEGER NOT NULL DEFAULT 0,               -- team 9 · platform data 3 · platform pages 2 · web 1 · conversation 0
  status       TEXT NOT NULL DEFAULT 'answered' CHECK (status IN ('answered', 'needs_answer', 'team', 'hidden')), -- needs_answer = «محتاجة إجابة»
  asked        INTEGER NOT NULL DEFAULT 1,               -- how many calls asked it
  subjects     INTEGER NOT NULL DEFAULT 1,               -- about how many different clients asked it
  agents       TEXT NOT NULL DEFAULT '',                 -- " bassem janna "
  lang         TEXT NOT NULL DEFAULT '',
  merged_into  INTEGER NOT NULL DEFAULT 0,               -- a near-duplicate merged by the daily job: the entry it went into (this row stays)
  first_at     TEXT NOT NULL,
  last_at      TEXT NOT NULL,
  answered_by  TEXT NOT NULL DEFAULT '',                 -- the staff member who answered / approved it (members.id)
  answered_at  TEXT NOT NULL DEFAULT '',
  data_json    TEXT NOT NULL DEFAULT '{}'                -- {seen: [short keyed hashes of the askers, ≤ 64], answers: n}
);
CREATE INDEX IF NOT EXISTS knowledge_bank_status ON knowledge_bank(status, asked);
CREATE INDEX IF NOT EXISTS knowledge_bank_intent ON knowledge_bank(intent, merged_into);
CREATE INDEX IF NOT EXISTS knowledge_bank_last ON knowledge_bank(last_at);
