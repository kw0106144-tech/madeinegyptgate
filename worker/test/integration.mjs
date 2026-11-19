// End-to-end check against the real Workers runtime (workerd) and a local D1 database:
//   node test/integration.mjs            (needs wrangler: `npm install` in worker/, or WRANGLER_BIN=/path/to/wrangler)
// Applies schema.sql to a throw-away local D1, starts `wrangler dev --local`, then exercises health → session → deals →
// email (no provider → draft) → inbound reply (platform mode: activation link → login) through Wrangler's local email endpoint (/cdn-cgi/handler/email).
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
const bin = process.env.WRANGLER_BIN || join(root, "node_modules", ".bin", "wrangler");
if (!existsSync(bin)) { console.log("SKIP: wrangler not installed (npm install, or set WRANGLER_BIN)"); process.exit(0); }
const cfg = join(here, "wrangler.integration.toml"), persist = mkdtempSync(join(tmpdir(), "advisor-d1-")), port = String(8790 + Math.floor(Math.random() * 100));
const common = ["--config", cfg, "--persist-to", persist];
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_API_TOKEN: "", NO_COLOR: "1" };

const d1 = spawnSync(bin, ["d1", "execute", "DB", "--local", "--file", join(root, "schema.sql"), ...common], { cwd: root, env, encoding: "utf8" });
if (d1.status !== 0) { console.error(d1.stdout, d1.stderr); process.exit(1); }
console.log("schema applied to local D1");

const dev = spawn(bin, ["dev", "--local", "--port", port, "--ip", "127.0.0.1", "--var", "ADVISOR_SECRET:integration-secret", "--var", "PLATFORM_KEY:integration-pkey", "--show-interactive-dev-session=false", ...common], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; dev.stdout.on("data", d => (log += d)); dev.stderr.on("data", d => (log += d));
const base = `http://127.0.0.1:${port}`;
const stop = code => { dev.kill("SIGTERM"); rmSync(persist, { recursive: true, force: true }); process.exit(code); };
const j = async (path, opt = {}) => { const r = await fetch(base + path, { ...opt, headers: { "Content-Type": "application/json", ...(opt.headers || {}) } }); return { status: r.status, data: await r.json().catch(() => null) }; };

try {
  for (let i = 0; ; i++) { try { await fetch(base + "/api/advisor/health"); break; } catch (e) { if (i > 120) throw new Error("wrangler dev did not start\n" + log); await new Promise(r => setTimeout(r, 500)); } }
  const h = await j("/api/advisor/health");
  assert.deepEqual([h.data.ok, h.data.store], [true, "d1"]); console.log("health", h.data);
  const janna = await j("/api/janna/health"); assert.equal(janna.data.ok, true); console.log("janna health still ok, factories:", janna.data.factories);
  assert.deepEqual([h.data.mode, h.data.login], ["platform", "activation"]);
  const PK = { "X-Platform-Key": "integration-pkey" };
  assert.equal((await j("/api/advisor/session", { method: "POST", body: JSON.stringify({ member_id: "it-1", plan: "strategic" }) })).status, 401); // browser: no key
  assert.equal((await j("/api/advisor/activation", { method: "POST", headers: PK, body: JSON.stringify({ member_id: "x", plan: "basic" }) })).status, 403);
  // platform activates the member → one-time link → the page exchanges the code for a token
  const act = await j("/api/advisor/activation", { method: "POST", headers: PK, body: JSON.stringify({ member_id: "it-1", company: "Integration Co", email: "owner@integration.test", plan: "strategic" }) });
  assert.equal(act.status, 200); assert.equal(act.data.emailed, false); console.log("activation link:", act.data.activation_url.replace(/[a-f0-9]{40}$/, "…"));
  const code = act.data.activation_url.split("#login=")[1];
  const s = await j("/api/advisor/login", { method: "POST", body: JSON.stringify({ code }) });
  assert.equal(s.status, 200); assert.equal(s.data.member.verified, true); const auth = { Authorization: "Bearer " + s.data.token };
  assert.equal((await j("/api/advisor/login", { method: "POST", body: JSON.stringify({ code }) })).status, 401); // single use
  const c = await j("/api/advisor/deals", { method: "POST", headers: auth, body: JSON.stringify({ opportunity: { ref: "IT-1", title: "Integration tender", market: "europe", kind: "pvt" } }) });
  assert.equal(c.status, 201); const deal = c.data.deal; console.log("deal", deal.id, deal.reply_to);
  const p = await j("/api/advisor/deals/" + deal.id, { method: "PATCH", headers: auth, body: JSON.stringify({ stage: "offer", notes: "integration" }) });
  assert.equal(p.data.deal.stage, "offer");
  const e = await j(`/api/advisor/deals/${deal.id}/email`, { method: "POST", headers: auth, body: JSON.stringify({ to: "buyer@example.com", subject: "Hello", body: "مرحبًا" }) });
  assert.deepEqual([e.data.sent, e.data.error, e.data.message.status], [false, "email not configured", "draft"]); console.log("email (no provider):", e.data.error);
  const raw = ["From: Buyer <buyer@example.com>", `To: ${deal.reply_to}`, "Subject: =?UTF-8?B?" + Buffer.from("رد على العرض").toString("base64") + "?=", "Message-ID: <it-1@example.com>", "Content-Type: text/plain; charset=UTF-8", "", "Thanks, please send the price list.", ""].join("\r\n");
  const r = await fetch(`${base}/cdn-cgi/handler/email?from=buyer%40example.com&to=${encodeURIComponent(deal.reply_to)}`, { method: "POST", body: raw });
  console.log("inbound email handler:", r.status);
  const m = await j(`/api/advisor/deals/${deal.id}/messages`, { headers: auth });
  const inbound = m.data.messages.find(x => x.direction === "in");
  assert.ok(inbound, "inbound reply stored"); assert.equal(inbound.subject, "رد على العرض");
  assert.deepEqual([inbound.envelope_from, inbound.sender_verified], ["buyer@example.com", false]); console.log("inbound sender:", inbound.envelope_from, inbound.sender_auth);
  console.log("thread:", m.data.messages.map(x => `${x.direction}/${x.status}: ${x.subject}`).join(" | "));
  console.log("INTEGRATION OK");
  stop(0);
} catch (e) { console.error(e && e.stack || e, "\n--- wrangler log ---\n" + log.slice(-4000)); stop(1); }
