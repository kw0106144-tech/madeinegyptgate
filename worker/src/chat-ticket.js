/* 📎 photo tickets (owner 2026-11-20: «مفيش في شاشه الشات بتاعت جنة او باسم مكان العميل يحطلهم في صوره»; docs/janna design
   «صور وفيديو في شات جنة وباسم», phase 1A / 1A+). A visitor has no sign-in, so the photo endpoint of Janna (src/chat-media.js,
   POST /api/janna/media/look) needs another proof that the request belongs to a real conversation: a short signed ticket.
     cm1.<a>.<exp36>.<nonce>.<sig24>
       a      j = minted ONLY beside a live-call session token (src/janna-session.js, 6 per network an hour, 120 a day)
              b = the «اكتبلي» bubble (POST /api/janna/media/ticket, 6 per network an hour)
       exp36  the expiry in seconds since the epoch, base 36
       nonce  8 random bytes, base64url
       sig24  HMAC-SHA256(secretOf(env), "cm1|" + a + "|" + nonce + "|" + exp36), base64url, the first 24 characters
   The ticket is NOT bound to the visitor id: data/janna-live.js rotates its visitor id after the token answer (rotate_visitor, the
   shared-computer case of review 2026-11-19 #7), and an id the caller chooses proves nothing anyway; the per-ticket, per-network and
   site-wide limits of src/chat-media.js do the work. The ticket carries no id of a person and is never sent to Anam.
   Leaf module: imports common.js only. */
import { hmac, safeEq, secretOf, b64url } from "./common.js";

export const TICKET_RX = /^cm1\.([jb])\.([0-9a-z]{4,10})\.([A-Za-z0-9_-]{11})\.([A-Za-z0-9_-]{24})$/;
export const TICKET_MAX_LEN = 80;
const sigOf = async (s, a, nonce, e36) => (await hmac(s, "cm1|" + a + "|" + nonce + "|" + e36)).slice(0, 24);

/* a new ticket of agent a ("j" | "b") valid for ttlSec seconds; "" without a signing secret */
export async function mediaTicket(env, a, ttlSec, nowMs = Date.now()) {
  const s = secretOf(env);
  if (!s || (a !== "j" && a !== "b")) return "";
  const exp = Math.floor(nowMs / 1000) + Math.max(60, Math.floor(Number(ttlSec) || 0)), e36 = exp.toString(36);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(8)));
  return "cm1." + a + "." + e36 + "." + nonce + "." + (await sigOf(s, a, nonce, e36));
}

/* → {a, exp (s), key (the first 16 characters of the signature: the per-ticket counter's key)} | null — the format, the agent
   (allowed: ["j", "b"] …), the expiry and the signature (constant-time compare); never throws */
export async function ticketOk(env, t, allowed, nowMs = Date.now()) {
  const s = secretOf(env);
  if (!s || typeof t !== "string" || !t || t.length > TICKET_MAX_LEN) return null;
  const m = TICKET_RX.exec(t.trim());
  if (!m) return null;
  const a = m[1], e36 = m[2], nonce = m[3], sig = m[4];
  if (Array.isArray(allowed) && allowed.length && !allowed.includes(a)) return null;
  const exp = parseInt(e36, 36);
  if (!Number.isFinite(exp) || !(exp * 1000 > nowMs)) return null;
  try { if (!safeEq(await sigOf(s, a, nonce, e36), sig)) return null; } catch (e) { return null; }
  return { a, exp, key: sig.slice(0, 16) };
}
