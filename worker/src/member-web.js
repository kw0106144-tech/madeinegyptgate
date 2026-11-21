/* «باسم يعرف هو بيكلّم مين» (owner 2026-11-21: in a call Bassem told a member's office manager that the member was «رئيس مجلس إدارة»
   without having that information — «يبحث في جوجل … عن الشخص عشان يبقي عارف هو بيكلم مين»).
   NOT a tool of the model: Bassem's web tools still never search for a person (websearch.js queryHygiene / person_not_allowed). The SERVER,
   when a paying member's call starts (janna-session.js bassemContext — the member's OWN full sign-in, Bearer v2; never Janna, never a
   visitor, never staff), runs ONE web search with the platform's provider (websearch.js runProvider: the same key, provider and daily cap,
   Bassem's share; reserved before the call, given back when refused) for the member HIMSELF:
     query = "<his full name>" <his company>  — both from his account (members.name / members.company, cleaned by bassem-context.js
             ctxField / fullName: no e-mail, link or digit run), nothing else is ever sent (no e-mail, no phone, no id, no city)
   and keeps only what the results show plainly (summarize below, deterministic, no LLM): his POSITION when a result names it right next to
   his name (one of ROLES) and the same result names his company; the company's ACTIVITY when a result says it right after his company's
   name. Nothing that is not in the results; a result that does not name him with his company counts for nothing. Nothing clear → no line.
   Stored (migration 0013, member_web_profile) for 30 days per member, so the search is not repeated every call; a changed name / company
   searches again (query_hash); a failed search is retried after 6 h; the team's «🧹 امسح» (Control Center → the member's card) clears it
   until the name / company changes. Without the table: this isolate's memory only (fail-soft). The first call does not wait: the search
   runs in the background (execCtx.waitUntil) and its line enters the block from the next call — or at once when it finishes within
   MW_FAST_MS. Owner switch «🛠️ المطوّر» → bassem_member_web (ON by default, locked without a web-search key). Logs: codes only, never the
   name, the company or a result. */
import { sha256, iso, now } from "./common.js";
import { forLLM, instructionLike, stripPII } from "./text.js";
import { webSearchConfig } from "./service-keys.js";
import { featureOn } from "./flags.js";
import { hasTable } from "./acc-base.js";
import { reserveUnits, giveBack, runProvider, cleanResults, unsafeText, WS_MARKETS } from "./websearch.js";
import { ctxField, fullName } from "./bassem-context.js";

export const MW_FEATURE = "bassem_member_web", MW_TABLE = "member_web_profile";
export const MW_TTL_MS = 30 * 86400000, MW_RETRY_MS = 6 * 3600000, MW_FAST_MS = 500, MW_MAX_RESULTS = 8, MW_SUMMARY_MAX = 200;
/* the two sentences of the block line (the owner's words); no «» (the saved prompt speaks what is in «») */
export const MW_LEAD = "- اللي ظاهر عنه على الإنترنت: ";
export const MW_RULE = "ماتقولش منه إلا اللي هو أكّده، وماتقولش جاي منين، ومتنسبلوش صفة مش هنا.";

/* ---------- text: diacritics off (kept off in what is shown), then a 1:1 fold so positions in both strings match ---------- */
const DIAC = /[ً-ٰٟـ]/g;
const FOLD = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي" };
export const unmark = s => String(s == null ? "" : s).replace(DIAC, "");
export function fold(s) {
  let o = "";
  for (const ch of String(s)) { const f = FOLD[ch] || ch.toLowerCase(); o += f.length === ch.length ? f : ch; }
  return o;
}
const RX_ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const B0 = "(?<![\\p{L}\\p{N}])", B1 = "(?![\\p{L}\\p{N}])";
const words = s => fold(unmark(s)).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const ARABIC = /[؀-ۿ]/;

/* the words of a company name that say nothing about WHICH company (they never count as a match) */
const GENERIC = new Set(["شركه", "الشركه", "مجموعه", "المجموعه", "مصنع", "مصانع", "للصناعات", "الصناعات", "صناعات", "للصناعه", "لصناعه", "الصناعيه", "للتجاره", "والتجاره",
  "تجاره", "التجاريه", "للاستيراد", "والتصدير", "للتصدير", "التصدير", "الاستيراد", "المصريه", "مصريه", "مصر", "الدوليه", "دوليه", "الهندسيه", "للمقاولات", "القابضه",
  "ش", "م", "ذ", "group", "company", "co", "corp", "corporation", "ltd", "limited", "llc", "inc", "sae", "for", "and", "the", "of", "industries", "industrial", "industry",
  "trading", "egypt", "egyptian", "international", "factory", "factories", "manufacturing", "holding", "import", "export"]);
/* → the member's inputs, or null (no search): a full name of two words or more and a company with one word that names it */
export function searchInputs(m) {
  const name = fullName(m && m.name), company = ctxField(m && m.company, 80);
  const nw = words(name);
  if (nw.length < 2 || !company) return null;
  const all = words(company).filter(w => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w));
  const own = all.filter(w => !nw.includes(w));
  if (!all.length) return null;
  const query = stripPII('"' + name + '" ' + company).replace(/\s+/g, " ").trim().slice(0, 200);
  return { name, company, query, nameWords: nw, companyWords: own.length ? own : all, lang: ARABIC.test(name + company) ? "ar" : "en" };
}
export const inputsHash = async inp => (await sha256("mw|v1|" + (inp ? words(inp.name).join(" ") + "|" + words(inp.company).join(" ") : ""))).slice(0, 32);

/* ---------- positions (what the results call him) and the company's activity ---------- */
export const ROLES = Object.freeze([
  ["رئيس مجلس الإدارة والعضو المنتدب", /رئيس مجلس (?:ال)?اداره و\s?(?:ال)?عضو (?:ال)?منتدب|chairman\s*(?:and|&)\s*(?:ceo|managing director)/u],
  ["نائب رئيس مجلس الإدارة", /نائب رئيس مجلس (?:ال)?اداره|vice[- ]?chair(?:man|woman|person)?/u],
  ["رئيس مجلس الإدارة", /رئيس(?:ه)? مجلس (?:ال)?اداره|(?<![a-z])chair(?:man|woman|person)(?![a-z])/u],
  ["عضو مجلس الإدارة", /عضو مجلس (?:ال)?اداره|board member|member of the board/u],
  ["العضو المنتدب", /(?:ال)?عضو (?:ال)?منتدب|managing director/u],
  ["الرئيس التنفيذي", /(?:ال)?رئيس(?:ه)? (?:ال)?تنفيذي(?:ه)?|(?<![a-z])ceo(?![a-z])|chief executive(?: officer)?/u],
  ["المدير العام", /(?:ال)?مدير(?:ه)? (?:ال)?عام(?:ه)?(?![\p{L}])|general manager/u],
  ["المدير التنفيذي", /(?:ال)?مدير(?:ه)? (?:ال)?تنفيذي(?:ه)?|executive director/u],
  ["شريك مؤسس", /(?:ال)?شريك(?:ه)? (?:ال)?مؤسس(?:ه)?(?![\p{L}])|co-?founder/u],
  ["المؤسس", /(?:ال)?مؤسس(?:ه)?(?![\p{L}])|(?<![a-z-])founder(?![a-z])/u],
  ["صاحب الشركة", /(?:صاحب|صاحبه|مالك|مالكه) (?:ال)?(?:شركه|مصنع|مجموعه)|(?<![a-z])owner(?![a-z])/u],
  ["مدير المبيعات", /مدير(?:ه)? (?:ال)?مبيعات|sales (?:director|manager)/u],
  ["مدير التصدير", /مدير(?:ه)? (?:ال)?تصدير|export (?:director|manager)/u],
  ["مدير المصنع", /مدير(?:ه)? (?:ال)?مصنع|(?:plant|factory) manager/u],
]);
/* «مؤسسة» (an institution) is not «مؤسس»: (?![\p{L}]) after the word (ة is folded to ه, a letter) */
const BOUNDARY = /[.!?؟|•\n\r]/;
/* the words that may stand between a position written BEFORE his name and the name («رئيس مجلس إدارة شركة النيل المهندس محمد …») */
const BETWEEN = new Set(["المهندس", "مهندس", "الدكتور", "دكتور", "الاستاذ", "استاذ", "السيد", "السيده", "المهندسه", "الدكتوره", "الاستاذه", "الحاج", "اللواء", "المستشار",
  "م", "د", "ا", "eng", "dr", "mr", "mrs", "ms", "prof", "the", "of", "at", "in", "for", "ل", "في", "بشركه", "لشركه", "بمجموعه", "لمجموعه", "بمصنع", "لمصنع"]);
/* after his name: separators, then the position at once («محمد الحسيني، رئيس مجلس إدارة …», "Mohamed X - Chairman - Y | LinkedIn") */
const AFTER_LEAD = /^[\s,،:;\-–—|(]*(?:(?:وهو|هو|بصفته|بصفتها|is|the|as|who is)\s+)*/u;

function nameRx(nw) {
  const first = RX_ESC(nw[0]), last = RX_ESC(nw[nw.length - 1]);
  return new RegExp(B0 + first + "(?:\\s+[\\p{L}\\p{M}'.-]+){0,3}?\\s+" + last + B1, "gu");
}
const hasWord = (f, w) => new RegExp(B0 + RX_ESC(w) + B1, "u").test(f);
const companyIn = (f, cw) => cw.some(w => hasWord(f, w));
/* the position the text STARTS with, or "" */
function roleAt(s) {
  for (const [label, rx] of ROLES) if (new RegExp("^(?:" + rx.source + ")", "u").test(s)) return label;
  return "";
}
/* the LAST position in `pre` whose gap to the name holds only BETWEEN words / company words */
function roleBefore(pre, cw) {
  let best = null;
  for (const [label, rx] of ROLES) {
    const g = new RegExp(rx.source, "gu"); let m;
    while ((m = g.exec(pre))) { if (!best || m.index + m[0].length > best.end || (m.index + m[0].length === best.end && m.index < best.start)) best = { label, start: m.index, end: m.index + m[0].length }; if (!m[0]) g.lastIndex++; }
  }
  if (!best) return "";
  const gap = pre.slice(best.end);
  if (gap.length > 70) return "";
  const gw = gap.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return gw.every(w => BETWEEN.has(w) || cw.includes(w) || GENERIC.has(w)) ? best.label : "";
}
/* the company's activity after its name: [trigger, what is shown before the phrase] */
const ACT = Object.freeze([
  [/(?:ال)?متخصص(?:ه)? في (?:مجال )?/u, ""],
  [/(?:تعمل|يعمل|العامله|العامل) في (?:مجال )?/u, ""],
  [/(?:ال)?رائد(?:ه)? في (?:مجال )?/u, ""],
  [/(?<![\p{L}])(?:ل|في )صناعه /u, "صناعة "],
  [/(?<![\p{L}])(?:ل|في )انتاج /u, "إنتاج "],
  [/speciali[sz](?:es|ing|ed) in (?:the )?/u, ""],
  [/(?:a )?leading (?:manufacturer|producer|supplier|exporter)s? of /u, ""],
  [/(?<![a-z])(?:manufacturer|producer|maker)s? of /u, ""],
  [/(?<![a-z])(?:engaged|operating|active) in (?:the )?/u, ""],
]);
const ACT_STOP = new Set(["منذ", "حيث", "التي", "الذي", "والتي", "والذي", "وذلك", "عام", "سنه", "تاسست", "تأسست", "since", "with", "which", "that", "who", "founded", "established", "for", "has", "is", "was"]);
const ACT_TAIL = new Set(["و", "في", "من", "على", "ب", "ل", "مع", "of", "and", "the", "in", "for", "to", "a", "an"]);
/* skip = [start, end) ranges of the company's own name in f: a trigger inside them is the name, not what the result says */
function activityAfter(orig, f, from, skip = []) {
  const win = f.slice(from, from + 90), inName = i => skip.some(r => from + i >= r[0] && from + i < r[1]);
  let best = null;
  for (const [rx, pre] of ACT) {
    const g = new RegExp(rx.source, "gu"); let m;
    while ((m = g.exec(win))) { if (!inName(m.index)) { if (!best || m.index < best.at) best = { at: m.index, end: m.index + m[0].length, pre }; break; } if (!m[0]) g.lastIndex++; }
  }
  if (!best) return "";
  const s0 = from + best.end, raw = orig.slice(s0, s0 + 80), cut = raw.split(/[.،,;:!?؟|()[\]"«»“”\-–—\n\r]/u)[0];
  const fw = fold(cut).split(/\s+/).filter(Boolean), ow = cut.split(/\s+/).filter(Boolean), keep = [];
  for (let i = 0; i < ow.length && keep.length < 6; i++) { if (ACT_STOP.has(fw[i])) break; keep.push(ow[i]); }
  while (keep.length && ACT_TAIL.has(fold(keep[keep.length - 1]))) keep.pop();
  const phrase = ctxField(keep.join(" "), 60);
  if (!phrase || !phrase.split(" ").some(w => (w.match(/\p{L}/gu) || []).length >= 3) || /\d{3,}/.test(phrase)) return "";
  const out = ctxField(best.pre + phrase, 60);
  return instructionLike(out, { money: false }) || unsafeText(out) ? "" : out;
}

/* his company's whole name (its leading generic words optional: «شركة» / «مجموعة» …) as a pattern over folded text */
function companyRx(inp) {
  const w = words(inp.company); let i = 0; while (i < w.length - 1 && GENERIC.has(w[i])) i++;
  const lead = w.slice(0, i).map(RX_ESC).join("[^\\p{L}\\p{N}]+");
  return new RegExp(B0 + (lead ? "(?:" + lead + "[^\\p{L}\\p{N}]+)?" : "") + w.slice(i).map(RX_ESC).join("[^\\p{L}\\p{N}]+") + B1, "u");
}
/* cleaned results (websearch.js cleanResults) + the member's inputs → {role, activity, hits, sources, summary} or null (nothing clear) */
export function summarize(results, inp) {
  if (!inp || !Array.isArray(results) || !results.length) return null;
  const roles = new Map(), acts = new Map(), sources = [];
  let hits = 0;
  results.forEach((r, rank) => {
    /* a LinkedIn profile: its title is the name («… | LinkedIn») and the snippet starts with his headline («Chairman at …») */
    const li = /linkedin\.com\/in\//i.test(String(r.url || "")), title = li ? String(r.title || "").replace(/\s*(?:[|\-–—]\s*)?(?:on\s+)?linkedin\b.*$/i, "") : r.title;
    const orig = unmark([title, r.snippet].filter(Boolean).join(li ? " - " : " . ")), f = fold(orig);
    if (!companyIn(f, inp.companyWords)) return;
    const nrx = nameRx(inp.nameWords); let m, named = false, role = "";
    while ((m = nrx.exec(f))) {
      named = true;
      if (!role) {
        let after = f.slice(m.index + m[0].length, m.index + m[0].length + 90); const b = after.search(BOUNDARY); if (b >= 0) after = after.slice(0, b);
        role = roleAt(after.replace(AFTER_LEAD, ""));
      }
      if (!role) {
        let pre = f.slice(Math.max(0, m.index - 110), m.index); const b = Math.max(pre.lastIndexOf("."), pre.lastIndexOf("|"), pre.lastIndexOf("!"), pre.lastIndexOf("؟"), pre.lastIndexOf("?"), pre.lastIndexOf("\n"), pre.lastIndexOf("•"));
        if (b >= 0) pre = pre.slice(b + 1);
        role = roleBefore(pre, inp.companyWords);
      }
    }
    if (!named) return;
    hits++;
    /* the activity is read AFTER his company's whole name when the result writes it (so «شركة النيل لصناعة الأسمنت تفتتح …» gives no
       activity out of the company's own name), else after a word of it */
    let act = "";
    const crx = new RegExp(companyRx(inp).source, "gu"), names = []; let cm;
    while ((cm = crx.exec(f))) { names.push([cm.index, cm.index + cm[0].length]); if (!cm[0]) crx.lastIndex++; }
    for (const r of names) { act = activityAfter(orig, f, r[1], names); if (act) break; }
    if (!names.length) for (const w of inp.companyWords) { const wm = new RegExp(B0 + RX_ESC(w) + B1, "u").exec(f); if (wm) { act = activityAfter(orig, f, wm.index + wm[0].length); if (act) break; } }
    if (role) { const c = roles.get(role) || { n: 0, rank }; c.n++; roles.set(role, c); }
    if (act) { const k = fold(act), c = acts.get(k) || { n: 0, rank, v: act }; c.n++; acts.set(k, c); }
    if ((role || act) && sources.length < 3 && r.url) sources.push(r.url);
  });
  const top = mp => [...mp.entries()].sort((a, b) => b[1].n - a[1].n || a[1].rank - b[1].rank)[0];
  const tr = top(roles), ta = top(acts), role = tr ? tr[0] : "", activity = ta ? ta[1].v : "";
  if (!hits || (!role && !activity)) return null;
  const company = inp.company;
  const summary = forLLM(role ? role + " في " + company + (activity ? "، ونشاطها: " + activity : "") : "الشركة: " + company + "، ونشاطها: " + activity, MW_SUMMARY_MAX);
  return { role, activity, company, hits, sources, summary };
}
/* the block line, or "" — only a FOUND row has one */
export const lineOf = row => (row && row.status === "found" && row.summary ? MW_LEAD + row.summary.replace(/[.\s]+$/, "") + ". " + MW_RULE : "");

/* ---------- storage: D1 (0013) or, without it, this isolate's memory ---------- */
const MEMO = new Map();   // member_id → row (no table: the only store; ≤ 500 rows)
const FLIGHT = new Map(); // member_id → the running search (one at a time per member and isolate)
export const forgetMemberWeb = id => { if (id) { MEMO.delete(id); FLIGHT.delete(id); } else { MEMO.clear(); FLIGHT.clear(); } };
export async function readRow(env, id, table) {
  if (!table) return MEMO.get(id) || null;
  try { return (await env.DB.prepare("SELECT * FROM member_web_profile WHERE member_id = ?").bind(id).first()) || MEMO.get(id) || null; } catch (e) { return MEMO.get(id) || null; } // a failed write was kept in memory
}
const COLS = ["member_id", "query_hash", "status", "role", "company", "activity", "summary", "hits", "sources_json", "provider", "searched_at", "expires_at", "updated_at"];
export function upsertStmt(env, row) {
  return env.DB.prepare(`INSERT INTO member_web_profile (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")}) ON CONFLICT(member_id) DO UPDATE SET ${COLS.slice(1).map(c => c + " = excluded." + c).join(", ")}`)
    .bind(...COLS.map(c => (row[c] == null ? (c === "hits" ? 0 : c === "sources_json" ? "[]" : "") : row[c])));
}
async function putRow(env, row, table) {
  if (!table) { MEMO.set(row.member_id, row); while (MEMO.size > 500) MEMO.delete(MEMO.keys().next().value); return; }
  try { await upsertStmt(env, row).run(); } catch (e) { console.error("member web: store", (e && e.name) || "error"); MEMO.set(row.member_id, row); }
}

/* the switch + a usable search key → the search config, else null (no search, no line) */
export async function mwReady(env) {
  if (!(await featureOn(env, MW_FEATURE))) return null;
  const cfg = await webSearchConfig(env);
  return cfg.key && cfg.provider && cfg.cap > 0 ? cfg : null;
}
const fresh = (row, qh, nowMs) => !!row && row.query_hash === qh && (row.status === "cleared" || Date.parse(row.expires_at) > nowMs);

/* ONE provider call for the member → the stored row (never throws) */
export async function searchMember(env, cfg, id, inp, qh, table, nowMs = Date.now()) {
  const prev = await readRow(env, id, table), t = iso(nowMs);
  /* a failure keeps a summary found before for the same name / company (still about him) and tries again after MW_RETRY_MS */
  const failed = async why => {
    console.error("member web: search", cfg.provider, why);
    const keep = prev && prev.query_hash === qh && prev.status === "found";
    const row = keep ? { ...prev, expires_at: iso(nowMs + MW_RETRY_MS), updated_at: t }
      : { member_id: id, query_hash: qh, status: "failed", hits: 0, sources_json: "[]", provider: cfg.provider, searched_at: t, expires_at: iso(nowMs + MW_RETRY_MS), updated_at: t };
    await putRow(env, row, table); return row;
  };
  let rv;
  try { rv = await reserveUnits(env, cfg, 1, "bassem", nowMs); } catch (e) { return failed("no_counter"); }
  if (!rv.granted) { await giveBack(env, rv); return failed(rv.why || "cap"); }
  const p = { q: inp.query, text: inp.query, kind: "web", lang: inp.lang, market: WS_MARKETS.eg, vertical: "web", fresh: "" };
  const r = await runProvider(cfg.provider, cfg.key, p);
  if (r.error) {
    if (r.error === "quota") await giveBack(env, { back: 1, keys: rv.keys.filter(k => !/^wsmin\|/.test(k)) });
    return failed(r.error);
  }
  const s = summarize(cleanResults(r.raw, env, MW_MAX_RESULTS, { member: true }), inp);
  const row = { member_id: id, query_hash: qh, status: s ? "found" : "none", role: s ? s.role : "", company: s ? s.company : "", activity: s ? s.activity : "", summary: s ? s.summary : "",
    hits: s ? s.hits : 0, sources_json: JSON.stringify(s ? s.sources : []), provider: cfg.provider, searched_at: t, expires_at: iso(nowMs + MW_TTL_MS), updated_at: t };
  await putRow(env, row, table);
  return row;
}
/* the block line for the member (bassemContext): the stored summary when it is fresh; else a search starts in the background
   (o.waitUntil) and its line is used only when it finishes within o.fastMs. "" on anything else — never throws, never waits longer */
export async function memberWebLine(env, m, o = {}) {
  const nowMs = o.nowMs || Date.now(), fastMs = o.fastMs == null ? MW_FAST_MS : o.fastMs;
  try {
    if (!m || !m.id || !env || !env.DB) return "";
    const cfg = await mwReady(env); if (!cfg) return "";
    const inp = searchInputs(m); if (!inp) return "";
    const qh = await inputsHash(inp), table = await hasTable(env, MW_TABLE), row = await readRow(env, m.id, table);
    if (fresh(row, qh, nowMs)) return lineOf(row);
    let job = FLIGHT.get(m.id);
    if (!job) {
      job = searchMember(env, cfg, m.id, inp, qh, table, nowMs).catch(() => null).finally(() => FLIGHT.delete(m.id));
      FLIGHT.set(m.id, job);
      if (typeof o.waitUntil === "function") { try { o.waitUntil(job); } catch (e) { /* the job still runs */ } }
    }
    let tm; const timer = new Promise(res => { tm = setTimeout(() => res(null), Math.max(0, fastMs)); });
    const done = await Promise.race([job, timer]); clearTimeout(tm);
    return done && fresh(done, qh, nowMs) ? lineOf(done) : "";
  } catch (e) { console.error("member web: context", (e && e.name) || "error"); return ""; }
}

/* ---------- the team (Control Center → the member's card) ---------- */
const jlist = s => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string").slice(0, 3) : []; } catch (e) { return []; } };
/* → what the card shows (bassem.read): never sent anywhere else */
export async function memberWebView(env, m) {
  const table = await hasTable(env, MW_TABLE), on = !!(await featureOn(env, MW_FEATURE)), cfg = await webSearchConfig(env);
  const row = m ? await readRow(env, m.id, table) : null, inp = searchInputs(m), qh = inp ? await inputsHash(inp) : "";
  return { stored: table, switch_on: on, search_ready: !!(cfg.key && cfg.provider && cfg.cap > 0), can_search: !!inp,
    status: row ? row.status : "", summary: row && row.status === "found" ? row.summary : "", role: row ? row.role || "" : "", activity: row ? row.activity || "" : "",
    searched_at: row ? row.searched_at || "" : "", expires_at: row ? row.expires_at || "" : "", sources: row ? jlist(row.sources_json) : [],
    stale: !!(row && row.query_hash !== qh), line: lineOf(row) };
}
/* «🧹 امسح» (members.write, audited): the summary goes and is not searched again until the member's name / company changes */
export async function clearMemberWeb(env, adm, m, batchFn) {
  MEMO.delete(m.id); FLIGHT.delete(m.id);
  if (!(await hasTable(env, MW_TABLE))) return { off: true };
  const prev = await readRow(env, m.id, true), inp = searchInputs(m), t = now();
  const row = { member_id: m.id, query_hash: inp ? await inputsHash(inp) : "", status: "cleared", hits: 0, sources_json: "[]", provider: "", searched_at: t, expires_at: "", updated_at: t };
  await batchFn(env, [upsertStmt(env, row), adm.auditStmt("member.web_summary_clear", "member", m.id, prev ? { status: prev.status, role: prev.role || "", activity: prev.activity || "" } : null, { status: "cleared" },
    "Bassem's web summary of the member cleared")]);
  return { ok: true, had: !!(prev && prev.status === "found") };
}
