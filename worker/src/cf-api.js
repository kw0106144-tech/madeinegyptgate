/* Cloudflare API for the developer panel «🛠️ المطوّر» (acc-dev.js: the last deployments / versions + the one-click rollback) and for the
   test of its key in «مفاتيح الخدمات» (acc-keys.js). The calls and shapes are the ones wrangler 4.164 itself uses:
     Pages   GET  /accounts/{a}/pages/projects/{p}                       → result.canonical_deployment = the deployment in production now
             GET  /accounts/{a}/pages/projects/{p}/deployments?env=production → result[] {id, short_id, url, environment, created_on,
                                                                           latest_stage{name, status}, deployment_trigger{type, metadata{branch,
                                                                           commit_hash, commit_message}}}
             POST /accounts/{a}/pages/projects/{p}/deployments/{id}/rollback  (production, successful deployments only)
     Workers GET  /accounts/{a}/workers/scripts/{s}/deployments           → result.deployments[] newest first {id, created_on, source,
                                                                           author_email, versions[{version_id, percentage}], annotations}
             GET  /accounts/{a}/workers/scripts/{s}/versions?deployable=true → result.items[] {id, number, metadata{created_on, source,
                                                                           author_email}, annotations{"workers/message", "workers/tag"}}
             POST /accounts/{a}/workers/scripts/{s}/deployments[?force=true] {strategy:"percentage", versions:[{version_id, percentage:100}],
                                                                           annotations:{"workers/message"}} — error 10220 = secrets changed since
                                                                           that version (names listed) → the owner confirms again with force
             GET  /accounts/{a}/workers/scripts/{s}/versions/{id}        → result.resources.bindings[] {name, type, text} (the panel marker)
     Token   GET  /user/tokens/verify, else /accounts/{a}/tokens/verify (account-owned tokens) → result.status "active"
   The panel marker (panelAware): is a deployment / version one that HAS the developer panel and honours the feature switches? A rollback
   to an older one removes the panel (and its roll-forward) and stops the switches, so acc-dev.js asks for an extra, server-checked
   confirmation first. Pages: the deployment's own URL serves /data/flags.js with «MIGFLAGS» (an older build answers 404). janna-lookup:
   the version's bindings carry the plain-text var DEV_PANEL (wrangler.toml [vars]). migate-intel: not concerned. → true | false | null
   (could not tell: treated like false). Deployments and versions never change, so an answer is kept for the isolate's life.
   Token: the Worker secret CF_DEV_TOKEN, else the owner's sealed slot cloudflare.dev_token (crypto.js, CONFIG_SECRET) — read only here,
   never logged, never returned, no tail kept. Every Cloudflare message is cut, stripped and scrubbed of the token before it is answered.
   Leaf module: imports crypto.js only. */
import { getSecret } from "./crypto.js";

export const CF_API = "https://api.cloudflare.com/client/v4";
export const ACCOUNT_ID = "88c77c2b7595dd0ce510270175f69143";
export const PAGES_PROJECT = "madeinegyptgate";
export const WORKERS = Object.freeze(["janna-lookup", "migate-intel"]);
export const TARGETS = Object.freeze(["pages", ...WORKERS]);
export const CF_SLOT = "cloudflare.dev_token", CF_ENV = "CF_DEV_TOKEN";
export const TIMEOUT_MS = 10000, LIST_MAX = 25;
export const ID_RX = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/; // Pages deployment ids and Worker version ids (UUIDs)
export const SECRETS_CHANGED = 10220;                     // wrangler versions rollback: CANNOT_ROLLBACK_WITH_MODIFIED_SECERT_CODE
export const PANEL_VAR = "DEV_PANEL", PANEL_FILE = "/data/flags.js", PANEL_MARK = "MIGFLAGS", PANEL_TARGETS = Object.freeze(["pages", "janna-lookup"]);
export const PROBE_MS = 6000;
export const accountOf = env => (/^[a-f0-9]{32}$/.test(String((env && env.CF_ACCOUNT_ID) || "")) ? String(env.CF_ACCOUNT_ID) : ACCOUNT_ID);

/* the token the panel uses → {token, source: "env"|"panel"|"none", set, readable, reason: ""|"no_token"|"token_unreadable"|"config_secret_missing"} */
export async function devToken(env) {
  if (env && env[CF_ENV]) return { token: String(env[CF_ENV]), source: "env", set: true, readable: true, reason: "" };
  let v = "";
  try { v = env && env.DB ? await getSecret(env, CF_SLOT) : ""; }
  catch (e) {
    if (e && e.code === "config_secret_missing") return { token: "", source: "none", set: true, readable: false, reason: "config_secret_missing" };
    return { token: "", source: "none", set: false, readable: false, reason: "no_token" }; // no cc_secrets table yet
  }
  if (v === null) return { token: "", source: "none", set: true, readable: false, reason: "token_unreadable" };
  if (!v) return { token: "", source: "none", set: false, readable: false, reason: "no_token" };
  return { token: v, source: "panel", set: true, readable: true, reason: "" };
}

const cut = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const scrub = (s, token) => (token && token.length >= 8 ? String(s).split(token).join("•••") : String(s));
const httpsOnly = u => (/^https:\/\/[A-Za-z0-9.-]+(\/[^\s"'<>`]*)?$/.test(String(u || "")) ? String(u).slice(0, 300) : "");
const newest = (a, b) => String(b.created_on || "").localeCompare(String(a.created_on || ""));

/* one call → {ok, status, result, result_info} | {ok:false, status, error:{status, code, message, secrets?}} — never throws */
export async function cfCall(token, method, path, body) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(CF_API + path, { method, signal: ctl.signal, redirect: "manual",
      headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    return { ok: false, status: 0, error: { status: 0, code: 0, message: e && e.name === "AbortError" ? "Cloudflare did not answer within 10 s" : "Cloudflare unreachable" } };
  } finally { clearTimeout(tm); }
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok || !j || j.success === false) {
    const e0 = (j && Array.isArray(j.errors) && j.errors[0]) || {}, raw = scrub(e0.message || (j ? "" : "not JSON") || r.statusText || "error", token);
    const error = { status: r.status, code: Number(e0.code) || 0, message: cut(raw.replace(/\s*\[code: \d+\]\s*$/, ""), 240) || "HTTP " + r.status };
    if (error.code === SECRETS_CHANGED) { const i = raw.indexOf("have changed:"); error.secrets = i < 0 ? [] : raw.slice(i + 13).replace(/\[code: \d+\]/, "").split(/[,\s]+/).map(s => cut(s, 64)).filter(s => /^[A-Za-z0-9_]{1,64}$/.test(s)).slice(0, 20); }
    return { ok: false, status: r.status, error };
  }
  return { ok: true, status: r.status, result: j.result, result_info: j.result_info || null };
}

/* ---------- Pages ---------- */
function pageItem(d, current) {
  const st = d.latest_stage || {}, tr = d.deployment_trigger || {}, md = tr.metadata || {};
  const success = st.name === "deploy" && st.status === "success", prod = d.environment === "production";
  return { id: cut(d.id, 64), short_id: cut(d.short_id, 16), url: httpsOnly(d.url), environment: cut(d.environment, 20), created_on: cut(d.created_on, 40),
    status: cut(st.status, 20), stage: cut(st.name, 20), branch: cut(md.branch, 120), commit_hash: cut(md.commit_hash, 64), commit_message: cut(md.commit_message, 300),
    trigger: cut(tr.type, 40), is_current: !!current && d.id === current, can_rollback: !!current && prod && success && d.id !== current };
}
/* → {project, ok, error, current_id, items[]} (newest first); the current deployment unknown → nothing can be rolled back */
export async function pagesDeployments(env, token, limit = 10) {
  const a = accountOf(env), base = `/accounts/${a}/pages/projects/${PAGES_PROJECT}`;
  const [proj, list] = await Promise.all([cfCall(token, "GET", base), cfCall(token, "GET", base + "/deployments?env=production")]);
  if (!list.ok) return { project: PAGES_PROJECT, ok: false, error: list.error, current_id: "", items: [] };
  const canon = proj.ok && proj.result && proj.result.canonical_deployment ? proj.result.canonical_deployment : null;
  const current_id = canon && canon.id ? cut(canon.id, 64) : "";
  const rows = (Array.isArray(list.result) ? list.result : []).filter(d => d && typeof d.id === "string").sort(newest);
  return { project: PAGES_PROJECT, ok: true, error: proj.ok ? null : { ...proj.error, message: "project: " + proj.error.message }, current_id,
    items: rows.slice(0, Math.min(LIST_MAX, Math.max(1, limit))).map(d => pageItem(d, current_id)) };
}
export async function pagesRollback(env, token, id) {
  const r = await cfCall(token, "POST", `/accounts/${accountOf(env)}/pages/projects/${PAGES_PROJECT}/deployments/${encodeURIComponent(id)}/rollback`, {});
  if (!r.ok) return r;
  const d = r.result || {};
  return { ok: true, status: r.status, result: { id: cut(d.id, 64), short_id: cut(d.short_id, 16), created_on: cut(d.created_on, 40), url: httpsOnly(d.url) } };
}

/* ---------- Workers ---------- */
const ann = (o, k) => cut(o && o.annotations ? o.annotations[k] : "", 200);
/* → {script, ok, error, current:{deployment_id, created_on, author_email, message, source, version_id, versions[]}|null, items[]} */
export async function workerVersions(env, token, script, limit = 10) {
  const a = accountOf(env), base = `/accounts/${a}/workers/scripts/${encodeURIComponent(script)}`;
  const [dep, ver] = await Promise.all([cfCall(token, "GET", base + "/deployments"), cfCall(token, "GET", base + `/versions?deployable=true&page=1&per_page=${LIST_MAX * 2}`)]);
  if (!ver.ok) return { script, ok: false, error: ver.error, current: null, items: [] };
  const deps = (dep.ok && dep.result && Array.isArray(dep.result.deployments) ? dep.result.deployments : []).filter(d => d && Array.isArray(d.versions)).sort(newest);
  const latest = deps[0] || null;
  const traffic = new Map(latest ? latest.versions.filter(v => v && typeof v.version_id === "string").map(v => [v.version_id, Number(v.percentage) || 0]) : []);
  const main = latest ? latest.versions.slice().sort((x, y) => (Number(y.percentage) || 0) - (Number(x.percentage) || 0))[0] : null;
  const current = latest ? { deployment_id: cut(latest.id, 64), created_on: cut(latest.created_on, 40), author_email: cut(latest.author_email, 254), message: ann(latest, "workers/message"),
    source: cut(latest.source, 40), version_id: main ? cut(main.version_id, 64) : "", versions: [...traffic].map(([version_id, percentage]) => ({ version_id: cut(version_id, 64), percentage })) } : null;
  const items = (ver.result && Array.isArray(ver.result.items) ? ver.result.items : []).filter(v => v && typeof v.id === "string")
    .map(v => ({ v, created_on: String((v.metadata && v.metadata.created_on) || "") })).sort(newest).slice(0, Math.min(LIST_MAX, Math.max(1, limit)))
    .map(({ v }) => { const md = v.metadata || {}, pct = traffic.get(v.id) || 0;
      return { id: cut(v.id, 64), number: Number(v.number) || 0, created_on: cut(md.created_on, 40), author_email: cut(md.author_email, 254), source: cut(md.source, 40),
        message: ann(v, "workers/message"), tag: ann(v, "workers/tag"), traffic: pct, is_current: !!current && pct === 100, can_rollback: !!current && pct !== 100 }; });
  return { script, ok: true, error: dep.ok ? null : { ...dep.error, message: "deployments: " + dep.error.message }, current, items };
}
export async function workerDeploy(env, token, script, versionId, message, force) {
  const r = await cfCall(token, "POST", `/accounts/${accountOf(env)}/workers/scripts/${encodeURIComponent(script)}/deployments${force ? "?force=true" : ""}`,
    { strategy: "percentage", versions: [{ version_id: versionId, percentage: 100 }], annotations: { "workers/message": cut(message, 100) } });
  if (!r.ok) return r;
  const d = r.result || {};
  return { ok: true, status: r.status, result: { id: cut(d.id, 64), created_on: cut(d.created_on, 40) } };
}

/* ---------- the panel marker ---------- */
const AWARE = new Map(); // "<target>:<id>" → true | false (never null: an unknown answer is asked again next time)
const pagesHostOk = u => { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === PAGES_PROJECT + ".pages.dev" || x.hostname.endsWith("." + PAGES_PROJECT + ".pages.dev")) && !x.port; } catch (e) { return false; } };
/* a Pages deployment: GET <its own URL>/data/flags.js — 200 with «MIGFLAGS» = has the panel; 404 = an older build; anything else = null */
async function pagesHasPanel(url) {
  if (!pagesHostOk(url)) return null;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), PROBE_MS);
  try {
    const r = await fetch(new URL(PANEL_FILE, url).toString(), { method: "GET", redirect: "manual", signal: ctl.signal, headers: { Accept: "application/javascript, */*", "User-Agent": "MIG-ControlCenter-Deploys/1" } });
    if (r.status === 404 || r.status === 410) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ } return false; }
    if (r.status !== 200) { try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (e) { /* ignore */ } return null; }
    const t = (await r.text()).slice(0, 20000);
    if (/^\s*</.test(t)) return false; // a page instead of the script (a build without the file)
    return t.includes(PANEL_MARK);
  } catch (e) { return null; } finally { clearTimeout(tm); }
}
/* a Worker version: its bindings (Get Version Detail) carry the plain-text var DEV_PANEL */
async function workerHasPanel(env, token, script, id) {
  const r = await cfCall(token, "GET", `/accounts/${accountOf(env)}/workers/scripts/${encodeURIComponent(script)}/versions/${encodeURIComponent(id)}`);
  const b = r.ok && r.result && r.result.resources && Array.isArray(r.result.resources.bindings) ? r.result.resources.bindings : null;
  if (!b) return null;
  return b.some(x => x && x.name === PANEL_VAR && x.type === "plain_text");
}
/* → true | false | null for one listed item ({id, url} of pagesDeployments / workerVersions); migate-intel → true (not concerned) */
export async function panelAware(env, token, target, item) {
  if (!PANEL_TARGETS.includes(target)) return true;
  const id = String((item && item.id) || ""), k = target + ":" + id;
  if (!id) return null;
  if (AWARE.has(k)) return AWARE.get(k);
  const v = target === "pages" ? await pagesHasPanel(item.url) : await workerHasPanel(env, token, target, id);
  if (v === true || v === false) { if (AWARE.size > 500) AWARE.clear(); AWARE.set(k, v); }
  return v;
}
/* the list's rollback candidates get `panel` (true | false | null); the others are not asked */
export async function markPanel(env, token, target, list) {
  if (!list || !list.ok || !Array.isArray(list.items) || !PANEL_TARGETS.includes(target)) return list;
  await Promise.all(list.items.map(async it => { if (it.can_rollback) it.panel = await panelAware(env, token, target, it); }));
  return list;
}
export const forgetPanel = () => AWARE.clear(); // tests

/* ---------- the key test («اختبار» in «مفاتيح الخدمات»): read-only calls only ---------- */
export async function testToken(env, token) {
  const a = accountOf(env);
  let v = await cfCall(token, "GET", "/user/tokens/verify");
  if (!(v.ok && v.result && v.result.status === "active")) { const w = await cfCall(token, "GET", `/accounts/${a}/tokens/verify`); if (w.ok || !v.ok) v = w; }
  const active = !!(v.ok && v.result && v.result.status === "active");
  if (!active) {
    const detail = v.status === 0 ? "Cloudflare مش متاح دلوقتي / Cloudflare unreachable" : v.ok ? `التوكن مش active (${cut(v.result && v.result.status, 20) || "?"}) / the token is not active`
      : `التوكن مرفوض (${v.status}) / the token was refused (${v.status})`;
    return { ok: false, status: v.status, detail, checks: { token: false, pages: false, workers: false } };
  }
  const [p, w] = await Promise.all([cfCall(token, "GET", `/accounts/${a}/pages/projects/${PAGES_PROJECT}`), cfCall(token, "GET", `/accounts/${a}/workers/scripts/${WORKERS[0]}/deployments`)]);
  const checks = { token: true, pages: !!p.ok, workers: !!w.ok }, ok = checks.pages && checks.workers;
  const miss = [!checks.pages ? `Cloudflare Pages (${p.status})` : "", !checks.workers ? `Workers Scripts (${w.status})` : ""].filter(Boolean).join(" + ");
  return { ok, status: ok ? 200 : (!p.ok ? p.status : w.status), checks,
    detail: ok ? "التوكن شغّال: بيقرا نشرات Pages والـ Workers. الرجوع لنسخة قديمة محتاج صلاحية Edit على الاتنين / the token works: it reads the Pages and Workers deployments (a rollback needs Edit on both)"
      : `التوكن شغّال بس ناقصه صلاحية قراءة: ${miss} / the token works but cannot read: ${miss}` };
}
