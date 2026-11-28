/* Members-only opportunities (owner decision 2026-11-28): tenders, RFQs, project news, procurement news, contract awards and contractor
   material requests are FOR MEMBERS. A visitor sees the lists with the titles (sector, governorate, country, dates, status); the details
   (issuing / awarding entity, winner, documents and the official notice, bond, booklet, value, description, the issuer's procurement
   address, owner / contractor / consultant, the project news text) are for a signed-in member whose plan covers them.

   Where the details live: the public data files the site publishes are REDACTED at build time (tools/opp_split.js, site.py); the locked
   fields are bundled into this Worker (src/items.json `L`, worker/build-items.js — code, never a served file).

   GET /api/me/opps[?sets=t,q,rt,ri,ra,rn,p,l,en,ov]  the locked fields the member's plan covers, in the shape data/opp-full.js patches back
     Authorization: Bearer <v2 session> (an e-mailed link session reads too: nothing is changed) or Bassem's advisor token
     200 {ok, v, plan, staff?, sets: {t: {"<ref>|<title>": [entity, booklet, bond, source, description, contacts]}, q: {...}, ...},
          withheld: [set …] (what this plan does not cover)}
     401 login_required (no / bad / expired token) · 403 plan {need: "basic"} (visitor, «تسجيل بيانات الشركة فقط», expired plan)
     429 rate_limited (OPPS_PER_HOUR a member) · 503 store_off (no D1)
   Plan rules = the server's (common.js): Egypt items (t, q, rt, ra, p, l) need the market «local» of the plan in force (basic and up);
   an international tender (ri) its market — the Gulf only for the member's chosen GCC states (gulfCovers) —; procurement news (rn) the
   «procurement» capability (premium and up). Staff (role admin, ADMIN_EMAILS, Control Center owner / admin / manager / support) get all.

   The assistants' tools (/api/janna/lookup, /api/janna/item, «فرص السوق» /api/janna/opportunities): viewerOf() decides who asks —
     a Bearer session / advisor token (the website's own calls), else X-Anam-Session-Id (Anam's webhooks carry it): the session's
     clientLabel «madeinegyptgate-<agent>-<lang>.<tag>» (minted by janna-session.js) → the calls-report row of that tag (call_sessions,
     0011: member_id only for a call started with the member's own full sign-in) → the member's plan. A Bassem call is minted only for a
     member whose plan has Bassem, or for staff: without its row it reads as a «partner» member. Anything else = a visitor.
   A caller who may not see an item gets its teaser (lockResult / lockItem) + `members_only: true` + `hint` (the persona says the details
   are for members and invites the registration, with the plan that includes them). */
import ITEMS from "./items.json";
import { authUser, bearer, isV2 } from "./auth.js";
import { verifyToken } from "./advisor.js";
import { effPlan, PLAN_SCOPE, planCan, gulfCovers, gccCode, isAdmin, json, err, rateOk, isBlocked, preflight } from "./common.js";
import { anamKey } from "./service-keys.js";
import { hasTable } from "./acc-base.js";
import { OVL_LOCK, splitRec } from "./opp-fields.js";

const LK = ITEMS.L || {};
export const OPP_SETS = ["t", "q", "rt", "ri", "ra", "rn", "p", "l", "en", "ov"];
export const OPPS_PER_HOUR = 120;
const STAFF_ROLES = ["owner", "admin", "manager", "editor", "support", "data"]; // the Control Center team (cc_staff): they edit these records from their full copy
export const VISITOR = Object.freeze({ who: "visitor", plan: "visitor", markets: [], procurement: false, m: null, via: "" });

async function staffOf(env, m) {
  if (isAdmin(env, m)) return true;
  try { const r = await env.DB.prepare("SELECT role FROM cc_staff WHERE member_id = ? AND disabled_at = ''").bind(m.id).first(); return !!(r && STAFF_ROLES.includes(r.role)); }
  catch (e) { return false; }
}
/* a member row → what he may see */
export async function accessOf(env, m, via) {
  if (!m) return VISITOR;
  if (env && env.DB && (await staffOf(env, m))) return { who: "staff", plan: effPlan(m), markets: PLAN_SCOPE.strategic.slice(), procurement: true, m, via };
  const plan = effPlan(m), markets = (PLAN_SCOPE[plan] || []).slice();
  if (plan === "visitor" || !markets.length) return { ...VISITOR, plan, m, via };
  return { who: "member", plan, markets, procurement: planCan(m, "procurement"), m, via };
}

/* ---------- who asks ---------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_RX = /^madeinegyptgate-(janna|bassem)-(ar|en|meeting)(?:\.([a-z2-7]{12}))?$/;
const ANAM_SESSION_URL = "https://api.anam.ai/v1/sessions/";
const AMEMO = new Map(); // Anam session id → {acc, exp} (per isolate)
export const forgetOppViewers = () => AMEMO.clear(); // tests
async function anamViewer(req, env, sid, nowMs) {
  const hit = AMEMO.get(sid); if (hit && hit.exp > nowMs) return hit.acc;
  let acc = VISITOR, ttl = 10 * 60000;
  try {
    const key = await anamKey(env);
    if (key) {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 1500);
      let j = null;
      try {
        const r = await fetch(ANAM_SESSION_URL + encodeURIComponent(sid), { method: "GET", signal: ctl.signal, headers: { Authorization: "Bearer " + key, Accept: "application/json" } });
        if (r.ok) j = await r.json();
      } finally { clearTimeout(tm); }
      const lm = j && typeof j.clientLabel === "string" ? LABEL_RX.exec(j.clientLabel) : null;
      if (lm) {
        let m = null;
        if (lm[3] && env.DB && (await hasTable(env, "call_sessions"))) {
          const row = await env.DB.prepare("SELECT member_id, staff FROM call_sessions WHERE tag = ?").bind(lm[3]).first();
          if (row && row.member_id) m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(row.member_id).first();
        }
        if (m) acc = await accessOf(env, m, "anam");
        else if (lm[1] === "bassem") acc = { who: lm[2] === "meeting" ? "staff" : "member", plan: "partner", markets: (lm[2] === "meeting" ? PLAN_SCOPE.strategic : PLAN_SCOPE.partner).slice(), procurement: true, m: null, via: "anam" };
        ttl = 2 * 3600000;
      }
    }
  } catch (e) { console.error("opp-lock: anam session", (e && e.name) || "error"); }
  if (AMEMO.size > 500) AMEMO.clear();
  AMEMO.set(sid, { acc, exp: nowMs + ttl });
  return acc;
}
/* opt.anam: also trust X-Anam-Session-Id (the assistants' webhooks); the members' own endpoint (handleOpps) reads the Bearer only */
export async function viewerOf(req, env, opt = {}, nowMs = Date.now()) {
  env = env || {};
  try {
    const t = bearer(req);
    if (t && env.DB) {
      let m = null, via = "session";
      if (isV2(t)) m = await authUser(req, env, t);
      else if (env.ADVISOR_SECRET) {
        const v = await verifyToken(env.ADVISOR_SECRET, t);
        m = v ? await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(v.memberId).first() : null;
        if (m && m.email && (await isBlocked(env, { email: m.email }))) m = null;
        via = "advisor";
      }
      if (m) return await accessOf(env, m, via);
    }
    const sid = String(req.headers.get("X-Anam-Session-Id") || "").trim();
    if (opt.anam && UUID.test(sid)) return await anamViewer(req, env, sid.toLowerCase(), nowMs);
  } catch (e) { console.error("opp-lock: viewer", (e && e.message) || "error"); }
  return VISITOR;
}

/* ---------- what an access covers ---------- */
const INTL_MK = { gulf: "gulf", africa: "africa", asia: "asia", europe: "europe" };
/* kind: tenders | rfqs | awards | projects | leads | procurement; market: local | gulf | africa | asia | europe | intl; country: its name */
export function canSee(acc, kind, market = "local", country = "") {
  if (!acc || acc.who === "visitor") return false;
  if (acc.who === "staff") return true;
  if (kind === "procurement") return acc.markets.includes("local") && !!acc.procurement;
  const mk = market && market !== "local" ? INTL_MK[market] || "intl" : "local";
  if (mk === "local") return acc.markets.includes("local");
  if (mk === "intl") return ["gulf", "africa", "asia", "europe"].every(x => acc.markets.includes(x));
  if (!acc.markets.includes(mk)) return false;
  if (mk === "gulf" && acc.m) return gulfCovers(acc.m, gccCode(country) || "");
  return true;
}
/* the lowest plan that includes it (register.html#<plan> preselects it) — the code defaults of the owner's matrix (common.js PLAN_SCOPE) */
export function needPlan(kind, market = "local") {
  if (kind === "procurement") return "premium";
  return { gulf: "premium", africa: "partner", asia: "strategic", europe: "strategic", intl: "strategic" }[market] || "basic";
}
export const registerUrl = (plan, en) => "https://madeinegyptgate.com/register/" + (en ? "?lang=en" : "") + "#" + (plan || "basic");

/* ---------- the assistants' tools: a result / an item for a caller who may not see it ---------- */
const LOCKED_KEYS = ["entity", "entity_en", "bid_bond_egp", "bid_bond_note", "booklet_price_egp", "estimated_value", "currency", "documents_url", "docs", "details", "details_en",
  "quantity", "delivery", "winner", "owner", "contractor", "consultant", "value_egp_million", "values_million", "latest_news", "latest_news_date", "contacts", "description", "via",
  "source", "source_url", "official"];
const KIND_OF = { tenders: "tenders", tender: "tenders", rfqs: "rfqs", rfq: "rfqs", awards: "awards", award: "awards", winners: "awards", projects: "projects", project: "projects" };
export const lockedSection = s => KIND_OF[String(s || "").toLowerCase()] || "";
const NAME_AR = { tenders: "المناقصات", rfqs: "طلبات عروض الأسعار", awards: "الترسيات والشركات الفايزة", projects: "المشاريع وأخبارها" };
const PLAN_AR = { basic: "الباقة الأساسية", premium: "الباقة المميزة", partner: "باقة الشريك الأساسي", strategic: "باقة الشريك الاستراتيجي" };
export function lockHint(section, plan, m) {
  const k = lockedSection(section) || "tenders", p = PLAN_AR[plan] || PLAN_AR.basic;
  return `تفاصيل ${NAME_AR[k]} (الجهة والكراسة والتأمين والقيمة والوصف ورابط الإعلان) للأعضاء المشتركين بس، فالمتاح هنا العنوان والحالة والمحافظة والقطاع والميعاد. `
    + (m ? `قول للعميل إن التفاصيل بتفتح لما يسجّل في «${p}» من صفحة التسجيل (register_url)، ومتخمّنش أي تفصيلة مش مكتوبة.`
      : `قولي للعميل إن التفاصيل بتفتح لما يسجّل في «${p}» من صفحة التسجيل (register_url)، ومتخمّنيش أي تفصيلة مش مكتوبة.`);
}
const marketOfResult = r => (r && r.market && r.market !== "local" ? String(r.market) : "local");
/* one lookup result: unchanged when the caller may see it, else its teaser with locked: true + need (the plan that includes it) */
export function lockResult(section, r, acc) {
  const k = lockedSection(section);
  if (!k || !r || typeof r !== "object") return r;
  const mk = k === "tenders" ? marketOfResult(r) : "local";
  if (canSee(acc, k, mk, r.country || r.governorate || "")) return r;
  const o = { ...r };
  for (const f of LOCKED_KEYS) delete o[f];
  o.locked = true; o.need = needPlan(k, mk);
  return o;
}
/* a lookup answer {results, text, extra}: the results locked one by one; when any was locked the text is rebuilt by the caller from the
   locked results (index.js search) — here only the closing hint and the flags */
export function lockAnswer(section, o, acc, m) {
  if (!o || !Array.isArray(o.results)) return o;
  const locked = o.results.filter(r => r && r.locked);
  if (!locked.length) return o;
  const need = locked.map(r => r.need).sort((a, b) => ["basic", "premium", "partner", "strategic"].indexOf(a) - ["basic", "premium", "partner", "strategic"].indexOf(b))[0] || "basic";
  return { ...o, members_only: true, need, register_url: registerUrl(need), hint: lockHint(section, need, m), text: String(o.text || "") + " " + lockHint(section, need, m) };
}
/* one item (/api/janna/item): its teaser record + a teaser sentence + the hint */
export function lockItem(rec, acc, m) {
  if (!rec || !rec.found) return rec;
  const k = lockedSection(rec.section);
  if (!k) return rec;
  const mk = k === "tenders" ? marketOfResult(rec) : "local";
  if (canSee(acc, k, mk, rec.country || rec.governorate || "")) return rec;
  const o = { ...rec };
  for (const f of LOCKED_KEYS) delete o[f];
  const need = needPlan(k, mk), t = String(rec.title || rec.name || "");
  const bits = [t ? "«" + t.slice(0, 160) + "»" : "", rec.status || rec.stage || "", rec.governorate || rec.country || "", rec.activity ? "قطاع " + rec.activity : "",
    rec.deadline ? "آخر ميعاد " + rec.deadline : rec.date ? "بتاريخ " + rec.date : ""].filter(Boolean);
  o.text = (bits.length ? bits.join("، ") + ". " : "") + lockHint(k, need, m);
  return { ...o, locked: true, members_only: true, need, register_url: registerUrl(need), hint: lockHint(k, need, m) };
}
/* «فرص السوق» (web-public.js) and the web extras of a lookup: the opportunity's entity and its official link are for members */
export function lockWeb(it, acc) {
  if (!it || typeof it !== "object" || !["tender", "rfq", "project"].includes(it.type) || canSee(acc, "tenders", "local")) return it;
  const o = { ...it }; delete o.entity; delete o.official; delete o.product_entity;
  return o;
}

/* ---------- GET /api/me/opps ---------- */
export function oppSets(acc, want) {
  const sets = {}, withheld = [];
  const pick = (k, ok) => { if (!want.includes(k)) return; if (ok) sets[k] = LK[k] || {}; else withheld.push(k); };
  const local = canSee(acc, "tenders", "local");
  for (const k of ["t", "q", "rt", "ra", "p", "l", "en"]) pick(k, local); /* "ov" (the Control Center edits) is added by handleOpps */
  pick("rn", canSee(acc, "procurement"));
  if (want.includes("ri")) {
    const out = {}; let n = 0;
    for (const [k, v] of Object.entries(LK.ri || {})) {
      if (!v || !canSee(acc, "tenders", v._m || "intl", v._c || "")) { n++; continue; }
      const { _m, _c, ...rest } = v; void _m; void _c; out[k] = rest;
    }
    sets.ri = out; if (n) withheld.push("ri:" + n);
  }
  return { sets, withheld };
}
/* the locked part of the published Control Center edits (cc_content, 0006): {coll: {e: {base_key: fields}, a: {id: fields}}} — read at most
   once a minute per isolate; no table → none */
let OVM = null;
export const forgetOppOverlay = () => { OVM = null; };
async function overlayLocked(env, nowMs = Date.now()) {
  if (OVM && OVM.exp > nowMs) return OVM.v;
  const v = {};
  try {
    if (await hasTable(env, "cc_content")) {
      const cols = Object.keys(OVL_LOCK), q = "SELECT coll, kind, base_key, live_json, live_hidden, deleted FROM cc_content WHERE live_json != '' AND deleted = 0 AND live_hidden = 0 AND coll IN (" + cols.map(() => "?").join(", ") + ")";
      const { results } = await env.DB.prepare(q).bind(...cols).all();
      for (const r of results || []) {
        let live = null; try { live = JSON.parse(r.live_json); } catch (e) { live = null; }
        const lock = live && typeof live === "object" ? splitRec(r.coll, live)[1] : null; if (!lock) continue;
        const c = (v[r.coll] = v[r.coll] || { e: {}, a: {} });
        if (r.kind === "base") c.e[r.base_key] = lock;
        else { const id = String(live.id || live.no || live.ref || ""); if (id) c.a[id] = lock; }
      }
    }
  } catch (e) { console.error("opp-lock: overlay", (e && e.message) || "error"); }
  OVM = { v, exp: nowMs + 60000 };
  return v;
}
function overlayFor(acc, ov) {
  const out = {};
  for (const [coll, x] of Object.entries(ov || {})) {
    if (coll === "intl") {
      const mk = ref => { for (const [k, r] of Object.entries(LK.ri || {})) if (k.split("|")[0] === ref) return [r._m || "intl", r._c || ""]; return ["intl", ""]; };
      const e = {}; for (const [k, f] of Object.entries(x.e || {})) { const [m, c] = mk(k); if (canSee(acc, "tenders", m, c)) e[k] = f; }
      if (Object.keys(e).length) out[coll] = { e, a: {} };
    } else if (canSee(acc, coll === "rfq" ? "rfqs" : coll === "award" ? "awards" : coll === "proj" ? "projects" : "tenders", "local")) out[coll] = x;
  }
  return out;
}
export async function handleOpps(req, env) {
  env = env || {};
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return err(405, "method", "method not allowed");
  if (!env.DB) return err(503, "store_off", "store not configured");
  if (!bearer(req)) return err(401, "login_required", "سجّل دخولك الأول / sign in first");
  const acc = await viewerOf(req, env, { anam: false });
  if (!acc.m && acc.who !== "staff") return err(401, "login_required", "سجّل دخولك الأول / sign in first");
  if (acc.who === "visitor") return json({ error: "التفاصيل دي للأعضاء المشتركين من الباقة الأساسية / these details are for members from the Basic plan", code: "plan", need: "basic", plan: acc.plan }, 403);
  if (!(await rateOk(env, "opps|" + acc.m.id, OPPS_PER_HOUR, 3600))) return err(429, "rate_limited", "طلبات كتير، استنى شوية / too many requests, try again later");
  const q = new URL(req.url).searchParams.get("sets");
  const want = q ? q.split(",").map(s => s.trim()).filter(s => OPP_SETS.includes(s)) : OPP_SETS;
  const { sets, withheld } = oppSets(acc, want);
  if (!q || want.includes("ov")) sets.ov = overlayFor(acc, await overlayLocked(env));
  return new Response(JSON.stringify({ ok: true, v: ITEMS.v || "", plan: acc.plan, ...(acc.who === "staff" ? { staff: true } : {}), sets, withheld }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", Vary: "Authorization" } });
}
