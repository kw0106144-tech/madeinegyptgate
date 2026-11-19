/* Who may call /api/seo/* (Pages Function). Mirrors the Worker's login exactly — read-only port of
   worker/src/auth.js (signSession / parseV2 / authUser) and worker/src/common.js (secretOf, hmac, b64url, safeEq, isAdmin):

   token v2.<b64url(member id)>.<session id: 32 hex>.<exp: unix s>.<b64url(HMAC-SHA256(secret, "v2|<id>|<sid>|<exp>"))>
   secret = AUTH_SECRET || ADVISOR_SECRET — set the SAME value(s) in the Pages project as in the Worker.

   The token carries no role, so the role is resolved from the first source configured:
   1) D1 binding DB (the Worker's database, bound to the Pages project too): the session row must exist, belong to the
      member, not be revoked or expired, and the member's e-mail must not be blocked by an admin (blocks table, same
      emailKey) — exactly the checks of authUser, so logout and «block» end access here too; then role "admin" when
      members.role = 'admin' or the verified email is in ADMIN_EMAILS (same as isAdmin), or "seo" when members.role = 'seo'.
      Any change to the Worker's authUser must be copied here: _tests/seo-auth.test.mjs runs both on one database.
   2) PLATFORM_API service binding to the Worker (or PLATFORM_API_ORIGIN, e.g. its workers.dev URL): GET /api/me with the
      same token → user.role === "admin" (the Worker does the full session + admin check).
   3) SEO_ADMIN_IDS = comma-separated member ids: HMAC + expiry only (a logged-out or blocked member's token stays valid
      until it expires — a stop-gap only).
   None configured → 503 (fail closed).
   X-Platform-Key = SEO_PLATFORM_KEY (preferred: a key only for this API, so the Worker's PLATFORM_KEY — which activates
   plans — never has to be copied into Pages) or PLATFORM_KEY → platform caller (routes limited by the API). */
const te = new TextEncoder();
export const secretOf = env => (env && (env.AUTH_SECRET || env.ADVISOR_SECRET)) || "";
export const b64url = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64url = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); };
export function safeEq(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(data))));
}
export const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
/* same output as worker/src/auth.js signSession (used by tests and tools; the Worker issues the real tokens) */
export async function signSession(secret, memberId, sid, exp) { return ["v2", b64url(te.encode(memberId)), sid, exp, await hmac(secret, `v2|${memberId}|${sid}|${exp}`)].join("."); }
export async function parseV2(secret, token, nowSec = Math.floor(Date.now() / 1000)) {
  const p = String(token || "").split(".");
  if (p.length !== 5 || p[0] !== "v2" || !secret || !/^[a-f0-9]{32}$/.test(p[2])) return null;
  let memberId; try { memberId = new TextDecoder().decode(unb64url(p[1])); } catch (e) { return null; }
  const exp = +p[3];
  if (!exp || exp < nowSec) return null;
  if (!safeEq(await hmac(secret, `v2|${memberId}|${p[2]}|${exp}`), p[4])) return null;
  return { memberId, sid: p[2], exp };
}
/* worker/src/common.js line / emailKey, byte for byte: lower case, no +tag, Gmail without dots (googlemail = gmail) */
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const scalar = v => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const wstr = (v, max) => scalar(v).replace(CTRL, "").trim().slice(0, max);
const wline = (v, max) => wstr(v, max * 2).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
export function emailKey(e) {
  const s = wline(e, 254).toLowerCase(), at = s.lastIndexOf("@"); if (at < 1) return s;
  let local = s.slice(0, at).split("+")[0], dom = s.slice(at + 1);
  if (dom === "googlemail.com") dom = "gmail.com";
  if (dom === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + dom;
}
export const bearer = req => { const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(\S+)$/i); return m ? m[1] : ""; };
const adminList = env => String((env && env.ADMIN_EMAILS) || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
export const isAdminRow = (env, m) => !!(m && (m.role === "admin" || (m.email && m.email_verified_at && adminList(env).includes(String(m.email).toLowerCase()))));
export function authMode(env) {
  if (env && env.DB && typeof env.DB.prepare === "function") return "d1";
  if (env && ((env.PLATFORM_API && typeof env.PLATFORM_API.fetch === "function") || /^https:\/\//.test(String(env.PLATFORM_API_ORIGIN || "")))) return "worker";
  if (env && String(env.SEO_ADMIN_IDS || "").trim()) return "allowlist";
  return "none";
}
const deny = (status, code, error) => ({ ok: false, status, code, error });
const meCache = new Map(); // token hash → {at, r} (worker mode only, 30 s)

/* → {ok:true, id, email, role:"admin"|"seo"|"platform", via, platform?} or {ok:false, status, code, error} */
export async function resolveCaller(req, env, opt = {}) {
  env = env || {};
  const pk = req.headers.get("X-Platform-Key") || "";
  if (pk && [env.SEO_PLATFORM_KEY, env.PLATFORM_KEY].some(k => typeof k === "string" && k !== "" && safeEq(pk, k))) return { ok: true, platform: true, id: "platform", email: "", role: "platform", via: "platform_key" };
  const token = bearer(req);
  if (!token) return deny(401, "unauthorized", "sign in required");
  const secret = secretOf(env);
  if (!secret) return deny(503, "auth_off", "auth not configured (set ADVISOR_SECRET / AUTH_SECRET in the Pages project)");
  const t = await parseV2(secret, token);
  if (!t) return deny(401, "unauthorized", "invalid or expired token");
  const mode = authMode(env);
  if (mode === "d1") {
    let s, m;
    try {
      s = await env.DB.prepare("SELECT member_id, expires_at, revoked_at FROM auth_sessions WHERE sid_hash = ?").bind(await sha256hex(t.sid)).first();
      if (s && s.member_id === t.memberId && !s.revoked_at && !(s.expires_at < new Date().toISOString())) m = await env.DB.prepare("SELECT id, email, role, email_verified_at FROM members WHERE id = ?").bind(t.memberId).first();
      if (m && m.email && await env.DB.prepare("SELECT 1 AS x FROM blocks WHERE kind = ? AND value = ?").bind("email", emailKey(m.email)).first("x")) m = null; // blocked by an admin
    } catch (e) { return deny(503, "auth_store_error", "session store unavailable"); }
    if (!m) return deny(401, "unauthorized", "session ended — sign in again");
    // Control Center (ACC-CONTRACT §0.5, §12.1): a session from the old-password bridge never gets a staff role; an active cc_staff row
    // decides the role (owner/admin → admin; seo/editor → seo; a disabled row → none). Tables missing (before 0006) → the members.role rule only.
    let staff = null;
    try {
      if (await env.DB.prepare("SELECT 1 AS x FROM cc_session_meta WHERE sid_hash = ? AND via = 'legacy'").bind(await sha256hex(t.sid)).first("x")) return deny(403, "use_email_code", "sign in with an e-mail code");
      staff = await env.DB.prepare("SELECT role, disabled_at FROM cc_staff WHERE member_id = ?").bind(m.id).first();
    } catch (e) { staff = null; }
    const cc = staff && !staff.disabled_at ? staff.role : "";
    const role = isAdminRow(env, m) || cc === "owner" || cc === "admin" ? "admin" : (staff && staff.disabled_at) ? "" : m.role === "seo" || cc === "seo" || cc === "editor" ? "seo" : "";
    return role ? { ok: true, id: m.id, email: m.email || "", role, via: "d1" } : deny(403, "forbidden", "admins and the SEO team only");
  }
  if (mode === "worker") {
    const key = await sha256hex(token), now = Date.now(), c = meCache.get(key);
    let r = c && now - c.at < 30000 ? c.r : null;
    if (!r) {
      try {
        const svc = env.PLATFORM_API && typeof env.PLATFORM_API.fetch === "function" ? env.PLATFORM_API : null;
        const u = (svc ? "https://madeinegyptgate.com" : String(env.PLATFORM_API_ORIGIN).replace(/\/+$/, "")) + "/api/me";
        const res = await (svc ? svc.fetch(u, { headers: { Authorization: "Bearer " + token } }) : (opt.fetch || fetch)(u, { headers: { Authorization: "Bearer " + token } }));
        const j = res.ok ? await res.json().catch(() => null) : null;
        r = { status: res.status, user: j && j.user };
      } catch (e) { return deny(503, "auth_backend_error", "platform API unavailable"); }
      if (r.status === 200 || r.status === 401 || r.status === 403) { meCache.set(key, { at: now, r }); if (meCache.size > 200) meCache.delete(meCache.keys().next().value); }
    }
    if (r.status === 401 || r.status === 403) return deny(401, "unauthorized", "session ended — sign in again");
    if (r.status !== 200 || !r.user) return deny(503, "auth_backend_error", "platform API unavailable");
    if (r.user.id !== t.memberId) return deny(401, "unauthorized", "token mismatch");
    if (r.user.role === "admin") return { ok: true, id: r.user.id, email: r.user.email || "", role: "admin", via: "worker" };
    // the SEO team (§12.1): GET /api/team/whoami answers the staff role (seo / editor → seo)
    try {
      const svc = env.PLATFORM_API && typeof env.PLATFORM_API.fetch === "function" ? env.PLATFORM_API : null;
      const u = (svc ? "https://madeinegyptgate.com" : String(env.PLATFORM_API_ORIGIN).replace(/\/+$/, "")) + "/api/team/whoami";
      const res = await (svc ? svc.fetch(u, { headers: { Authorization: "Bearer " + token } }) : (opt.fetch || fetch)(u, { headers: { Authorization: "Bearer " + token } }));
      const j = res.ok ? await res.json().catch(() => null) : null;
      if (j && j.user && j.user.id === t.memberId && (j.role === "seo" || j.role === "editor")) return { ok: true, id: j.user.id, email: j.user.email || "", role: "seo", via: "worker" };
    } catch (e) { /* fall through */ }
    return deny(403, "forbidden", "admins and the SEO team only");
  }
  if (mode === "allowlist") {
    const ids = String(env.SEO_ADMIN_IDS).split(/[\s,;]+/).filter(Boolean);
    return ids.includes(t.memberId) ? { ok: true, id: t.memberId, email: "", role: "admin", via: "allowlist" } : deny(403, "forbidden", "admins and the SEO team only");
  }
  return deny(503, "auth_backend_off", "no admin role source: bind the D1 database (DB), a PLATFORM_API service binding, or set SEO_ADMIN_IDS");
}
export function resetAuthCache() { meCache.clear(); }
