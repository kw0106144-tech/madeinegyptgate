/* Daily jobs (cron, once per Cairo day after 07:00): follow digests from REAL new items and deadline reminders 7 d / 1 d (both inside the
   member's plan scope, inScope below).
   "New" = an item id that first appeared in a data rebuild (seen_items; the first sync is a baseline and never reported).
   Items come from worker/src/data.json → i (built by build-index.js from sourced data only; sample/illustrative data excluded).
   Alerts need a plan with «alerts» in the matrix (the Basic plan and up — the profile plan opens no opportunity data) and respect each
   member's geographic scope: a Gulf item only reaches the plans that cover its country (Premium: the 3 GCC states it chose, none chosen
   yet = all six; another Arab country = every plan with the Gulf market), and «أخبار المشتريات» (procurement news) only the plans with
   «procurement» (Premium and up). */
import DATA from "./data.json";
import { now, iso, mail, notify, site, cairoDay, cairoHM, addDays, prefsOf, effPlan, PLAN_LV, PLAN_SCOPE, line, planCan, gulfCountry, gulfCovers } from "./common.js";
import { norm, tokens } from "./text.js";

const NONE = norm("غير محددة");
/* x[11] = the ids the PAGES use for the same item (opportunity.html#ET003 / IN4, tenders.html OT-<ref>, rfqs.html OR-<ref>) */
let ITEMS = null;
export const items = () => ITEMS || (ITEMS = (DATA.i || []).map(x => ({ kind: x[0], id: x[1], date: x[2], sector: x[3], gov: norm(x[4]) === NONE ? "" : x[4], title: x[5], url: x[6], deadline: x[7], market: x[8] || "local", entity: x[9], src: x[10], aliases: Array.isArray(x[11]) ? x[11] : [] })));
const keyOf = it => it.kind + "|" + it.id;
let IDX = null;
function index() {
  if (!IDX) { IDX = new Map(); for (const it of items()) for (const id of [it.id, ...it.aliases]) { const k = it.kind + "|" + norm(id); if (!IDX.has(k)) IDX.set(k, it); } }
  return IDX;
}
/* a follow's id (the page's own id or the index id) → the data-index item, or null */
export function resolveItem(kind, ref) {
  const I = index(), r = norm(ref);
  if (!r) return null;
  if (kind === "opportunity") return I.get("tender|" + r) || I.get("rfq|" + r) || null;
  return I.get(kind + "|" + r) || null;
}

export async function syncSeen(env, list = items(), nowMs = Date.now()) {
  const any = await env.DB.prepare("SELECT 1 AS x FROM seen_items LIMIT 1").first("x");
  const base = any ? 0 : 1, t = iso(nowMs);
  for (let i = 0; i < list.length; i += 50)
    await env.DB.batch(list.slice(i, i + 50).map(it => env.DB.prepare("INSERT INTO seen_items (kind, item_id, first_seen_at, baseline) VALUES (?, ?, ?, ?) ON CONFLICT(kind, item_id) DO NOTHING").bind(it.kind, it.id, t, base)));
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM seen_items WHERE first_seen_at = ? AND baseline = 0").bind(t).first("n");
  return { baseline: !!base, added: n || 0 };
}
/* items that first appeared after `sinceIso` (never baseline items) */
export async function newSince(env, sinceIso, list = items()) {
  const { results } = await env.DB.prepare("SELECT kind, item_id FROM seen_items WHERE baseline = 0 AND first_seen_at > ? LIMIT 5000").bind(sinceIso).all();
  const keys = new Set((results || []).map(r => r.kind + "|" + r.item_id));
  return list.filter(it => keys.has(keyOf(it)));
}
/* does a new item match one follow? */
export function followMatches(f, it) {
  const ref = norm(f.ref_id), lab = norm(f.label || "");
  const has = (hay, needle) => !!needle && needle.length >= 2 && norm(hay).includes(needle);
  switch (f.kind) {
    case "sector": { if (has(it.sector, ref) || has(it.sector, lab)) return true; const ft = tokens(f.label || f.ref_id), st = new Set(tokens(it.sector)); return ft.length > 0 && ft.some(t => st.has(t)); }
    case "governorate": case "region": case "city": return has(it.gov, ref) || has(it.gov, lab) || has(it.title, lab);
    case "entity": case "agency": return has(it.entity, ref) || has(it.entity, lab);
    case "store": return it.kind === "offer" && (has(it.entity, ref) || has(it.entity, lab));
    case "search": { const ft = tokens(f.ref_id), hay = new Set(tokens(it.title + " " + it.sector)); return ft.length > 0 && ft.every(t => hay.has(t)); }
    default: return false;
  }
}
const PROCUREMENT = norm("أخبار المشتريات");
export const isProcurement = it => it.kind === "news" && norm(it.sector || "") === PROCUREMENT;
/* is a data item inside the member's plan: the market, for a Gulf item its country (x[4]: «البحرين», «عُمان»…), procurement news */
export function inScope(m, it, nowIso) {
  const mk = it.market || "local";
  if (!(PLAN_SCOPE[effPlan(m, nowIso)] || []).includes(mk)) return false;
  if (mk === "gulf" && !gulfCovers(m, gulfCountry(it.gov), nowIso)) return false;
  if (isProcurement(it) && !planCan(m, "procurement", nowIso)) return false;
  return true;
}

/* Bassem's morning count: real new items in the member's scope (and sector, when set) during the last 24 h */
export async function newCountFor(env, m, nowMs = Date.now()) {
  const fresh = (await newSince(env, iso(nowMs - 86400000))).filter(it => inScope(m, it, iso(nowMs)) && it.kind !== "news");
  const st = new Set(tokens(m.sector || "")), match = st.size ? fresh.filter(it => tokens(it.sector + " " + it.title).some(t => st.has(t))) : fresh;
  return { count: match.length, top: match[0] ? line(match[0].title, 90) : "" };
}

async function claimDay(env, job, day) {
  const r = await env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES (?, ?, ?) ON CONFLICT(job, day) DO NOTHING").bind(job, day, now()).run();
  return !!(r.meta && r.meta.changes);
}
const S = env => site(env);
const fmt = (env, it) => `• ${it.title}${it.entity ? " — " + it.entity : ""}${it.gov ? " (" + it.gov + ")" : ""}${it.deadline ? " · آخر موعد " + it.deadline : ""}\n  ${S(env)}${it.url}${it.src ? "\n  المصدر / Source: " + it.src : ""}`;

export async function dailyJobs(env, nowMs = Date.now()) {
  const out = { ran: false, synced: null, digests: 0, reminders: 0 };
  if (!env.DB) return out;
  const day = cairoDay(nowMs);
  if (cairoHM(nowMs) < (env.DIGEST_TIME || "07:00")) return out;
  if (!(await claimDay(env, "daily", day))) return out;
  out.ran = true;
  const list = items();
  out.synced = await syncSeen(env, list, nowMs);
  // members with follows and an alerts-capable plan
  const { results: users } = await env.DB.prepare("SELECT DISTINCT m.* FROM members m JOIN follows f ON f.user_id = m.id WHERE m.email != '' AND m.email_verified_at != '' LIMIT 5000").all();
  const fresh = await newSince(env, iso(nowMs - 26 * 3600e3), list);
  const d7 = addDays(day, 7), d1 = addDays(day, 1);
  for (const m of users || []) {
    if (!planCan(m, "alerts", iso(nowMs))) continue;
    const p = prefsOf(m);
    const { results: fl } = await env.DB.prepare("SELECT kind, ref_id, label, url, item_id FROM follows WHERE user_id = ?").bind(m.id).all();
    // 1) digest of new matching items
    if (fresh.length && m.digest_sent_day !== day) {
      const hits = [];
      for (const it of fresh) { if (!inScope(m, it, iso(nowMs))) continue; const f = (fl || []).find(f => followMatches(f, it)); if (f) hits.push({ it, why: f.label || f.ref_id }); if (hits.length >= 25) break; }
      if (hits.length) {
        await env.DB.prepare("UPDATE members SET digest_sent_day = ? WHERE id = ?").bind(day, m.id).run();
        await notify(env, m.id, { kind: "digest", title: `${hits.length} ${hits.length === 1 ? "عنصر جديد" : "عناصر جديدة"} تطابق متابعاتك`, title_en: `${hits.length} new item${hits.length === 1 ? "" : "s"} matching your follows`, body: hits.slice(0, 3).map(h => h.it.title).join(" · "), url: "dashboard.html#follows", ref: "digest:" + day });
        if (p.email_digest) {
          const lines = hits.map(h => fmt(env, h.it) + `\n  (لأنك متابع: ${h.why})`).join("\n\n");
          await mail(env, { id: `digest-${m.id}-${day}`, to: m.email, list: "digest", subject: `جديد متابعاتك اليوم (${hits.length}) / Your follows today`,
            ar: `صباح الخير${m.name ? " " + m.name : ""}،\nدي العناصر الجديدة اللي ظهرت على المنصة وتطابق متابعاتك (من بيانات حقيقية بمصادرها):\n\n${lines}`,
            en: `Good morning,\n${hits.length} new item(s) matching your follows appeared on the platform (real, sourced data — see the links above).\nManage follows: ${S(env)}dashboard.html#follows`,
            why: "وصلتك لأنك متابع أقسام/جهات على المنصة / You follow items on the platform." });
        }
        out.digests++;
      }
    }
    // 2) deadline reminders for followed tenders / RFQs / events: 7 days and 1 day before
    for (const f of fl || []) {
      if (!/^(tender|rfq|event|opportunity)$/.test(f.kind)) continue;
      const it = (f.item_id && resolveItem(f.kind, f.item_id)) || resolveItem(f.kind, f.ref_id); // page ids (ET003, OT-…) resolve too
      if (!it || !it.deadline || (it.deadline !== d7 && it.deadline !== d1)) continue;
      // the same plan scope as the digest (review M-3): an item followed outside the plan — a Gulf state the member did not choose, a market
      // the plan does not have (followed before a downgrade, from a public page) — gets no reminder. Events are local items.
      if (!inScope(m, it, iso(nowMs))) continue;
      const which = it.deadline === d1 ? "1d" : "7d", ref = `deadline:${f.kind}:${it.id}:${which}`;
      if (await env.DB.prepare("SELECT 1 AS x FROM notifications WHERE user_id = ? AND kind = 'deadline' AND ref = ?").bind(m.id, ref).first("x")) continue;
      const ar = which === "1d" ? "بكرة آخر موعد" : "باقي 7 أيام على آخر موعد", en = which === "1d" ? "Deadline tomorrow" : "7 days to the deadline";
      await notify(env, m.id, { kind: "deadline", title: `${ar}: ${line(it.title, 120)}`, title_en: `${en}: ${line(it.title, 120)}`, body: it.deadline, body_en: it.deadline, url: it.url, ref });
      if (p.email_digest) await mail(env, { id: `dl-${m.id}-${it.id}-${which}`.slice(0, 120), to: m.email, list: "digest", subject: `${ar} / ${en}: ${line(it.title, 80)}`,
        ar: `${ar} (${it.deadline}) للعنصر اللي بتتابعه:\n\n${fmt(env, it)}`, en: `${en} (${it.deadline}) for an item you follow — see the link above.`, why: "تذكير لعنصر بتتابعه / Reminder for an item you follow." });
      out.reminders++;
    }
  }
  // housekeeping: old rate-limit windows and metric de-dup hashes (no personal data kept longer than needed)
  await env.DB.prepare("DELETE FROM rl WHERE exp < ?").bind(iso(nowMs - 86400000)).run();
  await env.DB.prepare("DELETE FROM ev_seen WHERE day < ?").bind(addDays(day, -2)).run();
  await env.DB.prepare("DELETE FROM auth_codes WHERE created_at < ?").bind(iso(nowMs - 7 * 86400000)).run();
  return out;
}
