-- Phase A QA fixes (journeys / security / honesty audits): indexes + back-fills. SAFE ON EVERY DATABASE (CREATE INDEX IF NOT
-- EXISTS + guarded UPDATEs) — run after 0004 (launch order on an empty D1: schema.sql → 0004 → 0005):
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0005_qa_fixes.sql
-- Its added columns are part of schema.sql; a database from before 0005 gets them from tools/upgrade-pre-0004.sql first.
-- routes delivered before this migration: their channel results
UPDATE inquiry_routes SET email_status = 'sent' WHERE email_sent = 1 AND email_status = '';
UPDATE inquiry_routes SET wa_status = 'sent' WHERE wa_sent = 1 AND wa_status = '';
CREATE INDEX IF NOT EXISTS quotes_route ON quotes(route_id, created_at);
CREATE INDEX IF NOT EXISTS wa_messages_queue ON wa_messages(member_id, status, created_at);
