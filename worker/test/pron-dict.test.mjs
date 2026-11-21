/* 2026-11-22: Janna said «بسم» for «باسم» — the Arabic call's token request carries the pronunciation dictionary (janna-session.js) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pronDict } from "../src/janna-session.js";
test("pronDict: the [vars] id, nothing when unset or malformed", () => {
  assert.equal(pronDict({ PRON_DICT_ID: "142e481d-0594-4491-a518-92f0ecec8192" }), "142e481d-0594-4491-a518-92f0ecec8192");
  assert.equal(pronDict({}), ""); assert.equal(pronDict({ PRON_DICT_ID: "0" }), ""); assert.equal(pronDict({ PRON_DICT_ID: "x; drop" }), "");
});
