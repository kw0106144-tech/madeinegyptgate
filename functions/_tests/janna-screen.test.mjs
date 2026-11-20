// node --test for the faster live call (owner 2026-11-20: «زود سرعه استجابه باسم وجنه»), the page's part: the shared screen shows what a
// janna_lookup / platform_item found as soon as the result is in (data/janna-live.js lookupDone / itemShow), the persona's own janna_search
// for it loads nothing again, the screen waits end on a page signal (advSearch; data/bassem-live-tools.js), a browser whose start stalled
// takes the TURN relay next time, the start's timing beacon carries numbers only, and links into e-mails are percent-encoded. Pieces of the
// files run in a vm sandbox (no DOM), plus source checks. In functions/_tests so it gates deploy-site, which ships these files.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const LIVE = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");
const LT = readFileSync(new URL("../../data/bassem-live-tools.js", import.meta.url), "utf8");
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); assert.ok(i > 0 && j > i, a); return src.slice(i, j); };
const fn = (src, name) => cut(src, "  function " + name + "(", "\n  }\n") + "\n  }\n";
const line = (src, start) => cut(src, start, "\n");

function screen() {
  const sb = { busy: false, fields: [], runs: [], gos: [], clock: { t: 1_800_000_000_000 }, page: "", box: "", ov: null, pending: null, withLang: u => u, url: u => u };
  /* the shared screen: the deal room open (busy) and the form fields screenWork reads; the page it shows (MIGPAGE) and its search box */
  const doc = { querySelector: s => (s === "#advDr" && sb.busy ? { hidden: false } : /^#(q|sq|olQ|oq)$/.test(s) && sb.page ? { value: sb.box } : null), querySelectorAll: s => (s === "form input, form textarea" ? sb.fields : []) };
  sb.frame = { contentDocument: doc, contentWindow: { get MIGPAGE() { return sb.page; }, location: { pathname: "/" }, document: doc } };
  Object.defineProperty(sb.frame, "src", { set: v => sb.gos.push(v) });
  sb.Date = { now: () => sb.clock.t };
  sb.screenBusy = () => true; /* never asked: it is true on most list pages (script-filled selects) */
  sb.run = (n, a, o) => sb.runs.push([n, a, o]);
  vm.createContext(sb);
  vm.runInContext(fn(LIVE, "resJson") + line(LIVE, "  function norm(s) {") + "\n" + line(LIVE, "  var SEARCH = {") + "\n" + line(LIVE, "  function pageKey(w) {") + "\n"
    + line(LIVE, "  function go(u, then) {") + "\n" + cut(LIVE, "  var LKS = ", "  function run(name, a, o) {"), sb);
  return sb;
}
const res = (o) => ({ toolName: "janna_lookup", toolType: "server", result: JSON.stringify(o) });

describe("the screen shows what janna_lookup found, from its RESULT (lookupDone)", () => {
  test("a lookup that found something → the same search on the screen; the persona's own janna_search for it is known as shown", () => {
    const S = screen();
    S.lookupDone(res({ section: "factories", query: "بلاستيك", governorate: "الشرقية", count: 12, results: [{ name: "x" }], text: "…" }));
    assert.equal(S.runs.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(S.runs[0])), ["janna_search", { section: "factories", query: "بلاستيك", governorate: "الشرقية" }, { mirror: 1 }]);
    assert.equal(S.lookupShown({ section: "factories", query: "البلاستيك" }), true, "the same words (norm), while the mirror's page loads");
    assert.equal(S.lookupShown({ section: "tenders", query: "بلاستيك" }), false);
    /* review F2: once its page is there, «shown» = the screen really shows that section with these words in its box */
    S.LKS.ok = 1; S.page = "factories"; S.box = "بلاستيك";
    assert.equal(S.lookupShown({ section: "factories", query: "البلاستيك" }), true, "box «بلاستيك» holds «البلاستيك» (the same normalisation as boxHas)");
    S.page = "tenders"; S.box = "بلاستيك"; assert.equal(S.lookupShown({ section: "factories", query: "بلاستيك" }), false, "a tap inside the screen took it elsewhere");
    S.page = "factories"; S.box = "حديد"; assert.equal(S.lookupShown({ section: "factories", query: "بلاستيك" }), false, "other words in the box");
    S.page = "factories"; S.box = "بلاستيك";
    S.clock.t += 21000; assert.equal(S.lookupShown({ section: "factories", query: "بلاستيك" }), false, "20 s at most");
  });
  test("review F2: any other move of the screen ends the mirror; a page that never loaded stops counting after 10 s", () => {
    const S = screen();
    S.lookupDone(res({ section: "tenders", query: "حديد", count: 20, results: [{}] }));
    assert.equal(S.lookupShown({ section: "tenders", query: "حديد" }), true);
    S.go("/tender-item/eg-tnd-001/"); /* platform_item / janna_navigate / bassem_open_item / JANNA_LIVE.show all go through go() */
    assert.equal(S.lookupShown({ section: "tenders", query: "حديد" }), false, "the screen shows the item now: the persona's janna_search loads the list");
    S.clock.t += 3000; S.lookupDone(res({ section: "factories", query: "اسمنت", count: 2, results: [{}] }));
    assert.equal(S.runs.length, 2);
    S.mirror("janna_search", { section: "factories", query: "اسمنت" }); /* the mirror's own go() keeps it */
    S.go("factories.html"); assert.equal(S.LKS.k, "", "outside the mirror go() always ends it");
    S.clock.t += 3000; S.lookupDone(res({ section: "factories", query: "رخام", count: 2, results: [{}] }));
    S.clock.t += 11000; assert.equal(S.lookupShown({ section: "factories", query: "رخام" }), false, "never loaded (ok 0) after 10 s: not shown");
  });
  test("review F1: the persona's own screen tool in the same step wins — the page does not load it again", () => {
    const S = screen(), started = (toolName, toolCallId) => S.scrMark({ toolName, toolCallId, toolType: toolName === "janna_lookup" || toolName === "platform_item" ? "server" : "client" });
    /* janna_lookup + janna_search in one step (live session d6e67513 turn 3): the search starts, the lookup's result comes 0.7 s later */
    started("janna_lookup", "l1"); started("janna_search", "s1"); S.clock.t += 700;
    S.lookupDone({ ...res({ section: "factories", query: "بلاستيك", count: 20, results: [{}] }), toolCallId: "l1" });
    assert.deepEqual([S.runs.length, S.gos.length], [0, 0], "no second navigation");
    S.page = "factories"; S.box = "بلاستيك";
    assert.equal(S.lookupShown({ section: "factories", query: "بلاستيك" }), true, "remembered: a later janna_search for it is skipped while the screen shows it");
    /* bassem_open_item + platform_item in one step: the item's result 0.8 s later moves nothing */
    S.clock.t += 5000; started("platform_item", "p1"); started("bassem_open_item", "b1"); S.clock.t += 800;
    S.itemShow({ toolName: "platform_item", toolCallId: "p1", result: JSON.stringify({ found: true, open_url: "https://madeinegyptgate.com/tender-item/eg-tnd-003/" }) });
    /* janna_search + 2× platform_item (d6e67513 turn 5): one navigation (the persona's), not three */
    S.clock.t += 5000; started("platform_item", "p2"); started("platform_item", "p3"); started("janna_search", "s2"); S.clock.t += 400;
    for (const id of ["p2", "p3"]) S.itemShow({ toolName: "platform_item", toolCallId: id, result: JSON.stringify({ found: true, open_url: "https://madeinegyptgate.com/factories/x-" + id + "/" }) });
    assert.deepEqual([S.runs.length, S.gos.length], [0, 0]);
    /* a screen tool of an EARLIER step does not count: the next lookup's result goes on the screen */
    S.clock.t += 3000; started("janna_lookup", "l2"); S.clock.t += 900;
    S.lookupDone({ ...res({ section: "tenders", query: "كابلات", count: 4, results: [{}] }), toolCallId: "l2" });
    assert.equal(S.runs.length, 1);
    /* two items in 2.5 s: the first only (the lookup rule, now for platform_item too) */
    S.clock.t += 3000; started("platform_item", "p4"); started("platform_item", "p5"); S.clock.t += 600;
    for (const id of ["p4", "p5"]) S.itemShow({ toolName: "platform_item", toolCallId: id, result: JSON.stringify({ found: true, open_url: "https://madeinegyptgate.com/rfq/" + id + "/" }) });
    assert.deepEqual([...S.gos], ["/rfq/p4/"]);
    /* an unknown start (no toolCallId): a screen tool in the last 4 s counts */
    S.clock.t += 3000; started("bassem_screen", ""); S.clock.t += 1000;
    S.lookupDone(res({ section: "suppliers", query: "تغليف", count: 2, results: [{}] }));
    assert.equal(S.runs.length, 1, "bassem_screen 1 s ago");
    for (const n of ["janna_navigate", "janna_fill_rfq", "bassem_open_opportunity", "bassem_start_deal", "bassem_open_guide", "bassem_update_deal", "bassem_draft_email"]) assert.ok(S.SCR_TOOLS.test(n), n);
    for (const n of ["bassem_recall", "bassem_save_profile", "janna_lookup", "platform_item", "bassem_intel", "knowledge_lookup"]) assert.ok(!S.SCR_TOOLS.test(n), n);
  });
  test("sections map to the screen's searches; cities open the industrial cities page", () => {
    const S = screen();
    S.lookupDone(res({ section: "products", query: "مواسير", count: 3, results: [{}] })); S.clock.t += 3000;
    S.lookupDone(res({ section: "cities", query: "العاشر", count: 2, results: [{}] }));
    assert.deepEqual(S.runs.map(r => [r[0], r[1].section || r[1].page]), [["janna_search", "market"], ["janna_navigate", "cities"]]);
  });
  test("nothing found, a foreign market, a busy screen, a burst, a nested/unknown answer: the screen stays", () => {
    const S = screen();
    S.lookupDone(res({ section: "factories", query: "acier", count: 0, results: [], text: "لا توجد نتائج" }));
    S.lookupDone(res({ section: "tenders", query: "steel", market: "gulf", count: 4, results: [{}] }));
    S.lookupDone({ toolName: "janna_lookup", result: "not json" });
    S.lookupDone({ toolName: "platform_item", result: JSON.stringify({ section: "factories", query: "x", count: 1, results: [{}] }) });
    S.busy = true; S.lookupDone(res({ section: "factories", query: "حديد", count: 5, results: [{}] })); S.busy = false;
    assert.equal(S.runs.length, 0);
    S.lookupDone(res({ section: "tenders", query: "حديد", market: "local", count: 5, results: [{}] }));
    S.clock.t += 1000; S.lookupDone(res({ section: "factories", query: "اسمنت", count: 5, results: [{}] }));
    assert.equal(S.runs.length, 1, "the first lookup in 2.5 s only");
  });
  test("platform_item: ONE item found on this site opens its page; ambiguous, not found, another site or a busy screen do not", () => {
    const S = screen(), it = o => ({ toolName: "platform_item", result: JSON.stringify(o) });
    S.itemShow(it({ found: true, open_url: "https://madeinegyptgate.com/tender-item/eg-tnd-003/" }));
    S.itemShow(it({ found: true, open_url: "https://www.madeinegyptgate.com/factories/abc/" }));
    S.clock.t += 3000;
    S.itemShow(it({ found: true, ambiguous: true, open_url: "https://madeinegyptgate.com/tender-item/eg-tnd-004/" }));
    S.itemShow(it({ found: false, text: "x" }));
    S.itemShow(it({ found: true, open_url: "https://evil.example/tender-item/x/" }));
    S.itemShow(it({ found: true, open_url: "https://madeinegyptgate.com" }));
    S.busy = true; S.clock.t += 3000; S.itemShow(it({ found: true, open_url: "https://madeinegyptgate.com/rfq/x/" }));
    assert.deepEqual([...S.gos], ["/tender-item/eg-tnd-003/"], "the second one within 2.5 s and the busy screen move nothing");
    S.busy = false; S.itemShow(it({ found: true, open_url: "https://www.madeinegyptgate.com/factories/abc/" }));
    assert.deepEqual([...S.gos], ["/tender-item/eg-tnd-003/", "/factories/abc/"]);
  });
  test("screenWork: the deal room or a filled field of a real form is work; a list's filters and selects are not", () => {
    const S = screen(), f = (type, value, def, inSearch) => ({ type, value, defaultValue: def, closest: s => (inSearch && s === "[role=search]" ? {} : null) });
    assert.equal(S.screenWork(), false);
    S.fields = [f("search", "حديد", ""), f("checkbox", "on", "on"), f("text", "x", "x"), f("text", "حديد", "", true)]; assert.equal(S.screenWork(), false);
    S.fields = [f("text", "مواسير بلاستيك", "")]; assert.equal(S.screenWork(), true, "the RFQ form Janna is filling");
    S.fields = [{ tagName: "TEXTAREA", type: "textarea", value: "Dear Sir", defaultValue: "" }]; assert.equal(S.screenWork(), true);
    S.fields = []; S.busy = true; assert.equal(S.screenWork(), true, "the deal room");
    S.busy = false; S.fields = [f("email", "a@b.co", "")];
    S.lookupDone(res({ section: "factories", query: "حديد", count: 5, results: [{}] }));
    S.itemShow({ toolName: "platform_item", result: { found: true, open_url: "https://madeinegyptgate.com/tenders/" } });
    assert.equal(S.runs.length + S.gos.length, 0, "never over a form being filled");
  });
  test("wiring: on the completed tool call (never its start); run() skips a janna_search already on the screen; string arguments are kept", () => {
    assert.match(LIVE, /el\.addEventListener\("anam-agent:tool-call-completed", function \(e\) \{ try \{ lookupDone\(e\.detail \|\| \{\}\); \} catch \(x\) \{\} try \{ itemShow\(e\.detail \|\| \{\}\); \} catch \(x\) \{\} \}\);/);
    assert.match(LIVE, /el\.addEventListener\("anam-agent:tool-call-started", function \(e\) \{ var d = e\.detail \|\| \{\}; HT\.tool = Date\.now\(\); try \{ scrMark\(d\); \} catch \(x\) \{\}/, "every start is marked (F1)");
    assert.match(LIVE, /function run\(name, a, o\) \{\n    a = a && typeof a === "object" \? a : \{\};\n    if \(name === "janna_search" && !\(o && \(o\.mirror \|\| o\.force\)\) && lookupShown\(a\)\) return;/);
    assert.match(LIVE, /if \(!\(o && \(o\.topic \|\| o\.force\)\) && window\.MIG_LIVE_TOOLS && MIG_LIVE_TOOLS\.take/, "a forced search is Bassem's own job already");
    assert.match(fn(LIVE, "run"), /lk = o && o\.mirror \? LKS : null;[\s\S]*if \(lk\) lk\.ok = 1;/, "the mirror's page marks itself loaded");
    assert.match(LIVE, /function go\(u, then\) \{ if \(!MIR && LKS\) LKS\.k = "";/);
    assert.match(LIVE, /link: function \(u\) \{ return withLang\(url\(u\)\); \}, shown: lookupShown \};/, "Bassem's screen tools can ask");
    const sb = { fired: [] }; sb.sdkFire = (n, d) => sb.fired.push(d); sb.Date = Date; vm.createContext(sb); vm.runInContext(fn(LIVE, "sdkTool"), sb);
    sb.sdkTool({ seen: {} }, "janna_search", "client", '{"section":"tenders","query":"حديد"}', "c1");
    sb.sdkTool({ seen: {} }, "janna_search", "client", "{oops", "c2");
    assert.deepEqual(JSON.parse(JSON.stringify(sb.fired.map(d => d.arguments))), [{ section: "tenders", query: "حديد" }, {}]);
  });
});

describe("screen waits end on a page signal, today's time as the cap", () => {
  test("advSearch: the cards are read once the advisor list re-rendered (a new #advQ), never before; 650 ms at most", async () => {
    const sb = { glow: () => {}, Date, setTimeout, Event: function () {} }; vm.createContext(sb); vm.runInContext(line(LIVE, "  function advSearch(d, q, cb) {"), sb);
    const doc = (rerender) => { const st = { q: { value: "" }, card: "old" }; st.q.oninput = () => { if (rerender) setTimeout(() => { st.q = { value: st.q.value }; st.card = "filtered"; }, 250); };
      return { querySelector: s => (s === "#advQ" ? st.q : s === ".opc" ? st.card : null) }; };
    let t0 = Date.now(), card = await new Promise(r => sb.advSearch(doc(true), "حديد", r));
    const fast = Date.now() - t0; assert.equal(card, "filtered"); assert.ok(fast >= 240 && fast < 450, "after the re-render: " + fast);
    t0 = Date.now(); card = await new Promise(r => sb.advSearch(doc(false), "حديد", r));
    assert.ok(Date.now() - t0 >= 640, "no re-render: the old 650 ms cap"); assert.equal(card, "old");
  });
  test("data/bassem-live-tools.js: the opportunity's own drawer, a stable summary, a shorter item wait; a search already shown is read at once", () => {
    const opp = cut(LT, "  function watchOpportunity(", "  /* ---------- the Information Center results");
    assert.doesNotMatch(opp, /sleep\(1100\)/);
    assert.match(opp, /return q1 && q1 !== q0 && h && tx\(h\) !== h0 \? d : null; \}, 1100, 100\)/);
    assert.doesNotMatch(opp, /article\.opc"\)[^\n]*\? d : null/, "never «a card is there»: the cards exist before the filter");
    const nav = cut(LT, "  function watchNavigate(", "  function watchOpportunity(");
    assert.doesNotMatch(nav, /sleep\(700\)/); assert.match(nav, /if \(ok && s0 === last0\) same0\+\+; else \{ same0 = 0; last0 = s0; \} return same0 >= 2 \? d : null; \}, 700, 150\)/);
    assert.match(LT, /return now\(\) - seenU > 300 \? d : null;/); assert.match(LT, /return d \? sleep\(100\)\.then\(function \(\) \{ return shownItem\(d, S\); \}\)/);
    assert.match(cut(LT, "  function shownItem(", "  function settleText("), /return settleText\(d\)\.then/, "settleText still guards the reading");
    const ws = cut(LT, "  function watchSearch(", "  function rankT(");
    assert.match(ws, /pre = !!\(H && H\.shown && H\.shown\(a\)\)/);
    assert.match(ws, /var d = fdoc\(\); if \(ready\(d\) && looks\(d\)\) return d;/);
    assert.match(ws, /return \(el > 1500 && !still\) \|\| el > 6000 \? REAL : null;/, "review F2: not there after 1.5 s (or 6 s at most) → for real");
    assert.match(ws, /H\.run\("janna_search", a, \{ force: 1 \}\)/);
  });
  test("review F2: boxHas reads the box as janna-live.js does (a leading «ال» aside on both sides)", () => {
    const sb = {}; vm.createContext(sb); vm.runInContext(line(LT, "  function norm(s) {") + "\n" + line(LT, "  function boxHas(d, S, q) {"), sb);
    const d = v => ({ querySelector: () => ({ value: v }) }), S = { box: "#q" };
    assert.equal(sb.boxHas(d("بلاستيك"), S, "البلاستيك"), true);
    assert.equal(sb.boxHas(d("البلاستيك"), S, "بلاستيك"), true);
    assert.equal(sb.boxHas(d("مصانع البلاستيك"), S, "البلاستيك"), true);
    assert.equal(sb.boxHas(d("حديد"), S, "البلاستيك"), false);
  });
});

describe("a stalled start → the relay next time; the start's timing beacon (numbers only)", () => {
  const relay = () => {
    const st = {}, sb = { localStorage: { getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, Date: { now: () => sb.t }, t: 1_800_000_000_000, st };
    vm.createContext(sb); vm.runInContext(["relayMem", "relaySlow", "relayDrop"].map(n => line(LIVE, "  function " + n + "(")).join("\n"), sb); return sb;
  };
  test("stream → connected over 8 s remembers the relay for 30 days; a relay start that fails forgets it; an old mark expires", () => {
    const R = relay();
    R.relaySlow({ relay: false, tm: { marks: { stream: 1000, connected: 8500 } } }); assert.equal(R.relayMem(), false, "7.5 s: not slow");
    R.relaySlow({ relay: false, tm: { marks: { stream: 1000, connected: 9500 } } }); assert.equal(R.relayMem(), true);
    assert.ok(Math.abs(+R.st["mig-jnl-relay"] - (R.t + 30 * 864e5)) < 1000);
    R.relayDrop({ relay: false }); assert.equal(R.relayMem(), true, "only a relay start's failure");
    R.relayDrop({ relay: true }); assert.equal(R.relayMem(), false);
    R.relaySlow({ relay: false, tm: { marks: { stream: 0, connected: 20000 } } }); R.t += 31 * 864e5; assert.equal(R.relayMem(), false); assert.equal("mig-jnl-relay" in R.st, false);
    assert.match(LIVE, /var rl = String\(window\.JANNA_LIVE_RELAY\) === "1" \|\| relayMem\(\);[^\n]*\n    if \(rl\) opts\.rtcConfiguration = \{ iceTransportPolicy: "relay" \};\n    me\.relay = rl;/);
    assert.match(fn(LIVE, "sdkFail"), /if \(why === "start"\) relayDrop\(me\);/);
  });
  test("the beacon at «voice»: the marks, the Worker's Server-Timing durations and Anam's region — no id, no words", () => {
    const sent = [], sb = { navigator: { sendBeacon: (u, b) => { sent.push([u, b]); return true; } }, window: {}, JSON, EN: false };
    vm.createContext(sb); vm.runInContext(fn(LIVE, "tmSend") + line(LIVE, "  function tmRegion(me) {") + "\n" + fn(LIVE, "tmBeacon"), sb);
    const me = { relay: true, client: { getActiveSessionRegion: () => "eu-west-1" }, tm: { persona: "bassem", server: "boot;dur=7, checks;dur=12, ctx;dur=40, token;dur=380, total;dur=455", marks: { token: 512.4, sdk: 300, mic: 700, stream: 710, connected: 1900, ready: 2400, voice: 4100, sid: "should-not-go" } } };
    sb.tmBeacon(me); sb.tmBeacon(me);
    assert.equal(sent.length, 1, "once per call"); assert.equal(sent[0][0], "/api/janna/timing");
    assert.deepEqual(JSON.parse(sent[0][1]), { k: "start", p: "bassem", lang: "ar", relay: 1, region: "eu-west-1", ms: { token: 512, sdk: 300, mic: 700, stream: 710, connected: 1900, ready: 2400, voice: 4100 }, srv: { boot: 7, checks: 12, ctx: 40, token: 380, total: 455 } });
    assert.match(fn(LIVE, "tmTurnsSend"), /tmSend\(\{ k: "turns", p: [^\n]*lang: EN \? "en" : "ar", region:/, "the call's end too (worker/src/live-timing.js reads both bodies)");
    assert.equal(sb.tmRegion({ client: { getActiveSessionRegion: () => "<script>" } }), "", "only a plain region name");
    assert.match(fn(LIVE, "tmMark"), /if \(k === "voice"\) tmBeacon\(me\);/);
  });
});

describe("links into messages and e-mails are percent-encoded (janna_lookup's lean answer gives them decoded)", () => {
  const sb = { T: (ar) => ar, JSON }; vm.createContext(sb);
  vm.runInContext(cut(LIVE, "  var URLS = {}, URLS_N = 0;", "  function urlsFix(") + fn(LIVE, "urlsFix"), sb);
  test("a decoded Arabic link the tools returned goes out encoded; an encoded one stays; a mistyped one is fixed and encoded", () => {
    const dec = "https://madeinegyptgate.com/tender-item/توريد-حديد-تسليح/", encd = encodeURI(dec);
    sb.urlsKeep({ results: [{ open_url: dec }] });
    assert.equal(sb.urlsFix("الرابط: " + dec + " ."), "الرابط: " + encd + " .");
    assert.equal(sb.urlsFix("الرابط: " + encd), "الرابط: " + encd);
    assert.equal(sb.urlsFix("see " + dec.replace("تسليح", "تسلح")), "see " + encd, "one letter dropped by the model");
    assert.equal(sb.enc(encd), encd); assert.equal(sb.enc("https://x.example/a b"), "https://x.example/a%20b"); assert.equal(sb.enc("https://x.example/%E2%9C%93 ✓"), "https://x.example/%E2%9C%93%20%E2%9C%93");
    assert.match(sb.urlsFix("https://other.example/x"), /^\(الرابط الرسمي موجود على صفحة الفرصة في المنصة\)$/);
  });
  test("the opportunity's source link (itemOpp) is encoded too", () => {
    assert.match(fn(LIVE, "itemOpp"), /source_url: enc\(x\.documents_url \|\| x\.url \|\| x\.open_url \|\| ""\)/);
  });
});
