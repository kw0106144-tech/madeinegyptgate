/* Payments — invoices, checkout, provider returns and webhooks for the Control Center (docs/janna/ACC-CONTRACT.md §3.3, §5).
   Admin  /api/admin/cc/pay/*  (handlePayAdmin; `adm` comes from acc.js's router: adm.can(perm), adm.audit(…), adm.member, adm.role, adm.CC)
     GET config · PUT config (owner) · GET invoices[.csv] · GET invoices/:no · POST invoices · POST invoices/:no/{resend,void,mark-paid,refund}
     POST test-invoice (owner; Sandbox only) · GET payments[.csv]
   Public /api/pay/* (handlePay): GET invoice?t= · POST checkout {t, lang?} · GET|POST return/:provider (always 303 → pay.html#inv=…&r=1)
     · POST webhook/:provider · GET health
   Providers (one adapter each, §5.2): Paymob (Intention API → Unified Checkout; HMAC-SHA512 transaction callback = authoritative),
     N-Genius (access token → order → hosted payment page; the state is ALWAYS re-queried server-side), PayTabs (PT2 payment/request;
     callback `Signature` HMAC-SHA256 over the raw body + return-form signature, then payment/query), manual (bank transfer / InstaPay
     instructions; an admin records the payment with a reference — the only human step, and only for that method).
   Invariants: no card data ever reaches our pages or API (card fields → 400); test mode is never public (only test=1 invoices pay in
     Sandbox, and they never activate a plan); every provider result is verified (HMAC or server-side re-query) and idempotent
     (cc_pay_events UNIQUE(provider, event_key)); an invoice flips open → paid exactly once (guarded UPDATE) and its activation runs through
     a durable ledger row (cc_pay_events event_key "activate:<invoice id>", result "activating:<ISO expiry>" → "activated:<ISO>") that
     paymentsCron retries, so a crash between payment and activation never loses a paid plan; secrets only through crypto.js (never
     returned to the browser); amounts are integer piasters; neither request bodies nor personal data are logged.
   VERIFY with real sandbox credentials before going live (§5.5): Paymob billing_data strictness and callback field order, the N-Genius
     Egypt API host and return parameter, PayTabs return-signature canonicalisation and status letters other than A.
   Dev only: PAY_DEV_ORIGIN=http://127.0.0.1:<port> (loopback only, never in production) sends every provider call to a local mock. */
import { readJson, line, now, iso, hex, sha256, safeEq, jparse, isEmail, emailKey, ipHash, rateOk, site, effPlan, PLAN_LV, PLAN_NAME, canonPlan, cairoDay, cairoHM, addDays, notify, mail, emailOn, adminEmails, sameMailbox, enc,
  GCC, gccPick, gccOf, normGcc, prefsOf, gccNextOf, gccNames } from "./common.js";
import { findByEmail } from "./auth.js";
import { configSecretOk, getSecret, putSecret, secretInfo } from "./crypto.js";
import { cairoToUtc } from "./meetings.js";

/* ---------------------------------------------------------------- constants ---------------------------------------------------------------- */
const PROVIDERS = {
  ngenius: { label: "N-Genius (Network International)", label_ar: "N-Genius (Network International)", online: true },
  paymob: { label: "Paymob", label_ar: "Paymob", online: true },
  paytabs: { label: "PayTabs", label_ar: "PayTabs", online: true },
  manual: { label: "Bank transfer / manual", label_ar: "تحويل بنكي / يدوي", online: false },
};
const ONLINE = ["ngenius", "paymob", "paytabs"];
const SLOT = { ngenius: { api_key: "pay.ngenius.api_key", webhook_secret: "pay.ngenius.webhook_value" }, paymob: { api_key: "pay.paymob.secret_key", webhook_secret: "pay.paymob.hmac_secret" }, paytabs: { api_key: "pay.paytabs.server_key" } };
export const PAY_SLOTS = ["pay.ngenius.api_key", "pay.ngenius.webhook_value", "pay.paymob.secret_key", "pay.paymob.hmac_secret", "pay.paytabs.server_key"];
/* cc_settings keys this module reads/writes (scope "pay", except manual_pay_ar/en + vat_bp which are scope "public") — the import maps onto them */
export const PAY_SETTING_KEYS = ["pay.enabled", "pay.provider", "pay.mode", "pay.currency", "pay.manual_fallback", "pay.success_url", "pay.fail_url", "pay.notes", "pay.merchant_id",
  "pay.ngenius.outlet_id", "pay.ngenius.host", "pay.paymob.integration_ids", "pay.paymob.public_key", "pay.paymob.host", "pay.paytabs.profile_id", "pay.paytabs.host", "manual_pay_ar", "manual_pay_en"];
/* API hosts: defaults per mode, plus the allow-list a configured host must match (a stored key is only ever sent to its own provider) */
const HOST = {
  ngenius: { test: "api-gateway.sandbox.ngenius-payments.com", live: "api-gateway.ngenius-payments.com", rx: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,4}ngenius-payments\.com$/ },
  paymob: { test: "accept.paymob.com", live: "accept.paymob.com", rx: /^[a-z0-9-]{1,40}\.paymob\.com$/ },
  paytabs: { test: "secure-egypt.paytabs.com", live: "secure-egypt.paytabs.com", rx: /^secure(?:-[a-z]{2,20})?\.paytabs\.(?:com|sa)$/ },
};
const PAGE_RX = { ngenius: /^(?:[a-z0-9-]+\.){1,4}ngenius-payments\.com$/, paymob: /^[a-z0-9-]{1,40}\.paymob\.com$/, paytabs: /^(?:[a-z0-9-]+\.)?paytabs\.(?:com|sa)$/ };
const RX = {
  outlet: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ng_key: /^[\x21-\x7e]{16,1024}$/, ng_hook: /^[\x21-\x7e]{16,256}$/,
  pm_sk: /^egy_sk_(test|live)_[\x21-\x7e]{8,512}$/, pm_pk: /^egy_pk_(test|live)_[\x21-\x7e]{8,512}$/, pm_hmac: /^[\x21-\x7e]{8,256}$/,
  pt_key: /^[\x21-\x7e]{12,256}$/, pt_profile: /^[1-9]\d{0,9}$/,
};
const SOURCES = ["signup", "renewal", "upgrade", "admin", "member", "test"];
const INV_STATUS = ["open", "paid", "void", "refunded"], PAY_STATUS = ["created", "redirected", "pending", "paid", "failed", "cancelled", "expired"];
const TOKEN_RX = /^[A-Za-z0-9_-]{32}$/, NO_RX = /^(?:INV|TEST)-\d{4}-\d{6,7}$/, REF_RX = /^MIG-\d{2}-[2-9A-HJKMNP-TV-Z]{6}$/, DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const VAT_DEFAULT = 1400, DAY_MS = 86400000;
const MISSING_LABEL = {
  provider: ["اختار البوابة", "Choose a gateway"],
  enabled: ["علّم «تفعيل الدفع الإلكتروني»", "Tick «Enable online payment»"],
  mode_live: ["الوضع «اختبار» — العملاء بيدفعوا في الوضع «حقيقي (Live)» بس", "Sandbox mode — customers can pay in Live mode only"],
  config_secret: ["مفتاح التشفير CONFIG_SECRET مش متضاف على الـ Worker", "CONFIG_SECRET is not set on the Worker"],
  outlet_id: ["Outlet Reference بتاع N-Genius", "N-Genius outlet reference"],
  api_key: ["مفتاح الـ API", "API key"],
  api_key_unreadable: ["مفتاح الـ API المحفوظ مش مقروء — دخّله تاني", "The saved API key cannot be read — enter it again"],
  webhook_secret: ["الـ HMAC secret بتاع Paymob", "Paymob HMAC secret"],
  webhook_secret_unreadable: ["الـ HMAC secret المحفوظ مش مقروء — دخّله تاني", "The saved HMAC secret cannot be read — enter it again"],
  integration_ids: ["الـ Integration IDs بتاعة Paymob", "Paymob integration IDs"],
  public_key: ["الـ Public Key بتاع Paymob", "Paymob public key"],
  key_mode_mismatch: ["المفاتيح مش متوافقة مع الوضع", "The keys do not match the mode"],
  profile_id: ["الـ Profile ID بتاع PayTabs", "PayTabs profile ID"],
  manual_text: ["تعليمات التحويل اليدوي (عربي)", "Manual transfer instructions (Arabic)"],
};
const GW_WAIT = ["بوابة الدفع الإلكتروني لسه بتتجهّز — أول ما تشتغل هيوصلك رابط الدفع تلقائياً على الإيميل ده، ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.",
  "Online payment is still being set up — as soon as it is live, the payment link reaches this e-mail automatically; we will never ask for card details on our pages."];
const WHY = "وصلتك الرسالة دي لأن الإيميل ده عليه فاتورة اشتراك في منصة صنع في مصر. / You received this because this address is on a subscription invoice at Made in Egypt Gate.";
/* built-in defaults (ACC-CONTRACT §6.1) — used when the e-mail center (CC.email.renderTemplate) is not available */
const TPL = {
  invoice_issued: { s: "فاتورة اشتراك {{plan_name}} رقم {{invoice_no}} / Subscription invoice {{invoice_no}}",
    ar: "أهلاً،\nدي فاتورة اشتراك {{company}} في {{plan_name}}: الإجمالي {{total}} {{currency}} (شامل ضريبة القيمة المضافة).\n{{gateway_text}}\n{{manual_text}}\n{{invoice_details_text}}",
    en: "Hello,\nThis is the subscription invoice of {{company}} for the {{plan_name}}: total {{total}} {{currency}} (VAT included).\n{{gateway_text}}\n{{manual_text}}\n{{invoice_details_text}}" },
  payment_link: { s: "رابط دفع الفاتورة {{invoice_no}} / Payment link — invoice {{invoice_no}}",
    ar: "بوابة الدفع اشتغلت ✓ تقدر تدفع فاتورة {{invoice_no}} ({{total}} جنيه) من هنا: {{pay_url}}",
    en: "Online payment is live ✓ You can pay invoice {{invoice_no}} (EGP {{total}}) here: {{pay_url}}" },
  payment_received: { s: "استلمنا الدفع — فاتورة {{invoice_no}} / Payment received — invoice {{invoice_no}}",
    ar: "استلمنا دفع الفاتورة {{invoice_no}} ({{total}} جنيه شامل الضريبة) واتفعّلت {{plan_name}} لحد {{plan_until}}. لوحتك: {{dashboard_url}}\n{{invoice_details_text}}",
    en: "We received the payment of invoice {{invoice_no}} (EGP {{total}} VAT included) and your {{plan_name}} is active until {{plan_until}}. Your dashboard: {{dashboard_url}}\n{{invoice_details_text}}" },
  payment_review: { s: "استلمنا الدفع — فاتورة {{invoice_no}} (قيد المراجعة) / Payment received — invoice {{invoice_no}} (under review)",
    ar: "استلمنا دفع الفاتورة {{invoice_no}} ({{plan_name}}، {{total}} جنيه شامل الضريبة) ✓ {{review_text}} لوحتك: {{dashboard_url}}\n{{invoice_details_text}}",
    en: "We received the payment of invoice {{invoice_no}} ({{plan_name}}, EGP {{total}} VAT included) ✓ {{review_text}} Your dashboard: {{dashboard_url}}\n{{invoice_details_text}}" },
  payment_failed: { s: "الدفع ماتمّش — فاتورة {{invoice_no}} / Payment not completed — invoice {{invoice_no}}",
    ar: "محاولة دفع الفاتورة {{invoice_no}} ماتمّتش. تقدر تحاول تاني من هنا: {{pay_url}}",
    en: "The payment attempt for invoice {{invoice_no}} did not go through. You can try again here: {{pay_url}}" },
  renewal_reminder: { s: "تجديد اشتراك {{plan_name}} / Renewal of your {{plan_name}}", list: "updates",
    ar: "اشتراكك في {{plan_name}} بينتهي يوم {{plan_until}} (فاضل {{days_left}} يوم). فاتورة التجديد {{invoice_no}}: {{pay_url}}",
    en: "Your {{plan_name}} subscription ends on {{plan_until}} ({{days_left}} days left). Renewal invoice {{invoice_no}}: {{pay_url}}" },
};

/* ---------------------------------------------------------------- small helpers ---------------------------------------------------------------- */
const RID = "23456789abcdefghjkmnpqrstuvwxyz";
export function rid(n) { let s = ""; while (s.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) if (b < 248 && s.length < n) s += RID[b % 31]; return s; } // no modulo bias
const payToken = () => { let s = ""; for (const x of crypto.getRandomValues(new Uint8Array(24))) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }; // 32 chars
/* ACC-CONTRACT §0.4: harmless in HTML text, quoted attributes and JS strings (every module carries its own copy) */
const neutral = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "ˋ").trim();
const neutral1 = (s, max) => neutral(s).replace(/\s+/g, " ").slice(0, max);
const neutralN = (s, max) => neutral(String(s == null ? "" : s).replace(/\r\n?/g, "\n")).replace(/\n{3,}/g, "\n\n").slice(0, max);
const bool = v => v === true || v === 1 || v === "1" || v === "true" || v === "on";
const hexOf = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function hmacHex(hash, key, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(String(key)), { name: "HMAC", hash }, false, ["sign"]);
  return hexOf(await crypto.subtle.sign("HMAC", k, typeof data === "string" ? enc.encode(data) : data));
}
const ctEq = (a, b) => !!a && !!b && safeEq(String(a).toLowerCase(), String(b).toLowerCase()); // hex digests
const fmtMoney = minor => { const m = Math.round(+minor || 0), p = Math.floor(m / 100), c = m % 100; return p.toLocaleString("en-US") + (c ? "." + String(c).padStart(2, "0") : ""); };
const payUrl = (env, token) => `${site(env)}pay.html#inv=${token}`;
const dayStartIso = d => iso(cairoToUtc(d, "00:00") ?? cairoToUtc(d, "01:00") ?? Date.parse(d + "T00:00:00Z")); // 00:00 does not exist on Egypt's DST day
const dayEndMs = d => cairoToUtc(d, "23:59") ?? Date.parse(d + "T21:59:00Z");
const untilText = (exp, en) => (exp ? cairoDay(Date.parse(exp)) : en ? "no end date" : "بدون تاريخ انتهاء");
const maskEmail = e => { const s = String(e || ""), at = s.lastIndexOf("@"); return at > 0 ? s[0] + "•••@" + s.slice(at + 1) : ""; };
const noTable = e => /no such table/i.test(String((e && e.message) || e || ""));
export class PayError extends Error { constructor(status, code, msg, extra) { super(msg || code); this.status = status; this.code = code; this.extra = extra || {}; } }
const CARD_RX = /^(?:card(?:_?(?:number|no|num|holder|cvv|cvc|expiry|exp))?|cc_?(?:number|num|no)|pan|cvv2?|cvc2?|csc|security_?code|expiry(?:_?date)?|exp(?:iry)?_?(?:month|year|date|mm|yy))$/i;
/* §11.3.7: no endpoint accepts card fields — payments happen on the provider's hosted page only */
export function hasCardFields(o, d = 0) { if (!o || typeof o !== "object" || d > 4) return false; for (const k of Object.keys(o)) if (CARD_RX.test(k) || hasCardFields(o[k], d + 1)) return true; return false; }
function phoneE164(p) {
  const raw = String(p || "").replace(/[^\d+]/g, ""), d = raw.replace(/\D/g, "");
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  if (/^01[0125]\d{8}$/.test(d)) return "+2" + d;
  if (/^201[0125]\d{8}$/.test(d)) return "+" + d;
  if (/^00\d{8,15}$/.test(d)) return "+" + d.slice(2);
  return "";
}
function splitName(n) { const s = line(n, 100).replace(/[^\p{L}\p{N}\s.'-]/gu, " ").replace(/\s+/g, " ").trim(), p = s ? s.split(" ") : []; return [line(p[0] || "Customer", 50), line(p.slice(1).join(" ") || "NA", 50)]; }

/* ---------------------------------------------------------------- HTTP (ACC-CONTRACT §0.3 echo-CORS) ---------------------------------------------------------------- */
const SITE_ORIGINS = ["https://madeinegyptgate.com", "https://www.madeinegyptgate.com"];
function ccCors(req, env) {
  const o = (req && req.headers.get("Origin")) || "", extra = String((env && env.CC_ORIGINS) || "").split(",").map(s => s.trim()).filter(Boolean);
  return o && (SITE_ORIGINS.includes(o) || extra.includes(o)) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Platform-Key", "Access-Control-Max-Age": "600" } : {};
}
const ccJson = (req, env, body, status = 200, extra) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env), ...(extra || {}) } });
const ccErr = (req, env, status, code, msg, extra) => ccJson(req, env, { error: msg || code, code, ...(extra || {}) }, status);
const ccPreflight = (req, env) => new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) } });
/* provider callbacks: no CORS at all */
const hookJson = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
function errOut(req, env, e) {
  if (e instanceof PayError) return ccErr(req, env, e.status, e.code, e.message, e.extra);
  if (noTable(e)) return ccErr(req, env, 503, "store_off", "payments store not configured — run migration 0006");
  if (e && e.code === "config_secret_missing") return ccErr(req, env, 503, "config_secret_missing", "CONFIG_SECRET is not set on the Worker");
  console.error("payments error", (e && e.message) || e);
  return ccErr(req, env, 500, "server", "server error");
}
async function body(req, max = 16384) {
  const b = await readJson(req, max);
  if (b.tooLarge) throw new PayError(413, "too_large", "request too large");
  if (b.bad) throw new PayError(400, "bad_json", "bad json");
  if (hasCardFields(b)) throw new PayError(400, "card_data_refused", "card details are never accepted here — payment happens on the provider's secure page");
  return b;
}
function csvCell(v) { let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
const csvText = (rows, cols) => "﻿" + [cols.map(csvCell).join(","), ...rows.map(r => cols.map(c => csvCell(r[c])).join(","))].join("\n") + "\n";
const csvResp = (req, env, name, text) => new Response(text, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${cairoDay()}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin", ...ccCors(req, env) } });
function paging(q, csv) {
  if (csv) return { page: 0, limit: 10000 };
  const page = Math.max(0, parseInt(q.get("page"), 10) || 0), l = parseInt(q.get("limit"), 10);
  return { page, limit: l >= 1 && l <= 200 ? l : 50 };
}

/* ---------------------------------------------------------------- settings, secrets, readiness ---------------------------------------------------------------- */
const vatOf = v => { const n = parseInt(v, 10); return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : VAT_DEFAULT; };
async function settingsMap(env) {
  const { results } = await env.DB.prepare("SELECT k, v FROM cc_settings WHERE scope = 'pay' OR k IN ('manual_pay_ar', 'manual_pay_en', 'vat_bp')").all();
  const o = {}; for (const r of results || []) o[r.k] = String(r.v == null ? "" : r.v); return o;
}
function cfgFrom(s) {
  const p = String(s["pay.provider"] || "").toLowerCase(), mode = s["pay.mode"] === "live" ? "live" : "test";
  const host = prov => { const h = String(s[`pay.${prov}.host`] || "").toLowerCase(); return h && HOST[prov].rx.test(h) ? h : HOST[prov][mode]; };
  return { enabled: s["pay.enabled"] === "1", provider: PROVIDERS[p] ? p : "", mode, currency: "EGP", manual_fallback: s["pay.manual_fallback"] === "1",
    success_url: s["pay.success_url"] || "", fail_url: s["pay.fail_url"] || "", notes: s["pay.notes"] || "", merchant_id: s["pay.merchant_id"] || "",
    ngenius: { outlet_id: s["pay.ngenius.outlet_id"] || s["pay.outlet_id"] || "", host_set: s["pay.ngenius.host"] || "", host: host("ngenius") },
    paymob: { integration_ids: s["pay.paymob.integration_ids"] || "", public_key: s["pay.paymob.public_key"] || "", host_set: s["pay.paymob.host"] || "", host: host("paymob") },
    paytabs: { profile_id: s["pay.paytabs.profile_id"] || "", host_set: s["pay.paytabs.host"] || "", host: host("paytabs") },
    manual_ar: s.manual_pay_ar || "", manual_en: s.manual_pay_en || "", vat_bp: vatOf(s.vat_bp) };
}
async function payConfig(env) { try { return cfgFrom(await settingsMap(env)); } catch (e) { if (noTable(e)) return { ...cfgFrom({}), store: false }; throw e; } }
/* plaintext | "" (not set) | null (set but unreadable: other / missing CONFIG_SECRET) */
async function slotValue(env, slot) { try { return await getSecret(env, slot); } catch (e) { return noTable(e) ? "" : null; } }
const idsOf = s => String(s || "").split(",").map(x => x.trim()).filter(x => /^\d{1,12}$/.test(x)).map(Number);
async function providerCfg(env, provider, cfg) {
  cfg = cfg || await payConfig(env);
  const sl = SLOT[provider] || {}, pc = { provider, mode: cfg.mode, api_key: "", webhook_secret: "" };
  for (const k of Object.keys(sl)) pc[k] = await slotValue(env, sl[k]);
  if (provider === "ngenius") Object.assign(pc, { host: cfg.ngenius.host, outlet_id: cfg.ngenius.outlet_id });
  if (provider === "paymob") Object.assign(pc, { host: cfg.paymob.host, public_key: cfg.paymob.public_key, integration_ids: idsOf(cfg.paymob.integration_ids) });
  if (provider === "paytabs") Object.assign(pc, { host: cfg.paytabs.host, profile_id: cfg.paytabs.profile_id });
  return pc;
}
/* §5.4 readiness: ready = live mode + enabled + complete (customers can pay online); sandbox = test mode + complete (owner's test
   invoices only); manual = instructions filled AND (manual is the chosen, enabled method OR the fallback is ticked) */
async function readiness(env, cfg) {
  const p = cfg.provider, miss = [];
  if (!p) miss.push("provider");
  let complete = false;
  if (ONLINE.includes(p)) {
    const pc = await providerCfg(env, p, cfg);
    const need = (ok, code) => { if (!ok) miss.push(code); };
    const sec = (v, code) => { if (v === null) miss.push(code + "_unreadable"); else if (!v) miss.push(code); };
    if (!configSecretOk(env)) miss.push("config_secret");
    if (p === "ngenius") { need(RX.outlet.test(pc.outlet_id || ""), "outlet_id"); sec(pc.api_key, "api_key"); }
    if (p === "paymob") {
      need(pc.integration_ids.length > 0, "integration_ids"); need(RX.pm_pk.test(pc.public_key || ""), "public_key"); sec(pc.api_key, "api_key"); sec(pc.webhook_secret, "webhook_secret");
      const modes = [pc.api_key, pc.public_key].map(k => { const m = /^egy_[sp]k_(test|live)_/.exec(k || ""); return m ? m[1] : ""; }).filter(Boolean);
      if (modes.some(m => m !== cfg.mode)) miss.push("key_mode_mismatch");
    }
    if (p === "paytabs") { need(RX.pt_profile.test(pc.profile_id || ""), "profile_id"); sec(pc.api_key, "api_key"); }
    complete = miss.length === 0;
  }
  const manualText = !!String(cfg.manual_ar || "").trim();
  if ((p === "manual" || cfg.manual_fallback) && !manualText) miss.push("manual_text");
  if (p && !cfg.enabled) miss.push("enabled");
  if (ONLINE.includes(p) && cfg.mode !== "live") miss.push("mode_live");
  const ready = complete && cfg.enabled && cfg.mode === "live", sandbox = complete && cfg.mode === "test";
  const manual = manualText && ((p === "manual" && cfg.enabled) || cfg.manual_fallback);
  return { ready, sandbox, manual, missing: miss, state: ready ? "ready" : manual ? "manual" : sandbox ? "sandbox" : "not_ready" };
}
const READY = new WeakMap(); // env.DB → {at, v}
/* {ready, provider, manual} — public readiness (also compiled into the overlay by content.js: window.MIGPAYREADY). Never throws. */
export async function payReady(env, { fresh = false } = {}) {
  const off = { ready: false, provider: "", manual: false };
  try {
    if (!env || !env.DB) return off;
    const m = !fresh && READY.get(env.DB); if (m && Date.now() - m.at < 30000) return m.v;
    const cfg = await payConfig(env), r = await readiness(env, cfg), v = { ready: r.ready, provider: r.ready ? cfg.provider : "", manual: !!r.manual };
    READY.set(env.DB, { at: Date.now(), v }); return v;
  } catch (e) { return off; }
}

/* ---------------------------------------------------------------- invoices ---------------------------------------------------------------- */
async function planRow(env, plan) { try { return await env.DB.prepare("SELECT plan, name_ar, name_en, price_egp, duration_days, sellable FROM cc_plans WHERE plan = ?").bind(plan).first(); } catch (e) { if (noTable(e)) return null; throw e; } }
async function vatBp(env) { try { return vatOf(await env.DB.prepare("SELECT v FROM cc_settings WHERE k = 'vat_bp'").first("v")); } catch (e) { return VAT_DEFAULT; } }
const getInv = (env, id) => env.DB.prepare("SELECT * FROM cc_invoices WHERE id = ?").bind(id).first();
const invByNo = (env, no) => env.DB.prepare("SELECT * FROM cc_invoices WHERE no = ?").bind(no).first();
const invByToken = (env, t) => env.DB.prepare("SELECT * FROM cc_invoices WHERE pay_token = ?").bind(t).first();
/* ACC-CONTRACT §5.4: INV-<yyyy>-<6 digits> (Cairo year), gap-free (counter + insert in one transaction), net = price × 100, VAT frozen.
   Owner test invoices use their own series TEST-<yyyy>-<6 digits> so real numbering stays gap-free. Idempotent per inquiry_ref.
   o.quote (planQuote, Terms §5): the amount and period of a renewal / prorated upgrade instead of the full price from today.
   o.single: ONE open invoice per member / mailbox, checked and inserted in the same transaction (the counter too, so a refused insert
   leaves no gap) — a parallel second request gets 409 open_invoice (review F4). */
export async function issueInvoice(env, o, CC) {
  const plan = canonPlan(o.plan), test = o.test ? 1 : 0, email = line(o.email, 254).toLowerCase(), source = SOURCES.includes(o.source) ? o.source : "admin";
  if (!isEmail(email)) throw new PayError(400, "invalid_email", "a valid e-mail is required");
  if (plan === "visitor") throw new PayError(400, "invalid_plan", "this plan cannot be invoiced");
  const pr = await planRow(env, plan);
  if (!pr || !(+pr.price_egp > 0)) throw new PayError(409, "no_price", "this plan has no price in the plans matrix");
  if (!pr.sellable && !o.allowUnsellable) throw new PayError(409, "not_sellable", "this plan is not offered for sale");
  if (o.inquiry_ref) { const ex = await env.DB.prepare("SELECT * FROM cc_invoices WHERE inquiry_ref = ?").bind(o.inquiry_ref).first(); if (ex) return { invoice: ex, existed: true }; }
  const q = o.quote && o.quote.plan === plan ? o.quote : null, vat_bp = q ? q.vat_bp : await vatBp(env), t = now(), year = cairoDay().slice(0, 4);
  const net = q ? Math.max(0, Math.round(+q.net_minor || 0)) : Math.round(+pr.price_egp) * 100, vat = Math.round(net * vat_bp / 10000);
  const [ck, prefix] = test ? ["invtest:" + year, "TEST-" + year + "-"] : ["inv:" + year, "INV-" + year + "-"];
  const row = { id: o.id || rid(16), member_id: line(o.member_id, 64), email, email_key: emailKey(email), company: neutral1(o.company, 160), plan, plan_name: neutral1(pr.name_ar, 120) || PLAN_NAME[plan][0],
    period_days: q && q.period_days > 0 ? Math.round(q.period_days) : +pr.duration_days > 0 ? Math.round(+pr.duration_days) : 365, period_end: q && q.prorated ? line(q.until, 40) : "",
    net_minor: net, vat_bp, vat_minor: vat, total_minor: net + vat, currency: "EGP", status: "open", source,
    inquiry_ref: line(o.inquiry_ref, 40), pay_token: payToken(), test, issued_at: t, due_at: line(o.due_at, 40), notes: neutralN(o.notes, 1000), created_by: line(o.by, 120), created_at: t, updated_at: t };
  const cols = Object.keys(row), single = !!o.single && !test;
  // the open-invoice guard of o.single, evaluated inside the transaction (bound to the member, or to the mailbox while unbound)
  const NONE_OPEN = "NOT EXISTS (SELECT 1 FROM cc_invoices WHERE status = 'open' AND test = 0 AND (email_key = ? OR (? != '' AND member_id = ?)))", noneArgs = [row.email_key, row.member_id, row.member_id];
  try {
    await env.DB.batch(single ? [
      env.DB.prepare(`INSERT INTO cc_counters (k, n) SELECT ?, 1 WHERE ${NONE_OPEN} ON CONFLICT(k) DO UPDATE SET n = n + 1`).bind(ck, ...noneArgs),
      env.DB.prepare(`INSERT INTO cc_invoices (no, ${cols.join(", ")}) SELECT ? || printf('%06d', (SELECT n FROM cc_counters WHERE k = ?)), ${cols.map(() => "?").join(", ")} WHERE ${NONE_OPEN}`).bind(prefix, ck, ...cols.map(k => row[k]), ...noneArgs),
    ] : [
      env.DB.prepare("INSERT INTO cc_counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(ck),
      env.DB.prepare(`INSERT INTO cc_invoices (no, ${cols.join(", ")}) VALUES (? || printf('%06d', (SELECT n FROM cc_counters WHERE k = ?)), ${cols.map(() => "?").join(", ")})`).bind(prefix, ck, ...cols.map(k => row[k])),
    ]);
  } catch (e) { // a parallel call for the same signup won the unique inquiry_ref: the transaction (counter included) rolled back
    if (row.inquiry_ref && /unique/i.test(String((e && e.message) || ""))) { const ex = await env.DB.prepare("SELECT * FROM cc_invoices WHERE inquiry_ref = ?").bind(row.inquiry_ref).first(); if (ex) return { invoice: ex, existed: true }; }
    throw e;
  }
  let inv = await getInv(env, row.id);
  if (!inv && single) { const open = await openFor(env, row.member_id ? { id: row.member_id, email } : null, email); throw new PayError(409, "open_invoice", "there is already an open invoice", { invoice: open ? invMini(env, open) : null }); }
  if (source !== "test" && !/^admin|^platform/.test(String(o.auditedBy || ""))) { const mine = source === "member" || source === "upgrade" || (source === "renewal" && /^u/.test(String(o.by || "")));
    await sysAudit(env, { actor_id: mine ? o.by : "system", actor_role: mine ? "member" : "system", action: "pay.invoice", target_id: inv.id, summary: `${inv.no} ${plan} (${source})`, after: { no: inv.no, plan, total_minor: inv.total_minor, source, inquiry_ref: inv.inquiry_ref } }); }
  if (o.send && !test) { try { await sendInvoiceMail(env, CC, inv, { reason: "issued", lang: o.lang }); inv = await getInv(env, row.id); } catch (e) { console.warn("payments invoice mail", inv.id, (e && e.message) || e); } }
  return { invoice: inv };
}
function invOut(env, r) {
  return { id: r.id, no: r.no, member_id: r.member_id, email: r.email, company: r.company, plan: r.plan, plan_name: r.plan_name, period_days: r.period_days, period_end: r.period_end || "", net_minor: r.net_minor, vat_bp: r.vat_bp,
    vat_minor: r.vat_minor, total_minor: r.total_minor, currency: r.currency, status: r.status, source: r.source, inquiry_ref: r.inquiry_ref, test: !!r.test, issued_at: r.issued_at, due_at: r.due_at,
    paid_at: r.paid_at, paid_via: r.paid_via, provider: r.provider, provider_ref: r.provider_ref, manual_ref: r.manual_ref, notes: r.notes, issued_mail_at: r.issued_mail_at, link_mail_at: r.link_mail_at,
    reminder_at: r.reminder_at, created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at, pay_url: r.status === "open" ? payUrl(env, r.pay_token) : "",
    member: r.m_email !== undefined && r.member_id ? { id: r.member_id, email: r.m_email || "", company: r.m_company || "", plan: r.m_plan || "", plan_expires: r.m_plan_expires || "" } : null };
}
const invMini = (env, r) => ({ no: r.no, status: r.status, plan: r.plan, plan_name: r.plan_name, source: r.source, period_days: r.period_days, period_end: r.period_end || "", total_minor: r.total_minor, currency: r.currency, issued_at: r.issued_at, paid_at: r.paid_at, pay_url: r.status === "open" ? payUrl(env, r.pay_token) : "" });

/* ---------------------------------------------------------------- e-mails (through the e-mail center when it is wired) ---------------------------------------------------------------- */
const fill = (s, v) => String(s || "").replace(/\{\{(\w+)\}\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : ""));
/* the e-mail center renders the ★ templates (defaults + the owner's overrides); every variable goes as {ar, en} so each body gets the text
   of its own language (gateway sentence, plan name, currency …). Its result is spread into mail() (tpl + __rendered: no second pass). */
async function render(env, CC, key, lang, va, ve) {
  const em = CC && CC.email;
  if (em && typeof em.renderTemplate === "function") {
    try {
      const vars = {}; for (const k of new Set([...Object.keys(va), ...Object.keys(ve)])) vars[k] = { ar: va[k] == null ? "" : String(va[k]), en: ve[k] == null ? "" : String(ve[k]) };
      const r = await em.renderTemplate(env, key, { lang, vars });
      if (r && r.ar && r.en) return r;
    } catch (e) { /* the built-in defaults below */ }
  }
  const d = TPL[key];
  return { tpl: key, subject: d.s.split(" / ").map((p, i) => fill(p, i ? ve : va)).join(" / "), ar: fill(d.ar, va).trim(), en: fill(d.en, ve).trim(), list: d.list || "", why: WHY };
}
async function sendTpl(env, CC, key, to, { id, lang, va, ve }) {
  const r = await render(env, CC, key, lang, va, ve);
  return mail(env, { ...r, id, tpl: key, to, lang: lang === "en" ? "en" : "ar", subject: r.subject, ar: r.ar, en: r.en, list: r.list || undefined, why: r.why || WHY });
}
async function langOf(env, inv) { if (!inv.inquiry_ref) return "ar"; try { return (await env.DB.prepare("SELECT lang FROM inquiries WHERE ref = ?").bind(inv.inquiry_ref).first("lang")) === "en" ? "en" : "ar"; } catch (e) { return "ar"; } }
/* review PAY-M4: the invoice and receipt e-mails carry the tax-invoice details — seller (operator, registration, address and the tax /
   commercial registration numbers the owner enters in «الإعدادات» → operator), buyer (company, e-mail and the tax / CR numbers the signup
   form collected), the line item, net, VAT rate and amount, total; a paid invoice adds the payment date, method and reference. A value
   that is not set is left out (never invented). Never throws: the details are omitted rather than the e-mail. */
const TAX_KEYS = ["operator_ar", "operator_en", "operator_reg_ar", "operator_reg_en", "address_ar", "address_en", "tax_no", "cr_no"];
async function taxBlock(env, inv, nameEn) {
  try {
    const s = {}, { results } = await env.DB.prepare(`SELECT k, v FROM cc_settings WHERE k IN (${TAX_KEYS.map(() => "?").join(", ")})`).bind(...TAX_KEYS).all();
    for (const r of results || []) s[r.k] = neutral1(r.v, 300);
    let bt = "", bc = "";
    if (inv.inquiry_ref) { const q = await env.DB.prepare("SELECT payload_json FROM inquiries WHERE ref = ?").bind(inv.inquiry_ref).first(); const pl = jparse(q && q.payload_json, {}) || {}; bt = neutral1(pl.tax_no || "", 40); bc = neutral1(pl.cr_no || "", 40); }
    const J = a => a.filter(Boolean).join(" — "), day = x => (x && !isNaN(Date.parse(x)) ? cairoDay(Date.parse(x)) : ""), pct = String((+inv.vat_bp || 0) / 100);
    const net = fmtMoney(inv.net_minor), vat = fmtMoney(inv.vat_minor), tot = fmtMoney(inv.total_minor), ref = line(inv.provider_ref || inv.manual_ref || "", 120);
    const via = inv.paid_via === "manual" || inv.provider === "manual" ? ["تحويل بنكي / إنستاباي (مسجّل من فريق المنصة)", "bank transfer / InstaPay (recorded by the platform team)"] : inv.provider ? [`أونلاين عن طريق ${inv.provider}`, `online through ${inv.provider}`] : ["", ""];
    const paid = inv.status === "paid" && inv.paid_at;
    const ar = ["تفاصيل الفاتورة:", `فاتورة رقم ${inv.no} · تاريخ الإصدار ${day(inv.issued_at)}`,
      "البائع: " + J([s.operator_ar || "منصة صنع في مصر", s.operator_reg_ar, s.address_ar, s.tax_no && "رقم التسجيل الضريبي " + s.tax_no, s.cr_no && "السجل التجاري " + s.cr_no]),
      "المشتري: " + J([neutral1(inv.company || "", 160), inv.email, bt && "رقم التسجيل الضريبي " + bt, bc && "السجل التجاري " + bc]),
      `البند: اشتراك ${inv.plan_name} لمدة ${+inv.period_days || 0} يوم`,
      `الصافي ${net} جنيه · ضريبة القيمة المضافة ${pct}% = ${vat} جنيه · الإجمالي ${tot} جنيه`];
    const en = ["Invoice details:", `Invoice ${inv.no} · issued ${day(inv.issued_at)}`,
      "Seller: " + J([s.operator_en || s.operator_ar || "Made in Egypt Gate", s.operator_reg_en || s.operator_reg_ar, s.address_en || s.address_ar, s.tax_no && "Tax registration no. " + s.tax_no, s.cr_no && "Commercial register " + s.cr_no]),
      "Buyer: " + J([neutral1(inv.company || "", 160), inv.email, bt && "Tax registration no. " + bt, bc && "Commercial register " + bc]),
      `Item: ${nameEn} subscription for ${+inv.period_days || 0} days`,
      `Net EGP ${net} · VAT ${pct}% = EGP ${vat} · Total EGP ${tot}`];
    if (paid) { ar.push(J([`اتدفعت يوم ${day(inv.paid_at)}`, via[0] && "طريقة الدفع: " + via[0], ref && "المرجع: " + ref])); en.push(J([`Paid on ${day(inv.paid_at)}`, via[1] && "method: " + via[1], ref && "reference: " + ref])); }
    return [ar.join("\n"), en.join("\n")];
  } catch (e) { return ["", ""]; }
}
async function baseVars(env, inv, extra) {
  const pr = await planRow(env, inv.plan), nameEn = (pr && pr.name_en) || PLAN_NAME[inv.plan][1], url = payUrl(env, inv.pay_token), total = fmtMoney(inv.total_minor);
  const b = { invoice_no: inv.no, total, pay_url: url, company: inv.company || inv.email, dashboard_url: `${site(env)}dashboard.html#plan` }, tx = await taxBlock(env, inv, nameEn);
  return [{ ...b, plan_name: inv.plan_name, currency: "جنيه", invoice_details_text: tx[0], ...((extra && extra[0]) || {}) }, { ...b, plan_name: nameEn, currency: "EGP", invoice_details_text: tx[1], ...((extra && extra[1]) || {}) }];
}
async function sendInvoiceMail(env, CC, inv, { reason = "issued", lang } = {}) {
  const cfg = await payConfig(env), r = await readiness(env, cfg), online = inv.test ? r.sandbox : r.ready, url = payUrl(env, inv.pay_token);
  const g = online ? [`ادفع أونلاين من صفحة الدفع الآمنة: ${url}`, `Pay online on the secure payment page: ${url}`] : GW_WAIT;
  const mt = r.manual ? [`${neutralN(cfg.manual_ar, 2000)}\nاكتب رقم الفاتورة ${inv.no} في بيان التحويل.`, `${neutralN(cfg.manual_en || cfg.manual_ar, 2000)}\nWrite the invoice number ${inv.no} in the transfer description.`] : ["", ""];
  const [va, ve] = await baseVars(env, inv, [{ gateway_text: g[0], manual_text: mt[0] }, { gateway_text: g[1], manual_text: mt[1] }]);
  const id = reason === "issued" ? `inv-${inv.id}-issued` : `inv-${inv.id}-${reason}-${Date.now().toString(36)}`;
  const res = await sendTpl(env, CC, "invoice_issued", inv.email, { id, lang: lang || await langOf(env, inv), va, ve });
  if (res && res.sent) { const t = now(); await env.DB.prepare("UPDATE cc_invoices SET issued_mail_at = ?, link_mail_at = CASE WHEN ? = 1 AND link_mail_at = '' THEN ? ELSE link_mail_at END, updated_at = ? WHERE id = ?").bind(t, online ? 1 : 0, t, t, inv.id).run(); }
  return { sent: !!(res && res.sent), error: (res && !res.sent && res.error) || undefined };
}
async function sendLinkMail(env, CC, inv, { resend = false } = {}) {
  const [va, ve] = await baseVars(env, inv);
  const res = await sendTpl(env, CC, "payment_link", inv.email, { id: resend ? `paylink-${inv.id}-r${Date.now().toString(36)}` : `paylink-${inv.id}`, lang: await langOf(env, inv), va, ve });
  if (res && res.sent) await env.DB.prepare("UPDATE cc_invoices SET link_mail_at = ?, updated_at = ? WHERE id = ?").bind(now(), now(), inv.id).run();
  return { sent: !!(res && res.sent), error: (res && !res.sent && res.error) || undefined };
}
async function sendFailedMail(env, CC, inv, pay) {
  try { const [va, ve] = await baseVars(env, inv); await sendTpl(env, CC, "payment_failed", inv.email, { id: `payfail-${inv.id}-${pay.id.slice(0, 8)}`, lang: await langOf(env, inv), va, ve }); } catch (e) { /* optional template, best effort */ }
}
/* «محتاج تدخّل»: payment anomalies (amount mismatch, double payment, payment for a void invoice, lower plan) → TEAM_EMAIL + ADMIN_EMAILS */
async function teamAlert(env, inv, what, ar, en) {
  try {
    let i = 0;
    for (const to of adminEmails(env)) await mail(env, { id: `teamneed-pay-${inv.id}-${what}-${i++}`, tpl: "team_needs_alert", to, lang: "ar", subject: `[محتاج تدخّل] الدفع — فاتورة ${inv.no} / [Action needed] payment — invoice ${inv.no}`, ar, en });
  } catch (e) { /* best effort */ }
}

/* review F1: the bank-transfer / InstaPay text tells customers where their money goes (/pay/, every invoice e-mail, the overlay) — every change
   is e-mailed to the owners (ADMIN_EMAILS) with the old and the new text, whoever made it and through which section. Best effort: the change
   itself is already saved and audited when this runs. */
export async function payeeNotice(env, by, before, after, where = "payments") {
  let n = 0;
  try {
    const owners = [...new Set(String((env && env.ADMIN_EMAILS) || "").split(/[\s,;]+/).map(x => line(x, 254).toLowerCase()).filter(isEmail))];
    const keys = ["manual_pay_ar", "manual_pay_en"].filter(k => after && k in after);
    if (!owners.length || !keys.length) return 0;
    const show = v => (v != null && String(v).trim() ? neutralN(v, 2000) : "—"), lab = { manual_pay_ar: ["عربي", "Arabic"], manual_pay_en: ["إنجليزي", "English"] };
    const sec = where === "settings" ? ["«الإعدادات»", "«Settings»"] : ["«بوابة الدفع»", "«Payment gateway»"], who = line(by, 254) || "?";
    const ar = `اتغيّرت تعليمات التحويل اليدوي (البنك / إنستاباي) اللي بتظهر للعملاء في صفحة الدفع وفي كل فاتورة.\nبواسطة ${who} من ${sec[0]}.\n`
      + keys.map(k => `\n(${lab[k][0]}) قبل:\n${show(before && before[k])}\n(${lab[k][0]}) بعد:\n${show(after[k])}`).join("\n") + "\n\nلو التغيير ده مش منك، رجّع النص الصحيح من «بوابة الدفع» فوراً وراجع «سجل العمليات».";
    const en = `The manual-transfer instructions (bank / InstaPay) that customers see on the payment page and on every invoice were changed by ${who} in ${sec[1]}.\n`
      + keys.map(k => `\n(${lab[k][1]}) before:\n${show(before && before[k])}\n(${lab[k][1]}) after:\n${show(after[k])}`).join("\n") + "\n\nIf this was not you, restore the correct text in «Payment gateway» at once and check the audit log.";
    const tag = Date.now().toString(36);
    for (const to of owners) { const r = await mail(env, { id: `payee-${tag}-${n}`, tpl: "team_needs_alert", to, lang: "ar", subject: "[تنبيه] اتغيّرت بيانات التحويل للعملاء / [Alert] the customers' transfer instructions changed", ar, en }); if (r && r.sent) n++; }
  } catch (e) { /* best effort */ }
  return n;
}

/* ---------------------------------------------------------------- audit (provider / system events; admin writes go through adm.audit) ---------------------------------------------------------------- */
const RED_RX = /pass|secret|token|api_?key|hmac|server_key/i;
function redact(v, d = 0) {
  if (v == null) return null;
  if (typeof v === "string") return v.length > 2000 ? v.slice(0, 2000) : v;
  if (d > 5) return null;
  if (Array.isArray(v)) return v.slice(0, 100).map(x => redact(x, d + 1));
  if (typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = RED_RX.test(k) ? "***" : redact(x, d + 1); return o; }
  return v;
}
async function sysAudit(env, e) {
  try {
    await env.DB.prepare("INSERT INTO cc_audit (at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json, ip_hash, req_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')")
      .bind(now(), line(e.actor_id || "system", 120), line(e.actor_email || "", 254), line(e.actor_role || "system", 20), e.action, e.target_type || "invoice", line(e.target_id || "", 120), line(e.summary || "", 300), JSON.stringify(redact(e.before === undefined ? null : e.before)), JSON.stringify(redact(e.after === undefined ? null : e.after))).run();
  } catch (x) { /* provider callbacks must not fail on the audit table; admin writes use adm.audit (fails closed) */ }
}
/* admin writes: audited BEFORE the change, and refused when the audit insert fails (ACC-CONTRACT §0.6) */
async function admAudit(adm, action, type, id, before, after, summary) {
  if (!adm || typeof adm.audit !== "function") throw new PayError(500, "audit_failed", "audit unavailable — nothing was changed");
  let r; try { r = await adm.audit(action, type, id, before, after, summary); } catch (e) { throw new PayError(500, "audit_failed", "audit failed — nothing was changed"); }
  if (r === false) throw new PayError(500, "audit_failed", "audit failed — nothing was changed");
}
const actorOf = adm => (adm && adm.member ? { id: adm.member.id, email: adm.member.email || "", role: adm.role || "" } : { id: "platform", email: "", role: (adm && adm.role) || "platform" });

/* ---------------------------------------------------------------- members: link, pending, activation ---------------------------------------------------------------- */
/* invoices issued before the buyer had an account become theirs once the mailbox is proven (e-mail code / login link) */
async function linkLoose(env, m) {
  if (!m || !m.id || !isEmail(m.email) || !m.email_verified_at) return 0;
  const { results } = await env.DB.prepare("SELECT id, email, plan, status, source FROM cc_invoices WHERE member_id = '' AND email_key = ? LIMIT 50").bind(emailKey(m.email)).all();
  let n = 0;
  for (const r of results || []) {
    if (!sameMailbox(r.email, m.email)) continue;
    const u = await env.DB.prepare("UPDATE cc_invoices SET member_id = ?, updated_at = ? WHERE id = ? AND member_id = ''").bind(m.id, now(), r.id).run();
    if (u.meta && u.meta.changes === 1) { n++; if (r.source === "signup" && r.status === "open") await setPending(env, m, r.plan); }
  }
  return n;
}
/* §5.4: a signup leaves its account "pending" (subscription not completed) — never for a member who already has a plan in force or is suspended */
async function setPending(env, m, plan) {
  try {
    const t = now(), inForce = effPlan(m) !== "visitor" ? 1 : 0;
    await env.DB.prepare(`INSERT INTO cc_member_meta (member_id, status, requested_plan, source, created_at, updated_at) VALUES (?, ?, ?, 'signup', ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET status = CASE WHEN cc_member_meta.status = 'suspended' OR ? = 1 THEN cc_member_meta.status ELSE 'pending' END, requested_plan = excluded.requested_plan, updated_at = excluded.updated_at`)
      .bind(m.id, inForce ? "active" : "pending", plan, t, t, inForce).run();
  } catch (e) { /* no meta table yet: the dashboard keeps deploy 1's status line */ }
}
async function ensureMember(env, inv) {
  if (inv.member_id) { const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(inv.member_id).first(); if (m) return m; }
  let m = await findByEmail(env, inv.email);
  if (!m) { // created by the platform at payment: verified (the plan is the platform's word); an e-mail-code sign-in adopts it
    const id = "u" + hex(8), t = now();
    await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at, email_verified_at) VALUES (?, ?, ?, 'visitor', 1, ?, ?, '')").bind(id, line(inv.company, 160), inv.email, t, t).run();
    m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  }
  await env.DB.prepare("UPDATE cc_invoices SET member_id = ?, updated_at = ? WHERE id = ? AND member_id = ''").bind(m.id, now(), inv.id).run();
  return m;
}
/* expiry = max(now, current expiry when the SAME plan is in force) + duration, to the end of that Cairo day; the same plan without an end
   date keeps none; a prorated upgrade (period_end, Terms §5 «احتساب الفرق نسبياً للمدة المتبقية») keeps the end of the plan in force; a
   full-price upgrade starts a new period. Never applied now (the ledger says why, paymentsCron applies it once that is no longer true):
   a HIGHER plan in force (never lowered — review PAY-H2) or a SUSPENDED account (a payment never lifts an admin's suspension — PAY-H3). */
function targetExpiry(m, inv, nowMs = Date.now(), meta = null) {
  if (meta && meta.status === "suspended") return { skip: "suspended", cur: canonPlan(meta.suspended_plan || "visitor") };
  const cur = effPlan(m, iso(nowMs));
  if ((PLAN_LV[cur] || 0) > (PLAN_LV[inv.plan] || 0)) return { skip: "higher", cur };
  const curMs = Date.parse(m.plan_expires || "") || 0, pe = Date.parse(inv.period_end || "");
  if (cur !== inv.plan && Number.isFinite(pe) && pe > nowMs) return { exp: iso(Math.max(pe, cur !== "visitor" && curMs > nowMs ? curMs : 0)) };
  if (cur === inv.plan && !m.plan_expires) return { exp: "" };
  const base = cur === inv.plan && curMs > nowMs ? curMs : nowMs, days = inv.period_days > 0 ? inv.period_days : 365;
  const ms = dayEndMs(cairoDay(base + days * DAY_MS));
  return { exp: iso(Number.isFinite(ms) ? ms : base + days * DAY_MS) };
}
const metaOf = async (env, id) => { try { return id ? await env.DB.prepare("SELECT status, suspended_plan, suspended_expires, requested_plan FROM cc_member_meta WHERE member_id = ?").bind(id).first() : null; } catch (e) { return null; } };
const ACT = id => "activate:" + id;
const ledger = (env, invId) => env.DB.prepare("SELECT * FROM cc_pay_events WHERE event_key = ? ORDER BY id LIMIT 1").bind(ACT(invId)).first();
const KINDS = ["webhook", "return", "query", "manual"];
async function startActivation(env, CC, inv, actor) {
  if (inv.test) return { activated: false, test: true };
  const m = await ensureMember(env, inv), te = targetExpiry(m, inv, Date.now(), await metaOf(env, m.id));
  const ins = await env.DB.prepare("INSERT INTO cc_pay_events (provider, event_key, kind, invoice_id, payment_id, verified, result, payload_sha, created_at) VALUES (?, ?, ?, ?, '', 1, ?, '', ?) ON CONFLICT(provider, event_key) DO NOTHING")
    .bind(inv.provider || "manual", ACT(inv.id), KINDS.includes(inv.paid_via) ? inv.paid_via : "manual", inv.id, te.skip ? "activated:skip_" + te.skip : "activating:" + te.exp, now()).run();
  if (!ins.meta || ins.meta.changes !== 1) return { activated: false, started_elsewhere: true };
  if (te.skip) { await skippedActivation(env, CC, inv, m, te, actor); return { activated: false, skipped: te.skip, member: { id: m.id, plan: m.plan, plan_expires: m.plan_expires } }; }
  return runActivation(env, CC, inv, m.id, te.exp, actor);
}
/* a paid invoice that cannot be applied now: audit + the team's «محتاج تدخّل» + the payer's receipt with the «review» wording and a bell.
   The ledger keeps "activated:skip_<why>"; cronActivations applies the plan as soon as the reason is gone (the higher plan ended / the
   suspension was lifted), so a paid invoice is never lost (review PAY-H2 / PAY-H3). */
async function skippedActivation(env, CC, inv, m, te, actor) {
  const curName = PLAN_NAME[te.cur] || PLAN_NAME.visitor, until = untilText(m.plan_expires), untilEn = untilText(m.plan_expires, true);
  const why = te.skip === "suspended" ? ["الحساب موقوف", "the account is suspended"] : [`عنده باقة أعلى سارية (${curName[0]})`, `a higher plan is in force (${curName[1]})`];
  await sysAudit(env, { actor_id: actor.id, actor_email: actor.email, actor_role: actor.role, action: "pay.paid", target_id: inv.id, summary: `${inv.no} paid — not applied: ${te.skip === "suspended" ? "account suspended" : "higher plan " + te.cur + " kept"}, applied automatically later`, after: { status: "paid", plan: inv.plan, kept: te.cur, skipped: te.skip } });
  await teamAlert(env, inv, te.skip, `اتدفعت الفاتورة ${inv.no} (${inv.plan_name}) لكن ${why[0]}. الباقة ماتغيّرتش دلوقتي، وهتتفعّل تلقائياً ${te.skip === "suspended" ? "أول ما الإيقاف يتشال" : `لما الباقة الحالية تخلص (${until})`}. لو ده غلط من العميل، رجّع المبلغ من «بوابة الدفع» وسجّل الاسترداد.`,
    `Invoice ${inv.no} (${inv.plan_name}) was paid but ${why[1]}. The plan was not changed now; it is applied automatically ${te.skip === "suspended" ? "once the suspension is lifted" : `when the current plan ends (${untilEn})`}. If the customer paid by mistake, refund it at the gateway and record the refund.`);
  const fresh = (await getInv(env, inv.id)) || inv;
  const rv = te.skip === "suspended" ? ["الحساب موقوف دلوقتي، فالباقة هتتفعّل لما الإيقاف يتشال — فريقنا هيتواصل معاك.", "Your account is suspended right now, so the plan starts once the suspension is lifted — our team will contact you."]
    : [`باقتك الحالية (${curName[0]}) أعلى وسارية لحد ${until}، فالباقة دي هتبدأ تلقائياً بعد ما تخلص. لو مش ده اللي كنت عايزه، رد على الإيميل ده أو كلّمنا ونرجّعلك المبلغ.`, `Your current plan (${curName[1]}) is higher and runs until ${untilEn}, so this plan starts automatically when it ends. If that is not what you wanted, reply to this e-mail or contact us for a refund.`];
  try { const [va, ve] = await baseVars(env, fresh, [{ review_text: rv[0] }, { review_text: rv[1] }]); await sendTpl(env, CC, "payment_review", fresh.email, { id: `paidrv-${fresh.id}`, lang: await langOf(env, fresh), va, ve }); } catch (e) { console.warn("payments review mail", fresh.id); }
  try { await notify(env, m.id, { kind: "payment", ref: fresh.no, url: "dashboard.html#plan", title: `اتدفعت الفاتورة ${fresh.no} ✓ (قيد المراجعة)`, title_en: `Invoice ${fresh.no} paid ✓ (under review)`, body: rv[0], body_en: rv[1] }); } catch (e) { /* bell is best effort */ }
}
/* the GCC states a paid invoice of a pick plan (Premium = Egypt + the states the member picks) brings — DESIGN §2.2, review M-1:
   1. a choice already IN FORCE on this very plan (a renewal) is kept: the platform team changes it (DESIGN Q2). Other states sent with
      this purchase are never applied silently → {kept, asked} (afterActivation tells the member);
   2. otherwise the states chosen WITH THIS INVOICE: «باقتي» (prefs_json.gcc_next for inv.no), else the registration form it came from
      (inquiries.payload_json.gcc via inv.inquiry_ref) → {gcc, gcc_src} for setPlan;
   3. otherwise nothing new: a valid stored choice (an earlier Premium period) applies again, else «not chosen yet» (all six + the prompt).
   Runs before setPlan, so "in force" is the plan before this activation (a retry after a crash finds the applied list in force: no-op). */
async function purchaseGcc(env, inv, memberId) {
  const pick = gccPick(inv.plan);
  if (!pick) return {};
  try {
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first(); if (!m) return {};
    const stored = normGcc(prefsOf(m).gcc), nx = gccNextOf(m);
    let g = nx && nx.inv === inv.no ? nx.gcc : [], src = "member";
    if (g.length !== pick && inv.inquiry_ref) {
      const q = await env.DB.prepare("SELECT payload_json FROM inquiries WHERE ref = ?").bind(inv.inquiry_ref).first();
      g = normGcc((jparse(q && q.payload_json, {}) || {}).gcc); src = "signup";
    }
    if (g.length !== pick) g = [];
    if (effPlan(m) === canonPlan(inv.plan) && stored.length === pick) return g.length && g.join() !== stored.join() ? { kept: stored, asked: g } : {};
    return g.length ? { gcc: g, gcc_src: src } : {};
  } catch (e) { return {}; }
}
const gccCountAr = n => (n === 1 ? "دولة خليجية واحدة" : n === 2 ? "دولتين خليجيتين" : `${n} دول خليجية`);
/* setPlan with an ABSOLUTE expiry is idempotent, so a retry after a crash can never extend twice */
async function runActivation(env, CC, inv, memberId, exp, actor) {
  const setPlan = CC && CC.acc && CC.acc.setPlan;
  if (typeof setPlan !== "function") { console.warn("payments: CC.acc.setPlan is not wired — activation queued", inv.id); return { activated: false, queued: true }; }
  const pg = await purchaseGcc(env, inv, memberId);
  await setPlan(env, { memberId, plan: inv.plan, expires: exp, by: { actor_id: actor.id, actor_email: actor.email || "", actor_role: actor.role || "" }, reason: "payment", invoiceNo: inv.no, ...(pg.gcc ? { gcc: pg.gcc, gcc_src: pg.gcc_src } : {}) });
  const u = await env.DB.prepare("UPDATE cc_pay_events SET result = ? WHERE event_key = ? AND result LIKE 'activating:%'").bind("activated:" + exp, ACT(inv.id)).run();
  if (u.meta && u.meta.changes === 1) await afterActivation(env, CC, inv, memberId, exp, actor, pg);
  const m = await env.DB.prepare("SELECT id, plan, plan_expires, activated_at FROM members WHERE id = ?").bind(memberId).first();
  return { activated: true, plan_expires: exp, member: m || null };
}
async function afterActivation(env, CC, inv, memberId, exp, actor, pg = {}) {
  const fresh = (await getInv(env, inv.id)) || inv;
  try { const [va, ve] = await baseVars(env, fresh, [{ plan_until: untilText(exp) }, { plan_until: untilText(exp, true) }]); await sendTpl(env, CC, "payment_received", fresh.email, { id: `paid-${fresh.id}`, lang: await langOf(env, fresh), va, ve }); } catch (e) { console.warn("payments receipt mail", fresh.id); }
  try { await notify(env, memberId, { kind: "payment", ref: fresh.no, url: "dashboard.html#plan", title: `اتدفعت الفاتورة ${fresh.no} ✓`, title_en: `Invoice ${fresh.no} paid ✓`, body: `اتفعّلت ${fresh.plan_name} لحد ${untilText(exp)}.`, body_en: `Your plan is active until ${untilText(exp, true)}.` }); } catch (e) { /* bell is best effort */ }
  await sysAudit(env, { actor_id: actor.id, actor_email: actor.email, actor_role: actor.role, action: "pay.paid", target_type: "invoice", target_id: fresh.id, summary: `${fresh.no} paid → ${fresh.plan} until ${untilText(exp, true)}`, after: { status: "paid", plan: fresh.plan, plan_expires: exp, via: fresh.paid_via, provider: fresh.provider } });
  // a renewal whose application named other GCC states than the ones in force: they stay as they are — say so (review M-1)
  if (pg && pg.kept && pg.asked) try {
    await notify(env, memberId, { kind: "plan", ref: "gcc-kept:" + fresh.no, url: "dashboard.html#plan", title: "دولك الخليجية فضلت زي ما هي", title_en: "Your Gulf states stay the same",
      body: `باقتك اتجددت على نفس الدول: ${gccNames(pg.kept)}. الدول اللي في الطلب (${gccNames(pg.asked)}) مااتطبقتش — لتغيير الدول كلّم فريق المنصة.`,
      body_en: `Your plan was renewed with the same states: ${gccNames(pg.kept, true)}. The states in your application (${gccNames(pg.asked, true)}) were not applied — to change your states, contact the platform team.` });
  } catch (e) { /* bell is best effort */ }
  // Premium activated without a choice of GCC states (an invoice from before the picker, the team's invoice): all six for now + the prompt
  try {
    const m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(memberId).first(), g = gccOf(m);
    if (m && g.pending) await notify(env, memberId, { kind: "plan", ref: "gcc:" + fresh.no, url: "dashboard.html#plan",
      title: g.pick === 3 ? "اختار دولك الخليجية التلاتة" : `اختار دولك الخليجية (${g.pick})`, title_en: `Choose your ${g.pick} Gulf state${g.pick === 1 ? "" : "s"}`,
      body: `باقتك فيها مصر + ${gccCountAr(g.pick)} تختارها. لحد ما تختار، بتوصلك فرص كل دول الخليج مؤقتاً.`, body_en: `Your plan covers Egypt + ${g.pick} Gulf state${g.pick === 1 ? "" : "s"} of your choice. Until you choose, you get the opportunities of all the Gulf states for now.` });
  } catch (e) { /* bell is best effort */ }
}
/* open → paid exactly once (guarded UPDATE); then the activation ledger. Activation errors never undo the payment (the cron retries). */
async function markPaid(env, CC, inv, o) {
  const t = now(), paidAt = o.paid_at || t;
  const u = await env.DB.prepare("UPDATE cc_invoices SET status = 'paid', paid_at = ?, paid_via = ?, provider = ?, provider_ref = ?, manual_ref = ?, updated_at = ? WHERE id = ? AND status = 'open'")
    .bind(paidAt, o.via, o.provider, line(o.provider_ref, 120), line(o.manual_ref || "", 120), t, inv.id).run();
  if (!u.meta || u.meta.changes !== 1) return { changed: false };
  if (o.payment && o.payment.id) await env.DB.prepare("UPDATE cc_payments SET status = 'paid', verified_via = ?, provider_txn = CASE WHEN ? != '' THEN ? ELSE provider_txn END, raw_status = CASE WHEN ? != '' THEN ? ELSE raw_status END, error = '', updated_at = ? WHERE id = ?")
    .bind(o.via, o.txn || "", o.txn || "", o.raw || "", o.raw || "", t, o.payment.id).run();
  const fresh = await getInv(env, inv.id);
  let activation = null;
  if (fresh.test) await sysAudit(env, { actor_id: o.actor.id, actor_email: o.actor.email, actor_role: o.actor.role, action: "pay.paid", target_id: fresh.id, summary: `${fresh.no} (test) paid — no plan change`, after: { status: "paid", test: true } });
  else { try { activation = await startActivation(env, CC, fresh, o.actor); } catch (e) { console.warn("payments activation", fresh.id, (e && e.message) || e); activation = { activated: false, retry: true }; } }
  return { changed: true, invoice: fresh, activation };
}

/* ---------------------------------------------------------------- provider adapters (§5.1 / §5.2) ---------------------------------------------------------------- */
const DEV_RX = /^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/;
const devOrigin = env => { const d = String((env && env.PAY_DEV_ORIGIN) || "").replace(/\/+$/, ""); return DEV_RX.test(d) ? d : ""; };
async function pfetch(env, url, init) {
  const d = devOrigin(env), u = d ? d + "/" + url.replace(/^https:\/\//, "") : url;
  let r;
  try { r = await fetch(u, { ...init, signal: AbortSignal.timeout(15000) }); }
  catch (e) { throw new PayError(502, "provider_error", "payment provider unreachable", { provider_code: e && e.name === "TimeoutError" ? "timeout" : "network" }); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  return { status: r.status, ok: r.ok, json: j };
}
function provErr(provider, r, step) {
  const j = (r && r.json) || {}, c = j.code || j.errorCode || (Array.isArray(j.errors) && j.errors[0] && (j.errors[0].errorCode || j.errors[0].code)) || "";
  return new PayError(502, "provider_error", `${provider} ${step} failed`, { provider_code: (r ? "http_" + r.status : "network") + (/^[A-Za-z0-9_.-]{1,40}$/.test(String(c)) ? ":" + c : "") });
}
function okRedirect(env, provider, u) {
  const d = devOrigin(env); if (d && String(u).startsWith(d + "/")) return true;
  let x; try { x = new URL(u); } catch (e) { return false; }
  return x.protocol === "https:" && !x.username && !x.password && PAGE_RX[provider].test(x.hostname) && !/[\s"'<>`]/.test(String(u));
}
const NGTOK = new WeakMap(); // env.DB → Map(host|key-hash → {token, exp})
async function ngToken(env, pc) {
  const key = pc.host + "|" + (await sha256(pc.api_key)).slice(0, 16), box = (env.DB && NGTOK.get(env.DB)) || new Map();
  if (env.DB) NGTOK.set(env.DB, box);
  const c = box.get(key); if (c && c.exp > Date.now()) return c.token;
  const r = await pfetch(env, `https://${pc.host}/identity/auth/access-token`, { method: "POST", headers: { Authorization: "Basic " + pc.api_key, "Content-Type": "application/vnd.ni-identity.v1+json", Accept: "application/vnd.ni-identity.v1+json" } });
  if (!r.ok || !r.json || !r.json.access_token) throw provErr("ngenius", r, "token");
  box.set(key, { token: String(r.json.access_token), exp: Date.now() + Math.max(0, (+r.json.expires_in || 300) - 30) * 1000 });
  return String(r.json.access_token);
}
const NG_PAID = ["PURCHASED", "CAPTURED"], NG_FAIL = ["FAILED", "DECLINED", "CANCELLED", "REVERSED", "EXPIRED"];
function ngClassify(o) {
  const ps = (o && o._embedded && Array.isArray(o._embedded.payment) ? o._embedded.payment : []).filter(Boolean);
  const paid = ps.find(p => NG_PAID.includes(String(p.state || "").toUpperCase()));
  if (paid) return { status: "paid", raw: String(paid.state).toUpperCase(), txn: line(paid._id || paid.reference || "", 120) };
  const last = ps[ps.length - 1], raw = String((last && last.state) || (o && o.state) || "").toUpperCase();
  return { status: NG_FAIL.includes(raw) ? "failed" : "pending", raw: line(raw || "UNKNOWN", 40), txn: line((last && (last._id || last.reference)) || "", 120) };
}
/* Paymob transaction HMAC: SHA-512 over these 20 values in this (lexicographic) order; true/false as text, null as "" */
const PM_FIELDS = ["amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
  "is_standalone_payment", "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success"];
const pmVal = v => (v === true ? "true" : v === false ? "false" : v == null ? "" : String(v));
const pmGet = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
export const paymobHmacString = obj => PM_FIELDS.map(f => pmVal(pmGet(obj, f))).join("");
const pmQueryString = sp => PM_FIELDS.map(f => sp.get(f === "order.id" ? "order" : f) || "").join("");
const TRUE = v => v === true || v === "true";
function pmEvent(g) {
  const st = TRUE(g("is_refunded")) || TRUE(g("is_voided")) ? "refunded" : TRUE(g("pending")) ? "pending" : TRUE(g("success")) && !TRUE(g("error_occured")) ? "paid" : "failed";
  const id = line(pmVal(g("id")), 30);
  return { event_key: `paymob:${id}:${st}`, status: st, raw_status: st, provider_txn: id, provider_order: line(pmVal(g("order.id")), 40), merchant_ref: line(pmVal(g("order.merchant_order_id")) || pmVal(g("merchant_order_id")), 80),
    amount_minor: Number(pmVal(g("amount_cents"))), currency: line(pmVal(g("currency")), 3).toUpperCase(), _id_ok: /^\d{1,20}$/.test(id) };
}
const phpEnc = s => encodeURIComponent(s).replace(/[!'()*~]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, "+");
/* PayTabs return form: HMAC-SHA256(server key) over the non-empty fields except `signature`, sorted by key, PHP-urlencoded (VERIFY: PHP's
   array_filter also drops "0" — both canonical forms are accepted; each is a keyed HMAC, so accepting either is no weaker) */
async function ptReturnOk(key, params) {
  const sig = params.get("signature") || ""; if (!sig || !key) return false;
  const ent = [...params.entries()].filter(([k]) => k !== "signature" && k !== "t" && k !== "c");
  for (const keep of [v => v !== "", v => v !== "" && v !== "0"]) {
    const q = ent.filter(([, v]) => keep(v)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => phpEnc(k) + "=" + phpEnc(v)).join("&");
    if (ctEq(await hmacHex("SHA-256", key, q), sig)) return true;
  }
  return false;
}
const ADAPTER = {
  paymob: {
    async checkout(env, pc, inv, pay, payer) {
      const [fn, ln] = splitName(payer.name || inv.company);
      const b = { amount: inv.total_minor, currency: "EGP", payment_methods: pc.integration_ids, items: [{ name: line(inv.plan_name, 50) || inv.plan, amount: inv.total_minor, description: inv.no, quantity: 1 }],
        billing_data: { first_name: fn, last_name: ln, email: inv.email, phone_number: payer.phone || "NA", apartment: "NA", floor: "NA", street: "NA", building: "NA", city: "NA", state: "NA", country: "EG" },
        special_reference: inv.no + "-" + pay.id.slice(0, 8), notification_url: site(env) + "api/pay/webhook/paymob", redirection_url: site(env) + "api/pay/return/paymob?t=" + inv.pay_token, extras: { invoice: inv.no } };
      const r = await pfetch(env, `https://${pc.host}/v1/intention/`, { method: "POST", headers: { Authorization: "Token " + pc.api_key, "Content-Type": "application/json" }, body: JSON.stringify(b) });
      const j = r.json || {};
      // intention_order_id = the transaction's HMAC-covered order.id: the ONLY key a callback is bound by (review L3) — no checkout without it
      if ((r.status !== 201 && r.status !== 200) || !j.client_secret || j.id == null || j.intention_order_id == null || !/^\d{1,20}$/.test(String(j.intention_order_id))) throw provErr("paymob", r, "intention");
      return { redirect_url: `https://${pc.host}/unifiedcheckout/?publicKey=${encodeURIComponent(pc.public_key)}&clientSecret=${encodeURIComponent(j.client_secret)}`, provider_ref: line(String(j.id), 120), provider_order: line(String(j.intention_order_id), 40), raw_status: line(j.status || "", 40) };
    },
  },
  ngenius: {
    async checkout(env, pc, inv, pay, payer) {
      const tok = await ngToken(env, pc), back = site(env) + "api/pay/return/ngenius?t=" + inv.pay_token;
      const b = { action: "PURCHASE", amount: { currencyCode: "EGP", value: inv.total_minor }, emailAddress: inv.email, merchantOrderReference: inv.no, language: payer.lang === "en" ? "en" : "ar",
        merchantAttributes: { redirectUrl: back, cancelUrl: back + "&c=1", skipConfirmationPage: true } };
      const r = await pfetch(env, `https://${pc.host}/transactions/outlets/${encodeURIComponent(pc.outlet_id)}/orders`, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/vnd.ni-payment.v2+json", Accept: "application/vnd.ni-payment.v2+json" }, body: JSON.stringify(b) });
      const j = r.json || {}, href = j._links && j._links.payment && j._links.payment.href, st = j._embedded && Array.isArray(j._embedded.payment) && j._embedded.payment[0] && j._embedded.payment[0].state;
      if (!r.ok || !j.reference || !href) throw provErr("ngenius", r, "order");
      return { redirect_url: String(href), provider_ref: line(String(j.reference), 120), provider_order: "", raw_status: line(st || "", 40) };
    },
    async query(env, pc, ref) { // authoritative status (return, webhook and cron all come here)
      const tok = await ngToken(env, pc);
      const r = await pfetch(env, `https://${pc.host}/transactions/outlets/${encodeURIComponent(pc.outlet_id)}/orders/${encodeURIComponent(ref)}`, { method: "GET", headers: { Authorization: "Bearer " + tok, Accept: "application/vnd.ni-payment.v2+json" } });
      const o = r.json;
      if (!r.ok || !o || String(o.reference || "") !== String(ref)) throw provErr("ngenius", r, "status");
      const c = ngClassify(o);
      return { event_key: `ngenius:${ref}:${c.raw}`, status: c.status, raw_status: c.raw, provider_txn: c.txn, amount_minor: Number(o.amount && o.amount.value), currency: line((o.amount && o.amount.currencyCode) || "", 3).toUpperCase(), merchant_ref: line(o.merchantOrderReference || "", 80) };
    },
  },
  paytabs: {
    async checkout(env, pc, inv, pay, payer) {
      const b = { profile_id: +pc.profile_id, tran_type: "sale", tran_class: "ecom", cart_id: inv.no + "-" + pay.id.slice(0, 8), cart_currency: "EGP", cart_amount: +(inv.total_minor / 100).toFixed(2),
        cart_description: line(`${inv.plan_name} — ${inv.no}`, 120), paypage_lang: payer.lang === "en" ? "en" : "ar",
        customer_details: { name: line(payer.name || inv.company || "Customer", 80), email: inv.email, phone: payer.phone || "NA", street1: "NA", city: "NA", state: "NA", country: "EG", zip: "00000" },
        hide_shipping: true, callback: site(env) + "api/pay/webhook/paytabs", return: site(env) + "api/pay/return/paytabs?t=" + inv.pay_token };
      const r = await pfetch(env, `https://${pc.host}/payment/request`, { method: "POST", headers: { authorization: pc.api_key, "content-type": "application/json" }, body: JSON.stringify(b) });
      const j = r.json || {};
      if (!r.ok || !j.tran_ref || !j.redirect_url) throw provErr("paytabs", r, "request");
      return { redirect_url: String(j.redirect_url), provider_ref: line(String(j.tran_ref), 120), provider_order: "", raw_status: "" };
    },
    async query(env, pc, tranRef) {
      const r = await pfetch(env, `https://${pc.host}/payment/query`, { method: "POST", headers: { authorization: pc.api_key, "content-type": "application/json" }, body: JSON.stringify({ profile_id: +pc.profile_id, tran_ref: tranRef }) });
      const j = r.json;
      if (!r.ok || !j || String(j.tran_ref || "") !== String(tranRef)) throw provErr("paytabs", r, "query");
      const rs = line(String((j.payment_result && j.payment_result.response_status) || ""), 4).toUpperCase();
      return { event_key: `paytabs:${tranRef}:${rs || "NONE"}`, status: rs === "A" ? "paid" : !rs || rs === "H" || rs === "P" ? "pending" : "failed", raw_status: rs, provider_txn: line(String(tranRef), 120),
        amount_minor: Math.round(parseFloat(j.cart_amount) * 100), currency: line(j.cart_currency || "", 3).toUpperCase(), merchant_ref: line(j.cart_id || "", 80) };
    },
  },
};
async function payerOf(env, inv, lang) {
  let name = "", phone = "", l = lang;
  try {
    if (inv.member_id) { const m = await env.DB.prepare("SELECT name, phone FROM members WHERE id = ?").bind(inv.member_id).first(); if (m) { name = m.name || ""; phone = m.phone || ""; } }
    if (inv.inquiry_ref) { const q = await env.DB.prepare("SELECT name, phone, lang FROM inquiries WHERE ref = ?").bind(inv.inquiry_ref).first(); if (q) { name = name || q.name || ""; phone = phone || q.phone || ""; l = l || q.lang; } }
  } catch (e) { /* defaults */ }
  return { name: name || inv.company || "", phone: phoneE164(phone), lang: l === "en" ? "en" : "ar" };
}

/* ---------------------------------------------------------------- result handling: one path for every provider (§5.4) ---------------------------------------------------------------- */
/* idempotency: the first verified event wins; a duplicate is ignored — except a row left "processing" by a crashed attempt (> 2 min) or
   marked "error:" by a failed one, which a retry (provider retry, browser return, cron re-query) takes over */
async function claimEvent(env, ev, inv) {
  const t = now();
  const r = await env.DB.prepare("INSERT INTO cc_pay_events (provider, event_key, kind, invoice_id, payment_id, verified, result, payload_sha, created_at) VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?) ON CONFLICT(provider, event_key) DO NOTHING")
    .bind(ev.provider, line(ev.event_key, 200), ev.kind, inv.id, ev.payment.id, ev.verified ? 1 : 0, line(ev.payload_sha || "", 64), t).run();
  if (r.meta && r.meta.changes === 1) return true;
  const u = await env.DB.prepare("UPDATE cc_pay_events SET result = 'processing', kind = ?, created_at = ? WHERE provider = ? AND event_key = ? AND (result LIKE 'error:%' OR (result = 'processing' AND created_at < ?))")
    .bind(ev.kind, t, ev.provider, line(ev.event_key, 200), iso(Date.now() - 120000)).run();
  return !!(u.meta && u.meta.changes === 1);
}
async function setEventResult(env, ev, result) { try { await env.DB.prepare("UPDATE cc_pay_events SET result = ? WHERE provider = ? AND event_key = ?").bind(line(result, 120), ev.provider, line(ev.event_key, 200)).run(); } catch (e) { /* best effort */ } }
async function logEvent(env, e) {
  try { await env.DB.prepare("INSERT INTO cc_pay_events (provider, event_key, kind, invoice_id, payment_id, verified, result, payload_sha, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider, event_key) DO NOTHING")
    .bind(e.provider, line(e.event_key, 200), e.kind, e.invoice_id || "", e.payment_id || "", e.verified ? 1 : 0, line(e.result, 120), line(e.payload_sha || "", 64), now()).run(); } catch (x) { /* best effort */ }
}
/* rejected calls (bad signature, unconfigured) are logged under their own keys (never the real event key: a forged call can never
   pre-empt the genuine one) and bounded per provider per hour */
async function rejected(env, provider, kind, psha, why) {
  try { if (await rateOk(env, "payrej|" + provider, 100, 3600)) await logEvent(env, { provider, event_key: `rejected:${kind}:${String(psha).slice(0, 40)}`, kind, verified: 0, result: "rejected:" + why, payload_sha: psha }); } catch (e) { /* best effort */ }
}
const refMatches = (mr, no) => mr === no || String(mr).startsWith(no + "-");
const provActor = p => ({ actor_id: "provider:" + p, actor_role: "provider" });
async function applyResult(env, CC, ev) {
  const inv = await getInv(env, ev.payment.invoice_id);
  if (!inv) return { result: "ignored:no_invoice" };
  if (!(await claimEvent(env, ev, inv))) return { duplicate: true };
  let result;
  try { result = await decide(env, CC, ev, inv); }
  catch (e) { await setEventResult(env, ev, "error:" + line((e && (e.code || e.message)) || "exception", 60)); throw e; }
  await setEventResult(env, ev, result);
  return { result };
}
async function decide(env, CC, ev, inv) {
  const pay = ev.payment, t = now(), raw = line(ev.raw_status, 40), txn = line(ev.provider_txn, 120), prov = PROVIDERS[ev.provider].label;
  if (ev.merchant_ref && !refMatches(ev.merchant_ref, inv.no)) {
    // Paymob's merchant_order_id is outside its HMAC: a mismatch is noted, never a decision (the binding is the signed order.id) — review L3.
    // N-Genius / PayTabs references come from our own server-side re-query: a mismatch there rejects the result.
    await sysAudit(env, { ...provActor(ev.provider), action: "pay.mismatch", target_id: inv.id, summary: `reference mismatch on ${inv.no}${ev.provider === "paymob" ? " (unsigned field, noted only)" : ""}`, after: { merchant_ref: ev.merchant_ref, payment: pay.id } });
    if (ev.provider !== "paymob") return "rejected:reference";
  }
  if (ev.status === "paid") {
    if (ev.amount_minor !== inv.total_minor || ev.currency !== inv.currency) {
      await env.DB.prepare("UPDATE cc_payments SET error = 'amount mismatch', raw_status = ?, updated_at = ? WHERE id = ?").bind(raw, t, pay.id).run();
      await sysAudit(env, { ...provActor(ev.provider), action: "pay.mismatch", target_id: inv.id, summary: `amount mismatch on ${inv.no}`, before: { total_minor: inv.total_minor, currency: inv.currency }, after: { amount_minor: ev.amount_minor, currency: ev.currency, payment: pay.id } });
      await teamAlert(env, inv, "amount", `وصل إشعار دفع من ${prov} للفاتورة ${inv.no} بمبلغ ${fmtMoney(ev.amount_minor)} ${ev.currency || "?"} بدل ${fmtMoney(inv.total_minor)} جنيه. الفاتورة لسه مفتوحة ومفيش باقة اتفعّلت — راجع لوحة البوابة.`,
        `${prov} reported a payment for invoice ${inv.no} of ${fmtMoney(ev.amount_minor)} ${ev.currency || "?"} instead of EGP ${fmtMoney(inv.total_minor)}. The invoice stays open and no plan was activated — check the gateway dashboard.`);
      return "rejected:amount";
    }
    let cur = inv;
    if (cur.status === "open") {
      const mp = await markPaid(env, CC, cur, { via: ev.kind, provider: ev.provider, provider_ref: pay.provider_ref || txn, payment: pay, txn, raw, actor: { id: "provider:" + ev.provider, email: "", role: "provider" } });
      if (mp.changed) return cur.test ? "paid:test" : "paid";
      cur = await getInv(env, inv.id); // another path marked it a moment ago
    }
    const p2 = await env.DB.prepare("SELECT status FROM cc_payments WHERE id = ?").bind(pay.id).first("status");
    if (cur.status === "paid" && (p2 === "paid" || (cur.provider_ref && cur.provider_ref === (pay.provider_ref || txn)))) return "duplicate";
    await env.DB.prepare("UPDATE cc_payments SET status = 'paid', verified_via = ?, provider_txn = CASE WHEN ? != '' THEN ? ELSE provider_txn END, raw_status = ?, updated_at = ? WHERE id = ?").bind(ev.kind, txn, txn, raw, t, pay.id).run();
    if (cur.status === "paid") {
      await sysAudit(env, { ...provActor(ev.provider), action: "pay.duplicate", target_id: inv.id, summary: `second payment on ${inv.no}`, after: { payment: pay.id, provider_ref: pay.provider_ref } });
      await teamAlert(env, inv, "duplicate", `الفاتورة ${inv.no} اتدفعت مرتين (دفعة تانية عن طريق ${prov}، مرجع ${pay.provider_ref || txn}). الباقة اتفعّلت مرة واحدة بس — رجّع المبلغ الزيادة من لوحة البوابة.`,
        `Invoice ${inv.no} was paid twice (a second payment through ${prov}, reference ${pay.provider_ref || txn}). The plan was activated once — refund the extra amount from the gateway dashboard.`);
      return "paid_duplicate";
    }
    await sysAudit(env, { ...provActor(ev.provider), action: "pay.orphan", target_id: inv.id, summary: `payment on ${cur.status} invoice ${inv.no}`, after: { payment: pay.id, invoice_status: cur.status } });
    await teamAlert(env, inv, "orphan", `وصل دفع للفاتورة ${inv.no} وهي ${cur.status === "void" ? "ملغاة" : "مستردّة"} (${prov}، مرجع ${pay.provider_ref || txn}). مفيش باقة اتفعّلت — قرّر: تفعيل يدوي أو استرداد.`,
      `A payment arrived for invoice ${inv.no}, which is ${cur.status} (${prov}, reference ${pay.provider_ref || txn}). No plan was activated — decide: activate manually or refund.`);
    return "paid_not_open:" + cur.status;
  }
  if (ev.status === "pending") { await env.DB.prepare("UPDATE cc_payments SET status = 'pending', raw_status = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'redirected', 'pending')").bind(raw, t, pay.id).run(); return "pending"; }
  if (ev.status === "refunded") { await sysAudit(env, { ...provActor(ev.provider), action: "pay.refund_notice", target_id: inv.id, summary: `${prov} reports a refund/void on ${inv.no} — record it in the panel if it is final`, after: { payment: pay.id } }); return "ignored:refund"; }
  const u = await env.DB.prepare("UPDATE cc_payments SET status = 'failed', raw_status = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'redirected', 'pending', 'cancelled')").bind(raw, t, pay.id).run();
  if (u.meta && u.meta.changes === 1 && inv.status === "open" && !inv.test) await sendFailedMail(env, CC, inv, pay);
  return "failed";
}

/* ---------------------------------------------------------------- automatic invoice on signup (§5.4) ---------------------------------------------------------------- */
async function invEvent(env, inq, visible, ar, en, meta) {
  await env.DB.prepare("INSERT INTO inquiry_events (inquiry_id, type, actor, body, meta_json, buyer_visible, created_at) VALUES (?, 'invoice', 'system', ?, ?, ?, ?)").bind(inq.id, ar, JSON.stringify({ ...(meta || {}), en }), visible ? 1 : 0, now()).run();
}
async function openFor(env, m, email) {
  const { results } = await env.DB.prepare("SELECT * FROM cc_invoices WHERE status = 'open' AND test = 0 AND (member_id = ? OR (member_id = '' AND email_key = ?)) ORDER BY issued_at DESC LIMIT 20").bind(m ? m.id : "-", emailKey(email || (m && m.email) || "")).all();
  return (results || []).find(r => (m && r.member_id === m.id) || sameMailbox(r.email, email || (m && m.email))) || null;
}
/* called by index.js after a 201 on POST /api/inquiries (and by the cron backstop). Never throws. */
export async function onInquiryCreated(env, ref, CC) {
  try {
    if (!env || !env.DB || !REF_RX.test(String(ref || ""))) return { skipped: "bad_ref" };
    const inq = await env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(ref).first();
    if (!inq || inq.kind !== "signup") return { skipped: "not_signup" };
    if (await env.DB.prepare("SELECT 1 AS x FROM inquiry_events WHERE inquiry_id = ? AND type = 'invoice' LIMIT 1").bind(inq.id).first("x")) return { skipped: "done" };
    if (inq.status === "blocked") { await invEvent(env, inq, 0, "مفيش فاتورة: الطلب محظور.", "No invoice: the request is blocked."); return { skipped: "blocked" }; }
    const p = jparse(inq.payload_json, {}), plan = canonPlan(p.plan || inq.target_id), pr = plan === "visitor" ? null : await planRow(env, plan);
    if (!pr || !pr.sellable || !(+pr.price_egp > 0)) {
      if (pr === null && plan !== "visitor") { try { await env.DB.prepare("SELECT 1 FROM cc_plans LIMIT 1").first(); } catch (e) { if (noTable(e)) return { skipped: "store_off" }; } }
      await invEvent(env, inq, 0, `مفيش فاتورة اتعملت تلقائياً: الباقة «${plan}» مالهاش سعر أو مش معروضة للبيع في مصفوفة الباقات.`, `No invoice was issued automatically: the plan «${plan}» has no price or is not offered for sale in the plans matrix.`, { plan });
      return { skipped: "no_price" };
    }
    // the account this mailbox's invoice applies to when paid (ensureMember); the invoice is BOUND to it only when that account holder sent
    // the signup signed in (user_id + a confirmed mailbox) — an anonymous form with someone's address binds nothing and changes no status:
    // linkLoose attaches it after an e-mail-code sign-in (review F6)
    const m = await findByEmail(env, inq.email), bound = m && inq.user_id && inq.user_id === m.id && m.email_verified_at ? m : null;
    const quiet = (ar, en, code, meta) => invEvent(env, inq, 0, ar, en, { ...(meta || {}), code }).then(() => ({ skipped: code }));
    const neutral = ["طلبك وصل لفريقنا وهيتواصل معاك بخصوص الباقة المناسبة لحسابك.", "Your request reached our team, who will contact you about the right plan for your account."];
    if (m && ((await metaOf(env, m.id)) || {}).status === "suspended") { // a suspended account never gets a new invoice (review PAY-H3)
      await invEvent(env, inq, 1, neutral[0], neutral[1]);
      return quiet("مفيش فاتورة: الحساب ده موقوف — راجع «الأعضاء والاشتراكات».", "No invoice: this account is suspended — see «Members & subscriptions».", "suspended");
    }
    let q;
    try { q = await planQuote(env, m, plan); } // renewal / prorated upgrade / new period, priced for that account (Terms §5, review PAY-H1)
    catch (e) {
      if (!(e instanceof PayError) || e.code !== "plan_lower") throw e;
      // a lower plan while a higher one is in force is never invoiced (review PAY-H2): it would be paid and never applied
      const from = (e.extra && e.extra.available_from) || "";
      if (bound) await invEvent(env, inq, 1, `باقتك الحالية أعلى من اللي اخترتها وسارية${from ? " لحد " + from : ""} — تقدر تنزل لباقة أقل لما تخلص (فاتورة التجديد بتوصلك قبلها بـ30 يوم).`, `Your current plan is higher than the one you chose and runs${from ? " until " + from : ""} — you can move to a lower plan when it ends (the renewal invoice arrives 30 days before).`, { plan, available_from: from });
      else await invEvent(env, inq, 1, neutral[0], neutral[1]);
      return quiet(`مفيش فاتورة: الحساب عنده باقة أعلى سارية${from ? " لحد " + from : ""} من «${plan}».`, `No invoice: the account has a higher plan in force${from ? " until " + from : ""} than «${plan}».`, "plan_lower", { plan, available_from: from });
    }
    const open = await openFor(env, m, inq.email);
    if (open && open.plan === plan) { // the same application twice: the open invoice stands, its e-mail goes out again
      await invEvent(env, inq, 1, `فاتورة الاشتراك ${open.no} لسه مفتوحة — اتبعتت تاني على إيميلك.`, `Subscription invoice ${open.no} is still open — it was e-mailed to you again.`, { invoice_no: open.no, reused: 1 });
      try { await sendInvoiceMail(env, CC, open, { reason: "again", lang: inq.lang }); } catch (e) { /* best effort */ }
      return { invoice: open, reused: true };
    }
    if (open) { // ONE open invoice per mailbox: two payable invoices for one company invite paying twice (review F4 / R2)
      await invEvent(env, inq, 1, "عندك فاتورة اشتراك مفتوحة بالفعل على الإيميل ده — ادفعها، أو غيّر الباقة من «باقتي» في لوحتك بعد الدخول بكود على الإيميل.", "There is already an open subscription invoice for this e-mail — pay it, or change the plan in «My plan» on your dashboard after signing in with an e-mail code.");
      return quiet(`مفيش فاتورة جديدة: الفاتورة ${open.no} (${open.plan}) لسه مفتوحة للإيميل ده.`, `No new invoice: invoice ${open.no} (${open.plan}) is still open for this e-mail.`, "open_invoice", { invoice_no: open.no, plan });
    }
    let r;
    try { r = await issueInvoice(env, { member_id: bound ? bound.id : "", email: inq.email, company: p.company || inq.company, plan, source: "signup", inquiry_ref: ref, by: "system", send: true, lang: inq.lang, quote: q, single: true }, CC); }
    catch (e) { if (e instanceof PayError && e.code === "open_invoice") return quiet("مفيش فاتورة جديدة: اتعملت فاتورة تانية للإيميل ده في نفس اللحظة.", "No new invoice: another invoice was issued for this e-mail at the same moment.", "open_invoice"); throw e; }
    const { invoice, existed } = r;
    if (bound) await setPending(env, bound, plan);
    await invEvent(env, inq, 1, `اتعملت فاتورة الاشتراك ${invoice.no} (الإجمالي ${fmtMoney(invoice.total_minor)} جنيه شامل الضريبة) واتبعتت على إيميلك.`,
      `Subscription invoice ${invoice.no} (total EGP ${fmtMoney(invoice.total_minor)} incl. VAT) was issued and e-mailed to you.`, { invoice_no: invoice.no });
    return { invoice, existed: !!existed };
  } catch (e) {
    if (noTable(e)) return { skipped: "store_off" };
    console.warn("payments onInquiryCreated", (e && e.message) || e);
    return { error: "failed" };
  }
}

/* ---------------------------------------------------------------- member self-service (acc.js routes /api/me/invoices through these) ---------------------------------------------------------------- */
const memberItem = (env, r) => ({ no: r.no, status: r.status, plan: r.plan, plan_name: r.plan_name, source: r.source, period_days: r.period_days, period_end: r.period_end || "", net_minor: r.net_minor, vat_bp: r.vat_bp, vat_minor: r.vat_minor, total_minor: r.total_minor, currency: r.currency, issued_at: r.issued_at, paid_at: r.paid_at, pay_url: r.status === "open" ? payUrl(env, r.pay_token) : "" });
export async function memberInvoices(env, member) {
  if (!env || !env.DB || !member || !member.id) return { items: [] };
  try {
    await linkLoose(env, member);
    const { results } = await env.DB.prepare("SELECT * FROM cc_invoices WHERE member_id = ? AND test = 0 ORDER BY issued_at DESC LIMIT 100").bind(member.id).all();
    return { items: (results || []).map(r => memberItem(env, r)) };
  } catch (e) { if (noTable(e)) return { items: [] }; throw e; }
}
/* the newest open invoice of a member ({no, total_minor, currency, pay_url, plan, plan_name}) or null — for /api/me/account */
export async function memberOpenInvoice(env, member) {
  if (!env || !env.DB || !member || !member.id) return null;
  try { await linkLoose(env, member); const r = await env.DB.prepare("SELECT * FROM cc_invoices WHERE member_id = ? AND status = 'open' AND test = 0 ORDER BY issued_at DESC LIMIT 1").bind(member.id).first(); return r ? memberItem(env, r) : null; }
  catch (e) { if (noTable(e)) return null; throw e; }
}
/* ---------- what a member pays for a plan now (Terms §5 «يجوز الترقية إلى باقة أعلى في أي وقت مع احتساب الفرق نسبياً للمدة المتبقية»,
   review PAY-H1) — the same rule for «باقتي» (quote + invoice) and the signup path:
   · new      nothing in force            → the full price, a full period from the payment
   · renewal  the same plan in force      → the full price, the new period starts at the current end (no end date: none)
   · upgrade  a higher plan, with ≥ 1 day left → the price difference for the days left (each plan's own price per day), the end date STAYS;
              no end date / under a day left / a non-positive difference → the full price and a new period
   · a lower plan while a higher one is in force → 409 plan_lower {available_from} (review PAY-H2: it would be paid and never applied) */
const cairoDaysLeft = (fromMs, toMs) => Math.round((Date.parse(cairoDay(toMs) + "T00:00:00Z") - Date.parse(cairoDay(fromMs) + "T00:00:00Z")) / DAY_MS);
export async function planQuote(env, member, plan, nowMs = Date.now()) {
  const p = canonPlan(plan), pr = p === "visitor" ? null : await planRow(env, p);
  if (!pr || !pr.sellable || !(+pr.price_egp > 0)) throw new PayError(400, "invalid_plan", "this plan is not offered for sale", { plan: p });
  const vat_bp = await vatBp(env), D = +pr.duration_days > 0 ? Math.round(+pr.duration_days) : 365, full = Math.round(+pr.price_egp) * 100;
  const cur = member ? effPlan(member, iso(nowMs)) : "visitor", curMs = Date.parse((member && member.plan_expires) || "");
  const newEnd = () => { const ms = dayEndMs(cairoDay(nowMs + D * DAY_MS)); return iso(Number.isFinite(ms) ? ms : nowMs + D * DAY_MS); };
  const out = (kind, net, period_days, until, extra) => ({ plan: p, plan_name: neutral1(pr.name_ar, 120) || PLAN_NAME[p][0], plan_name_en: line(pr.name_en || PLAN_NAME[p][1], 120), kind, current: cur,
    current_until: Number.isFinite(curMs) && cur !== "visitor" ? iso(curMs) : "", net_minor: net, vat_bp, vat_minor: Math.round(net * vat_bp / 10000), total_minor: net + Math.round(net * vat_bp / 10000),
    full_minor: full, period_days, until, prorated: false, days_left: null, ...(extra || {}) });
  if (cur === "visitor") return out("new", full, D, newEnd());
  if ((PLAN_LV[p] || 0) < (PLAN_LV[cur] || 0)) throw new PayError(409, "plan_lower", "your current plan is higher — you can move to a lower plan when it ends", { current: cur, available_from: Number.isFinite(curMs) ? cairoDay(curMs) : "" });
  if (p === cur) {
    if (!Number.isFinite(curMs)) return out("renewal", full, D, "");
    const ms = dayEndMs(cairoDay(Math.max(nowMs, curMs) + D * DAY_MS)); return out("renewal", full, D, iso(Number.isFinite(ms) ? ms : Math.max(nowMs, curMs) + D * DAY_MS));
  }
  const days = Number.isFinite(curMs) && curMs > nowMs ? cairoDaysLeft(nowMs, curMs) : 0;
  if (days >= 1) {
    const cp = await planRow(env, cur), Dc = cp && +cp.duration_days > 0 ? Math.round(+cp.duration_days) : 365, pc = cp ? Math.max(0, Math.round(+cp.price_egp) * 100) : 0;
    const charge = Math.round(full * days / D), credit = Math.round(pc * days / Dc), net = charge - credit;
    if (net > 0) return out("upgrade", net, days, iso(curMs), { prorated: true, days_left: days, charge_minor: charge, credit_minor: credit });
  }
  return out("upgrade", full, D, newEnd(), { days_left: days });
}
const quoteOut = q => ({ plan: q.plan, plan_name: q.plan_name, plan_name_en: q.plan_name_en, kind: q.kind, current: q.current, current_until: q.current_until, prorated: q.prorated, days_left: q.days_left,
  net_minor: q.net_minor, vat_bp: q.vat_bp, vat_minor: q.vat_minor, total_minor: q.total_minor, full_minor: q.full_minor, charge_minor: q.charge_minor, credit_minor: q.credit_minor, period_days: q.period_days, until: q.until, currency: "EGP" });
/* an open invoice the member may replace with a new choice: not one the team issued (source admin), and no online payment in progress
   for it (an attempt in the last hour) — a manual transfer leaves no trace until it is recorded, so «باقتي» asks first */
async function replaceable(env, inv) {
  if (!inv || inv.status !== "open" || inv.test || inv.source === "admin") return false;
  return !(await env.DB.prepare("SELECT id FROM cc_payments WHERE invoice_id = ? AND status IN ('created', 'redirected', 'pending') AND updated_at > ? LIMIT 1").bind(inv.id, iso(Date.now() - 3600000)).first("id"));
}
async function voidReplaced(env, inv, by, why) {
  const t = now(), u = await env.DB.prepare("UPDATE cc_invoices SET status = 'void', notes = trim(notes || ? || ?), updated_at = ? WHERE id = ? AND status = 'open'").bind("\n", `void ${cairoDay()}: ${why}`, t, inv.id).run();
  if (!u.meta || u.meta.changes !== 1) return false;
  await env.DB.prepare("UPDATE cc_payments SET status = 'cancelled', updated_at = ? WHERE invoice_id = ? AND status IN ('created', 'redirected', 'pending')").bind(t, inv.id).run();
  await sysAudit(env, { actor_id: by.id || "system", actor_email: by.email || "", actor_role: by.role || "system", action: "pay.void", target_id: inv.id, summary: `${inv.no} void — ${why}`, before: { status: "open" }, after: { status: "void", reason: why } });
  return true;
}
/* GET /api/me/invoices/quote?plan= — the amount and the resulting end date, BEFORE the invoice is issued («باقتي», review PAY-H1) */
export async function memberQuote(env, member, plan) {
  if (!env || !env.DB) throw new PayError(503, "store_off", "store not configured");
  if (!member || !member.id) throw new PayError(401, "unauthorized", "sign in first");
  if (((await metaOf(env, member.id)) || {}).status === "suspended") throw new PayError(403, "suspended", "حسابك موقوف — كلّمنا / your account is suspended — contact us");
  const q = await planQuote(env, member, plan);
  let open = null; try { open = await openFor(env, member, member.email); } catch (e) { if (!noTable(e)) throw e; }
  return { quote: quoteOut(q), open_invoice: open ? { ...invMini(env, open), replaceable: await replaceable(env, open) } : null };
}
/* POST /api/me/invoices {plan, replace?, gcc?}: renew (same plan), upgrade (prorated) or a new period; throws PayError {status, code, extra}:
   403 suspended (a payment never lifts a suspension — review PAY-H3) · 409 plan_lower · 409 open_invoice {invoice, replaceable} — with
   replace: true a replaceable open invoice (a signup / renewal / their own, never the team's) is voided first (review F6 / R3) ·
   422 gcc_required: moving INTO a plan whose members pick GCC states (Premium) needs exactly that many. They wait for THIS invoice
   (members.prefs_json.gcc_next = {gcc, inv, at}) and apply when it is paid (runActivation) — an unpaid or cancelled invoice never changes
   the states of the plan in force (review M-1). A renewal never needs them: a member on the plan who has not chosen yet may send them and
   they apply at once (as POST /api/me/gcc); a stored choice is kept (the platform team changes it, DESIGN Q2). */
export async function createMemberInvoice(env, member, plan, CC, { replace = false, gcc } = {}) {
  if (!env || !env.DB) throw new PayError(503, "store_off", "store not configured");
  if (!member || !member.id || !isEmail(member.email)) throw new PayError(401, "unauthorized", "sign in first");
  if (((await metaOf(env, member.id)) || {}).status === "suspended") throw new PayError(403, "suspended", "حسابك موقوف — كلّمنا / your account is suspended — contact us");
  const q = await planQuote(env, member, plan);
  await linkLoose(env, member);
  const open = await openFor(env, member, member.email), can = open ? await replaceable(env, open) : false;
  if (open && !(replace === true && can)) throw new PayError(409, "open_invoice", "you already have an open invoice", { invoice: invMini(env, open), replaceable: can });
  const pick = gccPick(q.plan), into = pick > 0 && !(gccPick(q.current) > 0), sent = gcc != null && (Array.isArray(gcc) ? gcc.length > 0 : String(gcc).trim() !== "");
  let g = null;
  if (pick > 0 && (into || (sent && gccOf(member).pending))) {
    const n = normGcc(gcc);
    if (n.length !== pick) throw new PayError(422, "gcc_required", `اختار ${pick} دول خليجية بالظبط للباقة دي / pick exactly ${pick} Gulf states for this plan`, { pick, allowed: GCC, errors: [{ field: "gcc", msg: `${pick} of ${GCC.join(", ")}`, code: "gcc_required" }] });
    g = n;
  }
  if (!(await rateOk(env, "payme|" + member.id, 5, 86400))) throw new PayError(429, "rate_limited", "too many invoices today — try again tomorrow");
  if (open && !(await voidReplaced(env, open, { id: member.id, email: member.email, role: "member" }, `replaced by the member's choice (${q.plan})`))) throw new PayError(409, "state", "the open invoice changed in the meantime — reload");
  const source = q.kind === "renewal" ? "renewal" : q.kind === "upgrade" ? "upgrade" : "member";
  const { invoice } = await issueInvoice(env, { member_id: member.id, email: member.email, company: member.company, plan: q.plan, source, by: member.id, send: true, quote: q, single: true }, CC);
  let gccSaved = null, gccNext = null;
  if (g && into) { // moving into Premium: the states wait for this invoice and apply when it is paid
    try {
      const r = await env.DB.prepare("SELECT prefs_json FROM members WHERE id = ?").bind(member.id).first(), pr = jparse((r && r.prefs_json) || "{}", {}), t = now();
      const p0 = pr && typeof pr === "object" && !Array.isArray(pr) ? pr : {};
      await env.DB.prepare("UPDATE members SET prefs_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify({ ...p0, gcc_next: { gcc: g, inv: invoice.no, at: t } }), t, member.id).run();
      gccNext = g;
    } catch (e) { console.warn("payments gcc_next", member.id, (e && e.message) || e); }
  } else if (g) { // a member on the plan who has not chosen yet: the states apply now, as from «🌍 دولك الخليجية»
    try { if (CC && CC.acc && typeof CC.acc.setGcc === "function") { await CC.acc.setGcc(env, member.id, g, { src: "member", by: { actor_id: member.id, actor_email: member.email || "", actor_role: "member" } }); gccSaved = g; } else console.warn("payments: CC.acc.setGcc is not wired", member.id); }
    catch (e) { console.warn("payments setGcc", member.id, (e && e.message) || e); }
  }
  return { invoice: invMini(env, invoice), quote: quoteOut(q), ...(open ? { replaced: open.no } : {}), ...(gccSaved ? { gcc: gccSaved } : {}), ...(gccNext ? { gcc_next: gccNext } : {}) };
}

/* ---------------------------------------------------------------- public /api/pay/* ---------------------------------------------------------------- */
export async function handlePay(req, env, ctx, CC) {
  const url = new URL(req.url), path = url.pathname.replace(/^\/api\/pay/, "").replace(/\/+$/, "") || "/";
  CC = CC || {};
  const hk = /^\/(webhook|return)\/([a-z0-9_-]{1,20})$/.exec(path);
  if (hk) return hk[1] === "webhook" ? webhook(req, env, CC, hk[2]) : providerReturn(req, env, CC, hk[2]);
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  try {
    if (!env || !env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    if (path === "/health" && req.method === "GET") return ccJson(req, env, await health(req, env));
    if (path === "/invoice" && req.method === "GET") return ccJson(req, env, await publicInvoice(req, env, url));
    if (path === "/checkout" && req.method === "POST") return ccJson(req, env, await checkout(req, env, CC));
    if (/^\/(health|invoice|checkout)$/.test(path)) return ccErr(req, env, 405, "method", "method not allowed");
    return ccErr(req, env, 404, "not_found", "not found");
  } catch (e) { return errOut(req, env, e); }
}
async function pubLimit(req, env) { if (!(await rateOk(env, "paypub|" + await ipHash(req, env), 60, 600))) throw new PayError(429, "rate_limited", "too many requests — try again in a few minutes"); }
async function health(req, env) {
  await pubLimit(req, env);
  let ok = true; try { await env.DB.prepare("SELECT 1 AS x FROM cc_invoices LIMIT 1").first(); } catch (e) { ok = false; }
  const cfg = await payConfig(env), r = await readiness(env, cfg);
  return { ok, ready: r.ready, provider: cfg.provider, mode: cfg.mode, manual: !!r.manual };
}
async function publicInvoice(req, env, url) {
  await pubLimit(req, env);
  const t = line(url.searchParams.get("t"), 64);
  let inv = null; try { inv = TOKEN_RX.test(t) ? await invByToken(env, t) : null; } catch (e) { if (!noTable(e)) throw e; }
  if (!inv) throw new PayError(404, "not_found", "this payment link is not valid");
  const cfg = await payConfig(env), r = await readiness(env, cfg), online = inv.test ? r.sandbox : r.ready, pr = await planRow(env, inv.plan);
  const last = await env.DB.prepare("SELECT status, provider, updated_at FROM cc_payments WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 1").bind(inv.id).first();
  let activation = null;
  if (inv.status === "paid" && !inv.test) {
    const l = await ledger(env, inv.id), m = l && /^activated:(.*)$/.exec(l.result);
    activation = !m ? { status: "pending", plan_until: "" } : /^skip/.test(m[1]) ? { status: "review", plan_until: "" } : { status: "done", plan_until: m[1] ? cairoDay(Date.parse(m[1])) : "" };
  }
  const S = site(env);
  return {
    invoice: { no: inv.no, status: inv.status, plan: inv.plan, plan_name: inv.plan_name, plan_name_en: (pr && pr.name_en) || PLAN_NAME[inv.plan][1], period_days: inv.period_days, period_end: inv.period_end ? cairoDay(Date.parse(inv.period_end)) : "", source: inv.source, net_minor: inv.net_minor, vat_bp: inv.vat_bp,
      vat_minor: inv.vat_minor, total_minor: inv.total_minor, currency: inv.currency, company: inv.company, issued_at: inv.issued_at, paid_at: inv.paid_at, test: !!inv.test },
    gateway: { ready: inv.status === "open" && online, provider_label: online ? PROVIDERS[cfg.provider].label + (inv.test ? " — Sandbox" : "") : "" },
    manual: inv.status === "open" && r.manual ? { enabled: true, ar: neutralN(cfg.manual_ar, 2000), en: neutralN(cfg.manual_en, 2000) } : { enabled: false, ar: "", en: "" },
    email_masked: maskEmail(inv.email), last_attempt: last ? { status: last.status, provider: last.provider, at: last.updated_at } : null, activation,
    next: { success_url: siteUrl(env, cfg.success_url) || `${S}dashboard.html#plan`, fail_url: siteUrl(env, cfg.fail_url) || `${S}register.html#plans` }, // same-site only (imported values too)
  };
}
async function checkout(req, env, CC) {
  const b = await body(req, 4096);
  await pubLimit(req, env);
  const t = line(b.t, 64);
  let inv = null; try { inv = TOKEN_RX.test(t) ? await invByToken(env, t) : null; } catch (e) { if (!noTable(e)) throw e; }
  if (!inv) throw new PayError(404, "not_found", "this payment link is not valid");
  if (inv.status !== "open") throw new PayError(409, "state", "this invoice is not open for payment", { status: inv.status });
  const cfg = await payConfig(env), r = await readiness(env, cfg);
  if (!(inv.test ? r.sandbox : r.ready)) throw new PayError(503, "gateway_not_ready", "online payment is still being set up", { manual: !!r.manual });
  if (!(await rateOk(env, "paychk|" + inv.id, 10, 3600))) throw new PayError(429, "rate_limited", "too many payment attempts for this invoice — try again in an hour");
  const provider = cfg.provider, pc = await providerCfg(env, provider, cfg), pid = rid(16), t0 = now();
  await env.DB.batch([ // one row per attempt; an older unfinished attempt is cancelled (bookkeeping only: a late verified payment for it still counts)
    env.DB.prepare("UPDATE cc_payments SET status = 'cancelled', updated_at = ? WHERE invoice_id = ? AND status IN ('created', 'redirected')").bind(t0, inv.id),
    env.DB.prepare("INSERT INTO cc_payments (id, invoice_id, provider, mode, amount_minor, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?)").bind(pid, inv.id, provider, inv.test ? "test" : cfg.mode, inv.total_minor, inv.currency, t0, t0),
  ]);
  try {
    const res = await ADAPTER[provider].checkout(env, pc, inv, { id: pid }, await payerOf(env, inv, line(b.lang, 5)));
    if (!okRedirect(env, provider, res.redirect_url)) throw new PayError(502, "provider_error", "unexpected payment page address", { provider_code: "redirect_url" });
    await env.DB.prepare("UPDATE cc_payments SET status = 'redirected', provider_ref = ?, provider_order = ?, raw_status = ?, updated_at = ? WHERE id = ?").bind(res.provider_ref, res.provider_order || "", res.raw_status || "", now(), pid).run();
    return { redirect_url: res.redirect_url };
  } catch (e) {
    const code = e instanceof PayError ? String((e.extra && e.extra.provider_code) || e.code) : "exception";
    await env.DB.prepare("UPDATE cc_payments SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(line(code, 200), now(), pid).run();
    if (e instanceof PayError) throw e;
    console.warn("payments checkout", provider, (e && e.message) || e);
    throw new PayError(502, "provider_error", "the payment provider did not answer correctly", { provider_code: "exception" });
  }
}

/* ---------------------------------------------------------------- provider webhooks ---------------------------------------------------------------- */
/* a provider secret that is saved but cannot be read (CONFIG_SECRET rotated, a damaged row) must not swallow a real payment: answer 503
   so the provider retries (Paymob / N-Genius / PayTabs re-send a callback that failed), log it, and tell the owners once an hour to enter
   the key again in «بوابة الدفع» (review PAY-M3). A secret that was never saved stays 200 "unconfigured" (nothing to recover). */
const RETRY = { status: 503, body: { error: "temporarily unavailable", code: "retry" } };
async function unreadableHook(env, provider, psha) {
  await rejected(env, provider, "webhook", psha, "unreadable");
  try {
    if (!(await rateOk(env, "payunread|" + provider, 1, 3600))) return;
    let i = 0;
    for (const to of adminEmails(env)) await mail(env, { id: `teamneed-payunread-${provider}-${Date.now().toString(36)}-${i++}`, tpl: "team_needs_alert", to, lang: "ar",
      subject: `[محتاج تدخّل] مفتاح بوابة الدفع مش مقروء (${provider}) / [Action needed] payment gateway key unreadable (${provider})`,
      ar: `بوابة الدفع (${provider}) بعتت إشعار دفع، بس المفتاح المحفوظ في «بوابة الدفع» مش مقروء (غالباً CONFIG_SECRET اتغيّر). رجّعنا للبوابة 503 عشان تعيد الإرسال. ادخل لوحة التحكم ← «بوابة الدفع» ودخّل المفاتيح تاني دلوقتي، وبعدها راجع آخر المعاملات في لوحة البوابة.`,
      en: `The payment gateway (${provider}) sent a payment notification, but the key saved in «Payment gateway» cannot be read (most likely CONFIG_SECRET changed). We answered 503 so the gateway re-sends it. Open the Control Center → «Payment gateway» and enter the keys again now, then check the latest transactions in the gateway's dashboard.` });
  } catch (e) { /* best effort */ }
}
const HOOK = {
  async paymob(env, CC, req, url, b, bytes, psha, pc) {
    if (String(b.type || "").toUpperCase() !== "TRANSACTION" || !b.obj || typeof b.obj !== "object") return null; // TOKEN and other callbacks: nothing to do
    if (pc.webhook_secret === null) { await unreadableHook(env, "paymob", psha); return RETRY; } // saved but unreadable (CONFIG_SECRET changed): the provider retries later (review PAY-M3)
    if (!pc.webhook_secret) { await rejected(env, "paymob", "webhook", psha, "unconfigured"); return null; }
    if (!ctEq(await hmacHex("SHA-512", pc.webhook_secret, paymobHmacString(b.obj)), url.searchParams.get("hmac") || "")) { await rejected(env, "paymob", "webhook", psha, "signature"); return { status: 401, body: { error: "invalid signature", code: "invalid_signature" } }; }
    const ev = pmEvent(k => pmGet(b.obj, k));
    if (!ev._id_ok) return null;
    const pay = await pmPayment(env, ev);
    if (!pay) { await logEvent(env, { provider: "paymob", event_key: "unknown:" + ev.event_key, kind: "webhook", verified: 1, result: "ignored:unknown", payload_sha: psha }); return null; }
    await applyResult(env, CC, { ...ev, provider: "paymob", kind: "webhook", verified: 1, payment: pay, payload_sha: psha });
    return null;
  },
  async ngenius(env, CC, req, url, b, bytes, psha, pc) { // the payload never activates anything by itself: the order is re-queried
    if (pc.webhook_secret && !safeEq(req.headers.get("X-MIG-Webhook") || "", pc.webhook_secret)) { await rejected(env, "ngenius", "webhook", psha, "signature"); return { status: 401, body: { error: "invalid signature", code: "invalid_signature" } }; }
    const ref = String((b.order && b.order.reference) || b.orderReference || "");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(ref)) return null;
    const pay = await env.DB.prepare("SELECT * FROM cc_payments WHERE provider = 'ngenius' AND provider_ref = ? ORDER BY created_at DESC LIMIT 1").bind(ref).first();
    if (!pay) return null; // an order we never created: no outbound call, no oracle
    if (pc.api_key === null) { await unreadableHook(env, "ngenius", psha); return RETRY; }
    if (!pc.api_key || !RX.outlet.test(pc.outlet_id || "")) { await rejected(env, "ngenius", "webhook", psha, "unconfigured"); return null; }
    if (!(await rateOk(env, "ngq|" + ref, 6, 600))) return null;
    await applyResult(env, CC, { ...(await ADAPTER.ngenius.query(env, pc, ref)), provider: "ngenius", kind: "webhook", verified: 1, payment: pay, payload_sha: psha });
    return null;
  },
  async paytabs(env, CC, req, url, b, bytes, psha, pc) {
    if (pc.api_key === null) { await unreadableHook(env, "paytabs", psha); return RETRY; }
    if (!pc.api_key) { await rejected(env, "paytabs", "webhook", psha, "unconfigured"); return null; }
    if (!ctEq(await hmacHex("SHA-256", pc.api_key, bytes), req.headers.get("Signature") || "")) { await rejected(env, "paytabs", "webhook", psha, "signature"); return { status: 401, body: { error: "invalid signature", code: "invalid_signature" } }; }
    const tr = String(b.tran_ref || "");
    if (!/^[A-Za-z0-9-]{6,64}$/.test(tr)) return null;
    const pay = await env.DB.prepare("SELECT * FROM cc_payments WHERE provider = 'paytabs' AND provider_ref = ? ORDER BY created_at DESC LIMIT 1").bind(tr).first();
    if (!pay) return null;
    if (!(await rateOk(env, "ptq|" + tr, 6, 600))) return null;
    await applyResult(env, CC, { ...(await ADAPTER.paytabs.query(env, pc, tr)), provider: "paytabs", kind: "webhook", verified: 1, payment: pay, payload_sha: psha });
    return null;
  },
};
/* a Paymob transaction belongs to the attempt whose stored provider_order (the intention's order) equals its HMAC-covered order.id — never
   to one picked by order.merchant_order_id, which the HMAC does not cover (review L3): no match → "unknown", logged, nothing applied */
async function pmPayment(env, ev) {
  if (!/^\d{1,20}$/.test(String(ev.provider_order || ""))) return null;
  return (await env.DB.prepare("SELECT * FROM cc_payments WHERE provider = 'paymob' AND provider_order = ? ORDER BY created_at DESC LIMIT 1").bind(ev.provider_order).first()) || null;
}
/* 200 {ok:true} for every verified or well-formed call (no oracle: unknown orders look the same as known ones); 401 for a wrong
   signature; 400 for malformed JSON; 503 only while a saved provider secret cannot be read (RETRY above: the provider re-sends);
   no other 5xx (an internal error is kept in cc_pay_events and recovered by a retry / the cron) */
async function webhook(req, env, CC, provider) {
  if (req.method !== "POST") return hookJson({ error: "method not allowed", code: "method" }, 405);
  if (!ONLINE.includes(provider)) return hookJson({ error: "not found", code: "not_found" }, 404);
  if (!env || !env.DB) return hookJson({ ok: true });
  let bytes; try { bytes = new Uint8Array(await req.arrayBuffer()); } catch (e) { return hookJson({ error: "bad body", code: "bad_json" }, 400); }
  if (bytes.length > 65536) return hookJson({ error: "too large", code: "too_large" }, 413);
  let b; try { b = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { return hookJson({ error: "bad json", code: "bad_json" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return hookJson({ error: "bad json", code: "bad_json" }, 400);
  try {
    if (!(await rateOk(env, "payhook|" + await ipHash(req, env), 600, 600))) return hookJson({ error: "rate limited", code: "rate_limited" }, 429);
    const psha = hexOf(await crypto.subtle.digest("SHA-256", bytes)), url = new URL(req.url);
    const res = await HOOK[provider](env, CC, req, url, b, bytes, psha, await providerCfg(env, provider));
    return res ? hookJson(res.body, res.status) : hookJson({ ok: true });
  } catch (e) {
    console.warn("payments webhook", provider, (e && (e.code || e.message)) || e);
    return hookJson({ ok: true });
  }
}

/* ---------------------------------------------------------------- browser returns: always 303 to pay.html (the page polls the result) ---------------------------------------------------------------- */
/* ?t=<token> — tolerant of a provider that appends "?ref=…" to a URL that already has a query ("?t=X?ref=Y&…") */
function returnQuery(url) {
  const sp = new URLSearchParams(url.search), raw = sp.get("t") || "", q = raw.indexOf("?");
  if (q >= 0) { for (const [k, v] of new URLSearchParams(raw.slice(q + 1))) if (!sp.has(k)) sp.append(k, v); sp.set("t", raw.slice(0, q)); }
  return sp;
}
async function providerReturn(req, env, CC, provider) {
  const url = new URL(req.url), query = returnQuery(url), t = query.get("t") || "", good = TOKEN_RX.test(t);
  const loc = site(env) + "pay.html#" + (good ? "inv=" + t + "&r=1" : "r=1");
  try {
    if (ONLINE.includes(provider) && good && env && env.DB && (req.method === "GET" || req.method === "POST")) {
      let params = query;
      if (req.method === "POST") {
        const ct = (req.headers.get("Content-Type") || "").toLowerCase(), txt = (await req.text()).slice(0, 32768);
        if (ct.includes("application/json")) { const o = jparse(txt, {}); params = new URLSearchParams(); for (const [k, v] of Object.entries(o && typeof o === "object" ? o : {})) if (v == null || typeof v !== "object") params.set(k, v == null ? "" : String(v)); }
        else params = new URLSearchParams(txt);
      }
      if (await rateOk(env, "payret|" + await ipHash(req, env), 60, 600)) { const inv = await invByToken(env, t); if (inv) await processReturn(env, CC, provider, inv, params); }
    }
  } catch (e) { console.warn("payments return", provider, (e && (e.code || e.message)) || e); }
  return new Response(null, { status: 303, headers: { Location: loc, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
async function processReturn(env, CC, provider, inv, params) {
  if (provider === "paymob") { // the response callback carries the same HMAC'd fields, flattened
    const pc = await providerCfg(env, "paymob"), mac = params.get("hmac") || "";
    if (!mac || !pc.webhook_secret || !ctEq(await hmacHex("SHA-512", pc.webhook_secret, pmQueryString(params)), mac)) return "unverified";
    const ev = pmEvent(k => params.get(k === "order.id" ? "order" : k)), pay = ev._id_ok ? await pmPayment(env, ev) : null;
    if (!pay || pay.invoice_id !== inv.id) return "unknown";
    await applyResult(env, CC, { ...ev, provider: "paymob", kind: "return", verified: 1, payment: pay, payload_sha: await sha256(params.toString()) });
    return "ok";
  }
  if (provider === "ngenius") {
    const pc = await providerCfg(env, "ngenius"), ref = params.get("ref") || "";
    const { results } = await env.DB.prepare("SELECT * FROM cc_payments WHERE invoice_id = ? AND provider = 'ngenius' ORDER BY created_at DESC LIMIT 10").bind(inv.id).all();
    const pay = (results || []).find(p => ref && p.provider_ref === ref) || (results || []).find(p => /^(created|redirected|pending)$/.test(p.status));
    if (!pay || !pay.provider_ref || !pc.api_key || !RX.outlet.test(pc.outlet_id || "")) return "unknown";
    if (!(await rateOk(env, "ngq|" + pay.provider_ref, 6, 600))) return "limited";
    const q = await ADAPTER.ngenius.query(env, pc, pay.provider_ref);
    await applyResult(env, CC, { ...q, provider: "ngenius", kind: "return", verified: 1, payment: pay, payload_sha: "" });
    if (params.get("c") === "1" && q.status !== "paid") await env.DB.prepare("UPDATE cc_payments SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN ('created', 'redirected', 'pending')").bind(now(), pay.id).run();
    return "ok";
  }
  if (provider === "paytabs") {
    const pc = await providerCfg(env, "paytabs");
    if (!(await ptReturnOk(pc.api_key, params))) return "unverified";
    const tr = params.get("tranRef") || "";
    const pay = /^[A-Za-z0-9-]{6,64}$/.test(tr) ? await env.DB.prepare("SELECT * FROM cc_payments WHERE invoice_id = ? AND provider = 'paytabs' AND provider_ref = ?").bind(inv.id, tr).first() : null;
    if (!pay) return "unknown";
    if (!(await rateOk(env, "ptq|" + tr, 6, 600))) return "limited";
    await applyResult(env, CC, { ...(await ADAPTER.paytabs.query(env, pc, tr)), provider: "paytabs", kind: "return", verified: 1, payment: pay, payload_sha: "" });
    return "ok";
  }
  return "unknown";
}

/* ---------------------------------------------------------------- admin /api/admin/cc/pay/* ---------------------------------------------------------------- */
export async function handlePayAdmin(req, env, ctx, adm) {
  if (req.method === "OPTIONS") return ccPreflight(req, env);
  const url = new URL(req.url), path = url.pathname.replace(/^\/api\/admin\/cc\/pay/, "").replace(/\/+$/, "") || "/", M = req.method, CC = (adm && adm.CC) || {};
  try {
    if (!env || !env.DB) return ccErr(req, env, 503, "store_off", "store not configured");
    const need = p => { if (!(adm && typeof adm.can === "function" && adm.can(p))) throw p === "pay.config" ? new PayError(403, "owner_only", "only the owner can change the payment gateway", { need: p }) : new PayError(403, "forbidden", "forbidden", { need: p }); };
    const staffOnly = () => { if (!(adm && /^(owner|admin|platform)$/.test(adm.role || ""))) throw new PayError(403, "forbidden", "export needs the owner or an admin", { need: "pay.export" }); };
    if (path === "/config") {
      if (M === "GET") { need("pay.read"); return ccJson(req, env, await configOut(env, adm)); }
      if (M === "PUT") { need("pay.config"); return ccJson(req, env, await putConfig(req, env, adm, CC)); }
    }
    if (path === "/invoices" && M === "GET") { need("pay.read"); return ccJson(req, env, await listInvoices(env, url)); }
    if (path === "/invoices" && M === "POST") { need("pay.invoice"); return ccJson(req, env, await adminIssue(req, env, adm, CC), 201); }
    if (path === "/invoices.csv" && M === "GET") { need("pay.read"); staffOnly(); const r = await listInvoices(env, url, true); await exportAudit(adm, "invoices", url, r.items.length); return csvResp(req, env, "invoices", csvText(r.items.map(i => ({ ...i, member: i.member ? i.member.email : "" })), INV_CSV)); }
    if (path === "/payments" && M === "GET") { need("pay.read"); return ccJson(req, env, await listPayments(env, url)); }
    if (path === "/payments.csv" && M === "GET") { need("pay.read"); staffOnly(); const r = await listPayments(env, url, true); await exportAudit(adm, "payments", url, r.items.length); return csvResp(req, env, "payments", csvText(r.items, PAY_CSV)); }
    if (path === "/test-invoice" && M === "POST") { need("pay.config"); return ccJson(req, env, await testInvoice(req, env, adm, CC), 201); }
    let m = /^\/invoices\/([^/]+)$/.exec(path);
    if (m && M === "GET") { need("pay.read"); return ccJson(req, env, await invoiceDetail(env, decodeURIComponent(m[1]))); }
    m = /^\/invoices\/([^/]+)\/(resend|void|mark-paid|refund)$/.exec(path);
    if (m && M === "POST") {
      need(m[2] === "mark-paid" || m[2] === "refund" ? "pay.mark_paid" : "pay.invoice");
      const no = decodeURIComponent(m[1]), inv = NO_RX.test(no) ? await invByNo(env, no) : null;
      if (!inv) throw new PayError(404, "not_found", "invoice not found");
      if (m[2] === "resend") return ccJson(req, env, await adminResend(req, env, adm, CC, inv));
      if (m[2] === "void") return ccJson(req, env, await adminVoid(req, env, adm, inv));
      if (m[2] === "mark-paid") return ccJson(req, env, await adminMarkPaid(req, env, adm, CC, inv));
      return ccJson(req, env, await adminRefund(req, env, adm, inv));
    }
    if (/^\/(config|invoices|payments|test-invoice)(\/|\.csv|$)/.test(path)) return ccErr(req, env, 405, "method", "method not allowed");
    return ccErr(req, env, 404, "not_found", "not found");
  } catch (e) { return errOut(req, env, e); }
}
/* review L4: one audit row per CSV export (dataset, filters, row count — no data), before the file; a failing audit means no file */
async function exportAudit(adm, dataset, url, rows) {
  const filters = {}; for (const [k, v] of url.searchParams) if (Object.keys(filters).length < 20) filters[line(k, 40)] = line(v, 200);
  await admAudit(adm, "export." + dataset, "export", dataset, null, { filters, rows }, `${dataset}.csv — ${rows} rows`);
}
const INV_CSV = ["no", "status", "source", "test", "email", "company", "member", "plan", "plan_name", "period_days", "net_minor", "vat_bp", "vat_minor", "total_minor", "currency", "issued_at", "paid_at", "paid_via", "provider", "provider_ref", "manual_ref", "inquiry_ref", "notes"];
const PAY_CSV = ["id", "invoice_no", "provider", "mode", "status", "amount_minor", "currency", "provider_ref", "provider_txn", "provider_order", "raw_status", "verified_via", "error", "created_at", "updated_at"];
async function sandboxVerified(env) {
  const out = { ngenius: false, paymob: false, paytabs: false };
  try { const { results } = await env.DB.prepare("SELECT p.provider AS provider, COUNT(*) AS n FROM cc_pay_events e JOIN cc_payments p ON p.id = e.payment_id WHERE e.verified = 1 AND p.mode = 'test' AND e.result LIKE 'paid%' GROUP BY p.provider").all(); for (const r of results || []) if (r.provider in out) out[r.provider] = r.n > 0; } catch (e) { /* none */ }
  return out;
}
async function configOut(env, adm) {
  const cfg = await payConfig(env), r = await readiness(env, cfg), S = site(env), p = cfg.provider;
  let info = {}; try { info = await secretInfo(env, PAY_SLOTS); } catch (e) { info = {}; }
  const secrets = {}; for (const s of PAY_SLOTS) { const i = info[s] || {}; secrets[s] = { set: !!i.set, tail: i.set ? String(i.tail || "") : "", set_at: i.set ? String(i.set_at || "") : "", readable: !!(i.set && i.readable) }; }
  const act = ONLINE.includes(p) ? cfg[p] : null;
  return { enabled: cfg.enabled, provider: p, mode: cfg.mode, currency: "EGP",
    fields: { merchant_id: p === "paymob" ? cfg.paymob.integration_ids : p === "paytabs" ? cfg.paytabs.profile_id : cfg.merchant_id, outlet_id: cfg.ngenius.outlet_id, integration_ids: cfg.paymob.integration_ids,
      public_key: cfg.paymob.public_key, profile_id: cfg.paytabs.profile_id, host: act ? act.host_set : "", host_default: act ? HOST[p][cfg.mode] : "", success_url: cfg.success_url || `${S}dashboard.html#plan`,
      fail_url: cfg.fail_url || `${S}register.html#plans`, notes: cfg.notes, manual_fallback: cfg.manual_fallback, manual_ar: cfg.manual_ar, manual_en: cfg.manual_en },
    provider_fields: { ngenius: { outlet_id: cfg.ngenius.outlet_id, host: cfg.ngenius.host_set, host_effective: cfg.ngenius.host }, paymob: { integration_ids: cfg.paymob.integration_ids, public_key: cfg.paymob.public_key, host: cfg.paymob.host_set, host_effective: cfg.paymob.host },
      paytabs: { profile_id: cfg.paytabs.profile_id, host: cfg.paytabs.host_set, host_effective: cfg.paytabs.host } },
    secrets, ready: r.ready, sandbox_ready: r.sandbox, manual: !!r.manual, state: r.state, missing: r.missing,
    missing_labels: Object.fromEntries(r.missing.map(k => [k, { ar: (MISSING_LABEL[k] || [k])[0], en: (MISSING_LABEL[k] || [k, k])[1] }])),
    webhooks: { paymob: `${S}api/pay/webhook/paymob`, ngenius: `${S}api/pay/webhook/ngenius`, ngenius_header: "X-MIG-Webhook", paytabs: `${S}api/pay/webhook/paytabs`,
      returns: { paymob: `${S}api/pay/return/paymob`, ngenius: `${S}api/pay/return/ngenius`, paytabs: `${S}api/pay/return/paytabs` } },
    providers: Object.keys(PROVIDERS).map(k => ({ key: k, label: PROVIDERS[k].label, label_ar: PROVIDERS[k].label_ar, implemented: true })),
    config_secret: configSecretOk(env), sandbox_verified: await sandboxVerified(env), vat_bp: cfg.vat_bp, store: cfg.store !== false,
    can_config: !!(adm && typeof adm.can === "function" && adm.can("pay.config")) };
}
function siteUrl(env, v) {
  const s = line(v, 500); if (!s) return "";
  let u; try { u = new URL(s); } catch (e) { return null; }
  const own = new URL(site(env)).hostname.replace(/^www\./, "");
  return u.protocol === "https:" && !u.username && !u.password && u.hostname.replace(/^www\./, "") === own && !/[\s"'<>`]/.test(s) ? u.toString() : null;
}
/* PUT config: the live «بوابة الدفع» payload + the provider extras. Per-provider fields are written only for the chosen provider (the
   others keep theirs); api_key / webhook_secret "" = keep. Validation errors → 422 {errors:[{field, msg}]}. */
async function putConfig(req, env, adm, CC) {
  const b = await body(req), cur = await payConfig(env);
  if (cur.store === false) throw new PayError(503, "store_off", "payments store not configured — run migration 0006");
  const errors = [], set = {}, err = (field, msg) => errors.push({ field, msg });
  const provider = "provider" in b ? line(b.provider, 20).toLowerCase() : cur.provider;
  if (provider && !PROVIDERS[provider]) throw new PayError(400, "invalid_provider", "only N-Genius, Paymob, PayTabs or manual transfer are available", { providers: Object.keys(PROVIDERS) });
  const mode = "mode" in b ? (/^live$/i.test(String(b.mode)) ? "live" : /^(test|sandbox)$/i.test(String(b.mode)) ? "test" : "") : cur.mode;
  if (!mode) err("mode", "test | live");
  if ("currency" in b && b.currency !== "" && line(b.currency, 5).toUpperCase() !== "EGP") err("currency", "EGP only");
  set["pay.provider"] = provider; set["pay.mode"] = mode || cur.mode; set["pay.currency"] = "EGP";
  set["pay.enabled"] = ("enabled" in b ? bool(b.enabled) : cur.enabled) ? "1" : "0";
  set["pay.manual_fallback"] = ("manual_fallback" in b ? bool(b.manual_fallback) : cur.manual_fallback) ? "1" : "0";
  for (const k of ["success_url", "fail_url"]) if (k in b) { const v = siteUrl(env, b[k]); if (v === null) err(k, "an https address on madeinegyptgate.com"); else set["pay." + k] = v; }
  if ("notes" in b) set["pay.notes"] = neutralN(b.notes, 1000);
  if ("manual_ar" in b) set.manual_pay_ar = neutralN(b.manual_ar, 2000);
  if ("manual_en" in b) set.manual_pay_en = neutralN(b.manual_en, 2000);
  const mid = "merchant_id" in b ? line(b.merchant_id, 120) : undefined;
  const host = (prov, field) => { if (!("host" in b)) return; const h = line(b.host, 120).toLowerCase(); if (h && !HOST[prov].rx.test(h)) err(field || "host", "a host of the provider itself, e.g. " + HOST[prov].live); else set[`pay.${prov}.host`] = h; };
  if (provider === "ngenius") {
    if ("outlet_id" in b) { const v = line(b.outlet_id, 60); if (v && !RX.outlet.test(v)) err("outlet_id", "the outlet reference (a UUID)"); else set["pay.ngenius.outlet_id"] = v.toLowerCase(); }
    if (mid !== undefined) set["pay.merchant_id"] = neutral1(mid, 120);
    host("ngenius");
  }
  if (provider === "paymob") {
    const ids = "integration_ids" in b ? b.integration_ids : mid;
    if (ids !== undefined) { const parts = String(Array.isArray(ids) ? ids.join(",") : ids).split(",").map(x => x.trim()).filter(Boolean); if (parts.length > 10 || parts.some(x => !/^\d{1,12}$/.test(x))) err("integration_ids", "comma-separated integration IDs (numbers)"); else set["pay.paymob.integration_ids"] = parts.join(","); }
    if ("public_key" in b) { const v = line(b.public_key, 600); if (v && !RX.pm_pk.test(v)) err("public_key", "egy_pk_test_… / egy_pk_live_…"); else set["pay.paymob.public_key"] = v; }
    host("paymob");
  }
  if (provider === "paytabs") {
    const pid = "profile_id" in b ? line(b.profile_id, 12) : mid;
    if (pid !== undefined) { if (pid && !RX.pt_profile.test(pid)) err("profile_id", "the numeric profile ID"); else set["pay.paytabs.profile_id"] = pid; }
    host("paytabs");
  }
  const secrets = [], key = line(b.api_key, 1024), hook = line(b.webhook_secret, 512);
  if (ONLINE.includes(provider)) {
    if (key) { const rx = provider === "ngenius" ? RX.ng_key : provider === "paymob" ? RX.pm_sk : RX.pt_key; if (!rx.test(key)) err("api_key", provider === "paymob" ? "egy_sk_test_… / egy_sk_live_… (the secret key)" : "the API key as the portal shows it"); else secrets.push([SLOT[provider].api_key, key]); }
    if (hook && SLOT[provider].webhook_secret) { const rx = provider === "ngenius" ? RX.ng_hook : RX.pm_hmac; if (!rx.test(hook)) err("webhook_secret", provider === "ngenius" ? "at least 16 visible characters, no spaces" : "the HMAC secret from Paymob (Settings → Account info)"); else secrets.push([SLOT[provider].webhook_secret, hook]); }
  }
  if (errors.length) throw new PayError(422, "invalid", "check the highlighted fields", { errors });
  if (secrets.length && !configSecretOk(env)) throw new PayError(503, "config_secret_missing", "add the Worker secret CONFIG_SECRET first — keys are only stored encrypted");
  const before = {}, after = {}, curMap = await settingsMap(env);
  for (const [k, v] of Object.entries(set)) if ((curMap[k] || "") !== v) { before[k] = curMap[k] || ""; after[k] = v; }
  const changed_slots = secrets.map(s => s[0]);
  if (!Object.keys(after).length && !changed_slots.length) { const r0 = await readiness(env, cur); return { ok: true, unchanged: true, ready: r0.ready, sandbox_ready: r0.sandbox, manual: !!r0.manual, state: r0.state, missing: r0.missing }; }
  await admAudit(adm, "pay.config", "settings", "pay", before, { ...after, ...(changed_slots.length ? { changed_slots } : {}) }, `بوابة الدفع: ${[...Object.keys(after), ...changed_slots].join(", ")}`);
  const by = actorOf(adm).email || actorOf(adm).id, t = now(), st = [];
  for (const [k, v] of Object.entries(after)) st.push(env.DB.prepare("INSERT INTO cc_settings (k, scope, v, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(k, /^pay\./.test(k) ? "pay" : "public", v, by, t));
  if (st.length) await env.DB.batch(st);
  if ("manual_pay_ar" in after || "manual_pay_en" in after) await payeeNotice(env, by, before, after, "payments");
  for (const [slot, v] of secrets) await putSecret(env, slot, v, by);
  READY.delete(env.DB);
  const cfg = await payConfig(env), r = await readiness(env, cfg);
  let published_v = null; // the site's MIGPAYREADY / manual flag come from the overlay: republish it
  if (CC.content && typeof CC.content.publishOverlay === "function") { try { const o = await CC.content.publishOverlay(env, { by, reason: "pay", CC }); published_v = o && o.v != null ? o.v : null; } catch (e) { console.warn("payments: overlay publish", (e && e.code) || (e && e.message) || e); } }
  return { ok: true, ready: r.ready, sandbox_ready: r.sandbox, manual: !!r.manual, state: r.state, missing: r.missing, published_v };
}
async function listInvoices(env, url, csv = false) {
  const q = url.searchParams, where = [], args = [], { page, limit } = paging(q, csv);
  const st = line(q.get("status"), 20); if (st) { if (!INV_STATUS.includes(st)) throw new PayError(400, "invalid_status", "invalid status"); where.push("i.status = ?"); args.push(st); }
  const src = line(q.get("source"), 20); if (src) { if (!SOURCES.includes(src)) throw new PayError(400, "invalid_source", "invalid source"); where.push("i.source = ?"); args.push(src); }
  const pv = line(q.get("provider"), 20); if (pv) { if (!PROVIDERS[pv]) throw new PayError(400, "invalid_provider", "invalid provider"); where.push("i.provider = ?"); args.push(pv); }
  const from = line(q.get("from"), 10), to = line(q.get("to"), 10);
  if (from) { if (!DAY_RX.test(from)) throw new PayError(400, "invalid_from", "from = YYYY-MM-DD"); where.push("i.issued_at >= ?"); args.push(dayStartIso(from)); }
  if (to) { if (!DAY_RX.test(to)) throw new PayError(400, "invalid_to", "to = YYYY-MM-DD"); where.push("i.issued_at < ?"); args.push(dayStartIso(addDays(to, 1))); }
  if (q.get("test") === "0" || q.get("test") === "1") { where.push("i.test = ?"); args.push(+q.get("test")); }
  const s = line(q.get("q"), 120).toLowerCase();
  if (s) { const like = "%" + s.replace(/[\\%_]/g, c => "\\" + c) + "%"; where.push("(lower(i.no) LIKE ? ESCAPE '\\' OR lower(i.email) LIKE ? ESCAPE '\\' OR lower(i.company) LIKE ? ESCAPE '\\' OR i.inquiry_ref LIKE ? ESCAPE '\\')"); args.push(like, like, like, like); }
  const W = where.length ? "WHERE " + where.join(" AND ") : "";
  try {
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM cc_invoices i ${W}`).bind(...args).first("n")) || 0;
    const { results } = await env.DB.prepare(`SELECT i.*, m.email AS m_email, m.company AS m_company, m.plan AS m_plan, m.plan_expires AS m_plan_expires FROM cc_invoices i LEFT JOIN members m ON m.id = i.member_id ${W} ORDER BY i.issued_at DESC, i.no DESC LIMIT ? OFFSET ?`).bind(...args, limit, page * limit).all();
    return { items: (results || []).map(r => invOut(env, r)), total, page, limit };
  } catch (e) { if (noTable(e)) return { items: [], total: 0, page, limit }; throw e; }
}
async function listPayments(env, url, csv = false) {
  const q = url.searchParams, where = [], args = [], { page, limit } = paging(q, csv);
  const st = line(q.get("status"), 20); if (st) { if (!PAY_STATUS.includes(st)) throw new PayError(400, "invalid_status", "invalid status"); where.push("p.status = ?"); args.push(st); }
  const pv = line(q.get("provider"), 20); if (pv) { if (!PROVIDERS[pv]) throw new PayError(400, "invalid_provider", "invalid provider"); where.push("p.provider = ?"); args.push(pv); }
  const no = line(q.get("invoice"), 20); if (no) { where.push("i.no = ?"); args.push(no); }
  const W = where.length ? "WHERE " + where.join(" AND ") : "";
  try {
    const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM cc_payments p LEFT JOIN cc_invoices i ON i.id = p.invoice_id ${W}`).bind(...args).first("n")) || 0;
    const { results } = await env.DB.prepare(`SELECT p.*, i.no AS invoice_no, i.email AS invoice_email, i.company AS invoice_company, i.test AS invoice_test FROM cc_payments p LEFT JOIN cc_invoices i ON i.id = p.invoice_id ${W} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, page * limit).all();
    return { items: (results || []).map(r => ({ ...r, invoice_test: !!r.invoice_test })), total, page, limit };
  } catch (e) { if (noTable(e)) return { items: [], total: 0, page, limit }; throw e; }
}
async function invoiceDetail(env, no) {
  const inv = NO_RX.test(no) ? await invByNo(env, no) : null;
  if (!inv) throw new PayError(404, "not_found", "invoice not found");
  const { results: payments } = await env.DB.prepare("SELECT * FROM cc_payments WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 50").bind(inv.id).all();
  const { results: events } = await env.DB.prepare("SELECT id, provider, event_key, kind, payment_id, verified, result, created_at FROM cc_pay_events WHERE invoice_id = ? ORDER BY id DESC LIMIT 100").bind(inv.id).all();
  let mails = [];
  try { const { results } = await env.DB.prepare("SELECT at, template, list, to_masked, subject, provider, provider_id, status, error FROM cc_mail_log WHERE msg_id LIKE ? OR msg_id LIKE ? OR msg_id LIKE ? OR msg_id LIKE ? OR msg_id LIKE ? OR msg_id LIKE ? ORDER BY id DESC LIMIT 50").bind(`inv-${inv.id}-%`, `paylink-${inv.id}%`, `paid-${inv.id}%`, `paidrv-${inv.id}%`, `payfail-${inv.id}-%`, `renew-${inv.id}-%`).all(); mails = results || []; } catch (e) { mails = []; }
  const m = inv.member_id ? await env.DB.prepare("SELECT id, email, company, plan, plan_expires, activated_at FROM members WHERE id = ?").bind(inv.member_id).first() : null;
  const l = await ledger(env, inv.id);
  return { invoice: invOut(env, { ...inv, m_email: m ? m.email : "", m_company: m ? m.company : "", m_plan: m ? m.plan : "", m_plan_expires: m ? m.plan_expires : "" }), payments: payments || [], events: events || [], mails,
    activation: l ? { result: l.result, at: l.created_at } : null, member: m };
}
async function adminIssue(req, env, adm, CC) {
  const b = await body(req), plan = canonPlan(b.plan);
  if (plan === "visitor") throw new PayError(400, "invalid_plan", "choose a plan");
  const mid = line(b.member_id, 64), em = line(b.email, 254).toLowerCase();
  let m = null;
  if (mid) { m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(mid).first(); if (!m) throw new PayError(404, "not_found", "member not found"); }
  else if (isEmail(em)) m = await findByEmail(env, em);
  else throw new PayError(400, "required", "member_id or email is required");
  const email = (m && m.email) || em;
  if (!isEmail(email)) throw new PayError(400, "invalid_email", "the member has no valid e-mail");
  const open = await openFor(env, m, email);
  if (open) throw new PayError(409, "open_invoice", "this member already has an open invoice", { invoice: invMini(env, open) });
  const pr = await planRow(env, plan);
  if (!pr || !(+pr.price_egp > 0)) throw new PayError(409, "no_price", "this plan has no price in the plans matrix");
  const id = rid(16), send = bool(b.send);
  await admAudit(adm, "pay.invoice", "invoice", id, null, { plan, member_id: m ? m.id : "", email, source: "admin", send }, `فاتورة ${plan} لـ ${email}`);
  const { invoice } = await issueInvoice(env, { id, member_id: m ? m.id : "", email, company: b.company || (m && m.company) || "", plan, source: "admin", notes: b.notes, by: actorOf(adm).id, auditedBy: "admin", send, allowUnsellable: true, single: true }, CC);
  return { invoice: invOut(env, invoice) };
}
async function testInvoice(req, env, adm, CC) {
  const b = await body(req), plan = canonPlan(b.plan), me = adm && adm.member;
  if (plan === "visitor") throw new PayError(400, "invalid_plan", "choose a plan");
  if (!me || !isEmail(me.email)) throw new PayError(400, "no_email", "test invoices belong to your own account — sign in with your e-mail (not the platform key)");
  const id = rid(16);
  await admAudit(adm, "pay.test_invoice", "invoice", id, null, { plan, test: true }, "فاتورة تجريبية");
  const { invoice } = await issueInvoice(env, { id, member_id: me.id, email: me.email, company: me.company || "فاتورة تجريبية", plan, source: "test", test: true, by: me.id, send: false, allowUnsellable: true }, CC);
  return { invoice: invOut(env, invoice) };
}
async function adminResend(req, env, adm, CC, inv) {
  await body(req);
  if (inv.status !== "open") throw new PayError(409, "state", "only open invoices can be re-sent", { status: inv.status });
  if (!(await rateOk(env, "payresend|" + inv.id, 5, 86400))) throw new PayError(429, "rate_limited", "this invoice was re-sent 5 times today");
  const cfg = await payConfig(env), r = await readiness(env, cfg), online = inv.test ? r.sandbox : r.ready;
  await admAudit(adm, "pay.resend", "invoice", inv.id, null, { no: inv.no, template: online ? "payment_link" : "invoice_issued" }, `إعادة إرسال ${inv.no}`);
  const res = online ? await sendLinkMail(env, (adm && adm.CC) || CC, inv, { resend: true }) : await sendInvoiceMail(env, CC, inv, { reason: "resend" });
  return { ok: true, sent: res.sent, template: online ? "payment_link" : "invoice_issued", ...(res.error ? { error: res.error } : {}) };
}
async function adminVoid(req, env, adm, inv) {
  const b = await body(req), reason = neutral1(b.reason, 500);
  if (reason.length < 3) throw new PayError(422, "invalid", "write the reason", { errors: [{ field: "reason", msg: "3–500 characters" }] });
  if (inv.status !== "open") throw new PayError(409, "state", "only open invoices can be voided", { status: inv.status });
  const busy = await env.DB.prepare("SELECT id FROM cc_payments WHERE invoice_id = ? AND status IN ('redirected', 'pending') AND updated_at > ? LIMIT 1").bind(inv.id, iso(Date.now() - 3600000)).first("id");
  if (busy && !bool(b.force)) throw new PayError(409, "payment_in_progress", "a payment for this invoice is in progress — wait a bit, or confirm with force", { payment_id: busy });
  await admAudit(adm, "pay.void", "invoice", inv.id, { status: "open" }, { status: "void", reason }, `إلغاء ${inv.no}`);
  const t = now(), u = await env.DB.prepare("UPDATE cc_invoices SET status = 'void', notes = trim(notes || ? || ?), updated_at = ? WHERE id = ? AND status = 'open'").bind("\n", `void ${cairoDay()}: ${reason}`, t, inv.id).run();
  if (!u.meta || u.meta.changes !== 1) throw new PayError(409, "state", "the invoice changed in the meantime — reload");
  await env.DB.prepare("UPDATE cc_payments SET status = 'cancelled', updated_at = ? WHERE invoice_id = ? AND status IN ('created', 'redirected', 'pending')").bind(t, inv.id).run();
  return { ok: true };
}
async function adminMarkPaid(req, env, adm, CC, inv) {
  const b = await body(req), ref = neutral1(b.manual_ref, 120), today = cairoDay(), d = line(b.paid_on, 10) || today, note = neutralN(b.note, 500);
  if (!ref) throw new PayError(422, "invalid", "the transfer reference is required", { errors: [{ field: "manual_ref", msg: "required" }] });
  if (line(b.confirm, 40) !== inv.no) throw new PayError(400, "confirm_mismatch", "type the invoice number to confirm");
  if (!DAY_RX.test(d) || d > today || d < "2020-01-01" || !Number.isFinite(dayEndMs(d))) throw new PayError(422, "invalid", "the payment date", { errors: [{ field: "paid_on", msg: "YYYY-MM-DD, not in the future" }] });
  if (inv.status !== "open") throw new PayError(409, "state", "only open invoices can be marked paid", { status: inv.status });
  const actor = actorOf(adm);
  await admAudit(adm, "pay.mark_paid", "invoice", inv.id, { status: "open" }, { status: "paid", manual_ref: ref, paid_on: d, note }, `دفع يدوي ${inv.no}`);
  const pid = rid(16), t = now(), paidAt = d === today ? t : iso(cairoToUtc(d, "12:00") ?? dayEndMs(d));
  await env.DB.prepare("INSERT INTO cc_payments (id, invoice_id, provider, mode, provider_ref, amount_minor, currency, status, verified_via, created_at, updated_at) VALUES (?, ?, 'manual', ?, ?, ?, ?, 'created', 'manual', ?, ?)").bind(pid, inv.id, inv.test ? "test" : "live", ref, inv.total_minor, inv.currency, t, t).run();
  const mp = await markPaid(env, CC, inv, { via: "manual", provider: "manual", provider_ref: ref, manual_ref: ref, paid_at: paidAt, payment: { id: pid }, txn: ref, raw: "manual", actor });
  if (!mp.changed) { await env.DB.prepare("UPDATE cc_payments SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now(), pid).run(); throw new PayError(409, "state", "the invoice changed in the meantime — reload"); }
  await logEvent(env, { provider: "manual", event_key: "manual:" + inv.id, kind: "manual", invoice_id: inv.id, payment_id: pid, verified: 1, result: inv.test ? "paid:test" : "paid" });
  if (note) await env.DB.prepare("UPDATE cc_invoices SET notes = trim(notes || ? || ?) WHERE id = ?").bind("\n", `paid ${d} (${ref}): ${note}`, inv.id).run();
  const a = mp.activation || {};
  return { ok: true, member: a.member ? { id: a.member.id, plan: a.member.plan, plan_expires: a.member.plan_expires } : null, activation: { activated: !!a.activated, plan_expires: a.plan_expires || "", ...(a.skipped ? { skipped: a.skipped } : {}), ...(a.queued || a.retry ? { queued: true } : {}), ...(inv.test ? { test: true } : {}) } };
}
async function adminRefund(req, env, adm, inv) {
  const b = await body(req), reason = neutral1(b.reason, 500), reference = neutral1(b.reference, 120);
  if (reason.length < 3) throw new PayError(422, "invalid", "write the reason", { errors: [{ field: "reason", msg: "3–500 characters" }] });
  if (line(b.confirm, 40) !== inv.no) throw new PayError(400, "confirm_mismatch", "type the invoice number to confirm");
  if (inv.status !== "paid") throw new PayError(409, "state", "only paid invoices can be recorded as refunded", { status: inv.status });
  await admAudit(adm, "pay.refund", "invoice", inv.id, { status: "paid" }, { status: "refunded", reason, reference }, `استرداد ${inv.no}`);
  const u = await env.DB.prepare("UPDATE cc_invoices SET status = 'refunded', notes = trim(notes || ? || ?), updated_at = ? WHERE id = ? AND status = 'paid'").bind("\n", `refunded ${cairoDay()}${reference ? " (" + reference + ")" : ""}: ${reason}`, now(), inv.id).run();
  if (!u.meta || u.meta.changes !== 1) throw new PayError(409, "state", "the invoice changed in the meantime — reload");
  return { ok: true, plan_changed: false }; // refunds are made at the provider by the owner; the plan is not lowered automatically (§5.4)
}

/* ---------------------------------------------------------------- cron (ccCron calls it every 15 min) ---------------------------------------------------------------- */
export async function paymentsCron(env, nowMs = Date.now(), CC) {
  const out = {};
  if (!env || !env.DB) return out;
  try { await env.DB.prepare("SELECT 1 AS x FROM cc_invoices LIMIT 1").first(); } catch (e) { if (noTable(e)) return { skipped: "store_off" }; throw e; }
  for (const [k, fn] of [["activations", () => cronActivations(env, nowMs, CC)], ["signups", () => cronSignups(env, nowMs, CC)], ["requery", () => cronRequery(env, nowMs, CC)], ["links", () => cronLinks(env, nowMs, CC)], ["renewals", () => cronRenewals(env, nowMs, CC)]]) {
    try { out[k] = await fn(); } catch (e) { out[k] = { error: String((e && e.message) || e).slice(0, 200) }; console.warn("payments cron " + k, (e && e.message) || e); }
  }
  return out;
}
const sysActor = inv => ({ id: inv.paid_via === "manual" || !inv.provider || inv.provider === "manual" ? "system" : "provider:" + inv.provider, email: "", role: "system" });
async function cronActivations(env, nowMs, CC) {
  let retried = 0, started = 0;
  const { results: stuck } = await env.DB.prepare("SELECT * FROM cc_pay_events WHERE event_key LIKE 'activate:%' AND result LIKE 'activating:%' AND created_at < ? AND created_at > ? ORDER BY id LIMIT 20").bind(iso(nowMs - 120000), iso(nowMs - 7 * DAY_MS)).all();
  for (const ev of stuck || []) {
    try { const inv = await getInv(env, ev.invoice_id); if (!inv || inv.status !== "paid" || inv.test) continue; const m = await ensureMember(env, inv); const r = await runActivation(env, CC, inv, m.id, ev.result.slice("activating:".length), sysActor(inv)); if (r.activated) retried++; }
    catch (e) { console.warn("payments activation retry", ev.invoice_id, (e && e.message) || e); }
  }
  const { results: lost } = await env.DB.prepare("SELECT i.* FROM cc_invoices i WHERE i.status = 'paid' AND i.test = 0 AND i.updated_at < ? AND i.updated_at > ? AND NOT EXISTS (SELECT 1 FROM cc_pay_events e WHERE e.event_key = 'activate:' || i.id) ORDER BY i.updated_at LIMIT 20").bind(iso(nowMs - 120000), iso(nowMs - 7 * DAY_MS)).all();
  for (const inv of lost || []) { try { const r = await startActivation(env, CC, inv, sysActor(inv)); if (r.activated || r.skipped) started++; } catch (e) { console.warn("payments activation start", inv.id, (e && e.message) || e); } }
  // a paid invoice that could not be applied when it was paid (a higher plan in force / a suspended account — "activated:skip_*") is applied
  // as soon as that is over: the higher plan ended, the suspension was lifted (review PAY-H2 / PAY-H3) — paid in the last 400 days
  let applied = 0;
  const { results: held } = await env.DB.prepare("SELECT e.id AS ev_id, e.result AS ev_result, e.invoice_id AS inv_id FROM cc_pay_events e JOIN cc_invoices i ON i.id = e.invoice_id WHERE e.event_key LIKE 'activate:%' AND e.result LIKE 'activated:skip_%' AND i.status = 'paid' AND i.test = 0 AND i.paid_at > ? ORDER BY e.id LIMIT 20").bind(iso(nowMs - 400 * DAY_MS)).all();
  for (const h of held || []) {
    try {
      const inv = await getInv(env, h.inv_id); if (!inv || inv.status !== "paid" || inv.test) continue;
      const m = await ensureMember(env, inv), te = targetExpiry(m, inv, nowMs, await metaOf(env, m.id));
      if (te.skip) continue;
      const u = await env.DB.prepare("UPDATE cc_pay_events SET result = ?, created_at = ? WHERE id = ? AND result = ?").bind("activating:" + te.exp, iso(nowMs), h.ev_id, h.ev_result).run();
      if (!u.meta || u.meta.changes !== 1) continue;
      const r = await runActivation(env, CC, inv, m.id, te.exp, sysActor(inv)); if (r.activated) applied++;
    } catch (e) { console.warn("payments held activation", h.inv_id, (e && e.message) || e); }
  }
  return { retried, started, applied };
}
async function cronSignups(env, nowMs, CC) {
  const { results } = await env.DB.prepare("SELECT ref FROM inquiries i WHERE kind = 'signup' AND created_at > ? AND created_at < ? AND NOT EXISTS (SELECT 1 FROM inquiry_events e WHERE e.inquiry_id = i.id AND e.type = 'invoice') ORDER BY created_at LIMIT 20").bind(iso(nowMs - 7 * DAY_MS), iso(nowMs - 60000)).all();
  let issued = 0; for (const r of results || []) { const x = await onInquiryCreated(env, r.ref, CC); if (x && x.invoice && !x.reused) issued++; }
  return { checked: (results || []).length, issued };
}
async function cronRequery(env, nowMs, CC) {
  /* review PAY-M3: an attempt that reached the gateway (redirected / pending) and expires unconfirmed may still have been paid there — a
     lost webhook and a browser that never came back leave no trace here, and Paymob has no server-side re-query in this Worker. The owners
     get one alert per attempt to check the gateway's dashboard before the customer pays twice (/pay/ also warns for 48 h). */
  const t = iso(nowMs), cut = iso(nowMs - 2 * DAY_MS);
  const { results: stale } = await env.DB.prepare("SELECT p.id, p.provider, p.invoice_id, p.provider_ref, p.created_at FROM cc_payments p JOIN cc_invoices i ON i.id = p.invoice_id WHERE p.status IN ('redirected', 'pending') AND p.created_at < ? AND i.status = 'open' AND i.test = 0 ORDER BY p.created_at LIMIT 20").bind(cut).all();
  const x = await env.DB.prepare("UPDATE cc_payments SET status = 'expired', updated_at = ? WHERE status IN ('created', 'redirected', 'pending') AND created_at < ?").bind(t, cut).run();
  for (const p of stale || []) {
    const inv = await getInv(env, p.invoice_id); if (!inv || inv.status !== "open") continue;
    const ref = p.provider_ref ? ` (${line(p.provider_ref, 64)})` : "", at = String(p.created_at).slice(0, 16).replace("T", " ");
    await teamAlert(env, inv, "unconfirmed-" + String(p.id).slice(0, 8),
      `محاولة دفع للفاتورة ${inv.no} عن طريق ${p.provider}${ref} وصلت لصفحة البوابة يوم ${at} (UTC) ومااتأكدتش خلال 48 ساعة، فاتعلّمت «منتهية». افتح لوحة ${p.provider} ودوّر على المعاملة: لو العميل دفع فعلاً، سجّل الدفع من «الفواتير» ← «💵 تسجيل دفع يدوي» برقم المعاملة؛ ولو ماندفعش مفيش حاجة مطلوبة.`,
      `A payment attempt for invoice ${inv.no} through ${p.provider}${ref} reached the gateway's page on ${at} (UTC) and was not confirmed within 48 hours, so it is marked expired. Open the ${p.provider} dashboard and look for the transaction: if the customer did pay, record it under «Invoices» → «💵 Record a manual payment» with the transaction number; if not, nothing is needed.`);
  }
  const { results } = await env.DB.prepare("SELECT * FROM cc_payments WHERE provider IN ('ngenius', 'paytabs') AND status IN ('redirected', 'pending') AND provider_ref != '' AND created_at > ? AND updated_at < ? AND (created_at > ? OR updated_at < ?) ORDER BY updated_at LIMIT 20")
    .bind(iso(nowMs - 2 * DAY_MS), iso(nowMs - 600000), iso(nowMs - 7200000), iso(nowMs - 3600000)).all();
  let queried = 0, paid = 0; const pcs = {};
  for (const p of results || []) {
    try {
      const pc = pcs[p.provider] || (pcs[p.provider] = await providerCfg(env, p.provider));
      if (!pc.api_key || (p.provider === "ngenius" && !RX.outlet.test(pc.outlet_id || ""))) continue;
      const q = await ADAPTER[p.provider].query(env, pc, p.provider_ref); queried++;
      const r = await applyResult(env, CC, { ...q, provider: p.provider, kind: "query", verified: 1, payment: p, payload_sha: "" });
      if (r && /^paid/.test(r.result || "")) paid++;
    } catch (e) { console.warn("payments requery", p.id, (e && (e.code || e.message)) || e); }
    await env.DB.prepare("UPDATE cc_payments SET updated_at = ? WHERE id = ? AND status IN ('redirected', 'pending')").bind(iso(nowMs), p.id).run(); // back-off marker
  }
  return { queried, paid, expired: (x.meta && x.meta.changes) || 0 };
}
async function cronLinks(env, nowMs, CC) {
  const r = await readiness(env, await payConfig(env));
  if (!r.ready || !emailOn(env)) return { ready: r.ready, sent: 0 };
  const { results } = await env.DB.prepare("SELECT * FROM cc_invoices WHERE status = 'open' AND test = 0 AND link_mail_at = '' AND issued_at > ? ORDER BY issued_at LIMIT 50").bind(iso(nowMs - 60 * DAY_MS)).all();
  let sent = 0;
  for (const inv of results || []) { if (!(await rateOk(env, "paylink|" + inv.id, 1, 86400, nowMs))) continue; const s = await sendLinkMail(env, CC, inv); if (s.sent) sent++; }
  return { ready: true, sent };
}
async function cronRenewals(env, nowMs, CC) {
  if (cairoHM(nowMs) < "08:00") return { skipped: "time" };
  const day = cairoDay(nowMs), claim = await env.DB.prepare("INSERT INTO cron_runs (job, day, at) VALUES ('pay_renewals', ?, ?) ON CONFLICT(job, day) DO NOTHING").bind(day, iso(nowMs)).run();
  if (!claim.meta || claim.meta.changes !== 1) return { skipped: "done_today" };
  const { results } = await env.DB.prepare("SELECT * FROM members WHERE verified = 1 AND plan IN ('profile', 'basic', 'premium', 'partner', 'strategic') AND plan_expires != '' AND plan_expires > ? AND plan_expires <= ? ORDER BY plan_expires LIMIT 500").bind(iso(nowMs), iso(nowMs + 30 * DAY_MS)).all();
  let issued = 0, reminded = 0;
  for (const m of results || []) {
    try {
      if (!isEmail(m.email)) continue;
      const expMs = Date.parse(m.plan_expires), left = Math.max(1, Math.ceil((expMs - nowMs) / DAY_MS));
      if (((await metaOf(env, m.id)) || {}).status === "suspended") continue;
      // the reminder carries an invoice for THIS plan only (review F6): an open invoice for another plan — e.g. a signup someone sent with
      // this address — is replaced when the system issued it (signup, no payment in progress); the member's own choice (an upgrade) or the
      // team's invoice stands, and no second invoice is issued next to it
      let inv = await openFor(env, m, m.email), first = false;
      if (inv && inv.plan !== canonPlan(m.plan)) {
        if (inv.source === "signup" && await replaceable(env, inv) && await voidReplaced(env, inv, { id: "system", role: "system" }, `replaced by the renewal invoice (${canonPlan(m.plan)})`)) inv = null;
        else continue;
      }
      if (!inv) {
        const pr = await planRow(env, canonPlan(m.plan)); if (!pr || !pr.sellable || !(+pr.price_egp > 0)) continue;
        let q = null; try { q = await planQuote(env, m, m.plan, nowMs); } catch (e) { q = null; }
        try { inv = (await issueInvoice(env, { member_id: m.id, email: m.email, company: m.company, plan: m.plan, source: "renewal", due_at: m.plan_expires, by: "system", send: false, single: true, ...(q && q.kind === "renewal" ? { quote: q } : {}) }, CC)).invoice; }
        catch (e) { if (e instanceof PayError && e.code === "open_invoice") continue; throw e; }
        issued++; first = true;
      }
      if (first || (left <= 7 && (!inv.reminder_at || inv.reminder_at < iso(expMs - 7 * DAY_MS)))) { if (await sendRenewal(env, CC, inv, m, left, nowMs)) reminded++; }
    } catch (e) { console.warn("payments renewal", m.id, (e && e.message) || e); }
  }
  return { checked: (results || []).length, issued, reminded };
}
async function sendRenewal(env, CC, inv, m, left, nowMs) {
  const online = (await readiness(env, await payConfig(env))).ready, until = cairoDay(Date.parse(m.plan_expires));
  const [va, ve] = await baseVars(env, inv, [{ plan_until: until, days_left: left }, { plan_until: until, days_left: left }]);
  const res = await sendTpl(env, CC, "renewal_reminder", m.email, { id: `renew-${inv.id}-${left <= 7 ? 7 : 30}`, lang: "ar", va, ve });
  if (!res || !res.sent) return false;
  const t = iso(nowMs); // the cron's own clock: the 7-day reminder compares against it
  await env.DB.prepare("UPDATE cc_invoices SET reminder_at = ?, issued_mail_at = CASE WHEN issued_mail_at = '' THEN ? ELSE issued_mail_at END, link_mail_at = CASE WHEN ? = 1 AND link_mail_at = '' THEN ? ELSE link_mail_at END, updated_at = ? WHERE id = ?").bind(t, t, online ? 1 : 0, t, t, inv.id).run();
  return true;
}
