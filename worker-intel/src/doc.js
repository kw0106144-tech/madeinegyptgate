/* migate-intel — read ONE item's own official document for Bassem's tool (POST /api/intel/tool {action:"doc", id}).
   Owner 2026-11-19: «بيقولي مش قادر اقرء الملف ال بي دي اف بتاع المناقصة في جنوب افريقيا ازا بقي هو مستشار اعمال».
   What is read: ONLY the item's own stored official link (intel_items.url — for most tenders the notice document itself, e.g. the
   eTenders advert PDF) and, when that link is a notice page or an OCDS release, at most ONE document it links to on the same official
   site. Never an address the model or the caller supplies: the tool takes an item id (a link it is given only finds the item).
   SSRF guards on every hop (the first one and each redirect): https only (an http link is tried once as https), port 443, no user
   info, a public DNS name (no IP literal, no localhost / .local / .internal / …, not this platform's own zone), at most 3 redirects,
   each checked again, a redirect to a sign-in page is reported as such; robots.txt respected (engine.js robotsFor, cached in KV).
   One deadline (DOC_LIMITS.fetchMs = 12 s) for all the network reads of a request; size caps per type (Content-Length first, then
   while streaming); types: PDF, DOCX, HTML (+ plain text, + an OCDS release JSON for its document list).
   Conversion: PDF / DOCX → Workers AI env.AI.toMarkdown (embedded images are not converted, so no image model runs), charged ONE
   unit against AI_DAILY_LIMIT before the call (enrich.js chargeAi; the enrichment leaves AI_DOC_RESERVE units of the cap for these
   reads). Without AI (no binding, cap reached, an error) a local fallback: the text of simple-font PDFs (FlateDecode content streams,
   text operators — a scanned or CID-font PDF gives no readable text and is flagged, never guessed), DOCX word/document.xml. HTML and
   plain text are always read locally (no AI).
   Output: a bounded excerpt (≤ DOC_LIMITS.excerpt characters) of the parts about the requirements — scope / specifications,
   eligibility, documents, bid bond, deadline, submission, briefing — in the document's own words, contacts and links removed, plus
   honest flags (unreachable, timeout, login, forbidden, robots, gone, busy, too_large, unsupported, not_https, unsafe_url,
   too_many_redirects, scanned, unreadable, encrypted, empty, no_document). */
import { UA, clip, stripContacts, decodeEntities } from "./util.js";
import { robotsFor, robotsAllows } from "./engine.js";
import { aiBudget, chargeAi } from "./enrich.js";

export const DOC_LIMITS = {
  fetchMs: 12000, convertMs: 20000, maxRedirects: 3, excerpt: 6000, keyLines: 6,
  maxBytes: { pdf: 10_000_000, docx: 8_000_000, html: 3_000_000, text: 1_000_000, json: 2_000_000 },
  inflateStream: 4_000_000, inflateTotal: 16_000_000, minText: 120,
};
const MAX_ANY = Math.max(...Object.values(DOC_LIMITS.maxBytes));

/* ---------- the address guard (every hop) ---------- */
const PRIVATE_SUFFIX = /(?:^|\.)(?:localhost|localdomain|local|internal|intranet|lan|home|corp|private|test|example|invalid|onion|arpa)$/i;
const OWN_ZONE = /(?:^|\.)(?:madeinegyptgate\.com|workers\.dev|pages\.dev)$/i;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;
/* → {url: URL} or {error: "bad_url" | "not_https" | "unsafe_url"}; upgrade: an http link is tried as https (never the reverse) */
export function checkUrl(raw, { upgrade = false } = {}) {
  let u;
  try { u = new URL(String(raw == null ? "" : raw).trim()); } catch (e) { return { error: "bad_url" }; }
  if (u.protocol === "http:" && upgrade) u.protocol = "https:";
  if (u.protocol !== "https:") return { error: "not_https" };
  if (u.username || u.password || (u.port && u.port !== "443")) return { error: "unsafe_url" };
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  /* the URL parser already turned 0x7f.1 / 2130706433 / 127.1 into dotted IPv4; IPv6 literals keep their brackets */
  if (!h || h.includes(":") || h.startsWith("[") || /^[0-9.]+$/.test(h) || !HOST_RE.test(h)) return { error: "unsafe_url" };
  if (PRIVATE_SUFFIX.test(h) || OWN_ZONE.test(h)) return { error: "unsafe_url" };
  u.hash = "";
  return { url: u };
}
/* the official site of a host: «ocds-api.etenders.gov.za» and «www.etenders.gov.za» → «etenders.gov.za» */
const SLD = /^(?:gov|go|co|com|org|net|ac|edu|gob|gouv|govt|gv|mil|nic|or|ne|sch)$/;
export function siteOf(host) {
  const p = String(host || "").toLowerCase().replace(/\.$/, "").replace(/^www\./, "").split(".");
  return (p.length >= 3 && SLD.test(p[p.length - 2]) ? p.slice(-3) : p.slice(-2)).join(".");
}

/* ---------- one fetch with manual redirects, the request's deadline and a size cap ---------- */
const ACCEPT = "application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document;q=0.95, text/html;q=0.9, application/xhtml+xml;q=0.9, application/json;q=0.5, text/plain;q=0.5, */*;q=0.1";
const LOGIN_PATH = /(?:^|[\/._?=&-])(?:log[-_]?in|sign[-_]?in|logon|authenticate|auth|sso|cas|openid|oauth2?)(?:[\/._?#&=-]|$)/i;
const signal = ms => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(Math.max(1, Math.floor(ms))) : undefined);
const isAbort = e => /abort|timeout|timed out/i.test(String((e && (e.name + " " + e.message)) || e));
async function drop(r) { try { if (r && r.body && r.body.cancel) await r.body.cancel(); } catch (e) {} }
function concat(chunks, n) { const out = new Uint8Array(n); let o = 0; for (const c of chunks) { const k = Math.min(c.length, n - o); out.set(c.subarray(0, k), o); o += k; if (o >= n) break; } return out; }
async function readCapped(r, cap) {
  if (!r.body || typeof r.body.getReader !== "function") { const b = new Uint8Array(await r.arrayBuffer()); return b.length > cap ? { tooLarge: true, size: b.length } : { bytes: b }; }
  const rd = r.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    const v = value instanceof Uint8Array ? value : new Uint8Array(value);
    n += v.length;
    if (n > cap) { try { await rd.cancel(); } catch (e) {} return { tooLarge: true, size: n }; }
    chunks.push(v);
  }
  return { bytes: concat(chunks, n) };
}
const ctOf = ct => String(ct || "").toLowerCase().split(";")[0].trim();
function fileName(cd, u) {
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(String(cd || ""));
  let n = m ? m[1] : "";
  if (!n) { const q = /[?&](?:downloadedFileName|filename|file|name)=([^&]+)/i.exec(u.search); n = q ? q[1] : u.pathname.split("/").pop() || ""; }
  try { n = decodeURIComponent(n); } catch (e) {}
  return clip(n.replace(/[\u0000-\u001f"\\/]/g, " ").trim(), 120);
}
/* what the headers and the name promise (before reading the body) */
function promised(ct, name) {
  const c = ctOf(ct);
  if (c === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/wordprocessingml/.test(c) || /\.docx$/i.test(name)) return "docx";
  if (/html|xhtml/.test(c)) return "html";
  if (/json/.test(c)) return "json";
  if (c === "text/plain") return "text";
  if (!c || /octet-stream|binary|download|unknown|x-download|force-download|application\/x-pdf/.test(c)) return "any";
  return "";
}
const latin1 = b => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
/* what the bytes are (magic first): pdf · docx · html · json · text · "" */
export function sniff(bytes, ct, name = "") {
  const head = latin1(bytes.subarray(0, 1024)), c = ctOf(ct);
  if (head.indexOf("%PDF-") >= 0) return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return zipEntries(bytes).some(e => e.name === "word/document.xml") ? "docx" : "";
  if (/html|xhtml/.test(c) || /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype html|<html|<head|<body|<meta|<title)/i.test(head)) return "html";
  if (/json/.test(c) || (/^\s*[\[{]/.test(head) && !/\.pdf$/i.test(name))) return "json";
  if (c === "text/plain") return "text";
  return "";
}
/* robots.txt on the request's deadline (engine.js caches it in KV): "ok" | "robots" | "unreachable" */
async function robotsOk(u, env, o) {
  const left = o.deadline - Date.now();
  const f = (url, init = {}) => o.fetchFn(url, { ...init, signal: signal(Math.min(4000, left)) });
  try { const rb = await robotsFor(u.toString(), env, f); return robotsAllows(rb, u.pathname + u.search) ? "ok" : rb.unreachable ? "unreachable" : "robots"; }
  catch (e) { return "unreachable"; }
}
/* GET one address → {ok, url, kind, ct, name, bytes} or {flag, url, status?} */
export async function fetchDoc(start, env, o) {
  let u = start, hops = 0;
  for (;;) {
    if (o.deadline - Date.now() < 300) return { flag: "timeout", url: u.toString() };
    const rob = await robotsOk(u, env, o);
    if (rob !== "ok") return { flag: rob, url: u.toString() };
    if (o.deadline - Date.now() < 300) return { flag: "timeout", url: u.toString() };
    let r;
    try { r = await o.fetchFn(u.toString(), { method: "GET", headers: { "User-Agent": UA, Accept: ACCEPT, "Accept-Language": "en, fr;q=0.8, ar;q=0.7" }, redirect: "manual", signal: signal(o.deadline - Date.now()) }); }
    catch (e) { return { flag: isAbort(e) ? "timeout" : "unreachable", url: u.toString() }; }
    if (r.status >= 300 && r.status < 400 && r.status !== 304) {
      const loc = r.headers.get("location"); await drop(r);
      if (!loc) return { flag: "unreachable", url: u.toString(), status: r.status };
      if (++hops > DOC_LIMITS.maxRedirects) return { flag: "too_many_redirects", url: u.toString() };
      let next; try { next = new URL(loc, u); } catch (e) { return { flag: "unreachable", url: u.toString(), status: r.status }; }
      if (LOGIN_PATH.test(next.pathname + next.search)) return { flag: "login", url: next.toString() };
      const c = checkUrl(next.toString());
      if (c.error) return { flag: c.error === "not_https" ? "not_https" : "unsafe_url", url: next.toString() };
      u = c.url; continue;
    }
    if (r.status === 401 || r.status === 407) { await drop(r); return { flag: "login", url: u.toString(), status: r.status }; }
    if (r.status === 403) { await drop(r); return { flag: "forbidden", url: u.toString(), status: r.status }; }
    if (r.status === 404 || r.status === 410) { await drop(r); return { flag: "gone", url: u.toString(), status: r.status }; }
    if (r.status === 429) { await drop(r); return { flag: "busy", url: u.toString(), status: r.status }; }
    if (!r.ok) { await drop(r); return { flag: "unreachable", url: u.toString(), status: r.status }; }
    const ct = r.headers.get("content-type") || "", name = fileName(r.headers.get("content-disposition"), u), want = promised(ct, name);
    if (!want) { await drop(r); return { flag: "unsupported", url: u.toString(), type: ctOf(ct) }; }
    const cap = want === "any" ? MAX_ANY : DOC_LIMITS.maxBytes[want];
    const len = +r.headers.get("content-length") || 0;
    if (len > cap) { await drop(r); return { flag: "too_large", url: u.toString(), size: len }; }
    let body;
    try { body = await readCapped(r, cap); } catch (e) { return { flag: isAbort(e) ? "timeout" : "unreachable", url: u.toString() }; }
    if (body.tooLarge) return { flag: "too_large", url: u.toString(), size: body.size };
    const kind = sniff(body.bytes, ct, name);
    if (!kind) return { flag: "unsupported", url: u.toString(), type: ctOf(ct) };
    if (body.bytes.length > DOC_LIMITS.maxBytes[kind]) return { flag: "too_large", url: u.toString(), size: body.bytes.length };
    return { ok: true, url: u.toString(), final: u, kind, ct: ctOf(ct), name, bytes: body.bytes };
  }
}

/* ---------- ZIP (DOCX) ---------- */
export function zipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = [];
  let e = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return out;
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  for (let k = 0; k < count && p + 46 <= bytes.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    out.push({ name: latin1(bytes.subarray(p + 46, p + 46 + nl)), method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), lho: dv.getUint32(p + 42, true) });
    p += 46 + nl + xl + cl;
  }
  return out;
}
/* inflate with an output cap; what was inflated before an error (trailing bytes, a cut stream) is kept */
async function inflate(data, format, cap) {
  const ds = new DecompressionStream(format), w = ds.writable.getWriter();
  w.write(data).catch(() => {}); w.close().catch(() => {});
  const rd = ds.readable.getReader(), chunks = [];
  let n = 0;
  try {
    for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; chunks.push(value); if (n > cap) { rd.cancel().catch(() => {}); break; } }
  } catch (e) { if (!chunks.length) throw e; }
  return concat(chunks, Math.min(n, cap));
}
export async function docxText(bytes) {
  const e = zipEntries(bytes).find(x => x.name === "word/document.xml");
  if (!e || e.usize > DOC_LIMITS.inflateTotal) return "";
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (e.lho + 30 > bytes.length || dv.getUint32(e.lho, true) !== 0x04034b50) return "";
  const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true), data = bytes.subarray(start, start + e.csize);
  const xml = e.method === 0 ? data : e.method === 8 ? await inflate(data, "deflate-raw", DOC_LIMITS.inflateTotal) : null;
  if (!xml) return "";
  const x = new TextDecoder("utf-8").decode(xml);
  return decodeEntities(x.replace(/<w:pStyle\b[^>]*w:val="(?:Heading|Title)[^"]*"[^>]*\/>/g, "\u0001").replace(/<w:tab\/>/g, "\t").replace(/<w:br\b[^>]*\/>|<\/w:p>/g, "\n").replace(/<\/w:tc>/g, " | ").replace(/<[^>]+>/g, ""))
    .replace(/\u0001([^\n]*)/g, "## $1").split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- PDF fallback (no AI): simple fonts only ---------- */
const WIN = { 128: "€", 130: "‚", 131: "ƒ", 132: "„", 133: "…", 134: "†", 135: "‡", 136: "ˆ", 137: "‰", 138: "Š", 139: "‹", 140: "Œ", 142: "Ž", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 152: "˜", 153: "™", 154: "š", 155: "›", 156: "œ", 158: "ž", 159: "Ÿ" };
function pdfStr(raw) {
  if (raw.charCodeAt(0) === 0xfe && raw.charCodeAt(1) === 0xff) { let s = ""; for (let i = 2; i + 1 < raw.length; i += 2) s += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1)); return s; }
  let s = "";
  for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); s += c >= 32 && c < 127 ? raw[i] : c >= 160 ? String.fromCharCode(c) : WIN[c] || (c === 9 || c === 10 || c === 13 ? " " : "\ufffd"); }
  return s;
}
function unescapePdf(b) {
  return b.replace(/\\(?:([0-7]{1,3})|(\r\n|\r|\n)|(.))/gs, (m, oct, nl, ch) => (oct ? String.fromCharCode(parseInt(oct, 8) & 255) : nl ? "" : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[ch] || ch)));
}
const DELIM = /[\s()<>\[\]{}\/%]/;
function* tokens(s) {
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") {
      let d = 1, j = i + 1;
      const st = j;
      while (j < n && d > 0) { const ch = s[j]; if (ch === "\\") { j += 2; continue; } if (ch === "(") d++; else if (ch === ")") d--; if (d > 0) j++; }
      yield { t: "str", v: unescapePdf(s.slice(st, j)) }; i = j + 1; continue;
    }
    if (c === "<" && s[i + 1] === "<") { yield { t: "dict" }; i += 2; continue; }
    if (c === ">" && s[i + 1] === ">") { yield { t: "dict" }; i += 2; continue; }
    if (c === "<") { const j = s.indexOf(">", i); const hx = s.slice(i + 1, j < 0 ? n : j).replace(/[^0-9a-f]/gi, ""); let v = ""; for (let k = 0; k + 1 < hx.length + 1; k += 2) v += String.fromCharCode(parseInt((hx.slice(k, k + 2) + "0").slice(0, 2), 16)); yield { t: "str", v, hex: true }; i = j < 0 ? n : j + 1; continue; }
    if (c === "[" || c === "]") { yield { t: c }; i++; continue; }
    if (c === "{" || c === "}" || /\s/.test(c)) { i++; continue; }
    let j = i + 1;
    while (j < n && !DELIM.test(s[j])) j++;
    const w = s.slice(i, j);
    yield /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(w) ? { t: "num", v: +w } : c === "/" ? { t: "name" } : { t: "op", v: w };
    i = j;
  }
}
/* the text of one content stream: Tj / TJ / ' / " strings, a line break on T* / Td with a y move / a Tm with a new y / ET */
function streamText(cs) {
  const out = [];
  let line = "", ops = [], arr = null, lastY = null;
  const flush = () => { const t = line.replace(/\s+/g, " ").trim(); if (t) out.push(t); line = ""; };
  const num = k => { const x = ops[ops.length + k]; return x && x.t === "num" ? x.v : 0; };
  const add = x => { line += pdfStr(x.v); };
  for (const tk of tokens(cs)) {
    if (arr) { if (tk.t === "]") { ops.push({ t: "arr", v: arr }); arr = null; } else if (arr.length < 4000) arr.push(tk); continue; }
    if (tk.t === "[") { arr = []; continue; }
    if (tk.t !== "op") { ops.push(tk); if (ops.length > 16) ops.shift(); continue; }
    switch (tk.v) {
      case "ET": flush(); break;
      case "Tj": { const x = ops[ops.length - 1]; if (x && x.t === "str") add(x); break; }
      case "'": case '"': { flush(); const x = ops[ops.length - 1]; if (x && x.t === "str") add(x); break; }
      case "TJ": { const a = ops[ops.length - 1]; if (a && a.t === "arr") for (const x of a.v) { if (x.t === "str") add(x); else if (x.t === "num" && x.v < -180 && line && !/\s$/.test(line)) line += " "; } break; }
      case "Td": case "TD": { if (num(-1)) flush(); else if (num(-2) > 0 && line && !/\s$/.test(line)) line += " "; break; }
      case "T*": flush(); break;
      case "Tm": { const y = num(-1); if (lastY !== null && y !== lastY) flush(); else if (line && !/\s$/.test(line)) line += " "; lastY = y; break; }
      default: break;
    }
    ops = [];
  }
  flush();
  return out.join("\n");
}
/* {text, pages, images, encrypted} — content streams that inflate (FlateDecode) or are plain; images, fonts, xref and metadata skipped */
export async function pdfText(bytes) {
  const s = latin1(bytes);
  const info = { pages: (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length, images: (s.match(/\/Subtype\s*\/Image\b/g) || []).length, encrypted: /\/Encrypt\s/.test(s), text: "" };
  if (info.encrypted) return info;
  const parts = [], re = /stream\r?\n/g;
  let m, total = 0, inflated = 0;
  while ((m = re.exec(s)) && total < 600000 && inflated < DOC_LIMITS.inflateTotal) {
    const start = m.index + m[0].length, end = s.indexOf("endstream", start);
    if (end < 0) break;
    re.lastIndex = end + 9;
    const ob = s.lastIndexOf(" obj", m.index), dict = s.slice(Math.max(ob, m.index - 800, 0), m.index);
    if (/\/Subtype\s*\/Image|\/Type\s*\/(?:XRef|ObjStm|Metadata|EmbeddedFile|XObject\s*\/Subtype\s*\/Image)|\/Length[123]\s|\/FontFile/.test(dict)) continue;
    const f = (/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/.exec(dict) || [])[1] || "";
    if (f && !/^(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])$/.test(f.trim())) continue;
    const L = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let data = bytes.subarray(start, L ? Math.min(start + +L[1], end) : end);
    if (f) { try { data = await inflate(data, "deflate", DOC_LIMITS.inflateStream); } catch (e) { continue; } inflated += data.length; }
    const cs = latin1(data);
    if (!/\bBT\b/.test(cs) || !/T[Jj*'"]/.test(cs)) continue;
    const t = streamText(cs);
    if (t) { parts.push(t); total += t.length; }
  }
  info.text = parts.join("\n\n");
  return info;
}
/* real words, not glyph numbers shown as letters */
export function readable(t) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (s.length < 40) return false;
  const letters = (s.match(/\p{L}/gu) || []).length, bad = (s.match(/[\ufffd\u0000-\u0008\u000e-\u001f]/g) || []).length;
  const common = (s.match(/(?:^|[^\p{L}])(?:the|and|of|to|for|in|on|be|shall|with|by|or|is|de|la|le|les|et|des|du|pour|en|au|في|من|على|إلى|عن)(?=$|[^\p{L}])/giu) || []).length;
  return bad / s.length < 0.03 && letters / s.length > 0.45 && common >= Math.min(6, Math.ceil(s.length / 400));
}

/* ---------- HTML ---------- */
export function decodeText(bytes, ct) {
  let cs = (/charset=["']?([\w-]+)/i.exec(String(ct || "")) || [])[1];
  if (!cs) cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(latin1(bytes.subarray(0, 4096))) || [])[1];
  try { return new TextDecoder(cs || "utf-8").decode(bytes); } catch (e) { return new TextDecoder("utf-8").decode(bytes); }
}
const tagText = h => decodeEntities(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export function htmlText(html) {
  let h = String(html || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template|svg|iframe|object|select)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(h) || /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i.exec(h);
  if (main && tagText(main[1]).length > 300) h = main[1];
  else { const b = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(h); if (b) h = b[1]; h = h.replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, " "); }
  h = h.replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (m, t, c) => "\n\n## " + tagText(c) + "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ").replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|tr|table|ul|ol|dl|dd|dt|blockquote|pre|form|fieldset|header|main|caption|label)\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, " | ").replace(/<[^>]+>/g, " ");
  return decodeEntities(h).split("\n").map(l => l.replace(/[ \t\u00a0]+/g, " ").replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
const PASSWORD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;
const DOC_HREF = /\.(?:pdf|docx)(?:$|[?#&])|[?&](?:blobName|downloadedFileName|file(?:name)?)=[^&]*\.(?:pdf|docx)|\bdownload|getDocument|viewDocument|\battachments?\b/i;
const DOC_WORDS = /\b(?:tender|bid(?:ding)?|rfq|rfp|notice|advert(?:isement)?|document|specifications?|terms of reference|tor|download|dossier|cahier|avis)\b|كراسة|المستند|الإعلان|تحميل|الشروط/i;
/* the documents a notice page links to (best first) — same official site only */
export function docLinks(html, base) {
  const out = [], seen = new Set(), b = new URL(base), site = siteOf(b.hostname);
  for (const m of String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const hm = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1]);
    const href = decodeEntities((hm && (hm[1] || hm[2] || hm[3])) || "").trim();
    if (!href || /^(?:#|javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    let u; try { u = new URL(href, b); } catch (e) { continue; }
    if (siteOf(u.hostname) !== site || seen.has(u.toString())) continue;
    const t = tagText(m[2]), p = u.pathname + u.search;
    const score = (DOC_HREF.test(p) ? 2 : 0) + (/\.(?:pdf|docx)(?:$|[?#&])/i.test(p) ? 1 : 0) + (DOC_WORDS.test(t) ? 1 : 0);
    if (score >= 2) { seen.add(u.toString()); out.push({ url: u.toString(), text: clip(t, 80), score }); }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 5);
}
/* an OCDS release / package: its documents (notice first), same official site */
export function jsonDocs(text, base) {
  let d; try { d = JSON.parse(text); } catch (e) { return []; }
  const out = [], site = siteOf(new URL(base).hostname), seen = new Set();
  (function walk(o, depth) {
    if (!o || typeof o !== "object" || depth > 6 || out.length > 20) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    if (Array.isArray(o.documents)) for (const doc of o.documents) {
      const u = doc && typeof doc.url === "string" ? doc.url : "";
      let x; try { x = new URL(u); } catch (e) { continue; }
      if (siteOf(x.hostname) !== site || seen.has(x.toString())) continue;
      seen.add(x.toString());
      const fmt = String(doc.format || doc.title || u);
      out.push({ url: x.toString(), text: clip(String(doc.title || ""), 80), score: (/pdf|docx/i.test(fmt) ? 2 : 0) + (/notice|tender|bidding|advert/i.test(String(doc.documentType || doc.title || "")) ? 1 : 0) });
    }
    for (const k of Object.keys(o)) if (k !== "documents") walk(o[k], depth + 1);
  })(d, 0);
  return out.sort((x, y) => y.score - x.score).slice(0, 5);
}

/* ---------- conversion ---------- */
const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
function withTimeout(p, ms) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("conversion timeout")), ms); })]).finally(() => clearTimeout(t)); }
/* Workers AI toMarkdown (one unit of the daily cap, charged before the call) → {text, tokens} | {skip} | {error} */
export async function aiConvert(env, kind, bytes, name, o = {}) {
  if (!env.AI || typeof env.AI.toMarkdown !== "function") return { skip: "no_ai" };
  const b = await aiBudget(env, o.now || Date.now());
  if (b.left <= 0) return { skip: "cap" };
  await chargeAi(env, b.day, 1);
  const fname = /\.(?:pdf|docx)$/i.test(name || "") ? name : "document." + kind;
  try {
    const res = await withTimeout(env.AI.toMarkdown({ name: fname, blob: new Blob([bytes], { type: MIME[kind] }) },
      { conversionOptions: { pdf: { images: { convert: false }, metadata: false }, docx: { images: { convert: false } } } }), o.convertMs || DOC_LIMITS.convertMs);
    const r = Array.isArray(res) ? res[0] : res;
    if (!r || r.format === "error" || typeof r.data !== "string") return { error: clip(String((r && r.error) || "conversion error"), 160) };
    return { text: r.data, tokens: +r.tokens || 0 };
  } catch (e) { return { error: clip(String((e && e.message) || e), 160) }; }
}
/* one fetched document → {text, via, pages?, flag?, partial?} */
async function toText(env, got, o) {
  if (got.kind === "html") {
    const html = decodeText(got.bytes, got.ct), pw = PASSWORD.test(html);
    /* a sign-in page = nothing much is left once its password form is taken out; a notice page that carries the portal's login box
       beside the notice (GHANEPS, eTenders …) is read, without the box */
    const text = htmlText(pw ? html.replace(/<form\b[\s\S]*?<\/form\s*>/gi, f => (PASSWORD.test(f) ? " " : f)) : html);
    const login = pw && (text.replace(/\s+/g, " ").length < 200 || /log ?in|sign ?in|تسجيل الدخول|connexion/i.test((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || ""));
    return { text, via: "local", html, flag: login ? "login" : "" };
  }
  if (got.kind === "text") return { text: decodeText(got.bytes, got.ct), via: "local" };
  if (got.kind === "json") return { text: "", via: "local", json: decodeText(got.bytes, got.ct) };
  const ai = await aiConvert(env, got.kind, got.bytes, got.name, o);
  if (ai.text && ai.text.replace(/\s+/g, "").length >= 20) {
    const info = got.kind === "pdf" ? pdfMeta(got.bytes) : {};
    return { text: ai.text, via: "ai", pages: info.pages || null, images: info.images || 0, encrypted: !!info.encrypted };
  }
  /* AI not available, at its daily cap, failed or empty: the local reader */
  const skip = ai.skip || (ai.error ? "error" : "empty");
  if (got.kind === "docx") return { text: await docxText(got.bytes).catch(() => ""), via: "local", aiSkip: skip };
  const p = await pdfText(got.bytes).catch(() => ({ text: "", pages: 0, images: 0, encrypted: false }));
  return { text: p.text, via: "local", pages: p.pages || null, images: p.images, encrypted: p.encrypted, aiSkip: skip };
}
function pdfMeta(bytes) { const s = latin1(bytes.subarray(0, Math.min(bytes.length, 4_000_000))); return { pages: (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length, images: (s.match(/\/Subtype\s*\/Image\b/g) || []).length, encrypted: /\/Encrypt\s/.test(s) }; }

/* ---------- the requirements excerpt ---------- */
export const TOPICS = [
  ["scope", "نطاق الشغل (المواصفات والكميات)", /\b(?:scope of (?:the )?(?:works?|supply|services|contract|assignment)|description of (?:the )?(?:goods|works|services|requirements?)|technical (?:specifications?|requirements?)|specifications?|bill of quantities|BOQ|schedule of (?:requirements|quantities)|terms of reference|ToR|quantit(?:y|ies)|supply(?:,)? (?:and|&) (?:delivery|deliver|install\w*)|delivery (?:period|address|of)|lot\s*(?:no\.?\s*)?\d)|objet (?:du|de la) (?:march[ée]|consultation|appel)|cahier des (?:charges|clauses)|sp[ée]cifications? techniques|bordereau des prix|نطاق (?:العمل|الأعمال|التوريد)|المواصفات|جدول الكميات|الكميات المطلوبة|الأصناف المطلوبة|موضوع (?:المناقصة|الممارسة)/i],
  ["eligibility", "شروط التأهيل", /\b(?:eligib\w*|qualification(?:s| criteria| requirements)?|pre-?qualif\w*|evaluation criteria|functionality (?:criteria|evaluation|score)|must be registered|registered (?:on|with|in) (?:the )?(?:central supplier database|CSD)|CSD|B-?BBEE|CIDB|grading (?:of|designation)|tax (?:clearance|compliance|pin)|minimum (?:requirements?|experience|turnover|annual turnover)|similar (?:works|projects|experience)|years? of experience|licen[cs]ed?|accredit\w*|ISO\s?\d{4,5}|joint ventures?|consortium|local content|preference points?)|conditions? (?:de participation|d'admissibilit[ée])|[ée]ligibilit[ée]|crit[èe]res? (?:de qualification|d'[ée]valuation)|capacit[ée] (?:technique|financi[èe]re)|شروط (?:التأهيل|الاشتراك|المشاركة|التقدم)|التأهيل المسبق|السجل التجاري|البطاقة الضريبية|سابقة (?:الأعمال|خبرة)|شهادة (?:التسجيل|الأيزو|المطابقة)/i],
  ["documents", "المستندات المطلوبة", /\b(?:documents? (?:required|to be (?:submitted|attached|provided))|returnable (?:documents|schedules|forms)|mandatory (?:documents|returnable)|submit the following|bid(?:ding)? documents?|tender documents?|SBD\s?\d|MBD\s?\d|certified cop(?:y|ies)|proof of (?:registration|address|payment)|original (?:certificate|tax)|annex(?:ure)?s? [A-Z0-9])|pi[èe]ces? (?:[àa] fournir|administratives|justificatives|constitutives)|dossier (?:d'appel d'offres|de soumission|administratif)|المستندات (?:المطلوبة|المرفقة)|الأوراق المطلوبة|المرفقات المطلوبة|يجب إرفاق|كراسة الشروط/i],
  ["bid_bond", "التأمين (خطاب الضمان)", /\b(?:bid (?:security|bond|guarantee|securing declaration)|tender (?:security|bond|guarantee|deposit)|bank guarantee|performance (?:security|bond|guarantee)|security deposit|earnest money|EMD|retention money|surety)|garantie (?:de soumission|bancaire|de bonne ex[ée]cution|provisoire)|cautionnement|caution (?:de soumission|provisoire|bancaire)|التأمين (?:الابتدائي|المؤقت|النهائي)|تأمين (?:ابتدائي|مؤقت|نهائي)|خطاب (?:ضمان|الضمان)|ضمان بنكي|ضمان العطاء/i],
  ["deadline", "آخر ميعاد", /\b(?:closing (?:date|time)|deadline|due date|submission (?:date|deadline)|must (?:be )?(?:received|submitted|delivered|lodged) (?:by|before|not later than|on or before)|not later than|bids? (?:close|closing|opening)|opening (?:date|of (?:bids|tenders))|validity (?:period|of))|date (?:et heure )?(?:limite|de d[ée]p[oô]t|de remise|de cl[oô]ture|d'ouverture)|au plus tard|آخر (?:موعد|ميعاد)|الموعد النهائي|تاريخ (?:الإغلاق|التقديم|فتح المظاريف)|موعد (?:فتح|تقديم|الإغلاق)/i],
  ["submission", "طريقة التقديم", /\b(?:submi(?:t|ssion of) (?:bids|tenders|offers|proposals|quotations)|bids? (?:shall|must|should) be (?:submitted|delivered|deposited|placed)|tender box|bid box|sealed envelopes?|electronic(?:ally)? submi\w*|e-?(?:tender|procurement) (?:portal|system)|hand[- ]deliver\w*|by courier|deposited in|delivered to|physical address)|d[ée]p[oô]t des (?:offres|plis)|remise des offres|soumission (?:[ée]lectronique|des offres)|sous pli ferm[ée]|تقديم (?:العطاءات|العروض|العرض)|تُقدم العطاءات|تقدم العروض|المظاريف|صندوق العطاءات|التقديم (?:إلكترونيا|الكترونيا)/i],
  ["briefing", "جلسة التعريف أو زيارة الموقع", /\b(?:(?:compulsory|mandatory|non-compulsory) (?:briefing|clarification|site)|briefing (?:session|meeting)|clarification (?:session|meeting)|site (?:visit|inspection|meeting)|pre-?bid (?:meeting|conference))|visite (?:de site|des lieux)|r[ée]union pr[ée]paratoire|جلسة (?:تعريفية|استفسارات|توضيحية)|زيارة (?:الموقع|ميدانية)/i],
];
export const TOPIC_AR = Object.fromEntries(TOPICS.map(t => [t[0], t[1]]));
/* the text as read: no links, e-mail addresses or phone numbers; no page headers / footers repeated on every page */
export function cleanDocText(raw) {
  let t = String(raw || "").replace(/\r\n?/g, "\n").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "");
  const lines = t.split("\n").map(l => stripContacts(l.replace(/[ \t\u00a0]+/g, " ").trim()).replace(/^[|\s]+$/, ""));
  const freq = new Map();
  for (const l of lines) if (l && l.length < 90) freq.set(l, (freq.get(l) || 0) + 1);
  const pageNo = /^(?:page\s*)?\d{1,3}\s*(?:(?:of|\/|de|من)\s*\d{1,3})?$/i;
  return lines.filter(l => !(l && l.length < 90 && (freq.get(l) >= 4 || pageNo.test(l)))).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function blocksOf(text) {
  const out = [];
  let cur = [];
  const push = () => { const b = cur.join("\n").trim(); cur = []; if (!b) return; if (b.length <= 750) { out.push(b); return; }
    /* a long paragraph: cut at sentence ends into ~600-character pieces */
    let rest = b;
    while (rest.length > 750) { let k = -1; for (const re of [/[.!?؟;:]\s/g, /\s/g]) { re.lastIndex = 400; let x; while ((x = re.exec(rest)) && x.index < 700) k = x.index + 1; if (k > 0) break; } if (k <= 0) k = 650; out.push(rest.slice(0, k).trim()); rest = rest.slice(k).trim(); }
    if (rest) out.push(rest); };
  for (const l of text.split("\n")) {
    if (!l.trim()) { push(); continue; }
    if (/^#{1,6}\s/.test(l) || /^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[A-Z]\.|SECTION|PART|ARTICLE|CHAPTER|البند|المادة)\s+\S/.test(l)) push();
    cur.push(l);
  }
  push();
  return out;
}
const HEADING = b => b.length < 110 && (/^#{1,6}\s/.test(b) || (!/[.;:،]$/.test(b) && b === b.toUpperCase() && /[A-Z]{3}/.test(b)));
/* → {excerpt, found:[topic], missing:[topic], key_lines:[…], chars, lang} */
export function requirementsExcerpt(raw, max = DOC_LIMITS.excerpt) {
  const text = cleanDocText(raw), blocks = blocksOf(text);
  const found = new Set();
  const sc = blocks.map((b, i) => {
    const hits = TOPICS.filter(t => t[2].test(b)).map(t => t[0]);
    hits.forEach(h => found.add(h));
    return { i, b, hits, score: hits.length * 3 + (/\d/.test(b) ? 1 : 0) + (b.length > 60 ? 1 : 0) };
  });
  const chosen = new Set();
  let used = 0;
  const take = s => { if (chosen.has(s.i) || used + s.b.length + 3 > max) return false; chosen.add(s.i); used += s.b.length + 3; return true; };
  for (const s of sc) { if (used >= 420) break; take(s); }                       // the title / reference / subject at the top
  const ranked = sc.filter(s => s.hits.length).sort((a, b) => b.score - a.score || a.i - b.i);
  for (const t of TOPICS) { const s = ranked.find(x => x.hits.includes(t[0]) && !chosen.has(x.i)); if (s) take(s); }   // every topic once
  for (const s of ranked) take(s);
  for (const i of [...chosen]) { const h = sc[i - 1]; if (h && !chosen.has(h.i) && HEADING(h.b)) take(h); }           // a chosen part's heading
  const list = [...chosen].sort((a, b) => a - b);
  let ex = "", prev = -2;
  for (const i of list) { ex += (ex ? (i === prev + 1 ? "\n" : "\n…\n") : "") + blocks[i]; prev = i; }
  /* the exact lines with a date or an amount about the deadline, the bid bond and the briefing */
  const key = [], seenK = new Set();
  for (const l of text.split("\n")) {
    if (key.length >= DOC_LIMITS.keyLines) break;
    const s = l.trim();
    /* a date or an amount in the line itself, not only its heading number («3. CLOSING DATE») */
    if (s.length < 12 || !/\d/.test(s.replace(/^(?:#{1,6}\s*)?(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[A-Z]\.)\s+/, "")) || seenK.has(s)) continue;
    if (TOPICS[4][2].test(s) || TOPICS[3][2].test(s) || TOPICS[6][2].test(s)) { seenK.add(s); key.push(clip(s, 220)); }
  }
  const ar = (text.match(/[؀-ۿ]/g) || []).length, letters = (text.match(/\p{L}/gu) || []).length || 1;
  const fr = (text.match(/(?:^|[^\p{L}])(?:le|la|les|des|du|et|pour|march[ée]|offres?)(?=$|[^\p{L}])/giu) || []).length, en = (text.match(/(?:^|[^\p{L}])(?:the|and|of|for|shall|tender|bid)(?=$|[^\p{L}])/giu) || []).length;
  return { excerpt: clip(ex, max), found: TOPICS.map(t => t[0]).filter(k => found.has(k)), missing: TOPICS.map(t => t[0]).filter(k => !found.has(k)), key_lines: key, chars: text.length, lang: ar / letters > 0.3 ? "ar" : fr > en ? "fr" : "en" };
}

/* ---------- one item's document → the tool's answer parts ---------- */
const FATAL = new Set(["unreachable", "timeout", "login", "forbidden", "robots", "gone", "busy", "too_large", "unsupported", "not_https", "unsafe_url", "bad_url", "too_many_redirects"]);
/* it: the item row (url); o: {fetch, now, fetchMs, convertMs} → {ok, flags, doc, found, missing, key_lines, excerpt, linked?} */
export async function readItemDoc(env, it, o = {}) {
  const fetchFn = o.fetch ? (u, i) => o.fetch(u, i) : (u, i) => fetch(u, i);
  const ctx = { fetchFn, deadline: Date.now() + (o.fetchMs || DOC_LIMITS.fetchMs) };
  const out = { ok: false, flags: [], doc: null, found: [], missing: [], key_lines: [], excerpt: "" };
  const c = checkUrl(it && it.url, { upgrade: true });
  if (c.error) { out.flags.push(c.error === "bad_url" ? "no_document" : c.error); return out; }
  let got = await fetchDoc(c.url, env, ctx);
  if (got.flag) { out.flags.push(got.flag); out.doc = { url: got.url, status: got.status || null }; return out; }
  let conv = await toText(env, got, o), from = "official";
  /* a notice page (or an OCDS release) that is not itself the requirements: its ONE best document on the same official site */
  if (got.kind === "html" || got.kind === "json") {
    const thin = got.kind === "json" || conv.flag === "login" || requirementsExcerpt(conv.text).found.length < 3;
    const links = thin ? (got.kind === "json" ? jsonDocs(conv.json, got.url) : docLinks(conv.html, got.url)) : [];
    const pick = links.find(l => !checkUrl(l.url).error && l.url !== got.url);
    let bad = "";
    if (pick && ctx.deadline - Date.now() > 1500) {
      const g2 = await fetchDoc(checkUrl(pick.url).url, env, ctx);
      if (g2.ok && g2.kind !== "json") {
        const c2 = await toText(env, g2, o);
        if (!c2.flag && readable(c2.text)) {
          const pre = conv.flag === "login" ? "" : clip(cleanDocText(conv.text), 600);
          got = g2; conv = { ...c2, text: (pre ? pre + "\n\n" : "") + c2.text }; from = "linked";
        } else bad = c2.flag || (c2.encrypted ? "encrypted" : g2.kind === "pdf" ? (c2.images > 0 || String(c2.text || "").replace(/\s+/g, "").length < 40 ? "scanned" : "unreadable") : "empty");
      } else bad = g2.flag || "unsupported";
      if (bad) out.linked = { flag: bad, url: pick.url };
    }
    /* a release with no readable document is not a document; a sign-in page is a sign-in page */
    if (from !== "linked" && got.kind === "json") { out.flags.push(bad || "no_document"); out.doc = { url: (out.linked && out.linked.url) || got.url, type: "json" }; return out; }
  }
  if (conv.flag === "login") { out.flags.push("login"); out.doc = { url: got.url, type: got.kind }; return out; }
  out.doc = { url: got.url, type: got.kind, name: got.name || null, pages: conv.pages || null, via: conv.via, from, chars: 0 };
  if (conv.via === "local" && conv.aiSkip && (got.kind === "pdf" || got.kind === "docx")) out.ai_skip = conv.aiSkip;
  const t = String(conv.text || "");
  if (conv.encrypted && !readable(t)) { out.flags.push("encrypted"); return out; }
  if (!readable(t)) { out.flags.push(got.kind === "pdf" ? (conv.images > 0 || t.replace(/\s+/g, "").length < 40 ? "scanned" : "unreadable") : "empty"); return out; }
  const ex = requirementsExcerpt(t);
  out.ok = !!ex.excerpt; out.excerpt = ex.excerpt; out.found = ex.found; out.missing = ex.missing; out.key_lines = ex.key_lines;
  out.doc.chars = ex.chars; out.doc.lang = ex.lang;
  if (!ex.found.length) out.flags.push("no_requirements");
  return out;
}
export const isFatal = f => FATAL.has(f);
