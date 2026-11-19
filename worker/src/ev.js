/* A8 honest metrics + unsubscribe links.
   POST /api/ev {kind, ref, metric: view|wa_click|web_click|inquiry} → 204 (sendBeacon-friendly: any content type, JSON body)
     Counted only when the request comes from the platform's own pages (Origin, else Referer, host = SITE_URL's host / www /
     EV_ORIGINS), at most once per network (keyed daily IP hash — the User-Agent is NOT part of it, so changing it does not
     count again) per day / item / metric, at most EV_PER_IP_DAY (300) counted events per network per day, bots filtered.
     Raw IPs are never stored. Aggregated in ev_daily.
   GET  /api/unsub?e=&l=&s=   → confirmation page (link scanners do not unsubscribe anyone)
   POST /api/unsub?e=&l=&s=   → unsubscribed (also RFC 8058 one-click "List-Unsubscribe=One-Click"); the result page offers to
                                turn it back on (action=resub, same signed link) — and so do the account settings. */
import { json, err, preflight, line, sha256, hmac, safeEq, unb64url, now, secretOf, LISTS, cairoDay, esc, rateOk, ipHash, site, membersByMailbox, resubscribe, prefsOf } from "./common.js";

const METRICS = ["view", "wa_click", "web_click", "inquiry"];
const KINDS = ["factory", "company", "tender", "rfq", "project", "offer", "entity", "agency", "region", "city", "store", "event", "news", "product", "page", "award", "lead", "sector", "market", "governorate", "opportunity"];
const BOT = /bot|crawl|spider|slurp|headless|preview|lighthouse|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|facebookexternalhit|whatsapp\//i;
const PER_IP_DAY = 300;
/* hosts whose pages may report events: the site itself (+ www), plus EV_ORIGINS (comma separated, e.g. a preview host) */
function allowedHost(env, h) {
  h = String(h || "").toLowerCase();
  if (!h) return false;
  const own = new URL(site(env)).hostname.replace(/^www\./, "");
  const extra = String(env.EV_ORIGINS || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  return h === own || h === "www." + own || extra.includes(h);
}
function sourceOk(req, env) {
  const o = req.headers.get("Origin"), r = req.headers.get("Referer");
  try { if (o && o !== "null") return allowedHost(env, new URL(o).hostname); } catch (e) { return false; }
  try { return !!r && allowedHost(env, new URL(r).hostname); } catch (e) { return false; }
}

export async function handleEv(req, env) {
  env = env || {};
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return err(405, "method", "method not allowed");
  const done = () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  if (!env.DB) return done();
  const ua = req.headers.get("User-Agent") || "";
  const t = await req.text();
  if (t.length > 2048) return err(413, "too_large", "too large");
  let b = {}; try { b = JSON.parse(t || "{}"); } catch (e) { return err(400, "bad_json", "bad json"); }
  const kind = line(b.kind, 20).toLowerCase(), ref = line(b.ref, 120), metric = line(b.metric, 20);
  if (!KINDS.includes(kind) || !ref || !METRICS.includes(metric)) return err(400, "invalid", "invalid event", { kinds: KINDS, metrics: METRICS });
  if (!ua || BOT.test(ua)) return done();
  if (!sourceOk(req, env)) return done(); // not from the platform's pages (another site, a script): accepted, never counted
  const day = cairoDay(), ih = await ipHash(req, env);
  const h = (await sha256(`${secretOf(env) || "mig"}|ev|${day}|${ih}|${kind}|${ref}|${metric}`)).slice(0, 32);
  const ins = await env.DB.prepare("INSERT INTO ev_seen (h, day) VALUES (?, ?) ON CONFLICT(h) DO NOTHING").bind(h, day).run();
  if (!ins.meta || !ins.meta.changes) return done();
  if (!(await rateOk(env, "evip|" + ih, PER_IP_DAY, 86400))) return done(); // one network cannot inflate many items either
  await env.DB.prepare("INSERT INTO ev_daily (day, kind, ref_id, metric, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(day, kind, ref_id, metric) DO UPDATE SET n = n + 1").bind(day, kind, ref, metric).run();
  return done();
}

const page = (title, body, form) => new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font-family:Tahoma,Arial,sans-serif;background:#f6f4ee;color:#1d2b22;margin:0;padding:40px 16px}main{max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px -15px rgba(0,0,0,.25)}button{background:#0b5d3b;color:#fff;border:0;border-radius:999px;padding:10px 22px;font:inherit;cursor:pointer}button.alt{background:#fff;color:#0b5d3b;border:1px solid #0b5d3b}p[dir=ltr]{color:#555}</style></head><body><main>${body}${form || ""}</main></body></html>`,
  { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "X-Frame-Options": "DENY" } });
const NAMES = { digest: ["ملخص المتابعات وتذكير المواعيد", "follow digests and deadline reminders"], updates: ["تحديثات طلباتك", "updates on your requests"], incoming: ["الطلبات الواردة من المنصة", "incoming requests from the platform"], bassem: ["رسالة باسم اليومية على الإيميل", "Bassem's daily e-mail"], all: ["كل رسائل المنصة (عدا أكواد الدخول)", "all platform emails (except sign-in codes)"], whatsapp: ["رسائل الواتساب من المنصة", "WhatsApp messages from the platform"] };
async function setDigest(env, key, on) {
  for (const m of await membersByMailbox(env, key, "id, prefs_json")) { const p = prefsOf(m); p.email_digest = on; await env.DB.prepare("UPDATE members SET prefs_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(p), now(), m.id).run(); }
}
async function setInbox(env, key, on) {
  for (const m of await membersByMailbox(env, key, "id")) await env.DB.prepare("UPDATE members SET inbox_paused = ?, updated_at = ? WHERE id = ?").bind(on ? 0 : 1, now(), m.id).run();
}
export async function handleUnsub(req, env) {
  env = env || {};
  const url = new URL(req.url), e = url.searchParams.get("e") || "", l = url.searchParams.get("l") || "", s = url.searchParams.get("s") || "";
  const good = LISTS.includes(l) && /^[A-Za-z0-9_-]{4,400}$/.test(e) && safeEq(s, (await hmac(secretOf(env) || "mig", "unsub|" + e + "|" + l)).slice(0, 22));
  if (!good || !env.DB) return page("رابط غير صالح", "<h2>رابط غير صالح / Invalid link</h2>");
  let key = ""; try { key = new TextDecoder().decode(unb64url(e)).toLowerCase(); } catch (x) { return page("رابط غير صالح", "<h2>رابط غير صالح / Invalid link</h2>"); }
  if (req.method === "GET") return page("إلغاء الاشتراك", `<h2>إيقاف: ${esc(NAMES[l][0])}</h2><p dir="ltr">Stop: ${esc(NAMES[l][1])}</p>`, `<form method="post"><button type="submit">تأكيد الإيقاف / Confirm</button></form>`);
  if (req.method !== "POST") return err(405, "method", "method not allowed");
  let action = "";
  try { const t = await req.text(); action = (new URLSearchParams(t).get("action") || "").toLowerCase(); } catch (x) { action = ""; }
  // key = the address's emailKey (lower case, no +tag; Gmail without dots) — members are matched by the same mailbox
  if (action === "resub" && l !== "whatsapp") {
    if (l === "all") { await env.DB.prepare("DELETE FROM unsubscribes WHERE email_key = ?").bind(key).run(); await setInbox(env, key, true); await setDigest(env, key, true); }
    else { await resubscribe(env, key, l); if (l === "incoming") await setInbox(env, key, true); if (l === "digest") await setDigest(env, key, true); }
    return page("تم", `<h2>رجعت شغالة ✅</h2><p>هتوصلك رسائل «${esc(NAMES[l][0])}» تاني.</p><p dir="ltr">Done — ${esc(NAMES[l][1])} are back on.</p>`);
  }
  if (l === "whatsapp") {
    for (const m of await membersByMailbox(env, key, "id, prefs_json")) { const p = prefsOf(m); p.wa_optin = false; await env.DB.prepare("UPDATE members SET prefs_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(p), now(), m.id).run(); }
    return page("تم", `<h2>تم إيقاف الواتساب ✅</h2><p>مش هتوصلك رسائل واتساب من المنصة. تقدر تشغّلها تاني من «الواتساب والإيميل» في لوحة التحكم.</p><p dir="ltr">Done — no more WhatsApp messages from the platform. You can turn them back on under "WhatsApp & e-mail" in your dashboard.</p>`);
  }
  await env.DB.prepare("INSERT INTO unsubscribes (email_key, list, created_at) VALUES (?, ?, ?) ON CONFLICT(email_key, list) DO NOTHING").bind(key, l, now()).run();
  if (l === "incoming" || l === "all") await setInbox(env, key, false);
  if (l === "digest" || l === "all") await setDigest(env, key, false);
  return page("تم", `<h2>تم الإيقاف ✅</h2><p>مش هتوصلك رسائل «${esc(NAMES[l][0])}» تاني. لو ضغطت بالغلط تقدر ترجّعها من الزرار ده (الرابط بيفضل شغال)${l === "incoming" ? "، أو من «الواتساب والإيميل» في لوحة التحكم" : l === "digest" ? "، أو من اختيار «ملخص المتابعات على الإيميل» في لوحة التحكم" : ""}.</p><p dir="ltr">Done — you will no longer receive ${esc(NAMES[l][1])}. Clicked by mistake? Turn it back on with this button (the link keeps working).</p>`,
    `<form method="post"><input type="hidden" name="action" value="resub"><button class="alt" type="submit">رجّعها تاني / Turn it back on</button></form>`);
}
export { json };
