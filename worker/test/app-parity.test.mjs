// node --test for the app parity plan's server rules (2026-11-20): the platform's own apps «صنع في مصر» (app/, user agent
// «… MIGApp/1.0 (ios|android)») behave EXACTLY like the website until the owner flips a switch in «🛠️ المطوّر» → «المزايا»:
//   app_buy_ios / app_buy_android (default ON)  → OFF: POST /api/pay/checkout and POST /api/me/invoices from THAT app → 403 app_buy_off;
//                                                 a live call from that app gets the fixed «no prices» line in the persona's prompt
//   call_consent_app / call_consent_web (OFF)   → ON: POST /api/janna/session without consent: true → 400 consent_required
//   a membership application without a plan (the app's register form while buying is off) → no payment promise in its answer
// Everything through the real index.js on the real schema (helpers.mjs D1); no network (fetch is mocked, any other URL fails).
// Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { D1 } from "./helpers.mjs";
import { issueSession } from "../src/auth.js";
import { storeJson, forgetFeatures, FEATURES, featureDef } from "../src/flags.js";
import { appOf, appOfUa } from "../src/app-ua.js";
import { ANAM_TOKEN_URL, ANAM_PERSONA_URL, APP_NO_PRICES, PERSONAS } from "../src/janna-session.js";

const SITE = "https://madeinegyptgate.com";
const UA_WEB = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const UA_AND = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 MIGApp/1.0 (android)";
const UA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MIGApp/1.0 (ios)";
const KEY = "anam-test-key-7c1e9d0b42"; // fake
const JANNA_AR = PERSONAS.janna.ar;
let calls, realFetch, persona;
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
/* the saved persona as GET /v1/personas/{id} answers it (short test values) */
const savedPersona = id => ({ id, name: "جنة", avatar: { id: "78696fe3-047a-4aca-95cf-04d5bedef9e1" }, avatarModel: "cara-4-latest", voice: { id: "abe9e502-2b89-4ce0-9166-86f61ad7a765" }, voiceSpeed: null,
  llmId: "058aba1a-b097-4beb-abc8-51c74835f5e8", brain: { systemPrompt: "اسمك «جنة».\nالباقات: الأساسية 10,000 جنيه.\n" }, languageCode: "ar", enableAudioPassthrough: false, initialMessage: "أهلاً بيك! أنا جنة.",
  zeroDataRetention: false, maxSessionLengthSeconds: null, directorNotes: null, voiceDetectionOptions: null, toolIds: [] });
beforeEach(() => {
  realFetch = globalThis.fetch; calls = []; persona = null;
  globalThis.fetch = async (input, init = {}) => {
    const u = String(input && input.url ? input.url : input), m = init.method || "GET";
    calls.push({ url: u, method: m, body: init.body ? JSON.parse(init.body) : null });
    if (u === ANAM_TOKEN_URL) return J({ sessionToken: "tok-" + calls.length });
    if (u.startsWith(ANAM_PERSONA_URL)) return persona ? J(persona(u.slice(ANAM_PERSONA_URL.length))) : J({}, 404);
    if (u.startsWith("https://api.resend.com/")) return J({ id: "re_" + calls.length });
    throw new Error("unexpected fetch " + m + " " + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const env0 = extra => ({ DB: new D1(), ADVISOR_SECRET: "adv-secret-for-tests", CONFIG_SECRET: "test-config-secret-0123456789abcdef-xyz", ANAM_API_KEY: KEY, RESEND_API_KEY: "re_test",
  MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", ADMIN_EMAILS: "owner@mig.test", ...(extra || {}) });
async function setF(env, values) {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(storeJson(values, {}), t).run();
  forgetFeatures(env);
}
async function member(env, id, email, plan = "visitor") {
  const t = new Date().toISOString();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at, name) VALUES (?, 'Co', ?, ?, 1, ?, ?, ?, 'Ahmed')").bind(id, email, plan, t, t, t).run();
  const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return { m, token: (await issueSession(env, m)).token };
}
async function api(env, method, path, { ua = UA_WEB, body, token, origin = SITE } = {}) {
  const h = { "CF-Connecting-IP": "203.0.113.9", "User-Agent": ua };
  if (origin) h.Origin = origin;
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = "Bearer " + token;
  const res = await worker.fetch(new Request(SITE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { data = null; }
  return { status: res.status, data, text };
}

describe("the app's user agent (app-ua.js)", () => {
  test("«MIGApp/<v> (ios|android)» → the platform; a browser → nothing; the mark without its platform → the system's own words", () => {
    assert.equal(appOfUa(UA_IOS), "ios"); assert.equal(appOfUa(UA_AND), "android"); assert.equal(appOfUa(UA_WEB), "");
    assert.equal(appOfUa("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) MIGApp/2.3"), "ios");
    assert.equal(appOfUa("Mozilla/5.0 (Linux; Android 11) MIGApp/1.0"), "android");
    assert.equal(appOfUa("MIGApplication/1.0 (ios)"), "", "a word that only starts like it is no mark");
    assert.equal(appOf(new Request(SITE, { headers: { "User-Agent": UA_IOS } })), "ios");
  });
});

describe("the switches: registry, defaults, public view", () => {
  test("every app switch is registered with the default that keeps the apps exactly like the website", () => {
    const want = { app_buy_ios: [true, "both"], app_buy_android: [true, "both"], account_delete: [false, "both"], visitor_erase_request: [false, "both"],
      store_review_signin: [false, "server"], call_consent_app: [false, "both"], call_consent_web: [false, "both"], app_janna_autovoice: [false, "client"] };
    for (const [k, [def, scope]] of Object.entries(want)) {
      const d = featureDef(k); assert.ok(d, k);
      assert.deepEqual([d.default, d.scope], [def, scope], k);
      assert.ok(d.label_ar && d.label_en && d.desc_ar && d.desc_en && d.enforced_by.length, k);
    }
    // data/flags.js knows the same defaults (an unknown key would read as ON in the browser until the API answers)
    const src = readFileSync(new URL("../../data/flags.js", import.meta.url), "utf8");
    for (const k of Object.keys(want)) assert.match(src, new RegExp(k + ": " + want[k][0]), "data/flags.js DEF " + k);
  });
  test("GET /api/settings: the client / both app rows with their effective values; the deletion rows stay off while locked", async () => {
    const env = env0();
    let r = await api(env, "GET", "/api/settings");
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.features.app_buy_ios, r.data.features.app_buy_android, r.data.features.call_consent_app, r.data.features.call_consent_web, r.data.features.app_janna_autovoice, r.data.features.account_delete],
      [true, true, false, false, false, false]);
    assert.ok(!("store_review_signin" in r.data.features), "a server row never reaches the site");
    await setF(env, { app_buy_ios: false, account_delete: true });
    r = await api(env, "GET", "/api/settings");
    assert.deepEqual([r.data.features.app_buy_ios, r.data.features.app_buy_android, r.data.features.account_delete], [false, true, true], "0010 is in schema.sql: unlocked here");
    env.DB.db.exec("DROP TABLE cc_delete_requests"); forgetFeatures(env);
    const e2 = env0(); await setF(e2, { account_delete: true }); e2.DB.db.exec("DROP TABLE cc_delete_requests"); forgetFeatures(e2);
    r = await api(e2, "GET", "/api/settings");
    assert.equal(r.data.features.account_delete, false, "no table (0010 not applied) → effective off");
  });
});

describe("app_buy_<platform> off: no buying from THAT app (403 app_buy_off), the website and the other app as before", () => {
  test("POST /api/pay/checkout", async () => {
    const env = env0();
    const tok = "x".repeat(24);
    // ON (the default): every user agent reaches the normal checks (here: an unknown pay token → 404)
    for (const ua of [UA_WEB, UA_IOS, UA_AND]) assert.equal((await api(env, "POST", "/api/pay/checkout", { ua, body: { t: tok } })).status, 404, ua);
    await setF(env, { app_buy_ios: false });
    let r = await api(env, "POST", "/api/pay/checkout", { ua: UA_IOS, body: { t: tok } });
    assert.deepEqual([r.status, r.data.code], [403, "app_buy_off"]);
    assert.match(r.data.error, /الدفع مش متاح جوه التطبيق/);
    assert.equal((await api(env, "POST", "/api/pay/checkout", { ua: UA_AND, body: { t: tok } })).status, 404, "the Android app: unchanged");
    assert.equal((await api(env, "POST", "/api/pay/checkout", { ua: UA_WEB, body: { t: tok } })).status, 404, "a browser: unchanged");
    await setF(env, { app_buy_ios: false, app_buy_android: false });
    assert.equal((await api(env, "POST", "/api/pay/checkout", { ua: UA_AND, body: { t: tok } })).data.code, "app_buy_off");
  });
  test("POST /api/me/invoices (a renewal / upgrade from the dashboard); reading the invoices stays", async () => {
    const env = env0(), m = await member(env, "u-pay1", "pay1@mig.test", "basic");
    const before = await api(env, "POST", "/api/me/invoices", { ua: UA_AND, token: m.token, body: { plan: "basic" } });
    assert.notEqual(before.data && before.data.code, "app_buy_off");
    await setF(env, { app_buy_android: false });
    const r = await api(env, "POST", "/api/me/invoices", { ua: UA_AND, token: m.token, body: { plan: "premium" } });
    assert.deepEqual([r.status, r.data.code], [403, "app_buy_off"]);
    assert.equal((await api(env, "GET", "/api/me/invoices", { ua: UA_AND, token: m.token })).status, 200, "the list of his invoices stays");
    const w = await api(env, "POST", "/api/me/invoices", { ua: UA_WEB, token: m.token, body: { plan: "premium" } });
    assert.notEqual(w.data && w.data.code, "app_buy_off", "the website: unchanged");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cc_invoices WHERE member_id = ? AND status = 'open'").bind("u-pay1").first("n");
    assert.ok(n <= 1, "the refused request issued nothing");
  });
});

describe("the AI-call consent (call_consent_app / call_consent_web)", () => {
  const sess = (env, ua, body) => api(env, "POST", "/api/janna/session", { ua, body: { agent: "janna", lang: "ar", ff: 1, ...body } });
  test("off (the default): every call as before; on: the app's calls need consent: true, the website's only with its own switch", async () => {
    const env = env0();
    assert.equal((await sess(env, UA_IOS, {})).status, 200);
    await setF(env, { call_consent_app: true });
    const before = calls.filter(c => c.url === ANAM_TOKEN_URL).length;
    let r = await sess(env, UA_IOS, { cs: 1 });
    assert.deepEqual([r.status, r.data.code, r.data.error, r.data.feature], [400, "consent_required", "consent_required", "call_consent_app"]);
    assert.equal(calls.filter(c => c.url === ANAM_TOKEN_URL).length, before, "no Anam token before the consent");
    assert.equal((await sess(env, UA_AND, { cs: 1 })).status, 400);
    assert.equal((await sess(env, UA_IOS, { cs: 1, consent: true })).status, 200);
    assert.equal((await sess(env, UA_WEB, { cs: 1 })).status, 200, "the website keeps its own switch (off)");
    await setF(env, { call_consent_web: true });
    assert.equal((await sess(env, UA_WEB, { cs: 1 })).data.code, "consent_required");
    assert.equal((await sess(env, UA_WEB, { cs: 1, consent: true })).status, 200);
    assert.equal((await sess(env, UA_IOS, { cs: 1 })).status, 200, "the app keeps ITS switch (now off)");
  });
  test("a page from before the card (no cs) gets a refusal it shows, never «use Anam's widget»: feature_off with ff, daily_cap without", async () => {
    const env = env0(); await setF(env, { call_consent_web: true });
    let r = await sess(env, UA_WEB, {});
    assert.deepEqual([r.status, r.data.error, r.data.code], [400, "consent_required", "feature_off"]);
    r = await api(env, "POST", "/api/janna/session", { body: { agent: "janna", lang: "ar" } });
    assert.deepEqual([r.data.error, r.data.code], ["consent_required", "daily_cap"]);
  });
});

describe("app_buy_<platform> off: the call from THAT app gets the fixed «no prices» rule", () => {
  test("Janna from the iPhone app: her saved persona + APP_NO_PRICES; the website and the Android app: today's request", async () => {
    const env = env0({ JANNA_VISITOR_CONTEXT: "0" });
    persona = id => savedPersona(id);
    await setF(env, { app_buy_ios: false });
    let r = await api(env, "POST", "/api/janna/session", { ua: UA_IOS, body: { agent: "janna", lang: "ar", ff: 1, cs: 1 } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.app_rules, true); assert.ok(!r.data.visitor_context, "only the app's rule: no visitor context claimed");
    const post = calls.filter(c => c.url === ANAM_TOKEN_URL).pop();
    const pc = post.body.personaConfig;
    assert.ok(pc.systemPrompt.endsWith(APP_NO_PRICES.janna), "the rule closes the saved prompt");
    assert.match(pc.systemPrompt, /^اسمك «جنة»/);
    assert.equal(pc.initialMessage, "أهلاً بيك! أنا جنة.", "her own first sentence stays");
    calls.length = 0;
    for (const ua of [UA_WEB, UA_AND]) {
      r = await api(env, "POST", "/api/janna/session", { ua, body: { agent: "janna", lang: "ar", ff: 1, cs: 1 } });
      assert.equal(r.status, 200); assert.ok(!r.data.app_rules, ua);
      assert.deepEqual(calls.filter(c => c.url === ANAM_TOKEN_URL).pop().body.personaConfig, { personaId: JANNA_AR }, ua);
    }
    assert.ok(!calls.some(c => c.url.startsWith(ANAM_PERSONA_URL)), "no persona read for a plain request");
  });
  test("the rule is the platform's own fixed text (no page text), masculine for Bassem", () => {
    assert.match(APP_NO_PRICES.janna, /ماتذكريش أي أسعار/); assert.match(APP_NO_PRICES.bassem, /ماتذكرش أي أسعار/);
    for (const k of ["janna", "bassem"]) assert.match(APP_NO_PRICES[k], /مش متاحة جوه التطبيق/);
  });
});

describe("a membership application without a plan (the app's form while buying is off there)", () => {
  test("no invoice and no payment promise in its answer; with a plan: today's answer", async () => {
    const env = env0();
    const send = (plan, email) => api(env, "POST", "/api/inquiries", { ua: UA_IOS, body: { kind: "signup", target_type: "plan", target_id: plan, target_name: "", name: "Ahmed Ali", company: "Test Factory", email, phone: "+201001234567", message: "pipes", payload: { plan, company: "Test Factory" } } });
    const r = await send("", "noplan@mig.test");
    assert.ok(r.status === 201 || r.status === 200, r.text);
    const inq = await env.DB.prepare("SELECT id FROM inquiries WHERE ref = ?").bind(r.data.ref).first();
    const ev = await env.DB.prepare("SELECT body, meta_json FROM inquiry_events WHERE inquiry_id = ? AND buyer_visible = 1 AND type = 'status' ORDER BY id DESC LIMIT 1").bind(inq.id).first();
    assert.match(ev.body, /فريق المنصة هيتابع معاك الباقة المناسبة/);
    assert.ok(!/الدفع|رابط/.test(ev.body), "no payment words: " + ev.body);
    assert.ok(!/payment/i.test(JSON.parse(ev.meta_json).en || ""));
    const r2 = await send("basic", "plan@mig.test");
    const inq2 = await env.DB.prepare("SELECT id FROM inquiries WHERE ref = ?").bind(r2.data.ref).first();
    const ev2 = await env.DB.prepare("SELECT body FROM inquiry_events WHERE inquiry_id = ? AND buyer_visible = 1 AND type = 'status' ORDER BY id DESC LIMIT 1").bind(inq2.id).first();
    assert.match(ev2.body, /الدفع الإلكتروني الآمن/);
  });
});
