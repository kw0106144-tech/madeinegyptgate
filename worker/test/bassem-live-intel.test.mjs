// node --test for the Information Center part of data/bassem-live-tools.js (Bassem's screen tools), run in a vm sandbox: the results
// of his bassem_intel calls are remembered from TOOL_CALL_COMPLETED, and bassem_open_item opens ANY of them — by its page link, its id,
// its official link, its position or its words — on its own Information Center page; the platform's own sections keep their path.
// Owner 2026-11-19: «لما بقوله افتح الفرصة بيقولي مش لاقي التفاصيل».
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../data/bassem-live-tools.js", import.meta.url), "utf8");
function load({ lang = "ar", persona = "bassem" } = {}) {
  const listeners = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, setAttribute() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] });
  const doc = { addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el(), documentElement: el() };
  const win = { MIGLANG: lang, JANNA_LIVE: { persona: () => persona }, addEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
  win.window = win; win.document = doc;
  const ctx = vm.createContext({ window: win, document: doc, Promise, JSON, Object, String, Date, Math, isNaN, parseInt, Number, Array, RegExp, setTimeout, clearTimeout, CustomEvent: function () {}, Event: function () {} });
  vm.runInContext(SRC, ctx);
  const fire = (name, detail) => (listeners["anam-agent:" + name] || []).forEach(f => f({ detail }));
  return { LT: win.MIG_LIVE_TOOLS, fire };
}
const PAGE = id => "https://madeinegyptgate.com/intel/rfq/supply-of-water-treatment-chemicals-" + id + "/";
const RESULT = { count: 3, results: [
  { id: "rw0000000a1", kind: "rfq", title: "توريد كيماويات معالجة المياه", entity: "Rand Water", market_name: "جنوب أفريقيا", deadline: "2026-11-24", url: "https://www.etenders.gov.za/home/Download?blobName=a.pdf", page: PAGE("rw0000000a1"), open_url: PAGE("rw0000000a1") },
  { id: "gh0000000b2", kind: "tender_gov", title: "توريد أجهزة معامل للجامعة", entity: "Kwame Nkrumah University of Science and Technology", market_name: "غانا", deadline: "2026-12-02", url: "https://www.ghaneps.gov.gh/epps/cft/prepareViewCfTWS.do?resourceId=999", page: "https://madeinegyptgate.com/intel/tenders/lab-equipment-gh0000000b2/" },
  { id: "ke0000000c3", kind: "tender_gov", title: "توريد مواسير حديد", entity: "Nairobi Water", market_name: "كينيا", deadline: null, url: "https://tenders.go.ke/tenders/77", page: "https://madeinegyptgate.com/intel/tenders/steel-pipes-ke0000000c3/" }] };

describe("bassem_open_item: an Information Center item", () => {
  test("the results of his bassem_intel search are remembered (Bassem's calls only)", () => {
    const J = load({ persona: "janna" });
    J.fire("tool-call-completed", { toolName: "bassem_intel", result: JSON.stringify(RESULT) });
    assert.equal(J.LT._t.INTEL.items.length, 0, "Janna's calls: nothing of Bassem's");
    const B = load();
    B.fire("tool-call-completed", { toolName: "bassem_intel", result: { result: RESULT } });
    assert.deepEqual([...B.LT._t.INTEL.items].map(x => x.id), ["rw0000000a1", "gh0000000b2", "ke0000000c3"]);
    assert.equal(B.LT._t.INTEL.items[0].path, "/intel/rfq/supply-of-water-treatment-chemicals-rw0000000a1/");
  });
  test("by its page (open_url), its id, its official link, its position, its words", () => {
    const B = load(); B.fire("tool-call-completed", { toolName: "bassem_intel", result: RESULT });
    const t = (a, s) => { const x = B.LT._t.intelTarget(a, s === undefined ? a.section : s); return x ? x.id : null; };
    assert.equal(t({ section: "rfqs", url: PAGE("rw0000000a1") }), "rw0000000a1", "the page link wins whatever section the model says");
    assert.equal(t({ section: "tenders", url: "/intel/en/tenders/x-gh0000000b2/?lang=en" }), "gh0000000b2");
    assert.equal(t({ section: "intel", ref: "ke0000000c3" }), "ke0000000c3");
    assert.equal(t({ section: "tenders", url: "https://www.etenders.gov.za/home/Download?blobName=a.pdf" }), "rw0000000a1", "the official link of one of his results");
    assert.equal(t({ section: "intel", index: 2 }), "gh0000000b2");
    assert.equal(t({ section: "intel", title: "Rand Water" }), "rw0000000a1");
    assert.equal(t({ section: "intel", title: "الجامعة في غانا" }), "gh0000000b2");
    assert.equal(t({ section: "intel" }), "rw0000000a1", "section intel alone: the first result");
    assert.equal(t({ section: "intel", ref: "zz0000000z9" }), "zz0000000z9", "an id that is not in the list still opens its page (the Worker redirects)");
    assert.equal(B.LT._t.intelTarget({ section: "intel", ref: "zz0000000z9" }, "intel").path, "/intel/tenders/zz0000000z9/");
    assert.equal(t({ section: "intel", index: 9 }), null, "no such position: never another item");
  });
  test("the title of one of his results (as the tool gave it) opens it wherever the screen is — the 2026-11-19 20:18 Kenya call", () => {
    const B = load(); B.fire("tool-call-completed", { toolName: "bassem_intel", result: RESULT });
    const t = a => { const x = B.LT._t.intelTarget(a, a.section); return x ? x.id : null; };
    assert.equal(t({ section: "tenders", title: "توريد مواسير حديد" }), "ke0000000c3", "the model said tenders: still his Information Center result");
    assert.equal(t({ section: "tenders", title: "توريد أجهزة معامل للجامعة في غانا" }), "gh0000000b2");
    assert.equal(t({ section: "tenders", title: "توريد حديد" }), null, "two words, not a title: the platform's list");
  });
  test("the platform's own items keep their path (Egyptian tenders, factories, an unknown link)", () => {
    const B = load(); B.fire("tool-call-completed", { toolName: "bassem_intel", result: RESULT });
    const t = a => B.LT._t.intelTarget(a, a.section);
    assert.equal(t({ section: "tenders", ref: "eg-tnd-003" }), null);
    assert.equal(t({ section: "tenders", title: "توريد حديد تسليح", index: 2 }), null, "no Information Center page on the screen: the platform's list");
    assert.equal(t({ section: "factories", url: "/factories/some-factory/" }), null);
    assert.equal(t({ section: "rfqs", url: "https://evil.example.net/x.pdf" }), null);
  });
  test("intelPath reads only this site's Information Center item pages; English calls open the English twin", () => {
    const B = load(), P = B.LT._t.intelPath;
    assert.equal(P("https://www.madeinegyptgate.com/intel/news/abc-def-0123456789a/").id, "0123456789a");
    assert.equal(P("/intel/projects/%D8%AD%D8%AF%D9%8A%D8%AF-0123456789b/").id, "0123456789b");
    for (const bad of ["https://evil.example.net/intel/rfq/x-0123456789a/", "/intel/rfq/", "/intel/sources/", "//evil.example.net/intel/rfq/x-0123456789a/", "/intel/rfq/x-0123456789a/../../admin"]) assert.equal(P(bad), null, bad);
    assert.equal(load({ lang: "en" }).LT._t.intelLang("/intel/rfq/x-0123456789a/"), "/intel/en/rfq/x-0123456789a/");
    assert.equal(B.LT._t.intelLang("/intel/en/rfq/x-0123456789a/"), "/intel/rfq/x-0123456789a/");
  });
  test("every item page path worker-intel makes (pages.js itemPath, both languages, any kind, Arabic slugs) is recognised", async () => {
    const { itemPath } = await import("../../worker-intel/src/pages.js");
    const P = load().LT._t.intelPath;
    for (const it of [{ id: "0a1b2c3d4e5", kind: "tender_gov", title_orig: "Supply of steel pipes" }, { id: "1a1b2c3d4e5", kind: "rfq", title_orig: "RFQ: cement" }, { id: "2a1b2c3d4e5", kind: "project_news", title_orig: "مشروع محطة مياه" },
      { id: "3a1b2c3d4e5", kind: "news", title_orig: "خبر" }, { id: "4a1b2c3d4e5", kind: "tender_semi", slug: "rand-water-chemicals", title_orig: "x" }])
      for (const lang of ["ar", "en"]) { const p = itemPath(it, lang); assert.equal((P(p) || {}).id, it.id, p); assert.equal((P(encodeURI(p)) || {}).id, it.id, "encoded " + p); }
  });
  test("the tool definition the page carries knows section intel", () => {
    const d = load().LT.defs.find(x => x.name === "bassem_open_item");
    assert.ok([...d.config.parameters.properties.section.enum].includes("intel"));
    assert.match(d.description, /section=intel/);
    assert.ok(d.description.length <= 1024, "Anam's description limit");
  });
});
