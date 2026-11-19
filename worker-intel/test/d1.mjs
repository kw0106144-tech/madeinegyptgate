/* tiny D1 stand-in over node:sqlite (prepare/bind/all/first/run/batch) for handler tests */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export function makeD1(schemaPath) {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(schemaPath, "utf8"));
  /* D1 limits node:sqlite does not have, failed here as D1 would: at most 100 bound parameters per statement, a LIKE / GLOB pattern
     of at most 50 bytes (bound ones start with "%"; the search inlines its patterns as 'literals'), no flat OR chain deeper than 100 */
  const enc = new TextEncoder(), tooLong = p => typeof p === "string" && enc.encode(p).length > 50;
  const d1Check = (sql, a) => {
    if (a.length > 100) throw new Error("D1: too many bound parameters (" + a.length + " > 100)");
    for (const v of a) if (typeof v === "string" && v.startsWith("%") && tooLong(v)) throw new Error("D1: LIKE or GLOB pattern too complex: " + v);
    for (const m of sql.matchAll(/(?:GLOB|LIKE) '((?:[^']|'')*)'/g)) if (tooLong(m[1].replace(/''/g, "'"))) throw new Error("D1: LIKE or GLOB pattern too complex: " + m[1]);
    for (const part of sql.split(/[()]/)) if ((part.match(/ OR /g) || []).length >= 90) throw new Error("D1: expression tree is too large (maximum depth 100)");
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => { d1Check(sql, a); return stmt(sql, a); },
    all: async () => ({ results: db.prepare(sql).all(...args).map(r => ({ ...r })) }),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _exec: () => /^\s*(select|with)/i.test(sql) ? { results: db.prepare(sql).all(...args).map(r => ({ ...r })) } : { meta: { changes: Number(db.prepare(sql).run(...args).changes) } },
  });
  return { prepare: sql => stmt(sql), batch: async list => list.map(s => s._exec()), _db: db };
}
export function makeKV() { const m = new Map(); return { get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, String(v)); }, _m: m }; }
