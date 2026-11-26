/* Team portal sign-in (owner request 2026-11-24): POST /api/auth/portal  (form field t)
   The owner's team portal (panel.gcctendersgate.org) signs the owner and his staff in to all 11 of his sites with one click. For this
   site it posts a one-time token here; this page puts a session in the browser (localStorage "mig-tok", like the e-mail-code sign-in)
   and opens the Control Center (/admin/).

   Token: <b64url(JSON claims)>.<b64url(Ed25519 signature over the first part)>. Only the PUBLIC key is here: the private key never left
   the portal server, so there is no shared secret to store, rotate or leak. Claims: site "mi_eg", u (e-mail), n (name),
   p ({section: "r"|"w"}), iat, exp (≤ 120 s after iat), jti (single use: logins row purpose portal_jti), own = 1 for the portal owner.

   · own = 1 → a normal full session of the bootstrap owner (ADMIN_EMAILS, confirmed address): the token's address when it is one of
     them, else the first one. Refused when there is no such account (never a new owner).
   · staff → an «lp…» session of 8 h for the member row of that address (created as «فريق المنصة», plan visitor, when there is none).
     Its Control Center sections are stored in KV acc:portal:<sid hash>; roleOf() answers "portal" and handleCC allows only the paths
     and permissions of those sections (portal-map.js) — never anything owner-only, the team, settings, prices, keys, e-mail or import.
     The SEO admin (/api/seo/*) and the team boards do not accept these sessions.
   · every sign-in is in the audit log (portal.signin); rate limit 30 / 10 min per network. */
import { line, now, iso, hex, sha256, unb64url, isEmail, ipHash, rateOk, isBlocked, secretOf } from "./common.js";
import { signSession, findByEmail } from "./auth.js";
import { adminList, isBootstrap, auditStmt, PORTAL_KV } from "./acc-base.js";
import { cleanSections } from "./portal-map.js";

export const PORTAL_PUBLIC_KEY = "7Nkk1IfJNv4g2yH2D7Bafwy77FHbjayMz086VZzgULM"; // Ed25519, raw 32 bytes, base64url (public)
export const PORTAL_SITE = "mi_eg";
const STAFF_HOURS = 8, OWNER_HOURS = 8, MAX_TTL = 120, SKEW = 30;
const TEAM_COMPANY = "فريق المنصة";

let KEY = null;
async function pubKey(env) {
  const raw = (env && env.PORTAL_PUBLIC_KEY_TEST) || PORTAL_PUBLIC_KEY; // tests only
  if (KEY && KEY.raw === raw) return KEY.k;
  const k = await crypto.subtle.importKey("raw", unb64url(raw), { name: "Ed25519" }, false, ["verify"]);
  KEY = { raw, k }; return k;
}
/* → claims or null (bad format, bad signature, wrong site, expired, too long-lived) */
export async function verifyPortalToken(env, t, nowSec = Math.floor(Date.now() / 1000)) {
  const m = /^([A-Za-z0-9_-]{20,4000})\.([A-Za-z0-9_-]{86})$/.exec(String(t || ""));
  if (!m) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify({ name: "Ed25519" }, await pubKey(env), unb64url(m[2]), new TextEncoder().encode(m[1])); } catch (e) { return null; }
  if (!ok) return null;
  let c; try { c = JSON.parse(new TextDecoder().decode(unb64url(m[1]))); } catch (e) { return null; }
  if (!c || typeof c !== "object" || c.site !== PORTAL_SITE) return null;
  const iat = +c.iat, exp = +c.exp;
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp < nowSec || iat > nowSec + SKEW || exp - iat > MAX_TTL) return null;
  if (typeof c.jti !== "string" || !/^[a-f0-9]{32}$/.test(c.jti)) return null;
  const u = line(c.u, 254).toLowerCase();
  if (!isEmail(u)) return null;
  return { u, n: line(c.n, 80), own: c.own === 1, p: cleanSections(c.p), exp, jti: c.jti };
}

const HDR = n => ({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${n}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` });
const page = (title, body, script, n) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title>`
  + `<style>body{font-family:system-ui,Tahoma,sans-serif;background:#f6f7f9;color:#1f2937;display:grid;place-items:center;min-height:100vh;margin:0}div{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px 32px;max-width:420px;text-align:center}a{color:#C8102E;font-weight:700}</style></head>`
  + `<body><div>${body}</div>${script ? `<script nonce="${n}">${script}</script>` : ""}</body></html>`;
function fail(status, msg) {
  const n = hex(12);
  return new Response(page("صنع في مصر", `<h2>تعذّر الدخول</h2><p>${msg}</p><p><a href="https://panel.gcctendersgate.org/">ارجع لبوابة الفريق</a> وجرّب تاني.</p>`, "", n), { status, headers: HDR(n) });
}

async function memberFor(env, email) {
  let m = await findByEmail(env, email);
  if (m) return { m, created: false };
  const id = "u" + hex(8), t = now();
  await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, name) VALUES (?, ?, ?, 'visitor', 1, ?, ?, '')").bind(id, TEAM_COMPANY, email, t, t).run();
  return { m: await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first(), created: true };
}

export async function handlePortalSso(req, env) {
  env = env || {};
  if (req.method !== "POST") return fail(405, "الطريقة دي مش مسموحة.");
  if (!env.DB || !secretOf(env)) return fail(503, "الدخول مش متاح دلوقتي.");
  const ih = await ipHash(req, env);
  if (!(await rateOk(env, "portalsso|" + ih, 30, 600))) return fail(429, "محاولات كتير — استنى شوية.");
  let t = "";
  try { const len = +req.headers.get("Content-Length") || 0; if (len > 8192) return fail(413, "الطلب كبير."); const f = await req.formData(); t = String(f.get("t") || ""); } catch (e) { return fail(400, "الطلب ناقص."); }
  const c = await verifyPortalToken(env, t);
  if (!c) return fail(401, "رابط الدخول مش صالح أو خلص (صالح دقيقة واحدة).");
  // single use: the jti is stored once (logins.code_hash is the primary key); a second use fails on the insert
  const ts = Date.now();
  try {
    const r = await env.DB.prepare("INSERT INTO logins (code_hash, member_id, purpose, created_at, expires_at, used_at) VALUES (?, '', 'portal_jti', ?, ?, ?)").bind(await sha256("pj|" + c.jti), iso(ts), iso((c.exp + 600) * 1000), iso(ts)).run();
    if (!r || !r.meta || r.meta.changes !== 1) return fail(401, "رابط الدخول اتستخدم قبل كده.");
  } catch (e) { return fail(401, "رابط الدخول اتستخدم قبل كده."); }

  let m = null, sid, hours, created = false;
  if (c.own) {
    const list = adminList(env), want = list.includes(c.u) ? [c.u, ...list.filter(x => x !== c.u)] : list;
    for (const e of want) { const x = await findByEmail(env, e); if (x && isBootstrap(env, x)) { m = x; break; } }
    if (!m) return fail(403, "حساب المالك مش متسجّل على المنصة — ادخل مرة بكود على الإيميل الأول.");
    sid = hex(16); hours = OWNER_HOURS;
  } else {
    if (!Object.keys(c.p).length) return fail(403, "مفيش أقسام متاحة لك في الموقع ده.");
    if (await isBlocked(env, { email: c.u })) return fail(403, "الحساب ده موقوف.");
    ({ m, created } = await memberFor(env, c.u));
    if (!m) return fail(500, "حصلت مشكلة — جرّب تاني.");
    sid = "lp" + hex(15); hours = STAFF_HOURS;
  }
  const exp = Math.floor(ts / 1000) + hours * 3600, sh = await sha256(sid);
  if (!c.own) {
    if (!env.SEO_KV) return fail(503, "الدخول مش متاح دلوقتي.");
    await env.SEO_KV.put(PORTAL_KV + sh, JSON.stringify({ s: c.p, u: c.u, exp: iso(exp * 1000) }), { expirationTtl: hours * 3600 + 60 });
  }
  const stmts = [env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(sh, m.id, iso(ts), iso(exp * 1000))];
  try { stmts.push(auditStmt(env, { actor_id: m.id, actor_email: m.email || c.u, actor_role: c.own ? "owner" : "portal", action: "portal.signin", target_type: "session", target_id: sh.slice(0, 16),
    after: c.own ? { owner: true } : { sections: c.p, member_created: created }, summary: (c.own ? "دخول المالك من بوابة الفريق" : "دخول من بوابة الفريق") + (c.n ? " — " + c.n : ""), ip_hash: ih })); } catch (e) { /* audit table missing: the session alone */ }
  try { await env.DB.batch(stmts); } catch (e) { await env.DB.prepare("INSERT INTO auth_sessions (sid_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(sh, m.id, iso(ts), iso(exp * 1000)).run(); }
  const token = await signSession(secretOf(env), m.id, sid, exp), n = hex(12);
  const js = `try{localStorage.setItem("mig-tok",${JSON.stringify(token)});localStorage.removeItem("mig-me");}catch(e){}location.replace("/admin/");`;
  return new Response(page("صنع في مصر", "<p>جاري فتح لوحة التحكم…</p>", js, n), { status: 200, headers: HDR(n) });
}
