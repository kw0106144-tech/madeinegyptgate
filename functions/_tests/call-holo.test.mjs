// node --test for the holo cards on the live call's video (data/call-holo.js; owner 2026-11-20, in his call with Janna: «المفروض وهي
// بتقول أنا ببحث عن مناقصة او فرصة يظهر ده»). The real file runs in a vm sandbox with a small fake DOM (the call's .jnl-sdk stage, its
// video, AI label and control bar), and the tool events reach it the way they do in a call: through data/janna-live.js's own sdkTool /
// sdkFire (sliced from the file), as anam-agent:* CustomEvents dispatched on .jnl-sdk and heard on the document in the capture phase.
// Results are the Worker's real answer shapes (janna_lookup's lean POST answer, bassem_intel, platform_item). Fake clock and timers.
// In functions/_tests so it gates deploy-site, which ships data/*.js.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../data/call-holo.js", import.meta.url), "utf8");
const LIVE = readFileSync(new URL("../../data/janna-live.js", import.meta.url), "utf8");
const HOLO = readFileSync(new URL("../../data/holo.js", import.meta.url), "utf8");
const BIV = readFileSync(new URL("../../data/bassem-intel-view.js", import.meta.url), "utf8");
const BLT = readFileSync(new URL("../../data/bassem-live-tools.js", import.meta.url), "utf8");
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); assert.ok(i > 0 && j > i, a); return src.slice(i, j); };
const fn = (src, name) => cut(src, "  function " + name + "(", "\n  }\n") + "\n  }\n";

/* ---------- a small DOM: elements with classes, attributes, children, listeners, rectangles ---------- */
class El {
  constructor(tag, doc) { this.tagName = String(tag).toUpperCase(); this.doc = doc; this.children = []; this.attrs = {}; this.style = {}; this.className = ""; this.innerHTML = ""; this.textContent = ""; this.hidden = false; this.parentNode = null; this.listeners = {}; this.rect = null; this.dir = ""; }
  get classList() { const el = this; return { add: c => { if (!el.has(c)) el.className = (el.className + " " + c).trim(); }, remove: c => { el.className = el.className.split(/\s+/).filter(x => x && x !== c).join(" "); }, contains: c => el.has(c), toggle: (c, on) => { (on === undefined ? !el.has(c) : on) ? el.classList.add(c) : el.classList.remove(c); } }; }
  has(c) { return this.className.split(/\s+/).indexOf(c) > -1; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i > -1) this.children.splice(i, 1); c.parentNode = null; return c; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  /* simple selectors: tag, .class, tag.class, [attr="v"] and descendant chains of those */
  matches(sel) { return sel.split(",").some(s => this.match1(s.trim())); }
  match1(s) {
    const m = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)((?::not\(\[hidden\]\))?)$/i.exec(s); if (!m) return false;
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    for (const c of (m[2] || "").split(".").filter(Boolean)) if (!this.has(c)) return false;
    for (const a of (m[3] || "").match(/\[[^\]]+\]/g) || []) { const [, k, v] = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(a); if (v === undefined ? this.getAttribute(k) == null : this.getAttribute(k) !== v) return false; }
    if (m[4] && this.hidden) return false;
    return true;
  }
  all() { const out = []; (function walk(e) { for (const c of e.children) { out.push(c); walk(c); } })(this); return out; }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/), last = parts.pop();
    return this.all().filter(e => { if (!e.matches(last)) return false; let up = e.parentNode, i = parts.length - 1; while (i >= 0 && up && up !== this.parentNode) { if (up.matches && up.matches(parts[i])) i--; up = up.parentNode; } return i < 0; });
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(n, f, o) { (this.listeners[n] = this.listeners[n] || []).push({ f, capture: o === true || !!(o && o.capture) }); }
  removeEventListener() {}
  getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, width: 0, height: 0 }; return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height }; }
  get clientWidth() { return this.rect ? this.rect.width : 0; }
  get clientHeight() { return this.rect ? this.rect.height : 0; }
  /* an event dispatched here: the document's capture listeners first, then this element's, then the bubbling ones (as a browser does) */
  dispatchEvent(ev) {
    ev.target = this; const doc = this.doc;
    for (const l of doc.listeners[ev.type] || []) if (l.capture) l.f(ev);
    for (const l of this.listeners[ev.type] || []) l.f(ev);
    if (ev.bubbles) for (const l of doc.listeners[ev.type] || []) if (!l.capture) l.f(ev);
    return true;
  }
  set id(v) { this._id = v; } get id() { return this._id || ""; }
}
/* the clock and the timers the file schedules */
function clockOf() {
  const c = { t: 1_800_000_000_000, q: [], n: 0 };
  const RealDate = Date;
  c.Date = function (...a) { return a.length ? new RealDate(...a) : new RealDate(c.t); }; c.Date.now = () => c.t;
  c.setTimeout = (f, ms) => { const id = ++c.n; c.q.push({ id, at: c.t + (+ms || 0), f }); return id; };
  c.setInterval = (f, ms) => { const id = ++c.n; c.q.push({ id, at: c.t + (+ms || 0), f, every: +ms || 1 }); return id; };
  c.clearTimeout = c.clearInterval = id => { c.q = c.q.filter(x => x.id !== id); };
  c.advance = ms => { const end = c.t + ms; for (;;) { c.q.sort((a, b) => a.at - b.at); const x = c.q[0]; if (!x || x.at > end) break; c.t = x.at; if (x.every) x.at += x.every; else c.q.shift(); x.f(); } c.t = end; };
  return c;
}
/* a page with the call open: viewport, persona, language, stacked layout; the chips and the hologram are optional obstacles */
const PHONE = { w: 390, h: 844, stage: { left: 10, top: 82, width: 370, height: 694 }, ai: { left: 154, top: 94, width: 214, height: 30 }, ctl: { left: 10, top: 710, width: 370, height: 66 }, stacked: true };
const DESK = { w: 1280, h: 800, stage: { left: 426, top: 103, width: 840, height: 600 }, ai: { left: 1040, top: 115, width: 214, height: 30 }, ctl: { left: 426, top: 637, width: 840, height: 66 }, stacked: false };
/* a phone on its side (844×390): a 360×240 stage, no shelf under the chin — the header gets a narrow wall beside the head */
const LAND = { w: 844, h: 390, stage: { left: 470, top: 79, width: 360, height: 240 }, ai: { left: 604, top: 91, width: 214, height: 30 }, ctl: { left: 470, top: 253, width: 360, height: 66 }, stacked: false };
function page({ vp = PHONE, persona = "janna", lang = "ar", holoOff, flags, speaking = false, screenWork = false, dict } = {}) {
  const C = clockOf(), doc = { listeners: {} };
  const mk = t => new El(t, doc);
  doc.createElement = mk; doc.head = mk("head"); doc.documentElement = mk("html"); doc.body = mk("body"); doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  doc.addEventListener = (n, f, o) => { (doc.listeners[n] = doc.listeners[n] || []).push({ f, capture: o === true || !!(o && o.capture) }); };
  doc.querySelector = s => doc.documentElement.querySelector(s); doc.querySelectorAll = s => doc.documentElement.querySelectorAll(s);
  doc.getElementById = id => doc.documentElement.all().find(e => e.id === id) || null;
  /* the call overlay: .jnl[data-mode=sdk] > .jnl-me > .v > .jnl-sdk(video, .jv-ai, .jv-ctl, .jv-st) */
  const ov = mk("div"); ov.className = "jnl"; ov.setAttribute("data-mode", "sdk"); doc.body.appendChild(ov);
  const me = mk("aside"); me.className = "jnl-me"; ov.appendChild(me); const v = mk("div"); v.className = "v"; me.appendChild(v);
  const bx = mk("div"); bx.className = "jnl-sdk"; bx.setAttribute("data-state", "live"); bx.rect = vp.stage; v.appendChild(bx);
  const vid = mk("video"); vid.videoWidth = 1152; vid.videoHeight = 768; bx.appendChild(vid);
  const ai = mk("div"); ai.className = "jv-ai"; ai.rect = vp.ai; bx.appendChild(ai);
  const st = mk("div"); st.className = "jv-st"; bx.appendChild(st);
  const ctl = mk("div"); ctl.className = "jv-ctl"; ctl.rect = vp.ctl; bx.appendChild(ctl);
  const calls = { showCard: [], show: [] };
  const win = { MIGLANG: lang, location: { search: "", hash: "" }, listeners: {},
    addEventListener(n, f) { (win.listeners[n] = win.listeners[n] || []).push(f); }, dispatchEvent(ev) { for (const f of win.listeners[ev.type] || []) f(ev); return true; },
    matchMedia: () => ({ matches: vp.stacked }), getComputedStyle: () => ({ objectPosition: "50% 30%", display: "block", visibility: "visible", opacity: "1" }),
    JANNA_LIVE: { persona: () => persona, speaking: () => !!win.__speaking, showCard: p => { calls.showCard.push(p); return true; }, show: p => { calls.show.push(p); return true; } } };
  win.__speaking = speaking;
  if (holoOff !== undefined) win.JANNA_LIVE_HOLO = holoOff;
  if (flags) win.MIGFLAGS = { on: k => (k in flags ? flags[k] : true) };
  if (dict) win.MIGTR = s => (Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s); /* data/i18n.js on English pages: exact dictionary matches */
  win.window = win; win.document = doc;
  const ctx = { window: win, document: doc, Date: C.Date, setTimeout: C.setTimeout, clearTimeout: C.clearTimeout, setInterval: C.setInterval, clearInterval: C.clearInterval, Intl, JSON, Math, String, Object, Array, RegExp, isFinite, parseFloat, parseInt, Number,
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; this.bubbles = !!(o && o.bubbles); } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  /* data/janna-live.js's own path for the SDK's events: sdkTool (one call = one action) → sdkFire (anam-agent:* on .jnl-sdk) */
  ctx.sdkBox = () => bx;
  vm.runInContext(fn(LIVE, "sdkFire") + fn(LIVE, "sdkTool"), ctx);
  const LV = { seen: {} };
  const P = { C, win, doc, bx, ov, calls, H: win.MIG_CALL_HOLO,
    /* TOOL_CALL_STARTED as the SDK reports it: a server webhook's arguments nested in bodyParams */
    start: (name, args, id, type) => { const server = type ? type === "server" : !/^(janna_search|bassem_open_item|bassem_open_opportunity)$/.test(name); ctx.sdkTool(LV, name, server ? "server" : "client", server ? { bodyParams: args } : args, id); },
    /* TOOL_CALL_COMPLETED → janna-live.js: sdkFire("tool-call-completed", {toolName, toolType, toolSubtype, toolCallId, result, executionTime}) — result = the webhook's JSON text */
    done: (name, id, result, type) => ctx.sdkFire("tool-call-completed", { toolName: name, toolType: type || "server", toolSubtype: "", toolCallId: id, result: result == null ? null : typeof result === "string" ? result : JSON.stringify(result), executionTime: 300 }),
    fail: (name, id) => ctx.sdkFire("tool-call-failed", { toolName: name, toolType: "server", toolCallId: id, errorMessage: "timeout" }),
    end: () => ctx.sdkFire("session-ended", { sessionId: "s1", reason: "normal" }),
    layer: () => bx.querySelector(".jv-holo"),
    card: k => { const l = bx.querySelector(".jv-holo"); return l ? l.children.find(c => c.getAttribute("data-k") === k) || null : null; },
    cards: () => { const l = bx.querySelector(".jv-holo"); return l ? l.children.filter(c => c.getAttribute("data-k") && !/^dbg/.test(c.getAttribute("data-k"))) : []; },
    rectOf: el => ({ l: parseFloat(el.style.left), t: parseFloat(el.style.top), r: parseFloat(el.style.left) + parseFloat(el.style.width), b: parseFloat(el.style.top) + parseFloat(el.style.height) }),
    click: (target, o) => { const l = bx.querySelector(".jv-holo"); let prevented = false; const ev = Object.assign({ target, button: 0, preventDefault() { prevented = true; } }, o || {}); for (const x of l.listeners.click || []) x.f(ev); return prevented; } };
  return P;
}
/* the Worker's real answers (worker/src/index.js search → leanLookup; janna-item.js findItem; worker-intel tool) for the owner's kind of search */
const FACTORIES = { section: "factories", query: "كاوتش", count: 10, page: 1, pages: 2, has_more: true, text: "لقيت 10 مصانع… قولي اسم المصنع وماتقرأش اللينكات.",
  results: [
    { name: "شركة القاهرة للكاوتشوك والبلاستيك (جورج خلف وشركاه)", type: "مصنع", activity: "الغزل والنسيج والملابس الجاهزة", location: "القاهرة", products: "", id: "981", section: "factories", governorate: "القاهرة", open_url: "https://madeinegyptgate.com/factories/شركة-القاهرة-للكاوتشوك-والبلاستيك-جو/" },
    { name: "شركة النصر لمنتجات الكاوتشوك (ناروبين)", type: "مصنع", activity: "الكيماويات والبتروكيماويات", location: "القليوبية", products: "", id: "1008", section: "factories", governorate: "القليوبية", verified: true, open_url: "https://madeinegyptgate.com/factories/شركة-النصر-لمنتجات-الكاوتشوك-ناروبين/" }] };
const TENDERS = { section: "tenders", query: "كاوتش", market: "local", count: 11, page: 1, pages: 2, has_more: true, text: "…",
  results: [{ type: "مناقصة عامة", status: "غير محدد الموعد", title: "عملية توريد فلاتر وزيوت وكاوتش", entity: "جهة حكومية", governorate: "غير محددة", activity: "السيارات والصناعات المغذية", deadline: "", id: "TND-31214", open_url: "https://madeinegyptgate.com/tender-item/عملية-توريد-فلاتر-وزيوت-وكاوتش/", market: "local" }] };
const NONE = s => ({ section: s, query: "سلندرات", count: 0, page: 1, pages: 1, has_more: false, results: [], text: "مفيش نتايج مطابقة… ماتخترعيش نتايج." });
const INTEL = { count: 1, days: 30, market: "all", widened: null, text: "لقيت فرصة واحدة …",
  results: [{ id: "0w6336qzm9s", kind: "tender_gov", kind_label: "مناقصة حكومية", title: "مواد وأعمال صيانة باب رولر - خدمات بناء ليدز", title_ar: "مواد وأعمال صيانة باب رولر - خدمات بناء ليدز", entity: "Leeds City Council", market: "eu", market_name: "أوروبا", country: "United Kingdom", deadline: "2026-12-03", status: "open", value: 50000, currency: "GBP", url: "https://www.find-tender.service.gov.uk/Notice/109626-2026", page: "https://madeinegyptgate.com/intel/tenders/roller-shutter-materials-repairs-leeds-building-services-0w6336qzm9s/", open_url: "https://madeinegyptgate.com/intel/tenders/roller-shutter-materials-repairs-leeds-building-services-0w6336qzm9s/" }] };
const ITEM = { found: true, section: "tenders", id: "intl-MZ-EDM-554194-GO-RFB", ref: "MZ-EDM-554194-GO-RFB", title: "توريد عوازل كهربائية لشبكات التوزيع", title_en: "Supply of Insulators", type: "جهة حكومية", entity: "شركة كهرباء موزمبيق (EDM)", entity_en: "Electricidade de Moçambique (EDM)", market: "africa", country: "موزمبيق", country_en: "Mozambique", status: "سارية", deadline: "2027-01-12", open_url: "https://madeinegyptgate.com/tender-item/%D8%AA%D9%88%D8%B1%D9%8A%D8%AF/", contact: "التقديم الرسمي عند الجهة نفسها …", text: "قولي الجهة والموعد بس." };
const html = el => String(el && el.innerHTML || "");

describe("the searching card appears at once on TOOL_CALL_STARTED (a real tool call, never her words)", () => {
  test("janna_lookup (server: nested bodyParams) + janna_search (client) for the same words = ONE row: «بدوّر على» + the words + the section, a scanning line", () => {
    const P = page();
    P.start("janna_lookup", { query: "سلندرات", section: "tenders" }, "l1");
    P.start("janna_search", { query: "سلندرات", section: "tenders" }, "s1");
    const head = P.card("head"); assert.ok(head, "the header card is on the video at once");
    assert.ok(P.bx.contains(P.layer()), "inside the call's stage (.jnl-sdk): it scrolls / goes full screen with the video");
    assert.match(head.className, /\bjvh-s\b/);
    assert.match(html(head), /بدوّر على/); assert.match(html(head), /سلندرات/); assert.match(html(head), /مناقصات/);
    assert.match(html(head), /class="jvh-sw"/, "the scanning light / line");
    assert.equal(P.H.state().rows.length, 1, "lookup + search with the same words: one row");
    assert.equal(P.cards().length, 1, "no result card before a result");
    P.C.advance(6500);
    assert.match(html(P.card("head")), /لسه مستنية الرد/, "Janna speaks as a woman while it waits");
  });
  test("Bassem speaks as a man; bassem_intel: «فرص» + its market; a search card for bassem_open_item only when it carries words", () => {
    const P = page({ persona: "bassem" });
    P.start("bassem_intel", { action: "search", query: "rollers", market: "gcc", days: 30 }, "i1");
    assert.match(html(P.card("head")), /rollers/); assert.match(html(P.card("head")), /فرص في الخليج/);
    P.C.advance(6500); assert.match(html(P.card("head")), /لسه مستني الرد/);
    assert.equal(P.H.owns("bassem_open_item", { section: "tenders", index: 2 }), false, "«التانية» (no words): the hologram's");
    assert.equal(P.H.owns("bassem_open_item", { section: "tenders", title: "توريد كابلات" }), true);
    assert.equal(P.H.owns("bassem_intel", { bodyParams: { action: "doc", id: "0w6336qzm9s" } }), false, "its official document stays the hologram's");
    assert.equal(P.H.owns("bassem_open_opportunity", { query: "حديد" }), true);
  });
  test("no SDK call (the widget), cards switched off (JANNA_LIVE_HOLO = 0, «🛠️ المطوّر» call_holo), or a tool that is not a search: nothing", () => {
    for (const o of [{ holoOff: 0 }, { flags: { call_holo: false } }]) {
      const P = page(o); P.start("janna_lookup", { query: "حديد", section: "factories" }, "x1");
      assert.equal(P.layer(), null, JSON.stringify(o)); assert.equal(P.H.owns("janna_lookup", { query: "حديد", section: "factories" }), false);
    }
    const P = page(); P.start("janna_navigate", { page: "tenders" }, "n1"); P.start("janna_fill_rfq", { product: "x" }, "f1");
    assert.equal(P.layer(), null);
    P.ov.setAttribute("data-mode", "widget"); P.start("janna_lookup", { query: "حديد", section: "factories" }, "x2");
    assert.equal(P.layer(), null, "the widget fallback reports no results: no cards there");
  });
});

describe("result cards on TOOL_CALL_COMPLETED: only what the tool returned", () => {
  test("janna_lookup: a count per section and up to 3 cards (title · entity / company · ONE key fact), each opening its own page on the screen", () => {
    const P = page();
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.start("janna_lookup", { query: "كاوتش", section: "tenders" }, "l2"); P.start("janna_search", { query: "كاوتش", section: "factories" }, "s1");
    P.done("janna_search", "s1", null, "client"); P.done("janna_lookup", "l1", FACTORIES); P.done("janna_lookup", "l2", TENDERS);
    const head = P.card("head"), r = P.cards().filter(c => /^r\d$/.test(c.getAttribute("data-k")));
    /* a phone: the corner beside the AI label is narrow (132 px) — the count and each section's icon, never «لقيت» squeezed to «ل…» */
    assert.match(html(head), /21 نتيجة/, "10 + 11, the tools' own counts"); assert.match(html(head), /🏭 10 · 📄 11/); assert.doesNotMatch(html(head), /لقيت/);
    const Dk = page({ vp: DESK }); Dk.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); Dk.start("janna_lookup", { query: "كاوتش", section: "tenders" }, "l2"); Dk.done("janna_lookup", "l1", FACTORIES); Dk.done("janna_lookup", "l2", TENDERS);
    assert.match(html(Dk.card("head")), /لقيت/); assert.match(html(Dk.card("head")), /مصانع: 10 · مناقصات: 11/, "a wide header: the sections' words");
    assert.equal(r.length, 3, "three result cards");
    assert.match(html(r[0]), /شركة القاهرة للكاوتشوك/); assert.match(html(r[0]), /📍 القاهرة/);
    assert.match(html(r[1]), /عملية توريد فلاتر وزيوت وكاوتش/); assert.match(html(r[1]), /غير محدد الموعد/, "the tool's own status: no deadline is never made up");
    assert.match(html(r[2]), /شركة النصر لمنتجات الكاوتشوك/, "one from each section in turn"); assert.match(html(r[2]), /✓ موثّق/, "verified:true only");
    assert.doesNotMatch(html(r[0]), /موثّق/, "an unverified row carries no badge");
    assert.equal(r[0].tagName, "A"); assert.equal(r[0].getAttribute("href"), "/factories/شركة-القاهرة-للكاوتشوك-والبلاستيك-جو/", "this site's path only");
    for (const c of P.cards()) assert.doesNotMatch(html(c), /ماتقرأش|ماتخترعيش|اللينكات/, "the tool's `text` (its instructions to the LLM) is never shown");
    assert.doesNotMatch(html(r[1]), /غير محددة/, "«غير محددة» is no place");
  });
  test("bassem_intel in Janna's call: the opportunity, its buyer, the deadline; its page on the Information Center (English: /intel/en/)", () => {
    const P = page();
    P.start("bassem_intel", { action: "search", query: "rubber", days: 30 }, "i1"); P.done("bassem_intel", "i1", INTEL);
    const r0 = P.card("r0");
    assert.match(html(r0), /مواد وأعمال صيانة باب رولر/); assert.match(html(r0), /مناقصة حكومية/); assert.match(html(r0), /3 ديسمبر 2026/);
    assert.equal(r0.getAttribute("href"), "/intel/tenders/roller-shutter-materials-repairs-leeds-building-services-0w6336qzm9s/");
    assert.doesNotMatch(html(r0), /find-tender\.service/, "the official link of another site is never the card's");
    const E = page({ lang: "en", vp: DESK });
    E.start("bassem_intel", { action: "search", query: "rubber" }, "i1"); E.done("bassem_intel", "i1", INTEL);
    assert.equal(E.card("r0").getAttribute("href"), "/intel/en/tenders/roller-shutter-materials-repairs-leeds-building-services-0w6336qzm9s/");
    assert.match(html(E.card("r0")), /Government tender/); assert.match(html(E.card("r0")), /Leeds City Council/); assert.match(html(E.card("r0")), /Deadline 3 December 2026/);
    const F = page(); F.start("bassem_intel", { action: "search", query: "x" }, "i9"); F.done("bassem_intel", "i9", { ok: false, flags: ["busy"], text: "لحظة واحدة…" });
    assert.match(html(F.card("head")), /البحث ده ماكملش/, "a refused call is said as it is");
  });
  test("platform_item: ONE card with the item's key fields (no header); not found → «مالقيتش»", () => {
    const P = page({ vp: DESK });
    P.start("platform_item", { section: "tenders", id: ITEM.id }, "p1"); assert.match(html(P.card("head")), /بفتحلك/);
    P.done("platform_item", "p1", ITEM);
    assert.equal(P.card("head"), null, "one item: its own card says it all");
    const c = P.card("r0"); assert.match(html(c), /توريد عوازل كهربائية لشبكات التوزيع/); assert.match(html(c), /شركة كهرباء موزمبيق/); assert.match(html(c), /12 يناير 2027/); assert.match(html(c), /سارية/); assert.match(html(c), /موزمبيق/);
    assert.match(html(c), /مناقصة/); assert.doesNotMatch(html(c), /جهة حكومية/, "platform_item's type is the buyer's kind, never the card's tag");
    assert.doesNotMatch(html(c), /التقديم الرسمي|قولي/, "contact / text are never shown");
    const E = page({ vp: DESK, lang: "en" }); E.start("platform_item", { section: "tenders", id: ITEM.id }, "p1"); E.done("platform_item", "p1", ITEM);
    assert.match(html(E.card("r0")), /Supply of Insulators/); assert.match(html(E.card("r0")), /Electricidade de Moçambique/); assert.match(html(E.card("r0")), /Mozambique/);
    const N = page(); N.start("platform_item", { section: "rfqs", title: "x" }, "p2"); N.done("platform_item", "p2", { found: false, section: "rfqs", text: "…" });
    assert.match(html(N.card("head")), /مالقيتش نتايج مطابقة/);
  });
  test("nothing found: one card «مالقيتش نتايج مطابقة لـ «…»» that fades after 6 s", () => {
    const P = page();
    P.start("janna_lookup", { query: "سلندرات", section: "tenders" }, "l1"); P.start("janna_lookup", { query: "سلندرات", section: "rfqs" }, "l2");
    P.done("janna_lookup", "l1", NONE("tenders")); P.done("janna_lookup", "l2", NONE("rfqs"));
    const h = P.card("head"); assert.match(html(h), /مالقيتش نتايج مطابقة/); assert.match(html(h), /لـ «سلندرات»/); assert.match(html(h), /مناقصات · طلبات أسعار/);
    assert.equal(P.cards().length, 1);
    P.C.advance(5000); assert.ok(P.card("head"), "still there at 5 s");
    P.C.advance(2000); assert.match(P.card("head") ? P.card("head").className : "out", /\bout\b/, "fading at 6 s");
    P.C.advance(1000); assert.equal(P.cards().length, 0, "gone");
  });
  test("a failed / unanswered call is said as it is; contacts in a result never reach the card", () => {
    const P = page();
    P.start("janna_lookup", { query: "حديد", section: "factories" }, "l1"); P.fail("janna_lookup", "l1");
    assert.match(html(P.card("head")), /البحث ده ماكملش/);
    const Q = page(); Q.start("janna_lookup", { query: "حديد", section: "factories" }, "l1"); Q.C.advance(21000);
    assert.match(html(Q.card("head")), /البحث ده ماكملش/, "no answer in 20 s");
    Q.done("janna_lookup", "l1", FACTORIES); assert.ok(Q.card("r0"), "a late answer still shows"); assert.doesNotMatch(html(Q.card("head")), /ماكملش|مفيش رد/);
    const S = page();
    S.start("janna_lookup", { query: "حديد", section: "factories" }, "l1");
    S.done("janna_lookup", "l1", { section: "factories", query: "حديد", count: 1, results: [{ name: "مصنع الحديد sales@steel-eg.com 01012345678", activity: "تليفون 0223456789 واتساب +20 100 123 4567", governorate: "الجيزة", section: "factories", open_url: "https://madeinegyptgate.com/factories/x/" }] });
    const c = html(S.card("r0")); assert.match(c, /مصنع الحديد/); assert.doesNotMatch(c, /@|01012345678|0223456789|\+20/);
  });
});

describe("behaviour: replaced by a new search, the fade, the tap, the end of the call", () => {
  test("a new search (a later step) replaces the cards; a completion of the old one changes nothing", () => {
    const P = page();
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.done("janna_lookup", "l1", FACTORIES);
    assert.ok(P.card("r0"));
    P.C.advance(4000); P.start("janna_lookup", { query: "سلندرات", section: "tenders" }, "l2");
    assert.equal(P.card("r0"), null, "the old results are gone"); assert.match(html(P.card("head")), /بدوّر على/); assert.match(html(P.card("head")), /سلندرات/);
    P.done("janna_lookup", "l1", FACTORIES); assert.equal(P.card("r0"), null, "the old call's late answer is not this group's");
    P.done("janna_lookup", "l2", NONE("tenders")); assert.match(html(P.card("head")), /مالقيتش/);
  });
  test("the results fade 30 s after they came, the countdown waits while the persona speaks (75 s at most)", () => {
    const P = page();
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.done("janna_lookup", "l1", FACTORIES);
    P.C.advance(29000); assert.ok(P.card("r0") && !/\bout\b/.test(P.card("r0").className), "still up at 29 s");
    P.C.advance(2500); assert.ok(!P.card("r0") || /\bout\b/.test(P.card("r0").className), "fading after 30 s"); P.C.advance(1000); assert.equal(P.cards().length, 0);
    const S = page({ speaking: true });
    S.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); S.done("janna_lookup", "l1", FACTORIES);
    S.C.advance(50000); assert.ok(S.card("r0") && !/\bout\b/.test(S.card("r0").className), "she is still talking about them at 50 s");
    S.C.advance(27000); assert.equal(S.cards().filter(c => !/\bout\b/.test(c.className)).length, 0, "75 s at most");
    const Q = page({ speaking: true }); Q.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); Q.done("janna_lookup", "l1", FACTORIES);
    Q.C.advance(28000); Q.win.__speaking = false; Q.C.advance(4000);
    assert.ok(Q.card("r0") && !/\bout\b/.test(Q.card("r0").className), "she talked about them until 28 s: still up at 32 s");
    Q.C.advance(3500); assert.ok(!Q.card("r0") || /\bout\b/.test(Q.card("r0").className), "a few seconds after her speech ended");
  });
  test("a tap on a result opens its page on the shared screen (JANNA_LIVE.showCard) and never navigates this tab; a modified click is left to the page; ✕ hides", () => {
    const P = page();
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.done("janna_lookup", "l1", FACTORIES);
    const a = P.card("r0"), inner = new El("b", P.doc); a.appendChild(inner);
    assert.equal(P.click(inner), true, "the browser's own navigation is prevented");
    assert.deepEqual(P.calls.showCard, ["/factories/شركة-القاهرة-للكاوتشوك-والبلاستيك-جو/"]);
    assert.equal(P.click(inner, { ctrlKey: true }), false, "ctrl / ⌘ / middle click: janna-live.js topClick (a new tab, Bassem's own tab)");
    assert.equal(P.calls.showCard.length, 1);
    const x = P.card("head"), btn = new El("button", P.doc); btn.className = "jvh-x"; x.appendChild(btn);
    P.click(btn); P.C.advance(400); assert.equal(P.cards().length, 0, "✕ hides the cards");
    P.C.advance(2000); P.start("janna_lookup", { query: "حديد", section: "factories" }, "l3"); assert.ok(P.card("head"), "the next search shows again");
  });
  test("while the cards are up no page scene of data/holo.js goes over them (a page she only talks about, 25 s later); the tap is remembered", () => {
    const P = page();
    assert.equal(P.H.owns("janna_navigate", { page: "market" }), false, "no cards: the hologram's page scene as before");
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.done("janna_lookup", "l1", FACTORIES);
    assert.equal(P.H.owns("janna_navigate", { page: "market" }), true, "results up: holo.js leaves the wall to the cards (the screen still moves)");
    assert.equal(P.H.tapped(), 0);
    const a = P.card("r0"), inner = new El("b", P.doc); a.appendChild(inner); P.click(inner);
    assert.equal(P.H.tapped(), P.C.t, "data/bassem-live-tools.js watchSearch never runs a search over the page he chose");
    P.C.advance(40000); assert.equal(P.cards().length, 0); assert.equal(P.H.owns("janna_navigate", { page: "market" }), false, "cards gone: as before");
    assert.match(BLT, /function cardTap\(t\) \{ var C = W\.MIG_CALL_HOLO;/); assert.match(BLT, /if \(d !== REAL\) return d;\n        if \(cardTap\(t0\)\) return null;/);
  });
  test("the call ends: nodes and timers gone", () => {
    const P = page();
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.done("janna_lookup", "l1", FACTORIES);
    assert.ok(P.C.q.length > 0);
    P.end();
    assert.equal(P.layer(), null); assert.equal(P.C.q.filter(x => x.every).length, 0, "no interval left"); assert.equal(P.H.state(), null);
  });
  test("English page: every label in English, the persona's own data as it is", () => {
    const P = page({ lang: "en" });
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.start("janna_lookup", { query: "كاوتش", section: "tenders" }, "l2");
    assert.match(html(P.card("head")), /Searching/); assert.match(html(P.card("head")), /Factories · Tenders/);
    P.done("janna_lookup", "l1", FACTORIES); P.done("janna_lookup", "l2", TENDERS);
    assert.match(html(P.card("head")), /21 results/); assert.match(html(P.card("head")), /🏭 10 · 📄 11/); assert.match(html(P.card("r0")), /Factory/); assert.match(html(P.card("r0")), /📍 Cairo/);
    const Dk = page({ lang: "en", vp: DESK }); Dk.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); Dk.start("janna_lookup", { query: "كاوتش", section: "tenders" }, "l2"); Dk.done("janna_lookup", "l1", FACTORIES); Dk.done("janna_lookup", "l2", TENDERS);
    assert.match(html(Dk.card("head")), /Found/); assert.match(html(Dk.card("head")), /Factories: 10 · Tenders: 11/);
    assert.match(html(P.card("r1")), /No published deadline/);
    assert.doesNotMatch(html(P.card("head")), /لقيت|بدوّر|مصانع|مناقصات|نتيجة|نتايج/, "no Arabic label (the words she searched for stay as said)");
    const N = page({ lang: "en" }); N.start("janna_lookup", { query: "سلندرات", section: "tenders" }, "l1"); N.done("janna_lookup", "l1", NONE("tenders"));
    assert.match(html(N.card("head")), /No matching results/); assert.match(html(N.card("head")), /for “سلندرات”/);
  });
  test("English page: names and titles in the site's own English (its dictionary, as the English pages show them); an RFQ's frame dropped", () => {
    const dict = { "شركة القاهرة للكاوتشوك والبلاستيك (جورج خلف وشركاه)": "Cairo Rubber and Plastic Company (George Khalaf & Partners)", "الغزل والنسيج والملابس الجاهزة": "Spinning, weaving and ready-made garments", "عملية توريد فلاتر وزيوت وكاوتش": "Supply of Filters, Oils and Tires", "جهة حكومية": "Government entity",
      "طلب عرض سعر – توريد غلاف وعاء ضغط من شركة Protec Arisawa – بتاريخ 8-11-2026 – رقم الطلب: 0137789": "Request for Quotation – Supply of a Pressure Vessel Shell by Protec Arisawa – 8-11-2026 – Request No. 0137789" };
    const P = page({ lang: "en", dict });
    P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); P.start("janna_lookup", { query: "كاوتش", section: "tenders" }, "l2"); P.done("janna_lookup", "l1", FACTORIES); P.done("janna_lookup", "l2", TENDERS);
    assert.match(html(P.card("r0")), /Cairo Rubber and Plastic Company \(George Khalaf &amp; Partners\)/); assert.match(html(P.card("r0")), /Spinning, weaving/);
    assert.match(html(P.card("r1")), /Supply of Filters, Oils and Tires/); assert.match(html(P.card("r1")), /Government entity/);
    assert.doesNotMatch(html(P.card("r0")) + html(P.card("r1")), /شركة القاهرة|عملية توريد/, "no Arabic where the site has its English");
    const R = page({ lang: "en", dict });
    R.start("janna_lookup", { query: "x", section: "rfqs" }, "r1"); R.done("janna_lookup", "r1", { section: "rfqs", count: 1, results: [{ title: Object.keys(dict)[4], activity: "x", date: "2026-11-08", open_url: "/rfq/x/" }] });
    assert.match(html(R.card("r0")), />Supply of a Pressure Vessel Shell by Protec Arisawa</, "no «Request for Quotation –» / date / request number frame");
    const A = page({ dict }); A.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); A.done("janna_lookup", "l1", FACTORIES);
    assert.match(html(A.card("r0")), /شركة القاهرة للكاوتشوك/, "an Arabic page keeps the data as it is");
  });
  test("Bassem: his screen's own facts (mig:screen-result) fill an opened item; bassem_open_opportunity's answer becomes its card", () => {
    const P = page({ persona: "bassem", vp: DESK });
    P.start("bassem_open_item", { section: "tenders", title: "توريد كابلات وموصلات كهربائية" }, "b1");
    assert.match(html(P.card("head")), /بفتحلك/); assert.match(html(P.card("head")), /توريد كابلات/);
    P.win.dispatchEvent({ type: "mig:screen-result", detail: { tool: "bassem_open_item", query: "توريد كابلات وموصلات كهربائية", count: 1, items: [{ title: "توريد كابلات وموصلات كهربائية", entity: "شركة كهرباء موزمبيق (EDM)", deadline: "2026-12-15", ref: "MZ-1", url: "https://madeinegyptgate.com/tender-item/x/" }] } });
    assert.equal(P.card("head"), null); assert.match(html(P.card("r0")), /15 ديسمبر 2026/); assert.equal(P.card("r0").getAttribute("href"), "/tender-item/x/");
    const O = page({ persona: "bassem", vp: DESK });
    O.start("bassem_open_opportunity", { query: "حديد", market: "gulf" }, "o1"); assert.match(html(O.card("head")), /بدوّر على/); assert.match(html(O.card("head")), /فرص في الخليج/);
    O.done("bassem_open_opportunity", "o1", "مفتوح على الشاشة: الفرصة «توريد حديد تسليح لمشروع سكني»\nوزارة الإسكان | الخليج | 2026-12-30\n(بيانات حقيقية من الشاشة …)", "client");
    assert.match(html(O.card("r0")), /توريد حديد تسليح لمشروع سكني/); assert.match(html(O.card("r0")), /وزارة الإسكان/); assert.doesNotMatch(html(O.card("r0")), /بيانات حقيقية/);
  });
});

describe("where: the free wall around the face, never over the face, the AI label or the controls", () => {
  const T = page().H._t;
  const X = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const slots = p => [p.head].concat(p.cards).filter(Boolean).map(s => ({ l: s.l, t: s.t, r: s.l + s.w, b: s.t + s.h, cls: s.cls }));
  for (const [name, W, H, persona] of [["phone 390×844", 370, 694, "janna"], ["the owner's phone 390×664", 370, 514, "janna"], ["Android 412×839", 392, 689, "janna"], ["phone, Bassem", 370, 694, "bassem"], ["desktop 1280×800", 840, 600, "janna"], ["desktop, Bassem", 840, 600, "bassem"], ["iPad portrait", 800, 1030, "janna"], ["full screen", 1140, 760, "janna"]]) {
    test(name + ": the header and 3 results; none touches the head box, the AI label, the bar; all on the stage", () => {
      const g = T.stageGeom(W, H, 1152, 768, [0.5, 0.3], T.faceOf(persona)), ai = { l: W - 12 - 214, t: 12, r: W - 12, b: 42, w: 214, h: 30 };
      const ob = { ai, bottom: H - 66, rects: [], rtl: true }, p = T.planOf(g, ob, { head: true, n: 3 }), s = slots(p);
      assert.ok(p.head, "a header"); assert.ok(p.cards.length >= 2, "results: " + p.cards.length);
      for (const r of s) {
        assert.ok(!X(r, g.head), "clear of the head box: " + JSON.stringify(r));
        assert.ok(!X(r, ai), "clear of the AI label"); assert.ok(r.b <= H - 66, "above the control bar");
        assert.ok(r.l >= 0 && r.t >= 0 && r.r <= W && r.b <= H, "on the stage");
        assert.ok(r.cls !== "pill" || r === s[0], "a result is never a 2-word pill");
      }
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(!X(s[i], s[j]), "cards never overlap each other");
    });
  }
  test("wide stages use the owner's circles: header upper-left, results upper-right under the AI label and beside the shoulders", () => {
    const W = 840, H = 600, g = T.stageGeom(W, H, 1152, 768, [0.5, 0.3], T.faceOf("janna")), ai = { l: W - 226, t: 12, r: W - 12, b: 42 };
    const p = T.planOf(g, { ai, bottom: H - 66, rects: [] }, { head: true, n: 3 });
    assert.ok(p.head.l + p.head.w <= g.head.l && p.head.t < g.eye, "upper-left: left of the head, from the top");
    assert.ok(p.cards.some(c => c.l >= g.head.r && c.t >= ai.b && c.t < g.cheek), "upper-right: below the AI label, beside the head");
    assert.ok(p.cards.some(c => c.l + c.w <= g.neckL && c.t >= g.cheek), "lower-left: beside the neck / shoulder");
    assert.ok(p.cards.every(c => c.cls === "full"), "larger cards on wide stages");
  });
  test("phones: header in the top-left corner beside the AI label, results on the shelf under the chin, in reading order", () => {
    const W = 370, H = 694, g = T.stageGeom(W, H, 1152, 768, [0.5, 0.3], T.faceOf("janna")), ai = { l: 144, t: 12, r: 358, b: 42 };
    const p = T.planOf(g, { ai, bottom: H - 66, rects: [], rtl: true }, { head: true, n: 3 });
    assert.ok(p.head.l + p.head.w <= ai.l && p.head.t + p.head.h <= g.head.t, "top-left, above the head");
    assert.ok(p.cards.every(c => c.t >= g.head.b), "under the chin");
    assert.ok(p.cards[0].l > p.cards[1].l && p.cards[1].l > p.cards[2].l, "Arabic: the first result on the right");
    const L = T.planOf(g, { ai, bottom: H - 66, rects: [], rtl: false }, { head: true, n: 3 }); assert.ok(L.cards[0].l < L.cards[1].l, "English: on the left");
  });
  test("phones with no result card yet (searching, nothing found): the header on the shelf under the chin, readable, at the reading start; results: the corner", () => {
    for (const [W, H] of [[370, 694], [370, 514], [340, 630]]) {
      const g = T.stageGeom(W, H, 1152, 768, [0.5, 0.3], T.faceOf("janna")), ai = { l: W - 226, t: 12, r: W - 12, b: 42 };
      for (const rtl of [true, false]) {
        const p = T.planOf(g, { ai, bottom: H - 66, rects: [], rtl }, { head: true, n: 0 });
        assert.ok(p.head.t >= g.head.b && p.head.w >= 200, W + "×" + H + ": on the shelf, wide: " + JSON.stringify(p.head));
        assert.ok(rtl ? p.head.l + p.head.w > W - 12 : p.head.l < 12, "at the reading start");
        assert.ok(!X({ l: p.head.l, t: p.head.t, r: p.head.l + p.head.w, b: p.head.t + p.head.h }, g.head) && p.head.t + p.head.h <= H - 66);
      }
    }
    const g = T.stageGeom(370, 694, 1152, 768, [0.5, 0.3], T.faceOf("janna")), p3 = T.planOf(g, { ai: { l: 144, t: 12, r: 358, b: 42 }, bottom: 628, rects: [], rtl: true }, { head: true, n: 3 });
    assert.ok(p3.head.t + p3.head.h <= g.head.t, "with results the header goes to the corner and the shelf holds the results");
    /* in the page: searching on the shelf, then the results — the header appears in the corner (a new card), it never slides up across her face */
    const P = page(); P.start("janna_lookup", { query: "كاوتش", section: "factories" }, "l1"); const h1 = P.card("head"), r1 = P.rectOf(h1);
    assert.ok(r1.t >= T.stageGeom(370, 694, 1152, 768, [0.5, 0.3], T.faceOf("janna")).head.b, "searching: on the shelf");
    P.done("janna_lookup", "l1", FACTORIES); const h2 = P.card("head"), r2 = P.rectOf(h2);
    assert.ok(r2.b <= 66 && h2 !== h1 && h1.parentNode === null, "results: the corner, as a new card (no slide over the face)");
    const L = page({ vp: LAND }); L.start("janna_lookup", { query: "سلندرات", section: "tenders" }, "l1"); L.done("janna_lookup", "l1", NONE("tenders"));
    assert.match(html(L.card("head")), /مفيش نتايج/, "a narrow header (a phone on its side): short words that fit"); assert.doesNotMatch(html(L.card("head")), /مالقيتش نتايج مطابقة/);
  });
  test("one item in a narrow card (icompact): tag, title, buyer and the short fact; ifull adds its two other facts", () => {
    const c = T.itemCard("tenders", ITEM), sm = T.cardHtml(c, "icompact"), big = T.cardHtml(c, "ifull");
    assert.equal((sm.match(/class="jvh-f"/g) || []).length, 1, "icompact: one fact line (82 px hold 5 lines)"); assert.doesNotMatch(sm, /آخر ميعاد/, "its short form");
    assert.equal((big.match(/class="jvh-f"/g) || []).length, 3); assert.match(big, /آخر ميعاد 12 يناير 2027/);
  });
  test("a chip above the bar (🌐 / noise) or the hologram's panel is never covered: the cards go above or beside it", () => {
    const W = 370, H = 694, g = T.stageGeom(W, H, 1152, 768, [0.5, 0.3], T.faceOf("janna")), ai = { l: 144, t: 12, r: 358, b: 42 };
    const chip = { l: 96, t: H - 66 - 6 - 56, r: 274, b: H - 66 - 6 }, p = T.planOf(g, { ai, bottom: H - 66, rects: [chip] }, { head: true, n: 3 });
    assert.ok(p.cards.length >= 1);
    for (const r of slots(p)) assert.ok(!X(r, chip), "clear of the chip: " + JSON.stringify(r));
  });
  test("the stream's real size and object-position drive it (a new avatar: window.JANNA_LIVE_FACE)", () => {
    const g = T.stageGeom(370, 694, 1152, 768, T.posOf("50% 30%"), T.faceOf("janna"));
    assert.equal(Math.round(g.s * 1000), 904); assert.ok(g.visible[0] > 0.3 && g.visible[1] < 0.7, "a phone in portrait sees the middle of the frame");
    assert.deepEqual([...T.posOf("left top")], [0, 0]); assert.deepEqual([...T.posOf("40% 20%")], [0.4, 0.2]); /* arrays of the sandbox: spread */
    assert.deepEqual([...T.faceOf("janna", { janna: [0.2, 0.1, 0.5, 0.6] }).head], [0.2, 0.1, 0.5, 0.6]);
    assert.equal(T.faceOf("bassem", { bassem: { chin: 0.8 } }).chin, 0.8);
  });
});

describe("the call's other parts leave these searches to the cards (source and wiring)", () => {
  test("data/janna-live.js: loads data/call-holo.js for SDK calls, opens a tapped card like an item (showCard), the persona's speech, clean-up on close", () => {
    assert.match(LIVE, /if \(sdkBox\(\)\) holoCards\(\);/);
    assert.match(fn(LIVE, "holoCards"), /"data\/call-holo\.js" \+ \(window\.MIGVER_CH \|\| \(v \? "\?v=" \+ v\[1\] : ""\)\)/, "the same ?v= as janna-live.js");
    assert.match(LIVE, /try \{ if \(window\.MIG_CALL_HOLO && MIG_CALL_HOLO\.clear\) MIG_CALL_HOLO\.clear\(\); \} catch \(e\) \{\}/);
    assert.match(LIVE, /window\.JANNA_LIVE\.speaking = function \(\) \{ var s = LV && !LV\.closed && LV\.spk;/);
    assert.match(fn(LIVE, "holoTool"), /a\.bodyParams && typeof a\.bodyParams === "object"/, "webhook arguments unwrapped for the hologram");
    assert.match(fn(LIVE, "holoTool"), /n !== "bassem_intel" \? "bassem" : persona/, "bassem_intel speaks as the call's persona");
    /* the existing screen rules are untouched (functions/_tests/janna-screen.test.mjs pins them) */
    assert.match(LIVE, /el\.addEventListener\("anam-agent:tool-call-completed", function \(e\) \{ try \{ lookupDone\(e\.detail \|\| \{\}\); \} catch \(x\) \{\} try \{ itemShow\(e\.detail \|\| \{\}\); \} catch \(x\) \{\} \}\);/);
  });
  test("JANNA_LIVE.showCard: this site's path on the screen, the 2.5 s rule counts the tap, stacked → scroll to the screen; work on the screen → a tab", () => {
    const sb = { gos: [], tabs: [], ext: [], scrolled: 0, work: false, stacked: true, persona: "janna", MV0: 0, Date: { now: () => 5000 } };
    const scr = { scrollIntoView: () => { sb.scrolled++; } }, sw = { classList: { remove() {} } };
    sb.ov = { hidden: false, querySelector: s => (s === ".jnl-scr" ? scr : s === ".jnl-hd .sw" ? sw : null) }; sb.frame = {};
    sb.screenWork = () => sb.work; sb.go = u => sb.gos.push(u); sb.stackedNow = () => sb.stacked; sb.openTab = u => sb.tabs.push(u); sb.extTab = u => sb.ext.push(u);
    sb.absUrl = u => ({ href: "https://madeinegyptgate.com" + u }); sb.window = { JANNA_LIVE: {} };
    vm.createContext(sb); vm.runInContext(cut(LIVE, "  window.JANNA_LIVE.showCard = function (u) {", "\n  };\n") + "\n  };", sb);
    const show = sb.window.JANNA_LIVE.showCard;
    assert.equal(show("/factories/x/"), true); assert.deepEqual(sb.gos, ["/factories/x/"]); assert.equal(sb.scrolled, 1); assert.equal(sb.MV0, 5000, "a lookup answering right after the tap does not take the screen away");
    sb.stacked = false; show("/tender-item/y/"); assert.equal(sb.scrolled, 1, "side by side: no scroll");
    assert.equal(show("https://evil.example/x"), false); assert.equal(show("//evil.example/x"), false);
    sb.work = true; show("/rfq/z/"); assert.deepEqual(sb.ext, ["https://madeinegyptgate.com/rfq/z/"], "Janna: a form being filled stays, a new tab instead");
    sb.persona = "bassem"; show("/rfq/z/"); assert.deepEqual(sb.tabs, ["https://madeinegyptgate.com/rfq/z/"], "Bassem: his own tab");
    assert.equal(sb.gos.length, 2, "the screen with work is never replaced");
    assert.match(cut(LIVE, "  window.JANNA_LIVE.showCard = function (u) {", "\n  };\n"), /screenWork\(\)/); assert.doesNotMatch(cut(LIVE, "  window.JANNA_LIVE.showCard = function (u) {", "\n  };\n"), /screenBusy\(\)/, "screenBusy would send list pages to a new tab");
  });
  test("data/holo.js / bassem-intel-view.js / bassem-live-tools.js ask MIG_CALL_HOLO.owns (no second scene of the same search over her face)", () => {
    assert.match(HOLO, /if \(owned\(tool, args \|\| \{\}\)\) return;/);
    assert.match(HOLO, /if \(o\.tool && owned\(String\(o\.tool\)\)\) return;/);
    assert.match(HOLO, /scene: function \(\) \{ var sc = S\.sc;/);
    assert.match(BIV, /function cardsOwn\(a\) \{ var C = W\.MIG_CALL_HOLO;/); assert.match(BIV, /own = tool && cardsOwn\(a\);\n    if \(own\) H = null;/);
    assert.match(BLT, /showScreen\(false, a\);/); assert.match(BLT, /typing\(\) \|\| now\(\) - touchT < 5000 \|\| cardsHold\(search\)/);
  });
});
