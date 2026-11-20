// node --test for Janna-hosted meetings (worker/src/meetings.js) — run: cd worker && npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleMeetings, icsText, buildIcs, cairoToUtc, cairoLocal, recordingLink, verifyRecordingSig, summarize, meetingsCron, dueReminders, processMeeting, waNumber } from "../src/meetings.js";
import worker from "../src/index.js";
import { D1, waSwitchOn } from "./helpers.mjs";

const SECRET = "meet-secret-1";
const SID = "3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const JANNA_AR = "5f06d835-22cc-4460-b412-84cefa9e565b";
const BASE = "https://madeinegyptgate.com/api/meetings";

/* ---- fakes: fetch router (Resend / Anam / WhatsApp / recording CDN), R2 bucket, ctx ---- */
let calls, routes, realFetch;
beforeEach(() => {
  calls = []; routes = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method || "GET", headers: init.headers || {}, body });
    for (const [rx, fn] of routes) if (rx.test(url)) return fn(url, body, init);
    if (url === "https://api.resend.com/emails") return Response.json({ id: "re_" + calls.length });
    return new Response("not mocked: " + url, { status: 599 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });
const resend = () => calls.filter(c => c.url === "https://api.resend.com/emails");
const att = (c, name) => { const a = (c.body.attachments || []).find(x => x.filename === name); return a ? Buffer.from(a.content, "base64").toString("utf8") : null; };

class R2 {
  constructor() { this.o = new Map(); }
  async put(key, body, opts = {}) {
    let bytes;
    if (typeof body === "string") bytes = new TextEncoder().encode(body);
    else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
    else bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.o.set(key, { bytes, httpMetadata: opts.httpMetadata || {} });
  }
  async get(key, opts) {
    const x = this.o.get(key); if (!x) return null;
    let bytes = x.bytes, range;
    if (opts && opts.range) { const m = /bytes=(\d+)-(\d*)/.exec(opts.range.get("Range") || ""); if (m) { const s = +m[1], e = m[2] ? +m[2] : bytes.length - 1; range = { offset: s, length: e - s + 1 }; bytes = bytes.slice(s, e + 1); } }
    return { size: x.bytes.length, range, httpMetadata: x.httpMetadata, body: new Response(bytes).body, text: async () => new TextDecoder().decode(bytes) };
  }
}
const env0 = extra => ({ DB: new D1(), MEETINGS_SECRET: SECRET, RESEND_API_KEY: "re_test", ...(extra || {}) });
function ctx() { const p = []; return { p, waitUntil(x) { p.push(x); }, done: () => Promise.all(p) }; }
async function call(env, path, { method = "GET", body, headers = {}, c } = {}) {
  const r = await handleMeetings(new Request(BASE + path, { method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), env, c || ctx());
  let data = null; try { data = await r.clone().json(); } catch (e) { /* not json */ }
  return { status: r.status, data, res: r };
}
/* a Cairo wall-clock date N days from now */
const cairoDate = days => cairoLocal(Date.now() + days * 86400000).date;
const VIS = { name: "Mona Adel", email: "mona@example.com", phone: "01012345678", company: "Nile Foods", activity: "Food processing — frozen vegetables", markets: ["الخليج", "أفريقيا"], language: "ar" };
function anamMocks({ persona = JANNA_AR, start = Date.now() - 5 * 60000, end = null, transcript = 200, recording = 200, video = "MP4DATA-0123456789" } = {}) {
  routes.push([new RegExp(`api\\.anam\\.ai/v1/sessions/${SID}$`), () => Response.json({ id: SID, personaId: persona, startTime: new Date(start).toISOString(), endTime: end == null ? null : new Date(end).toISOString() })]);
  routes.push([/api\.anam\.ai\/v1\/sessions\/[^/]+\/transcript/, () => transcript === 200 ? Response.json({ sessionId: SID, transcriptsEnabled: true, nextOffset: null, totalMessages: 4, messages: [
    { role: "persona", message: "أهلاً منى! أنا جنة من منصة صنع في مصر. احكيلي عن نشاطك.", timestamp: new Date(start).toISOString() },
    { role: "user", message: "إحنا مصنع خضار مجمد في العاشر من رمضان وعايزين نصدّر للخليج وأفريقيا", timestamp: new Date(start + 30000).toISOString() },
    { role: "persona", message: "[صاف] الأنسب ليكم باقة الشريك الأساسي، ومعاها مستشارك باسم سنة كاملة.", timestamp: new Date(start + 60000).toISOString() }, // a cue tag Anam did not take (2026-11-20)
    { role: "user", message: "طيب إزاي أسجّل؟", timestamp: new Date(start + 90000).toISOString() }] }) : new Response("", { status: transcript })]);
  routes.push([/api\.anam\.ai\/v1\/sessions\/[^/]+\/recording$/, () => recording === 200 ? Response.json({ recordingUrl: "https://cdn.anam.test/rec/abc.mp4?sig=x" }) : new Response("", { status: recording })]);
  routes.push([/cdn\.anam\.test/, () => new Response(video, { headers: { "Content-Type": "video/mp4", "Content-Length": String(video.length) } })]);
}

describe("time + calendar", () => {
  test("Cairo wall clock → UTC across winter (+02) and summer time (+03)", () => {
    assert.equal(new Date(cairoToUtc("2026-12-01", "14:00")).toISOString(), "2026-12-01T12:00:00.000Z");
    assert.equal(new Date(cairoToUtc("2027-07-01", "14:00")).toISOString(), "2027-07-01T11:00:00.000Z");
    assert.equal(cairoToUtc("2026-13-01", "14:00"), null);
    assert.equal(cairoToUtc("2026-12-01", "25:00"), null);
    assert.equal(cairoLocal(Date.parse("2026-12-01T12:30:00Z")).time, "14:30");
  });
  test("ics: VTIMEZONE Africa/Cairo, 30-minute event, organizer Janna, escaped + folded lines, no visitor topic", () => {
    const m = { id: "a".repeat(20), name: "Mona, Adel", email: "mona@example.com", language: "ar", starts_at: "2026-12-01T12:00:00.000Z", duration_min: 30, topic: "تصدير; خضار, مجمدة" };
    const ics = buildIcs(m, {}, { attendee: true });
    assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
    assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:Africa\/Cairo/);
    assert.match(ics, /DTSTART;TZID=Africa\/Cairo:20261201T140000\r\n/);
    assert.match(ics, /DTEND;TZID=Africa\/Cairo:20261201T143000\r\n/);
    assert.match(ics, /ORGANIZER;CN=Janna:mailto:noreply@madeinegyptgate\.com/); // the platform's one sender (MAIL_FROM)
    assert.match(ics.replace(/\r\n /g, ""), /ATTENDEE;CN="Mona Adel";[^\r]*mailto:mona@example\.com/);
    assert.doesNotMatch(ics.replace(/\r\n /g, ""), /تصدير|خضار/); // the free-text topic never reaches the invitation
    assert.equal(icsText("تصدير; خضار, مجمدة\\n"), "تصدير\\; خضار\\, مجمدة\\\\n");
    assert.match(ics, /URL:https:\/\/madeinegyptgate\.com\/meeting\.html#a{20}/);
    for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, "line too long: " + l);
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.doesNotMatch(buildIcs(m, {}), /ATTENDEE/);
  });
  test("WhatsApp numbers: Egyptian mobiles become E.164 digits", () => {
    assert.equal(waNumber("0101 234 5678"), "201012345678");
    assert.equal(waNumber("+966 50 123 4567"), "966501234567");
    assert.equal(waNumber("002012345678901"), "2012345678901");
    assert.equal(waNumber("123"), "");
  });
});

describe("schedule", () => {
  test("health + config gates", async () => {
    let r = await call({}, "/health");
    assert.deepEqual([r.status, r.data.ok, r.data.store, r.data.session_cap_min], [200, false, "none", 10]);
    assert.equal((await call({}, "", { method: "POST", body: VIS })).status, 503);
    assert.equal((await call({ DB: new D1() }, "", { method: "POST", body: VIS })).data.error, "meetings not configured");
    r = await call(env0({ ANAM_API_KEY: "k", MEDIA: new R2() }), "/health");
    assert.deepEqual([r.data.ok, r.data.email, r.data.anam, r.data.media, r.data.whatsapp], [true, true, true, true, false]);
  });
  test("validation: name, email, date/time, future, within 60 days", async () => {
    const env = env0(), d = cairoDate(3);
    const bad = async (b, re) => { const r = await call(env, "", { method: "POST", body: b }); assert.equal(r.status, 400, JSON.stringify(b)); if (re) assert.match(r.data.error, re); };
    await bad({ ...VIS, name: "" }, /name/);
    await bad({ ...VIS, email: "not-an-email" }, /email/);
    await bad({ ...VIS, phone: "<script>" }, /phone/);
    await bad({ ...VIS, date: d }, /date and time/);
    await bad({ ...VIS, date: "2026/12/01", time: "14:00" }, /date and time/);
    await bad({ ...VIS, date: cairoDate(-1), time: "10:00" }, /future/);
    await bad({ ...VIS, date: cairoDate(70), time: "10:00" }, /60 days/);
    await bad({ ...VIS, starts_at: "2026-12-01T14:00:00" }, /date and time/); // no offset → ambiguous
    assert.equal((await call(env, "", { method: "POST", body: "[1]" })).status, 400);
    assert.equal(resend().length, 0);
  });
  test("booking → stored, confirmation email with meeting link + .ics, team notified, public view has no PII", async () => {
    const env = env0(), d = cairoDate(5);
    const r = await call(env, "", { method: "POST", body: { ...VIS, date: d, time: "11:30", topic: "التصدير للخليج" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.id, /^[a-f0-9]{20}$/);
    assert.equal(r.data.url, "https://madeinegyptgate.com/meeting.html#" + r.data.id);
    assert.deepEqual(r.data.local, { date: d, time: "11:30", stamp: d.replace(/-/g, "") + "T113000" });
    assert.equal(r.data.emailed, true);
    const [vis, tm] = resend();
    assert.deepEqual(vis.body.to, ["mona@example.com"]);
    assert.match(vis.body.from, /^جنة — منصة صنع في مصر <noreply@madeinegyptgate\.com>$/);
    assert.ok(vis.body.text.includes(r.data.url));
    assert.match(vis.body.text, /بتوقيت القاهرة/);
    const ics = att(vis, "meeting.ics");
    assert.match(ics, new RegExp(`DTSTART;TZID=Africa/Cairo:${d.replace(/-/g, "")}T113000`));
    assert.match(ics, /METHOD:REQUEST/);
    assert.deepEqual(tm.body.to, ["info@madeinegyptgate.com"]);
    assert.match(tm.body.text, /Nile Foods/);
    const pub = await call(env, "/" + r.data.id);
    assert.deepEqual(Object.keys(pub.data).sort(), ["duration_min", "first_name", "id", "kind", "language", "local", "starts_at", "status", "tz"]);
    assert.equal(pub.data.first_name, "Mona");
    assert.equal(pub.data.status, "scheduled");
    assert.ok(!JSON.stringify(pub.data).includes("mona@example.com"));
    const f = await call(env, "/" + r.data.id + "/ics");
    assert.equal(f.res.headers.get("Content-Type"), "text/calendar; charset=utf-8");
    assert.doesNotMatch(await f.res.text(), /mona@example\.com/);
    assert.equal((await call(env, "/" + "0".repeat(20))).status, 404);
    assert.equal((await call(env, "/not-an-id")).status, 404);
  });
  test("TEAM_EMAIL env + rate limits per email and per IP", async () => {
    const env = env0({ TEAM_EMAIL: "sales@madeinegyptgate.com" });
    for (let i = 0; i < 3; i++) assert.equal((await call(env, "", { method: "POST", body: { ...VIS, date: cairoDate(2 + i), time: "12:00" } })).status, 200);
    assert.equal(resend()[1].body.to[0], "sales@madeinegyptgate.com");
    assert.equal((await call(env, "", { method: "POST", body: { ...VIS, date: cairoDate(9), time: "12:00" } })).status, 429);
    for (let i = 0; i < 2; i++) assert.equal((await call(env, "", { method: "POST", body: { ...VIS, email: `x${i}@example.com`, date: cairoDate(3), time: "12:00" } })).status, 200);
    const r = await call(env, "", { method: "POST", body: { ...VIS, email: "y@example.com", date: cairoDate(3), time: "12:00" } });
    assert.equal(r.status, 429); // 5 per IP per day
    assert.equal((await call(env, "", { method: "POST", body: { ...VIS, email: "z@example.com", date: cairoDate(3), time: "12:00" }, headers: { "CF-Connecting-IP": "198.51.100.9" } })).status, 200);
  });
  test("without an email provider the booking still works (emailed:false)", async () => {
    const env = env0({ RESEND_API_KEY: "" });
    const r = await call(env, "", { method: "POST", body: { ...VIS, date: cairoDate(4), time: "09:00" } });
    assert.deepEqual([r.status, r.data.emailed], [200, false]);
  });
});

describe("start → finish → processing", () => {
  test("start requires consent=true", async () => {
    const env = env0();
    assert.equal((await call(env, "/start", { method: "POST", body: { ...VIS } })).data.error, "recording consent required");
    assert.equal((await call(env, "/start", { method: "POST", body: { ...VIS, consent: "true" } })).status, 400);
    assert.equal((await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, session_id: "nope" } })).status, 400);
  });
  test("full flow: transcript + recording → R2, summary email with signed link + transcript attachment", async () => {
    const media = new R2(), env = env0({ ANAM_API_KEY: "anam_k", MEDIA: media });
    anamMocks();
    const s = await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, session_id: SID, started_at: new Date(Date.now() - 4 * 60000).toISOString() } });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const id = s.data.id, c = ctx();
    const f = await call(env, `/${id}/finish`, { method: "POST", body: { session_id: SID, agenda_done: ["intro", "plan", "register", "<bad>"] }, c });
    assert.deepEqual([f.status, f.data.processing, f.data.recording], [200, true, true]);
    await c.done();
    const anamCalls = calls.filter(x => x.url.startsWith("https://api.anam.ai/"));
    assert.ok(anamCalls.every(x => x.headers.Authorization === "Bearer anam_k"));
    assert.ok(media.o.has(`meetings/${id}.mp4`));
    assert.equal(new TextDecoder().decode(media.o.get(`meetings/${id}.mp4`).bytes), "MP4DATA-0123456789");
    const sum = resend().find(x => x.body.to[0] === "mona@example.com");
    assert.match(sum.body.subject, /ملخص اجتماعك مع جنة وتسجيله/);
    const link = /https:\/\/madeinegyptgate\.com\/api\/meetings\/[a-f0-9]{20}\/recording\?exp=\d+&sig=[\w-]+/.exec(sum.body.text)[0];
    assert.match(sum.body.text, /باقة الشريك الأساسي/);
    assert.match(sum.body.text, /الخليج، أفريقيا/);
    assert.match(sum.body.text, /إزاي أسجّل/);
    assert.match(att(sum, "transcript.txt"), /Mona: إحنا مصنع خضار مجمد/);
    /* Janna's stray cue tag («[صاف]») is neither in the transcript she e-mails nor in the copy kept in R2 (worker/src/text.js stripCues) */
    assert.match(att(sum, "transcript.txt"), /Janna \/ جنة: الأنسب ليكم باقة الشريك الأساسي/);
    assert.doesNotMatch(att(sum, "transcript.txt") + new TextDecoder().decode(media.o.get(`meetings/${id}.transcript.json`).bytes), /صاف/);
    const tm = resend().find(x => x.body.to[0] === "info@madeinegyptgate.com");
    assert.ok(tm && !tm.body.text.includes("/recording?"), "team copy carries the summary, not the recording link");
    const row = await env.DB.prepare("SELECT * FROM meetings WHERE id = ?").bind(id).first();
    assert.deepEqual([row.status, row.proc_status, row.transcript, JSON.parse(row.agenda_done).join()], ["ended", "done", "", "intro,plan,register"]);
    // the signed link streams the recording; tampering / expiry is refused
    const u = new URL(link);
    let r = await handleMeetings(new Request(link), env, ctx());
    assert.equal(r.status, 200); assert.equal(await r.text(), "MP4DATA-0123456789");
    assert.match(r.headers.get("Content-Disposition"), /attachment/);
    r = await handleMeetings(new Request(link, { headers: { Range: "bytes=0-6" } }), env, ctx());
    assert.equal(r.status, 206); assert.equal(await r.text(), "MP4DATA"); assert.equal(r.headers.get("Content-Range"), "bytes 0-6/18");
    assert.equal((await handleMeetings(new Request(link.replace(/sig=(.)/, (x, c) => "sig=" + (c === "Z" ? "Y" : "Z"))), env, ctx())).status, 403);
    assert.equal((await handleMeetings(new Request(link.replace(/exp=\d+/, "exp=" + (+u.searchParams.get("exp") + 1))), env, ctx())).status, 403);
    assert.equal((await handleMeetings(new Request(`${BASE}/${id}/recording`), env, ctx())).status, 403);
    // finish is idempotent
    assert.equal((await call(env, `/${id}/finish`, { method: "POST", body: {} })).data.already, true);
  });
  test("recording link signature: valid for 30 days only", async () => {
    const env = { MEETINGS_SECRET: SECRET }, id = "b".repeat(20), now = Date.now();
    const u = new URL(await recordingLink(env, id, now)), exp = u.searchParams.get("exp"), sig = u.searchParams.get("sig");
    assert.equal(+exp - Math.floor(now / 1000), 30 * 86400);
    assert.equal(await verifyRecordingSig(env, id, exp, sig, now), true);
    assert.equal(await verifyRecordingSig(env, "c".repeat(20), exp, sig, now), false);
    assert.equal(await verifyRecordingSig({ MEETINGS_SECRET: "other" }, id, exp, sig, now), false);
    assert.equal(await verifyRecordingSig(env, id, exp, sig, now + 31 * 86400000), false);
  });
  test("recording not ready (404) → stays pending, the cron finishes it later", async () => {
    const media = new R2(), env = env0({ ANAM_API_KEY: "k", MEDIA: media });
    anamMocks({ recording: 404 });
    const id = (await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, session_id: SID } })).data.id, c = ctx();
    await call(env, `/${id}/finish`, { method: "POST", body: {}, c }); await c.done();
    let row = await env.DB.prepare("SELECT proc_status, proc_attempts, proc_error, transcript_key FROM meetings WHERE id = ?").bind(id).first();
    assert.deepEqual([row.proc_status, row.proc_attempts, row.proc_error], ["pending", 1, "recording not ready"]);
    assert.equal(row.transcript_key, `meetings/${id}.transcript.json`); // transcript kept for the retry
    assert.equal(resend().filter(x => x.body.to[0] === "mona@example.com").length, 0);
    routes.length = 0; anamMocks({ recording: 200 });
    const out = await meetingsCron(env, Date.now() + 10 * 60000);
    assert.equal(out.processed, 1);
    row = await env.DB.prepare("SELECT proc_status, recording_key FROM meetings WHERE id = ?").bind(id).first();
    assert.deepEqual([row.proc_status, row.recording_key], ["done", `meetings/${id}.mp4`]);
  });
  test("no recording consent → the recording is never fetched or emailed (scheduled meeting)", async () => {
    const media = new R2(), env = env0({ ANAM_API_KEY: "k", MEDIA: media });
    const ms = Date.now() + 12 * 60000, l = cairoLocal(ms);
    const id = (await call(env, "", { method: "POST", body: { ...VIS, date: l.date, time: l.time } })).data.id;
    anamMocks({ start: Date.now() });
    const j = await call(env, `/${id}/join`, { method: "POST", body: { session_id: SID } });
    assert.deepEqual([j.status, j.data.consent], [200, false]);
    const c = ctx(); await call(env, `/${id}/finish`, { method: "POST", body: { agenda_done: ["intro"] }, c }); await c.done();
    assert.equal(calls.filter(x => /\/recording$|cdn\.anam\.test/.test(x.url)).length, 0);
    assert.equal(media.o.has(`meetings/${id}.mp4`), false);
    const sum = resend().find(x => x.body.to[0] === "mona@example.com" && /ملخص/.test(x.body.subject));
    assert.doesNotMatch(sum.body.text, /\/recording\?/);
    assert.equal(att(sum, "transcript.txt"), null); // no consent → no transcript either
  });
  test("a session from another persona (or another time) is rejected — nothing is emailed", async () => {
    const env = env0({ ANAM_API_KEY: "k", MEDIA: new R2() });
    anamMocks({ persona: "19ef9078-5252-42a4-bbdf-9a3c4a38a4be" });
    const id = (await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, session_id: SID } })).data.id, c = ctx();
    await call(env, `/${id}/finish`, { method: "POST", body: {}, c }); await c.done();
    const row = await env.DB.prepare("SELECT proc_status FROM meetings WHERE id = ?").bind(id).first();
    assert.equal(row.proc_status, "rejected");
    assert.equal(calls.filter(x => /transcript|recording/.test(x.url)).length, 0);
    assert.equal(resend().length, 0);
  });
  test("join window: too early → 409, not found → 404", async () => {
    const env = env0();
    const id = (await call(env, "", { method: "POST", body: { ...VIS, date: cairoDate(3), time: "12:00" } })).data.id;
    assert.equal((await call(env, `/${id}/join`, { method: "POST", body: {} })).data.error, "too early");
    assert.equal((await call(env, `/${"f".repeat(20)}/join`, { method: "POST", body: {} })).status, 404);
    assert.equal((await call(env, `/${id}/finish`, { method: "POST", body: {} })).status, 409); // never started
  });
  test("extractive summary never invents: unknown fields say «لم يُذكر»", () => {
    const s = summarize({ name: "A B", agenda_done: "[]" }, []);
    assert.equal(s.plan, ""); assert.deepEqual(s.markets, []);
    assert.match(s.ar, /نشاطك: لم يُذكر/); assert.match(s.en, /Plan discussed: not mentioned/);
  });
});

describe("cron", () => {
  test("reminders 24 h and 1 h before (email + WhatsApp template), each sent once; missed meetings marked", async () => {
    const env = await waSwitchOn(env0({ WA_TOKEN: "wa_tok", WA_PHONE_ID: "1234567890" })); // any real WhatsApp obeys the Control Center switch
    routes.push([/graph\.facebook\.com/, () => Response.json({ messages: [{ id: "wamid.1" }] })]);
    const r = await call(env, "", { method: "POST", body: { ...VIS, date: cairoDate(3), time: "15:00" } });
    const st = Date.parse(r.data.starts_at), soon = await call(env, "", { method: "POST", body: { ...VIS, email: "late@example.com", ...(l => ({ date: l.date, time: l.time }))(cairoLocal(Date.now() + 40 * 60000)) } });
    assert.equal(soon.status, 200);
    let due = await dueReminders(env, st - 30 * 3600e3);
    assert.deepEqual([due.h24.length, due.h1.length], [0, 0]);
    due = await dueReminders(env, st - 23.5 * 3600e3);
    assert.deepEqual(due.h24.map(m => m.id), [r.data.id]);
    calls.length = 0;
    let out = await meetingsCron(env, st - 23.5 * 3600e3);
    assert.equal(out.reminders24, 1);
    const wa = calls.find(x => /graph\.facebook\.com\/v21\.0\/1234567890\/messages/.test(x.url));
    assert.equal(wa.body.to, "201012345678");
    assert.equal(wa.body.template.name, "meeting_reminder");
    assert.equal(wa.body.template.language.code, "ar");
    assert.equal(wa.body.template.components[0].parameters[2].text, "https://madeinegyptgate.com/meeting.html#" + r.data.id);
    assert.equal((await meetingsCron(env, st - 23.4 * 3600e3)).reminders24, 0); // once only
    out = await meetingsCron(env, st - 50 * 60000);
    assert.equal(out.reminders1, 1);
    assert.match(resend().at(-1).body.subject, /تذكير/);
    assert.equal((await meetingsCron(env, st - 40 * 60000)).reminders1, 0);
    // the meeting booked 40 minutes ahead never gets a 1-hour reminder (n/a at booking)
    const late = await env.DB.prepare("SELECT reminded_24h, reminded_1h FROM meetings WHERE id = ?").bind(soon.data.id).first();
    assert.deepEqual([late.reminded_24h, late.reminded_1h], ["n/a", "n/a"]);
    out = await meetingsCron(env, st + 3 * 3600e3);
    assert.equal(out.missed, 1); // the late one was already marked missed by an earlier run
    assert.equal((await call(env, "/" + r.data.id)).data.status, "missed");
    assert.equal((await call(env, "/" + soon.data.id)).data.status, "missed");
  });
  test("without WhatsApp config only email reminders go out", async () => {
    const env = env0();
    const r = await call(env, "", { method: "POST", body: { ...VIS, date: cairoDate(2), time: "10:00" } });
    calls.length = 0;
    const out = await meetingsCron(env, Date.parse(r.data.starts_at) - 55 * 60000);
    assert.deepEqual([out.reminders1, out.whatsapp], [1, 0]);
    assert.equal(calls.filter(x => /facebook/.test(x.url)).length, 0);
  });
  test("a live meeting whose finish never arrived is closed and processed", async () => {
    const env = env0({ ANAM_API_KEY: "k", MEDIA: new R2() });
    anamMocks();
    const id = (await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, session_id: SID } })).data.id;
    const later = Date.now() + 3 * 3600e3;
    const out = await meetingsCron(env, later);
    assert.equal(out.closed, 1);
    const row = await env.DB.prepare("SELECT status, proc_status FROM meetings WHERE id = ?").bind(id).first();
    assert.equal(row.status, "ended");
    assert.ok(["done", "pending", "rejected"].includes(row.proc_status));
    assert.equal(typeof processMeeting, "function");
  });
});

describe("index.js routing", () => {
  test("/api/meetings/* goes to meetings, janna + advisor untouched, scheduled() exported", async () => {
    let r = await worker.fetch(new Request("https://madeinegyptgate.com/api/meetings/health"), {}, ctx());
    assert.equal((await r.json()).session_cap_min, 10);
    r = await worker.fetch(new Request("https://madeinegyptgate.com/api/janna/health"), {}, ctx());
    assert.equal((await r.json()).ok, true);
    r = await worker.fetch(new Request("https://madeinegyptgate.com/api/advisor/health"), {}, ctx());
    assert.equal(r.status, 200);
    assert.equal(typeof worker.scheduled, "function");
    const c = ctx(); await worker.scheduled({}, {}, c); await c.done();
  });
});

describe("security: consent, phishing, session binding", () => {
  const joinable = () => { const l = cairoLocal(Date.now() + 12 * 60000); return { date: l.date, time: l.time }; };
  const row = (env, id) => env.DB.prepare("SELECT * FROM meetings WHERE id = ?").bind(id).first();
  test("no recording consent → the transcript is never fetched, stored or emailed (form-based summary only)", async () => {
    const media = new R2(), env = env0({ ANAM_API_KEY: "k", MEDIA: media });
    const id = (await call(env, "", { method: "POST", body: { ...VIS, ...joinable(), recording_consent: false } })).data.id;
    anamMocks({ start: Date.now() });
    await call(env, `/${id}/join`, { method: "POST", body: { session_id: SID, consent: false } });
    const c = ctx(); await call(env, `/${id}/finish`, { method: "POST", body: { session_id: SID, agenda_done: ["intro"] }, c }); await c.done();
    assert.equal(calls.filter(x => /\/transcript|\/recording$|cdn\.anam\.test/.test(x.url)).length, 0, "no transcript / recording request to Anam");
    const r = await row(env, id);
    assert.deepEqual([r.transcript, r.transcript_key, r.recording_key, r.proc_status], ["", "", "", "done"]);
    assert.equal([...media.o.keys()].length, 0);
    const sum = resend().find(x => x.body.to[0] === "mona@example.com" && /ملخص/.test(x.body.subject));
    assert.equal(att(sum, "transcript.txt"), null);
    assert.doesNotMatch(sum.body.text, /مصنع خضار مجمد|إزاي أسجّل|transcript\.txt|مرفق في ملف/);
    assert.match(sum.body.text, /Food processing/); // what the visitor entered in the form
    assert.match(sum.body.text, /ماتسجّلش|was not recorded/);
    const tm = resend().find(x => x.body.to[0] === "info@madeinegyptgate.com" && /ملخص/.test(x.body.subject));
    assert.doesNotMatch(tm.body.text, /إزاي أسجّل|مصنع خضار مجمد/);
  });
  test("consent:false on /join withdraws the consent given at booking: no recording, no transcript", async () => {
    const media = new R2(), env = env0({ ANAM_API_KEY: "k", MEDIA: media });
    const id = (await call(env, "", { method: "POST", body: { ...VIS, ...joinable(), recording_consent: true } })).data.id;
    assert.equal((await row(env, id)).consent, 1);
    anamMocks({ start: Date.now() });
    const j = await call(env, `/${id}/join`, { method: "POST", body: { session_id: SID, consent: false } });
    assert.deepEqual([j.status, j.data.consent], [200, false]);
    assert.equal((await row(env, id)).consent, 0);
    const c = ctx(); const f = await call(env, `/${id}/finish`, { method: "POST", body: {}, c }); await c.done();
    assert.equal(f.data.recording, false);
    assert.equal(calls.filter(x => /\/transcript|\/recording$|cdn\.anam\.test/.test(x.url)).length, 0);
    assert.equal((await row(env, id)).recording_key, "");
    // consent:true later (ticked on a rejoin) grants it again; a body without consent keeps the stored value
    const id2 = (await call(env, "", { method: "POST", body: { ...VIS, email: "b@example.com", ...joinable() } })).data.id;
    assert.equal((await call(env, `/${id2}/join`, { method: "POST", body: { consent: true } })).data.consent, true);
    assert.equal((await call(env, `/${id2}/join`, { method: "POST", body: {} })).data.consent, true);
  });
  test("phishing: links in the name are refused; topic stays out of the visitor email + .ics; no auto-linking of visitor text", async () => {
    const env = env0();
    for (const name of ["https://evil.example/verify-account Ahmed", "Ahmed www.evil.example", "Ahmed evil-login.com", "Ahmed http://x"]) {
      const r = await call(env, "", { method: "POST", body: { ...VIS, name, ...joinable() } });
      assert.equal(r.status, 400, name); assert.match(r.data.error, /name/);
    }
    assert.equal(resend().length, 0);
    const topic = "Urgent: your account is suspended, visit https://evil.example/login";
    const r = await call(env, "", { method: "POST", body: { ...VIS, email: "victim@example.com", company: "Evil https://evil.example/c", topic, ...joinable() } });
    assert.equal(r.status, 200);
    const [vis, tm] = resend();
    const ics = att(vis, "meeting.ics").replace(/\r\n /g, "");
    for (const s of [vis.body.text, vis.body.html, ics]) { assert.doesNotMatch(s, /evil\.example|suspended/); }
    assert.doesNotMatch(tm.body.html, /href="https:\/\/evil/); // the team sees it, defanged and never as a link
    assert.match(tm.body.text, /evil\[\.\]example/);
    assert.doesNotMatch(tm.body.text, /https:\/\/evil/);
    assert.match(vis.body.html, new RegExp(`<a href="https://madeinegyptgate\\.com/meeting\\.html#${r.data.id}">`)); // our own links stay clickable
    const pub = await call(env, `/${r.data.id}/ics`);
    assert.doesNotMatch(await pub.res.text(), /evil|suspended/);
  });
  test("rate limits use the normalised email (case, +tag) and cannot be bypassed by rotating IPs", async () => {
    const env = env0();
    const book = (email, ip, days) => call(env, "", { method: "POST", body: { ...VIS, email, date: cairoDate(days), time: "12:00" }, headers: { "CF-Connecting-IP": ip } });
    for (let i = 0; i < 3; i++) assert.equal((await book(`t+${i}@victim.example`, "198.51.100." + i, 2 + i)).status, 200);
    assert.equal((await book("T+3@Victim.Example", "198.51.100.50", 6)).status, 429);
    assert.equal((await book("t@victim.example", "198.51.100.51", 7)).status, 429);
    const rows = (await env.DB.prepare("SELECT email, email_key FROM meetings").all()).results;
    assert.deepEqual([...new Set(rows.map(x => x.email_key))], ["t@victim.example"]);
    assert.equal(rows[0].email, "t+0@victim.example"); // the address itself is kept as given (lower-cased) for delivery
  });
  test("Turnstile (optional): with TURNSTILE_SECRET a token is required on booking and start", async () => {
    const env = env0({ TURNSTILE_SECRET: "ts_secret" });
    routes.push([/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/, (u, b, init) => Response.json({ success: String(init.body).includes("good-token") })]);
    let r = await call(env, "", { method: "POST", body: { ...VIS, ...joinable() } });
    assert.deepEqual([r.status, r.data.error], [403, "verification required"]);
    r = await call(env, "", { method: "POST", body: { ...VIS, ...joinable(), turnstile_token: "bad" } });
    assert.equal(r.status, 403);
    r = await call(env, "", { method: "POST", body: { ...VIS, ...joinable(), turnstile_token: "good-token" } });
    assert.equal(r.status, 200);
    assert.equal((await call(env, "/start", { method: "POST", body: { ...VIS, consent: true } })).status, 403);
    assert.equal((await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, turnstile_token: "good-token" } })).status, 200);
    assert.equal((await call(env, "/health")).data.turnstile, true);
  });
  test("session binding: a session id used by another meeting is refused", async () => {
    const env = env0({ ANAM_API_KEY: "k", MEDIA: new R2() });
    assert.equal((await call(env, "/start", { method: "POST", body: { ...VIS, consent: true, session_id: SID } })).status, 200);
    const r = await call(env, "/start", { method: "POST", body: { ...VIS, email: "attacker@evil.example", consent: true, session_id: SID.toUpperCase() } });
    assert.deepEqual([r.status, r.data.error], [409, "session already used"]);
    const id = (await call(env, "/start", { method: "POST", body: { ...VIS, email: "attacker@evil.example", consent: true } })).data.id;
    assert.equal((await call(env, `/${id}/finish`, { method: "POST", body: { session_id: SID } })).status, 409);
    const sid = (await call(env, "", { method: "POST", body: { ...VIS, email: "c@example.com", ...joinable() } })).data.id;
    assert.equal((await call(env, `/${sid}/join`, { method: "POST", body: { session_id: SID } })).status, 409);
  });
  test("session binding: a session that started well before the meeting was created, or had already ended, is rejected", async () => {
    for (const [mock, why] of [[{ start: Date.now() - 50 * 60000 }, "old start"], [{ start: Date.now() - 9 * 60000, end: Date.now() - 3 * 60000 }, "already ended"]]) {
      calls.length = 0; routes.length = 0;
      const env = env0({ ANAM_API_KEY: "k", MEDIA: new R2() });
      anamMocks(mock);
      // started_at is client-supplied (±1 h) — the server must anchor the window on its own clock
      const id = (await call(env, "/start", { method: "POST", body: { ...VIS, email: "attacker@evil.example", consent: true, session_id: SID, started_at: new Date(Date.now() - 55 * 60000).toISOString() } })).data.id;
      const c = ctx(); await call(env, `/${id}/finish`, { method: "POST", body: {}, c }); await c.done();
      assert.equal((await row(env, id)).proc_status, "rejected", why);
      assert.equal(calls.filter(x => /transcript|recording/.test(x.url)).length, 0, why);
      assert.equal(resend().length, 0, why);
    }
  });
});
