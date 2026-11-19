// node --test for worker/src/content.js — content overlay collections, publish / compile / serve, edge actions through the SEO API,
// media (R2) uploads + serving, member self-service, approvals and the front desk (ACC-CONTRACT §3.2, §4, §8.4, §11.2, §12).
// Run: cd worker && node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/content.test.mjs
// No network: fetch is replaced per test and any unexpected URL fails the test. KV / R2 are Map-backed fakes.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";
import { D1 } from "./helpers.mjs";
import * as C from "../src/content.js";
import { signSession } from "../src/auth.js";
import { sha256, hex } from "../src/common.js";
import DATA from "../src/data.json"; // the build index the Worker ships (deploy.sh worker regenerates it, with DATA.n counts)

const MIG = readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8");
const SITE = "https://madeinegyptgate.com";
const AUTH = "Bearer v2.admin-test-token";

/* ---------------- fakes ---------------- */
class KV {
  constructor() { this.m = new Map(); this.ops = []; this.down = false; }
  async get(k, o) { if (this.down) throw new Error("kv down"); this.ops.push(["get", k]); const e = this.m.get(k); if (!e) return null; return o === "json" || (o && o.type === "json") ? JSON.parse(e.v) : e.v; }
  async getWithMetadata(k) { if (this.down) throw new Error("kv down"); this.ops.push(["getm", k]); const e = this.m.get(k); return e ? { value: e.v, metadata: e.md === undefined ? null : e.md } : { value: null, metadata: null }; }
  async put(k, v, o) { if (this.down) throw new Error("kv down"); this.ops.push(["put", k]); this.m.set(k, { v: String(v), md: o && o.metadata }); }
  async delete(k) { this.ops.push(["del", k]); this.m.delete(k); }
  async list() { return { keys: [...this.m.keys()].map(name => ({ name })), list_complete: true }; }
}
class R2 {
  constructor() { this.m = new Map(); }
  async put(k, v, o) { const u8 = v instanceof Uint8Array ? v : new Uint8Array(v); this.m.set(k, { u8: new Uint8Array(u8), o: o || {} }); return { key: k, size: u8.length }; }
  async get(k) { const e = this.m.get(k); if (!e) return null; return { key: k, size: e.u8.length, httpMetadata: e.o.httpMetadata, customMetadata: e.o.customMetadata, arrayBuffer: async () => e.u8.slice().buffer, body: new Blob([e.u8]).stream() }; }
  async head(k) { const e = this.m.get(k); return e ? { key: k, size: e.u8.length } : null; }
  async delete(k) { this.m.delete(k); }
}
const mkDB = () => { const d = new D1(); d.db.exec(MIG); d.db.exec(MIG); return d; }; // 0006 is idempotent: applied twice
const mkDBWith = v => { const d = mkDB(); d.db.prepare("INSERT INTO cc_overlay (v, at, js) VALUES (?, 'x', ?)").run(v, `window.MIGOVL_DATA={"v":${v}};\n`); return d; };
function mkEnv(extra = {}) {
  const env = { DB: mkDB(), SEO_KV: new KV(), MEDIA: new R2(), ADVISOR_SECRET: "s3cret-test", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", ...extra };
  if (env.SEO_KV) env.SEO_KV.m.set("seo:bundle", { v: '{"v":7,"ov":{},"rd":{}}', md: null }); // the SEO API's key: content.js must never touch it
  return env;
}
const ctx = () => { const p = []; return { waitUntil(x) { p.push(Promise.resolve(x).catch(() => {})); }, done: () => Promise.all(p), p }; };
const ALL = ["stats.read", "members.read", "content.read", "content.write", "content.publish", "content.toggle", "media.upload", "media.delete", "directory.read", "directory.write", "directory.verify", "directory.link",
  "legacy.contacts", "orders.read", "approvals.products", "approvals.company"];
const ROLE = { owner: ALL, admin: ALL.filter(p => p !== "content.toggle"), editor: ["stats.read", "content.read", "content.write", "content.publish", "media.upload", "media.delete", "directory.read", "directory.write", "approvals.products"],
  support: ["stats.read", "content.read", "directory.read", "orders.read", "legacy.contacts"] };
function mkAdm(role = "owner", o = {}) {
  const perms = new Set(ROLE[role]), log = [];
  return { member: { id: "u" + role, email: role + "@mig.test" }, role, perms: [...perms], can: p => perms.has(p), log, CC: o.CC || null, auth: AUTH,
    audit: o.audit || (async (action, type, id, before, after, summary) => { log.push({ action, type, id, before, after, summary }); return log.length; }) };
}
async function api(env, adm, method, path, body, headers = {}) {
  const h = { Authorization: AUTH, ...headers };
  if (body !== undefined && !(body instanceof Uint8Array)) h["Content-Type"] = "application/json";
  const c = ctx(), req = new Request(SITE + "/api/admin/cc" + path, { method, headers: h, body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
  const res = await C.handleContentAdmin(req, env, c, adm); await c.done();
  let data = null; try { data = await res.clone().json(); } catch (e) { /* not json */ }
  return { status: res.status, data, res };
}
const latestJs = async env => (await env.DB.prepare("SELECT js FROM cc_overlay ORDER BY v DESC LIMIT 1").first("js")) || "";
function runOverlay(js) { const w = {}; vm.createContext(w); w.window = w; vm.runInContext(js, w); return w.MIGOVL_DATA == null ? w.MIGOVL_DATA : JSON.parse(JSON.stringify(w.MIGOVL_DATA)); }

/* ---------------- fetch mocks ---------------- */
let realFetch, seo, mails, oe;
function mockFetch({ seoFail = 0, oembedOk = new Set(["miVnCNXcCpQ", "abcdefghijk", "dQw4w9WgXcQ"]) } = {}) {
  seo = { calls: [], ov: {}, rd: {}, fail: seoFail }; mails = []; oe = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), M = String(init.method || "GET").toUpperCase(), hd = init.headers || {}, auth = hd.Authorization || hd.authorization || "";
    const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
    if (u.origin === "https://api.resend.com" && u.pathname === "/emails") { const b = JSON.parse(init.body); mails.push({ to: b.to[0], subject: b.subject, text: b.text, id: hd["Idempotency-Key"] || "" }); return J({ id: "re_" + mails.length }); }
    if (u.origin === "https://www.youtube.com" && u.pathname === "/oembed") { const id = new URL(u.searchParams.get("url")).searchParams.get("v"); oe.push(id); return oembedOk.has(id) ? J({ title: "Video " + id, author_name: "Channel " + id }) : new Response("Not Found", { status: 404 }); }
    if (u.origin === SITE && u.pathname.startsWith("/api/seo/")) {
      seo.calls.push({ M, path: u.pathname, q: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null, auth });
      if (seo.fail > 0) { seo.fail--; return J({ code: "kv_off", error: "kv off" }, 503); }
      if (u.pathname === "/api/seo/page" && M === "GET") { const p = u.searchParams.get("path"), o = seo.ov[p]; return J({ path: p, override: o && o.robots ? { robots: o.robots } : null, meta: o && o.note ? { note: o.note } : null }); }
      if (u.pathname === "/api/seo/page" && M === "PATCH") { const b = JSON.parse(init.body), o = { ...(seo.ov[b.path] || {}) }; if (b.robots) o.robots = b.robots; else delete o.robots; if (b.note) o.note = b.note; else delete o.note; seo.ov[b.path] = o; return J({ ok: true }); }
      if (u.pathname === "/api/seo/redirects" && M === "GET") return J({ admin: Object.entries(seo.rd).map(([from, r]) => ({ from, ...r })), build_count: 0 });
      if (u.pathname === "/api/seo/redirects" && M === "POST") { const b = JSON.parse(init.body); seo.rd[b.from] = { to: b.to, code: b.code, note: b.note }; return J({ ok: true }); }
      if (u.pathname === "/api/seo/redirects" && M === "DELETE") { const f = u.searchParams.get("from"); if (!seo.rd[f]) return J({ code: "not_found" }, 404); delete seo.rd[f]; return J({ ok: true }); }
    }
    throw new Error("unexpected fetch " + M + " " + u);
  };
}
beforeEach(() => { realFetch = globalThis.fetch; mockFetch(); });
afterEach(() => { globalThis.fetch = realFetch; });

/* ---------------- images (real headers; PNG with valid CRCs) ---------------- */
function png(w, h, { text = false, trailer = "" } = {}) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "latin1"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (text) parts.push(chunk("tEXt", Buffer.from("Author\0Ahmed 01001234567", "latin1")), chunk("eXIf", Buffer.from("MM\0*GPS 30.04", "latin1")), chunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>", "latin1")));
  parts.push(chunk("IDAT", zlib.deflateSync(Buffer.alloc((w * 3 + 1) * h))), chunk("IEND", Buffer.alloc(0)));
  if (trailer) parts.push(Buffer.from(trailer, "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}
function jpeg(w, h, { exif = true, trailer = "" } = {}) {
  const seg = (m, data) => { const b = Buffer.alloc(4); b[0] = 0xff; b[1] = m; b.writeUInt16BE(data.length + 2, 2); return Buffer.concat([b, data]); };
  const parts = [Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"))];
  if (exif) parts.push(seg(0xe1, Buffer.from("Exif\0\0MM\0*GPSLatitude=30.0444;Owner=Ahmed", "latin1")), seg(0xed, Buffer.from("Photoshop 3.0\0IPTC", "latin1")), seg(0xfe, Buffer.from("<script>alert(1)</script>", "latin1")));
  parts.push(seg(0xdb, Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1)])));
  parts.push(seg(0xc0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0])));
  parts.push(seg(0xc4, Buffer.concat([Buffer.from([0x00, 1]), Buffer.alloc(15), Buffer.from([0])])));
  parts.push(seg(0xda, Buffer.from([1, 1, 0x00, 0, 63, 0])), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]), Buffer.from([0xff, 0xd9]));
  if (trailer) parts.push(Buffer.from(trailer, "latin1"));
  return new Uint8Array(Buffer.concat(parts));
}
function webp(w, h, { exif = true, xmp = true, x = true } = {}) {
  const ch = (cc, data) => { const hd = Buffer.alloc(8); hd.write(cc, 0, "latin1"); hd.writeUInt32LE(data.length, 4); return Buffer.concat([hd, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vx = Buffer.alloc(10); vx[0] = (exif ? 0x08 : 0) | (xmp ? 0x04 : 0); vx.writeUIntLE(w - 1, 4, 3); vx.writeUIntLE(h - 1, 7, 3);
  const l = Buffer.alloc(5); l[0] = 0x2f; l.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 1);
  const parts = [...(x ? [ch("VP8X", vx)] : []), ch("VP8L", l), ...(exif ? [ch("EXIF", Buffer.from("MM\0*GPS", "latin1"))] : []), ...(xmp ? [ch("XMP ", Buffer.from("<x:xmpmeta/>", "latin1"))] : [])];
  const bodyB = Buffer.concat(parts), riff = Buffer.alloc(12); riff.write("RIFF", 0, "latin1"); riff.writeUInt32LE(4 + bodyB.length, 4); riff.write("WEBP", 8, "latin1");
  return new Uint8Array(Buffer.concat([riff, bodyB]));
}
const has = (u8, s) => Buffer.from(u8).includes(Buffer.from(s, "latin1"));
async function upload(env, adm, bytes, type, purpose = "other") { return api(env, adm, "POST", "/media?purpose=" + purpose + "&name=x.png", bytes, { "Content-Type": type }); }
async function bannerImg(env, adm) { const r = await upload(env, adm, png(1200, 300), "image/png", "banner"); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.media.public_url; }

/* ======================================================================= collections (§4.4, §11.2.1) */
const FX = {
  fac: { key: "/factories/hydrohex/", seo: "/factories/hydrohex/", edit: { description: "محطات مياه وفلاتر ومعالجة مياه صناعية", gov: "QLB" },
    add: { name: "مصنع النور للبلاستيك", name_en: "Al Nour Plastics", sector: "الصناعات البلاستيكية والمطاط", type: "مصنع", gov: "GIZ", location: "6 أكتوبر، الجيزة", products: ["براميل", "جراكن"], products_en: ["Drums", "Jerrycans"] } },
  facx: { key: "إيجيتك للكابلات", edit: { description: "كابلات القوى", description_en: "Power cables", website: "https://www.elsewedyelectric.com/" } },
  prod: { key: "/industrial_products/فلفل-اسود/", edit: { price: "120 جنيه/كيلو" }, add: { name: "زيت زيتون بكر", name_en: "Virgin olive oil", category: "food", company_url: "https://www.madeinegyptgate.com/factories/hydrohex/" } },
  tend: { key: "TEN-2026-233|توريد وتركيب اجهزة حاسب آلى", edit: { deadline: "2026-12-30", gov: "CAI" }, add: { type: "مناقصة عامة", title: "توريد كابلات", title_en: "Supply of cables", entity: "شركة الكهرباء", source_url: "https://etenders.gov.eg/x/1" } },
  rfq: { key: "34207", edit: { qty: "1,200 م²" }, add: { title: "توريد براميل بلاستيك 220 لتر", details: "مطلوب 500 برميل", qty: "500 قطعة", gov: "GIZ" } },
  offer: { key: "seoudi-juhayna-cooking-cream-1-liter", edit: { price_egp: 250, old_price_egp: 299 }, add: { product_ar: "زيت عباد الشمس 1 لتر", product_en: "Sunflower oil 1 L", store_ar: "أسواق سعودي", price_egp: 95, old_price_egp: 110, valid_to: "2026-12-31", source_url: "https://seoudisupermarket.com/x", made_in_egypt: true, region_codes: ["CAI", "giz"] } },
  zone: { key: "sczone-sokhna-iz", edit: { status_ar: "قائمة وتعمل" }, add: { name_ar: "المنطقة الصناعية الجديدة", type: "industrial_area", region_code: "SUZ", source_url: "https://www.ida.gov.eg/ar/x" } },
  news: { key: "https://amwalalghad.com/2026/11/16/x/", edit: { category_ar: "طاقة" }, add: { title_ar: "افتتاح مصنع جديد", title_en: "A new factory opens", source_name: "أموال الغد", date: "2026-11-18", url: "https://amwalalghad.com/2026/11/18/y/" } },
  event: { key: "cairo-woodshow-2026", edit: { venue: "مركز القاهرة الدولي للمؤتمرات" }, add: { name_ar: "معرض البلاستيك", name_en: "Plastex", start_date: "2026-12-10", source_url: "https://plastex.com/" } },
  award: { key: "عقد تصميم وتنفيذ محطة معالجة الصرف الصحي الجديدة بطنطا (100 ألف م3/يوم)|2025-06-19|https://www.meed.com/kharafi-wins-egypt-wastewater-deal", edit: { city: "طنطا" },
    add: { title_ar: "ترسية عقد خط مياه", winner_ar: "شركة المقاولون العرب", date: "2026-11-01", source_url: "https://www.meed.com/x" } },
  opp: { key: "eg-tnd-003", edit: { closing_date: "2026-12-09" }, add: { title_ar: "توريد صوامع", entity_ar: "شركة مطاحن مصر العليا", publish_date: "2026-11-18", source_url: "https://meobserver.news/x" } },
  intl: { key: "MZ-EDM-554194-GO-RFB", edit: { title_en: "Supply of insulators" } },
  video: { key: "miVnCNXcCpQ", edit: { title_ar: "وزير الصناعة يتفقد المصانع" }, add: { url: "https://youtu.be/abcdefghijk", title_ar: "جولة في مصنع" } },
  proj: { key: "r001", edit: { stage: 5 }, add: { name: "محطة رياح جديدة", stage: 2, source_url: "https://enterpriseam.com/x" } },
  banner: { key: "img/ban-p-elhelal.jpg" },
  notice: { add: { text_ar: "المنصة بتتحدّث النهارده", text_en: "The platform is updating today", level: "info" } },
  cats: { key: "food", edit: { ar: "الأغذية والمشروبات", icon: "🍞" }, add: { key: "textile", ar: "الغزل والنسيج", en: "Textiles", icon: "🧵" } },
};
const ID_RX = { fac: /^c-[2-9a-hjkmnp-z]{8}$/, prod: /^p-[2-9a-hjkmnp-z]{8}$/, tend: /^TEN-\d{4}-C\d{3}$/, rfq: /^C10\d\d$/, offer: /^cc-of-[2-9a-hjkmnp-z]{8}$/, zone: /^cc-zone-[2-9a-hjkmnp-z]{8}$/,
  news: /^n-[2-9a-hjkmnp-z]{8}$/, event: /^cc-ev-[2-9a-hjkmnp-z]{8}$/, award: /^a-[2-9a-hjkmnp-z]{8}$/, opp: /^cc-tnd-7\d{5}$/, video: /^abcdefghijk$/, proj: /^cc-p\d+$/, banner: /^b-[2-9a-hjkmnp-z]{8}$/,
  notice: /^nt-[2-9a-hjkmnp-z]{8}$/, cats: /^cat-textile$/ };

describe("collections: base edit + hide + add for every collection, stored with named fields", () => {
  test("0006 runs twice on schema.sql (idempotent) and every cc_* table content.js uses exists", () => {
    const d = mkDB();
    for (const t of ["cc_content", "cc_overlay", "cc_edge", "cc_media", "cc_member_products", "cc_company_requests", "cc_locks", "cc_counters", "cc_settings", "cc_plans", "cc_audit"])
      assert.ok(d.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t), t);
  });
  for (const coll of Object.keys(FX)) test(coll, async () => {
    const env = mkEnv(), adm = mkAdm("owner"), f = FX[coll];
    if (f.key && f.edit) {
      const r = await api(env, adm, "POST", "/content/" + coll, { base_key: f.key, fields: f.edit });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.item.kind, "base"); assert.equal(r.data.item.state, "draft"); assert.equal(r.data.item.base_key, coll === "fac" || coll === "prod" ? f.key.normalize("NFC") : f.key);
      for (const [k, v] of Object.entries(f.edit)) assert.deepEqual(r.data.item.draft[k], k === "region_codes" ? v.map(x => x.toUpperCase()) : v, coll + "." + k);
      const again = await api(env, adm, "POST", "/content/" + coll, { base_key: f.key, fields: f.edit });
      assert.equal(again.status, 409); assert.equal(again.data.code, "exists"); assert.equal(again.data.id, r.data.item.id);
      const h = await api(env, adm, "POST", `/content/${coll}/${encodeURIComponent(r.data.item.id)}/hide`, {});
      assert.equal(h.status, 200); assert.equal(h.data.item.hidden, true);
      const u = await api(env, adm, "POST", `/content/${coll}/${encodeURIComponent(r.data.item.id)}/unhide`, {});
      assert.equal(u.data.item.hidden, false);
    }
    if (f.key && !f.edit) { // hide a base row without editing it (built-in banners, facx/intl rows)
      const r = await api(env, adm, "POST", `/content/${coll}/hide`, { base_key: f.key });
      assert.equal(r.status, 201, JSON.stringify(r.data)); assert.equal(r.data.item.hidden, true);
    }
    const addF = coll === "banner" ? { place: "partner", img: await bannerImg(env, adm), link: "/register.html#partner", title_ar: "شريكنا" } : f.add;
    if (addF) {
      const r = await api(env, adm, "POST", "/content/" + coll, { fields: addF });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.item.kind, "add");
      const id = r.data.item.draft.id || r.data.item.draft.key;
      assert.match(coll === "cats" ? r.data.item.id : id, ID_RX[coll], coll + " id " + id);
      if (coll === "fac") assert.equal(r.data.item.draft.url, "https://www.madeinegyptgate.com/factories/مصنع-النور-للبلاستيك-" + id.slice(2) + "/");
      if (coll === "prod") assert.match(r.data.item.draft.url, /^https:\/\/www\.madeinegyptgate\.com\/industrial_products\/زيت-زيتون-بكر-[2-9a-z]{8}\/$/);
      if (coll === "tend") assert.equal(r.data.item.draft.ref, id);
      if (coll === "rfq") { assert.equal(r.data.item.draft.no, id); assert.equal(r.data.item.draft.url, ""); }
      if (coll === "offer") { assert.equal(r.data.item.draft.discount_pct, 13.6); assert.equal(r.data.item.draft.price_sar, 95); assert.equal(r.data.item.draft.saudi_made, true); assert.deepEqual(r.data.item.draft.region_codes, ["CAI", "GIZ"]); }
      if (coll === "video") { assert.equal(r.data.item.draft.verified_oembed, true); assert.equal(r.data.item.draft.title_original, "Video abcdefghijk"); assert.equal(r.data.item.draft.thumb, "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"); }
      if (coll === "award") assert.equal(r.data.item.draft.value_sar_million, null);
      const p = await api(env, adm, "POST", "/content/publish", { ids: [r.data.item.id] });
      assert.equal(p.status, 200, JSON.stringify(p.data)); assert.ok(p.data.v > 0);
      const data = runOverlay(await latestJs(env));
      if (["banner", "notice", "cats"].includes(coll)) {
        if (coll === "banner") assert.equal(data.banners[0].id, id);
        if (coll === "notice") assert.equal(data.notices[0].id, id);
        if (coll === "cats") assert.deepEqual(data.cats.textile, { ar: "الغزل والنسيج", en: "Textiles", icon: "🧵", hidden: 0 });
      } else assert.equal(data.c[coll].a[0].id, id);
    } else if (FX[coll].edit) {
      const add = await api(env, adm, "POST", "/content/" + coll, { fields: { title_ar: "x" } });
      assert.equal(add.status, 400); assert.equal(add.data.code, "no_adds");
    }
  });
});

describe("validation errors (required, enums, invalid_url, invalid_contact, source_required, oEmbed)", () => {
  const cases = [
    ["fac", { name: "x", sector: "s", type: "مصنع" }, "required", "gov"],
    ["fac", { ...FX.fac.add, type: "مخزن" }, "invalid_enum", "type"],
    ["fac", { ...FX.fac.add, website: "javascript:alert(1)" }, "invalid_url", "website"],
    ["fac", { ...FX.fac.add, description: "اتصل بينا على 01001234567" }, "invalid_contact", "description"],
    ["fac", { ...FX.fac.add, products: ["براميل", "sales@factory-x.com"] }, "invalid_contact", "products"],
    ["fac", { ...FX.fac.add, gov: "XXX" }, "invalid_gov", "gov"],
    ["prod", { ...FX.prod.add, name: "زيت — واتساب 01112223334" }, "invalid_contact", "name"],
    ["prod", { ...FX.prod.add, category: "spaceships" }, "invalid_enum", "category"],
    ["prod", { ...FX.prod.add, image: "https://evil.example/x.png" }, "invalid_url", "image"],
    ["rfq", { title: "طلب", details: "كلمونا +20 100 123 4567" }, "invalid_contact", "details"],
    ["tend", { ...FX.tend.add, type: "مزاد" }, "invalid_enum", "type"],
    ["tend", { ...FX.tend.add, deadline: "2026-02-30" }, "invalid_date", "deadline"],
    ["zone", { ...FX.zone.add, type: "airport" }, "invalid_enum", "type"],
    ["news", { ...FX.news.add, url: "data:text/html,<script>alert(1)</script>" }, "invalid_url", "url"],
    ["event", { ...FX.event.add, source_url: "//evil.example/x" }, "invalid_url", "source_url"],
    ["offer", { ...FX.offer.add, source_url: "https://ex ample.com/x" }, "invalid_url", "source_url"],
    ["award", { ...FX.award.add, source_url: 'https://x.example/"onload' }, "invalid_url", "source_url"],
    ["opp", { ...FX.opp.add, status: "maybe" }, "invalid_enum", "status"],
    ["notice", { text_ar: "x", level: "red" }, "invalid_enum", "level"],
    ["notice", { text_ar: "x", link: "javascript:alert(1)" }, "invalid_url", "link"],
    ["banner", { place: "side" }, "invalid_enum", "place"],
    ["proj", { name: "x", stage: 9, source_url: "https://x.example/" }, "invalid_number", "stage"],
    ["proj", { name: "x", stage: 1 }, "required", "source_url"],
    ["video", { url: "https://vimeo.com/123", title_ar: "x" }, "invalid_youtube", "url"],
    ["cats", { key: "Bad Key!", ar: "x" }, "invalid_value", "key"],
    ["fac", { ...FX.fac.add, secret_field: 1 }, "unknown_field", "secret_field"],
  ];
  for (const [coll, fields, code, field] of cases) test(`${coll}: ${code} (${field})`, async () => {
    const env = mkEnv(), r = await api(env, mkAdm(), "POST", "/content/" + coll, { fields });
    assert.equal(r.status, 422, JSON.stringify(r.data)); assert.equal(r.data.code, code);
    assert.ok(r.data.errors.some(e => e.field === field && e.code === code), JSON.stringify(r.data.errors));
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content").first("n"), 0);
  });
  test("source_required on publish: a sourced collection's add without a source stays a draft (import drafts)", async () => {
    const env = mkEnv(), adm = mkAdm();
    for (const coll of ["tend", "news", "event", "award", "offer", "zone", "proj", "opp"]) {
      const f = { ...FX[coll].add }; const src = coll === "news" ? "url" : "source_url"; delete f[src];
      const u = await C.upsert(env, { coll, kind: "add", id: "L" + coll, fields: f, by: "import", source: "import" });
      assert.ok(u.warnings.some(w => w.field === src), coll);
      const p = await api(env, adm, "POST", "/content/publish", { ids: [u.item.id] });
      assert.equal(p.status, 422, coll); assert.equal(p.data.code, coll === "news" || coll === "proj" ? "required" : "source_required", coll + " " + JSON.stringify(p.data));
      assert.ok(p.data.errors[0].errors.some(e => e.code === "source_required" || e.field === src));
    }
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_overlay").first("n"), 0);
    const all = await api(env, adm, "POST", "/content/publish", { all: true }); // «نشر الكل»: drafts that cannot be published are skipped and reported
    assert.equal(all.status, 200); assert.equal(all.data.published, 0); assert.equal(all.data.skipped.length, 8);
  });
  test("a base edit that clears its source cannot be published (source_required)", async () => {
    const env = mkEnv(), adm = mkAdm();
    const r = await api(env, adm, "POST", "/content/tend", { base_key: FX.tend.key, fields: { source_url: "" } });
    const p = await api(env, adm, "POST", "/content/publish", { ids: [r.data.item.id] });
    assert.equal(p.status, 422); assert.equal(p.data.code, "source_required");
  });
  test("video: only oEmbed-confirmed videos can be published", async () => {
    const env = mkEnv(), adm = mkAdm();
    const r = await api(env, adm, "POST", "/content/video", { fields: { url: "https://www.youtube.com/watch?v=zzzzzzzzzzz", title_ar: "فيديو" } });
    assert.equal(r.status, 201); assert.equal(r.data.item.draft.verified_oembed, false); assert.ok(r.data.warnings.some(w => w.code === "oembed_required"));
    assert.deepEqual(oe, ["zzzzzzzzzzz"]);
    const p = await api(env, adm, "POST", "/content/publish", { ids: [r.data.item.id] });
    assert.equal(p.status, 422); assert.equal(p.data.code, "oembed_required");
    const dup = await api(env, adm, "POST", "/content/video", { fields: { url: "https://youtu.be/zzzzzzzzzzz", title_ar: "x" } });
    assert.equal(dup.status, 409); assert.equal(dup.data.code, "exists");
  });
  test("fac verified needs directory.verify; facx / intl have no adds; banner base rows only hide; notices have no base rows", async () => {
    const env = mkEnv();
    const ed = await api(env, mkAdm("editor"), "POST", "/content/fac", { base_key: FX.fac.key, fields: { verified: 1 } });
    assert.equal(ed.status, 403); assert.equal(ed.data.need, "directory.verify");
    const ok = await api(env, mkAdm("admin"), "POST", "/content/fac", { base_key: FX.fac.key, fields: { verified: 1 } });
    assert.equal(ok.status, 201); assert.equal(ok.data.item.draft.verified, 1);
    assert.equal((await api(env, mkAdm(), "POST", "/content/notice", { base_key: "x", fields: {} })).data.code, "no_base");
    const bb = await api(env, mkAdm(), "POST", "/content/banner", { base_key: FX.banner.key, fields: { title_ar: "x" } });
    assert.equal(bb.status, 422); assert.equal(bb.data.code, "readonly");
  });
  test("roles: support reads only, editor writes content but not the overlay switch, admin cannot toggle (owner only)", async () => {
    const env = mkEnv();
    assert.equal((await api(env, mkAdm("support"), "GET", "/content/tend")).status, 200);
    const s = await api(env, mkAdm("support"), "POST", "/content/tend", { fields: FX.tend.add }); assert.equal(s.status, 403); assert.equal(s.data.need, "content.write");
    assert.equal((await api(env, mkAdm("support"), "POST", "/content/fac", { fields: FX.fac.add })).status, 403);
    assert.equal((await api(env, mkAdm("editor"), "POST", "/content/tend", { fields: FX.tend.add })).status, 201);
    const t = await api(env, mkAdm("admin"), "POST", "/content/overlay-toggle", { enabled: false }); assert.equal(t.status, 403); assert.equal(t.data.code, "owner_only");
    assert.equal((await api(env, mkAdm("support"), "GET", "/content/counts")).status, 200);
    const none = await C.handleContentAdmin(new Request(SITE + "/api/admin/cc/content/tend"), env, ctx(), null); assert.equal(none.status, 401);
  });
});

/* ======================================================================= compile / publish / serve (§4.2, §4.3, §11.2.2–3) */
async function seedAll(env, adm) { // one edit, one hide and one add (where adds exist) in every collection
  const ids = [];
  for (const coll of Object.keys(FX)) {
    const f = FX[coll];
    if (f.key && f.edit) ids.push((await api(env, adm, "POST", "/content/" + coll, { base_key: f.key, fields: f.edit })).data.item.id);
    const hk = { fac: "/factories/تشكيل-المعادن-في-السادات/", facx: "شركة مخفية", prod: "/industrial_products/كركم/", tend: "TEN-2026-1|x", rfq: "1", offer: "o-hidden", zone: "z-hidden", news: "https://news.example/hidden", event: "e-hidden",
      award: "a|2025-01-01|", opp: "eg-tnd-001", intl: "X-1", video: "hiddenvid01", proj: "r002", banner: "img/ban-p-elhelal.jpg", cats: "other" }[coll];
    if (hk) ids.push((await api(env, adm, "POST", `/content/${coll}/hide`, { base_key: hk })).data.item.id);
    const addF = coll === "banner" ? { place: "home", img: await bannerImg(env, adm), title_ar: "بانر" } : f.add;
    if (addF) ids.push((await api(env, adm, "POST", "/content/" + coll, { fields: addF })).data.item.id);
  }
  return ids;
}
describe("compile + publish", () => {
  test("publish all → one file with every collection; deterministic; v strictly increasing; parses in vm; KV acc:overlay + prev", async () => {
    const env = mkEnv(), adm = mkAdm();
    await seedAll(env, adm);
    const p1 = await api(env, adm, "POST", "/content/publish", { all: true });
    assert.equal(p1.status, 200, JSON.stringify(p1.data)); assert.equal(p1.data.skipped.length, 0); assert.ok(p1.data.published >= 40, String(p1.data.published));
    const js1 = await latestJs(env);
    assert.ok(js1.startsWith("window.MIGOVL_DATA="), js1.slice(0, 40));
    const d1 = runOverlay(js1);
    assert.equal(d1.v, p1.data.v);
    for (const coll of ["fac", "facx", "prod", "tend", "rfq", "offer", "zone", "news", "event", "award", "opp", "intl", "video", "proj"]) assert.ok(d1.c[coll], coll);
    assert.deepEqual(d1.c.fac.e["/factories/hydrohex/"], FX.fac.edit);
    assert.deepEqual(d1.c.fac.h, ["/factories/تشكيل-المعادن-في-السادات/"]);
    assert.equal(d1.c.fac.a[0].name, "مصنع النور للبلاستيك"); assert.equal(d1.c.fac.a[0].type, "مصنع");
    assert.deepEqual(d1.c.offer.e["seoudi-juhayna-cooking-cream-1-liter"].price_aed, 250);
    assert.equal(d1.c.offer.e["seoudi-juhayna-cooking-cream-1-liter"].discount_pct, 16.4);
    assert.ok(d1.c.offer.e["seoudi-juhayna-cooking-cream-1-liter"].source_checked); // the publish day
    assert.deepEqual(d1.banner_hide, ["img/ban-p-elhelal.jpg"]); assert.equal(d1.banners.length, 1); assert.equal(d1.notices.length, 1);
    assert.equal(d1.cats.food.icon, "🍞"); assert.equal(d1.cats.other.hidden, 1); assert.equal(d1.cats.textile.hidden, 0);
    assert.equal(d1.tr["مصنع النور للبلاستيك"], "Al Nour Plastics"); assert.equal(d1.tr["براميل"], "Drums"); assert.equal(d1.tr["توريد كابلات"], "Supply of cables");
    assert.deepEqual(d1.pay, { ready: false, manual: false });
    assert.equal(d1.plans.list.basic.price_egp, 10000); assert.equal(d1.plans.vat_bp, 1400); assert.equal(d1.settings.contact_email, "info@madeinegyptgate.com");
    assert.ok(!("mail.provider" in d1.settings) && !("pay.mode" in d1.settings), "only public settings");
    assert.equal(d1.c.prod.a[0].legacy_img, undefined);
    assert.equal(env.SEO_KV.m.get("acc:overlay").v, js1); assert.equal(env.SEO_KV.m.get("acc:overlay").md.v, p1.data.v);
    const p2 = await api(env, adm, "POST", "/content/publish", { all: true }); // nothing changed: the same data, a newer version
    assert.equal(p2.status, 200); assert.ok(p2.data.v > p1.data.v);
    const d2 = runOverlay(await latestJs(env));
    for (const k of ["c", "tr", "hp", "cats", "banners", "banner_hide", "notices", "plans", "settings", "pay"]) assert.deepEqual(d2[k], d1[k], k);
    assert.equal(env.SEO_KV.m.get("acc:overlay:prev").v, js1);
    assert.equal(env.SEO_KV.m.get("seo:bundle").v, '{"v":7,"ov":{},"rd":{}}'); assert.ok(!env.SEO_KV.ops.some(o => o[0] === "put" && !o[1].startsWith("acc:")));
    const st = await api(env, adm, "GET", "/content/status"); assert.equal(st.data.v, p2.data.v); assert.equal(st.data.kv, true); assert.equal(st.data.drafts, 0);
  });
  test("an edit becomes live only at publish; discard returns to the live copy; a revert drops the base row after publishing", async () => {
    const env = mkEnv(), adm = mkAdm();
    const r = await api(env, adm, "POST", "/content/tend", { base_key: FX.tend.key, fields: { gov: "CAI" }, publish: true });
    assert.equal(r.data.item.state, "published");
    const e = await api(env, adm, "PATCH", "/content/tend/" + r.data.item.id, { fields: { gov: "GIZ", bond: "5,000" } });
    assert.equal(e.data.item.state, "draft"); assert.deepEqual(e.data.item.live, { gov: "CAI" });
    assert.deepEqual(runOverlay(await latestJs(env)).c.tend.e[FX.tend.key], { gov: "CAI" });
    const d = await api(env, adm, "POST", `/content/tend/${r.data.item.id}/discard`, {});
    assert.equal(d.data.item.state, "published"); assert.deepEqual(d.data.item.draft, { gov: "CAI" });
    const n = await api(env, adm, "PATCH", "/content/tend/" + r.data.item.id, { fields: { gov: null } }); // null = back to the build value
    assert.deepEqual(n.data.item.draft, {});
    const rv = await api(env, adm, "DELETE", "/content/tend/" + r.data.item.id, { confirm: true, publish: true });
    assert.equal(rv.status, 200, JSON.stringify(rv.data)); assert.equal(rv.data.result, "pending");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content").first("n"), 0);
    assert.equal(runOverlay(await latestJs(env)).c.tend, undefined);
    assert.equal((await api(env, adm, "DELETE", "/content/tend/x", {})).status, 404);
  });
  test("delete: a never-published add disappears at once; a published add waits for the next publish (state unpublished)", async () => {
    const env = mkEnv(), adm = mkAdm();
    const a = await api(env, adm, "POST", "/content/news", { fields: FX.news.add });
    assert.equal((await api(env, adm, "DELETE", "/content/news/" + a.data.item.id, {})).data.code, "confirm_required");
    assert.equal((await api(env, adm, "DELETE", "/content/news/" + a.data.item.id, { confirm: true })).data.result, "deleted");
    const b = await api(env, adm, "POST", "/content/news", { fields: FX.news.add, publish: true });
    assert.equal(runOverlay(await latestJs(env)).c.news.a.length, 1);
    const del = await api(env, adm, "DELETE", "/content/news/" + b.data.item.id, { confirm: true });
    assert.equal(del.data.result, "pending");
    assert.equal((await api(env, adm, "GET", "/content/news/" + b.data.item.id)).data.item.state, "unpublished");
    assert.equal((await api(env, adm, "PATCH", "/content/news/" + b.data.item.id, { fields: { title_ar: "y" } })).status, 409);
    const other = await api(env, adm, "POST", "/content/zone", { fields: FX.zone.add });
    await api(env, adm, "POST", "/content/publish", { ids: [other.data.item.id] }); // any publish carries the pending deletion
    assert.equal(runOverlay(await latestJs(env)).c.news, undefined);
    assert.equal((await api(env, adm, "GET", "/content/news")).data.total, 0); // gone for good: out of the list
    assert.equal((await api(env, adm, "GET", "/content/news?deleted=1")).data.total, 1);
  });
  test("513 KiB → 413 overlay_too_large and nothing published", async () => {
    const env = mkEnv(), adm = mkAdm(), t = new Date().toISOString(), big = "ن".repeat(4000);
    for (let i = 0; i < 80; i++) await env.DB.prepare("INSERT INTO cc_content (id, coll, kind, state, draft_json, created_at, updated_at) VALUES (?, 'news', 'add', 'draft', ?, ?, ?)")
      .bind("n-big" + String(i).padStart(3, "0"), JSON.stringify({ id: "n-big" + i, title_ar: "خبر " + i, source_name: "س", date: "2026-11-18", url: "https://x.example/" + i, summary_ar: big }), t, t).run();
    const p = await api(env, adm, "POST", "/content/publish", { all: true });
    assert.equal(p.status, 413, JSON.stringify(p.data).slice(0, 200)); assert.equal(p.data.code, "overlay_too_large"); assert.ok(p.data.bytes > C.OVERLAY_LIMIT); assert.equal(p.data.limit, 524288);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_overlay").first("n"), 0);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE state = 'published'").first("n"), 0);
    assert.equal(env.SEO_KV.m.has("acc:overlay"), false);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_locks").first("n"), 0, "lock released");
  });
  test("KV missing → the publish succeeds in D1, /data/overlay.js serves from D1, status kv:false; cron heals KV", async () => {
    const env = mkEnv(); env.SEO_KV.down = true; const adm = mkAdm();
    const p = await api(env, adm, "POST", "/content/zone", { fields: FX.zone.add, publish: true });
    assert.equal(p.status, 201); assert.equal(p.data.kv, false);
    const st = await api(env, adm, "GET", "/content/status"); assert.equal(st.data.kv, false);
    const env2 = { DB: env.DB }; // another isolate without KV
    const r = await C.serveOverlay(new Request(SITE + "/data/overlay.js?v=abc"), env2, ctx());
    assert.equal(r.status, 200); assert.equal(runOverlay(await r.text()).v, p.data.v);
    env.SEO_KV.down = false;
    const cr = await C.contentCron(env, Date.now()); assert.equal(cr.kv, "healed"); assert.equal(+env.SEO_KV.m.get("acc:overlay").md.v, p.data.v);
    assert.equal((await C.contentCron(env, Date.now())).kv, "ok");
  });
  test("overlay emergency off (owner): no-op body, ETag changes; back on restores the file", async () => {
    const env = mkEnv(), owner = mkAdm("owner");
    const p = await api(env, owner, "POST", "/content/notice", { fields: FX.notice.add, publish: true });
    const t = await api(env, owner, "POST", "/content/overlay-toggle", { enabled: false });
    assert.equal(t.status, 200); assert.equal(t.data.enabled, false); assert.equal(owner.log.at(-1).action, "content.toggle");
    const r = await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: env.DB, SEO_KV: env.SEO_KV }, ctx());
    assert.equal(await r.text(), "window.MIGOVL_DATA=null;\n"); assert.equal(r.headers.get("ETag"), `"ovl-${p.data.v}-off"`);
    const r2 = await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: env.DB }, ctx()); // D1 path honours the switch too
    assert.equal(await r2.text(), "window.MIGOVL_DATA=null;\n");
    assert.equal((await api(env, owner, "GET", "/content/status")).data.enabled, false);
    assert.equal((await C.contentCounts(env)).news, 122);
    await api(env, owner, "POST", "/content/overlay-toggle", { enabled: true });
    const r3 = await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: env.DB, SEO_KV: env.SEO_KV }, ctx());
    assert.equal(runOverlay(await r3.text()).notices.length, 1);
  });
  test("plans / settings / pay hand-off: publishOverlay without ids recompiles; CC.payments.payReady feeds pay; private settings never compiled", async () => {
    const env = mkEnv();
    await env.DB.prepare("UPDATE cc_plans SET price_egp = 12000, name_ar = '<b>الأساسية</b>' WHERE plan = 'basic'").run();
    await env.DB.prepare("UPDATE cc_settings SET v = 'https://wa.me/201279188996' WHERE k = 'social_x'").run();
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('social_tiktok', 'public', 'javascript:alert(1)', ?)").bind(new Date().toISOString()).run();
    await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('cats', 'public', ?, ?)").bind(JSON.stringify({ cosm: { ar: "مستحضرات", icon: "💄" } }), new Date().toISOString()).run();
    const CC = { payments: { payReady: async () => ({ ready: true, manual: true, provider: "paymob" }) } };
    const r = await C.publishOverlay(env, { by: "admin@mig.test", reason: "plans", CC });
    const d = runOverlay(await latestJs(env));
    assert.equal(r.v, d.v); assert.equal(d.plans.list.basic.price_egp, 12000); assert.equal(d.plans.list.basic.name_ar, "‹b›الأساسية‹/b›");
    assert.equal(d.settings.social_x, "https://wa.me/201279188996"); assert.equal(d.settings.social_tiktok, undefined); assert.equal(d.settings.cats, undefined);
    assert.deepEqual(d.cats.cosm, { ar: "مستحضرات", icon: "💄" });
    assert.deepEqual(d.pay, { ready: true, manual: true });
    await C.publishOverlay(env, { by: "x", reason: "settings" }); // no CC: the previous pay state is kept
    assert.deepEqual(runOverlay(await latestJs(env)).pay, { ready: true, manual: true });
    const cron = await C.contentCron(env, Date.now(), { payments: { payReady: async () => ({ ready: false, manual: false }) } });
    assert.equal(cron.pay, "republished"); assert.deepEqual(runOverlay(await latestJs(env)).pay, { ready: false, manual: false });
    assert.equal((await C.contentCron(env, Date.now(), { payments: { payReady: async () => ({ ready: false, manual: false }) } })).pay, "ok");
  });
  test("cc_overlay keeps the newest 20 versions", async () => {
    const env = mkEnv();
    for (let i = 0; i < 23; i++) await C.publishOverlay(env, { by: "x", reason: "t" });
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_overlay").first("n"), 20);
  });
});

describe("GET /data/overlay.js", () => {
  test("headers, ETag / 304, HEAD, ?v= ignored; memo → KV → D1 → no-op; never a 5xx", async () => {
    const env = mkEnv(), adm = mkAdm();
    const none = await C.serveOverlay(new Request(SITE + "/data/overlay.js"), {}, ctx());
    assert.equal(none.status, 200); assert.equal(await none.text(), "window.MIGOVL_DATA=null;\n");
    assert.equal(none.headers.get("Content-Type"), "application/javascript; charset=utf-8"); assert.equal(none.headers.get("Cache-Control"), "public, max-age=60, stale-while-revalidate=300");
    assert.equal(none.headers.get("X-Content-Type-Options"), "nosniff"); assert.equal(none.headers.get("Access-Control-Allow-Origin"), null);
    const broken = await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: { prepare() { throw new Error("db down"); } }, SEO_KV: { getWithMetadata() { throw new Error("kv down"); } } }, ctx());
    assert.equal(broken.status, 200); assert.equal(await broken.text(), "window.MIGOVL_DATA=null;\n");
    const p = await api(env, adm, "POST", "/content/event", { fields: FX.event.add, publish: true });
    const r = await C.serveOverlay(new Request(SITE + "/data/overlay.js?v=123"), env, ctx());
    assert.equal(r.headers.get("ETag"), `"ovl-${p.data.v}"`); assert.equal(r.headers.get("X-Overlay-V"), String(p.data.v));
    const nm = await C.serveOverlay(new Request(SITE + "/data/overlay.js", { headers: { "If-None-Match": `W/"ovl-${p.data.v}"` } }), env, ctx());
    assert.equal(nm.status, 304); assert.equal(await nm.text(), "");
    const hd = await C.serveOverlay(new Request(SITE + "/data/overlay.js", { method: "HEAD" }), env, ctx());
    assert.equal(hd.status, 200); assert.equal(await hd.text(), "");
    assert.equal((await C.serveOverlay(new Request(SITE + "/data/overlay.js", { method: "POST" }), env, ctx())).status, 405);
    // the isolate memo answers first (keyed by env.DB): a changed KV is not read for 30 s
    const kvOnly = new KV(); kvOnly.m.set("acc:overlay", { v: "window.MIGOVL_DATA={\"v\":5};\n", md: { v: 5, enabled: 1 } });
    assert.equal(runOverlay(await (await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: env.DB, SEO_KV: kvOnly }, ctx())).text()).v, p.data.v);
    // another isolate: KV before D1
    const db3 = mkDB(); await db3.prepare("INSERT INTO cc_overlay (v, at, js) VALUES (3, 'x', ?)").bind("window.MIGOVL_DATA={\"v\":3};\n").run();
    assert.equal(runOverlay(await (await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: db3, SEO_KV: kvOnly }, ctx())).text()).v, 5);
    const kvEmpty = new KV(), c3 = ctx(); // KV empty → D1, and KV is healed in the background
    assert.equal(runOverlay(await (await C.serveOverlay(new Request(SITE + "/data/overlay.js"), { DB: mkDBWith(3), SEO_KV: kvEmpty }, c3)).text()).v, 3);
    await c3.done(); assert.equal(+kvEmpty.m.get("acc:overlay").md.v, 3);
    const dbOnly = { DB: mkDB() }; // empty D1 (another database) → no-op
    assert.equal(await (await C.serveOverlay(new Request(SITE + "/data/overlay.js"), dbOnly, ctx())).text(), "window.MIGOVL_DATA=null;\n");
  });
  test("caches.default: other isolates of the PoP share ONE key for both hosts; the publishing isolate sees a publish at once; a publish purges the key", async () => {
    const store = new Map(); let puts = 0;
    globalThis.caches = { default: { async match(req) { const r = store.get(req.url); return r ? r.clone() : undefined; }, async put(req, res) { puts++; store.set(req.url, res.clone()); }, async delete(req) { return store.delete(req.url); } } };
    try {
      const env = mkEnv(), adm = mkAdm();
      const p1 = await api(env, adm, "POST", "/content/notice", { fields: FX.notice.add, publish: true });
      const iso2 = { DB: mkDBWith(p1.data.v) }; // another isolate (its own memo) that finds the version in D1
      const c1 = ctx(); const a = await C.serveOverlay(new Request("https://www.madeinegyptgate.com/data/overlay.js?v=1"), iso2, c1); await c1.done();
      assert.equal(puts, 1); assert.deepEqual([...store.keys()], [SITE + "/data/overlay.js"], "one canonical key, whatever the host");
      const b = await C.serveOverlay(new Request(SITE + "/data/overlay.js?v=2"), { DB: mkDB() }, ctx()); // a third isolate with an EMPTY D1: the PoP cache answers
      assert.equal(await b.text(), await a.text()); assert.equal(b.headers.get("ETag"), `"ovl-${p1.data.v}"`);
      const p2 = await api(env, adm, "POST", "/content/zone", { fields: FX.zone.add, publish: true });
      assert.equal(store.size, 0, "the publish purged this PoP's copy");
      const mine = await C.serveOverlay(new Request(SITE + "/data/overlay.js"), env, ctx()); // the publishing isolate: memo first → the new version at once
      assert.equal(runOverlay(await mine.text()).v, p2.data.v);
    } finally { delete globalThis.caches; }
  });
});

describe("stored XSS: neutralised server-side, escaped JSON (§0.4, §11.2.4)", () => {
  const H = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'-alert(1)-'", "`${alert(1)}`", "</script><script>alert(1)</script>"];
  test("every text field of every collection; the file has no raw < > and no </script", async () => {
    const env = mkEnv(), adm = mkAdm(), ids = [];
    const evil = (i) => H[i % H.length] + " ";
    let i = 0;
    for (const coll of ["fac", "facx", "prod", "tend", "rfq", "offer", "zone", "news", "event", "award", "opp", "intl", "video", "proj", "notice", "cats"]) {
      const fields = {};
      for (const F of C.COLLS[coll].fields) if ((F.t === "t" || F.t === "m") && !F.pattern) fields[F.n] = evil(i++).slice(0, F.max || 999); else if (F.t === "list") fields[F.n] = [evil(i++)];
      if (coll === "facx" || coll === "intl") { const r = await api(env, adm, "POST", "/content/" + coll, { base_key: "k-" + coll, fields: { ...fields, type: undefined } }); assert.equal(r.status, 201, coll + JSON.stringify(r.data)); ids.push(r.data.item.id); continue; }
      const base = { ...(FX[coll].add || {}) };
      for (const k of Object.keys(fields)) if (C.COLLS[coll].fields.find(x => x.n === k).t !== "e") base[k] = fields[k];
      if (coll === "cats") base.key = "evilcat";
      if (coll === "prod") base.company_url = "https://www.madeinegyptgate.com/factories/x/";
      const r = await api(env, adm, "POST", "/content/" + coll, { fields: base });
      assert.equal(r.status, 201, coll + " " + JSON.stringify(r.data).slice(0, 300)); ids.push(r.data.item.id);
    }
    const p = await api(env, adm, "POST", "/content/publish", { all: true });
    assert.equal(p.status, 200, JSON.stringify(p.data).slice(0, 300)); assert.equal(p.data.skipped.length, 0, JSON.stringify(p.data.skipped));
    const js = await latestJs(env);
    assert.ok(!js.includes("<") && !js.includes(">"), "no raw angle brackets anywhere in the file");
    assert.ok(!/<\/script/i.test(js) && !js.includes(" "));
    const d = runOverlay(js), bad = [];
    (function walk(v, path) { if (typeof v === "string") { if (/[<>"'`]/.test(v)) bad.push(path + "=" + v); } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path + "." + k); })(d, "");
    assert.deepEqual(bad, []);
    assert.ok(js.includes("‹img src=x onerror=alert(1)›"));
  });
  test("URL fields refuse javascript:, data:, //host, spaces and quotes (422 invalid_url)", async () => {
    const env = mkEnv(), adm = mkAdm();
    for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "//evil.example/x", "https://ex ample.com", "https://x.example/\"onmouseover=alert(1)", "https://x.example/'x", "http://plain.example/", "https://user:pw@x.example/", "vbscript:x"]) {
      const r = await api(env, adm, "POST", "/content/news", { fields: { ...FX.news.add, url: u } });
      assert.equal(r.status, 422, u); assert.equal(r.data.code, "invalid_url", u);
    }
    for (const u of ["javascript:alert(1)", "/media/u/../../etc", "img/x.png\"onload=1", "https://evil.example/x.png"]) {
      const r = await api(env, adm, "POST", "/content/news", { fields: { ...FX.news.add, image: u } });
      assert.equal(r.status, 422, u); assert.ok(["invalid_url", "invalid_image"].includes(r.data.code), u);
    }
    const ok = await api(env, adm, "POST", "/content/news", { fields: { ...FX.news.add, image: "img/news/n0.jpg" } }); assert.equal(ok.status, 201);
  });
  test("hostile CORS origins get no CORS header; the site origins and CC_ORIGINS are echoed", async () => {
    const env = mkEnv({ CC_ORIGINS: "http://localhost:8780" }), adm = mkAdm();
    for (const [o, want] of [["https://evil.example", null], ["https://madeinegyptgate.com", "https://madeinegyptgate.com"], ["https://www.madeinegyptgate.com", "https://www.madeinegyptgate.com"], ["http://localhost:8780", "http://localhost:8780"]]) {
      const r = await api(env, adm, "GET", "/content/schema", undefined, { Origin: o });
      assert.equal(r.res.headers.get("Access-Control-Allow-Origin"), want, o); assert.equal(r.res.headers.get("Vary"), "Origin"); assert.equal(r.res.headers.get("Cache-Control"), "no-store");
    }
    const pre = await C.handleContentAdmin(new Request(SITE + "/api/admin/cc/content/tend", { method: "OPTIONS", headers: { Origin: "https://madeinegyptgate.com" } }), env, ctx(), adm);
    assert.equal(pre.status, 204); assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "https://madeinegyptgate.com");
  });
});

describe("ids, counters, locks, audit", () => {
  test("adds in parallel never reuse a counter value", async () => {
    const env = mkEnv(), adm = mkAdm();
    for (const coll of ["tend", "rfq", "opp", "proj"]) {
      const rs = await Promise.all([0, 1, 2, 3, 4].map(() => api(env, adm, "POST", "/content/" + coll, { fields: FX[coll].add })));
      const ids = rs.map(r => r.data.item.draft.id); assert.equal(new Set(ids).size, 5, coll + " " + ids);
      for (const id of ids) assert.match(id, ID_RX[coll]);
    }
    const y = new Date().toISOString().slice(0, 4);
    assert.ok((await api(env, adm, "GET", "/content/tend")).data.items.some(x => x.draft.id === `TEN-${y}-C001`));
    assert.ok((await api(env, adm, "GET", "/content/rfq")).data.items.some(x => x.draft.id === "C1001"));
    assert.ok((await api(env, adm, "GET", "/content/opp")).data.items.some(x => x.draft.id === "cc-tnd-700001"));
  });
  test("a publish waits briefly for a running one (≤ 3 s), then 409 locked; after the lock expires it works", async () => {
    const env = mkEnv(), adm = mkAdm();
    await env.DB.prepare("INSERT INTO cc_locks (k, until, owner) VALUES ('overlay:publish', ?, 'other')").bind(new Date(Date.now() + 1200).toISOString()).run();
    const waited = await C.publishOverlay(env, { by: "x", reason: "plans" }); // the 1.2-second lock is gone before the 3-second wait ends
    assert.ok(waited.v > 0);
    await env.DB.prepare("INSERT INTO cc_locks (k, until, owner) VALUES ('overlay:publish', ?, 'other') ON CONFLICT(k) DO UPDATE SET until = excluded.until, owner = excluded.owner").bind(new Date(Date.now() + 20000).toISOString()).run();
    const r = await api(env, adm, "POST", "/content/notice", { fields: FX.notice.add, publish: true });
    assert.equal(r.status, 409); assert.equal(r.data.code, "locked"); assert.equal(r.data.retry_after_s, 5);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content").first("n"), 1, "the draft is saved");
    await env.DB.prepare("UPDATE cc_locks SET until = ? WHERE k = 'overlay:publish'").bind(new Date(Date.now() - 1000).toISOString()).run();
    assert.equal((await api(env, adm, "POST", "/content/publish", { all: true })).status, 200);
    assert.equal((await C.contentCron(env, Date.now())).locks, 0);
  });
  test("every write is audited with before / after; an audit failure refuses the write (500 audit_failed)", async () => {
    const env = mkEnv(), adm = mkAdm();
    const r = await api(env, adm, "POST", "/content/fac", { base_key: FX.fac.key, fields: { gov: "QLB" }, publish: true });
    assert.deepEqual(adm.log.map(x => x.action), ["content.create", "content.publish"]);
    assert.deepEqual(adm.log[0].after, { gov: "QLB" }); assert.equal(adm.log[0].type, "content"); assert.equal(adm.log[1].type, "overlay");
    await api(env, adm, "POST", `/content/fac/${r.data.item.id}/hide`, {});
    assert.equal(adm.log.at(-1).action, "content.hide"); assert.deepEqual([adm.log.at(-1).before.hidden, adm.log.at(-1).after.hidden], [false, true]);
    const bad = mkAdm("owner", { audit: async () => { throw new Error("cc_audit missing"); } });
    const w = await api(env, bad, "POST", "/content/zone", { fields: FX.zone.add });
    assert.equal(w.status, 500); assert.equal(w.data.code, "audit_failed");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE coll = 'zone'").first("n"), 0);
    const pb = await api(env, bad, "POST", "/content/publish", { all: true });
    assert.equal(pb.status, 500); assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE state = 'draft'").first("n"), 1, "the hide is still a draft");
    const hist = await api(env, adm, "GET", "/content/fac/" + r.data.item.id);
    assert.equal(hist.status, 200); assert.ok(Array.isArray(hist.data.history));
  });
  test("module works on a database WITHOUT the 0006 tables: lists empty, overlay no-op, writes 503 store_off", async () => {
    const bare = new D1(); // schema.sql carries 0006 since P-W8: drop the cc_* tables so this really is a database WITHOUT them
    for (const { name } of bare.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cc!_%' ESCAPE '!'").all()) bare.db.exec(`DROP TABLE "${name}"`);
    const env = { DB: bare, SEO_KV: new KV() }, adm = mkAdm();
    const l = await api(env, adm, "GET", "/content/tend"); assert.equal(l.status, 200); assert.deepEqual(l.data.items, []);
    const w = await api(env, adm, "POST", "/content/tend", { fields: FX.tend.add }); assert.equal(w.status, 503); assert.equal(w.data.code, "store_off");
    assert.equal(await (await C.serveOverlay(new Request(SITE + "/data/overlay.js"), env, ctx())).text(), "window.MIGOVL_DATA=null;\n");
    assert.equal((await C.contentCounts(env)).tenders, 497);
    assert.equal((await api(env, adm, "GET", "/content/status")).data.store, false);
    assert.deepEqual((await C.deskMine(env, "desk@mig.test")).items, []);
  });
});

/* ======================================================================= media (§4.11, §11.2.7) */
const mediaRow = (env, id) => env.DB.prepare("SELECT * FROM cc_media WHERE id = ?").bind(id).first();
const member = async (env, plan = "basic", extra = {}) => {
  const id = "u" + hex(8), t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at, factory_ref) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)").bind(id, extra.company || "Co " + id, extra.email || id + "@factory.test", plan, t, t, extra.verified === false ? "" : t, extra.factory_ref || "").run();
  return env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
};
async function memberUpload(env, m, bytes, type, purpose = "product") {
  const c = ctx(), res = await C.handleMemberMedia(new Request(SITE + "/api/me/media?purpose=" + purpose, { method: "POST", headers: { "Content-Type": type }, body: bytes }), env, c, m); await c.done();
  return { status: res.status, data: await res.json() };
}
describe("media uploads + serving", () => {
  test("JPEG / PNG / WebP accepted by magic bytes; key u/<yyyy>/<id>.<ext>; admin uploads are public", async () => {
    const env = mkEnv(), adm = mkAdm(), y = new Date().toISOString().slice(0, 4);
    for (const [bytes, type, ext, w, h] of [[jpeg(640, 480), "image/jpeg", "jpg", 640, 480], [png(320, 200), "image/png", "png", 320, 200], [webp(800, 600), "image/webp", "webp", 800, 600], [webp(500, 300, { x: false, exif: false, xmp: false }), "image/webp", "webp", 500, 300]]) {
      const r = await upload(env, adm, bytes, type, "news");
      assert.equal(r.status, 201, JSON.stringify(r.data)); const m = r.data.media;
      assert.match(m.public_url, new RegExp(`^/media/u/${y}/[2-9a-hjkmnp-z]{16}\\.${ext}$`)); assert.equal(m.url, m.public_url); assert.equal(m.status, "public");
      assert.deepEqual([m.width, m.height, m.mime], [w, h, type]);
      const row = await mediaRow(env, m.id); assert.equal(row.r2_key, m.public_url.slice(7)); assert.ok(env.MEDIA.m.has(row.r2_key));
      assert.equal(env.MEDIA.m.get(row.r2_key).o.httpMetadata.contentType, type); assert.equal(env.MEDIA.m.get(row.r2_key).o.customMetadata.purpose, "news");
    }
    assert.equal(adm.log.filter(x => x.action === "media.upload").length, 4);
    const again = await upload(env, adm, png(320, 200), "image/png", "news"); // same bytes, same owner → the same row
    assert.equal(again.status, 200); assert.equal(again.data.duplicate, true);
  });
  test("SVG, HTML, GIF-with-script and type mismatches → 415; > 5 MB → 413; no R2 → 503 media_off", async () => {
    const env = mkEnv(), adm = mkAdm(), enc = s => new TextEncoder().encode(s);
    const svg = enc('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
    const gif = enc("GIF89a\x01\0\x01\0<script>alert(1)</script>");
    for (const [b, t, why] of [[svg, "image/svg+xml", "type"], [svg, "image/png", "not_an_image"], [enc("<!doctype html><script>alert(1)</script>"), "image/jpeg", "not_an_image"], [gif, "image/gif", "type"], [gif, "image/png", "not_an_image"], [png(100, 100), "image/jpeg", "type_mismatch"], [jpeg(100, 100), "image/webp", "type_mismatch"], [png(100, 100), "", "type"]]) {
      const r = await upload(env, adm, b, t);
      assert.equal(r.status, 415, t + " " + JSON.stringify(r.data)); assert.equal(r.data.code, "unsupported_type"); assert.equal(r.data.why, why, t);
    }
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(png(100, 100));
    const r = await upload(env, adm, big, "image/png"); assert.equal(r.status, 413); assert.equal(r.data.code, "too_large");
    const env2 = mkEnv(); delete env2.MEDIA;
    assert.equal((await upload(env2, adm, png(100, 100), "image/png")).data.code, "media_off");
    assert.equal(env.MEDIA.m.size, 0, "nothing stored");
  });
  test("dimension rules (min 64, max 6000, per purpose) → 422 invalid_image {why}", async () => {
    const env = mkEnv(), adm = mkAdm();
    for (const [b, p, why] of [[png(50, 50), "other", "too_small"], [png(800, 200), "banner", "too_small_for_banner"], [png(90, 90), "logo", "too_small_for_logo"], [png(299, 300), "product", "too_small_for_product"], [png(6001, 64), "other", "too_large_dimensions"], [jpeg(64, 0), "other", "no_dimensions"]]) {
      const r = await upload(env, adm, b, b[0] === 0xff ? "image/jpeg" : "image/png", p);
      assert.equal(r.status, 422, why); assert.equal(r.data.code, "invalid_image"); assert.equal(r.data.why, why);
    }
    assert.equal((await upload(env, adm, png(1120, 200), "image/png", "banner")).status, 201);
    assert.equal((await upload(env, adm, png(64, 64), "image/png", "other")).status, 201);
    const corrupt = png(100, 100).slice(0, 40); assert.equal((await upload(env, adm, corrupt, "image/png")).data.why, "corrupt");
  });
  test("privacy: JPEG APP1 / APP13 / COM, PNG tEXt / iTXt / eXIf and WebP EXIF / XMP are stripped; trailing polyglot bytes are dropped", async () => {
    const env = mkEnv(), adm = mkAdm();
    const j = jpeg(400, 300, { trailer: "<html><script>alert(1)</script></html>" }), rj = await upload(env, adm, j, "image/jpeg");
    const sj = env.MEDIA.m.get((await mediaRow(env, rj.data.media.id)).r2_key).u8;
    assert.ok(has(j, "GPSLatitude") && !has(sj, "GPSLatitude") && !has(sj, "Photoshop") && !has(sj, "<script>") && !has(sj, "<html>"));
    assert.deepEqual(Buffer.from(sj), Buffer.from(jpeg(400, 300, { exif: false })), "exactly the image without the metadata segments");
    const p = png(300, 300, { text: true, trailer: "<script>alert(1)</script>" }), rp = await upload(env, adm, p, "image/png");
    const sp = env.MEDIA.m.get((await mediaRow(env, rp.data.media.id)).r2_key).u8;
    assert.ok(has(p, "tEXt") && !has(sp, "tEXt") && !has(sp, "eXIf") && !has(sp, "iTXt") && !has(sp, "01001234567") && !has(sp, "<script>"));
    assert.deepEqual(Buffer.from(sp), Buffer.from(png(300, 300)));
    const w = webp(640, 480), rw = await upload(env, adm, w, "image/webp");
    const sw = env.MEDIA.m.get((await mediaRow(env, rw.data.media.id)).r2_key).u8;
    assert.ok(has(w, "EXIF") && !has(sw, "EXIF") && !has(sw, "XMP ") && !has(sw, "xmpmeta"));
    assert.equal(sw[20 + 8] & 0x0c, 0, "VP8X EXIF/XMP flags cleared"); assert.equal(Buffer.from(sw).readUInt32LE(4), sw.length - 8, "RIFF size updated");
    assert.equal((await mediaRow(env, rw.data.media.id)).bytes, sw.length);
  });
  test("serving: public = long cache + nosniff + sandbox CSP; pending member upload only with a valid 1-hour signature; meetings/ never", async () => {
    const env = mkEnv(), adm = mkAdm(), m = await member(env, "basic");
    const pub = (await upload(env, adm, png(300, 300), "image/png")).data.media;
    const r = await C.serveMedia(new Request(SITE + pub.public_url), env, ctx());
    assert.equal(r.status, 200); assert.equal(r.headers.get("Content-Type"), "image/png"); assert.equal(r.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff"); assert.equal(r.headers.get("Content-Disposition"), "inline"); assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
    assert.match(r.headers.get("Content-Security-Policy"), /sandbox/); assert.deepEqual(Buffer.from(await r.arrayBuffer()), Buffer.from(png(300, 300)));
    const nm = await C.serveMedia(new Request(SITE + pub.public_url, { headers: { "If-None-Match": r.headers.get("ETag") } }), env, ctx()); assert.equal(nm.status, 304);
    const up = await memberUpload(env, m, png(400, 400), "image/png");
    assert.equal(up.status, 201, JSON.stringify(up.data)); assert.equal(up.data.media.status, "pending"); assert.match(up.data.media.url, /\?e=\d+&s=[A-Za-z0-9_-]{32}$/);
    const path = up.data.media.url.split("?")[0];
    assert.equal((await C.serveMedia(new Request(SITE + path), env, ctx())).status, 404, "pending: no signature → 404");
    const ok = await C.serveMedia(new Request(SITE + up.data.media.url), env, ctx()); assert.equal(ok.status, 200); assert.equal(ok.headers.get("Cache-Control"), "private, no-store");
    const q = new URL(SITE + up.data.media.url).searchParams;
    assert.equal((await C.serveMedia(new Request(SITE + path + "?e=" + q.get("e") + "&s=" + q.get("s").replace(/.$/, c => (c === "A" ? "B" : "A"))), env, ctx())).status, 404, "tampered");
    assert.equal((await C.serveMedia(new Request(SITE + path + "?e=" + (Math.floor(Date.now() / 1000) - 5) + "&s=" + q.get("s")), env, ctx())).status, 404, "expired");
    env.MEDIA.m.set("meetings/abc/rec.webm", { u8: new Uint8Array([1]), o: {} });
    for (const p of ["/media/u/2026/../../meetings/abc/rec.webm", "/media/meetings/abc/rec.webm", "/media/u/2026/" + pub.id + ".svg", "/media/u/none.jpg"]) assert.equal((await C.serveMedia(new Request(SITE + p), env, ctx())).status, 404, p);
    await C.mediaPublic(env, [path]); // an approval makes it public
    assert.equal((await C.serveMedia(new Request(SITE + path), env, ctx())).status, 200);
  });
  test("member uploads: 3 MB, 10 / hour, plan with a listing or products; library list + used_by; delete refuses a used image; orphans after 7 days", async () => {
    const env = mkEnv(), adm = mkAdm(), m = await member(env, "basic"), v = await member(env, "visitor");
    assert.equal((await memberUpload(env, v, png(400, 400), "image/png")).status, 403);
    const big = new Uint8Array(3 * 1024 * 1024 + 10); big.set(png(400, 400));
    assert.equal((await memberUpload(env, m, big, "image/png")).status, 413);
    assert.equal((await memberUpload(env, m, png(400, 400), "image/png", "banner")).data.code, "invalid_purpose");
    const ids = []; for (let i = 0; i < 9; i++) ids.push((await memberUpload(env, m, png(400 + i, 400), "image/png")).data.media.id);
    assert.equal((await memberUpload(env, m, png(500, 400), "image/png")).status, 429); // attempts are limited (the oversized one counted too): 10 / hour
    // one image is used by a published product → in use
    const used = ids[0], row = await mediaRow(env, used);
    await C.mediaPublic(env, [used]);
    await C.upsert(env, { coll: "prod", kind: "add", fields: { ...FX.prod.add, image: "/media/" + row.r2_key }, by: "a", source: "admin" });
    const lib = await api(env, adm, "GET", "/media?owner=member");
    assert.equal(lib.status, 200); assert.equal(lib.data.total, 9); assert.ok(lib.data.items.find(x => x.id === used).used_by.length === 1);
    const del = await api(env, adm, "DELETE", "/media/" + used); assert.equal(del.status, 409); assert.equal(del.data.code, "in_use");
    const ok = await api(env, adm, "DELETE", "/media/" + ids[1]); assert.equal(ok.status, 200); assert.equal(env.MEDIA.m.has((await mediaRow(env, ids[1])).r2_key), false);
    assert.equal((await api(env, mkAdm("support"), "DELETE", "/media/" + ids[2])).status, 403);
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    await env.DB.prepare("UPDATE cc_media SET created_at = ?").bind(old).run();
    const adminImg = (await upload(env, adm, png(310, 310), "image/png")).data.media.id; await env.DB.prepare("UPDATE cc_media SET created_at = ? WHERE id = ?").bind(old, adminImg).run();
    const cr = await C.contentCron(env, Date.now());
    assert.equal(cr.orphans, 7, JSON.stringify(cr)); // 9 − the used one − the one already deleted
    assert.equal((await mediaRow(env, used)).status, "public"); assert.equal((await mediaRow(env, adminImg)).status, "public", "admin library images are never auto-deleted");
    assert.equal((await mediaRow(env, ids[3])).status, "deleted"); assert.equal(env.MEDIA.m.has((await mediaRow(env, ids[3])).r2_key), false);
  });
});

/* ======================================================================= edge actions through the SEO API (§4.10, §11.2.6) */
describe("edge actions: noindex / 301 through /api/seo/* with the admin's own token", () => {
  test("hide → GET + PATCH noindex (admin's Authorization); unhide restores the remembered robots; seo:bundle untouched", async () => {
    const env = mkEnv(), adm = mkAdm(), path = "/factories/hydrohex/";
    seo.ov[path] = { robots: "index,follow,max-image-preview:large", note: "SEO team note" };
    const r = await api(env, adm, "POST", "/content/fac", { base_key: FX.fac.key, fields: FX.fac.edit, seo_path: path, publish: true });
    assert.deepEqual(r.data.edge, [], "visible: no edge action");
    const h = await api(env, adm, "POST", `/content/fac/${r.data.item.id}/hide`, { publish: true });
    assert.equal(h.status, 200); assert.deepEqual(h.data.edge, [{ path, action: "noindex", status: "done" }]);
    assert.deepEqual(seo.calls.map(c => [c.M, c.path]), [["GET", "/api/seo/page"], ["PATCH", "/api/seo/page"]]);
    assert.ok(seo.calls.every(c => c.auth === AUTH)); assert.equal(seo.calls[1].body.robots, "noindex,follow"); assert.match(seo.calls[1].body.note, /مخفي من لوحة الإدارة: fac\//);
    assert.deepEqual(runOverlay(await latestJs(env)).hp, [path]);
    const u = await api(env, adm, "POST", `/content/fac/${r.data.item.id}/unhide`, { publish: true });
    assert.deepEqual(u.data.edge, [{ path, action: "restore", status: "done" }]);
    assert.deepEqual(seo.ov[path], { robots: "index,follow,max-image-preview:large", note: "SEO team note" });
    assert.equal(env.SEO_KV.m.get("seo:bundle").v, '{"v":7,"ov":{},"rd":{}}');
  });
  test("delete: an add with a baked page → 301 to the hub; a removed base row → 301, undone by «إظهار» (DELETE redirect)", async () => {
    const env = mkEnv(), adm = mkAdm();
    const a = await api(env, adm, "POST", "/content/news", { fields: FX.news.add, seo_path: "/news/افتتاح-مصنع-جديد/", publish: true });
    const d = await api(env, adm, "DELETE", "/content/news/" + a.data.item.id, { confirm: true, publish: true });
    assert.deepEqual(d.data.edge, [{ path: "/news/افتتاح-مصنع-جديد/", action: "redirect", status: "done" }]);
    assert.deepEqual(seo.rd["/news/افتتاح-مصنع-جديد/"].to, "/news/"); assert.equal(seo.rd["/news/افتتاح-مصنع-جديد/"].code, 301);
    const b = await api(env, adm, "POST", "/content/prod/hide", { base_key: FX.prod.key, seo_path: "/industrial_products/فلفل-اسود" });
    assert.equal(b.data.item.seo_path, "/industrial_products/فلفل-اسود/", "trailing slash added");
    const rm = await api(env, adm, "DELETE", "/content/prod/" + b.data.item.id, { confirm: true, mode: "remove", publish: true });
    assert.deepEqual(rm.data.edge, [{ path: "/industrial_products/فلفل-اسود/", action: "redirect", status: "done" }]); assert.equal(seo.rd["/industrial_products/فلفل-اسود/"].to, "/products/");
    assert.deepEqual(runOverlay(await latestJs(env)).c.prod.h, [FX.prod.key]);
    assert.equal((await api(env, adm, "POST", `/content/prod/${b.data.item.id}/discard`, {})).status, 409);
    const back = await api(env, adm, "POST", `/content/prod/${b.data.item.id}/unhide`, { publish: true });
    assert.equal(back.status, 200, JSON.stringify(back.data)); assert.deepEqual(back.data.edge, [{ path: "/industrial_products/فلفل-اسود/", action: "restore", status: "done" }]);
    assert.equal(seo.rd["/industrial_products/فلفل-اسود/"], undefined); assert.equal(runOverlay(await latestJs(env)).c.prod, undefined);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE coll = 'prod'").first("n"), 0, "nothing left to override");
  });
  test("SEO API failure → failed with the error, shown in status; edge-retry finishes it; no token (X-Platform-Key) → stays pending", async () => {
    const env = mkEnv(), adm = mkAdm();
    seo.fail = 1;
    const r = await api(env, adm, "POST", "/content/fac/hide", { base_key: FX.fac.key, seo_path: "/factories/hydrohex/", publish: true });
    assert.equal(r.status, 201); assert.equal(r.data.edge[0].status, "failed");
    const st = await api(env, adm, "GET", "/content/status");
    assert.equal(st.data.edge.failed, 1); assert.match(st.data.edge.items[0].error, /503 kv_off/);
    const re = await api(env, adm, "POST", "/content/edge-retry", {});
    assert.deepEqual([re.data.done, re.data.failed, re.data.pending], [1, 0, 0]);
    assert.equal(seo.ov["/factories/hydrohex/"].robots, "noindex,follow");
    const plat = { ...mkAdm("admin"), member: null, role: "platform" };
    const x = await api(env, plat, "POST", "/content/zone/hide", { base_key: "z1", seo_path: "/industrial-zones/z1/", publish: true }, { Authorization: "" });
    assert.equal(x.data.edge[0].status, "pending");
    assert.match((await api(env, adm, "GET", "/content/status")).data.edge.items[0].error, /Bearer/);
    const again = await api(env, adm, "POST", "/content/edge-retry", {}); assert.equal(again.data.done, 1);
  });
  test("rows without a static page make no edge call; status lists what needs a rebuild against baked_v", async () => {
    const env = mkEnv(), adm = mkAdm();
    await api(env, adm, "POST", "/content/notice", { fields: FX.notice.add, publish: true });
    const t = await api(env, adm, "POST", "/content/tend", { fields: FX.tend.add, publish: true });
    await api(env, adm, "POST", "/content/zone/hide", { base_key: "sczone-sokhna-iz", publish: true });
    assert.equal(seo.calls.length, 0);
    const a = await api(env, adm, "GET", "/content/status");
    assert.equal(a.data.baked_v, null); assert.equal(a.data.needs_rebuild.n, 2, JSON.stringify(a.data.needs_rebuild)); // the notice never needs a rebuild
    assert.deepEqual(a.data.needs_rebuild.items.map(x => x.op).sort(), ["add", "hide"]);
    const older = await api(env, adm, "GET", "/content/status?baked_v=" + (t.data.v - 1)); assert.equal(older.data.needs_rebuild.n, 2);
    const eq = await api(env, adm, "GET", "/content/status?baked_v=" + t.data.v); assert.equal(eq.data.needs_rebuild.n, 1);
    const newer = await api(env, adm, "GET", "/content/status?baked_v=" + (Date.now() + 1000)); assert.equal(newer.data.needs_rebuild.n, 0);
    await env.DB.prepare("UPDATE cc_settings SET v = '0100', updated_at = ? WHERE k = 'whatsapp_display'").bind(new Date(Date.now() + 5000).toISOString()).run();
    assert.ok((await api(env, adm, "GET", "/content/status?baked_v=" + (Date.now() + 1000))).data.needs_rebuild.items.some(x => x.coll === "settings" && x.id === "whatsapp_display"));
    assert.equal(a.data.limit, 524288); assert.ok(a.data.bytes > 0);
  });
});

/* ======================================================================= front desk (§12.3: deskCreate / deskMine / deskQueue / deskReview) */
describe("front desk (team «data»): deskCreate, deskMine, approvals of desk drafts", () => {
  const D = "desk1@mig.test";
  test("with an official source → published at once; without → a draft; created_by + one audit row (direct cc_audit)", async () => {
    const env = mkEnv();
    const a = await C.deskCreate(env, "tenders", { type: "مناقصة عامة", title: "توريد محولات كهرباء", entity: "شركة توزيع الكهرباء", gov: "CAI", deadline: "2026-12-20" }, { by: D, source_url: "https://etenders.gov.eg/Tender/123" });
    assert.equal(a.ok, true); assert.equal(a.state, "published"); assert.equal(a.collection, "tenders"); assert.match(a.ref, /^TEN-\d{4}-C\d{3}$/); assert.ok(a.published_v > 0);
    assert.equal(a.link, `${SITE}/tenders/search/#${encodeURIComponent(a.ref)}`);
    const data = runOverlay(await latestJs(env)); assert.equal(data.c.tend.a[0].ref, a.ref); assert.equal(data.c.tend.a[0].source_url, "https://etenders.gov.eg/Tender/123");
    const row = await env.DB.prepare("SELECT * FROM cc_content WHERE id = ?").bind(a.id).first();
    assert.equal(row.created_by, D); assert.equal(row.source, "desk");
    const au = (await env.DB.prepare("SELECT * FROM cc_audit WHERE target_id = ?").bind(a.id).all()).results;
    assert.equal(au.length, 1); assert.equal(au[0].action, "desk.content"); assert.equal(au[0].actor_email, D); assert.equal(au[0].actor_role, "data");
    const b = await C.deskCreate(env, "projects", { name: "مصنع أسمدة جديد", stage: 1, region: "محافظة أسيوط" }, { by: D });
    assert.equal(b.state, "draft"); assert.ok(b.warnings.some(w => w.field === "source_url")); assert.equal(b.link, "");
    assert.equal(runOverlay(await latestJs(env)).c.proj, undefined);
    const c = await C.deskCreate(env, "rfqs", { title: "مطلوب 20 طن حديد تسليح", qty: "20 طن", gov: "GIZ", details: "تسليم خلال أسبوعين" }, { by: D, source_url: "https://example.org/rfq.pdf" });
    assert.equal(c.state, "published"); assert.match(c.ref, /^C10\d\d$/);
    const w = await C.deskCreate(env, "rfqs", { title: "مطلوب شكاير أسمنت", qty: "100 طن", client: "مقاولات النصر", phone: "+20 100 765 4321", email: "walkin@client.test", channel: "زيارة المقر" }, { by: D, source_url: "https://example.org/w.pdf" });
    const wr = await env.DB.prepare("SELECT private_json, draft_json FROM cc_content WHERE id = ?").bind(w.id).first();
    assert.deepEqual(JSON.parse(wr.private_json), { channel: "زيارة المقر", client: "مقاولات النصر", email: "walkin@client.test", phone: "+20 100 765 4321", source_url: "https://example.org/w.pdf" });
    for (const x of ["مقاولات النصر", "765 4321", "walkin@client.test"]) assert.ok(!(await latestJs(env)).includes(x) && !wr.draft_json.includes(x), x);
    const cr = await env.DB.prepare("SELECT private_json, draft_json FROM cc_content WHERE id = ?").bind(c.id).first();
    assert.equal(JSON.parse(cr.private_json).source_url, "https://example.org/rfq.pdf"); assert.ok(!cr.draft_json.includes("example.org"), "the RFQ document stays admin-only");
    assert.ok(!(await latestJs(env)).includes("example.org"));
  });
  test("an uploaded document (public media) counts as the source; acc's adm.audit is used when given; refusals", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    const doc = (await upload(env, adm, png(800, 1100), "image/png", "other")).data.media;
    const calls = [];
    const r = await C.deskCreate(env, "projects", { name: "توسعات ميناء دمياط", stage: 4, sector: "نقل" }, { by: D, document: doc.id, audit: async (...a) => calls.push(a) });
    assert.equal(r.state, "published"); assert.equal(r.item.source_url, SITE + doc.public_url);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], "desk.content"); assert.equal(calls[0][1], "content"); assert.equal(calls[0][2], r.id);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_audit").first("n"), 0, "no second audit row");
    await assert.rejects(C.deskCreate(env, "news", { title_ar: "x" }, { by: D }), e => e.status === 400 && e.code === "invalid_collection");
    await assert.rejects(C.deskCreate(env, "tenders", { type: "مناقصة", title: "x" }, {}), e => e.status === 400 && e.code === "required");
    await assert.rejects(C.deskCreate(env, "tenders", { type: "مناقصة", title: "x" }, { by: D, source_url: "javascript:alert(1)" }), e => e.status === 422 && e.code === "invalid_url");
    await assert.rejects(C.deskCreate(env, "rfqs", { title: "طلب", details: "كلمني 01001234567" }, { by: D }), e => e.status === 422 && e.code === "invalid_contact");
    await assert.rejects(C.deskCreate(env, "tenders", { title: "x" }, { by: D }), e => e.status === 422 && e.code === "required" && e.errors.some(x => x.field === "type"));
    await assert.rejects(C.deskCreate(env, "projects", { name: "x", stage: 1 }, { by: D, document: "ffffffffffffffff" }), e => e.code === "invalid_image");
    await assert.rejects(C.deskCreate(env, "projects", { name: "x", stage: 1 }, { by: D, audit: async () => { throw new Error("down"); } }), e => e.status === 500 && e.code === "audit_failed");
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_content WHERE source = 'desk'").first("n"), 1, "refused entries wrote nothing");
  });
  test("deskMine: only the caller's own desk entries, newest first, kind filter, states and links", async () => {
    const env = mkEnv();
    const t1 = await C.deskCreate(env, "tenders", { type: "مناقصة", title: "أ" }, { by: D, source_url: "https://x.example/1" });
    const p1 = await C.deskCreate(env, "projects", { name: "ب", stage: 0 }, { by: D });
    await C.deskCreate(env, "rfqs", { title: "ج" }, { by: "desk2@mig.test" });
    await C.upsert(env, { coll: "tend", kind: "add", fields: FX.tend.add, by: D, source: "admin" }); // not a desk entry
    const mine = await C.deskMine(env, D);
    assert.equal(mine.total, 2); assert.deepEqual(mine.items.map(x => x.id), [p1.id, t1.id]);
    assert.deepEqual(mine.items.map(x => [x.state, x.state_ar]), [["draft", "بانتظار موافقة الإدارة"], ["published", "منشور"]]);
    assert.equal(mine.items[1].link, t1.link);
    assert.equal((await C.deskMine(env, D, { kind: "projects" })).total, 1);
    assert.equal((await C.deskMine(env, "DESK1@mig.test")).total, 2, "e-mails compare lower-case");
    await assert.rejects(C.deskMine(env, D, { kind: "news" }), e => e.code === "invalid_kind");
  });
  test("admins review desk drafts: «الموافقات» type=desk lists them; approve needs the source for tenders / projects; reject shows the reason", async () => {
    const env = mkEnv(), adm = mkAdm("admin");
    const t = await C.deskCreate(env, "tenders", { type: "مناقصة", title: "توريد أثاث مكتبي" }, { by: D });
    const q = await api(env, adm, "GET", "/approvals?type=desk");
    assert.equal(q.status, 200); assert.equal(q.data.total, 1); assert.equal(q.data.items[0].type, "desk"); assert.equal(q.data.items[0].created_by, D);
    const no = await api(env, adm, "POST", `/approvals/desk/${t.id}/approve`, {});
    assert.equal(no.status, 422); assert.equal(no.data.code, "source_required");
    const ok = await api(env, adm, "POST", `/approvals/desk/${t.id}/approve`, { source_url: "https://etenders.gov.eg/T/9", fields: { gov: "ALX" } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.ok(ok.data.published_v);
    assert.equal(runOverlay(await latestJs(env)).c.tend.a[0].gov, "ALX");
    assert.ok(adm.log.some(x => x.action === "approval.desk.approve"));
    const r = await C.deskCreate(env, "rfqs", { title: "مطلوب كرتون" }, { by: D });
    assert.equal((await api(env, adm, "POST", `/approvals/desk/${r.id}/reject`, { reason: "x" })).status, 422);
    assert.equal((await api(env, adm, "POST", `/approvals/desk/${r.id}/reject`, { reason: "الطلب ناقص بيانات التسليم" })).status, 200);
    const mine = await C.deskMine(env, D);
    assert.deepEqual(mine.items.map(x => [x.state, x.reject_reason]), [["rejected", "الطلب ناقص بيانات التسليم"], ["published", ""]]);
    assert.equal((await api(env, adm, "GET", "/approvals?type=desk")).data.total, 0);
    assert.equal((await api(env, adm, "POST", `/approvals/desk/${r.id}/approve`, {})).status, 409);
    assert.equal((await api(env, mkAdm("support"), "GET", "/approvals?type=desk")).status, 403);
    const rv = await C.deskReview(env, adm, (await C.deskCreate(env, "rfqs", { title: "د" }, { by: D })).id, "approve", {});
    assert.equal(rv.state, "published"); // RFQs need no public source
  });
});

/* ======================================================================= acc-core's calls (acc-orders.js / acc-me.js / acc-plans.js / acc-stats.js) */
describe("compatibility with acc-core's calls through CC.content", () => {
  test("product approval: mediaPublic(ids) then upsert(prod add, id = member product id, source member, publish) → live in the overlay", async () => {
    const env = mkEnv(), m = await member(env, "basic", { factory_ref: "12" });
    const up = await memberUpload(env, m, png(600, 600), "image/png");
    const path = up.data.media.url.split("?")[0];
    await C.mediaPublic(env, [up.data.media.id]);
    const res = await C.upsert(env, { coll: "prod", kind: "add", id: "p-23456789", fields: { name: "براميل 220 لتر", name_en: "", category: "plastic", description: "", image: path, price: "", company_url: "https://www.madeinegyptgate.com/factories/hydrohex/" }, source: "member", member_id: m.id, publish: true, by: "admin@mig.test" });
    assert.equal(res.item.id, "p-23456789"); assert.equal(res.item.state, "published"); assert.ok(res.published_v);
    const a = runOverlay(await latestJs(env)).c.prod.a[0];
    assert.equal(a.id, "p-23456789"); assert.equal(a.image, path); assert.equal(a.company_url, "https://www.madeinegyptgate.com/factories/hydrohex/");
    const again = await C.upsert(env, { coll: "prod", kind: "add", id: "p-23456789", fields: { name: "براميل 220 لتر أزرق", category: "plastic", company_url: "https://www.madeinegyptgate.com/factories/hydrohex/" }, source: "member", member_id: m.id, publish: true, by: "admin@mig.test" });
    assert.equal(again.item.id, "p-23456789"); assert.equal(runOverlay(await latestJs(env)).c.prod.a.length, 1, "the same row, updated");
    const hid = await C.setHidden(env, { coll: "prod", id: "p-23456789", hidden: true, publish: true, by: m.email }); // member hides / deletes (acc-me.js)
    assert.equal(hid.item.live_hidden, true); assert.equal(runOverlay(await latestJs(env)).c.prod, undefined);
    await assert.rejects(C.upsert(env, { coll: "prod", kind: "add", id: "p-23456789", fields: { name: "زيت 01001234567" }, source: "member", by: "a" }), e => e.status === 422 && e.code === "invalid_contact");
    await assert.rejects(C.upsert(env, { coll: "prod", kind: "add", id: "../etc", fields: FX.prod.add, by: "a" }), e => e.code === "invalid_id");
  });
  test("company approval: create (fac add), edit of an added company (same id), base edit by base_key (+ seo_path), x-listing edit", async () => {
    const env = mkEnv();
    const c1 = await C.upsert(env, { coll: "fac", kind: "add", fields: { name: "شركة الأمل للتغليف", sector: "الطباعة والتغليف", location: "العبور", type: "مصنع", gov: "QLB", products: ["كرتون", "شنط ورق"] }, publish: true, by: "a", source: "member", member_id: "u1" });
    assert.match(c1.item.id, /^c-[2-9a-hjkmnp-z]{8}$/);
    const c2 = await C.upsert(env, { coll: "fac", kind: "add", id: c1.item.id, fields: { description: "مصنع كرتون مضلع" }, publish: true, by: "a", source: "member", member_id: "u1" });
    assert.equal(c2.item.id, c1.item.id); assert.equal(c2.item.draft.name, "شركة الأمل للتغليف"); assert.equal(c2.item.draft.description, "مصنع كرتون مضلع");
    const b1 = await C.upsert(env, { coll: "fac", kind: "base", base_key: "/factories/hydrohex/", id: "ignored", fields: { website: "https://hydrohex.example/" }, publish: true, by: "a", source: "member", member_id: "u2", seo_path: "/factories/hydrohex/" });
    const b2 = await C.upsert(env, { coll: "fac", kind: "base", base_key: "/factories/hydrohex/", id: b1.item.id, fields: { location: "قليوب" }, publish: true, by: "a", source: "member", member_id: "u2" });
    assert.equal(b2.item.id, b1.item.id); assert.deepEqual(b2.item.draft, { website: "https://hydrohex.example/", location: "قليوب" }); assert.equal(b2.item.seo_path, "/factories/hydrohex/");
    const x = await C.upsert(env, { coll: "facx", kind: "base", base_key: "إيجيتك للكابلات", fields: { sector: "الكهرباء والكابلات والإضاءة", type: "شركة" }, publish: true, by: "a", source: "member" });
    assert.equal(x.item.draft.type, "شركة");
    await assert.rejects(C.upsert(env, { coll: "fac", kind: "base", base_key: "/factories/hydrohex/", fields: { type: "شركة" }, by: "a", source: "member" }), e => e.code === "invalid_enum", "fac rows take مصنع | شركة ومورد");
    const d = runOverlay(await latestJs(env));
    assert.equal(d.c.fac.a[0].description, "مصنع كرتون مضلع"); assert.equal(d.c.fac.e["/factories/hydrohex/"].location, "قليوب"); assert.equal(d.c.facx.e["إيجيتك للكابلات"].type, "شركة");
  });
  test("manual RFQ (acc-orders.js): upsert(rfq add, private {client, phone, email, channel, inquiry_ref}, publish) — private fields never compiled", async () => {
    const env = mkEnv(), adm = mkAdm("support");
    const c = await C.upsert(env, { coll: "rfq", kind: "add", fields: { title: "براميل بلاستيك", details: "500 برميل أزرق", qty: "500 قطعة", delivery: "6 أكتوبر", deadline: "2026-12-01", gov: "GIZ", sector: "الصناعات البلاستيكية والمطاط", date: "2026-11-18" },
      private: { client: "شركة المشتري", phone: "+20 100 123 4567", email: "buyer@buyer.test", channel: "واتساب", inquiry_ref: "MIG-26-ABC234" }, publish: true, by: "admin@mig.test", source: "admin" });
    assert.ok(c.published_v); assert.match(c.item.draft.no, /^C10\d\d$/);
    const js = await latestJs(env); for (const s of ["buyer@buyer.test", "123 4567", "شركة المشتري", "MIG-26-ABC234", "واتساب"]) assert.ok(!js.includes(s), s);
    const row = await api(env, adm, "GET", "/content/rfq/" + c.item.id); assert.equal(row.data.item.private.client, "شركة المشتري"); // orders.read sees it
    const ed = await api(env, mkAdm("editor"), "GET", "/content/rfq/" + c.item.id); assert.equal(ed.data.item.private, undefined, "editor: no private fields");
    const cl = await api(env, mkAdm("admin"), "PATCH", "/content/rfq/" + c.item.id, { status: "closed", publish: true });
    assert.equal(cl.data.closed, true); assert.equal(cl.data.inquiry_ref, "MIG-26-ABC234"); assert.equal(runOverlay(await latestJs(env)).c.rfq, undefined);
  });
  test("plans / settings saves: publishOverlay(env, {by, reason}) with no ids; contentCounts ± the published adds / hides", async () => {
    const env = mkEnv(), adm = mkAdm();
    const base = await C.contentCounts(env), DN = DATA.n && typeof DATA.n === "object" ? DATA.n : {}, vBase = DN.videos != null && Number.isFinite(+DN.videos) ? +DN.videos : null;
    assert.deepEqual(base, { tenders: 497, companies: DATA.f.length, rfqs: 5, news: 122, videos: vBase, products: 183, offers: 102, zones: 64, events: 18, awards: 20, projects: null });
    await api(env, adm, "POST", "/content/tend", { fields: FX.tend.add });
    await api(env, adm, "POST", "/content/opp/hide", { base_key: "eg-tnd-003" });
    await api(env, adm, "POST", "/content/fac", { fields: FX.fac.add });
    await api(env, adm, "POST", "/content/video", { fields: FX.video.add });
    assert.deepEqual(await C.contentCounts(env), base, "drafts do not count");
    const r = await C.publishOverlay(env, { by: "admin@mig.test", reason: "plans", all: true }); assert.ok(r.v);
    const n = await C.contentCounts(env);
    assert.equal(n.tenders, 497); assert.equal(n.companies, DATA.f.length + 1); assert.equal(n.videos, vBase === null ? null : vBase + 1, "no source for the base count → still null; with DATA.n.videos → + the published add");
    assert.equal((await api(env, adm, "GET", "/content/counts")).data.companies, DATA.f.length + 1);
  });
});

/* ======================================================================= member self-service (/api/me/products, /api/me/company) + approvals (§3.1.7, §3.1.15, §8.4) */
async function session(env, m, { link = false } = {}) {
  const sid = link ? "lk" + hex(15) : hex(16), exp = Math.floor(Date.now() / 1000) + 3600;
  await env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha256(sid), m.id, new Date().toISOString(), new Date(exp * 1000).toISOString()).run();
  return signSession(env.ADVISOR_SECRET, m.id, sid, exp);
}
async function me(env, token, method, path, body) {
  const c = ctx(), req = new Request(SITE + "/api/me" + path, { method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await C.handleMeContent(req, env, c, null); await c.done();
  let data = null; try { data = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, data };
}
const P1 = { name: "براميل بلاستيك 220 لتر", name_en: "220 L plastic drums", category: "plastic", description: "براميل HDPE أزرق", price: "450 جنيه" };
describe("member products («منتجاتي») within the plan limit + approvals", () => {
  test("plan, link and limit rules; contacts refused; images must be the member's own", async () => {
    const env = mkEnv();
    assert.equal((await me(env, "", "GET", "/products")).status, 401);
    const prof = await member(env, "profile", { factory_ref: "5" }), tp = await session(env, prof);
    const g = await me(env, tp, "GET", "/products"); assert.deepEqual([g.data.limit, g.data.need, g.data.can_add], [0, "plan", false]);
    assert.equal((await me(env, tp, "POST", "/products", { fields: P1 })).data.code, "plan");
    const unl = await member(env, "basic"), tu = await session(env, unl);
    assert.equal((await me(env, tu, "GET", "/products")).data.need, "link");
    assert.equal((await me(env, tu, "POST", "/products", { fields: P1 })).status, 409);
    const m = await member(env, "basic", { factory_ref: "5" }), t = await session(env, m);
    const g2 = await me(env, t, "GET", "/products"); assert.deepEqual([g2.data.limit, g2.data.used, g2.data.can_add, g2.data.need], [30, 0, true, null]);
    const bad = await me(env, t, "POST", "/products", { fields: { ...P1, description: "للطلب كلمنا على 01001234567" } }); assert.equal(bad.status, 422); assert.equal(bad.data.code, "invalid_contact");
    assert.equal((await me(env, t, "POST", "/products", { fields: { ...P1, color: "x" } })).data.code, "unknown_field");
    const other = await member(env, "basic", { factory_ref: "6" }), oi = (await memberUpload(env, other, png(400, 400), "image/png")).data.media.id;
    assert.equal((await me(env, t, "POST", "/products", { fields: P1, images: [oi] })).data.code, "invalid_image");
    const i1 = (await memberUpload(env, m, png(400, 401), "image/png")).data.media.id, i2 = (await memberUpload(env, m, png(400, 402), "image/png")).data.media.id;
    assert.equal((await me(env, t, "POST", "/products", { fields: P1, images: [i1, i2] })).data.code, "limit", "1 image per product on basic");
    const ok = await me(env, t, "POST", "/products", { fields: P1, images: [i1], submit: true });
    assert.equal(ok.status, 201, JSON.stringify(ok.data)); assert.equal(ok.data.item.state, "pending"); assert.match(ok.data.item.images[0].url, /\?e=\d+&s=/);
    const now0 = new Date().toISOString();
    for (let i = 0; i < 29; i++) await env.DB.prepare("INSERT INTO cc_member_products (id, member_id, factory_ref, state, draft_json, created_at, updated_at) VALUES (?, ?, '5', 'draft', '{}', ?, ?)").bind("p-" + C.rid(8), m.id, now0, now0).run();
    const lim = await me(env, t, "POST", "/products", { fields: P1 });
    assert.equal(lim.status, 429); assert.equal(lim.data.code, "limit"); assert.deepEqual([lim.data.limit, lim.data.used], [30, 30]);
    const link = await session(env, m, { link: true });
    assert.equal((await me(env, link, "GET", "/products")).status, 200);
    assert.equal((await me(env, link, "PATCH", "/products/" + ok.data.item.id, { fields: { price: "1" } })).data.code, "full_login_required");
  });
  test("approve → published with the image (now public) + e-mail + bell; an edit keeps the live version; reject with a reason; delete removes it", async () => {
    const env = mkEnv(), adm = mkAdm("editor"), m = await member(env, "basic", { factory_ref: "5" }), t = await session(env, m);
    const img = (await memberUpload(env, m, png(500, 500), "image/png")).data.media.id;
    const p = (await me(env, t, "POST", "/products", { fields: P1, images: [img], submit: true })).data.item;
    const q = await api(env, adm, "GET", "/approvals?type=product");
    assert.equal(q.data.total, 1); assert.equal(q.data.items[0].factory_name, "Hydrohex"); assert.equal(q.data.items[0].kind, "new"); assert.equal(q.data.items[0].member.id, m.id);
    assert.equal((await api(env, mkAdm("support"), "GET", "/approvals?type=product")).status, 403);
    const a = await api(env, adm, "POST", `/approvals/product/${p.id}/approve`, { fields: { price: "430 جنيه", company_url: "https://www.madeinegyptgate.com/factories/hydrohex/" } });
    assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(a.data.content_id, p.id); assert.ok(a.data.published_v);
    const live = runOverlay(await latestJs(env)).c.prod.a[0];
    assert.deepEqual([live.id, live.name, live.price, live.category, live.company_ref, live.company_url], [p.id, P1.name, "430 جنيه", "plastic", "5", "https://www.madeinegyptgate.com/factories/hydrohex/"]);
    assert.match(live.image, /^\/media\/u\/\d{4}\/[2-9a-hjkmnp-z]{16}\.png$/);
    assert.equal((await mediaRow(env, img)).status, "public");
    assert.equal(mails.length, 1); assert.equal(mails[0].to, m.email); assert.match(mails[0].id, /^prodok-/); assert.match(mails[0].subject, /اتوافق على منتجك/);
    assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'product_approved'").bind(m.id).first("n"), 1);
    assert.ok(adm.log.some(x => x.action === "approval.product.approve" && x.type === "member_product"));
    const e = await me(env, t, "PATCH", "/products/" + p.id, { fields: { name: "براميل 200 لتر" }, submit: true });
    assert.equal(e.data.item.state, "pending"); assert.equal(e.data.item.live.name, P1.name);
    assert.equal(runOverlay(await latestJs(env)).c.prod.a[0].name, P1.name, "the approved version stays online");
    assert.equal((await api(env, adm, "POST", `/approvals/product/${p.id}/reject`, { reason: "قصير" })).status, 200); // 4 characters: allowed (3–500)
    assert.equal((await api(env, adm, "POST", `/approvals/product/${p.id}/reject`, { reason: "مكرر" })).status, 409, "already reviewed");
    assert.equal(mails.at(-1).id.startsWith("prodno-"), true);
    const g = await me(env, t, "GET", "/products"); assert.equal(g.data.items[0].state, "rejected"); assert.equal(g.data.items[0].reject_reason, "قصير"); assert.equal(g.data.used, 1, "a product that is live still counts");
    const d = await me(env, t, "DELETE", "/products/" + p.id); assert.equal(d.status, 200); assert.ok(d.data.published_v);
    assert.equal(runOverlay(await latestJs(env)).c.prod, undefined);
    assert.equal((await me(env, t, "GET", "/products")).data.used, 0);
  });
  test("bulk approve: one publish for every product; failures are listed", async () => {
    const env = mkEnv(), adm = mkAdm("admin"), m = await member(env, "premium", { factory_ref: "5" }), t = await session(env, m);
    const ids = []; for (let i = 0; i < 3; i++) ids.push((await me(env, t, "POST", "/products", { fields: { ...P1, name: "منتج " + i }, submit: true })).data.item.id);
    const draft = (await me(env, t, "POST", "/products", { fields: P1 })).data.item.id;
    const r = await api(env, adm, "POST", "/approvals/products/approve", { ids: [...ids, draft, "p-zzzzzzzz"] });
    assert.equal(r.status, 200); assert.equal(r.data.approved, 3); assert.deepEqual(r.data.failed.map(x => x.code).sort(), ["not_found", "state"]);
    assert.equal(runOverlay(await latestJs(env)).c.prod.a.length, 3); assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_overlay").first("n"), 1, "one publish");
    assert.equal((await api(env, adm, "POST", "/approvals/products/approve", { ids: [] })).status, 422);
  });
});
describe("company listing («ملف الشركة»): claim / create / edit requests + approvals", () => {
  test("claim an existing listing → approved: the account is linked (name from the directory); one open request at a time", async () => {
    const env = mkEnv(), adm = mkAdm("admin"), m = await member(env, "profile"), t = await session(env, m);
    const g = await me(env, t, "GET", "/company"); assert.equal(g.data.linked, false); assert.equal(g.data.can_request, true); assert.ok(g.data.allowed.includes("description"));
    assert.equal((await me(env, t, "POST", "/company", { kind: "claim", factory_ref: "99999" })).data.code, "invalid_ref");
    const c = await me(env, t, "POST", "/company", { kind: "claim", factory_ref: "5", fields: { note: "أنا صاحب المصنع — موقعنا hydrohex.com" } });
    assert.equal(c.status, 201, JSON.stringify(c.data)); assert.equal(c.data.request.state, "pending");
    assert.equal((await me(env, t, "POST", "/company", { kind: "create", fields: { name: "x", sector: "s", type: "مصنع", gov: "CAI" } })).data.code, "open_request");
    const q = await api(env, adm, "GET", "/approvals?type=company"); assert.equal(q.data.items[0].kind, "claim"); assert.equal(q.data.items[0].factory_name, "Hydrohex");
    const a = await api(env, adm, "POST", `/approvals/company/${c.data.request.id}/approve`, {});
    assert.equal(a.status, 200, JSON.stringify(a.data)); assert.equal(a.data.factory_ref, "5");
    const mm = await env.DB.prepare("SELECT factory_ref, company FROM members WHERE id = ?").bind(m.id).first();
    assert.deepEqual([mm.factory_ref, mm.company], ["5", "Hydrohex"]); assert.match(mails.at(-1).id, /^compok-/);
    const other = await member(env, "profile"), to = await session(env, other);
    assert.equal((await me(env, to, "POST", "/company", { kind: "claim", factory_ref: "5" })).data.code, "claimed");
  });
  test("edit of a base listing needs base_key at approval; the approved change is live and shows in GET /api/me/company", async () => {
    const env = mkEnv(), adm = mkAdm("owner"), m = await member(env, "basic", { factory_ref: "5" }), t = await session(env, m);
    assert.equal((await me(env, t, "POST", "/company", { kind: "edit", fields: { description: "تليفوننا 01001234567" } })).data.code, "invalid_contact");
    assert.equal((await me(env, t, "POST", "/company", { kind: "edit", fields: { video: "https://youtu.be/abcdefghijk" } })).data.code, "not_allowed", "video is off in every plan by default");
    const r = await me(env, t, "POST", "/company", { kind: "edit", fields: { description: "حلول معالجة المياه للمصانع", website: "https://hydrohex.example/" } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const no = await api(env, adm, "POST", `/approvals/company/${r.data.request.id}/approve`, {}); assert.equal(no.data.code, "base_key_required");
    const ok = await api(env, adm, "POST", `/approvals/company/${r.data.request.id}/approve`, { base_key: "/factories/hydrohex/" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(runOverlay(await latestJs(env)).c.fac.e["/factories/hydrohex/"].description, "حلول معالجة المياه للمصانع");
    const g = await me(env, t, "GET", "/company"); assert.equal(g.data.listing.description, "حلول معالجة المياه للمصانع"); assert.equal(g.data.requests[0].state, "approved");
    const w = await me(env, t, "POST", "/company", { kind: "edit", fields: { location: "قليوب" } });
    assert.equal((await me(env, t, "DELETE", "/company/requests/" + w.data.request.id)).status, 200);
    assert.equal((await me(env, t, "GET", "/company")).data.requests[0].state, "withdrawn");
  });
  test("create a new listing → a fac add (c-…) linked to the account; reject sends the reason", async () => {
    const env = mkEnv(), adm = mkAdm("admin"), m = await member(env, "profile"), t = await session(env, m);
    const logo = (await memberUpload(env, m, png(200, 200), "image/png", "logo")).data.media.id;
    const r = await me(env, t, "POST", "/company", { kind: "create", fields: { name: "مصنع الهدى للأعلاف", sector: "الأعلاف والأسمدة والمبيدات", type: "مصنع", gov: "SHR", location: "العاشر من رمضان", products: ["أعلاف دواجن"], logo } });
    assert.equal(r.status, 201, JSON.stringify(r.data)); assert.match(r.data.request.fields.logo, /^\/media\/u\//);
    const a = await api(env, adm, "POST", `/approvals/company/${r.data.request.id}/approve`, {});
    assert.equal(a.status, 200, JSON.stringify(a.data)); assert.match(a.data.factory_ref, /^c-[2-9a-hjkmnp-z]{8}$/);
    const add = runOverlay(await latestJs(env)).c.fac.a[0]; assert.equal(add.id, a.data.factory_ref); assert.equal(add.logo, r.data.request.fields.logo);
    assert.equal((await mediaRow(env, logo)).status, "public");
    assert.equal((await env.DB.prepare("SELECT factory_ref FROM members WHERE id = ?").bind(m.id).first("factory_ref")), a.data.factory_ref);
    const g = await me(env, t, "GET", "/company"); assert.equal(g.data.listing.source, "added"); assert.equal(g.data.listing.name, "مصنع الهدى للأعلاف");
    const e = await me(env, t, "POST", "/company", { kind: "edit", fields: { location: "بلبيس" } });
    const rj = await api(env, adm, "POST", `/approvals/company/${e.data.request.id}/reject`, { reason: "العنوان مش واضح" });
    assert.equal(rj.status, 200); assert.match(mails.at(-1).id, /^compno-/); assert.match(mails.at(-1).text, /العنوان مش واضح/);
    const v = await member(env, "visitor"), tv = await session(env, v);
    assert.equal((await me(env, tv, "POST", "/company", { kind: "create", fields: {} })).data.code, "plan");
  });
});
