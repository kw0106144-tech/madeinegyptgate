// node --test for the call page's side of «بحث وكتابة عميقة» (data/research-live.js + its hooks in data/janna-live.js), in a vm sandbox
// with a fake page (no browser, no network: fetch is a mock of the Worker's answers).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = f => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const SRC = read("data/research-live.js"), LIVE = read("data/janna-live.js"), VIEW = read("data/research-view.js");
function node(tag) {
  const n = { tag, children: [], attrs: {}, style: {}, className: "", textContent: "", onclick: null, disabled: false,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); }, get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    querySelector(sel) { const cls = sel.replace(/^\./, ""); const walk = x => { for (const c of x.children) { if ((" " + c.className + " ").includes(" " + cls + " ")) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); } };
  Object.defineProperty(n, "innerHTML", { set() { throw new Error("innerHTML is never used with server text"); }, get() { return ""; } });
  return n;
}
function sandbox(fetchImpl) {
  const body = node("body"), head = node("head"), timers = [];
  const win = { MIGLANG: "ar", setTimeout: (f, ms) => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, fetch: fetchImpl, JSON, Promise, Date, String, Array, Object, RegExp, Math, encodeURIComponent,
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; }, dispatchEvent(e) { win.events.push(e); }, events: [] };
  win.window = win; win.document = { body, head, hidden: false, createElement: node, addEventListener() {}, getElementById: () => null };
  win.location = { hash: "", pathname: "/research/", search: "" };
  const ctx = vm.createContext(win); vm.runInContext(SRC, ctx);
  return { win, body, timers, flush: async (n = 20) => { for (let i = 0; i < n; i++) { const t = timers.splice(0); for (const f of t) f(); await new Promise(r => setImmediate(r)); } } };
}
const res = (status, j) => Promise.resolve({ status, json: () => Promise.resolve(j) });
function host(over = {}) { const h = { api: "/api", ctxs: [], talks: [], nudges: [], btok: () => "v2.tok", live: () => true, quiet: () => true, ctx(t) { h.ctxs.push(t); return true; }, talk(t) { h.talks.push(t); return true; }, nudge(t) { h.nudges.push(t); }, chainId: () => "c1", lang: () => "ar", phone: () => false, heard: () => ["عايز 100"], go(u) { h.went = u; }, ...over }; return h; }
const DONE = { id: "rj0000000000000000000a", label: "R1", kind: "buyers", state: "done", top: [{ k: "company", label: "<img src=x onerror=alert(1)>", place: "القليوبية", badge: "member", link: "/factories/x/" }, { k: "tender", label: "مناقصة — جهة", link: "https://evil.test/" }], say: "البحث خلص يا فندم", block: "[ملاحظة من المنصة: نتيجة البحث R1]", doc_path: "/research/#rj0000000000000000000a", progress: { gather: "done", write: "done" } };

describe("research-live: the tool", () => {
  test("ES5: no arrow function, let / const, class or template literal in the browser files", () => {
    for (const s of [SRC, VIEW]) assert.doesNotMatch(s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?\*\//g, ""), /=>|\blet\s|\bconst\s|\bclass\s|`/);
  });
  test("start posts once with the call_key and the chain; the same request again answers from the last poll without a request", async () => {
    const posts = [];
    const S = sandbox((u, init) => { posts.push([u, init.method, init.body && JSON.parse(init.body), init.headers]); return res(200, { ok: true, id: "rj0000000000000000000a", label: "R1", kind: "buyers", state: "queued", ack: "بدأت بحث أعمق" }); });
    const h = host(), a = await S.win.MIGRESEARCH.onTool(h, { bodyParams: JSON.stringify({ action: "start", kind: "buyers", product: "درافيل", buyer_industries: ["ورق"] }) });
    assert.equal(a, "بدأت بحث أعمق");
    assert.equal(posts[0][0], "/api/advisor/research"); assert.equal(posts[0][2].action, "start"); assert.match(posts[0][2].call_key, /\|c1$/); assert.equal(posts[0][3].Authorization, "Bearer v2.tok");
    const b = await S.win.MIGRESEARCH.onTool(h, { action: "start", kind: "buyers", product: "درافيل", buyer_industries: ["ورق"] });
    assert.equal(b, "بدأت بحث أعمق"); assert.equal(posts.length, 1);
    const c = await S.win.MIGRESEARCH.onTool(h, { action: "start", kind: "posts", product: "x" });
    assert.match(c, /لسه شغّال/); assert.equal(posts.length, 1, "another job while one runs: no request");
  });
  test("no answer within 5 s → an honest «not sure it started» line", async () => {
    const S = sandbox(() => new Promise(() => {}));
    const p = S.win.MIGRESEARCH.onTool(host(), { action: "start", kind: "buyers", product: "x", buyer_industries: ["y"] });
    await S.flush(1); assert.match(await p, /مش متأكد/);
  });
  test("done: the block goes in as context at once, the cue is spoken at the first quiet gap; the overlay escapes everything and links only to same-origin paths", async () => {
    let n = 0;
    const S = sandbox((u, init) => { n++; if (init.method === "POST") return res(200, { ok: true, id: DONE.id, label: "R1", kind: "buyers", state: "queued", ack: "ok" }); return res(200, DONE); });
    const h = host(); await S.win.MIGRESEARCH.onTool(h, { action: "start", kind: "buyers", product: "x", buyer_industries: ["y"] });
    await S.flush();
    assert.deepEqual(h.ctxs, [DONE.block]); assert.deepEqual(h.talks, [DONE.say]);
    const box = S.body.children.find(c => c.className === "mrs-box"); assert.ok(box);
    const txt = JSON.stringify(box, (k, v) => (k === "parentNode" ? undefined : v));
    assert.match(txt, /<img src=x onerror=alert\(1\)>/, "as text"); assert.doesNotMatch(txt, /evil\.test/);
    assert.ok(S.win.events.some(e => e.type === "mig:research" && e.detail.phase === "done"));
  });
  test("no talk() (or another language) → the chip; its tap sends the block again and the member's own words", async () => {
    const S = sandbox((u, init) => (init.method === "POST" ? res(200, { id: DONE.id, label: "R1", state: "queued", ack: "ok" }) : res(200, DONE)));
    const h = host({ talk: null }); await S.win.MIGRESEARCH.onTool(h, { action: "start", kind: "buyers", product: "x", buyer_industries: ["y"] });
    await S.flush();
    const box = S.body.children.find(c => c.className === "mrs-box"), find = x => { for (const c of x.children) { if (c.className === "mrs-chip") return c; const r = find(c); if (r) return r; } return null; };
    const chip = find(box); assert.ok(chip); chip.onclick();
    assert.equal(h.ctxs.length, 2); assert.deepEqual(h.nudges, ["قولّي نتيجة البحث"]);
  });
  test("the gate waits while someone speaks (quiet() false), then gives up to the chip after 45 s", async () => {
    const S = sandbox((u, init) => (init.method === "POST" ? res(200, { id: DONE.id, label: "R1", state: "queued", ack: "ok" }) : res(200, DONE)));
    const h = host({ quiet: () => false }); await S.win.MIGRESEARCH.onTool(h, { action: "start", kind: "buyers", product: "x", buyer_industries: ["y"] });
    await S.flush(30); assert.deepEqual(h.talks, []);
  });
  test("janna-live.js always registers bassem_research and its stub answers «off» at once while the switch is off or in the kiosk", () => {
    assert.match(LIVE, /registerToolCallHandler\("bassem_research"/);
    assert.match(LIVE, /function rsOn\(\) \{ var F = window\.MIGFLAGS; return persona === "bassem" && !window\.JANNA_KIOSK && !!\(F && F\.on && F\.on\("research_bassem"\) === true\); \}/);
    assert.match(LIVE, /if \(!rsOn\(\)\) return off;/);
    assert.match(LIVE, /bassem_intel\|bassem_research\)\$\//, "the composer folds for it");
  });
});
