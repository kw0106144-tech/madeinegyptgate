/* POST /api/janna/timing — the live-call page's start timing beacon (speed plan 2026-11-20, change 11). Owner 2026-11-19 «بياخد وقت»: where
   the wait between the tap on «ابدأ» and Janna's / Bassem's first words goes on real phones and networks — Anam's own session data cannot
   see the start (token → SDK → microphone → connection → first frames). data/janna-live.js sends it once per call, at «voice»
   (navigator.sendBeacon, same origin). The answer is always 204 with no body (a beacon never reads it).

   PRIVACY GUARD — what reaches Workers Logs is ONE console line «live-timing {…}» rebuilt ONLY from the fields below: whole milliseconds, a
   fixed persona / language, a 0/1 relay flag and a short region code. Never the body as sent, a session id, an IP, a user agent, a URL, a
   name or any free text. A body from another origin, an oversized or unreadable body, or one without a single mark is dropped without a
   line; one isolate writes at most LOG_PER_MIN lines a minute (a flood cannot fill the logs). No D1, no KV, no ccBoot (index.js BARE).
   Workers Logs keep console lines only (wrangler.toml [observability.logs] invocation_logs = false): no request URLs or headers.

   Body (JSON, ≤ TIMING_MAX_BODY bytes; text/plain — sendBeacon's default for a string — is fine):
     persona "janna" | "bassem" (required) · lang "ar" | "en"
     token, sdk, mic, stream, connected, ready, video, play, voice — the page's marks, ms after the tap (tmMark; at least one)
     server  the token answer's Server-Timing string ("boot;dur=12, checks;dur=30, …") or {boot, checks, ctx, persona, wait, token, total}
     relay   1 when the media went through Anam's TURN relay (iceTransportPolicy "relay")
     region  the region Anam served the session from, a short code ("eu-west-1")
     reasoning [[first, last], …] per user turn: the first / last REASONING_STREAM_EVENT_RECEIVED chunk, ms after USER_SPEECH_ENDED (≤ 20 turns)
   Anything else in the body is ignored. */
import { originOf, originOk } from "./janna-session.js";

export const MARKS = Object.freeze(["token", "sdk", "mic", "stream", "connected", "ready", "video", "play", "voice"]);
export const SERVER_PARTS = Object.freeze(["boot", "checks", "ctx", "persona", "wait", "token", "total"]);
export const TIMING_MAX_BODY = 2048, LOG_PER_MIN = 60, MAX_MS = 600000, MAX_TURNS = 20;
const REGION = /^[a-z]{2,6}(?:[-_][a-z0-9]{1,8}){0,3}$/i;
const ms = v => { if (v === null || v === "" || typeof v === "boolean") return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= MAX_MS ? Math.round(n) : null; };
function serverParts(s) {
  const out = {};
  if (typeof s === "string") {
    for (const p of s.slice(0, 400).split(",")) { const m = /^\s*([a-z]+);dur=(\d{1,7}(?:\.\d{1,3})?)\s*$/.exec(p); if (m && SERVER_PARTS.includes(m[1])) { const v = ms(m[2]); if (v != null) out[m[1]] = v; } }
  } else if (s && typeof s === "object" && !Array.isArray(s)) {
    for (const k of SERVER_PARTS) { const v = ms(s[k]); if (v != null) out[k] = v; }
  }
  return Object.keys(out).length ? out : null;
}
/* the body → the ONLY fields that may be logged (null = nothing worth a line) */
export function timingLine(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  if (b.persona !== "janna" && b.persona !== "bassem") return null;
  const o = { persona: b.persona, lang: b.lang === "en" ? "en" : "ar" };
  let n = 0;
  for (const k of MARKS) { const v = ms(b[k]); if (v != null) { o[k] = v; n++; } }
  if (!n) return null;
  const sv = serverParts(b.server); if (sv) o.server = sv;
  if (b.relay === 1 || b.relay === true || b.relay === "1") o.relay = 1;
  const rg = typeof b.region === "string" ? b.region.trim() : "";
  if (rg && rg.length <= 24 && REGION.test(rg)) o.region = rg.toLowerCase();
  if (Array.isArray(b.reasoning)) {
    const rs = [];
    for (const t of b.reasoning.slice(0, MAX_TURNS)) { if (!Array.isArray(t)) continue; const a = ms(t[0]), z = ms(t[1]); if (a != null && z != null && z >= a) rs.push([a, z]); }
    if (rs.length) o.reasoning = rs;
  }
  return o;
}
let WIN = -1, USED = 0; // this isolate's log lines in the current minute
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
export async function handleTiming(req, env, ctx, nowMs = Date.now()) {
  if (req.method === "OPTIONS") return done(); // no CORS headers: the beacon is same-origin only
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  if (!originOk(env || {}, originOf(req))) return done();
  let t = ""; try { t = await req.text(); } catch (e) { return done(); }
  if (!t || t.length > TIMING_MAX_BODY) return done();
  let b = null; try { b = JSON.parse(t); } catch (e) { return done(); }
  const line = timingLine(b); if (!line) return done();
  const w = Math.floor(nowMs / 60000); if (w !== WIN) { WIN = w; USED = 0; }
  if (++USED > LOG_PER_MIN) return done();
  console.log("live-timing " + JSON.stringify(line));
  return done();
}
