// Test helpers: a Cloudflare D1-compatible adapter over node:sqlite running the real schema.sql, plus request/email fakes.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const plain = r => (r ? { ...r } : null);

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  async first(col) { const r = plain(this.db.prepare(this.sql).get(...this.args)); return r && col ? r[col] : r; }
  async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.args).map(plain), meta: {} }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  _runSync() { return this.db.prepare(this.sql).run(...this.args); }
}
export class D1 {
  constructor() { this.db = new DatabaseSync(":memory:"); this.db.exec(SCHEMA); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { this.db.exec("BEGIN"); try { const out = stmts.map(s => s._runSync()); this.db.exec("COMMIT"); return out.map(() => ({ success: true })); } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
  async exec(sql) { this.db.exec(sql); return { count: 1 }; }
}

export const BASE = "https://madeinegyptgate.com/api/advisor";
export function req(path, { method = "GET", body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  return new Request(BASE + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
export async function call(handler, env, path, opts) {
  const res = await handler(req(path, opts), env, {});
  let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, data, headers: res.headers };
}

/* A fake ForwardableEmailMessage (what Cloudflare Email Routing hands to email()) */
export function fakeEmail({ from, to, raw }) {
  const bytes = new TextEncoder().encode(raw);
  const m = {
    from, to, rawSize: bytes.length, canBeForwarded: true, rejected: null, forwarded: [],
    headers: new Headers(),
    raw: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
    setReject(r) { m.rejected = r; },
    async forward(rcpt, headers) { m.forwarded.push({ rcpt, deal: headers && headers.get("X-MIG-Deal") }); return { messageId: "fwd-1" }; },
  };
  for (const l of raw.split(/\r?\n\r?\n/)[0].split(/\r?\n/)) { const i = l.indexOf(":"); if (i > 0) try { m.headers.set(l.slice(0, i), l.slice(i + 1).trim()); } catch (e) { /* non-ASCII header value */ } }
  return m;
}

/* WhatsApp's real sending needs the Control Center switch «تشغيل إرسال واتساب الحقيقي» (src/service-keys.js, fail-closed: off by default).
   Tests that exercise a LIVE send (always against a mocked respond.io) turn it on here: wa.live = 1 after a recorded token test, then this
   isolate's service-key memo is reloaded (in production acc.js ccBoot loads it at the start of every request / cron run). */
export async function waSwitchOn(env, on = true) {
  const t = new Date().toISOString(), up = "ON CONFLICT(k) DO UPDATE SET scope = 'system', v = excluded.v, updated_at = excluded.updated_at";
  await env.DB.prepare(`INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('wa.live', 'system', ?, ?) ${up}`).bind(on ? "1" : "0", t).run();
  await env.DB.prepare(`INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('wa.test_ok_at', 'system', ?, ?) ${up}`).bind(t, t).run();
  const { loadServiceKeys } = await import("../src/service-keys.js");
  await loadServiceKeys(env, { fresh: true });
  return env;
}
