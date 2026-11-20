/* janna_lookup: the members' own approved records, live from D1 (U16). The bundled data.json gets a member's approved product or company
   only at the next deploy-worker run (worker/build-index.js reads the published overlay then); until then Janna and Bassem would not
   find them. This module reads, at most ONCE per isolate per 10 minutes (MEMBERS_TTL; concurrent requests share one read):
     - cc_member_products: approved products (state approved; ONLY live_json, the version the team approved — never a draft; a
       product the member hid or deleted, or one waiting for review, is left out), and
     - cc_company_requests: approved create / edit requests (the fields the team approved; withdrawn / rejected / pending never),
   and hands them to src/index.js, which merges them into the lookup tagged «عضو على المنصة» (MEMBER_TAG). Fail-soft: no DB, no table or
   any read error → empty lists for the same 10 minutes, never an error to the caller. Contacts never leave: e-mails, phone numbers and
   links are cut from every text, and a text that reads like an instruction to the model is dropped (text.js). Read only: nothing here
   writes to D1. */
import { stripPII, forLLM, instructionLike } from "./text.js";

export const MEMBERS_TTL = 10 * 60 * 1000;
export const MEMBER_TAG = "عضو على المنصة";
const MAX_ROWS = 400;
/* data/regions.js MIGREG codes → the governorate (fields.gov of a company request) */
const GOV_CODE = { CAI: "القاهرة", GIZ: "الجيزة", ALX: "الإسكندرية", QLB: "القليوبية", SHR: "الشرقية", DKH: "الدقهلية", GHR: "الغربية", MNF: "المنوفية", BHR: "البحيرة",
  KFS: "كفر الشيخ", DMT: "دمياط", PTS: "بورسعيد", ISM: "الإسماعيلية", SUZ: "السويس", NSN: "شمال سيناء", JSN: "جنوب سيناء", FYM: "الفيوم", BNS: "بني سويف", MNY: "المنيا",
  AST: "أسيوط", SHG: "سوهاج", QNA: "قنا", LXR: "الأقصر", ASN: "أسوان", BBA: "البحر الأحمر", WAD: "الوادي الجديد", MTR: "مطروح" };
const jp = s => { try { const v = JSON.parse(String(s || "")); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch (e) { return null; } };
/* one member text as it may be searched and said: contacts and links cut, one line, ≤ max; "" when it reads like an instruction */
export function memberText(v, max = 160) {
  if (typeof v !== "string" && typeof v !== "number") return "";
  const s = stripPII(String(v).replace(/(https?:\/\/|www\.)\S+/gi, " ").replace(/\S+\.(com|net|org|eg|info|biz)(\/\S*)?(?=\s|$)/gi, " ")).replace(/\s+/g, " ").trim();
  if (!s || instructionLike(s, { money: false })) return "";
  return forLLM(s, max);
}
const list = v => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s*[\n،,]\s*/) : []).map(x => memberText(x, 80)).filter(Boolean).slice(0, 12);
const REF_RX = /^(\d{1,6}|x\d{1,5}|c-[A-Za-z0-9_-]{2,40})$/;

let MEMO = { at: 0, v: 0, products: [], companies: [] }, LOADING = null, VER = 0;
/* tests: start from an empty memo */
export function resetMembers() { MEMO = { at: 0, v: 0, products: [], companies: [] }; LOADING = null; }
async function rows(env, sql) {
  try { return ((await env.DB.prepare(sql).all()) || {}).results || []; }
  catch (e) { if (!/no such table|no such column/i.test(String((e && e.message) || e))) console.error("lookup members", (e && e.message) || "error"); return []; }
}
async function load(env, nowMs) {
  const P = await rows(env, `SELECT id, factory_ref, live_json, updated_at FROM cc_member_products WHERE state = 'approved' AND live_json != '' ORDER BY updated_at DESC, id LIMIT ${MAX_ROWS}`);
  const R = await rows(env, `SELECT id, kind, factory_ref, fields_json, reviewed_at FROM cc_company_requests WHERE state = 'approved' AND kind IN ('create', 'edit') ORDER BY reviewed_at DESC, id DESC LIMIT ${MAX_ROWS}`);
  /* companies: the approved requests of one listing, oldest first — a later one changes only the fields it carries (an edit sends the
     fields it changes), so a company created and then edited before the next deploy keeps its name */
  const byRef = new Map();
  for (const r of R.slice().reverse()) {
    const ref = String(r.factory_ref || "").trim(), f = jp(r.fields_json);
    if (!REF_RX.test(ref) || !f) continue;
    const o = byRef.get(ref) || { create: false, f: {} };
    o.create = o.create || r.kind === "create"; for (const k of Object.keys(f)) if (f[k] != null && f[k] !== "") o.f[k] = f[k];
    byRef.set(ref, o);
  }
  const companies = [];
  for (const [ref, { create, f }] of [...byRef].reverse()) {
    const c = { ref, kind: create ? "create" : "edit", name: memberText(f.name, 120), type: memberText(f.type, 30), activity: memberText(f.sector, 80), location: memberText(f.location, 80),
      gov: GOV_CODE[String(f.gov || "").toUpperCase()] || "", products: list(f.products), description: memberText(f.description, 600) };
    /* a new company with no name is no result; an edit keeps the listing's own name when it did not change it */
    if (c.kind === "create" && !c.name) continue;
    companies.push(c);
  }
  const products = [];
  for (const r of P) {
    const f = jp(r.live_json); if (!f) continue;
    const name = memberText(f.name, 120); if (!name) continue;
    products.push({ id: String(r.id || ""), ref: REF_RX.test(String(r.factory_ref || "")) ? String(r.factory_ref) : "", name, name_en: memberText(f.name_en, 120), category: memberText(f.category, 30), description: memberText(f.description, 600) });
  }
  return { at: nowMs, v: ++VER, products, companies };
}
/* the members' approved records for this isolate: read again only when the memo is older than MEMBERS_TTL */
export async function memberData(env, nowMs = Date.now()) {
  if (!env || !env.DB) return null;
  if (MEMO.at && nowMs - MEMO.at < MEMBERS_TTL) return MEMO;
  if (LOADING) return LOADING;
  LOADING = load(env, nowMs).then(m => (MEMO = m), () => (MEMO = { at: nowMs, v: ++VER, products: [], companies: [] })).finally(() => { LOADING = null; });
  return LOADING;
}
