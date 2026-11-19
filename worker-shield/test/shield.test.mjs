import test from "node:test"; import assert from "node:assert/strict";
import { normCidr, parseFeed, buildItems, run } from "../src/index.js";
test("normCidr keeps public IPv4 and rejects private/invalid", () => {
  assert.equal(normCidr("1.2.3.4"), "1.2.3.4"); assert.equal(normCidr("1.2.3.4/32"), "1.2.3.4");
  assert.equal(normCidr("5.6.7.8/24"), "5.6.7.0/24"); assert.equal(normCidr("10.1.2.3"), null);
  assert.equal(normCidr("192.168.1.1/24"), null); assert.equal(normCidr("1.2.3.4/4"), null); assert.equal(normCidr("999.1.1.1"), null);
  assert.equal(normCidr("2001:db8::1"), null); assert.equal(normCidr("1.2.3.4 ; SBL123"), "1.2.3.4");
});
test("parseFeed ndjson and lines", () => {
  assert.deepEqual(parseFeed('{"cidr":"1.10.16.0/20","sblid":"SBL1"}\n{"type":"metadata"}\n', "ndjson-cidr"), ["1.10.16.0/20"]);
  assert.deepEqual(parseFeed("# c\n1.2.3.4\n\n5.6.7.8\n", "lines"), ["1.2.3.4", "5.6.7.8"]);
});
test("buildItems merges feeds and auto-bans, dedupes", async () => {
  const kv = { async list() { return { keys: [{ name: "ban:9.9.9.9" }], list_complete: true }; } };
  const env = { BANS: kv, FEEDS: JSON.stringify([{ id: "a", url: "a", format: "lines" }, { id: "b", url: "b", format: "lines" }]) };
  const r = await buildItems(env, async u => u === "a" ? "1.2.3.4\n9.9.9.9\n" : "1.2.3.4\n8.8.4.0/24\n");
  assert.deepEqual(r.items.map(i => i.ip), ["9.9.9.9", "1.2.3.4", "8.8.4.0/24"]); assert.equal(r.items[0].comment, "auto-ban");
});
test("run without token does nothing", async () => { const r = await run({}); assert.equal(r.reason, "no_token"); });
test("run refuses to wipe the list when feeds fail", async () => {
  const env = { CF_LISTS_TOKEN: "x", ACCOUNT_ID: "a", LIST_ID: "l", FEEDS: JSON.stringify([{ id: "a", url: "a", format: "lines" }]) };
  const r = await run(env, async () => { throw new Error("down"); }); assert.equal(r.reason, "feeds_broken");
});
