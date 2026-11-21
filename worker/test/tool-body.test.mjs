/* 2026-11-21: janna_lookup / knowledge_lookup answered «bad json» to every call — the tool body is read tolerantly (src/common.js toolBody) */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toolBody } from "../src/common.js";
const R = body => new Request("https://x.test/api/janna/lookup", { method: "POST", body });
describe("toolBody", () => {
  test("a plain JSON object", async () => assert.deepEqual(await toolBody(R('{"section":"factories","query":"بلاستيك"}')), { section: "factories", query: "بلاستيك" }));
  test("arguments nested in bodyParams / queryParams are merged, headers never", async () => {
    assert.deepEqual(await toolBody(R('{"bodyParams":{"query":"حديد"},"queryParams":{"section":"tenders"},"headers":{"x":"1"}}')), { section: "tenders", query: "حديد" });
  });
  test("an empty body is no error (the arguments came in the query string)", async () => assert.deepEqual(await toolBody(R("")), {}));
  test("a form-encoded body", async () => assert.deepEqual(await toolBody(R("section=products&query=%D9%88%D8%B1%D9%82")), { section: "products", query: "ورق" }));
  test("garbage or a JSON array is refused", async () => { assert.equal(await toolBody(R("{not json")), null); assert.equal(await toolBody(R("[1,2]")), null); assert.equal(await toolBody(R("hello")), null); });
});
