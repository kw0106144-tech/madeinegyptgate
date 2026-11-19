// Test helpers for the Pages Functions (node --test, no dependencies):
//   KV         Workers KV double (get {type:"json"} / put / delete, read & write counters, failure switch)
//   D1         Cloudflare D1 adapter over node:sqlite (worker/schema.sql when it loads, else the 4 tables auth needs)
//   assets()   env.ASSETS double that behaves like the Pages asset server (/x/ → x/index.html, /x → 308 /x/,
//              /x.html → 308 /x, /x/index.html → 308 /x/, 404.html with 404, SPA fallback without it, ETag + 304)
//   pctx()     Pages Function context {request, env, next, waitUntil, passThroughOnException}
//   getHTMLRewriter()  real lol-html (html-rewriter-wasm; set HTML_REWRITER_WASM=/path/to/node_modules/html-rewriter-wasm
//              or install it) wrapped in the Workers API, else MiniRewriter — a small DOM-based double of the API subset used.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { signSession, sha256hex } from "../_lib/seo-auth.js";

/* ---------- KV ---------- */
export class KV {
  constructor(init = {}) { this.m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])); this.reads = 0; this.writes = 0; this.fail = false; this.puts = []; }
  async get(k, o) {
    this.reads++;
    if (this.fail) throw new Error("KV unavailable");
    if (!this.m.has(k)) return null;
    const v = this.m.get(k), type = typeof o === "string" ? o : o && o.type;
    return type === "json" ? JSON.parse(v) : v;
  }
  async put(k, v, o) { this.writes++; if (this.fail) throw new Error("KV unavailable"); this.m.set(k, String(v)); this.puts.push({ k, o }); }
  async delete(k) { this.m.delete(k); }
  json(k) { return this.m.has(k) ? JSON.parse(this.m.get(k)) : null; }
}

/* ---------- D1 ---------- */
const MIN_SCHEMA = `
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, company TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT 'visitor', verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user', plan_expires TEXT NOT NULL DEFAULT '', email_verified_at TEXT NOT NULL DEFAULT '', last_seen_at TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS auth_sessions (sid_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '', last_seen_at TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, exp TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS blocks (kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, PRIMARY KEY (kind, value));`;
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
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.schema = "minimal";
    try { this.db.exec(readFileSync(new URL("../../worker/schema.sql", import.meta.url), "utf8")); this.schema = "worker/schema.sql"; }
    catch (e) { this.db = new DatabaseSync(":memory:"); this.db.exec(MIN_SCHEMA); }
  }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { this.db.exec("BEGIN"); try { const out = stmts.map(s => s._runSync()); this.db.exec("COMMIT"); return out.map(() => ({ success: true })); } catch (e) { this.db.exec("ROLLBACK"); throw e; } }
  async exec(sql) { this.db.exec(sql); return { count: 1 }; }
}
export const iso = ms => new Date(ms).toISOString();
/* member + live session → v2 token (same format as the Worker issues) */
export async function seedMember(d1, { id, email = "", role = "user", verified = true, sid = randomSid(), expDays = 30, revoked = "", sessionExpiresAt, secret }) {
  const t = iso(Date.now());
  d1.db.prepare("INSERT OR REPLACE INTO members (id, company, email, plan, verified, created_at, updated_at, role, email_verified_at) VALUES (?, '', ?, 'visitor', 0, ?, ?, ?, ?)").run(id, email, t, t, role, verified ? t : "");
  const exp = Math.floor(Date.now() / 1000) + expDays * 86400;
  d1.db.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)").run(await sha256hex(sid), id, t, sessionExpiresAt || iso(exp * 1000), revoked);
  return signSession(secret, id, sid, exp);
}
export const randomSid = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");

/* ---------- ASSETS (Pages asset server double) ---------- */
const TYPES = { html: "text/html; charset=utf-8", json: "application/json", txt: "text/plain; charset=utf-8", xml: "application/xml", js: "application/javascript", css: "text/css" };
export function assets(files) {
  const F = {};
  for (const [p, v] of Object.entries(files)) if (v !== undefined) F[p] = typeof v === "string" ? { body: v } : v && typeof v.body === "string" ? v : { body: JSON.stringify(v) };
  const typeOf = p => TYPES[(p.match(/\.([a-z0-9]+)$/i) || [])[1]] || "application/octet-stream";
  const tagOf = s => '"' + createHash("sha1").update(s).digest("hex").slice(0, 16) + '"';
  const to = (loc) => new Response(null, { status: 308, headers: { Location: loc } });
  const serve = (p, req, status = 200) => {
    const f = F[p], h = new Headers({ "Content-Type": f.type || typeOf(p), ETag: tagOf(f.body), "Cache-Control": "public, max-age=0, must-revalidate", "Content-Length": String(Buffer.byteLength(f.body)) });
    if (status === 200 && req.headers.get("If-None-Match") === h.get("ETag")) return new Response(null, { status: 304, headers: h });
    return new Response(req.method === "HEAD" ? null : f.body, { status, headers: h });
  };
  const A = {
    calls: [],
    async fetch(input, init) {
      const req = input instanceof Request ? (init ? new Request(input, init) : input) : new Request(String(input), init);
      const u = new URL(req.url);
      let p; try { p = decodeURIComponent(u.pathname); } catch (e) { p = u.pathname; }
      A.calls.push(p);
      if (p.endsWith("/index.html") && F[p]) return to(p.slice(0, -10));
      if (p.endsWith(".html") && F[p]) return to(p.slice(0, -5));
      if (F[p] && !p.endsWith(".html")) return serve(p, req);
      if (p.endsWith("/") && F[p + "index.html"]) return serve(p + "index.html", req);
      if (!p.endsWith("/") && F[p + "/index.html"]) return to(p + "/");
      if (!p.endsWith("/") && F[p + ".html"]) return serve(p + ".html", req);
      if (F["/404.html"]) return serve("/404.html", req, 404);
      return serve("/index.html", req); // no 404.html → single-page-app fallback (what Pages does)
    },
  };
  return A;
}

/* ---------- Pages Function context ---------- */
export function pctx(req, env, next) {
  const c = {
    request: req, env, params: {}, data: {}, functionPath: "", passThrough: false, waits: [],
    waitUntil(p) { c.waits.push(p); }, passThroughOnException() { c.passThrough = true; },
    next: next || ((input, init) => env.ASSETS.fetch(input ? (input instanceof Request ? input : new Request(String(input), init)) : req)),
  };
  return c;
}
export const SITE = "https://madeinegyptgate.com";
export function rq(path, { method = "GET", body, token, headers = {}, base = SITE } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h["Content-Type"]) h["Content-Type"] = typeof body === "string" ? "text/csv; charset=utf-8" : "application/json";
  if (token) h.Authorization = "Bearer " + token;
  return new Request(base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}

/* ---------- HTMLRewriter ---------- */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "title", "textarea"]);
const escText = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function parseSel(sel) {
  const parts = [];
  let rest = sel.trim(), comb = null;
  while (rest) {
    let m = rest.match(/^\s*>\s*/);
    if (m && m[0].includes(">")) { comb = ">"; rest = rest.slice(m[0].length); continue; }
    m = rest.match(/^\s+/);
    if (m) { comb = comb || " "; rest = rest.slice(m[0].length); continue; }
    m = rest.match(/^([a-zA-Z][a-zA-Z0-9-]*|\*)?((?:\[[^\]]+\])*)/);
    if (!m || !m[0]) throw new Error("MiniRewriter: unsupported selector " + sel);
    const attrs = [...m[2].matchAll(/\[\s*([^\s=\]]+)\s*(?:=\s*"([^"]*)")?\s*\]/g)].map(a => [a[1].toLowerCase(), a[2]]);
    parts.push({ tag: m[1] && m[1] !== "*" ? m[1].toLowerCase() : null, attrs, comb: parts.length ? comb || " " : null });
    comb = null; rest = rest.slice(m[0].length);
  }
  return parts;
}
const cmatch = (c, el) => (!c.tag || c.tag === el.name) && c.attrs.every(([n, v]) => el.attrs.has(n) && (v === undefined || el.attrs.get(n) === v));
function selMatch(parts, chain) { // chain: ancestors … element
  const rec = (pi, ci) => {
    if (!cmatch(parts[pi], chain[ci])) return false;
    if (pi === 0) return true;
    if (parts[pi].comb === ">") return ci > 0 && rec(pi - 1, ci - 1);
    for (let k = ci - 1; k >= 0; k--) if (rec(pi - 1, k)) return true;
    return false;
  };
  return rec(parts.length - 1, chain.length - 1);
}
function parseAttrs(s) {
  const m = new Map();
  for (const a of s.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) m.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
  return m;
}
const TAG = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
function parseHtml(html) {
  const root = { name: "#root", children: [] }, stack = [root];
  let pos = 0;
  while (pos < html.length) {
    TAG.lastIndex = pos;
    const m = TAG.exec(html);
    const end = m ? m.index : html.length;
    if (end > pos) stack[stack.length - 1].children.push({ text: html.slice(pos, end) });
    if (!m) break;
    pos = TAG.lastIndex;
    if (m[0].startsWith("<!")) { stack[stack.length - 1].children.push({ text: m[0] }); continue; }
    if (m[1]) {
      const name = m[1].toLowerCase();
      let i = stack.length - 1; while (i > 0 && stack[i].name !== name) i--;
      if (i === 0) { stack[stack.length - 1].children.push({ text: m[0] }); continue; }
      stack[i].endRaw = m[0]; stack.length = i;
      continue;
    }
    const el = { name: m[2].toLowerCase(), attrs: parseAttrs(m[3] || ""), raw: m[0], children: [], endRaw: "" };
    stack[stack.length - 1].children.push(el);
    if (VOID.has(el.name) || m[4]) continue;
    if (RAW.has(el.name)) {
      const close = html.toLowerCase().indexOf("</" + el.name, pos);
      const stop = close < 0 ? html.length : close, gt = close < 0 ? html.length : html.indexOf(">", close) + 1;
      if (stop > pos) el.children.push({ text: html.slice(pos, stop) });
      el.endRaw = html.slice(stop, gt); pos = gt;
      continue;
    }
    stack.push(el);
  }
  return root;
}
export class MiniRewriter {
  constructor() { this.h = []; this.doc = []; }
  on(sel, handlers) { this.h.push({ parts: parseSel(sel), handlers }); return this; }
  onDocument(handlers) { this.doc.push(handlers); return this; }
  run(html) {
    const root = parseHtml(html), hs = this.h;
    const ins = (o, c) => (o && o.html ? String(c) : escText(c));
    const walk = (node, chain) => {
      for (const ch of node.children) {
        if (ch.text !== undefined) continue;
        const ctrl = { el: ch, before: "", after: "", prepend: "", append: "", endBefore: "", inner: null, removed: false, changed: false, ends: [] };
        ch.ctrl = ctrl;
        const api = {
          tagName: ch.name,
          getAttribute: n => (ch.attrs.has(n.toLowerCase()) ? ch.attrs.get(n.toLowerCase()) : null),
          hasAttribute: n => ch.attrs.has(n.toLowerCase()),
          setAttribute(n, v) { ch.attrs.set(n.toLowerCase(), String(v)); ctrl.changed = true; return api; },
          removeAttribute(n) { ch.attrs.delete(n.toLowerCase()); ctrl.changed = true; return api; },
          setInnerContent(c, o) { ctrl.inner = ins(o, c); return api; },
          before(c, o) { ctrl.before += ins(o, c); return api; },
          after(c, o) { ctrl.after = ins(o, c) + ctrl.after; return api; },
          prepend(c, o) { ctrl.prepend = ins(o, c) + ctrl.prepend; return api; },
          append(c, o) { ctrl.append += ins(o, c); return api; },
          remove() { ctrl.removed = true; return api; },
          get removed() { return ctrl.removed; },
          onEndTag(fn) { if (VOID.has(ch.name)) throw new TypeError("no end tag"); ctrl.ends.push(fn); },
        };
        const full = [...chain, ch];
        for (const { parts, handlers } of hs) if (handlers.element && selMatch(parts, full)) handlers.element(api);
        if (!ctrl.removed && ctrl.inner === null) walk(ch, full);
        for (const fn of ctrl.ends) fn({ name: ch.name, before(c, o) { ctrl.endBefore += ins(o, c); }, after(c, o) { ctrl.after = ins(o, c) + ctrl.after; } });
      }
    };
    walk(root, []);
    const ser = node => node.children.map(ch => {
      if (ch.text !== undefined) return ch.text;
      const c = ch.ctrl || {};
      if (c.removed) return (c.before || "") + (c.after || "");
      const start = c.changed ? "<" + ch.name + [...ch.attrs].map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`).join("") + ">" : ch.raw;
      const inner = c.inner !== null && c.inner !== undefined ? c.inner : ser(ch);
      return (c.before || "") + start + (c.prepend || "") + inner + (c.append || "") + (c.endBefore || "") + ch.endRaw + (c.after || "");
    }).join("");
    return ser(root);
  }
  transform(res) {
    const self = this;
    const body = new ReadableStream({ async start(ctl) { const t = await res.text(); ctl.enqueue(new TextEncoder().encode(self.run(t))); ctl.close(); } });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
}
function wasmAdapter(mod) {
  return class WasmHTMLRewriter {
    constructor() { this.h = []; }
    on(sel, handlers) { this.h.push([sel, handlers]); return this; }
    onDocument() { return this; }
    transform(res) {
      const h = this.h;
      const body = new ReadableStream({
        async start(ctl) {
          const rw = new mod.HTMLRewriter(chunk => ctl.enqueue(new Uint8Array(chunk)));
          for (const [s, hh] of h) rw.on(s, hh);
          try { await rw.write(new Uint8Array(await res.arrayBuffer())); await rw.end(); } finally { rw.free(); }
          ctl.close();
        },
      });
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
  };
}
let cachedHR = null;
export function getHTMLRewriter() {
  if (cachedHR) return cachedHR;
  const req = createRequire(import.meta.url);
  for (const c of [process.env.HTML_REWRITER_WASM, "html-rewriter-wasm"].filter(Boolean)) {
    try { const mod = req(c); if (mod && mod.HTMLRewriter) return (cachedHR = { HR: wasmAdapter(mod), engine: "lol-html (html-rewriter-wasm)" }); } catch (e) { /* next */ }
  }
  return (cachedHR = { HR: MiniRewriter, engine: "MiniRewriter (test double; set HTML_REWRITER_WASM for real lol-html)" });
}
