-- 0010_delete_requests.sql — «طلب حذف الحساب» / account deletion requests (app parity plan 2026-11-20, item account-delete-request:
-- Apple 5.1.1(v) and Google Play need a way to ask for the deletion of an account from inside the app, and Play a web link: /delete-account/).
-- A member signed in with a full e-mail-code session asks (POST /api/me/delete-request), or — only while the owner's switch
-- visitor_erase_request is on — a visitor asks to erase his conversations with Janna on that device (POST /api/janna/memory/erase-request,
-- his random visitor id only). The REQUEST DELETES NOTHING: the owner runs the existing audited deletion (Control Center «الأعضاء
-- والاشتراكات» → the member → حذف, which also erases Bassem's / Janna's memory of him) or the memory erasure (acc-memory.js), then marks
-- the request done in «طلبات حذف الحساب». Both switches (account_delete, visitor_erase_request: «🛠️ المطوّر» → «المزايا») ship OFF and
-- stay locked until this file is applied; the code answers 503 delete_off without the table (delete-requests.js).
-- Purely additive and idempotent (CREATE … IF NOT EXISTS only): safe to re-run. Apply ONLY with the manual GitHub workflow, which backs
-- up first: Actions → d1-migrate → Run workflow: migration = 0010_delete_requests.sql, confirm = migate-db.
CREATE TABLE IF NOT EXISTS cc_delete_requests (
  id          TEXT PRIMARY KEY,                         -- dr-<10 hex>
  kind        TEXT NOT NULL CHECK (kind IN ('member', 'visitor')),
  member_id   TEXT NOT NULL DEFAULT '',                 -- kind member: members.id (the account that asked, signed in)
  visitor_id  TEXT NOT NULL DEFAULT '',                 -- kind visitor: Janna's random visitor id (32 hex) — never an e-mail or a phone
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected')),
  lang        TEXT NOT NULL DEFAULT 'ar',               -- the language of the page it was asked from
  source      TEXT NOT NULL DEFAULT 'web',              -- web | app-ios | app-android (the platform's own apps, MIGApp user agent)
  created_at  TEXT NOT NULL,
  decided_at  TEXT NOT NULL DEFAULT '',
  decided_by  TEXT NOT NULL DEFAULT '',                 -- the owner who closed it
  note        TEXT NOT NULL DEFAULT ''                  -- the owner's note (team only, never shown publicly)
);
CREATE INDEX IF NOT EXISTS cc_delete_requests_status ON cc_delete_requests(status, created_at);
-- one open request per account and per visitor id (a repeat answers the same row)
CREATE UNIQUE INDEX IF NOT EXISTS cc_delete_requests_member_open ON cc_delete_requests(member_id) WHERE kind = 'member' AND status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS cc_delete_requests_visitor_open ON cc_delete_requests(visitor_id) WHERE kind = 'visitor' AND status = 'pending';
