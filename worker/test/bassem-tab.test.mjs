// node --test for «باسم معاك» (owner 2026-11-19: «لما بفتح المناقصة اللي باسم فاتحا بتفتح صفحة تانيه فيها جنة والمفروض ان باسم بس هو
// اللي بيكمل»): a page that leaves Bassem's live call opens in a tab of its own that is HIS — no Janna there, no second call, a bar back
// to the call (data/bassem-tab.js) — and the shared screen never shows Janna either. Browser files run in a vm sandbox with a fake page.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL("../../data/" + f, import.meta.url), "utf8");
const TAB = read("bassem-tab.js"), LIVE = read("janna-live.js"), WELCOME = read("janna-welcome.js"), JANNA = read("janna.js");
const BASSEM = read("bassem.js"), STAND = read("bassem-stand.js"), VIEW = read("bassem-intel-view.js");

/* ---------- the mark: window.name «mig-bassem-<ms>», ?with=bassem, sessionStorage "mig-wb" (4 h) — janna-live.js wbOn() ---------- */
function wbOnFrom(src, start, end) { const a = src.indexOf(start), b = src.indexOf(end, a); assert.ok(a > 0 && b > a, "wbOn() in the source"); return src.slice(a, b); }
function runWbOn({ name = "", search = "", ss = {}, now = Date.UTC(2026, 10, 19, 20, 0, 0) } = {}) {
  const store = Object.assign({}, ss), replaced = [];
  const win = { name };
  const ctx = vm.createContext({
    window: win, location: { pathname: "/tender-item/x/", search, hash: "#top" },
    history: { state: null, replaceState: (s, t, u) => replaced.push(u) },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } }, String
  });
  vm.runInContext(wbOnFrom(LIVE, "function wbOn() {", "var WB = wbOn();") + ";this.__r = wbOn();", ctx);
  return { on: ctx.__r, MIG_WB: win.MIG_WB, store, replaced };
}
const NOW = Date.UTC(2026, 10, 19, 20, 0, 0);

describe("the mark of Bassem's tab", () => {
  test("window.name «mig-bassem-<ms>» marks the tab and is kept for its next pages", () => {
    const r = runWbOn({ name: "mig-bassem-" + (NOW - 5000) });
    assert.equal(r.on, true); assert.equal(r.MIG_WB, true);
    assert.equal(r.store["mig-wb"], String(NOW - 5000), "the opening time, not a fresh one");
  });
  test("?with=bassem marks it too and is taken out of the address (other parameters and the hash stay)", () => {
    const r = runWbOn({ search: "?lang=en&with=bassem" });
    assert.equal(r.on, true);
    assert.deepEqual(r.replaced, ["/tender-item/x/?lang=en#top"]);
    assert.deepEqual(runWbOn({ search: "?with=bassem&q=1" }).replaced, ["/tender-item/x/?q=1#top"]);
    assert.deepEqual(runWbOn({ search: "?with=bassem" }).replaced, ["/tender-item/x/#top"]);
  });
  test("the tab's next pages: sessionStorage within 4 h → his; older, absent or another name → an ordinary page", () => {
    assert.equal(runWbOn({ ss: { "mig-wb": String(NOW - 3 * 3600e3) } }).on, true);
    assert.equal(runWbOn({ ss: { "mig-wb": String(NOW - 5 * 3600e3) } }).on, false);
    assert.equal(runWbOn({ name: "mig-bassem-" + (NOW - 5 * 3600e3) }).on, false);
    assert.equal(runWbOn({}).on, false);
    assert.equal(runWbOn({ name: "mig-call-123", search: "?without=bassem" }).on, false);
    assert.equal(runWbOn({ search: "?with=bassemx" }).on, false);
  });
  test("the same test in every file that must honour it (janna-live, janna-welcome, janna, bassem, bassem-stand)", () => {
    for (const [f, src] of [["janna-live.js", LIVE], ["janna-welcome.js", WELCOME], ["janna.js", JANNA], ["bassem.js", BASSEM], ["bassem-stand.js", STAND]]) {
      assert.ok(src.includes("/^mig-bassem-(\\d{12,14})$/"), f + ": window.name mark");
      assert.ok(src.includes("/[?&]with=bassem(?:&|$)/"), f + ": ?with=bassem");
      assert.ok(src.includes('"mig-wb"'), f + ": sessionStorage key");
      assert.ok(src.includes("now - t < 144e5"), f + ": 4 h at most");
      assert.ok(/MIG_WB === true \|\| W\.MIG_WB === false\) return W\.MIG_WB/.test(src), f + ": one decision per page (window.MIG_WB)");
    }
  });
});

describe("Bassem's tab honours it: no Janna, no second Bassem, no second call", () => {
  test("janna-welcome.js: no standing Janna / invitation, the «اسأل جنة» pill and buttons hidden, the bar loaded", () => {
    const i = WELCOME.indexOf("if (wbOn()) { wbStart(); return; }"), q = WELCOME.indexOf("var QUIET =");
    assert.ok(i > 0 && i < q, "before anything of her is built");
    assert.match(WELCOME, /#seoAsk,body \.ask-btn,body \[data-ask\]\{display:none!important\}/);
    assert.match(WELCOME, /"\/data\/bassem-tab\.js"/);
  });
  test("janna.js does not start (the kiosk excepted); bassem.js stays silent and out of sight; bassem-stand.js does not stand", () => {
    assert.match(JANNA, /if \(window\.__janna\) return;\s*\/\*[\s\S]*?\*\/\s*if \(!window\.JANNA_KIOSK && wbOn\(\)\) return;/);
    assert.match(BASSEM, /function speak\(text\) \{\s*stop\(\); if \(WB\) return;/);
    assert.match(BASSEM, /layout\(\); fire\(\);\s*if \(WB\) return;/);
    assert.match(BASSEM, /html\.mig-wb \.bs-fig,html\.mig-wb \.bs-mini,html\.mig-wb \.bs-bub,html\.mig-wb \.bs-wel\{display:none!important\}/);
    assert.match(STAND, /return W\.MIG_WB;\s*\}\)\(\)\) return;/);
  });
  test("janna-live.js: Janna's engine off, no «جنة لايف» pill, no call by itself, and open() brings the call's tab back instead", () => {
    assert.match(LIVE, /function wbStart\(\) \{\s*var de = document\.documentElement; de\.classList\.add\("mig-wb"\); window\.__janna = 1;/);
    assert.match(LIVE, /if \(!WB\) document\.body\.appendChild\(btn\);/);
    assert.match(LIVE, /if \(WB\) return; \/\* Bassem's tab: no call starts by itself here/);
    assert.match(LIVE, /function open\(o\) \{\s*o = [^\n]*\n\s*\/\*[^\n]*\*\/\n\s*if \(!ov && wbHold\(\)\) return;/);
  });
});

describe("nothing leaves Bassem's call by the side door (janna-live.js)", () => {
  test("«افتح الصفحة دي»: Bassem's call stays and the page opens in his tab; Janna's call keeps today's behaviour", () => {
    const go = LIVE.slice(LIVE.indexOf('ov.querySelector(".go").onclick'), LIVE.indexOf('ov.querySelector(".fsb")'));
    assert.match(go, /if \(persona === "bassem"\) \{[^\n]*openTab\(u\); return; \}/);
    assert.match(go, /close\(\); if \(u\) location\.href = u;/, "Janna: as before");
    assert.ok(go.indexOf("openTab(u)") < go.indexOf("close();"), "Bassem returns before close()");
  });
  test("openTab: window.name «mig-bassem-<ms>» + ?with=bassem, from the tap; files / API answers and other sites in a plain tab", () => {
    const f = LIVE.slice(LIVE.indexOf("function openTab(u) {"), LIVE.indexOf("function wbTell()"));
    assert.match(f, /var nm = "mig-bassem-" \+ new Date\(\)\.getTime\(\)/);
    assert.match(f, /window\.open\(a\.href, nm\)/);
    assert.match(f, /"with=bassem"/);
    assert.match(f, /\/\^\\\/\(api\|media\|data\|img\|assets\|_seo\)\\\/\//);
  });
  test("the shared screen: every document it shows gets the hidden widgets and the link guard (on load and before it)", () => {
    assert.match(LIVE, /var SCREEN_CSS = "[^"]*#seoAsk,\.ask-btn,\[data-ask\]\{display:none!important\}"/);
    assert.match(LIVE, /scrT = setInterval\(scrHook, 200\);/);
    assert.match(LIVE, /function onLoad\(\) \{\s*cmpGive\(""\); scrHook\(\);/);
    assert.match(LIVE, /clearInterval\(scrT\); scrT = 0; setTimeout\(wbTell, 0\);/, "stopped and Bassem's tabs told when the call closes");
  });
});

/* ---------- the bar (data/bassem-tab.js) in a fake page ---------- */
function el(tag) {
  const e = { tagName: String(tag).toUpperCase(), children: [], attrs: {}, hidden: false, textContent: "", className: "", style: {}, dir: "", lang: "",
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, contains() { return false; } };
  return e;
}
function tabPage({ lang = "ar", opener = undefined, wb = true, name = "mig-bassem-1795120000000" } = {}) {
  const store = { "mig-wb": "1795120000000" }, opened = [], timers = [];
  const body = el("body"), head = el("head"), html = el("html"); html.attrs.lang = lang;
  const doc = { body, head, documentElement: html, hidden: false, createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, hasFocus: () => true };
  const win = { MIG_WB: wb, name, opener, document: doc, addEventListener() {}, getComputedStyle: () => ({}), localStorage: { getItem: () => null },
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), removeItem: (k) => { delete store[k]; }, setItem: (k, v) => { store[k] = String(v); } },
    open: (u, n) => { opened.push([u, n]); return win.__answer ? win.__answer(u, n) : null; }, close() { win.closed = true; } };
  win.top = win;
  const ctx = vm.createContext({ window: win, document: doc, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, Math, String, Date });
  vm.runInContext(TAB, ctx);
  const bar = body.children.find((c) => c.className === "mig-wb-bar");
  const part = (cls) => bar && bar.children.find((c) => c.className === cls);
  return { win, doc, bar, part, store, opened, timers };
}
function callTab({ open = true, persona = "bassem" } = {}) {
  const w = { name: "", closed: false, focused: 0, welcomed: 0, JANNA_LIVE: { isOpen: () => open, persona: () => persona, welcomeBack() { w.welcomed++; return true; } }, focus() { w.focused++; } };
  return w;
}

describe("the bar «باسم معاك في الصفحة التانية — ارجع للمكالمة»", () => {
  test("only in Bassem's tab", () => {
    const P = tabPage({ wb: false });
    assert.equal(P.win.MIG_WB_TAB, undefined); assert.equal(P.bar, undefined);
  });
  test("live call in the tab it came from: the words, «ارجع للمكالمة», translate=no; English twin", () => {
    const P = tabPage({ opener: callTab() });
    assert.equal(P.win.MIG_WB_TAB.state(), "live");
    assert.equal(P.part("mwb-tx").textContent, "باسم معاك في الصفحة التانية");
    assert.match(P.part("mwb-go").textContent, /ارجع للمكالمة/);
    assert.equal(P.part("mwb-go").hidden, false);
    assert.equal(P.bar.attrs.translate, "no"); assert.equal(P.bar.dir, "rtl");
    const E = tabPage({ lang: "en", opener: callTab() });
    assert.equal(E.part("mwb-tx").textContent, "Bassem is with you in the other tab");
    assert.match(E.part("mwb-go").textContent, /Back to the call/);
    assert.equal(E.bar.dir, "ltr");
  });
  test("«ارجع للمكالمة» selects the call's tab by its own name from the tap — and never closes it", () => {
    const o = callTab(), P = tabPage({ opener: o });
    P.win.__answer = () => o; /* the browser answers the existing tab of that name */
    P.part("mwb-go").onclick();
    assert.match(o.name, /^mig-call-\d+$/, "the call's tab is named");
    assert.deepEqual(P.opened, [["", o.name]]);
    assert.equal(o.focused, 1); assert.equal(o.welcomed, 1, "the call's page shows its welcome back");
    assert.notEqual(o.closed, true);
  });
  test("a browser that made a blank tab instead: that tab is closed at once (the call's tab is untouched)", () => {
    const o = callTab(), P = tabPage({ opener: o }), blank = { closed: false, close() { this.closed = true; } };
    P.win.__answer = () => blank;
    P.part("mwb-go").onclick();
    assert.equal(blank.closed, true); assert.notEqual(o.closed, true);
  });
  test("still in front a moment later (no tab switch allowed): where the call is + «اقفل التاب دي»", () => {
    const P = tabPage({ opener: callTab() });
    P.win.__answer = (u, n) => P.win.opener;
    P.part("mwb-go").onclick();
    P.timers.filter((t) => t.ms === 650).forEach((t) => t.fn());
    assert.match(P.part("mwb-tx").textContent, /المكالمة مفتوحة في التاب اللي جيت منها/);
    assert.equal(P.part("mwb-cl").hidden, false); assert.equal(P.part("mwb-go").hidden, true);
  });
  test("the call is over (its tab closed, or no Bassem call there): said so, the mark dropped, his desk offered", () => {
    for (const o of [Object.assign(callTab(), { closed: true }), callTab({ open: false }), callTab({ persona: "janna" })]) {
      const P = tabPage({ opener: o });
      assert.equal(P.win.MIG_WB_TAB.state(), "ended");
      assert.equal(P.part("mwb-tx").textContent, "المكالمة مع باسم خلصت");
      assert.equal(P.store["mig-wb"], undefined, "the tab's next pages are ordinary ones");
      assert.equal(P.win.name, "", "window.name mark cleared");
      assert.equal(P.part("mwb-desk").hidden, false); assert.equal(P.part("mwb-desk").href, "/advisor/");
      assert.equal(P.part("mwb-go").hidden, true);
    }
  });
  test("no opener to ask (the mark came with the link itself, no «mig-bassem-<ms>» name): the words stay, the mark keeps its 4 h", () => {
    const P = tabPage({ opener: null, name: "" });
    assert.equal(P.win.MIG_WB_TAB.state(), "unknown");
    assert.equal(P.part("mwb-tx").textContent, "باسم معاك في الصفحة التانية");
    assert.equal(P.store["mig-wb"], "1795120000000");
  });
});

describe("the call's tab closed (the member ends the call by closing its tab; Chrome then reads window.opener as null)", () => {
  test("the bar: the call is over — said so, the mark dropped, his desk offered, this page's call buttons work again", () => {
    const P = tabPage({ opener: null });
    assert.equal(P.win.MIG_WB_TAB.update(), "ended");
    assert.equal(P.part("mwb-tx").textContent, "المكالمة مع باسم خلصت");
    assert.equal(P.store["mig-wb"], undefined); assert.equal(P.win.name, ""); assert.equal(P.win.MIG_WB, false);
    assert.equal(P.part("mwb-desk").hidden, false); assert.equal(P.part("mwb-go").hidden, true);
  });
  /* janna-live.js wbCall() / wbHold() in a vm: the opener gone + the tab's «mig-bassem-<ms>» name → "ended" (a call may start here);
     no name (the mark came with the link) → "unknown" and the call button brings the bar's back() instead */
  const fnOf = (start, end) => { const a = LIVE.indexOf(start), b = LIVE.indexOf(end, a); assert.ok(a > 0 && b > a, start); return LIVE.slice(a, b); };
  const HOLD = fnOf("function wbCall() {", "/* never a second call from his tab") + fnOf("function wbHold() {", "var btn = document.createElement");
  function hold({ name = "mig-bassem-1795120000000", opener = null, MIG_WB = true, bar = null } = {}) {
    const store = { "mig-wb": "1795120000000" }, win = { name, opener, MIG_WB, MIG_WB_TAB: bar };
    const ctx = vm.createContext({ window: win, sessionStorage: { getItem: (k) => (k in store ? store[k] : null), removeItem: (k) => { delete store[k]; } }, String });
    vm.runInContext("var WB = true;\n" + HOLD + ";this.__c = wbCall(); this.__h = wbHold(); this.__wb = WB;", ctx);
    return { call: ctx.__c, held: ctx.__h, WB: ctx.__wb, win, store };
  }
  test("janna-live.js: its call's tab closed → \"ended\", the mark dropped, a call may start here", () => {
    const r = hold();
    assert.equal(r.call, "ended"); assert.equal(r.held, false); assert.equal(r.WB, false); assert.equal(r.win.MIG_WB, false);
    assert.equal(r.store["mig-wb"], undefined); assert.equal(r.win.name, "");
  });
  test("janna-live.js: the bar already said the call is over (window.MIG_WB false) → the call button works", () => {
    assert.equal(hold({ name: "", MIG_WB: false }).held, false);
  });
  test("janna-live.js: no opener and no name (the mark came with the link) → held: the bar's back() instead of a second call", () => {
    let backs = 0;
    const r = hold({ name: "", bar: { back() { backs++; } } });
    assert.equal(r.call, "unknown"); assert.equal(r.held, true); assert.equal(backs, 1);
  });
  test("janna-live.js: the call is still live in its tab → held, the call's tab comes back", () => {
    let backs = 0;
    const o = callTab(), r = hold({ opener: o, bar: { back() { backs++; } } });
    assert.equal(r.call, "live"); assert.equal(r.held, true); assert.equal(backs, 1);
  });
});

describe("the results card's «افتحها في صفحة جديدة» (data/bassem-intel-view.js)", () => {
  test("goes through JANNA_LIVE.openTab (Bassem's tab) when the call page has it, else a plain new tab as before", () => {
    const btn = VIEW.slice(VIEW.indexOf("if (mb) mb.onclick"), VIEW.indexOf("return c;", VIEW.indexOf("if (mb) mb.onclick")));
    assert.match(btn, /if \(JL\.openTab\) JL\.openTab\(o\.more\); else \{ try \{ W\.open\(o\.more, "_blank", "noopener"\); \} catch \(e\) \{\} \}/);
  });
});
