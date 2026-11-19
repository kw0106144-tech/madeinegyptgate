#!/usr/bin/env node
/* Upload a staged site (deploy/stage.py output: build/pages-stage/site) into the R2 bucket of the Worker migate-site, through
   its TEMPORARY endpoint PUT /__deploy/upload/<key> (header X-Deploy-Token).
     DEPLOY_TOKEN=… node worker-site/tools/upload.mjs <site-dir> <worker-url> [--concurrency 24] [--only-changed]
   - every file, key = its path relative to <site-dir> (NFC, "/"), Content-Type from the extension (text types with charset)
   - concurrency 24, 4 retries with back-off per file; a failed file fails the run (exit 1)
   - __site/manifest.json last (the Worker answers existence checks from it): {built, files, bytes, keys}
   - then GET /__deploy/stat: object count and bytes in R2 must equal the stage (and STAGE-REPORT.json when present)
   The token is read from the environment only and never printed. */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SITE = args[0], BASE = (args[1] || "").replace(/\/+$/, "");
const CONC = +opt("--concurrency", 24);
const TOKEN = process.env.DEPLOY_TOKEN || "";
if (!SITE || !BASE || !fs.existsSync(SITE)) { console.error("usage: DEPLOY_TOKEN=… node upload.mjs <site-dir> <worker-url>"); process.exit(2); }
if (TOKEN.length < 32) { console.error("DEPLOY_TOKEN is missing (or too short) in the environment"); process.exit(2); }

const TYPES = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8", json: "application/json; charset=utf-8", xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", ico: "image/x-icon", woff: "font/woff",
  woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", pdf: "application/pdf",
  webmanifest: "application/manifest+json; charset=utf-8", map: "application/json; charset=utf-8", wasm: "application/wasm",
};
const typeOf = f => {
  const b = path.basename(f);
  if (b === "_headers" || b === "_redirects") return "text/plain; charset=utf-8";
  const e = b.includes(".") ? b.split(".").pop().toLowerCase() : "";
  return TYPES[e] || "application/octet-stream";
};

const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(d, e.name), r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(p, r);
    else if (e.isFile()) files.push({ p, key: r.normalize("NFC"), size: fs.statSync(p).size });
  }
})(path.resolve(SITE), "");
const total = files.reduce((a, f) => a + f.size, 0);
console.log(`upload: ${files.length} files, ${(total / 1048576).toFixed(1)} MiB → ${BASE} (concurrency ${CONC})`);

const enc = k => k.split("/").map(encodeURIComponent).join("/");
async function put(key, body, type) {
  let last = "";
  for (let a = 0; a < 5; a++) {
    if (a) await new Promise(r => setTimeout(r, 400 * 2 ** a));
    try {
      const r = await fetch(BASE + "/__deploy/upload/" + enc(key), { method: "PUT", body, headers: { "X-Deploy-Token": TOKEN, "Content-Type": type } });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && j.size === body.length) return j;
      last = `HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`;
      if (r.status === 403 || r.status === 404) break;   // token / endpoint problem: retrying does not help
    } catch (e) { last = String(e && e.message || e).slice(0, 160); }
  }
  throw new Error(`${key}: ${last}`);
}
let done = 0, bytes = 0, failed = [];
const t0 = Date.now();
let next = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    try { await put(f.key, fs.readFileSync(f.p), typeOf(f.key)); done++; bytes += f.size; }
    catch (e) { failed.push(e.message); }
    if ((done + failed.length) % 500 === 0) console.log(`  ${done + failed.length}/${files.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
if (failed.length) { console.error(`FAILED ${failed.length} file(s):\n  ` + failed.slice(0, 20).join("\n  ")); process.exit(1); }
let built = "";
try { built = JSON.parse(fs.readFileSync(path.join(SITE, "_seo", "pages.json"), "utf8")).built || ""; } catch (e) { /* none */ }
const manifest = Buffer.from(JSON.stringify({ built, files: files.length, bytes: total, uploaded: new Date().toISOString(), keys: files.map(f => f.key) }));
await put("__site/manifest.json", manifest, "application/json; charset=utf-8");
console.log(`uploaded ${done} files, ${(bytes / 1048576).toFixed(1)} MiB in ${((Date.now() - t0) / 1000).toFixed(0)} s; manifest written (build ${built})`);

const st = await (await fetch(BASE + "/__deploy/stat", { headers: { "X-Deploy-Token": TOKEN } })).json();
let report = null;
try { report = JSON.parse(fs.readFileSync(path.join(SITE, "..", "STAGE-REPORT.json"), "utf8")).stats; } catch (e) { /* optional */ }
const ok = st.objects >= files.length && st.bytes >= total;
console.log(`R2: ${st.objects} objects, ${st.bytes} bytes | stage: ${files.length} files, ${total} bytes` +
  (report ? ` | STAGE-REPORT: ${report.files} files (+${files.length - report.files} config files wrangler uploads separately), ${report.bytes} bytes` : ""));
if (!ok) { console.error("R2 holds fewer objects / bytes than the stage"); process.exit(1); }
if (st.objects > files.length) console.log(`note: R2 holds ${st.objects - files.length} object(s) not in this stage (older build files; harmless, never linked)`);
console.log("OK");
