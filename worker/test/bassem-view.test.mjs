// node --test for data/bassem-intel-view.js (the browser view of Bassem's live-call tools), run in a vm sandbox with a fake page:
// the hologram / screen / card show EXACTLY the bassem_intel tool's own answer; the feed is only a labelled fallback; market names
// are never raw codes; bassem_save_profile resolves to the result Bassem is given («اتسجّل» only on the platform's "saved").
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../data/bassem-intel-view.js", import.meta.url), "utf8");
const LIVE_SRC = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");

function el(tag) {
  const e = { tagName: String(tag || "div").toUpperCase(), children: [], attrs: {}, hidden: false, innerHTML: "", className: "", style: {}, classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, insertBefore(c) { return this.appendChild(c); },
    querySelector(sel) { if (sel === ".bv-card") return this.children.find(c => c.className === "bv-card") || null; if (sel === ".bv-x" || sel === ".bv-more") return /bv-more/.test(this.innerHTML) || sel === ".bv-x" ? (this["_" + sel] = this["_" + sel] || {}) : null; return null; },
    scrollIntoView() {} };
  return e;
}
/* a fake page: {win, shown: hologram scenes, steps, screen: JANNA_LIVE.show calls, fetches, timers} */
function page({ fetchMap = {}, busy = false, stackedLayout = false, liveCall = true, tokens = ["tok-1"], framePath = "", lang = "ar" } = {}) {
  const shown = [], steps = [], screen = [], fetches = [], timers = [];
  const me = el("div"), jnl = el("div"); jnl.querySelector = sel => (sel === ".jnl-me" ? me : null);
  const listeners = {};
  /* the call's shared screen (an iframe showing framePath) */
  const frame = framePath ? { contentWindow: { location: { pathname: framePath } } } : null;
  const doc = { addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); }, getElementById: () => null, createElement: el, head: el("head"), documentElement: el("html"),
    querySelector: sel => (sel === ".jnl:not([hidden])" ? (liveCall ? jnl : null) : sel === ".jnl .jnl-scr iframe" ? frame : null) };
  const store = { "mig-tok": tokens[0] || "" }, sess = { "mig-adv-token": tokens[1] ? JSON.stringify({ t: tokens[1] }) : "null" };
  const win = { MIGLANG: lang, matchMedia: () => ({ matches: stackedLayout }), addEventListener() {}, dispatchEvent() {}, open() {},
    MIGHOLO: { result() {}, show(o) { shown.push(o); }, step(t, s) { steps.push([t, s]); } },
    JANNA_LIVE: { show(u, o) { screen.push([u, o || null]); return !busy || !!(o && o.force); }, screenBusy: () => busy },
    fetch: async (url, init = {}) => {
      fetches.push({ url: String(url), init });
      const key = Object.keys(fetchMap).find(k => String(url).includes(k));
      let r = key ? fetchMap[key] : { status: 404, body: { code: "nf" } };
      if (typeof r === "function") r = r(String(url), init, fetches.length);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => "application/json" }, json: async () => r.body };
    } };
  win.window = win; win.document = doc;
  const ctx = vm.createContext({ window: win, document: doc, Promise, JSON, Object, String, Date, Math, isNaN, parseInt, encodeURIComponent, Intl, Number, Array, RegExp,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, done: false }); return timers.length; }, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].done = true; },
    localStorage: { getItem: k => store[k] || null }, sessionStorage: { getItem: k => sess[k] || null }, CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; } });
  vm.runInContext(SRC, ctx);
  const fire = (name, detail) => (listeners["anam-agent:" + name] || []).forEach(f => f({ detail }));
  const runTimers = ms => { for (const t of timers) if (!t.done && t.ms <= ms) { t.done = true; t.fn(); } };
  return { V: win.BASSEM_VIEW, win, me, shown, steps, screen, fetches, timers, fire, runTimers };
}
const tick = () => new Promise(r => setImmediate(r));
/* the worker-intel tool's answer for «حديد» in the Gulf (owner test): nothing in gcc, widened over the plan scope, one project news */
const TOOL = { count: 1, market: "gcc", widened: "eg,gcc,arab,africa", days: 30, plan: "partner", text: "مالقيتش فرص عن «حديد» في الخليج …",
  results: [{ id: "x1", kind: "project_news", kind_label: "خبر مشروع", title: "البنك الدولي يمول مشروع صلب", entity: "World Bank", market: "eg", market_name: "مصر", deadline: null, url: "https://worldbank.org/p/1", page: "https://madeinegyptgate.com/intel/projects/steel-x1/" }] };

describe("bassem_intel: the tool's own answer is what the member sees", () => {
  test("completed → hologram count / items / widening note from the tool; screen = the first result's own page; no feed query", async () => {
    const P = page();
    P.fire("tool-call-started", { toolName: "bassem_intel", toolType: "server", toolCallId: "c1", arguments: { action: "search", query: "حديد", market: "gulf" } });
    P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "c1", result: JSON.stringify(TOOL) });
    P.runTimers(60000); await tick();
    assert.equal(P.fetches.length, 0, "the fallback was cancelled");
    assert.equal(P.shown.length, 1);
    const s = P.shown[0];
    assert.equal(s.count, 1);
    assert.deepEqual(s.items.map(x => x.title), ["البنك الدولي يمول مشروع صلب"]);
    assert.equal(s.steps[1], "مفيش في الخليج — دي نتايج من أسواق باقتك");
    assert.match(s.steps[2], /^لقيت نتيجة واحدة — أولها: البنك الدولي/);
    assert.doesNotMatch(s.title, / · /, "the asked market is not claimed in the title when the search was widened");
    assert.deepEqual(P.screen, [["/intel/projects/steel-x1/", null]]);
  });
  test("an object result, wrapped once, also works; a result the page cannot read falls back to the labelled feed list", async () => {
    const P = page({ fetchMap: { "/api/intel/feed": { status: 200, body: { total: 13, items: [{ kind: "news", title: "خريطة الأسعار اليوم: انخفاض الطماطم" }, { kind: "tender_gov", title: "توريد حديد تسليح", page: "/intel/tenders/t-9/" }] } } } });
    P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "c2", arguments: { action: "search", query: "حديد" } });
    P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "c2", result: { result: TOOL } });
    assert.equal(P.shown[0].count, 1);
    P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "c3", arguments: { action: "search", query: "حديد" } });
    P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "c3", result: "not json" });
    await tick(); await tick();
    assert.equal(P.fetches.length, 1);
    const f = P.shown[1];
    assert.equal(f.count, null, "the fallback list claims no count");
    assert.match(f.title, /^في مركز المعلومات/);
    assert.deepEqual(f.items.map(x => x.title), ["توريد حديد تسليح"], "opportunities only while there are any (no price news)");
  });
  test("no outcome within 8 s → the feed fallback; a late tool answer still replaces it", async () => {
    const P = page({ fetchMap: { "/api/intel/feed": { status: 200, body: { total: 2, items: [{ kind: "news", title: "خبر أسعار" }] } } } });
    P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "c4", arguments: { action: "search", query: "حديد", market: "الخليج العربي" } });
    assert.equal(P.timers[0].ms, 8000);
    P.runTimers(8000); await tick(); await tick(); await tick(); await tick();
    assert.match(P.fetches[0].url, /market=gcc/, "«الخليج العربي» is the Gulf");
    assert.ok(P.fetches.some(x => !/market=/.test(x.url)), "no result in the market → once more without it");
    const fb = P.shown[P.shown.length - 1];
    assert.equal(fb.steps[1], "مفيش في الخليج — دي نتايج من أسواق تانية");
    P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "c4", result: TOOL });
    assert.equal(P.shown[P.shown.length - 1].count, 1, "the tool's own answer wins");
  });
  test("failed → a failure step, no list, no feed query", async () => {
    const P = page();
    P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "c5", arguments: { action: "search", query: "x" } });
    P.fire("tool-call-failed", { toolName: "bassem_intel", toolCallId: "c5", errorMessage: "timeout" });
    P.runTimers(60000); await tick();
    assert.deepEqual([P.shown.length, P.fetches.length, P.steps[0][1]], [0, 0, "fail"]);
  });
  /* review 2026-11-20 CW-4: worker-intel now answers a refused POST with 200 {ok:false, flags, text} (no results) instead of a 429 / 400 */
  test("a refused call (200 ok:false, flags busy / bad_request, no results) → the failure step as before, never the feed list", async () => {
    const BUSY = { ok: false, error: "rate limited", flags: ["busy"], text: "لحظة واحدة، طلبات كتير ورا بعض. جرّب تاني بعد دقيقة." };
    const BAD = { ok: false, error: "bad json", flags: ["bad_request"], text: "طلب البحث وصل ناقص. ابعته تاني مرة واحدة بس…" };
    for (const [i, res] of [[1, JSON.stringify(BUSY)], [2, { result: BAD }], [3, { ...BUSY, action: "doc", error: "rate limited" }]]) {
      const P = page({ fetchMap: { "/api/intel/feed": { status: 200, body: { total: 1, items: [{ kind: "tender_gov", title: "توريد حديد تسليح", page: "/intel/tenders/t-9/" }] } } } });
      P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "r" + i, arguments: { action: "search", query: "حديد" } });
      P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "r" + i, result: res });
      P.runTimers(60000); await tick(); await tick();
      assert.deepEqual([P.shown.length, P.fetches.length, P.screen.length], [0, 0, 0], "no list, no feed query, the screen stays: case " + i);
      assert.equal(P.steps[0][1], "fail", "case " + i);
    }
    const Q = page({ fetchMap: { "/api/intel/feed": { status: 200, body: { total: 0, items: [] } } } });
    Q.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "z1", arguments: { action: "search", query: "حديد" } });
    Q.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "z1", result: { ok: false, flags: ["login"], text: "x" } });
    await tick(); await tick();
    assert.equal(Q.fetches.length, 1, "another unreadable answer keeps the labelled feed fallback");
  });
  test("a screen that holds work is not replaced: the card offers the page in a new tab (desktop too)", async () => {
    const P = page({ busy: true });
    P.V.toolResult({ toolName: "bassem_intel", result: TOOL });
    assert.deepEqual(P.screen, [["/intel/projects/steel-x1/", null]], "asked once, without force — refused by JANNA_LIVE.show");
    const card = P.me.children.find(c => c.className === "bv-card");
    assert.ok(card && !card.hidden, "the card is shown on desktop when the screen was left as it is");
    assert.match(card.innerHTML, /افتحها في صفحة جديدة/);
    assert.match(card.innerHTML, /سيبت الشاشة زي ما هي/);
    assert.equal(P.timers.find(t => !t.done).ms, 40000);
  });
  test("phones: the card folds after 12 s", async () => {
    const P = page({ stackedLayout: true });
    P.V.toolResult({ toolName: "bassem_intel", result: TOOL });
    assert.ok(P.me.children.find(c => c.className === "bv-card"));
    assert.equal(P.timers.find(t => !t.done).ms, 12000);
  });
});

/* one result (owner 2026-11-19: «لما بقوله افتح الفرصة بيقولي مش لاقي التفاصيل»): worker-intel answers action item / doc with action set */
const ITEM = { action: "item", found: true, id: "rw0000000a1", count: 1, text: "طلب عرض أسعار «توريد كيماويات» من Rand Water في جنوب أفريقيا …",
  results: [{ id: "rw0000000a1", kind: "rfq", kind_label: "طلب عرض أسعار", title: "توريد كيماويات معالجة المياه", entity: "Rand Water", market: "africa:za", market_name: "جنوب أفريقيا", deadline: "2026-11-24", url: "https://www.etenders.gov.za/home/Download?blobName=a.pdf", page: "https://madeinegyptgate.com/intel/rfq/supply-of-chemicals-rw0000000a1/", open_url: "https://madeinegyptgate.com/intel/rfq/supply-of-chemicals-rw0000000a1/" }] };
const DOC = { ...ITEM, action: "doc", ok: true, doc: { type: "pdf", pages: 3, lang: "en", via: "ai", from: "official" }, sections: { found: ["شروط التأهيل", "آخر ميعاد"], missing: [] }, excerpt: "Bidders must be registered on the CSD…", text: "قريت مستند PDF الرسمي بتاع «توريد كيماويات» (٣ صفحات). فيه كلام عن: شروط التأهيل وآخر ميعاد." };
describe("bassem_intel one result: action item / doc", () => {
  test("item → its own page on the screen and its facts on the hologram; no feed fallback is ever armed", async () => {
    const P = page();
    P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "i1", arguments: { action: "item", id: "rw0000000a1" } });
    assert.equal(P.timers.length, 0, "no 8 s feed fallback for one item");
    P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "i1", result: JSON.stringify(ITEM) });
    assert.deepEqual(P.screen, [["/intel/rfq/supply-of-chemicals-rw0000000a1/", null]]);
    assert.equal(P.shown[0].title, "تفاصيل الفرصة"); assert.equal(P.shown[0].count, null);
    assert.deepEqual([...P.shown[0].items].map(x => x.title), ["توريد كيماويات معالجة المياه"]); /* spread: the array was made inside the sandbox */
    assert.match(P.shown[0].items[0].sub, /Rand Water · جنوب أفريقيا · آخر ميعاد/);
    P.runTimers(60000); await tick();
    assert.equal(P.fetches.length, 0, "never the feed");
  });
  test("doc → the hologram says what was read; the page already on the screen is never reloaded; a failure says why", async () => {
    const P = page({ framePath: "/intel/rfq/supply-of-chemicals-rw0000000a1/" });
    P.fire("tool-call-started", { toolName: "bassem_intel", toolCallId: "d1", arguments: { action: "doc", id: "rw0000000a1" } });
    P.runTimers(60000); await tick();
    assert.equal(P.fetches.length, 0, "a slow document read (> 8 s) never brings the feed list");
    P.fire("tool-call-completed", { toolName: "bassem_intel", toolCallId: "d1", result: DOC });
    assert.deepEqual(P.screen, [], "the item's page is already there");
    assert.equal(P.shown[0].title, "مستند الفرصة الرسمي");
    assert.deepEqual([P.shown[0].steps[1].text, P.shown[0].steps[1].state], ["قريت PDF — فيه: شروط التأهيل، آخر ميعاد", "done"]);
    const Q = page();
    Q.V.toolResult({ toolName: "bassem_intel", result: { ...DOC, ok: false, flags: ["login"], text: "المستند الرسمي ورا تسجيل دخول على بوابة الجهة، فمقدرتش أقراه؛ لازم حضرتك تسجّل. اللي عندي من صفحة الفرصة…" } });
    assert.equal(Q.shown[0].steps[1].state, "fail"); assert.match(Q.shown[0].steps[1].text, /^المستند الرسمي ورا تسجيل دخول/);
    assert.deepEqual(Q.screen, [["/intel/rfq/supply-of-chemicals-rw0000000a1/", null]], "not on the screen yet: its page opens");
  });
  test("not found → a failure step, no screen change; an English call opens the item's English twin", async () => {
    const P = page();
    P.V.toolResult({ toolName: "bassem_intel", result: { action: "item", found: false, count: 0, results: [], text: "مش موجودة" } });
    assert.deepEqual([P.screen.length, P.shown.length, P.steps[0][1]], [0, 0, "fail"]);
    const E = page({ lang: "en" });
    E.V.toolResult({ toolName: "bassem_intel", result: ITEM });
    assert.deepEqual(E.screen, [["/intel/en/rfq/supply-of-chemicals-rw0000000a1/", null]]);
    E.V.toolResult({ toolName: "bassem_intel", result: TOOL });
    assert.deepEqual(E.screen[1], ["/intel/en/projects/steel-x1/", null], "search results too");
  });
});

describe("market names", () => {
  test("every code the view knows has a name; lists are joined; unknown codes are never shown raw", () => {
    const P = page(), V = P.V;
    for (const [m, name] of [["sa", "السعودية"], ["ae", "الإمارات"], ["africa:ke", "كينيا"], ["asia:in", "الهند"], ["asia:tr", "تركيا"], ["gcc,africa", "الخليج وأفريقيا"]]) assert.equal(V.mkName(m), name, m);
    assert.equal(V.mkName("africa:zz"), "السوق اللي طلبته");
    const codes = new Set(Object.values(vm.runInNewContext("(" + SRC.match(/var MK = (\{[\s\S]*?\});/)[1] + ")")));
    assert.ok(codes.size > 20);
    for (const c of codes) assert.doesNotMatch(V.mkName(c), /^[a-z]{2}(:[a-z]{2})?$|السوق اللي طلبته/, c);
  });
  test("the fallback query maps the names the tool maps (first market of a list)", () => {
    const V = page().V;
    for (const [m, code] of [["الخليج العربي", "gcc"], ["السعوديه", "sa"], ["شرق آسيا", "asia"], [["gulf", "africa"], "gcc"], ["gulf, africa", "gcc"], ["الصين", "asia:cn"]]) assert.equal(V.feedParams({ action: "search", query: "حديد", market: m }).p.market, code, JSON.stringify(m));
  });
});

describe("bassem_save_profile → the result Bassem is given", () => {
  const ARGS = { products: ["حديد تسليح 3 مم"], capacity: "2000 طن" };
  test("saved → «اتسجّل في ملف مصنعك: …» (with what was cut)", async () => {
    const P = page({ fetchMap: { "/advisor/profile": { status: 200, body: { ok: true, profile: { products: ["حديد تسليح 3 مم"], capacity: "2000 طن" }, saved: ["products", "capacity"], clipped: ["products"] } } } });
    const r = await P.V.saveProfile(ARGS);
    assert.equal(r, "اتسجّل في ملف مصنعك: المنتجات، الطاقة الإنتاجية (اختصرت المنتجات علشان كانت أطول من المسموح).");
    assert.equal(JSON.parse(P.fetches[0].init.body).source, "bassem");
    assert.equal(P.fetches[0].init.headers.Authorization, "Bearer tok-1");
    assert.equal(P.shown[0].title, "باسم سجّل بيانات مصنعك");
  });
  test("refused / store off / too long → «ماتسجّلش: <why>.»; never «اتسجّل»", async () => {
    for (const [res, want] of [
      [{ status: 503, body: { code: "profile_store_off" } }, "ماتسجّلش: حفظ بيانات المصنع لسه مش متفعّل على المنصة."],
      [{ status: 400, body: { code: "too_long", field: "products", max: 120 } }, "ماتسجّلش: «المنتجات» أطول من المسموح (120 حرف)."],
      [{ status: 429, body: { code: "rate_limited" } }, "ماتسجّلش: تغييرات كتير ورا بعض — جرّب بعد شوية."],
      [{ status: 409, body: { code: "busy" } }, "ماتسجّلش: الملف اتغيّر في نفس اللحظة — جرّب تاني."],
    ]) {
      const P = page({ fetchMap: { "/advisor/profile": res } });
      assert.equal(await P.V.saveProfile(ARGS), want);
      assert.equal(P.shown[0].title, "بيانات مصنعك ماتسجّلتش");
    }
  });
  test("a refused platform session is tried once with Bassem's advisor token", async () => {
    const P = page({ tokens: ["tok-1", "adv-2"], fetchMap: { "/advisor/profile": (u, init) => (init.headers.Authorization === "Bearer adv-2" ? { status: 200, body: { ok: true, profile: ARGS, saved: ["products"] } } : { status: 403, body: { code: "plan" } }) } });
    assert.match(await P.V.saveProfile(ARGS), /^اتسجّل في ملف مصنعك: المنتجات\.$/);
    assert.equal(P.fetches.length, 2);
  });
  test("nothing to save → no request, «ماتسجّلش»; no answer within 12 s → «مش متأكد إنه اتسجّل»", async () => {
    const P = page();
    assert.match(await P.V.saveProfile({ products: [] }), /^ماتسجّلش: الطلب مافيهوش بيانات/);
    assert.equal(P.fetches.length, 0);
    const Q = page({ fetchMap: { "/advisor/profile": () => new Promise(() => {}) } });
    Q.win.fetch = () => new Promise(() => {});
    const pr = Q.V.saveProfile(ARGS);
    Q.runTimers(12000);
    assert.match(await pr, /^مش متأكد إنه اتسجّل/);
  });
});

describe("data/janna-live.js wiring (source checks)", () => {
  const run = LIVE_SRC.slice(LIVE_SRC.indexOf("function sdkRun("), LIVE_SRC.indexOf("function sdkPlay("));
  test("bassem_save_profile is registered with the SDK before the stream starts, and its handler returns the view's Promise", () => {
    const reg = run.indexOf('registerToolCallHandler("bassem_save_profile"'), stream = run.indexOf("streamToVideoElement(");
    assert.ok(reg > 0 && stream > reg, "registered before streamToVideoElement");
    assert.match(run, /onStart: function \(pl\) \{ return [^}]*profileTool\(pl && pl\.arguments\)/);
    assert.match(LIVE_SRC, /if \(name === "bassem_save_profile"\) \{ if \(LV && !LV\.closed && LV\.own && LV\.own\.bassem_save_profile\) return;/, "the DOM path does not save a second time");
  });
  test("TOOL_CALL_COMPLETED / FAILED are re-dispatched as DOM events with the result", () => {
    assert.match(run, /on\("TOOL_CALL_COMPLETED", function \(d\) \{[^\n]*sdkFire\("tool-call-completed", \{[^\n]*result: d\.result/);
    assert.match(run, /on\("TOOL_CALL_FAILED"[^\n]*sdkFire\("tool-call-failed"/);
  });
  test("the deal-room e-mail path keeps only an address of the open deal (no shape guessing); the screen is not replaced while busy", () => {
    assert.doesNotMatch(LIVE_SRC, /isFakeEmail/);
    assert.match(LIVE_SRC, /var known = dealMails\(d\);/);
    assert.match(LIVE_SRC, /if \(!\(o && o\.force\) && screenBusy\(\)\) return false;/);
  });
});
