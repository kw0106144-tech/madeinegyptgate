/* ONE daily AI ledger in neurons for the Worker's text models («بحث وكتابة عميقة» now, the «اكتبلي» chat later — design §A.6): the rl
   table, one row per Cairo day (never rateOk's epoch windows, which reset at 02:00 Cairo):
     aiday|<day>              everything reserved / spent today (the hard ceiling: AI_DAY_NEURONS, default 600,000 ≈ $6.60)
     aiday|<feature>|<day>    a feature's part (research ≤ 40 %, chat ≤ 60 % of the ceiling)
     aires|<key>              one reservation (its estimate), keyed by the job id + the call number: a step that runs twice reserves once
     aiset|<key>              the reservation was settled (its real usage is in the counters)
   aiReserve BEFORE every model call (the estimate = input + the output cap); refused → nothing is called (the caller finishes without the
   model). aiSettle after the call with the real usage (a timed-out call keeps its estimate: it may have been billed). The photos keep their
   own counter (chat-media.js cmaiday) and migate-intel its own (AI_DAILY_LIMIT): this ledger is the Worker's text models only. */
import { cairoDay, addDays } from "./common.js";

export const AI_DAY_DEFAULT = 600000;
export const SHARES = Object.freeze({ research: 0.4, chat: 0.6, test: 1 });
const num = (v, d, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min ? Math.min(n, max) : d; };
export const dayLimit = (env, o) => num(o && o.day_neurons != null ? o.day_neurons : env && env.AI_DAY_NEURONS, AI_DAY_DEFAULT, 0, 50000000);
const UP = "INSERT INTO rl (k, n, exp) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = n + excluded.n RETURNING n";
const expOf = day => addDays(day, 3) + "T00:00:00.000Z";
const keysOf = (feature, day) => ["aiday|" + day, "aiday|" + feature + "|" + day];
/* → {ok, est, again?, why?} — o: {nowMs, day_neurons, share} (the owner's settings, research.js aiSettings) */
export async function aiReserve(env, feature, est, key, o = {}) {
  const nowMs = o.nowMs || Date.now(), day = cairoDay(nowMs), lim = dayLimit(env, o), share = Number.isFinite(o.share) ? o.share : SHARES[feature] || 0;
  est = Math.max(1, Math.ceil(+est || 1));
  if (!env || !env.DB || lim <= 0) return { ok: false, est, why: "cap" };
  const rk = "aires|" + key;
  try {
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO rl (k, n, exp) VALUES (?, ?, ?)").bind(rk, est, expOf(day)).run();
    if (!(ins && ins.meta && ins.meta.changes)) return { ok: true, est: Number(await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(rk).first("n")) || est, again: true };
    const [tot, part] = keysOf(feature, day);
    const a = Number(await env.DB.prepare(UP).bind(tot, est, expOf(day)).first("n")) || 0;
    const b = Number(await env.DB.prepare(UP).bind(part, est, expOf(day)).first("n")) || 0;
    if (a > lim || b > Math.floor(lim * share)) { await giveBackAi(env, [tot, part], est); await env.DB.prepare("DELETE FROM rl WHERE k = ?").bind(rk).run(); return { ok: false, est, why: "cap" }; }
    return { ok: true, est };
  } catch (e) { return { ok: false, est, why: "store" }; }
}
async function giveBackAi(env, keys, n) { try { for (const k of keys) await env.DB.prepare("UPDATE rl SET n = MAX(0, n - ?) WHERE k = ?").bind(n, k).run(); } catch (e) { /* the row expires */ } }
/* the real usage of a reserved call (once per key); real < 0 = keep the estimate (a timeout: it may have been billed) */
export async function aiSettle(env, feature, key, real, o = {}) {
  if (!env || !env.DB) return false;
  const nowMs = o.nowMs || Date.now(), day = cairoDay(nowMs), rk = "aires|" + key;
  try {
    const est = Number(await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(rk).first("n"));
    if (!Number.isFinite(est) || est <= 0) return false;
    const done = await env.DB.prepare("INSERT OR IGNORE INTO rl (k, n, exp) VALUES (?, 1, ?)").bind("aiset|" + key, expOf(day)).run();
    if (!(done && done.meta && done.meta.changes)) return false;
    if (!(real >= 0)) return true;
    const d = Math.ceil(real) - est;
    if (d > 0) for (const k of keysOf(feature, day)) await env.DB.prepare(UP).bind(k, d, expOf(day)).first("n");
    else if (d < 0) await giveBackAi(env, keysOf(feature, day), -d);
    return true;
  } catch (e) { return false; }
}
/* today: {used, limit, left, by: {research, chat, test}} */
export async function aiToday(env, o = {}) {
  const day = cairoDay(o.nowMs || Date.now()), lim = dayLimit(env, o), get = async k => { try { return Number(await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind(k).first("n")) || 0; } catch (e) { return 0; } };
  const used = env && env.DB ? await get("aiday|" + day) : 0, by = {};
  for (const f of Object.keys(SHARES)) by[f] = env && env.DB ? await get("aiday|" + f + "|" + day) : 0;
  return { day, used, limit: lim, left: Math.max(0, lim - used), by, usd: Math.round(used * 0.011) / 1000 };
}
