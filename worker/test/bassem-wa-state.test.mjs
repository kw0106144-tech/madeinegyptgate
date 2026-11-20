// node --test for the WhatsApp line (owner 2026-11-20: in a call Bassem promised the owner a morning report «على الواتساب» while the
// platform's real WhatsApp sending was still off): Bassem's member block carries ONE line that says whether WhatsApp is on or off for this
// member (whatsapp.js waMemberState → bassem-context.js WA_LINE), read from the memo ccBoot already loaded for the request — no extra D1
// read, so the call does not start later; the morning e-mail no longer says «لحد ما الواتساب يشتغل»; «ملخص العميل» (daily.js) never stores
// a channel. Nothing leaves the test: Anam, Resend and respond.io are mocked. Run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { ANAM_TOKEN_URL, ANAM_PERSONA_URL, bassemContext } from "../src/janna-session.js";
import { memberContext, WA_LINE, waLineAr } from "../src/bassem-context.js";
import { waMemberState, waLive, bassemCron, MORNING_WHY } from "../src/whatsapp.js";
import { loadFeatures } from "../src/flags.js";
import { refreshBrief } from "../src/daily.js";
import { issueSession } from "../src/auth.js";
import { cairoToUtc } from "../src/meetings.js";
import { cairoDay, addDays } from "../src/common.js";
import { D1, waSwitchOn } from "./helpers.mjs";

const SITE = "https://madeinegyptgate.com";
const KEY = "anam-test-key-wa-line-7f3a";        // fake: never a real key
const RIO = "rio-test-token-wa-line";            // fake respond.io token
const BASSEM = "19ef9078-5252-42a4-bbdf-9a3c4a38a4be";
const NOW = new Date().toISOString();
const OWNER_SENTENCE = "- إرسال الواتساب من المنصة لسه مش شغّال: الرسايل والتقارير بتوصله على الإيميل بس، فماتوعدوش بالواتساب.";
const T1 = "069b8454-72b5-422d-9c30-06a815cee87f";
const persona = () => ({ id: BASSEM, name: "باسم · Bassem", avatar: { id: "78696fe3-047a-4aca-95cf-04d5bedef9e1" }, avatarModel: "cara-4-latest", voice: { id: "abe9e502-2b89-4ce0-9166-86f61ad7a765" },
  voiceSpeed: null, llmId: "058aba1a-b097-4beb-abc8-51c74835f5e8", brain: { systemPrompt: "اسمك «باسم».\n" }, languageCode: "ar", enableAudioPassthrough: false, skipGreeting: false,
  uninterruptibleGreeting: false, initialMessage: "أهلاً بيك يا فندم", zeroDataRetention: false, maxSessionLengthSeconds: null, directorNotes: { presetStyle: "warm" },
  voiceDetectionOptions: { sttProvider: "anam", endOfSpeechSensitivity: 0.45 }, toolIds: [T1], tools: [{ type: "client", name: "janna_follow", _toolId: T1 }] });

let calls, sent, wa, realFetch, respondStatus;
const okJson = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  realFetch = globalThis.fetch; calls = []; sent = []; wa = []; respondStatus = 200;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method, body });
    if (u.startsWith(ANAM_PERSONA_URL) && method === "GET") return okJson(persona());
    if (u === ANAM_TOKEN_URL && method === "POST") return okJson({ sessionToken: "tok-" + calls.length });
    if (u.startsWith("https://api.resend.com/")) { sent.push({ to: body.to[0], subject: body.subject, text: body.text, html: body.html }); return okJson({ id: "re_" + sent.length }); }
    if (u.startsWith("https://api.respond.io/")) { wa.push({ url: u, body }); return okJson(respondStatus === 200 ? { messageId: 5000 + wa.length } : { message: "template not approved" }, respondStatus); }
    throw new Error("unexpected fetch " + method + " " + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const env0 = extra => ({ DB: new D1(), ANAM_API_KEY: KEY, ADVISOR_SECRET: "adv-secret-wa-line-tests", RESEND_API_KEY: "re_test", MAIL_FROM: "منصة صنع في مصر <noreply@madeinegyptgate.com>", ...(extra || {}) });
const DR = { id: "m-wa-line-dr", email: "dr.wa@co.test", plan: "partner", name: "محمد الحسيني", title: "دكتور", company: "مجموعة الحسيني", sector: "الصناعات الهندسية (Engineering industries)", phone: "01001112223", prefs: {} };
async function member(env, f) {
  const m = { ...DR, ...f };
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, role, plan_expires, email_verified_at, name, title, phone, sector, prefs_json) VALUES (?, ?, ?, ?, 1, ?, ?, 'user', '', ?, ?, ?, ?, ?, ?)")
    .bind(m.id, m.company, m.email, m.plan, NOW, NOW, NOW, m.name, m.title, m.phone, m.sector, JSON.stringify(m.prefs)).run();
  const row = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(m.id).first();
  return { row, token: (await issueSession(env, row, { scope: "full" })).token };
}
/* «🛠️ المطوّر» → المزايا: the stored switches, then this isolate's memo reloaded (in production ccBoot does that at every request) */
async function features(env, values) {
  await env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_at) VALUES ('features', 'system', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(JSON.stringify({ values }), NOW).run();
  await loadFeatures(env, { fresh: true });
}
let ipN = 1;
async function session(env, token) {
  const h = { "CF-Connecting-IP": "203.0.113." + (ipN++ % 250), Origin: SITE, "Content-Type": "application/json", Authorization: "Bearer " + token };
  const res = await worker.fetch(new Request(SITE + "/api/janna/session", { method: "POST", headers: h, body: JSON.stringify({ agent: "bassem", lang: "ar" }) }), env, { waitUntil() {} });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch (e) { /* empty */ }
  const tok = calls.filter(c => c.url === ANAM_TOKEN_URL);
  return { status: res.status, data, text, prompt: tok.length ? String((tok[0].body.personaConfig || {}).systemPrompt || "") : "" };
}
const waLines = s => Object.values(WA_LINE).filter(l => s.includes(l));
/* every D1 statement prepared while f() runs */
async function prepared(env, f) {
  const prep = env.DB.prepare.bind(env.DB), seen = [];
  env.DB.prepare = sql => { seen.push(sql); return prep(sql); };
  try { return { out: await f(), seen }; } finally { env.DB.prepare = prep; }
}

describe("whatsapp.js waMemberState: the rules of the sends, from this request's memo (no read)", () => {
  test("off unless ALL of: a token, not WA_DRY_RUN, the panel switch after a passed test, «🛠️ المطوّر» whatsapp_send on — exactly waLive", async () => {
    const m = { ...DR, prefs_json: JSON.stringify({ wa_optin: true }) };
    const noToken = env0();
    assert.deepEqual([waLive(noToken), waMemberState(noToken, m)], [false, "off"], "no token (today on the live site: the switch is off)");
    const switchOff = env0({ RESPONDIO_TOKEN: RIO });
    assert.deepEqual([waLive(switchOff), waMemberState(switchOff, m)], [false, "off"], "a token, but «تشغيل إرسال واتساب الحقيقي» never switched on");
    await waSwitchOn(switchOff, false);
    assert.equal(waMemberState(switchOff, m), "off", "the switch stored as off");
    const live = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    assert.deepEqual([waLive(live), waMemberState(live, m)], [true, "live"]);
    const dry = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO, WA_DRY_RUN: "1" }));
    assert.deepEqual([waLive(dry), waMemberState(dry, m)], [false, "off"], "the env kill switch wins over the panel");
    const feat = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    await features(feat, { whatsapp_send: false });
    assert.deepEqual([waLive(feat), waMemberState(feat, m)], [false, "off"], "«🛠️ المطوّر» whatsapp_send off");
  });
  test("live for the platform: live only with his opt-in AND a usable mobile (what sendToMember needs); paused wins over everything", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    const st = (prefs, extra) => waMemberState(env, { ...DR, ...(extra || {}), prefs_json: JSON.stringify(prefs) });
    assert.equal(st({ wa_optin: true }), "live");
    assert.equal(st({}), "member", "no WhatsApp opt-in");
    assert.equal(st({ wa_optin: true }, { phone: "" }), "member", "no mobile");
    assert.equal(st({ wa_optin: true }, { phone: "12345" }), "member", "a number WhatsApp cannot use");
    assert.equal(st({ wa_optin: true, pause: true }), "paused");
    assert.equal(waMemberState(env0(), { ...DR, prefs_json: JSON.stringify({ wa_optin: true, pause: true }) }), "paused", "paused while the platform is off too");
    assert.equal(waMemberState(env0(), null), "off");
    assert.equal(waMemberState(env, { ...DR, prefs_json: "not json" }), "member", "unreadable prefs = no opt-in");
  });
  test("sync: a plain string, and not one D1 statement prepared (the call does not start later)", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    const { out, seen } = await prepared(env, () => { const v = waMemberState(env, { ...DR, prefs_json: JSON.stringify({ wa_optin: true }) }); assert.equal(typeof v, "string", "not a Promise"); return v; });
    assert.deepEqual([out, seen.length], ["live", 0]);
  });
});

describe("bassem-context.js: ONE WhatsApp line in every member block", () => {
  test("not given / unknown → the owner's own sentence (off); each state its own line; exactly one line, before the greeting lines", () => {
    const m = { ...DR, prefs_json: "{}" };
    assert.equal(WA_LINE.off, OWNER_SENTENCE);
    for (const [o, want] of [[{}, "off"], [{ wa: "off" }, "off"], [{ wa: "bogus" }, "off"], [{ wa: "LIVE" }, "off"], [{ wa: "live" }, "live"], [{ wa: "member" }, "member"], [{ wa: "paused" }, "paused"]]) {
      const c = memberContext(m, "ar", o), got = waLines(c.block);
      assert.deepEqual(got, [WA_LINE[want]], JSON.stringify(o));
      const L = c.block.split("\n");
      assert.ok(L.indexOf(WA_LINE[want]) > 0 && L.indexOf(WA_LINE[want]) < L.findIndex(l => l.startsWith("- إنت فتحت المكالمة")), "before the greeting lines");
    }
    assert.equal(waLineAr(undefined), OWNER_SENTENCE);
    assert.deepEqual(waLines(memberContext({ ...m, name: "", title: "" }, "ar", { anonymous: true, wa: "off" }).block), [OWNER_SENTENCE], "a member without a name too");
    assert.deepEqual(waLines(memberContext(m, "en", { wa: "member" }).block), [WA_LINE.member], "the English page: the same Arabic line");
    assert.deepEqual(waLines(memberContext(m, "ar", { continued: true, wa: "paused" }).block), [WA_LINE.paused], "a continuation part of the call too");
  });
  test("only the live line lets him promise WhatsApp; every line is plain text (no «» — the saved prompt speaks what is in «»), no number, no link", () => {
    for (const k of ["off", "member", "paused"]) assert.ok(WA_LINE[k].includes("ماتوعدوش بالواتساب") && WA_LINE[k].includes("على الإيميل بس"), k);
    assert.ok(!WA_LINE.live.includes("ماتوعدوش") && WA_LINE.live.includes("بس لما نتيجة الأداة تقول كده"));
    assert.ok(WA_LINE.paused.includes("مفيش رسالة صبح") && WA_LINE.paused.includes("ماتوعدوش بالواتساب ولا برسالة الصبح"));
    assert.ok(!/لحد ما الواتساب|لما الواتساب يشتغل|هيشتغل|قريب/.test(Object.values(WA_LINE).join(" ")), "no date and no promise of when WhatsApp starts");
    for (const l of Object.values(WA_LINE)) {
      assert.ok(l.startsWith("- ") && !/[«»"'<>{}()\[\]]/.test(l) && !/\d/.test(l) && !/https?:|www\.|@/.test(l), l);
      assert.ok(l.length < 300, l.length + ": " + l);
    }
  });
});

describe("the live call: the WhatsApp line reaches Bassem's prompt from the request's memo", () => {
  test("WhatsApp off (as on the live site today): an opted-in member's enriched prompt says so in the owner's words — never the live line", async () => {
    const env = env0({ RESPONDIO_TOKEN: RIO }); // a token, the switch never turned on
    const { token } = await member(env, { prefs: { wa_optin: true, session_time: "10:00" } });
    const r = await session(env, token);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.member_context, true);
    assert.deepEqual(waLines(r.prompt), [OWNER_SENTENCE], r.prompt);
    assert.equal(wa.length, 0, "nothing was sent to respond.io");
  });
  test("WhatsApp live: opted in with a mobile → the live line; not opted in → the member line; paused → the paused line", async () => {
    for (const [prefs, want] of [[{ wa_optin: true }, "live"], [{}, "member"], [{ wa_optin: true, pause: true }, "paused"]]) {
      calls = [];
      const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
      const { token } = await member(env, { prefs });
      const r = await session(env, token);
      assert.equal(r.status, 200, r.text);
      assert.deepEqual(waLines(r.prompt), [WA_LINE[want]], want + " ← " + r.prompt);
    }
  });
  test("bassemContext reads no switch and no WhatsApp table: the same D1 reads as before the line (continuation, profile, memory)", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    const { row } = await member(env, { prefs: { wa_optin: true } });
    const { out, seen } = await prepared(env, () => bassemContext(env, row, "ar", {}));
    assert.deepEqual(waLines(out.block), [WA_LINE.live]);
    assert.ok(seen.length > 0 && !seen.some(s => /cc_settings|wa_messages|cc_secrets/.test(s)), seen.join("\n"));
  });
});

describe("the morning message (whatsapp.js bassemCron → morningEmail): no WhatsApp promise the platform cannot keep", () => {
  const at = (d, hm) => cairoToUtc(d, hm), count = n => async () => ({ count: n, top: n ? "مناقصة محولات كهرباء" : "" });
  const mailTo = email => sent.filter(s => s.to === email);
  test("WhatsApp off: the e-mail says plainly that WhatsApp is not live and Bassem's messages come by e-mail only — never «لحد ما الواتساب يشتغل»", async () => {
    const env = env0();
    await member(env, { prefs: { wa_optin: true, morning_time: "09:00" } });
    const r = await bassemCron(env, at("2026-11-20", "09:05"), count(2));
    assert.deepEqual([r.morning, r.email_morning, r.failed], [0, 1, 0], JSON.stringify(r));
    const [m] = mailTo(DR.email);
    assert.ok(m.text.includes(MORNING_WHY.off), m.text);
    assert.ok(!/لحد ما الواتساب|until WhatsApp/i.test(m.text), "the old «until WhatsApp works» line is gone");
    assert.ok(MORNING_WHY.off.includes("على الإيميل بس") && MORNING_WHY.off.includes("e-mail only"), "Arabic first, with its English twin");
    assert.equal(wa.length, 0);
  });
  test("WhatsApp live but this member is not on it, or today's WhatsApp did not go out: the e-mail does not mention WhatsApp at all", async () => {
    for (const [prefs, status] of [[{ morning_time: "09:00" }, 200], [{ wa_optin: true, morning_time: "09:00" }, 400]]) {
      sent = []; wa = []; respondStatus = status;
      const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
      await member(env, { prefs });
      const r = await bassemCron(env, at("2026-11-20", "09:05"), count(1));
      assert.deepEqual([r.morning, r.email_morning], [0, 1], JSON.stringify(r));
      const [m] = mailTo(DR.email);
      assert.ok(m.text.includes(MORNING_WHY.live), m.text);
      assert.ok(!/واتساب|whatsapp/i.test(m.text + m.html), "no WhatsApp in the e-mail ← " + m.text);
    }
  });
  test("WhatsApp live and he is on it: the WhatsApp message goes, and no e-mail repeats it", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    await member(env, { prefs: { wa_optin: true, morning_time: "09:00" } });
    const r = await bassemCron(env, at("2026-11-20", "09:05"), count(1));
    assert.deepEqual([r.morning, r.email_morning], [1, 0], JSON.stringify(r));
    assert.equal(wa[0].body.message.template.name, "bassem_morning");
    assert.equal(mailTo(DR.email).length, 0);
  });
});

describe("daily.js «ملخص العميل»: the morning message's time, never its channel", () => {
  test("a member on WhatsApp while it is live: the brief says «رسالة الصبح 08:30» and names no channel (a stored one would outlive the switch)", async () => {
    const env = await waSwitchOn(env0({ RESPONDIO_TOKEN: RIO }));
    await member(env, { prefs: { wa_optin: true, morning_time: "08:30", session_time: "10:00" } });
    const D = addDays(cairoDay(), -1), b = await refreshBrief(env, DR.id, "bassem", D);
    assert.ok(b, "a brief");
    assert.equal(b.text.split("\n").find(l => l.startsWith("- تفضيلات")), "- تفضيلات: ميعاد الشغل اليومي 10:00، رسالة الصبح 08:30", b.text);
    assert.ok(!/واتساب|whatsapp/i.test(b.text), b.text);
  });
});
