// node --test for the renderer of «بحث وكتابة عميقة» (src/research-render.js), the AI call (src/ai-call.js) and the AI ledger
// (src/ai-budget.js). The property test walks every customer-facing string and compares it with the job's source map.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { D1 } from "./helpers.mjs";
import { render, readDoc, mailOf, linkable, statusOf, countsOf, stringsOf, LIM } from "../src/research-render.js";
import { check, workerTextOk, sitesList } from "../src/research-check.js";
import { buildPack } from "../src/research.js";
import * as AI from "../src/ai-call.js";
import { aiReserve, aiSettle, aiToday } from "../src/ai-budget.js";
import { cairoDay, addDays } from "../src/common.js";

const NOW = Date.parse("2026-11-21T10:00:00Z");
const PARTS = {
  platform: [
    { v: { kind: "company", name: "شركة الجوهرة لصناعة الورق والكرتون", activity: "الورق", place: "القليوبية" }, m: { origin: "platform", type: "company", name: "شركة الجوهرة لصناعة الورق والكرتون", place: "القليوبية", member: true, page: "https://madeinegyptgate.com/factories/aljawhara/", ref: "item:factories:1" } },
    { v: { kind: "company", name: "مصنع النيل للكرتون", place: "الشرقية" }, m: { origin: "platform", type: "company", name: "مصنع النيل للكرتون", place: "الشرقية", verified: true, page: "/factories/nile/", ref: "item:factories:2" } },
    { v: { kind: "company", name: "إيجيتك للكابلات" }, m: { origin: "platform", type: "company", name: "إيجيتك للكابلات", pub: true, verified: true, page: "/factories/egytech-cables/", ref: "item:factories:x0" } },
    { v: { kind: "tender", entity: "الهيئة العامة للبترول", deadline: "2026-12-10" }, m: { origin: "platform", type: "tender", entity: "الهيئة العامة للبترول", deadline: "2026-12-10", page: "/tender-item/eg-1/", ref: "item:tenders:eg-1" } },
  ],
  intel: [{ v: { kind: "tender", entity: "Kenya Power", deadline: "2026-11-25", country: "Kenya" }, m: { origin: "intel", type: "tender", entity: "Kenya Power", country: "Kenya", deadline: "2026-11-25", ref: "intel:rw1" }, src: { origin: "intel", id: "rw1", url: "https://tenders.go.ke/x", source_name: "PPIP Kenya", page: "/intel/x/" }, copy: "Supply of rubber rollers for the Kenya Power printing unit at Nairobi" }],
  web: [
    { v: { kind: "buyer", entity: "Cairo Print House", title: "Cairo Print House expands" }, m: { origin: "web", type: "buyer", entity: "Cairo Print House", country: "مصر" }, src: { origin: "web", url: "https://www.youm7.com/story/1", site: "اليوم السابع", host: "youm7.com", date: "2026-11-20T14:02:11Z" }, copy: "Cairo Print House expands - اليوم السابع" },
    { v: { kind: "tender", entity: "", title: "rollers tender" }, m: { origin: "web", type: "tender", entity: "", deadline: "" }, src: { origin: "web", url: "https://www.tendersinfo.com/t/2", site: "Tenders Info", host: "tendersinfo.com", date: "2026-11-19" }, copy: "rollers tender | Tenders Info" },
  ],
};
const P = { product: "درافيل مطاط", buyer_industries: ["ورق"], market: "eg" };
function built() { return buildPack(PARTS, P); }
function draft(b) {
  const id = n => b.pack.evidence.find(e => (e.name || e.entity) === n).id;
  return { title: "مشترين للدرافيل", summary: { text: "شركة الجوهرة لصناعة الورق والكرتون بتشتغل في الورق.", cites: [id("شركة الجوهرة لصناعة الورق والكرتون")] },
    sections: [{ key: "overview", heading: "على المنصة", blocks: [{ type: "p", text: "مصانع الورق بتستخدم الدرافيل.", cites: [id("شركة الجوهرة لصناعة الورق والكرتون")], ref: "", subject: "" }] },
      { key: "approach", heading: "", blocks: [{ type: "bullet", text: "اعرض عينة على مدير الصيانة.", cites: [], ref: "", subject: "" }] }],
    item_lines: [{ ref: id("Cairo Print House"), line: "مطبعة بتوسّع خط الأوفست", entity: "Cairo Print House" }], sources_used: [] };
}
function job(o = {}) { return { id: "rj0000000000000000000a", label: "R1", lang: "ar", voice: "bassem_ar", params: P, member: true, nowMs: NOW, ...o }; }
function full() {
  const b = built(), ch = check(draft(b), b.pack, "buyers", { lang: "ar", srcNames: b.srcNames, copies: b.copies });
  const r = render(ch, { meta: b.meta }, "buyers", job());
  return { b, ch, r, mail: mailOf(r.doc, { id: "rj0000000000000000000a", nowMs: NOW }) };
}

describe("research-render: no source anywhere (the property test)", () => {
  test("every string of doc, say, block, top and the e-mail: no url, site, host label, source name, found date, portal name or C7 phrase", () => {
    const { b, r, mail } = full(), strs = stringsOf(r, mail), all = strs.join("\n");
    const bad = [];
    for (const s of b.sources) for (const v of [s.url, s.site, s.source_name, s.host, s.date]) if (v && all.includes(v)) bad.push(v);
    for (const n of ["youm7", "tendersinfo", "اليوم السابع", "Tenders Info", "PPIP", "14:02", "2026-11-20"]) if (all.includes(n)) bad.push(n);
    assert.deepEqual(bad, []);
    for (const s of strs) assert.ok(workerTextOk(s.replace(/https:\/\/madeinegyptgate\.com\/\S*/g, "")), "rule-free: " + s.slice(0, 80));
    const links = all.match(/https?:\/\/[^\s"<>]+/g) || []; for (const l of links) assert.match(l, /^https:\/\/madeinegyptgate\.com\/(factories\/|research\/)/, l);
    assert.ok(!sitesList().some(n => n.length > 4 && /^[a-z0-9]+$/.test(n) && new RegExp("\\b" + n + "\\b", "i").test(all)), "no shared site label");
  });
  test("badges only from data: member → «member», verified (not a researched «#x» row) → «verified», a web company → none", () => {
    const { r, b } = full(), by = n => Object.values(r.doc.items).find(x => x.label === n || x.entity === n);
    assert.equal(by("شركة الجوهرة لصناعة الورق والكرتون").badge, "member");
    assert.equal(by("مصنع النيل للكرتون").badge, "verified");
    assert.equal(by("إيجيتك للكابلات").badge, undefined); assert.equal(by("إيجيتك للكابلات").link, undefined, "a researched row has no link");
    assert.equal(by("Cairo Print House").badge, undefined); assert.equal(by("Cairo Print House").line, "مطبعة بتوسّع خط الأوفست");
    void b;
  });
  test("headings are the Worker's (never the model's «على المنصة»); the web tender shows no entity and no title from the site", () => {
    const { r } = full();
    assert.equal(r.doc.sections.find(s => s.key === "overview").heading, "الخلاصة");
    const web = Object.values(r.doc.items).find(x => x.k === "tender" && !x.entity && !x.place);
    if (web) { assert.equal(web.label, "مناقصة"); assert.equal(web.title, undefined); }
  });
  test("counts: platform counts from platform items only; tenders_open excludes unknown and web items; members exclude #x rows", () => {
    const { b } = full(), c = countsOf(b.meta, NOW);
    assert.equal(c.platform.members, 1); assert.equal(c.platform.factories, 2); assert.equal(c.tenders_open, 2); assert.equal(c.buyers, 1);
  });
  test("lengths: say ≤ 220, block ≤ 1,200 with the platform note markers; the cue speaks to the member", () => {
    const { r } = full();
    assert.ok(r.say.length <= LIM.say && r.block.length <= LIM.block); assert.match(r.say, /قدامك على الشاشة/);
    assert.match(r.block, /^\[ملاحظة من المنصة: نتيجة البحث R1/); assert.match(r.block, /\[نهاية نتيجة البحث R1\]$/);
    const en = render(check(draft(built()), built().pack, "buyers", { lang: "en" }), { meta: built().meta }, "buyers", job({ voice: "bassem_en", lang: "en" }));
    assert.match(en.block, /^\[PLATFORM NOTE/);
  });
});
describe("research-render: read time", () => {
  test("status is computed when read: open / closing / closed / unknown; a closed tender leaves the opportunity sections", () => {
    assert.deepEqual([statusOf("2026-12-30", NOW), statusOf("2026-11-25", NOW), statusOf("2026-11-01", NOW), statusOf("", NOW)], ["open", "closing", "closed", "unknown"]);
    const { r } = full(), later = Date.parse("2026-12-20T10:00:00Z");
    const d = readDoc(r.doc, { nowMs: later });
    assert.ok(!Object.values(d.items).some(x => x.k === "tender" && x.status === "closed" && d.sections.find(s => s.key === "tender_buyers" && s.blocks.some(b => d.items[b.ref] === x))));
    assert.ok(!JSON.stringify(r.doc).includes("\"status\""), "the stored document holds deadlines, never a status");
  });
  test("hidden items are removed for every reader", () => {
    const { r } = full(), k = Object.keys(r.doc.items)[0];
    assert.equal(readDoc(r.doc, { nowMs: NOW, hidden: [k] }).items[k], undefined);
  });
  test("the e-mail shows «آخر ميعاد» dates, never a status word; every value escaped", () => {
    const { r } = full();
    r.doc.items[Object.keys(r.doc.items)[0]].label = "<img src=x onerror=alert(1)>";
    const m = mailOf(r.doc, { id: "rj0000000000000000000a", nowMs: NOW });
    assert.doesNotMatch(m.html, /<img/); assert.match(m.html, /&lt;img/);
    assert.match(m.text, /آخر ميعاد: 2026-12-10/); assert.doesNotMatch(m.text, /مفتوحة|سارية/);
    assert.match(m.text, /وصلك لأنك طلبته من باسم/);
  });
  test("linkable: only member / imported profiles and product pages; never #x rows, tenders, offers, intel or another site", () => {
    assert.equal(linkable({ origin: "platform", type: "company", page: "/factories/nile/" }), "/factories/nile/");
    assert.equal(linkable({ origin: "platform", type: "company", page: "/factories/x/", pub: true }), "");
    for (const m of [{ origin: "platform", type: "tender", page: "/tender-item/1/" }, { origin: "platform", type: "company", page: "/offers/1/" }, { origin: "intel", type: "tender", page: "/intel/x/" },
      { origin: "platform", type: "company", page: "https://evil.test/factories/x/" }, { origin: "platform", type: "company", page: "//evil.test/factories/x/" }, { origin: "platform", type: "company", page: "javascript:alert(1)" }])
      assert.equal(linkable(m), "", JSON.stringify(m));
  });
});
describe("ai-call", () => {
  test("shapes: chat-completions for Gemma 4 / gpt-oss (strict json_schema, thinking off for Gemma), native for Llama 4 Scout", () => {
    const g = AI.textInput("@cf/google/gemma-4-26b-a4b-it", { system: "s", user: "u", schema: { type: "object" }, maxTokens: 900 });
    assert.equal(g.response_format.json_schema.strict, true); assert.deepEqual(g.chat_template_kwargs, { enable_thinking: false }); assert.equal(g.max_completion_tokens, 900);
    const o = AI.textInput("@cf/openai/gpt-oss-120b", { reasoning: "medium", schema: { type: "object" } }); assert.equal(o.reasoning_effort, "medium");
    const l = AI.textInput("@cf/meta/llama-4-scout-17b-16e-instruct", { schema: { type: "object" } }); assert.equal(AI.shapeOf("@cf/meta/llama-4-scout-17b-16e-instruct"), "native"); assert.deepEqual(l.response_format, { type: "json_schema", json_schema: { type: "object" } });
  });
  test("JSON from both answer shapes, lenient; usage → neurons", () => {
    assert.deepEqual(AI.jsonOf({ response: "x {\"a\":1} y" }), { a: 1 }); assert.deepEqual(AI.jsonOf({ choices: [{ message: { content: "{\"b\":2}" } }] }), { b: 2 });
    assert.deepEqual(AI.jsonOf({ response: { c: 3 } }), { c: 3 }); assert.equal(AI.jsonOf({ response: "nope" }), null);
    assert.equal(AI.neuronsOf("@cf/google/gemma-4-26b-a4b-it", { in: 1e6, out: 1e6 }), 9091 + 27273);
  });
  test("error codes; exactly two arguments to env.AI.run (three only with rejectIfBusy) — never a gateway", async () => {
    assert.deepEqual(["5028 x", "3040 y", "3036", "5035", "5016", "3007", "boom"].map(m => AI.codeOf(new Error(m))), ["model_retired", "ai_busy", "ai_free_used", "ai_paid_only", "ai_terms", "ai_timeout", "ai_error"]);
    const calls = [], env = { AI: { run: (...a) => { calls.push(a); return { response: "{\"x\":1}", usage: { prompt_tokens: 10, completion_tokens: 5 } }; } } };
    const r = await AI.aiText(env, "@cf/meta/llama-4-scout-17b-16e-instruct", { system: "s", user: "u", schema: { type: "object" } });
    assert.equal(r.ok, true); assert.equal(calls[0].length, 2);
    await AI.aiText(env, "@cf/deepseek-ai/deepseek-v4.1-flash-1017", { system: "s", user: "u", schema: { type: "object" }, rejectIfBusy: true });
    assert.deepEqual(calls[1][2], { rejectIfBusy: true });
    for (const c of calls) assert.ok(!c.some(x => x && typeof x === "object" && "gateway" in x));
    const t = await AI.aiText({ AI: { run: () => new Promise(() => {}) } }, "@cf/openai/gpt-oss-120b", { timeoutMs: 20 }); assert.equal(t.code, "ai_timeout");
    assert.ok(AI.MODEL_ALLOW.every(m => AI.MODEL_RATES[m]));
  });
});
describe("ai-budget", () => {
  test("reserve / settle / refuse past the ceiling and past the feature's share; a re-run reserves once; Cairo-day keys", async () => {
    const env = { DB: new D1() }, day = cairoDay(NOW);
    assert.equal((await aiReserve(env, "research", 1000, "j1|1", { nowMs: NOW, day_neurons: 10000 })).ok, true);
    assert.equal((await aiReserve(env, "research", 1000, "j1|1", { nowMs: NOW, day_neurons: 10000 })).again, true);
    assert.equal((await aiToday(env, { nowMs: NOW, day_neurons: 10000 })).used, 1000);
    assert.equal(await aiSettle(env, "research", "j1|1", 600, { nowMs: NOW }), true);
    assert.equal(await aiSettle(env, "research", "j1|1", 600, { nowMs: NOW }), false, "settled once");
    assert.equal((await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind("aiday|" + day).first()).n, 600);
    assert.equal((await aiReserve(env, "research", 3500, "j2|1", { nowMs: NOW, day_neurons: 10000 })).ok, false, "research ≤ 40 %");
    assert.equal((await env.DB.prepare("SELECT n FROM rl WHERE k = ?").bind("aiday|" + day).first()).n, 600, "a refusal gives back");
    assert.equal((await aiReserve(env, "chat", 5900, "c|1", { nowMs: NOW, day_neurons: 10000 })).ok, true);
    assert.equal((await aiReserve(env, "test", 4000, "t|1", { nowMs: NOW, day_neurons: 10000 })).ok, false, "the ceiling");
    assert.notEqual(addDays(day, 1), day);
  });
});
