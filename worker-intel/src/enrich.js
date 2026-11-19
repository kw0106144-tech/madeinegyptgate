/* migate-intel — AI enrichment (Workers AI). One JSON call per item → title_ar, title_en, summary_ar, summary_en (≤300),
   sector, relevance, kind correction. Hard daily cap AI_DAILY_LIMIT (default 400) counted in KV per Cairo day; highest
   rule-relevance first. Honesty guards: output numbers must exist in the input; no URLs / e-mails / phones; Arabic title
   must contain Arabic letters. On failure or over the cap the item keeps its original title and rule-based sector.
   Before it, each run's titles pass (translateTitles) gives the waiting rows their page-language titles, several per call.
   ai: 0 waiting · 1 enriched · 2 failed · 3 titles pass done, full enrichment still waiting. */
import { SECTORS } from "./sectors.js";
import { cairoDay, stripContacts, stripUrls, clip, asciiDigits, KINDS } from "./util.js";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SECTOR_LIST = SECTORS.map((s, i) => `${i + 1}=${s[1]}`).join("; ");
export const SYSTEM = `You are the editor of «منصة صنع في مصر / Made in Egypt Gate», an Egyptian industrial B2B platform. You receive ONE public notice (tender, RFQ, project or business news) as JSON. Reply with ONLY a JSON object:
{"title_ar": Arabic title (clear Egyptian business Arabic, faithful translation, max 140 chars),
 "title_en": English title (faithful, max 140 chars),
 "summary_ar": 1-2 Arabic sentences (max 280 chars) saying what is requested/announced, by whom, where and the deadline if given,
 "summary_en": the same in English (max 280 chars),
 "sector": number of the best matching sector from this list, or 0 if none: ${SECTOR_LIST},
 "relevance": integer 0-100 = how useful this is for Egyptian factories, suppliers and exporters (supply of manufactured goods/works they can bid on or sell into = high; consulting-only, finance, politics, sports = low),
 "kind": one of tender_gov, tender_semi, tender_private, rfq, project, project_news, news}
Rules: use ONLY facts present in the input; never invent numbers, dates, values, names or contacts; no URLs, e-mails or phone numbers; if the input is thin, keep the summary short. Write numbers as digits.`;

const SCHEMA = { type: "object", properties: { title_ar: { type: "string" }, title_en: { type: "string" }, summary_ar: { type: "string" }, summary_en: { type: "string" }, sector: { type: "integer" }, relevance: { type: "integer" }, kind: { type: "string" } }, required: ["title_ar", "title_en", "summary_ar", "summary_en", "sector", "relevance", "kind"] };

export function numbersOk(out, input) {
  const z = x => String(x).replace(/^0+(?=\d)/, "");
  const have = new Set();
  for (const n of asciiDigits(input).match(/\d+(?:[.,]\d+)*/g) || []) { have.add(n); have.add(n.replace(/[.,]/g, "")); for (const p of n.split(/[.,]/)) { have.add(p); have.add(z(p)); } }
  const nums = asciiDigits(out).match(/\d+(?:[.,]\d+)*/g) || [];
  return nums.every(n => have.has(n) || have.has(n.replace(/[.,]/g, "")) || n.split(/[.,]/).every(p => have.has(p) || have.has(z(p))));
}
function extractJson(r) {
  if (r && typeof r === "object" && r.response !== undefined) r = r.response;
  if (r && typeof r === "object") return r;
  const s = String(r || ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no json");
  return JSON.parse(s.slice(a, b + 1));
}
/* validate + sanitise a model answer → fields to store (null where a guard fails) */
export function sanitise(o, it) {
  const input = [it.title_orig, it.summary_orig, it.entity, it.deadline, it.value, it.published_at].filter(Boolean).join(" ");
  const clean = (s, n) => { s = clip(stripContacts(stripUrls(String(s || ""))).replace(/\s+/g, " ").trim(), n); return s || null; };
  let title_ar = clean(o.title_ar, 160), title_en = clean(o.title_en, 160), summary_ar = clean(o.summary_ar, 300), summary_en = clean(o.summary_en, 300);
  const minLen = Math.min(20, Math.floor(String(it.title_orig || "").length * 0.4));
  if (title_ar && (!/[؀-ۿ]/.test(title_ar) || title_ar.length < minLen)) title_ar = null;
  if (title_en && title_en.length < minLen) title_en = null;
  if (summary_ar && !/[؀-ۿ]/.test(summary_ar)) summary_ar = null;
  if (title_en && /[؀-ۿ]/.test(title_en)) title_en = null;
  for (const [k, v] of Object.entries({ title_ar, title_en, summary_ar, summary_en })) if (v && !numbersOk(v, input)) { if (k === "title_ar") title_ar = null; if (k === "title_en") title_en = null; if (k === "summary_ar") summary_ar = null; if (k === "summary_en") summary_en = null; }
  const sec = Number.isInteger(+o.sector) && +o.sector >= 1 && +o.sector <= SECTORS.length ? +o.sector - 1 : null;
  const rel = Number.isFinite(+o.relevance) ? Math.max(0, Math.min(100, Math.round(+o.relevance))) : null;
  let kind = KINDS.includes(o.kind) ? o.kind : null;
  // the AI may only move between neighbouring kinds; official tender sources stay tenders, news stays news-like
  if (kind && /^tender_|^rfq$/.test(it.kind) !== /^tender_|^rfq$/.test(kind)) kind = null;
  if (it.tag === "tender_news") kind = null;
  return { title_ar, title_en, summary_ar, summary_en, sector: sec, relevance: rel, kind };
}

async function counter(env, day) { try { return +(await env.KV.get("ai:" + day)) || 0; } catch (e) { return 0; } }
/* adds to the day's counter as it is NOW (a document read charged during a long enrichment run is not overwritten) */
async function charge(env, day, add) { if (!add) return; try { await env.KV.put("ai:" + day, String((await counter(env, day)) + add), { expirationTtl: 3 * 86400 }); } catch (e) {} }
export const chargeAi = charge;
export async function aiBudget(env, nowMs = Date.now()) {
  const limit = Math.max(0, +(env.AI_DAILY_LIMIT ?? 400) || 0), day = cairoDay(nowMs), used = await counter(env, day);
  return { day, limit, used, left: Math.max(0, limit - used), doc_reserve: docReserve(env) };
}
/* the last AI_DOC_RESERVE units of the daily cap are kept for Bassem's document reads (doc.js, one unit each): the enrichment and the
   titles pass stop that far below AI_DAILY_LIMIT (they spend the whole cap by 08:00 Cairo most days), the reads may use them; the
   cap itself never moves. Unset = 0 (no reserve). */
export function docReserve(env) { return Math.max(0, Math.floor(+(env.AI_DOC_RESERVE ?? 0) || 0)); }

export async function enrichOne(env, it, src = {}) {
  const payload = src.ai_title_only ? { title: it.title_orig, kind: it.kind, market: it.market } :
    { title: it.title_orig, summary: it.summary_orig || "", entity: it.entity || "", kind: it.kind, market: it.market, country: it.country || "", deadline: it.deadline || "", value: it.value ? it.value + " " + (it.currency || "") : "", language: it.lang || "" };
  const res = await env.AI.run(MODEL, { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(payload) }], max_tokens: 600, temperature: 0.2, response_format: { type: "json_schema", json_schema: SCHEMA } });
  const usage = res && res.usage || null;
  return { out: sanitise(extractJson(res), src.ai_title_only ? { ...it, summary_orig: "" } : it), usage };
}

/* enrich pending items (ai=0), best first, within the daily cap; concurrency 4. opts.ids: exactly these items, whatever
   their ai / hidden / status (an admin re-enrichment) */
export async function enrichPending(env, opts = {}) {
  const now = opts.now || Date.now();
  const b = await aiBudget(env, now), left = Math.max(0, b.left - docReserve(env));
  const ids = Array.isArray(opts.ids) ? opts.ids.filter(Boolean).slice(0, 50) : null;
  const perRun = Math.max(0, +(opts.limit ?? env.AI_PER_RUN ?? 60) || 0);
  const n = Math.min(left, ids ? Math.min(perRun || ids.length, ids.length) : perRun);
  const stats = { day: b.day, cap: b.limit, used_before: b.used, calls: 0, ok: 0, failed: 0, rejected_fields: 0, prompt_tokens: 0, completion_tokens: 0 };
  if (n <= 0) { stats.skipped = left <= 0 ? (b.left > 0 ? "daily cap reached (the rest is kept for document reads)" : "daily cap reached") : "per-run limit 0"; return stats; }
  const rows = (ids
    ? await env.DB.prepare(`SELECT i.*, s.mapping AS src_mapping FROM intel_items i JOIN intel_sources s ON s.id=i.source_id WHERE i.id IN (${ids.map(() => "?").join(",")}) LIMIT ?`).bind(...ids, n).all()
    : await env.DB.prepare("SELECT i.*, s.mapping AS src_mapping FROM intel_items i JOIN intel_sources s ON s.id=i.source_id WHERE i.ai IN (0,3) AND i.hidden=0 AND i.dup_of IS NULL AND i.status!='closed' ORDER BY i.relevance DESC, i.first_seen_at DESC LIMIT ?").bind(n).all()).results || [];
  /* the queue keeps a titles-pass title when the full pass's own title fails the guards; a named re-enrichment (ids) replaces it */
  const titleSet = ids ? "title_ar=?, title_en=?" : "title_ar=COALESCE(?, title_ar), title_en=COALESCE(?, title_en)";
  const t0 = Date.now(), budget = opts.budgetMs || 300000;
  let idx = 0;
  const worker = async () => {
    while (idx < rows.length && Date.now() - t0 < budget) {
      const it = rows[idx++];
      let mp = {}; try { mp = JSON.parse(it.src_mapping || "{}"); } catch (e) {}
      stats.calls++;
      try {
        const { out, usage } = await enrichOne(env, it, { ai_title_only: !!mp.ai_title_only });
        if (usage) { stats.prompt_tokens += usage.prompt_tokens || 0; stats.completion_tokens += usage.completion_tokens || 0; }
        stats.rejected_fields += ["title_ar", "title_en", "summary_ar", "summary_en"].filter(k => out[k] === null).length;
        await env.DB.prepare(`UPDATE intel_items SET ${titleSet}, summary_ar=?, summary_en=?, sector=COALESCE(?, sector), relevance=COALESCE(?, relevance), kind=COALESCE(?, kind), ai=1, updated_at=? WHERE id=?`)
          .bind(out.title_ar, out.title_en, out.summary_ar, out.summary_en, out.sector, out.relevance, out.kind, new Date().toISOString(), it.id).run();
        stats.ok++;
      } catch (e) {
        stats.failed++; stats.last_error = String(e && e.message || e).slice(0, 160);
        await env.DB.prepare("UPDATE intel_items SET ai=2, updated_at=? WHERE id=?").bind(new Date().toISOString(), it.id).run().catch(() => {});
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  await charge(env, b.day, stats.calls);
  return stats;
}

/* ---------- titles pass ----------
   Why: one full enrichment per call cannot keep up under AI_DAILY_LIMIT — on 2026-11-19 the 400 calls were spent by 08:00 Cairo
   with 1,976 of 2,775 items still waiting (ai=0, /api/intel/health), so most rows of the Arabic lists showed their English /
   French original (and the English lists their Arabic original), while new rows kept coming. Each run first translates the
   missing page-language titles of the waiting rows the pages show first — by relevance (the hub's opportunity sections) and by
   date (the lists and the news) — TITLES_PER_CALL per call, with the same model and the same guards (sanitise: Arabic letters,
   minimum length, every number present in the original title, no URLs / contacts; the model sees only the title). A call is
   charged ceil(n / TITLES_PER_UNIT) against the daily cap (its tokens cost no more than that many full calls), so the cost bound
   of AI_DAILY_LIMIT holds. The row becomes ai=3: the full pass still takes it (ai IN (0,3)) and keeps these titles when its own
   fail the guards. Only what the model returned and the guards passed is ever stored. */
export const TITLES_PER_CALL = 9, TITLES_PER_UNIT = 3;
export const TITLE_SYSTEM = `You translate the titles of public notices (tenders, RFQs, projects, business news) for «منصة صنع في مصر / Made in Egypt Gate», an Egyptian industrial B2B platform. You receive a JSON array of {"i": number, "title": string, "need": ["ar"] or ["en"] or ["ar","en"]}. Reply with ONLY a JSON object {"items":[{"i": the same number, "title_ar": faithful Arabic translation in clear Egyptian business Arabic (max 140 chars), "title_en": faithful English translation (max 140 chars)}]}, one entry per input title, with only the languages in its "need". Translate only: never add facts, numbers, dates, names or contacts that are not in the title; keep codes, reference numbers and company names as written; write numbers as digits; no URLs, e-mails or phone numbers.`;
const TITLE_SCHEMA = { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, title_ar: { type: "string" }, title_en: { type: "string" } }, required: ["i"] } } }, required: ["items"] };
const AR_RE = /[\u0600-\u06ff]/;
/* the page-language titles a row lacks: the Arabic pages need title_ar unless the original is Arabic; the English pages need
   title_en unless the original is English (no Arabic letters, the row's language English or unknown, no accented letters) */
export function titleNeeds(it) {
  const t = String(it.title_orig || ""), ar = AR_RE.test(t);
  const english = !ar && (!it.lang || it.lang === "en") && !/[àâäçéèêëîïôöùûüÿñœæßãõ]/i.test(t);
  const need = [];
  if (!it.title_ar && !ar) need.push("ar");
  if (!it.title_en && !english) need.push("en");
  return need;
}
export async function translateTitles(env, opts = {}) {
  const now = opts.now || Date.now(), b = await aiBudget(env, now), db = env.DB, left = Math.max(0, b.left - docReserve(env));
  const maxUnits = Math.min(left, Math.max(0, Math.floor(+(opts.units ?? 0) || 0)));
  const stats = { day: b.day, cap: b.limit, used_before: b.used, calls: 0, units: 0, rows: 0, title_ar: 0, title_en: 0, rejected: 0, failed: 0 };
  if (!env.AI || maxUnits <= 0) { stats.skipped = !env.AI ? "no AI binding" : left <= 0 ? "daily cap reached" : "no units for titles"; return stats; }
  const cap = maxUnits * TITLES_PER_UNIT;
  const W = "i.ai=0 AND i.hidden=0 AND i.dup_of IS NULL AND i.status!='closed' AND (i.title_ar IS NULL OR i.title_en IS NULL)";
  const sel = order => db.prepare(`SELECT i.id, i.kind, i.lang, i.title_orig, i.title_ar, i.title_en, i.entity FROM intel_items i WHERE ${W} ORDER BY ${order} LIMIT ?`).bind(cap);
  const [byRel, byDate] = await db.batch([sel("i.relevance DESC, COALESCE(i.published_at, i.first_seen_at) DESC"), sel("COALESCE(i.published_at, i.first_seen_at) DESC, i.relevance DESC")]);
  /* alternate the two orders (what the hub shows first, what the lists and the news show first), each row once */
  const seen = new Set(), pick = [], a = byRel.results || [], d = byDate.results || [];
  for (let k = 0; pick.length < cap && (k < a.length || k < d.length); k++) for (const r of [a[k], d[k]]) if (r && !seen.has(r.id) && pick.length < cap) { seen.add(r.id); pick.push(r); }
  const nowIso = () => new Date().toISOString();
  const mark = async ids => { for (let k = 0; k < ids.length; k += 90) { const c = ids.slice(k, k + 90); await db.prepare(`UPDATE intel_items SET ai=3, updated_at=? WHERE ai=0 AND id IN (${c.map(() => "?").join(",")})`).bind(nowIso(), ...c).run(); } };
  const todo = [];
  for (const r of pick) { r._need = titleNeeds(r); if (r._need.length) todo.push(r); }
  await mark(pick.filter(r => !r._need.length).map(r => r.id)); // already has its page titles: nothing to ask
  const t0 = Date.now(), budget = opts.budgetMs || 120000;
  for (let k = 0; k < todo.length && Date.now() - t0 < budget; k += TITLES_PER_CALL) {
    const batch = todo.slice(k, k + TITLES_PER_CALL), units = Math.ceil(batch.length / TITLES_PER_UNIT);
    if (stats.units + units > maxUnits) break;
    stats.calls++; stats.units += units; stats.rows += batch.length;
    let items = [];
    try {
      const res = await env.AI.run(MODEL, { messages: [{ role: "system", content: TITLE_SYSTEM }, { role: "user", content: JSON.stringify(batch.map((r, j) => ({ i: j + 1, title: r.title_orig, need: r._need }))) }], max_tokens: 120 + 150 * batch.length, temperature: 0.1, response_format: { type: "json_schema", json_schema: TITLE_SCHEMA } });
      const o = extractJson(res);
      items = Array.isArray(o.items) ? o.items : [];
    } catch (e) { stats.failed++; stats.last_error = String(e && e.message || e).slice(0, 160); }
    const got = new Map(items.filter(x => x && Number.isInteger(+x.i)).map(x => [+x.i, x]));
    const stmts = [];
    batch.forEach((r, j) => {
      const x = got.get(j + 1) || {};
      /* the guards of the full pass, with the title as the only input (a number must be in the title itself) */
      const o = sanitise({ title_ar: r._need.includes("ar") ? x.title_ar : null, title_en: r._need.includes("en") ? x.title_en : null }, { title_orig: r.title_orig, kind: r.kind });
      for (const l of r._need) { if (o["title_" + l]) stats["title_" + l]++; else stats.rejected++; }
      stmts.push(db.prepare("UPDATE intel_items SET title_ar=COALESCE(title_ar, ?), title_en=COALESCE(title_en, ?), ai=CASE WHEN ai=0 THEN 3 ELSE ai END, updated_at=? WHERE id=?").bind(o.title_ar, o.title_en, nowIso(), r.id));
    });
    if (stmts.length) await db.batch(stmts);
  }
  await charge(env, b.day, stats.units);
  return stats;
}
