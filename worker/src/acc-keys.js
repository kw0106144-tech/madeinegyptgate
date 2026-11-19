/* «مفاتيح الخدمات» — the owner-only service-keys page of the Control Center (owner decision 2026-11-18, «الحل التاني»: the owner pastes the
   respond.io token into the panel instead of the Cloudflare dashboard). Routed by acc.js under /api/admin/cc/keys* with the permission
   keys.manage (OWNER_ONLY): admin, editor, support and X-Platform-Key → 403 owner_only; the team roles seo/data never reach it.
     GET    /keys                         status only — never a value: per slot {set, tail, set_at, set_by, readable, env, effective, last_test},
                                          the respond.io channel, the WhatsApp switch + the EFFECTIVE dry run and why, the payment-gateway
                                          slots read-only (they are managed in «بوابة الدفع», never duplicated here)
     PUT    /keys/:slot {value}           write-only: sealed with CONFIG_SECRET (AES-GCM, AAD per slot, crypto.js); "" deletes.
                                          slots respondio.token · anam.api_key (secrets) · respondio.channel (digits; a plain setting)
     DELETE /keys/:slot                   delete the stored value (the Worker secret, if any, stays in force)
     POST   /keys/:slot/test              ONE read-only call to the provider with the key the Worker uses → {ok, status, detail, source, at}
                                          (respond.io: GET /v2/space/channel and the configured channel must be in the list; Anam:
                                          GET /v1/personas?perPage=1) — 10 per hour per owner
     POST   /keys/wa-test {mode?}         ONE WhatsApp message to the owner's test number 01062531295 (fixed in the code: never the public
                                          setting whatsapp_number, which an admin may edit — review F1)
                                          — only after a passed token test, never while WA_DRY_RUN=1; 3/hour and 5/day per owner
     POST   /keys/wa-live {on, confirm_delivered}   the switch «تشغيل إرسال واتساب الحقيقي»: on → 409 until a passed token test, a sent test
                                          message and the owner's confirmation that it arrived; off is always allowed
   «بحث الإنترنت» (Bassem's web search, src/websearch.js): websearch.provider (setting tavily|serper|brave) · websearch.key (secret, its
                                          «اختبار» = ONE real search) · websearch.cap (setting 0–10000 calls per Cairo day, default 300, 0 = off)
                                          · bassem.tool_secret (secret, the X-MIG-Tool header value in the Anam tool; no test) — GET /keys
                                          returns them in `websearch`, the WhatsApp/Anam `slots` stay as they were
   A new / deleted respond.io token or channel switches WhatsApp off and clears the test state (fail-closed: prove it again).
   A new provider clears the web-search key's last test (it was a test of another provider).
   Every change and test leaves one cc_audit row WITHOUT any value (keys.set, keys.delete, keys.test, wa.test, wa.live); a failing audit
   insert means nothing changed (and, for wa.test, nothing was sent). Decrypted values never leave service-keys.js's memo. */
import { now, line, rateOk } from "./common.js";
import { configSecretOk, seal, maskTail, secretInfo } from "./crypto.js";
import { fail, first, all, hasTable, needTables, batch, body as readBody, jget } from "./acc-base.js";
import { sendOwnerTest, waOn, waLive, waSwitch, waDryEnv, waDryReason } from "./whatsapp.js";
import { SVC_SLOTS, loadServiceKeys, forgetServiceKeys, channelOk, respondioChannel, respondioChannelSource, DEFAULT_CHANNEL } from "./service-keys.js";
// ---- Bassem web search («بحث الإنترنت») ----
import { WS_SLOTS, WS_PROVIDERS, WS_DEFAULT_CAP, WS_MAX_CAP, wsProviderOk, wsCapOk, webSearchConfig } from "./service-keys.js";
import { testWebSearch, usedToday, WS_HEADER } from "./websearch.js";

export const SLOTS = Object.freeze({
  "respondio.token": { kind: "secret", env: "RESPONDIO_TOKEN", test: "respondio", wa: true, label_ar: "توكن respond.io (إرسال واتساب)", label_en: "respond.io API token (WhatsApp sending)" },
  "anam.api_key": { kind: "secret", env: "ANAM_API_KEY", test: "anam", wa: false, label_ar: "مفتاح Anam (فيديو جنة وباسم)", label_en: "Anam API key (Janna & Bassem video)" },
  "respondio.channel": { kind: "setting", env: "RESPONDIO_CHANNEL_ID", wa: true, label_ar: "رقم قناة الواتساب على respond.io", label_en: "respond.io WhatsApp channel id" },
  // ---- Bassem web search («بحث الإنترنت», src/websearch.js) ----
  "websearch.key": { kind: "secret", env: "WEBSEARCH_KEY", test: "websearch", wa: false, ws: true, label_ar: "بحث الإنترنت — المفتاح", label_en: "Web search — API key" },
  "bassem.tool_secret": { kind: "secret", env: "TOOL_SECRET", test: "", wa: false, ws: true, label_ar: "سر أدوات باسم (هيدر X-MIG-Tool في أداة Anam)", label_en: "Bassem's tool secret (the X-MIG-Tool header of the Anam tool)" },
  "websearch.provider": { kind: "setting", env: "WEBSEARCH_PROVIDER", wa: false, ws: true, label_ar: "بحث الإنترنت — مزود الخدمة: Tavily / Serper / Brave", label_en: "Web search — provider: Tavily / Serper / Brave" },
  "websearch.cap": { kind: "setting", env: "WEBSEARCH_CAP", wa: false, ws: true, label_ar: "بحث الإنترنت — الحد اليومي لعمليات البحث", label_en: "Web search — daily search cap" },
});
/* the panel value / state of each sealed slot in the service-keys memo */
const PANEL = { "respondio.token": ["respondio_token", "respondio_state"], "anam.api_key": ["anam_key", "anam_state"], "websearch.key": ["ws_key", "ws_state"], "bassem.tool_secret": ["tool_secret", "tool_state"] };
export const LIMITS = Object.freeze({ tests_per_hour: 10, wa_tests_per_hour: 3, wa_tests_per_day: 5, timeout_ms: 10000 });
export const RESPONDIO_CHANNELS_URL = "https://api.respond.io/v2/space/channel"; // read-only (verified 2026-11-18, whatsapp.js header)
export const ANAM_PERSONAS_URL = "https://api.anam.ai/v1/personas?perPage=1";      // read-only
const OWN_NUMBER = "201062531295";                                                   // the owner's mobile (owner decision 2026-11-19, was the platform's 01279188996) — the go-live test goes here only
const TEST_TEXT = "رسالة تجربة من لوحة تحكم منصة صنع في مصر ✅ لو وصلتك، ارجع لصفحة «مفاتيح الخدمات» واضغط «الرسالة وصلت».\nTest message from the Made in Egypt Gate control panel — if it reached you, confirm it on the «Service keys» page.";
const TEST_TEMPLATE = { template: "bassem_morning", params: ["فريق منصة صنع في مصر"] };
const WA_SETTINGS = ["wa.live", "wa.test_ok_at", "wa.test_sent_at", "wa.test_msg_id", "wa.live_at", "wa.live_by"];

const byOf = adm => line((adm && adm.actor && (adm.actor.actor_email || adm.actor.actor_id)) || "owner", 254);
const setStmt = (env, k, v, by, t) => env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, 'system', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET scope = 'system', v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(k, String(v), by, t);
const delStmt = (env, k) => env.DB.prepare("DELETE FROM cc_settings WHERE k = ?").bind(k);
/* WhatsApp back to "prove it again": switch off, test state cleared (a new token or channel was never tested) */
const waResetStmts = (env, by, t) => [setStmt(env, "wa.live", "0", by, t), ...["wa.test_ok_at", "wa.test_sent_at", "wa.test_msg_id", "keys.test.respondio.token"].map(k => delStmt(env, k))];
async function fresh(env) { forgetServiceKeys(env); return loadServiceKeys(env, { fresh: true }); }
const slotOf = s => (Object.prototype.hasOwnProperty.call(SLOTS, s) ? SLOTS[s] : null);
function unknownSlot(slot, adm) {
  const pay = adm && adm.CC && adm.CC.payments && Array.isArray(adm.CC.payments.PAY_SLOTS) ? adm.CC.payments.PAY_SLOTS : [];
  if (pay.includes(slot) || /^pay\./.test(slot)) fail(400, "use_payments", "مفاتيح بوابة الدفع بتتحفظ من «بوابة الدفع» / payment-gateway keys are managed in «بوابة الدفع»", { section: "payments" });
  if (/^mail\./.test(slot)) fail(400, "use_email", "مفتاح البريد بيتحفظ من «إعدادات البريد» / the mail key is managed in «إعدادات البريد»", { section: "mail" });
  fail(404, "unknown_slot", "مفتاح غير معروف / unknown key slot", { slots: Object.keys(SLOTS) });
}
/* a pasted key: surrounding blanks and a leading "Bearer " dropped; printable ASCII only, no spaces, 16–4096 characters */
export function cleanKey(v) { return String(v == null ? "" : v).trim().replace(/^bearer\s+/i, "").trim(); }
const keyShapeOk = s => /^[\x21-\x7e]{16,4096}$/.test(s);
const ownDisplay = d => (/^20\d{10}$/.test(d) ? "0" + d.slice(2) : d);
/* the owner's WhatsApp test message proves the token on the platform's OWN number: a constant, never the public setting whatsapp_number
   (settings.write — an admin could point it at a number of their choosing and the owner's «الرسالة وصلت» would vouch for it) */
const ownNumber = () => OWN_NUMBER;
async function timed(url, init) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), LIMITS.timeout_ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(tm); }
}
const short = s => line(String(s == null ? "" : s).replace(/[<>"'`]/g, ""), 60);
/* the configured channel anywhere in the channel list (the list's exact shape is not pinned: any object with that id counts) */
export function findChannel(j, channel, depth = 0) {
  if (!j || typeof j !== "object" || depth > 5) return null;
  if (Array.isArray(j)) { for (const x of j.slice(0, 500)) { const h = findChannel(x, channel, depth + 1); if (h) return h; } return null; }
  if (j.id != null && String(j.id) === String(channel)) return { name: short(j.name || j.label || ""), source: short(j.source || j.type || j.channel || "") };
  for (const k of Object.keys(j).slice(0, 50)) { const v = j[k]; if (v && typeof v === "object") { const h = findChannel(v, channel, depth + 1); if (h) return h; } }
  return null;
}
async function testRespondio(key, channel) {
  let r;
  try { r = await timed(RESPONDIO_CHANNELS_URL, { method: "GET", headers: { Authorization: "Bearer " + key, Accept: "application/json" } }); }
  catch (e) { return { ok: false, status: 0, detail: e && e.name === "AbortError" ? "respond.io ماردّش خلال 10 ثواني / respond.io did not answer within 10 s" : "respond.io مش متاح دلوقتي / respond.io unreachable", channel_found: false }; }
  if (!r.ok) return { ok: false, status: r.status, detail: r.status === 401 || r.status === 403 ? `التوكن مرفوض (${r.status}) / the token was refused (${r.status})` : `respond.io ${r.status}`, channel_found: false };
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  const hit = findChannel(j, channel);
  if (!hit) return { ok: false, status: r.status, token_ok: true, channel_found: false, detail: `التوكن شغّال، بس القناة ${channel} مش في الحساب ده — راجع رقم القناة / the token works, but channel ${channel} is not in this space` };
  return { ok: true, status: r.status, channel_found: true, detail: `التوكن شغّال والقناة ${channel} موجودة / the token works and channel ${channel} exists${hit.name ? " — " + hit.name : ""}${hit.source ? " (" + hit.source + ")" : ""}` };
}
async function testAnam(key) {
  let r;
  try { r = await timed(ANAM_PERSONAS_URL, { method: "GET", headers: { Authorization: "Bearer " + key, Accept: "application/json" } }); }
  catch (e) { return { ok: false, status: 0, detail: e && e.name === "AbortError" ? "Anam ماردّش خلال 10 ثواني / Anam did not answer within 10 s" : "Anam مش متاح دلوقتي / Anam unreachable" }; }
  if (r.ok) return { ok: true, status: r.status, detail: "المفتاح شغّال / the key works" };
  return { ok: false, status: r.status, detail: r.status === 401 || r.status === 403 ? `المفتاح مرفوض (${r.status}) / the key was refused (${r.status})` : `Anam ${r.status}` };
}

/* ---------- GET /keys ---------- */
export async function getKeys(env, adm) {
  const store = (await hasTable(env, "cc_secrets")) && (await hasTable(env, "cc_settings"));
  const v = await fresh(env);
  let info = {}; try { info = store ? await secretInfo(env, [...SVC_SLOTS]) : {}; } catch (e) { info = {}; }
  const sys = new Map((store ? await all(env, "SELECT k, v, updated_by, updated_at FROM cc_settings WHERE scope = 'system' AND (k LIKE 'wa.%' OR k LIKE 'respondio.%' OR k LIKE 'keys.%' OR k LIKE 'websearch.%')") : []).map(r => [r.k, r]));
  const lastTest = s => { const r = sys.get("keys.test." + s); const o = r ? jget(r.v, null) : null; return o && typeof o === "object" ? { at: String(o.at || ""), ok: !!o.ok, status: Number(o.status) || 0, detail: line(o.detail || "", 300), source: String(o.source || ""), by: String(o.by || "") } : null; };
  const slots = {};
  for (const name of SVC_SLOTS) {
    const d = SLOTS[name], i = info[name] || {}, envSet = !!(env && env[d.env]);
    slots[name] = { kind: "secret", label_ar: d.label_ar, label_en: d.label_en, set: !!i.set, tail: i.set ? String(i.tail || "") : "", set_at: i.set ? String(i.set_at || "") : "", set_by: i.set ? String(i.set_by || "") : "",
      readable: !!(i.set && i.readable), env: envSet, env_name: d.env, effective: envSet ? "env" : i.set && i.readable ? "panel" : "none", last_test: lastTest(name) };
  }
  const ch = sys.get("respondio.channel"), envCh = channelOk(env && env.RESPONDIO_CHANNEL_ID);
  slots["respondio.channel"] = { kind: "setting", label_ar: SLOTS["respondio.channel"].label_ar, label_en: SLOTS["respondio.channel"].label_en, value: ch ? String(ch.v) : "", set_at: ch ? ch.updated_at : "", set_by: ch ? ch.updated_by : "",
    env_value: envCh ? String(envCh) : "", env_name: "RESPONDIO_CHANNEL_ID", prefill: String(envCh || DEFAULT_CHANNEL), effective: String(respondioChannel(env)), source: respondioChannelSource(env) };
  const own = ownNumber(), live = waLive(env), sentOk = !!(v.wa_test_sent_at && v.wa_test_ok_at && v.wa_test_sent_at >= v.wa_test_ok_at);
  const wa = { switch: v.wa_switch, live, dry_run: !live, dry_run_env: waDryEnv(env), reason: waDryReason(env) || "live", token: waOn(env),
    test_ok_at: v.wa_test_ok_at, test_sent_at: v.wa_test_sent_at, live_at: sys.has("wa.live_at") ? String(sys.get("wa.live_at").v) : "", live_by: sys.has("wa.live_by") ? String(sys.get("wa.live_by").v) : "",
    own_number: own, own_display: ownDisplay(own), can_send_test: waOn(env) && !waDryEnv(env) && !!v.wa_test_ok_at, can_go_live: waOn(env) && !!v.wa_test_ok_at && sentOk,
    steps: { token: waOn(env), token_test: !!v.wa_test_ok_at, test_message: sentOk, switch: v.wa_switch } };
  let payments = null;
  const P = adm && adm.CC && adm.CC.payments;
  if (P && Array.isArray(P.PAY_SLOTS) && P.PAY_SLOTS.length && store) {
    let pi = {}; try { pi = await secretInfo(env, P.PAY_SLOTS); } catch (e) { pi = {}; }
    const out = {}; for (const s of P.PAY_SLOTS) { const i = pi[s] || {}; out[s] = { set: !!i.set, tail: i.set ? String(i.tail || "") : "", set_at: i.set ? String(i.set_at || "") : "", readable: !!(i.set && i.readable) }; }
    let ready = null; try { if (typeof P.payReady === "function") { const r = await P.payReady(env); ready = { ready: !!(r && r.ready), provider: String((r && r.provider) || ""), mode: String((r && r.mode) || "") }; } } catch (e) { ready = null; }
    payments = { read_only: true, section: "payments", slots: out, gateway: ready };
  }
  const websearch = await wsView(env, store, sys);
  return { config_secret: configSecretOk(env), store, slots, wa, payments, limits: LIMITS, websearch };
}
/* «بحث الإنترنت» — presence and settings only, never a value */
async function wsView(env, store, sys) {
  let info = {}; try { info = store ? await secretInfo(env, [...WS_SLOTS]) : {}; } catch (e) { info = {}; }
  const cfg = await webSearchConfig(env);
  const lastTest = s => { const r = sys.get("keys.test." + s); const o = r ? jget(r.v, null) : null; return o && typeof o === "object" ? { at: String(o.at || ""), ok: !!o.ok, status: Number(o.status) || 0, detail: line(o.detail || "", 300), source: String(o.source || ""), by: String(o.by || "") } : null; };
  const sec = name => { const d = SLOTS[name], i = info[name] || {}, envSet = !!(env && env[d.env]);
    return { kind: "secret", label_ar: d.label_ar, label_en: d.label_en, set: !!i.set, tail: i.set ? String(i.tail || "") : "", set_at: i.set ? String(i.set_at || "") : "", set_by: i.set ? String(i.set_by || "") : "",
      readable: !!(i.set && i.readable), env: envSet, env_name: d.env, effective: envSet ? "env" : i.set && i.readable ? "panel" : "none", testable: !!d.test, last_test: d.test ? lastTest(name) : null }; };
  const setting = name => { const r = sys.get(name), d = SLOTS[name]; return { kind: "setting", label_ar: d.label_ar, label_en: d.label_en, value: r ? String(r.v) : "", set_at: r ? String(r.updated_at || "") : "", set_by: r ? String(r.updated_by || "") : "", env_name: d.env }; };
  const envCap = wsCapOk(env && env.WEBSEARCH_CAP);
  return { ready: cfg.ready, reason: cfg.reason || "ready", endpoint: "/api/advisor/web", header: WS_HEADER,
    provider: { ...setting("websearch.provider"), options: [...WS_PROVIDERS], env_value: wsProviderOk(env && env.WEBSEARCH_PROVIDER), effective: cfg.provider, source: cfg.provider_source },
    key: sec("websearch.key"), tool_secret: sec("bassem.tool_secret"),
    cap: { ...setting("websearch.cap"), env_value: envCap >= 0 ? String(envCap) : "", "default": WS_DEFAULT_CAP, max: WS_MAX_CAP, effective: cfg.cap, source: cfg.cap_source },
    used_today: store ? await usedToday(env) : 0 };
}
/* PUT / DELETE of the two web-search settings: provider (tavily|serper|brave) and the daily cap (0–10000, 0 = off); "" = back to the default */
async function putWsSetting(env, adm, slot, raw) {
  await needTables(env, "cc_settings", "cc_audit");
  const s = String(raw == null ? "" : raw).trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  let val = "";
  if (s && slot === "websearch.provider") { val = wsProviderOk(s); if (!val) fail(422, "invalid", "اختار مزود من التلاتة: Tavily أو Serper أو Brave / choose one of tavily, serper, brave", { errors: [{ field: "value", msg: "tavily | serper | brave", code: "invalid_provider" }], options: [...WS_PROVIDERS] }); }
  if (s && slot === "websearch.cap") { const n = wsCapOk(s); if (n < 0) fail(422, "invalid", `الحد اليومي رقم من 0 لـ ${WS_MAX_CAP} (0 = البحث مقفول) / the daily cap is a number from 0 to ${WS_MAX_CAP} (0 = off)`, { errors: [{ field: "value", msg: "0–" + WS_MAX_CAP, code: "invalid_cap" }] }); val = String(n); }
  const cur = await first(env, "SELECT v FROM cc_settings WHERE k = ?", slot), before = cur ? String(cur.v) : "";
  const item = async () => { const c = await webSearchConfig(env); return slot === "websearch.provider" ? { value: val, effective: c.provider, source: c.provider_source } : { value: val, effective: c.cap, source: c.cap_source }; };
  if (before === val) return { body: { ok: true, unchanged: true, slot, item: await item() } };
  const t = now(), by = byOf(adm), stmts = [val ? setStmt(env, slot, val, by, t) : delStmt(env, slot)];
  if (slot === "websearch.provider") stmts.push(delStmt(env, "keys.test.websearch.key"));
  stmts.push(adm.auditStmt(val ? "keys.set" : "keys.delete", "service_key", slot, { value: before || null }, { value: val || null }, `${slot}: ${val || "back to the default"}`));
  await batch(env, stmts);
  await fresh(env);
  return { body: { ok: true, slot, item: await item() } };
}

/* ---------- PUT / DELETE /keys/:slot ---------- */
export async function putKey(req, env, ctx, adm, slot) {
  const d = slotOf(slot); if (!d) unknownSlot(slot, adm);
  const b = await readBody(req, 8192);
  if (typeof b.value !== "string" && typeof b.value !== "number") fail(400, "required", "value: نص المفتاح مطلوب ('' بيمسحه) / value is required ('' deletes it)");
  if (d.kind === "setting") return d.ws ? putWsSetting(env, adm, slot, String(b.value)) : putChannel(env, adm, String(b.value));
  const value = cleanKey(b.value);
  if (!value) return deleteKey(req, env, ctx, adm, slot);
  await needTables(env, "cc_secrets", "cc_settings", "cc_audit");
  if (!configSecretOk(env)) fail(503, "config_secret_missing", "لازم سر CONFIG_SECRET على الـ Worker قبل حفظ أي مفتاح / the Worker secret CONFIG_SECRET is required before any key can be saved");
  if (!keyShapeOk(value)) fail(422, "invalid", "المفتاح لازم يكون 16 حرف أو أكتر من غير مسافات / the key must be 16+ printable characters without spaces", { errors: [{ field: "value", msg: "16–4096 printable characters, no spaces", code: "invalid_key" }] });
  const prev = await first(env, "SELECT set_at FROM cc_secrets WHERE name = ?", slot), t = now(), by = byOf(adm);
  const sealed = await seal(env, slot, value);
  const stmts = [env.DB.prepare("INSERT INTO cc_secrets (name, sealed, tail, set_by, set_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET sealed = excluded.sealed, tail = excluded.tail, set_by = excluded.set_by, set_at = excluded.set_at")
    .bind(slot, sealed, maskTail(value), by, t), delStmt(env, "keys.test." + slot)];
  if (d.wa) stmts.push(...waResetStmts(env, by, t));
  stmts.push(adm.auditStmt("keys.set", "service_key", slot, { set: !!prev }, { set: true, ...(d.wa ? { wa_switch: "off_until_tested" } : {}) }, `${slot}: ${prev ? "replaced" : "saved"} (value not logged)${d.wa ? " — WhatsApp off until a new test" : ""}`));
  await batch(env, stmts);
  await fresh(env);
  return { body: { ok: true, slot, item: { set: true, tail: maskTail(value), set_at: t, set_by: by, readable: true }, wa_reset: !!d.wa } };
}
async function putChannel(env, adm, raw) {
  await needTables(env, "cc_settings", "cc_audit");
  const s = raw.trim(), slot = "respondio.channel";
  const cur = await first(env, "SELECT v FROM cc_settings WHERE k = ?", slot), t = now(), by = byOf(adm);
  if (!s) {
    if (!cur) return { body: { ok: true, unchanged: true, slot } };
    await batch(env, [delStmt(env, slot), ...waResetStmts(env, by, t), adm.auditStmt("keys.delete", "service_key", slot, { value: String(cur.v) }, { value: null }, `${slot}: back to ${channelOk(env && env.RESPONDIO_CHANNEL_ID) ? "RESPONDIO_CHANNEL_ID" : DEFAULT_CHANNEL} — WhatsApp off until a new test`)]);
    await fresh(env);
    return { body: { ok: true, slot, item: { value: "", effective: String(respondioChannel(env)) }, wa_reset: true } };
  }
  const n = channelOk(s);
  if (!n) fail(422, "invalid", "رقم القناة أرقام بس / the channel id is digits only", { errors: [{ field: "value", msg: "1–12 digits", code: "invalid_channel" }] });
  if (cur && String(cur.v) === String(n)) return { body: { ok: true, unchanged: true, slot, item: { value: String(n), effective: String(respondioChannel(env)) } } };
  await batch(env, [setStmt(env, slot, String(n), by, t), ...waResetStmts(env, by, t), adm.auditStmt("keys.set", "service_key", slot, { value: cur ? String(cur.v) : null }, { value: String(n) }, `${slot}: ${n} — WhatsApp off until a new test`)]);
  await fresh(env);
  return { body: { ok: true, slot, item: { value: String(n), effective: String(respondioChannel(env)) }, wa_reset: true } };
}
export async function deleteKey(req, env, ctx, adm, slot) {
  const d = slotOf(slot); if (!d) unknownSlot(slot, adm);
  if (d.kind === "setting") return d.ws ? putWsSetting(env, adm, slot, "") : putChannel(env, adm, "");
  await needTables(env, "cc_secrets", "cc_settings", "cc_audit");
  const prev = await first(env, "SELECT set_at FROM cc_secrets WHERE name = ?", slot);
  if (!prev) return { body: { ok: true, unchanged: true, slot } };
  const t = now(), by = byOf(adm);
  const stmts = [env.DB.prepare("DELETE FROM cc_secrets WHERE name = ?").bind(slot), delStmt(env, "keys.test." + slot)];
  if (d.wa) stmts.push(...waResetStmts(env, by, t));
  stmts.push(adm.auditStmt("keys.delete", "service_key", slot, { set: true }, { set: false }, `${slot}: deleted${env && env[d.env] ? ` (the Worker secret ${d.env} stays in force)` : ""}${d.wa ? " — WhatsApp off" : ""}`));
  await batch(env, stmts);
  await fresh(env);
  return { body: { ok: true, slot, item: { set: false }, env_in_force: !!(env && env[d.env]), wa_reset: !!d.wa } };
}

/* ---------- POST /keys/:slot/test ---------- */
export async function testKey(req, env, ctx, adm, slot) {
  const d = slotOf(slot); if (!d) unknownSlot(slot, adm);
  if (d.kind !== "secret" && d.ws) fail(400, "test_the_key", "الإعداد ده بيتجرّب مع اختبار مفتاح بحث الإنترنت / this setting is checked by the web-search key test", { slot: "websearch.key" });
  if (d.kind !== "secret") fail(400, "test_the_token", "القناة بتتجرّب مع توكن respond.io / the channel is checked by the respond.io token test", { slot: "respondio.token" });
  if (!d.test) fail(400, "no_test", "السر ده مالوش اختبار: بيتأكد لما أداة باسم تتنادى بنفس القيمة / this secret has no test: it is checked when Bassem's tool calls with the same value");
  await needTables(env, "cc_settings", "cc_audit");
  const v = await fresh(env), envKey = env && env[d.env] ? String(env[d.env]) : "";
  const panelKey = v[PANEL[slot][0]] || "", state = v[PANEL[slot][1]];
  const key = envKey || panelKey, source = envKey ? "env" : panelKey ? "panel" : "none";
  if (!key) fail(409, state === "unreadable" ? "unreadable" : "not_set", state === "unreadable" ? "المفتاح المحفوظ مش مقروء (CONFIG_SECRET اتغيّر؟) — دخّله تاني / the saved key cannot be read (CONFIG_SECRET changed?) — enter it again" : "مفيش مفتاح متضاف / no key is set");
  // the limit counts real provider calls only (10 per hour per owner)
  if (!(await rateOk(env, "cckt|" + adm.actor.actor_id, LIMITS.tests_per_hour, 3600))) fail(429, "rate_limited", "اختبارات كتير في ساعة — استنى شوية / too many tests this hour", { limit: LIMITS.tests_per_hour, window_s: 3600 });
  const channel = respondioChannel(env);
  const res = d.test === "respondio" ? await testRespondio(key, channel) : d.test === "websearch" ? await testWebSearch(env, await webSearchConfig(env)) : await testAnam(key);
  const t = now(), by = byOf(adm), rec = { at: t, ok: res.ok, status: res.status, detail: res.detail, source, by };
  // audit first (a failing audit = nothing recorded); the result row and, for respond.io, the "test passed" mark in the same batch
  const stmts = [adm.auditStmt("keys.test", "service_key", slot, null, { ok: res.ok, status: res.status, source, ...(d.wa ? { channel, channel_found: !!res.channel_found } : {}) }, `${slot} test: ${res.ok ? "ok" : "failed"} (${res.status || "no answer"}, ${source})`),
    setStmt(env, "keys.test." + slot, JSON.stringify(rec), by, t)];
  if (d.wa && res.ok) stmts.push(setStmt(env, "wa.test_ok_at", t, by, t));
  await batch(env, stmts);
  const after = await fresh(env);
  return { body: { ok: res.ok, status: res.status, detail: res.detail, source, at: t, ...(d.wa ? { channel: String(channel), channel_found: !!res.channel_found, token_ok: !!(res.ok || res.token_ok), wa_test_ok_at: after.wa_test_ok_at } : {}) } };
}

/* ---------- POST /keys/wa-test ---------- */
export async function waTest(req, env, ctx, adm) {
  const b = await readBody(req, 4096);
  await needTables(env, "cc_settings", "cc_audit");
  const v = await fresh(env);
  if (!waOn(env)) fail(409, "not_set", "مفيش توكن respond.io / no respond.io token is set");
  if (waDryEnv(env)) fail(409, "dry_run_env", "WA_DRY_RUN = \"1\" على الـ Worker بيقفل كل الإرسال — لازم يبقى \"0\" الأول / WA_DRY_RUN=\"1\" on the Worker stops all sending — it must be \"0\" first");
  if (!v.wa_test_ok_at) fail(409, "token_test_required", "اختبر توكن respond.io الأول (لازم ينجح والقناة تكون موجودة) / test the respond.io token first (it must pass with the channel found)");
  if (!(await rateOk(env, "ccwth|" + adm.actor.actor_id, LIMITS.wa_tests_per_hour, 3600)) || !(await rateOk(env, "ccwtd|" + adm.actor.actor_id, LIMITS.wa_tests_per_day, 86400)))
    fail(429, "rate_limited", "رسايل تجربة كتير — استنى شوية / too many test messages", { limit_hour: LIMITS.wa_tests_per_hour, limit_day: LIMITS.wa_tests_per_day });
  const own = ownNumber(), mode = b.mode === "template" ? "template" : "text", by = byOf(adm);
  const id = await adm.audit("wa.test", "whatsapp", own, null, { to: ownDisplay(own), mode, status: "sending" }, `test message to the platform's own number ${ownDisplay(own)} (${mode})`);
  const r = await sendOwnerTest(env, own, mode === "template" ? TEST_TEMPLATE : { text: TEST_TEXT });
  await adm.auditDone(id, { after: { to: ownDisplay(own), mode, sent: !!r.sent, provider_id: r.sent ? line(r.id, 80) : "", error: r.sent ? "" : line(r.error, 160) }, summary: `test message to ${ownDisplay(own)} (${mode}): ${r.sent ? "sent" : "not sent"}` });
  if (r.sent) { const t = now(); await batch(env, [setStmt(env, "wa.test_sent_at", t, by, t), setStmt(env, "wa.test_msg_id", line(r.id, 80), by, t)]); await fresh(env); }
  return { body: { ok: true, sent: !!r.sent, to: ownDisplay(own), mode, ...(r.sent ? { provider_id: line(r.id, 80), next: "confirm_delivery" } : { error: line(r.error, 160), next: "retry",
    hint: mode === "text" ? "الرسالة النصية بتوصل بس جوّه نافذة الـ 24 ساعة: ابعت أي رسالة من الرقم ده لرقم واتساب المنصة الأول، أو استخدم القالب بعد موافقة Meta / free text needs the 24 h window: first send any message from this number to the platform's WhatsApp, or use the template once Meta approved it" : "القالب لازم يكون متوافق عليه من Meta / the template must be approved by Meta" }) } };
}

/* ---------- POST /keys/wa-live ---------- */
export async function waLiveSwitch(req, env, ctx, adm) {
  const b = await readBody(req, 4096);
  if (typeof b.on !== "boolean") fail(400, "required", "on: true | false");
  await needTables(env, "cc_settings", "cc_audit");
  const v = await fresh(env);
  if (b.on) {
    const need = [];
    if (!waOn(env)) need.push("token");
    if (!v.wa_test_ok_at) need.push("token_test");
    if (!(v.wa_test_sent_at && v.wa_test_ok_at && v.wa_test_sent_at >= v.wa_test_ok_at)) need.push("test_message");
    if (b.confirm_delivered !== true) need.push("delivery_confirmation");
    if (need.length) fail(409, need[0] === "token" ? "not_set" : need[0] + "_required", "لسه مينفعش نشغّل الإرسال الحقيقي: اختبار التوكن ثم رسالة تجربة لرقم المنصة وتأكيد إنها وصلت / not yet: a passed token test, a test message to the platform's own number and your confirmation that it arrived", { need });
  }
  const state = () => ({ switch: waSwitch(env), live: waLive(env), dry_run: !waLive(env), dry_run_env: waDryEnv(env), reason: waDryReason(env) || "live" });
  if (v.wa_switch === b.on) return { body: { ok: true, unchanged: true, ...state() } };
  const t = now(), by = byOf(adm);
  await batch(env, [setStmt(env, "wa.live", b.on ? "1" : "0", by, t), setStmt(env, "wa.live_at", t, by, t), setStmt(env, "wa.live_by", by, by, t),
    adm.auditStmt("wa.live", "whatsapp", "switch", { on: v.wa_switch }, { on: b.on, ...(b.on ? { confirm_delivered: true, tested_at: v.wa_test_ok_at, test_sent_at: v.wa_test_sent_at } : {}) },
      b.on ? `WhatsApp real sending switched ON${waDryEnv(env) ? " (still a dry run: WA_DRY_RUN=1)" : ""}` : "WhatsApp real sending switched OFF")]);
  await fresh(env);
  return { body: { ok: true, ...state() } };
}

/* whoami.features (acc.js) — presence and switch state only, never a value */
export function keyFeatures(env, adm) {
  return { keys: !!(adm && adm.can && adm.can("keys.manage")), respondio: waOn(env), wa_live: waLive(env), wa_switch: waSwitch(env), wa_dry_run_env: waDryEnv(env), wa_reason: waDryReason(env) || "live" };
}
export { WA_SETTINGS };
