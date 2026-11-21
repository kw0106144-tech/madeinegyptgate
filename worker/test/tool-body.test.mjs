/* 2026-11-21: Janna's server-webhook tools failed. Janna AR's model (azure_openai) sent some calls FLAT ({query, section}) instead of the
   nested {bodyParams:{…}} Anam builds a webhook request from; Anam then POSTed an EMPTY body, so janna_lookup answered «bad json» (req.json()),
   knowledge_lookup bad_json, janna_web_search query_required and janna_web_hunt product_required («tell me the product» — although the
   visitor had said it). Sessions 5638390d / 88c2befb / 000a999d / 2debf3e0 / ffd17125; the nested retry ~3 s later worked every time.
   src/common.js toolArgs reads every form the arguments may come in; a call whose arguments never arrived gets empty_args + a text that has
   the model send it again ONCE nested. Validation is unchanged: garbage / arrays / scalars stay bad_json, the endpoints' field errors stay. */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { toolBody, toolArgs, flatToolArgs, toolEmptyText } from "../src/common.js";
import { D1 } from "./helpers.mjs";

const SITE = "https://madeinegyptgate.com";
const R = (body, { path = "/api/janna/lookup", qs = "", ct = "application/json", method = "POST" } = {}) =>
  new Request(SITE + path + qs, { method, headers: ct ? { "Content-Type": ct } : {}, body: method === "GET" ? undefined : body });
const enc = encodeURIComponent;
let logs, realLog, realWarn, realErr;
beforeEach(() => { logs = []; realLog = console.log; realWarn = console.warn; realErr = console.error; console.log = console.warn = console.error = (...a) => logs.push(a.map(String).join(" ")); });
afterEach(() => { console.log = realLog; console.warn = realWarn; console.error = realErr; });

describe("toolArgs: every form a webhook's arguments may arrive in", () => {
  test("flat JSON (Anam's normal body) and the nested shapes: bodyParams / queryParams / pathParams / arguments / parameters / args / input, objects or JSON text; headers never", async () => {
    const want = { section: "factories", query: "بلاستيك" };
    for (const b of [want, { bodyParams: want }, { arguments: want }, { parameters: want }, { args: want }, { input: want }, { arguments: JSON.stringify(want) }, { bodyParams: JSON.stringify(want) },
      { queryParams: { section: "factories" }, bodyParams: { query: "بلاستيك" }, headers: { "X-Janna-Key": "x" } }]) {
      const r = await toolArgs(R(JSON.stringify(b)));
      assert.deepEqual([r.bad, r.empty, r.a], [false, false, want], JSON.stringify(b));
    }
    assert.deepEqual((await toolArgs(R("﻿" + JSON.stringify(want)))).a, want, "a BOM");
    assert.deepEqual((await toolArgs(R(JSON.stringify({ section: "tenders", bodyParams: { section: "rfqs", query: "حديد" } })))).a, { section: "tenders", query: "حديد" }, "a top-level field wins over a wrapper's");
    assert.deepEqual(flatToolArgs({ arguments: "not json", query: "x" }), { arguments: "not json", query: "x" }, "a wrapper name holding plain text is an ordinary field");
  });
  test("an empty body: the query string carries the arguments, or nothing arrived (empty)", async () => {
    for (const b of ["", "  ", "null", "undefined"]) {
      const none = await toolArgs(R(b));
      assert.deepEqual([none.bad, none.empty, none.a], [false, true, {}], JSON.stringify(b));
      const qs = await toolArgs(R(b, { qs: "?section=tenders&query=" + enc("حديد") }));
      assert.deepEqual([qs.bad, qs.empty, qs.a], [false, false, { section: "tenders", query: "حديد" }]);
    }
    const nest = await toolArgs(R("", { qs: "?bodyParams=" + enc(JSON.stringify({ query: "ورق" })) }));
    assert.deepEqual(nest.a, { query: "ورق" }, "the nested shape in the query string too");
    const blankQs = await toolArgs(R("", { qs: "?query=&section=" }));
    assert.equal(blankQs.empty, true, "blank values are no arguments");
    const obj = await toolArgs(R("{}"));
    assert.deepEqual([obj.bad, obj.empty, obj.a], [false, false, {}], "a JSON {} is not «nothing arrived»: the endpoint's own field errors answer it");
    assert.equal((await toolArgs(R("", { method: "GET", qs: "?query=x" }))).empty, false);
  });
  test("form-encoded and multipart bodies (text fields only)", async () => {
    assert.deepEqual((await toolArgs(R("section=products&query=" + enc("ورق"), { ct: "application/x-www-form-urlencoded" }))).a, { section: "products", query: "ورق" });
    assert.deepEqual((await toolArgs(R("section=products&query=" + enc("ورق"), { ct: "" }))).a, { section: "products", query: "ورق" }, "no Content-Type");
    assert.deepEqual((await toolArgs(R("bodyParams=" + enc(JSON.stringify({ query: "ورق", section: "products" })), { ct: "application/x-www-form-urlencoded" }))).a, { query: "ورق", section: "products" });
    const fd = new FormData(); fd.append("section", "tenders"); fd.append("query", "كابلات"); fd.append("file", new Blob(["x"]), "a.txt");
    const mp = new Request(SITE + "/api/janna/lookup", { method: "POST", body: fd });
    assert.deepEqual((await toolArgs(mp)).a, { section: "tenders", query: "كابلات" });
  });
  test("validation is not loosened: garbage, arrays, JSON scalars and strings, broken JSON → bad; over the size limit → tooLarge", async () => {
    for (const b of ["{not json", "[1,2]", '"query"', "42", "true", "hello", "<xml/>", '{"query":"x"', "query"]) assert.equal((await toolArgs(R(b))).bad, true, b);
    assert.equal((await toolArgs(R(JSON.stringify({ query: "x".repeat(20000) })))).tooLarge, true);
    assert.equal((await toolArgs(R(JSON.stringify({ query: "x".repeat(5000) })), { max: 4096 })).tooLarge, true);
  });
  test("toolBody (the body alone) keeps its contract: an object or null", async () => {
    assert.deepEqual(await toolBody(R('{"section":"factories","query":"بلاستيك"}')), { section: "factories", query: "بلاستيك" });
    assert.deepEqual(await toolBody(R('{"bodyParams":{"query":"حديد"},"queryParams":{"section":"tenders"},"headers":{"x":"1"}}')), { section: "tenders", query: "حديد" });
    assert.deepEqual(await toolBody(R("")), {});
    assert.deepEqual(await toolBody(R("section=products&query=%D9%88%D8%B1%D9%82")), { section: "products", query: "ورق" });
    assert.equal(await toolBody(R("{not json")), null); assert.equal(await toolBody(R("[1,2]")), null); assert.equal(await toolBody(R("hello")), null);
  });
  test("the retry text names bodyParams with the tool's own example, in Arabic and English", () => {
    const ar = toolEmptyText("section و query", { section: "factories", query: "بلاستيك" }), en = toolEmptyText("section, query", { query: "steel" }, true);
    assert.ok(ar.includes('{"bodyParams":{"section":"factories","query":"بلاستيك"}}') && /مرة واحدة بس/.test(ar), ar);
    assert.ok(en.includes('{"bodyParams":{"query":"steel"}}') && /ONCE/.test(en), en);
  });
});

describe("the endpoints: the arguments arrive, whatever the form; a call without any gets empty_args", () => {
  const env = () => ({ DB: new D1() });
  const call = async (req, e) => { const res = await worker.fetch(req, e || env(), { waitUntil() {} }); return { status: res.status, data: await res.json() }; };
  test("janna_lookup: flat, nested, query string with an empty body, form → real results; empty → empty_args (200, one log line, no body logged); garbage → bad json", async () => {
    const want = { section: "factories", query: "بلاستيك" };
    const forms = [R(JSON.stringify(want)), R(JSON.stringify({ bodyParams: want })), R("", { qs: "?section=factories&query=" + enc("بلاستيك") }),
      R("section=factories&query=" + enc("بلاستيك"), { ct: "application/x-www-form-urlencoded" }), R(JSON.stringify({ arguments: JSON.stringify(want) }))];
    for (const q of forms) { const r = await call(q); assert.ok(r.status === 200 && !r.data.error && r.data.count > 0, JSON.stringify(r.data).slice(0, 200)); }
    logs = [];
    const e = await call(R(""));
    assert.deepEqual([e.status, e.data.error, e.data.code, e.data.count], [200, "empty arguments", "empty_args", 0]);
    assert.ok(e.data.text.includes("bodyParams") && e.data.text.includes('"section":"factories"'), e.data.text);
    assert.deepEqual(logs, ["tool-soft-error /api/janna/lookup empty_args"]);
    const b = await call(R("{nope")); assert.deepEqual([b.status, b.data.error], [200, "bad json"]);
    const q0 = await call(R("{}")); assert.deepEqual([q0.status, q0.data.error], [200, "query required"], "a JSON {} keeps its field error");
    const g = await call(R("", { method: "GET", qs: "?section=factories&query=" + enc("بلاستيك") })); assert.ok(g.status === 200 && g.data.count > 0, "GET as before");
  });
  test("platform_item: the id arrives in every form; empty → empty_args", async () => {
    const lk = await call(R(JSON.stringify({ section: "tenders", query: "توريد" })));
    const id = lk.data.results[0].id; assert.ok(id, JSON.stringify(lk.data).slice(0, 200));
    const want = { section: "tenders", id };
    for (const q of [R(JSON.stringify(want), { path: "/api/janna/item" }), R(JSON.stringify({ bodyParams: want }), { path: "/api/janna/item" }),
      R("", { path: "/api/janna/item", qs: "?section=tenders&id=" + enc(id) }), R(JSON.stringify({ parameters: want }), { path: "/api/janna/item" })]) {
      const r = await call(q); assert.equal(r.data.found, true, JSON.stringify(r.data).slice(0, 200));
    }
    const e = await call(R("", { path: "/api/janna/item" }));
    assert.deepEqual([e.status, e.data.found, e.data.code], [200, false, "empty_args"]); assert.ok(e.data.text.includes("bodyParams"));
    const s = await call(R("{}", { path: "/api/janna/item" })); assert.equal(s.data.error, "section required");
  });
  test("knowledge_lookup: the query arrives in every form (no query_required); empty → empty_args; garbage → bad_json", async () => {
    for (const q of [R(JSON.stringify({ query: "الباقات" }), { path: "/api/janna/knowledge" }), R(JSON.stringify({ bodyParams: { query: "الباقات" } }), { path: "/api/janna/knowledge" }),
      R("", { path: "/api/janna/knowledge", qs: "?query=" + enc("الباقات") })]) {
      const r = await call(q); assert.ok(r.status === 200 && !r.data.error, JSON.stringify(r.data));
    }
    const e = await call(R("", { path: "/api/janna/knowledge" }));
    assert.deepEqual([e.status, e.data.ok, e.data.code], [200, false, "empty_args"]); assert.ok(e.data.text.includes("bodyParams") && /ماتخترعش/.test(e.data.text), e.data.text);
    assert.equal((await call(R("[]", { path: "/api/janna/knowledge" }))).data.code, "bad_json");
    assert.equal((await call(R("{}", { path: "/api/janna/knowledge" }))).data.code, "invalid");
  });
});
