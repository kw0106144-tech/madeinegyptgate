// «حماية الموقع» on the site side: data/guard.js in a small DOM double (the shortcuts it cancels and the ones it leaves alone, the
// pictures' right-click, the beacon, the staff pages, the owner's switch, the build kill) and functions/_middleware.js, which stays
// read-only (nothing is written to KV) and, since the owner's «قافل أي نسخ» (2026-11-27), answers site-copying programs with 403.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { onRequest } from "../_middleware.js";
import { resetEdgeMemos } from "../_lib/seo-edge.js";
import { KV, assets, pctx } from "./helpers.mjs";

const SRC = readFileSync(new URL("../../data/guard.js", import.meta.url), "utf8");
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function el(name, { cls = "", parent = null, editable = false } = {}) {
  return { nodeType: 1, nodeName: name.toUpperCase(), parentNode: parent, isContentEditable: editable, getAttribute: a => (a === "class" ? cls : null) };
}
function boot({ ua = CHROME, path = "/factories/", flags, kill = false, host = "madeinegyptgate.com", frame = false } = {}) {
  const L = { w: {}, d: {} }, beacons = [], xhrs = [], styles = [];
  const on = (o) => (t, f, c) => { (o[t] = o[t] || []).push(f); };
  const off = (o) => (t, f) => { o[t] = (o[t] || []).filter(x => x !== f); };
  const head = { appendChild: s => { styles.push(s); s.parentNode = head; }, removeChild: s => { styles.splice(styles.indexOf(s), 1); } };
  const doc = { readyState: "complete", head, documentElement: head, currentScript: { getAttribute: a => (a === "data-guard" && kill ? "off" : null) },
    addEventListener: on(L.d), removeEventListener: off(L.d), createElement: () => ({ id: "", textContent: "" }) };
  const win = { document: doc, navigator: { userAgent: ua, maxTouchPoints: 0, sendBeacon: (u, b) => { beacons.push([u, JSON.parse(b)]); return true; } },
    location: { pathname: path, protocol: "https:", hostname: host }, addEventListener: on(L.w), removeEventListener: off(L.w),
    sessionStorage: { getItem: () => null, setItem: () => {} }, setTimeout: (f) => { f(); return 0; }, devicePixelRatio: 1, outerWidth: 1400, innerWidth: 1400, outerHeight: 900, innerHeight: 800,
    XMLHttpRequest: function () { this.open = (m, u) => xhrs.push([m, u]); this.send = () => {}; } };
  win.window = win; win.top = frame ? {} : win;
  if (flags) win.MIGFLAGS = { on: k => (k in flags ? flags[k] : true), ready: f => f() };
  vm.runInNewContext(SRC, win, { filename: "guard.js" });
  const fire = (bag, type, ev) => { ev.dp = false; ev.preventDefault = () => { ev.dp = true; }; for (const f of bag[type] || []) f(ev); return ev.dp; };
  const key = (o, target = el("body")) => fire(L.w, "keydown", { target, ...o });
  const menu = target => fire(L.d, "contextmenu", { target });
  const drag = target => fire(L.d, "dragstart", { target });
  return { win, key, menu, drag, beacons, xhrs, styles, L };
}

test("the copy shortcuts are cancelled and reported once per page; typing, copy, print, AltGr and an IME are left alone", () => {
  const g = boot();
  assert.equal(g.key({ key: "s", ctrlKey: true }), true, "Ctrl+S");
  assert.equal(g.key({ key: "S", ctrlKey: true, keyCode: 83 }), true, "Ctrl+S again (no second report)");
  assert.equal(g.key({ key: "u", ctrlKey: true }), true, "Ctrl+U");
  assert.equal(g.key({ key: "F12", keyCode: 123 }), true, "F12");
  for (const L of ["I", "J", "C"]) assert.equal(g.key({ key: L, ctrlKey: true, shiftKey: true }), true, "Ctrl+Shift+" + L);
  assert.equal(g.key({ key: "ˆ", metaKey: true, altKey: true, keyCode: 73 }), true, "Cmd+Opt+I (Option changes e.key on a Mac)");
  assert.equal(g.key({ key: "s", metaKey: true }), true, "Cmd+S");
  assert.equal(g.key({ key: "س", ctrlKey: true, keyCode: 83 }), true, "Ctrl+S on an Arabic layout");
  const input = el("input");
  for (const o of [{ key: "s" }, { key: "c", ctrlKey: true }, { key: "v", ctrlKey: true }, { key: "a", ctrlKey: true }, { key: "p", ctrlKey: true }, { key: "f", ctrlKey: true },
    { key: "s", ctrlKey: true, altKey: true }, { key: "u", ctrlKey: true, shiftKey: true }, { key: "s", ctrlKey: true, isComposing: true }, { key: "u", ctrlKey: true, altKey: true }])
    assert.equal(g.key(o, input), false, JSON.stringify(o));
  assert.equal(g.key({ key: "u", ctrlKey: true }, el("div", { editable: true })), false, "Ctrl+U = underline in a rich-text field");
  assert.equal(g.key({ key: "s", ctrlKey: true }, input), true, "Ctrl+S in a field is still no save");
  assert.deepEqual(g.beacons.map(b => b[1].t), ["save", "source", "devtools_key"]);
  assert.ok(g.beacons.every(b => b[0] === "/api/ev/guard" && b[1].p === "/factories/" && Object.keys(b[1]).length === 2), "the kind and the path only");
});

test("pictures, videos and the personas' figures: no right-click or drag; text, links and fields keep their menu", () => {
  const g = boot();
  assert.equal(g.menu(el("img")), true);
  assert.equal(g.menu(el("video", { parent: el("div", { cls: "jv-cont" }) })), true, "Janna's call video");
  const fig = el("div", { cls: "jn-fig m-happy" });
  assert.equal(g.menu(el("span", { parent: fig })), true, "Janna's figure");
  assert.equal(g.menu(el("div", { cls: "bs-fig" })), true, "Bassem's figure");
  assert.equal(g.menu(el("div", { cls: "mghRy" })), true, "the hologram");
  assert.equal(g.menu(el("span", { parent: el("a", { parent: fig }) })), false, "a link inside keeps its own menu");
  assert.equal(g.menu(el("p")), false, "plain text");
  assert.equal(g.menu(el("textarea", { parent: fig })), false, "a field");
  assert.equal(g.drag(el("img")), true); assert.equal(g.drag(el("p")), false);
  assert.deepEqual(g.beacons.map(b => b[1].t), ["save_image"]);
  assert.equal(g.styles.length, 1);
  assert.match(g.styles[0].textContent, /\[class\^='jn-'\][^{]*\{[^}]*user-select:none/);
  assert.match(g.styles[0].textContent, /input[^{]*\{[^}]*user-select:text/, "their fields stay selectable");
  assert.match(g.styles[0].textContent, /img,video,canvas,picture,svg\{-webkit-user-drag:none;-webkit-touch-callout:none\}/);
});

test("the staff pages, bots, frames and other hosts are guarded but send no report", () => {
  for (const o of [{ path: "/admin/" }, { path: "/en/seo-team/" }, { path: "/data-desk/" }, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }, { frame: true }, { host: "localhost" }]) {
    const g = boot(o);
    assert.equal(g.key({ key: "s", ctrlKey: true }), true, JSON.stringify(o));
    assert.deepEqual(g.beacons, [], JSON.stringify(o));
  }
  const app = boot({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile MIGApp/1.4 (android)" });
  assert.equal(app.key({ key: "s", ctrlKey: true }), true, "the app: the same rules");
  assert.equal(app.beacons.length, 1);
});

test("the owner's switch site_guard OFF removes everything; the build kill binds nothing; pages without data/flags.js ask /api/settings", () => {
  const off = boot({ flags: { site_guard: false } });
  assert.equal(off.key({ key: "s", ctrlKey: true }), false);
  assert.equal(off.menu(el("img")), false);
  assert.deepEqual(off.styles, []);
  assert.equal(off.win.MIGGUARD.state().why, "switch_off");
  const on = boot({ flags: { site_guard: true } });
  assert.equal(on.key({ key: "s", ctrlKey: true }), true);
  assert.deepEqual(on.xhrs, [], "MIGFLAGS answered: no extra request");
  const kill = boot({ kill: true });
  assert.equal(kill.key({ key: "s", ctrlKey: true }), false);
  assert.equal(kill.win.MIGGUARD.state().why, "build_off");
  const bare = boot();
  assert.deepEqual(bare.xhrs, [["GET", "/api/settings"]]);
});

test("developer tools opened (approximate): a docked panel without a zoom change → one report; a zoom change → a new baseline", () => {
  const g = boot();
  const resize = () => { for (const f of g.L.w.resize || []) f({}); };
  g.win.devicePixelRatio = 1.25; g.win.innerWidth = 1100; resize();
  assert.deepEqual(g.beacons, [], "zoom");
  g.win.innerHeight = 420; resize();
  assert.deepEqual(g.beacons.map(b => b[1].t), ["devtools_open"]);
  const phone = boot({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1" });
  phone.win.innerHeight = 300; for (const f of phone.L.w.resize || []) f({});
  assert.deepEqual(phone.beacons, [], "phones: never (the keyboard resizes the page)");
});

test("functions/_middleware.js stays read-only: a copying tool gets 403, a browser or curl the page, nothing is written to KV", async () => {
  resetEdgeMemos();
  const page = '<!doctype html><html lang="ar"><head><title>دليل المصانع</title><script src="/data/guard.js?v=1" defer></script></head><body><h1>دليل المصانع</h1></body></html>';
  const kv = new KV({}), env = { SEO_KV: kv, ASSETS: assets({ "/factories/index.html": page, "/data/guard.js": "1", "/_seo/redirects.json": { exact: {}, prefix: [], gone_rx: [], gone_prefix_on_404: [] }, "/_seo/en-paths.json": {} }) };
  for (const ua of ["Wget/1.21.4", "Mozilla/4.5 (compatible; HTTrack 3.0x; Windows 98)", "python-requests/2.31"]) {
    const res = await onRequest(pctx(new Request("https://madeinegyptgate.com/factories/", { headers: { "User-Agent": ua } }), env));
    assert.equal(res.status, 403, ua);
  }
  for (const ua of ["curl/8.5.0", CHROME]) {
    const res = await onRequest(pctx(new Request("https://madeinegyptgate.com/factories/", { headers: { "User-Agent": ua } }), env));
    assert.equal(res.status, 200, ua);
    assert.match(await res.text(), /data\/guard\.js/, ua);
  }
  assert.equal(kv.writes, 0);
  const src = readFileSync(new URL("../_middleware.js", import.meta.url), "utf8");
  assert.ok(!/\.put\(/.test(src), "the middleware never writes to KV");
});
