/* The store and the shared rules of the owner's 2026-11-28 mail decisions (migration 0015): request teasers (teasers.js), the daily
   member / partner reports and the owner's daily report (daily-mail.js), the instant alerts to the platform's own mailbox (info-alerts.js).
   - mail_sends: one row per (kind, ref, recipient) — claimed BEFORE the e-mail goes (a second cron tick or a retry finds the row and sends
     nothing), then marked sent / failed / skipped. A failed row may be claimed again (retry) up to MS_LIM.retries times.
   - Every function fails soft: without the 0015 tables nothing is claimed, so nothing new is sent (storeOn false).
   - officialEmail(): the rule for a directory factory's address — a ROLE mailbox (info@, sales@, contact@ …) on the company's own domain
     (never a free-mail provider, never a person's address); when the company's web site is known, the domain must be that site's. */
import { line, isEmail, emailKey, cairoDay, PLAN_SCOPE, planCan, team } from "./common.js";
import { hasTable } from "./acc-base.js";
import { featureOn } from "./flags.js";

export const MS_LIM = Object.freeze({ retries: 3 });
export const storeOn = env => hasTable(env, "mail_sends");
/* one e-mail a day for a partner (owner 2026-11-28 «ادمج الإيميلين»): while the 10:00 report runs (0015 + the owner's member_daily_report
   switch), Bassem's morning note goes by e-mail INSIDE the partner's report (daily-mail.js) and whatsapp.js bassemCron sends no separate
   morning e-mail; either switch off or no 0015 → the morning e-mail goes on its own as before */
export async function morningInReport(env) {
  try { return (await storeOn(env)) && (await featureOn(env, "member_daily_report")); } catch (e) { return false; }
}

/* → true when THIS call claimed the row (a new one, or a failed one under the retry limit) */
export async function claim(env, { kind, ref, email = "", company = "", factory_ref = "", nowMs = Date.now() }) {
  const k = email ? emailKey(email) : "", day = cairoDay(nowMs), at = new Date(nowMs).toISOString();
  try {
    const r = await env.DB.prepare("INSERT INTO mail_sends (kind, ref, email_key, to_addr, company, factory_ref, day, status, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed', '', ?) ON CONFLICT(kind, ref, email_key) DO NOTHING")
      .bind(kind, line(ref, 120), k, line(email, 254).toLowerCase(), line(company, 160), line(factory_ref, 80), day, at).run();
    if (r.meta && r.meta.changes) return true;
    const again = await env.DB.prepare("UPDATE mail_sends SET status = 'claimed', day = ?, at = ?, tries = tries + 1 WHERE kind = ? AND ref = ? AND email_key = ? AND status = 'failed' AND tries < ?")
      .bind(day, at, kind, line(ref, 120), k, MS_LIM.retries).run();
    return !!(again.meta && again.meta.changes);
  } catch (e) { return false; }
}
export async function settle(env, { kind, ref, email = "" }, status) {
  const k = email ? emailKey(email) : "";
  try { await env.DB.prepare("UPDATE mail_sends SET status = ? WHERE kind = ? AND ref = ? AND email_key = ?").bind(status, kind, line(ref, 120), k).run(); } catch (e) { /* fail soft */ }
}
/* a result of mail() → the row's status: sent only with a provider answer; an unsubscribed / switched-off template is «skipped» */
export const statusOf = r => (r && r.sent ? "sent" : r && r.skipped ? "skipped" : "failed");
/* sent rows of a kind on a Cairo day (the teasers' daily cap) */
export async function sentOn(env, kind, day) {
  try { return (await env.DB.prepare("SELECT COUNT(*) AS n FROM mail_sends WHERE kind = ? AND day = ? AND status IN ('sent', 'claimed')").bind(kind, day).first("n")) || 0; } catch (e) { return 0; }
}
export async function exists(env, kind, ref, email = "") {
  try { return !!(await env.DB.prepare("SELECT 1 AS x FROM mail_sends WHERE kind = ? AND ref = ? AND email_key = ?").bind(kind, line(ref, 120), email ? emailKey(email) : "").first("x")); } catch (e) { return false; }
}

/* ---------- the platform's own mailbox (the owner's report and the alerts): TEAM_EMAIL (wrangler.toml: info@madeinegyptgate.com) ---------- */
export const ownerBox = env => team(env) || "";

/* ---------- a directory factory's official company address ---------- */
const ROLE = new Set(["info", "information", "sales", "sale", "contact", "contacts", "contactus", "contact-us", "export", "exports", "exporting", "marketing", "office", "admin",
  "hello", "enquiries", "enquiry", "inquiries", "inquiry", "inquiry-egypt", "service", "services", "customerservice", "customer.service", "customercare", "care", "support", "mail",
  "general", "trade", "trading", "import", "imports", "purchasing", "procurement", "tender", "tenders", "business", "bd", "factory", "plant", "orders", "order", "commercial",
  "egypt", "eg", "cairo", "headoffice", "head.office", "ho", "management", "company", "corporate", "group", "welcome"]);
const FREE = /^(gmail|googlemail|yahoo|ymail|rocketmail|hotmail|outlook|live|msn|icloud|me|mac|aol|yandex|mail|gmx|proton|protonmail|pm|zoho|tutanota|inbox|qq|163|126|sina|rediffmail|lycos|web)\./;
const FREE_EG = /(^|\.)(link\.net|tedata\.net\.eg|yahoo\.com\.eg|hotmail\.com\.eg|windowslive\.com|outlook\.com\.eg)$/;
const hostOf = u => { try { return new URL(/^https?:\/\//i.test(u) ? u : "https://" + u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };
/* the registrable part of a host (example.com, example.com.eg, example.co.uk) */
const base = h => { const p = String(h || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean); if (p.length <= 2) return p.join("."); const two = p.slice(-2).join("."); return /^(com|net|org|gov|edu|co|ac|sci)\.[a-z]{2}$/.test(two) ? p.slice(-3).join(".") : two; };
/* → the normalised address, or "" when it is not an official company address */
export function officialEmail(email, web = "") {
  const e = line(email, 254).toLowerCase().replace(/^mailto:/, "");
  if (!isEmail(e)) return "";
  const at = e.lastIndexOf("@"), local = e.slice(0, at), dom = e.slice(at + 1);
  if (!ROLE.has(local.split("+")[0])) return "";               // a role mailbox only: never a person's name
  if (FREE.test(dom) || FREE_EG.test(dom)) return "";          // the company's own domain, never a free-mail provider
  const w = hostOf(web);
  if (w && base(w) !== base(dom)) return "";                    // a known site: the address must be on it
  return e;
}

/* ---------- the plan that brings a request of this market (the registration link of a teaser) ---------- */
const ORDER = ["basic", "premium", "partner", "strategic"];
export function planForMarket(market) {
  const mk = market || "local";
  return ORDER.find(p => planCan({ plan: p }, "incoming") && (PLAN_SCOPE[p] || []).includes(mk)) || "basic";
}
