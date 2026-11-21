// node --test: data/bassem-memory.js with the four web tools (review 2026-11-20 S12): Anam reports a SERVER webhook's arguments nested as
// {bodyParams:{…}} in TOOL_CALL_STARTED — they are read (the loading card, the stored query), a webhook's headers never leave the event, a
// hunt is remembered as «product · market» with its titles only — no site, no domain, no link (owner 2026-11-20 «ميكتبش مصدر اي معلومه»;
// an older answer that still carries url / source / snippet is never read) — and the existing web search / platform lookup records are still
// stored. The browser file runs in a vm sandbox with a fake page (no DOM body: the shared-screen card is skipped), fake timers, a mocked fetch.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../data/bassem-memory.js", import.meta.url), "utf8");
const J = x => JSON.parse(JSON.stringify(x)); // values made inside the sandbox have its own Object prototype
const VID = "0123456789abcdef0123456789abcdef";
/* the page parses links with an <a> element (abs(), host()): an anchor that parses like a browser's */
function anchor(tag) {
  if (tag !== "a") return { style: {}, setAttribute() {}, appendChild() {} };
  const a = { u: null };
  Object.defineProperty(a, "href", { get: () => (a.u ? a.u.href : ""), set: v => { try { a.u = new URL(String(v), "https://madeinegyptgate.com/"); } catch (e) { a.u = null; } } });
  for (const k of ["protocol", "hostname", "host", "username", "password", "pathname"]) Object.defineProperty(a, k, { get: () => (a.u ? a.u[k] : "") });
  return a;
}
function page({ lang = "ar" } = {}) {
  const store = { "mig-vid": VID, "mig-tok": "v2.test-token" }, posts = [], listeners = {};
  const ok = () => Promise.resolve({ ok: true, status: 200, headers: { get: () => "application/json" }, json: () => Promise.resolve({ ok: true }) });
  const win = {
    MIGLANG: lang, location: { protocol: "https:", host: "madeinegyptgate.com", pathname: "/", href: "https://madeinegyptgate.com/" },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); }, removeEventListener() {}, dispatchEvent() { return true; },
    fetch: (url, o) => { posts.push({ url: String(url), method: (o && o.method) || "GET", body: o && o.body ? JSON.parse(o.body) : null, headers: (o && o.headers) || {} }); return ok(); },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    navigator: { userAgent: "Mozilla/5.0 test", sendBeacon: () => true },
    document: { body: null, head: null, documentElement: null, querySelector: () => null, createElement: anchor, addEventListener() {}, visibilityState: "visible" },
    Uint8Array, JSON, Math, Date, Promise, Object, Array, String, Number, RegExp, Error, encodeURIComponent, decodeURIComponent, isNaN, parseInt
  };
  win.window = win; win.top = win; win.parent = win; win.self = win;
  const ctx = vm.createContext(win);
  vm.runInContext(SRC, ctx);
  return { win, posts, M: win.BASSEM_MEMORY };
}
function client() { const L = {}; return { L, addListener: (k, fn) => { (L[k] = L[k] || []).push(fn); }, emit: (k, p) => (L[k] || []).forEach(f => f(p)) }; }
const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
const searches = posts => J(posts.filter(p => p.body && p.body.kind === "search").map(p => ({ url: p.url, ...p.body })));
const HUNT = { count: 2, query: "درافيل كاوتش · السعودية", market: "sa", text: "لقيت على الإنترنت مناقصة وطلب عرض سعر.", results: [
  { type: "tender", title: "منافسة توريد سلندرات للمطابع", url: "https://tenders.etimad.sa/Tender/1", snippet: "توريد درافيل", source: "etimad", date: "2026-11-18", official: true },
  { type: "rfq", title: "RFQ: rubber rollers for printing", url: "https://www.tradekey.com/buy-lead/1", snippet: "buyer needs rollers", source: "tradekey" }] };

describe("data/bassem-memory.js and the web tools", () => {
  test("args(): a webhook's {bodyParams} (object or JSON text) is unwrapped, the flat shape still works, headers are never kept", () => {
    const { M } = page(), a = x => J(M._t.args(x));
    assert.deepEqual(a({ bodyParams: { product: "درافيل", market: "sa" }, headers: { "X-MIG-Tool": "secret-value" } }), { product: "درافيل", market: "sa" });
    assert.deepEqual(a(JSON.stringify({ bodyParams: JSON.stringify({ query: "steel" }) })), { query: "steel" });
    assert.deepEqual(a({ query: "flat", market: "eg" }), { query: "flat", market: "eg" });
    assert.deepEqual(a({ input: "plain words" }), { input: "plain words" }, "a non-JSON string stays as it was");
    assert.deepEqual([a(null), a("not json"), a([1, 2])], [{}, {}, {}]);
  });
  test("huntQuery(): «product · market» with the market's name in the page's language (none = Egypt)", () => {
    assert.equal(page().M._t.huntQuery({ product: "درافيل", market: "sa" }), "درافيل · السعودية");
    assert.equal(page({ lang: "en" }).M._t.huntQuery({ product: "rollers", market: "KE" }), "rollers · Kenya");
    assert.equal(page().M._t.huntQuery({ product: "درافيل" }), "درافيل · مصر");
    assert.equal(page().M._t.huntQuery({ product: "درافيل", market: "world" }), "درافيل · العالم");
    assert.equal(page().M._t.queryOf("janna_web_hunt", { product: "سلندرات", market: "ae" }), "سلندرات · الإمارات");
  });
  test("Janna's hunt with nested arguments: stored once to /api/janna/memory as «product · market», no site / link as entities, no header value anywhere", async () => {
    const { win, posts, M } = page(), c = client();
    assert.equal(M.attach(c, "janna"), true);
    c.emit("TOOL_CALL_STARTED", { toolName: "janna_web_hunt", toolCallId: "t1", toolType: "server", arguments: { bodyParams: { product: "درافيل كاوتش", market: "sa" }, headers: { "X-MIG-Tool": "janna-secret-never-sent" } } });
    c.emit("TOOL_CALL_COMPLETED", { toolName: "janna_web_hunt", toolCallId: "t1", result: JSON.stringify(HUNT) });
    await settle();
    const s = searches(posts);
    assert.equal(s.length, 1, JSON.stringify(posts.map(p => p.url)));
    assert.ok(s[0].url.endsWith("/api/janna/memory"), s[0].url);
    assert.deepEqual([s[0].tool, s[0].query, s[0].count, s[0].visitor_id], ["janna_web_hunt", "درافيل كاوتش · السعودية", 2, VID]);
    assert.deepEqual(s[0].results.map(r => [r.title, r.entity, r.url]), [["منافسة توريد سلندرات للمطابع", "", ""], ["RFQ: rubber rollers for printing", "", ""]]);
    assert.ok(!/etimad|tradekey|https?:|snippet|توريد درافيل/i.test(JSON.stringify(posts)), "no site, link or snippet of an older answer leaves the page");
    assert.ok(!JSON.stringify(posts).includes("janna-secret-never-sent"), "the webhook header never leaves the event");
    await M.flush(true); await settle();
    const sum = posts.map(p => p.body).filter(b => b && b.kind === "summary").pop();
    assert.ok(sum && sum.tools.some(t => t.name === "janna_web_hunt"), "the call summary lists the hunt");
    assert.ok(!JSON.stringify(sum).includes("X-MIG-Tool"), "no header in the summary");
    void win;
  });
  test("Bassem's web search and a platform lookup, both with nested arguments, are still stored (the records the review asked to check)", async () => {
    const { posts, M } = page(), c = client();
    M.attach(c, "bassem");
    c.emit("TOOL_CALL_STARTED", { toolName: "bassem_web_search", toolCallId: "w1", toolType: "server", arguments: { bodyParams: { query: "rubber rollers importers kenya", market: "ke" } } });
    c.emit("TOOL_CALL_COMPLETED", { toolName: "bassem_web_search", toolCallId: "w1", result: { count: 1, results: [{ title: "Kenya rubber rollers buyers", url: "https://www.kenyabuyers.example/rollers", source: "kenyabuyers" }], text: "x" } });
    c.emit("TOOL_CALL_STARTED", { toolName: "janna_lookup", toolCallId: "l1", toolType: "server", arguments: { bodyParams: { query: "مطابع", governorate: "الجيزة" } } });
    c.emit("TOOL_CALL_COMPLETED", { toolName: "janna_lookup", toolCallId: "l1", result: { count: 3, results: [{ title: "مطبعة الأهرام", open_url: "/factories/al-ahram/", entity: "الجيزة" }], text: "x" } });
    await settle();
    const s = searches(posts);
    assert.deepEqual(s.map(x => [x.tool, x.query]), [["bassem_web_search", "rubber rollers importers kenya"], ["janna_lookup", "مطابع · الجيزة"]]);
    assert.ok(s.every(x => x.url.endsWith("/api/advisor/memory")), "Bassem's memory");
    assert.deepEqual([s[0].results[0].entity, s[0].results[0].url], ["", ""], "a web row keeps no site and no link (owner 2026-11-20)");
    assert.ok(!/kenyabuyers/i.test(JSON.stringify(posts)), "the site never leaves the page");
    assert.equal(s[1].results[0].url, "https://madeinegyptgate.com/factories/al-ahram/", "a platform row keeps its own page");
  });
  test("the hologram card of a web search / hunt (owner 2026-11-20): the opportunity itself — no domain, no link, no «من الإنترنت», nothing that opens another site; an older answer's url / source / snippet is never read", async () => {
    for (const lang of ["ar", "en"]) {
      const { win, M } = page({ lang }), c = client(), shown = [];
      win.MIGHOLO = { badges: 1, result: o => { shown.push(J(o)); } };
      M.attach(c, "janna");
      const older = { ...HUNT, results: [...HUNT.results, { type: "buyer", title: "Rollers buyers — visit www.kenyabuyers.co.ke", url: "https://kenyabuyers.co.ke/b", source: "kenyabuyers.co.ke", snippet: "call +254 700 000000", market: "kenyabuyers.co.ke", entity: "Nairobi Prints Ltd (nairobiprints.com)" }] };
      c.emit("TOOL_CALL_STARTED", { toolName: "janna_web_hunt", toolCallId: "h" + lang, toolType: "server", arguments: { bodyParams: { product: "درافيل", market: "sa" } } });
      c.emit("TOOL_CALL_COMPLETED", { toolName: "janna_web_hunt", toolCallId: "h" + lang, result: JSON.stringify(older) });
      await settle();
      assert.equal(shown.length, 1, lang);
      const o = shown[0], all = JSON.stringify(o);
      assert.ok(o.items.length === 3 && o.items.every(x => x.href === ""), lang + ": nothing opens another site " + all);
      assert.ok(!/https?:|www\.|etimad|tradekey|kenyabuyers|\.example|\+254|الإنترنت|internet|from the web|on the web|موقع|مواقع|site|المصدر|source|نتأكد|check/i.test(all), lang + ": " + all);
      assert.equal(o.badge, lang === "en" ? "Opportunities" : "فرص");
      assert.match(o.items[0].sub, lang === "en" ? /^Tender · official/ : /^مناقصة · رسمية/, all);
      assert.equal(M._t.noLink("Rollers buyers — visit www.kenyabuyers.co.ke and kenyabuyers.de/x"), "Rollers buyers — visit and");
      assert.equal(M._t.noLink("Steel 3.5 mm, Co. Ltd, e.g. bars"), "Steel 3.5 mm, Co. Ltd, e.g. bars", "ordinary words stay");
    }
  });
  test("a failed or refused web answer is not a search record", async () => {
    const { posts, M } = page(), c = client();
    M.attach(c, "janna");
    c.emit("TOOL_CALL_STARTED", { toolName: "janna_web_search", toolCallId: "f1", toolType: "server", arguments: { bodyParams: { query: "steel prices" } } });
    c.emit("TOOL_CALL_COMPLETED", { toolName: "janna_web_search", toolCallId: "f1", result: { error: "websearch_cap", code: "websearch_cap", count: 0, results: [], text: "خلّصنا حد البحث النهارده." } });
    c.emit("TOOL_CALL_STARTED", { toolName: "janna_web_hunt", toolCallId: "f2", toolType: "server", arguments: { bodyParams: { product: "x" } } });
    c.emit("TOOL_CALL_FAILED", { toolName: "janna_web_hunt", toolCallId: "f2" });
    await settle();
    assert.equal(searches(posts).length, 0);
  });
});
