/* WhatsApp through respond.io (BACKLOG 13/15): sender, inbound webhook, Bassem's daily morning message + "call me at" flow.
   Token: secret RESPONDIO_TOKEN (Bearer), else the token the owner saved in the Control Center «مفاتيح الخدمات» (sealed slot
   respondio.token, src/service-keys.js). Channel: the panel value, else var RESPONDIO_CHANNEL_ID, else 580384 ("Whatsapp Business").
   Secret WA_WEBHOOK_SECRET (inbound).
   Real sending needs ALL of: a token · WA_DRY_RUN not "1" (the env kill switch) · the panel switch «تشغيل إرسال واتساب الحقيقي» ON
   (cc_settings wa.live, off by default; it can only be switched on after a passed token test and a delivered test message to the
   platform's own number). Anything missing, unknown or unreadable → dry run (logged, nothing leaves the Worker).
   Verified (read-only, 2026-11-18): GET https://api.respond.io/v2/space/channel → channel 580384 (whatsapp_business);
   GET /v2/space/channel/580384/template → bassem_morning ({{1}}), bassem_call_ready, bassem_update — ar_EG, MARKETING,
   with call_permission_request; status was still "submitted" (not yet approved by Meta) on that day.
   Business-initiated messages MUST be an approved template; free text only inside the 24 h window after the member's
   last message (members.wa_last_in_at). WA_DRY_RUN=1 (or the panel switch off) logs instead of calling respond.io.
   Outside the window a template is only a notification: the real text (a routed request, Bassem's note) is QUEUED and sent
   automatically when the member answers on WhatsApp (inbound) — it never counts as "delivered" before that.
   The first inbound message from a member's number marks it verified (members.wa_verified_at). */
import { line, str, now, iso, hmac, safeEq, json, err, preflight, jparse, prefsOf, effPlan, PLAN_LV, cairoDay, cairoHM, cairoDow, mail, team, site, secretOf, emailOn, isEmail, isBlocked, planCan, plansWith } from "./common.js";
import { waNumber } from "./meetings.js";
import { advisorCallLink } from "./advisor.js";
import { respondioToken, respondioChannel, svc, waSwitchNow } from "./service-keys.js";

const API = "https://api.respond.io/v2";
export const TEMPLATES = { // body text exactly as submitted on respond.io (sent along as the body component's text)
  bassem_morning: "صباح الخير {{1}}  طمني علي صحة حضرتك",
  bassem_call_ready: "حضرتك فاضي اتصل بيك عشان في مناقصة مهمه",
  bassem_update: "لقيت فرصة مهمة وعاوز اعرضها علي حضرتك",
};
/* the token the Worker uses: RESPONDIO_TOKEN (Worker secret), else the panel's sealed slot (loaded by acc.js ccBoot) */
export const waToken = env => (env ? respondioToken(env) : "");
export const waOn = env => !!(env && waToken(env));
/* the env kill switch: WA_DRY_RUN set to anything but "0" (normally "1") stops every send, whatever the panel says */
export const waDryEnv = env => { const v = String(env && env.WA_DRY_RUN != null ? env.WA_DRY_RUN : "").trim(); return v !== "" && v !== "0"; };
/* the panel switch «تشغيل إرسال واتساب الحقيقي»: on only when it was loaded and is on after a passed test (fail-closed) */
export const waSwitch = env => !!(env && svc(env).wa_live === true);
/* WhatsApp really goes out: a token AND not the env kill switch AND the panel switch on (deploy 2: WA_DRY_RUN = "0", the panel decides) */
export const waLive = env => waOn(env) && !waDryEnv(env) && waSwitch(env);
/* why nothing would leave right now ("" = live) */
export const waDryReason = env => (!waOn(env) ? "no_token" : waDryEnv(env) ? "env_dry_run" : !waSwitch(env) ? "switch_off" : "");
const channelId = env => respondioChannel(env || {});
const maskPhone = p => { const d = String(p || "").replace(/\D/g, ""); return d.length > 4 ? "•••" + d.slice(-3) : "•••"; };
export const e164 = phone => { const d = waNumber(phone); return d ? "+" + d : ""; };

/* Build the respond.io "send message" request.
   TODO-VERIFY: shape taken from the respond.io Developer API v2 reference ("Send a message": POST /v2/contact/{identifier}/message,
   identifier "phone:+201001234567", body {channelId, message}; WhatsApp template = {type:"whatsapp_template", template:{name,
   languageCode, components:[{type:"body", text, parameters:[{type:"text", text}]}]}}; 200 → {messageId}). It could only be
   read from a mirror of the docs, not sent for real during development — confirm with ONE test message to the owner's own
   number before launch (and whether a template without variables needs the body component at all). */
export function buildSend(env, phone, msg) {
  const id = e164(phone);
  if (!id) return null;
  let message;
  if (msg.template) {
    const name = msg.template, params = (msg.params || []).map(t => ({ type: "text", text: line(t, 200) || "-" }));
    message = { type: "whatsapp_template", template: { name, languageCode: msg.languageCode || "ar_EG", ...(params.length ? { components: [{ type: "body", text: TEMPLATES[name] || "", parameters: params }] } : {}) } };
  } else message = { type: "text", text: str(msg.text, 4000) };
  return { url: `${API}/contact/${encodeURIComponent("phone:" + id)}/message`, body: { channelId: channelId(env), message } };
}
/* the ONLY function that talks to respond.io for sending to members and buyers: it goes out only when waLive (token + no env kill
   switch + the panel switch on); otherwise a dry run — logged without the number or the text (PII stays out of the logs) */
export async function sendWA(env, phone, msg) {
  if (!waOn(env)) return { sent: false, error: "whatsapp not configured" };
  const r0 = buildSend(env, phone, msg);
  if (!r0) return { sent: false, error: "no valid phone" };
  // the memo decides what is attempted; the switch is re-read from D1 right before the provider call (switched off elsewhere → stops at once)
  const live = waLive(env) && await waSwitchNow(env);
  if (!live) { console.log("WA dry run", JSON.stringify({ reason: waDryReason(env) || "switch_off", kind: msg.template || "text", to: maskPhone(phone) })); return { sent: false, error: "dry run" }; }
  return postWA(env, phone, r0, msg);
}
/* ONE owner-initiated test message to the platform's OWN WhatsApp number (Control Center «مفاتيح الخدمات», acc-keys.js): it skips only the
   panel switch (that is what it proves before the switch may be turned on) — never the WA_DRY_RUN kill switch, never a typed number. */
export async function sendOwnerTest(env, ownNumber, msg) {
  if (!waOn(env)) return { sent: false, error: "whatsapp not configured" };
  if (waDryEnv(env)) return { sent: false, error: "dry run (WA_DRY_RUN)" };
  const r0 = buildSend(env, ownNumber, msg);
  if (!r0) return { sent: false, error: "no valid phone" };
  const r = await postWA(env, ownNumber, r0, msg);
  try { if (env.DB) await logWA(env, null, ownNumber, "out", "owner_test", msg.text || TEMPLATES[msg.template] || msg.template || "", r); } catch (e) { /* the log is best effort */ }
  return r;
}
async function postWA(env, phone, r0, msg) {
  const token = waToken(env);
  const call = () => fetch(r0.url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(r0.body) });
  try {
    let r = await call();
    if (r.status === 404) { // contact not in respond.io yet → create it, then retry once (TODO-VERIFY: POST /v2/contact/{identifier})
      const c = await fetch(`${API}/contact/${encodeURIComponent("phone:" + e164(phone))}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ phone: e164(phone), firstName: line(msg.firstName, 60) || undefined }) });
      if (c.ok || c.status === 409) r = await call();
    }
    let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) return { sent: false, error: `respond.io ${r.status}: ${line(j.message || r.statusText, 160)}` };
    const mid = j.messageId != null ? String(j.messageId) : "";
    return mid ? { sent: true, id: mid } : { sent: false, error: "respond.io: no messageId" };
  } catch (e) { return { sent: false, error: "respond.io: " + line(e && e.message, 120) }; }
}
export const windowOpen = (m, nowMs = Date.now()) => !!(m && m.wa_last_in_at && Date.parse(m.wa_last_in_at) > nowMs - 23.5 * 3600e3);
/* keyed hash (HMAC with the platform secret): Egyptian mobile numbers are few enough to brute-force a plain SHA-256 */
export const phoneHash = async (env, phone) => (await hmac(secretOf(env) || "mig", "wa|" + e164(phone))).slice(0, 24);
async function logWA(env, m, phone, direction, kind, text, r, flag = "", status) {
  await env.DB.prepare("INSERT INTO wa_messages (member_id, phone_hash, direction, kind, text, status, provider_id, flag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(m ? m.id : "", phone ? await phoneHash(env, phone) : "", direction, kind, str(text, 2000), status || (direction === "in" ? "received" : r && r.sent ? "sent" : "failed"), (r && r.id) || "", flag, now()).run();
}
const QUEUE_HOURS = 72;
/* member messaging: free text inside the 24 h window, otherwise the approved template (no template → not sent).
   queueText: outside the window the text is kept and delivered when the member replies (result.queued). */
export async function sendToMember(env, m, { text, template, params, queueText }, nowMs = Date.now()) {
  if (!m || !m.phone) return { sent: false, error: "no phone" };
  const p = prefsOf(m);
  if (!p.wa_optin) return { sent: false, error: "not opted in" };
  if (p.pause) return { sent: false, error: "paused" };
  const useText = text && windowOpen(m, nowMs);
  if (!useText && !template) return { sent: false, error: "outside 24h window" };
  const r = await sendWA(env, m.phone, useText ? { text } : { template, params, firstName: m.name });
  await logWA(env, m, m.phone, "out", useText ? "text" : template, useText ? text : TEMPLATES[template] || template, r);
  let queued = false;
  if (!useText && r.sent && text && queueText) { await logWA(env, m, m.phone, "out", "pending", text, null, "", "queued"); queued = true; }
  return { ...r, via: useText ? "text" : "template", queued };
}
/* the member answered → the 24 h window is open: deliver what was waiting (oldest first, at most 5, from the last 72 h) */
async function flushQueue(env, m, nowMs) {
  if (!prefsOf(m).wa_optin || !m.phone) return 0;
  const { results } = await env.DB.prepare("SELECT id, text FROM wa_messages WHERE member_id = ? AND status = 'queued' AND created_at > ? ORDER BY id ASC LIMIT 5").bind(m.id, iso(nowMs - QUEUE_HOURS * 3600e3)).all();
  let n = 0;
  for (const q of results || []) {
    const claim = await env.DB.prepare("UPDATE wa_messages SET status = 'sending' WHERE id = ? AND status = 'queued'").bind(q.id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    const r = await sendWA(env, m.phone, { text: q.text });
    await env.DB.prepare("UPDATE wa_messages SET status = ?, provider_id = ? WHERE id = ?").bind(r.sent ? "sent" : "failed", (r && r.id) || "", q.id).run();
    if (r.sent) n++;
  }
  await env.DB.prepare("UPDATE wa_messages SET status = 'expired' WHERE member_id = ? AND status = 'queued' AND created_at <= ?").bind(m.id, iso(nowMs - QUEUE_HOURS * 3600e3)).run();
  return n;
}

/* ---------- inbound webhook: POST /api/wa/inbound?secret=WA_WEBHOOK_SECRET (respond.io → Workflows/Webhooks "message received") ----------
   TODO-VERIFY payload: parsed leniently — phone from contact.phone, text from message.message.text / message.text / text;
   outgoing echoes (traffic "outgoing") are ignored. */
export function parseInbound(b) {
  b = b && typeof b === "object" ? b : {};
  const contact = b.contact || (b.data && b.data.contact) || {};
  const msg = b.message || (b.data && b.data.message) || {};
  const inner = msg.message && typeof msg.message === "object" ? msg.message : msg;
  const traffic = String(msg.traffic || b.traffic || "incoming").toLowerCase();
  const phone = line(contact.phone || b.phone || (contact.identifier || "").replace(/^phone:/, ""), 30);
  const text = str(typeof inner.text === "string" ? inner.text : typeof b.text === "string" ? b.text : (inner.title || ""), 2000);
  return { phone, text, incoming: traffic !== "outgoing" };
}
const RX = {
  stop: /^\s*(ايقاف|إيقاف|اوقف|أوقف|وقف|stop|unsubscribe|الغاء|إلغاء)\s*[.!]*\s*$/i,
  resume: /^\s*(ابدا|ابدأ|تشغيل|استئناف|start|resume)\s*[.!]*\s*$/i,
  bad: /متضايق|متضايقه|مضايق|تعبان|تعبانه|زعلان|زعلانه|مخنوق|حزين|مش كويس|مش أحسن|مش احسن|مش تمام|وحش|sad|upset|tired|not good|not great/i,
  good: /الحمد ?لله|تمام|كويس|بخير|زي الفل|fine|good|great|ok\b/i,
  now: /^\s*(دلوقتي|دلوقت|الان|الآن|حالا|حالاً|now)\b/i, noon: /الضهر|الظهر|noon|afternoon/i, evening: /بالليل|الليل|المسا|مساء|بليل|evening|night/i, notToday: /مش النهارده|مش النهاردة|مش انهارده|بلاش النهارده|not today/i,
};
export function parseTime(text) {
  const t = String(text || "");
  let m = t.match(/(\d{1,2})[:.](\d{2})/);
  if (m && +m[1] < 24 && +m[2] < 60) return String(m[1]).padStart(2, "0") + ":" + m[2];
  m = t.match(/(?:الساعه|الساعة|at)\s*(\d{1,2})/i);
  if (m && +m[1] <= 12) { let h = +m[1]; if (h < 8 || RX.evening.test(t)) h = h === 12 ? 12 : h + 12; return String(h % 24).padStart(2, "0") + ":00"; }
  return "";
}
/* → {intent, prefsPatch, reply, flag} */
export function interpret(text, m, nowMs = Date.now()) {
  const t = String(text || "").trim(), day = cairoDay(nowMs), who = [m && m.title, m && m.name].filter(Boolean).join(" ");
  if (RX.stop.test(t)) return { intent: "stop", flag: "stop", prefsPatch: { pause: true }, reply: "تمام، وقفت رسايل باسم اليومية. لو حبيت ترجعها ابعت «ابدأ». / Daily messages paused — send START to resume." };
  if (RX.resume.test(t)) return { intent: "resume", prefsPatch: { pause: false }, reply: "أهلاً بيك تاني 🌿 رسايل الصبح رجعت شغالة. / Daily messages resumed." };
  if (RX.notToday.test(t)) return { intent: "time", flag: "time", prefsPatch: { call_today_at: "skip:" + day }, reply: "ولا يهمك، نشتغل سوا يوم تاني إن شاء الله. لو احتجتني ابعتلي في أي وقت." };
  let hm = "";
  if (RX.now.test(t)) hm = cairoHM(nowMs);
  else if (parseTime(t)) hm = parseTime(t);
  else if (RX.noon.test(t)) hm = "13:00";
  else if (RX.evening.test(t)) hm = "20:00";
  // today only: the standing daily time (session_time) is chosen in the dashboard or with Bassem, not by one WhatsApp reply
  if (hm) return { intent: "time", flag: "time", prefsPatch: { call_today_at: day + "T" + hm }, reply: `اتفقنا${who ? " يا " + who : ""} ✅ هكلمك النهارده الساعة ${hm} بتوقيت القاهرة.` };
  if (RX.bad.test(t)) return { intent: "mood_bad", flag: "mood", reply: `ألف سلامة عليك${who ? " يا " + who : ""} 🤍 ليه بس؟ إيه اللي مزعلك؟ إحنا معاك، وإن شاء الله نحاول نبسطك ونساعدك.` };
  if (RX.good.test(t)) return { intent: "mood_good", reply: "يا رب دايماً دايماً بخير وسلامة 🤲 تحب نشتغل سوا إمتى النهارده؟ ابعت: دلوقتي / الضهر / بالليل / مش النهارده" };
  return { intent: "other", reply: "" };
}

export async function handleWA(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return preflight();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/wa/, "").replace(/\/+$/, "") || "/";
  try {
    // dry_run = the EFFECTIVE state (env kill switch OR the panel switch off OR no token); switch / dry_run_env / reason say why
    if (path === "/health") return json({ ok: waOn(env) && !!env.WA_WEBHOOK_SECRET, whatsapp: waOn(env), webhook: !!env.WA_WEBHOOK_SECRET, channel: channelId(env), dry_run: !waLive(env), switch: waSwitch(env), dry_run_env: waDryEnv(env), reason: waDryReason(env) || "live" });
    if (path !== "/inbound") return err(404, "not_found", "not found");
    if (req.method !== "POST") return err(405, "method", "method not allowed");
    if (!env.DB) return err(503, "store_off", "store not configured");
    if (!env.WA_WEBHOOK_SECRET) return err(503, "webhook_off", "webhook not configured");
    // the secret may come as a header (X-Webhook-Secret / Bearer — kept out of URL logs, SEC L8) or, for respond.io's URL-only webhooks, ?secret=
    const given = req.headers.get("X-Webhook-Secret") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
    if (!safeEq(given, env.WA_WEBHOOK_SECRET)) return err(401, "unauthorized", "unauthorized");
    const raw = await req.text();
    if (raw.length > 256 * 1024) return err(413, "too_large", "too large");
    const b = jparse(raw, {});
    const r = await inbound(env, b, ctx);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error("wa error", e && e.stack || e);
    return err(500, "server", "server error");
  }
}
export async function inbound(env, b, ctx, nowMs = Date.now()) {
  const { phone, text, incoming } = parseInbound(b);
  if (!incoming) return { ignored: "outgoing" };
  const p = e164(phone);
  if (!p) return { ignored: "no phone" };
  const m = await env.DB.prepare("SELECT * FROM members WHERE phone = ? ORDER BY verified DESC LIMIT 1").bind(p).first();
  const it = interpret(text, m, nowMs);
  await logWA(env, m, p, "in", it.intent, text, null, it.flag || "");
  if (!m) return { stored: true, member: false, intent: it.intent };
  const prefs = { ...prefsOf(m), ...(it.prefsPatch || {}) };
  // a message from the member's own number proves the number is theirs (wa_verified_at)
  await env.DB.prepare("UPDATE members SET wa_last_in_at = ?, prefs_json = ?, updated_at = ?, wa_verified_at = CASE WHEN wa_verified_at = '' THEN ? ELSE wa_verified_at END WHERE id = ?").bind(iso(nowMs), JSON.stringify(prefs), iso(nowMs), iso(nowMs), m.id).run();
  const m2 = { ...m, wa_last_in_at: iso(nowMs), prefs_json: JSON.stringify(prefs) };
  const jobs = [];
  let reply = it.reply;
  // what waited for this answer (a routed request, Bassem's note) goes out first — unless the member just said stop
  const flushed = it.intent === "stop" || prefs.pause ? 0 : await flushQueue(env, m2, nowMs);
  if (!reply && !flushed) { // unknown text: a short automatic guide, at most once every 6 h (no ping-pong)
    const last = await env.DB.prepare("SELECT created_at FROM wa_messages WHERE member_id = ? AND direction = 'out' AND kind = 'text' ORDER BY id DESC LIMIT 1").bind(m.id).first("created_at");
    if (!last || Date.parse(last) < nowMs - 6 * 3600e3) reply = `وصلتني رسالتك ✅ تقدر تتابع كل جديدك وتكلم باسم فيديو من هنا: ${site(env)}advisor.html — ولو عايز نحدد ميعاد ابعت: دلوقتي / الضهر / بالليل / مش النهارده. لإيقاف الرسايل ابعت «إيقاف».`;
  }
  // a stop request is honoured before the confirmation (sendToMember refuses while paused) → send the confirmation directly
  if (reply) jobs.push(it.intent === "stop" ? sendWA(env, m.phone, { text: reply }).then(r => logWA(env, m, m.phone, "out", "text", reply, r)) : sendToMember(env, m2, { text: reply }, nowMs));
  if (it.intent === "mood_bad" && team(env)) // monitoring copy only — Bassem already answered automatically
    jobs.push(mail(env, { id: "wamood-" + m.id + "-" + cairoDay(nowMs), to: team(env), subject: "[متابعة] عضو قال إنه مش في أحسن حال / Member mood flag", ar: `للمتابعة فقط (تم الرد تلقائياً): العضو ${m.company || m.name || m.id} كتب على الواتساب: «${line(text, 300)}»`, en: `FYI only (auto-replied): member ${m.company || m.name || m.id} wrote on WhatsApp: "${line(text, 300)}"` }));
  const all = Promise.all(jobs).catch(e => console.error("wa reply", e && e.message));
  ctx.waitUntil(all);
  return { stored: true, member: true, intent: it.intent, delivered_queued: flushed };
}

/* ---------- Bassem's daily message (cron every 15 min): WhatsApp, else E-MAIL ----------
   Partner/strategic members (plan in force, set by the platform), not paused («إيقاف» / pause), at their morning_time (default
   09:00 Cairo) on their chosen days (default every day), once per Cairo day (morning_sent_day claim):
   - WhatsApp is live (a token, not WA_DRY_RUN, the panel switch on) and the member opted in with a phone → template bassem_morning ({{1}} = title +
     name), or inside an open 24 h window a text with the REAL number of new items in their scope today (never invented);
   - otherwise, or when that send fails (templates still "submitted" at Meta) → an Arabic-first (+English) EMAIL from Bassem with the
     same content: he asks how they are, the real count of new items in their scope today (or the next step of an open deal), and
     «تحب نشتغل سوا إمتى النهارده؟» with one-click links advisor.html#when=now|noon|evening|skip plus a link that opens Bassem.
     Needs a valid address the platform holds for the member (phone / WhatsApp opt-in NOT required); list "bassem" (unsubscribable).
   Call time = call_today_at (chosen today on WhatsApp / with Bassem / by the #when= links), else the standing session_time on the
   member's days; "مش النهارده" skips today → bassem_call_ready template (+ the text queued), or inside the window a text with a
   one-time sign-in link advisor.html?live=1#login=<code>&live=1 (single use, 12 h) that opens the live video call with Bassem;
   WhatsApp not live / failed → the same «أنا جاهز… اضغط هنا ونتكلم فيديو» by e-mail. */
const TRANSIENT = /respond\.io (429|5\d\d)|respond\.io: (?!no messageId)|resend (429|5\d\d)|resend: |cloudflare: /;
const whoOf = m => [m.title, m.name].filter(Boolean).join(" ") || m.company || "";
async function nextDealStep(env, m) {
  try {
    return await env.DB.prepare("SELECT title, next_action, due_date FROM deals WHERE member_id = ? AND stage NOT IN ('won', 'lost') AND next_action != '' ORDER BY (due_date = '') ASC, due_date ASC, updated_at DESC LIMIT 1").bind(m.id).first();
  } catch (e) { return null; }
}
export async function morningEmail(env, m, n, step, day = cairoDay()) {
  const who = whoOf(m), S = site(env), W = k => `${S}advisor.html#when=${k}`;
  const cnt = n && n.count ? n.count : 0;
  const ar = `صباح الخير${who ? " يا " + who : ""} ☀️\nأنا باسم، مستشارك في منصة صنع في مصر. يا رب تكون بخير وصحتك تمام النهارده — طمّني عليك.\n\n` +
    (cnt ? `الجديد عندك النهارده: ${cnt} ${cnt === 1 ? "فرصة جديدة" : cnt === 2 ? "فرصتين جداد" : "فرص جديدة"} في نطاق باقتك${n.top ? " — أهمها: " + n.top : ""}.` :
      `النهارده مفيش جديد في قطاعك لحد دلوقتي${step ? `، بس عندنا متابعة: ${line(step.next_action, 160)}${step.title ? " (" + line(step.title, 100) + ")" : ""}${step.due_date ? " — ميعادها " + step.due_date : ""}.` : "، بس نقدر نراجع صفقاتك المفتوحة سوا."}`) +
    `\n\nتحب نشتغل سوا إمتى النهارده؟ اختار بضغطة:\n• دلوقتي: ${W("now")}\n• الضهر: ${W("noon")}\n• بالليل: ${W("evening")}\n• مش النهارده: ${W("skip")}\n\nافتح باسم: ${S}advisor.html`;
  const en = `Good morning${m.name ? " " + m.name : ""} ☀️\nI'm Bassem, your advisor at Made in Egypt Gate. I hope you are well today.\n\n` +
    (cnt ? `New for you today: ${cnt} opportunit${cnt === 1 ? "y" : "ies"} in your plan's scope${n.top ? " — top: " + n.top : ""}.` :
      `Nothing new in your sector so far today${step ? `, but we have a follow-up: ${line(step.next_action, 160)}${step.due_date ? " (due " + step.due_date + ")" : ""}.` : "; we can review your open deals together."}`) +
    `\n\nWhen shall we work together today? One click: now ${W("now")} · noon ${W("noon")} · evening ${W("evening")} · not today ${W("skip")}\nOpen Bassem: ${S}advisor.html`;
  return mail(env, { id: `bm-${m.id}-${day}`, to: m.email, lang: "ar", list: "bassem", fromName: "باسم — منصة صنع في مصر", replyTo: team(env) || undefined,
    subject: `صباح الخير${who ? " يا " + who : ""} ☀️ — باسم من منصة صنع في مصر / Good morning from Bassem`, ar, en,
    why: "رسالة باسم اليومية لباقة الشريك — بتوصلك على الإيميل لحد ما الواتساب يشتغل. توقفها من لوحة التحكم أو من الرابط ده. / Bassem's daily note for partner plans, by e-mail until WhatsApp is live." });
}
export async function callEmail(env, m, link, day = cairoDay()) {
  const who = whoOf(m);
  return mail(env, { id: `bc-${m.id}-${day}`, to: m.email, lang: "ar", list: "bassem", fromName: "باسم — منصة صنع في مصر", replyTo: team(env) || undefined,
    subject: `أنا جاهز${who ? " يا " + who : ""} 👋 — نتكلم فيديو؟ / Bassem is ready for your call`,
    ar: `أنا جاهز${who ? " يا " + who : ""} 👋 اضغط هنا ونتكلم فيديو (الرابط بيدخلك على طول، صالح لمرة واحدة النهارده):\n${link.url}`,
    en: `I'm ready${m.name ? ", " + m.name : ""} 👋 Click here and we talk on video (signs you in directly; single use, today only):\n${link.url}`,
    why: "ميعاد الشغل اللي اخترته مع باسم / The work time you chose with Bassem." });
}
export async function bassemCron(env, nowMs = Date.now(), newCount) {
  const out = { morning: 0, call: 0, failed: 0, email_morning: 0, email_call: 0 };
  if (!env.DB) return out;
  const live = waLive(env), mailOk = emailOn(env);
  if (!live && !mailOk) return out;
  const day = cairoDay(nowMs), hm = cairoHM(nowMs), dow = cairoDow(nowMs);
  const bp = plansWith("bassem"); // the plans matrix decides who has Bassem (default: partner, strategic)
  const { results } = await env.DB.prepare(`SELECT * FROM members WHERE plan IN (${bp.map(() => "?").join(", ") || "''"}) AND verified = 1 AND (phone != '' OR email != '') LIMIT 1000`).bind(...bp).all();
  for (const m of results || []) {
    if (!planCan(m, "bassem", iso(nowMs))) continue;
    const p = prefsOf(m);
    if (p.pause) continue; // paused («إيقاف»): nothing on any channel
    const viaWA = live && !!p.wa_optin && !!m.phone;
    // e-mail: an address the platform holds for this paying member (verified = plan set by the platform; or confirmed by a code)
    const viaMail = mailOk && isEmail(String(m.email || "")) && !!(m.verified || m.email_verified_at) && !(await isBlocked(env, { email: m.email }));
    if (!viaWA && !viaMail) continue;
    const who = whoOf(m);
    // morning message
    const mt = /^\d{2}:\d{2}$/.test(p.morning_time) ? p.morning_time : "09:00";
    const days = Array.isArray(p.days) && p.days.length ? p.days : [0, 1, 2, 3, 4, 5, 6];
    if (m.morning_sent_day !== day && days.includes(dow) && hm >= mt && hm <= "22:00") {
      const claim = await env.DB.prepare("UPDATE members SET morning_sent_day = ? WHERE id = ? AND morning_sent_day != ?").bind(day, m.id, day).run();
      if (claim.meta && claim.meta.changes) {
        const n = typeof newCount === "function" ? await newCount(m) : null; // REAL new items in the member's scope (digest.js)
        let r = { sent: false, error: "whatsapp not live" };
        if (viaWA) {
          const text = windowOpen(m, nowMs) ? `صباح الخير${who ? " يا " + who : ""} ☀️ أنا باسم، مستشارك في منصة صنع في مصر. يا رب تكون بخير وصحتك تمام النهارده.\n` +
            (n && n.count ? `الجديد عندك النهارده: ${n.count} ${n.count === 1 ? "فرصة" : "فرص"} في نطاق باقتك${n.top ? " — أهمها: " + n.top : ""}.` : "النهارده مفيش جديد في قطاعك لحد دلوقتي، بس نقدر نراجع صفقاتك المفتوحة سوا.") +
            "\nتحب نشتغل سوا إمتى النهارده؟ دلوقتي / الضهر / بالليل / مش النهارده" : "";
          r = await sendToMember(env, m, { text, template: "bassem_morning", params: [who || "حضرتك"] }, nowMs);
        }
        if (r.sent) out.morning++; // WhatsApp only
        else {
          const e = viaMail ? await morningEmail(env, m, n, n && n.count ? null : await nextDealStep(env, m), day) : { sent: false, error: "no email" };
          if (e.sent) out.email_morning++;
          else if (!e.skipped) { out.failed++; if (TRANSIENT.test(r.error || "") || TRANSIENT.test(e.error || "")) await env.DB.prepare("UPDATE members SET morning_sent_day = '' WHERE id = ? AND morning_sent_day = ?").bind(m.id, day).run(); } // transient → retry next run
        }
      }
    }
    // "call me at": today's choice (WhatsApp / Bassem's set_work_time tool / #when= link), else the standing session time on the member's days
    const ct = String(p.call_today_at || ""), skip = ct === "skip:" + day;
    const at = ct.startsWith(day + "T") ? ct.slice(11, 16) : !skip && /^\d{2}:\d{2}$/.test(p.session_time || "") && days.includes(dow) ? p.session_time : "";
    if (at && hm >= at && hm <= "22:30" && m.call_sent_day !== day) {
      const claim = await env.DB.prepare("UPDATE members SET call_sent_day = ? WHERE id = ? AND call_sent_day != ?").bind(day, m.id, day).run();
      if (claim.meta && claim.meta.changes) {
        const link = await advisorCallLink(env, m.id);
        let r = { sent: false, error: "whatsapp not live" };
        if (viaWA) r = await sendToMember(env, m, { text: `أنا جاهز${who ? " يا " + who : ""} 👋 اضغط هنا ونتكلم فيديو (الرابط بيدخلك على طول، صالح لمرة واحدة النهارده): ${link.url}`, template: "bassem_call_ready", queueText: true }, nowMs);
        if (r.sent) out.call++;
        else {
          const e = viaMail ? await callEmail(env, m, link, day) : { sent: false, error: "no email" };
          if (e.sent) out.email_call++; else if (!e.skipped) out.failed++;
        }
      }
    }
  }
  return out;
}
