/* «مفاتيح الخدمات» (owner decision 2026-11-18, docs: worker/README.md "Service keys") — the Worker-side READER of the keys and switches
   the owner enters in the Control Center (src/acc-keys.js is the owner-only admin API that writes them).
   Leaf module: imports crypto.js only, so whatsapp.js, meetings.js and the acc-*.js modules can all use it without a load-time cycle.
     sealed slots (cc_secrets, AES-GCM with CONFIG_SECRET, AAD per slot — crypto.js): respondio.token · anam.api_key
                  + Bassem's web search (src/websearch.js): websearch.key · bassem.tool_secret (the X-MIG-Tool header of his server tools)
     settings (cc_settings, scope 'system'; no row = the default):  respondio.channel · wa.live ("1" = on, default off) · wa.test_ok_at ·
                                                                    wa.test_sent_at · websearch.provider (tavily|serper|brave) ·
                                                                    websearch.cap (calls per Cairo day, default 300, 0 = off)
   loadServiceKeys(env) reads them at most once per isolate per 60 s (memo keyed by env.DB — acc.js ccBoot calls it at the start of every
   request, cron run and inbound e-mail); svc(env) is the SYNC view of the last load. Before the first load, without the 0006 tables, or on
   any read error the view is EMPTY = no panel token, no channel, switch OFF (fail-closed: WhatsApp stays a dry run).
   Precedence (owner decision): a Worker secret wins — RESPONDIO_TOKEN, ANAM_API_KEY, WEBSEARCH_KEY, TOOL_SECRET — else the panel's sealed slot. The respond.io channel
   is a plain setting: the panel value, else the RESPONDIO_CHANNEL_ID var, else 580384 (the var is always set in wrangler.toml, so an
   env-first channel would make the panel field dead).
   Decrypted values live only in this memo: never logged, never returned to a browser, never written anywhere else. */
import { getSecret } from "./crypto.js";

export const SVC_SLOTS = Object.freeze(["respondio.token", "anam.api_key"]);
export const SVC_SETTINGS = Object.freeze(["respondio.channel", "wa.live", "wa.test_ok_at", "wa.test_sent_at"]);
/* ---- Bassem's web search (src/websearch.js) — kept out of SVC_SLOTS / SVC_SETTINGS so the WhatsApp/Anam lists stay as they are ---- */
export const WS_SLOTS = Object.freeze(["websearch.key", "bassem.tool_secret"]);
export const WS_SETTINGS = Object.freeze(["websearch.provider", "websearch.cap"]);
export const WS_PROVIDERS = Object.freeze(["tavily", "serper", "brave"]);
export const WS_DEFAULT_CAP = 300, WS_MAX_CAP = 10000;
export const DEFAULT_CHANNEL = 580384;
export const MEMO_MS = 60000;
const EMPTY = Object.freeze({ loaded: false, store: false, respondio_token: "", respondio_state: "none", anam_key: "", anam_state: "none", channel: 0,
  wa_switch: false, wa_live: false, wa_test_ok_at: "", wa_test_sent_at: "",
  ws_key: "", ws_state: "none", tool_secret: "", tool_state: "none", ws_provider: "", ws_cap: -1 });
const MEMO = new WeakMap(); // env.DB → {at, v}
const dbOf = env => (env && env.DB && typeof env.DB.prepare === "function" ? env.DB : null);
const isoOk = s => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(String(s || "")) && !isNaN(Date.parse(s)) ? String(s) : "");
export const channelOk = v => { const s = String(v == null ? "" : v).trim(); return /^[1-9]\d{0,11}$/.test(s) ? Number(s) : 0; };
export const wsProviderOk = v => { const s = String(v == null ? "" : v).trim().toLowerCase(); return WS_PROVIDERS.includes(s) ? s : ""; };
/* the daily cap: 0–10000 (0 = web search off) → the number, -1 = not a valid cap */
export const wsCapOk = v => { const s = String(v == null ? "" : v).trim(); return /^\d{1,5}$/.test(s) && Number(s) <= WS_MAX_CAP ? Number(s) : -1; };
/* a key's provider from its shape, ONLY when nothing names one: Tavily keys start "tvly-", Brave "BSA", Serper keys are 40 hex characters */
export const guessProvider = k => { k = String(k || ""); return /^tvly-/i.test(k) ? "tavily" : /^BSA[\w-]{10,}$/.test(k) ? "brave" : /^[a-f0-9]{40}$/i.test(k) ? "serper" : ""; };

async function readAll(env) {
  const db = dbOf(env), out = { ...EMPTY, loaded: true };
  let rows;
  const KS = [...SVC_SETTINGS, ...WS_SETTINGS];
  try { rows = (await db.prepare(`SELECT k, v FROM cc_settings WHERE scope = 'system' AND k IN (${KS.map(() => "?").join(", ")})`).bind(...KS).all()).results || []; }
  catch (e) { return out; } // no 0006 tables yet: nothing is configured here
  out.store = true;
  const s = {}; for (const r of rows) s[r.k] = String(r.v == null ? "" : r.v);
  out.channel = channelOk(s["respondio.channel"]);
  out.wa_test_ok_at = isoOk(s["wa.test_ok_at"]);
  out.wa_test_sent_at = isoOk(s["wa.test_sent_at"]);
  out.wa_switch = s["wa.live"] === "1";
  out.wa_live = out.wa_switch && !!out.wa_test_ok_at; // the switch counts only after a passed token test (acc-keys.js enforces the full order)
  out.ws_provider = wsProviderOk(s["websearch.provider"]);
  out.ws_cap = s["websearch.cap"] === undefined ? -1 : wsCapOk(s["websearch.cap"]);
  /* the four sealed slots are read together (one D1 round trip instead of four — speed 2026-11-20); each slot keeps its own outcome */
  await Promise.all([["respondio.token", "respondio_token", "respondio_state"], ["anam.api_key", "anam_key", "anam_state"],
    ["websearch.key", "ws_key", "ws_state"], ["bassem.tool_secret", "tool_secret", "tool_state"]].map(async ([slot, key, state]) => {
    try { const v = await getSecret(env, slot); if (v) { out[key] = v; out[state] = "ok"; } else if (v === null) out[state] = "unreadable"; }
    catch (e) { out[state] = e && e.code === "config_secret_missing" ? "unreadable" : "none"; } // set, but CONFIG_SECRET is missing / changed
  }));
  return out;
}
/* → the view (never throws); memo 60 s per database, `fresh` re-reads (after a write in this isolate) */
export async function loadServiceKeys(env, { fresh = false } = {}) {
  const db = dbOf(env); if (!db) return EMPTY;
  const hit = MEMO.get(db);
  if (!fresh && hit && Date.now() - hit.at < MEMO_MS) return hit.v;
  let v; try { v = Object.freeze(await readAll(env)); } catch (e) { v = Object.freeze({ ...EMPTY, loaded: true }); }
  MEMO.set(db, { at: Date.now(), v });
  return v;
}
/* the switch as stored RIGHT NOW (one D1 read, no memo): every real WhatsApp send checks it just before the provider call, so «إيقاف»
   in one isolate stops the sends of every isolate at once (the memo only decides what is attempted). Any error → false (fail-closed). */
export async function waSwitchNow(env) {
  const db = dbOf(env); if (!db) return false;
  try {
    const { results } = await db.prepare("SELECT k, v FROM cc_settings WHERE scope = 'system' AND k IN ('wa.live', 'wa.test_ok_at')").all();
    const s = {}; for (const r of results || []) s[r.k] = String(r.v == null ? "" : r.v);
    return s["wa.live"] === "1" && !!isoOk(s["wa.test_ok_at"]);
  } catch (e) { return false; }
}
/* sync — the last loaded view (EMPTY before ccBoot ran for this database) */
export const svc = env => { const db = dbOf(env), hit = db && MEMO.get(db); return hit ? hit.v : EMPTY; };
export const forgetServiceKeys = env => { const db = dbOf(env); if (db) MEMO.delete(db); };

/* the respond.io token the Worker uses (sync): the RESPONDIO_TOKEN secret, else the panel's slot */
export const respondioToken = env => String((env && env.RESPONDIO_TOKEN) || svc(env).respondio_token || "");
export const respondioTokenSource = env => (env && env.RESPONDIO_TOKEN ? "env" : svc(env).respondio_token ? "panel" : "none");
/* the respond.io channel (sync): the panel value, else RESPONDIO_CHANNEL_ID, else 580384 */
export const respondioChannel = env => svc(env).channel || channelOk(env && env.RESPONDIO_CHANNEL_ID) || DEFAULT_CHANNEL;
export const respondioChannelSource = env => (svc(env).channel ? "panel" : channelOk(env && env.RESPONDIO_CHANNEL_ID) ? "env" : "default");
/* the Anam key (async — loads the memo if needed): the ANAM_API_KEY secret, else the panel's slot; "" = none */
export async function anamKey(env) {
  if (env && env.ANAM_API_KEY) return String(env.ANAM_API_KEY);
  return (await loadServiceKeys(env)).anam_key || "";
}
export const anamKeySource = env => (env && env.ANAM_API_KEY ? "env" : svc(env).anam_key ? "panel" : "none");

/* ---- Bassem's web search (src/websearch.js): which provider + key, the daily cap and the shared tool secret ----
   key: the WEBSEARCH_KEY Worker secret, else the panel slot websearch.key. provider: for the env key WEBSEARCH_PROVIDER, else the key's
   shape, else the panel choice; for the panel key the panel choice, else WEBSEARCH_PROVIDER, else the key's shape. cap: the panel value,
   else the WEBSEARCH_CAP var, else 300 (0 = off). tool secret: the TOOL_SECRET Worker secret, else the panel slot bassem.tool_secret.
   → {key, key_source, provider, provider_source, cap, cap_source, tool_secret, tool_source, ready, reason} — never logged / returned. */
export async function webSearchConfig(env) {
  const v = await loadServiceKeys(env), E = env || {};
  const envKey = E.WEBSEARCH_KEY ? String(E.WEBSEARCH_KEY) : "", envProv = wsProviderOk(E.WEBSEARCH_PROVIDER);
  const key = envKey || v.ws_key || "", key_source = envKey ? "env" : v.ws_key ? "panel" : "none";
  const chain = key_source === "env" ? [[envProv, "env"], [guessProvider(key), "key"], [v.ws_provider, "panel"]] : [[v.ws_provider, "panel"], [envProv, "env"], [guessProvider(key), "key"]];
  const hit = chain.find(c => c[0]) || ["", "none"];
  const envCap = wsCapOk(E.WEBSEARCH_CAP);
  const cap = v.ws_cap >= 0 ? v.ws_cap : envCap >= 0 ? envCap : WS_DEFAULT_CAP, cap_source = v.ws_cap >= 0 ? "panel" : envCap >= 0 ? "env" : "default";
  const tool_secret = E.TOOL_SECRET ? String(E.TOOL_SECRET) : v.tool_secret || "", tool_source = E.TOOL_SECRET ? "env" : v.tool_secret ? "panel" : "none";
  const reason = !tool_secret ? (v.tool_state === "unreadable" ? "tool_secret_unreadable" : "no_tool_secret") : !key ? (v.ws_state === "unreadable" ? "key_unreadable" : "no_key")
    : !hit[0] ? "no_provider" : cap <= 0 ? "cap_zero" : "";
  return { key, key_source, provider: hit[0], provider_source: hit[1], cap, cap_source, tool_secret, tool_source, ready: !reason, reason };
}

