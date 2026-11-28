/* Instant alerts to the platform's own mailbox (TEAM_EMAIL = info@madeinegyptgate.com; owner decisions 2026-11-28). Owner switch
   info_alerts (default ON). They need no migration: the de-duplication uses the rate-limit table rl of the base schema.
   1) A MEMBER stops e-mails (ev.js POST /api/unsub — the daily report or any other e-mail list, or «all»): company, address, which
      e-mails, time. Stopping only stops those e-mails: no account is deleted and no data is erased. One alert per address, list and day;
      a stop from an address that belongs to no member (a teaser recipient, a buyer) is no member alert (the owner's daily report counts it).
   2) Someone tells an assistant (Janna, Bassem) that they wanted to register but could not: what they said, the contact they gave, the time.
        - the tool «register_help» the personas call (POST /api/janna/register-help · /api/advisor/register-help; definitions and the
          persona instruction for the owner to apply: docs/janna/REGISTER-HELP-TOOL.md);
        - the conversation itself: the user turns Janna's / Bassem's call pages store (memory.js writeMemory kind turns) are checked with
          regTrouble() — a registration / sign-up / account / code word next to a «could not / does not work / problem» word, Arabic
          (Egyptian and MSA) or English; one alert per speaker per day;
        - a request or message whose text says it (inquiries.js create: the contact the sender typed in the form goes with it).
      At most REG_LIM.perDay alerts a day for the whole platform, REG_LIM.perIpHour tool calls per network an hour. */
import { mail, line, str, cairoDay, cairoHM, membersByMailbox, rateOk, ipHash, isEmail, sha256, toolBody, json, preflight, EMAIL_LISTS, site } from "./common.js";
import { featureOn } from "./flags.js";
import { ownerBox } from "./mail-sends.js";

export const REG_LIM = Object.freeze({ perDay: 40, perIpHour: 6, said: 1500 });
const LIST_AR = { digest: "ملخص المتابعات وتذكير المواعيد", updates: "تحديثات الطلبات", incoming: "الطلبات الواردة", bassem: "رسالة باسم اليومية", daily: "التقرير اليومي (10 الصبح)", teaser: "دعوات الطلبات الجديدة", all: "كل إيميلات المنصة" };
const AGENT_AR = { janna: "جنة", bassem: "باسم", form: "فورم على الموقع", site: "الموقع" };
const when = nowMs => `${cairoDay(nowMs)} ${cairoHM(nowMs)} بتوقيت القاهرة`;

/* ---------- 1) a member stopped e-mails ---------- */
export async function unsubAlert(env, key, list, nowMs = Date.now()) {
  try {
    if (!EMAIL_LISTS.includes(list) && list !== "all") return { skipped: "not_email" };
    const to = ownerBox(env); if (!to || !env.DB) return { skipped: "no_mailbox" };
    if (!(await featureOn(env, "info_alerts"))) return { skipped: "feature_off" };
    const mem = await membersByMailbox(env, key, "id, company, email, name, plan");
    if (!mem.length) return { skipped: "not_member" };
    if (!(await rateOk(env, `unsubalert|${key}|${list}|${cairoDay(nowMs)}`, 1, 86400, nowMs))) return { skipped: "dup" };
    const m = mem[0], company = line(m.company || m.name || "", 120) || "—", h = (await sha256(key)).slice(0, 10);
    return await mail(env, { id: `unsubalert-${h}-${list}-${cairoDay(nowMs)}`, to, lang: "ar", subject: `[تنبيه] ${company} وقّف «${LIST_AR[list] || list}» / A member stopped e-mails`,
      ar: `عضو وقّف إيميلات من المنصة:\nالشركة: ${company}\nالإيميل: ${line(m.email, 254)}\nوقّف: ${LIST_AR[list] || list}\nالوقت: ${when(nowMs)}\n\nالإيقاف بيوقف الإيميلات دي بس — الحساب والبيانات زي ما هم. يقدر يرجّعها من نفس الرابط أو من لوحة التحكم.`,
      en: `A member stopped platform e-mails: ${company} (${line(m.email, 254)}), list «${list}», at ${new Date(nowMs).toISOString()}. Only those e-mails stop — the account and its data stay as they are.`,
      why: "تنبيه داخلي لإيميل المنصة / Internal alert to the platform's own mailbox." });
  } catch (e) { return { sent: false, error: "alert_failed" }; }
}

/* ---------- 2) «wanted to register but could not» ---------- */
const fold = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ");
const REG_AR = "(?:اسجل|نسجل|يسجل|سجلت|التسجيل|تسجيل|اشترك|نشترك|الاشتراك|اشتراك|حساب|اكونت|الاكونت|الكود|كود التفعيل|كود الدخول|الباقه|ادفع|الدفع)";
const FAIL_AR = "(?:مش عارف|مش عارفه|معرفتش|ماعرفتش|مقدرتش|ماقدرتش|مش قادر|مش قادره|مش بعرف|مبعرفش|مقدرش|فشل|فشلت|بيفشل|مش راضي|مش راضيه|مبيرضاش|مش بيرضي|ماينفعش|مينفعش|مش نافع|مش شغال|مش بيشتغل|مبيشتغلش|مش بيكمل|مبيكملش|مش بيوصل|مبيوصلش|موصلش|ماوصلش|مجاش|ماجاش|مشكله|عطل|خطا|ايرور|غلط|واقف|علق|عالق|لم اتمكن|لم استطع|لا استطيع|تعذر|مش لاقي|ملقيتش)";
const RX_AR = new RegExp(`${FAIL_AR}.{0,40}${REG_AR}|${REG_AR}.{0,40}${FAIL_AR}`);
const REG_EN = "(?:regist\\w*|sign ?up|signing up|subscri\\w*|create (?:an |my )?account|my account|the account|verification code|sign-?in code|the code|pay(?:ment)?)";
const FAIL_EN = "(?:could ?n[o']?t|can ?n?[o']?t|cannot|unable|fail\\w*|not working|does ?n[o']?t work|won'?t|problem|issue|error|trouble|stuck|never (?:came|arrived))";
const RX_EN = new RegExp(`\\b${FAIL_EN}\\b.{0,40}\\b${REG_EN}|\\b${REG_EN}.{0,40}\\b${FAIL_EN}\\b`, "i");
/* does this text say the speaker wanted to register but could not? (a question «how do I register?» alone is not it) */
export function regTrouble(text) {
  const s = fold(text); if (s.length < 6) return false;
  return RX_AR.test(s) || RX_EN.test(s);
}
const clean = (v, n) => str(v, n).replace(/[‪-‮⁦-⁩]/g, "");
/* the alert itself; dedupe = one per speaker (subject / e-mail / phone / text) per Cairo day, at most REG_LIM.perDay a day */
export async function registerAlert(env, a = {}, nowMs = Date.now()) {
  try {
    const to = ownerBox(env); if (!to || !env || !env.DB) return { sent: false, skipped: "no_mailbox" };
    if (!(await featureOn(env, "info_alerts"))) return { sent: false, skipped: "feature_off" };
    const said = clean(a.said, REG_LIM.said), name = line(a.name, 120), company = line(a.company, 160), email = line(a.email, 254).toLowerCase(), phone = line(a.phone, 40).replace(/[^\d+()\s-]/g, "");
    if (!said && !email && !phone) return { sent: false, skipped: "empty" };
    const who = a.subject || email || phone || said.slice(0, 200), h = (await sha256("reghelp|" + who)).slice(0, 12), day = cairoDay(nowMs);
    if (!(await rateOk(env, `reghelp|${h}|${day}`, 1, 86400, nowMs))) return { sent: false, skipped: "dup", dup: true };
    if (!(await rateOk(env, "reghelp|all", REG_LIM.perDay, 86400, nowMs))) return { sent: false, skipped: "day_cap" };
    const agent = AGENT_AR[a.agent] || line(a.agent, 30) || "جنة", src = a.source === "conversation" ? "من كلامه في المكالمة" : a.source === "request" ? "من رسالة على الموقع" + (a.ref ? " (" + line(a.ref, 30) + ")" : "") : "أداة المساعد";
    const contact = [name ? "الاسم: " + name : "", company ? "الشركة: " + company : "", email && isEmail(email) ? "الإيميل: " + email : "", phone ? "الموبايل: " + phone : ""].filter(Boolean);
    return await mail(env, { id: `reghelp-${h}-${day}`, to, lang: "ar", subject: `[تنبيه] حد عايز يسجّل ومعرفش — ${agent} / Someone could not register`,
      ar: `حد قال إنه كان عايز يسجّل على المنصة ومعرفش (${src}، مع ${agent}):\n\nقال: ${said || "—"}\n\nبيانات التواصل اللي ادّاها: ${contact.length ? "\n" + contact.join("\n") : "ماادّاش بيانات تواصل"}${a.page ? "\nالصفحة: " + line(a.page, 200) : ""}\nالوقت: ${when(nowMs)}\n\nصفحة التسجيل: ${site(env)}register/`,
      en: `Someone said they wanted to register but could not (${a.source || "tool"}, with ${a.agent || "janna"}) at ${new Date(nowMs).toISOString()}. What they said and the contact they gave are above.`,
      why: "تنبيه داخلي لإيميل المنصة / Internal alert to the platform's own mailbox." });
  } catch (e) { return { sent: false, error: "alert_failed" }; }
}
/* a conversation's user turns (memory.js): the first that says it → the alert (the visitor / member id dedupes it for the day) */
export async function checkTurns(env, subject, agent, turns, nowMs = Date.now()) {
  try {
    const hit = (turns || []).find(t => t && t.role === "user" && regTrouble(t.text));
    if (!hit) return null;
    return await registerAlert(env, { agent, said: hit.text, subject: "turn|" + subject, source: "conversation" }, nowMs);
  } catch (e) { return null; }
}

/* ---------- the tool: POST /api/janna/register-help · /api/advisor/register-help ----------
   body {said, name?, company?, email?, phone?, page?} (Anam's bodyParams / queryParams merged — common.js toolBody). Janna's tool key
   (X-Janna-Key = JANNA_KEY) when it is set, like janna_lookup. Always 200 with a `text` the persona says (a refused call is retried blind). */
const TOOL_TEXT = { // m = Bassem (masculine), f = Janna (feminine) — the personas' own forms
  m: {
    sent: "تمام، بلّغت فريق المنصة باللي حصل في التسجيل، وهيتواصلوا مع حضرتك على البيانات اللي ادّتها. قول كده بالظبط، ومتوعدش بميعاد معيّن.",
    sent_nocontact: "تمام، بلّغت فريق المنصة باللي حصل في التسجيل. لو عايز الفريق يكلّمه، اطلب منه إيميل أو رقم موبايل وابعت الأداة تاني بيهم مرة واحدة. ومتوعدش بميعاد معيّن.",
    dup: "الفريق اتبلّغ بالموضوع ده النهارده خلاص؛ قول إن الفريق عارف وهيتابع، ومتبعتش الأداة تاني.",
    off: "مقدرتش أبلّغ الفريق دلوقتي. قول له يجرّب تاني من صفحة التسجيل، أو يكتب لفريق المنصة على info@madeinegyptgate.com.",
    limited: "اتبعت بلاغات كتير من نفس المكان؛ قول إن الفريق اتبلّغ قبل كده، ومتبعتش الأداة تاني." },
  f: {
    sent: "تمام، بلّغت فريق المنصة باللي حصل في التسجيل، وهيتواصلوا مع حضرتك على البيانات اللي ادّتها. قولي كده بالظبط، ومتوعديش بميعاد معيّن.",
    sent_nocontact: "تمام، بلّغت فريق المنصة باللي حصل في التسجيل. لو عايز الفريق يكلّمه، اطلبي منه إيميل أو رقم موبايل وابعتي الأداة تاني بيهم مرة واحدة. ومتوعديش بميعاد معيّن.",
    dup: "الفريق اتبلّغ بالموضوع ده النهارده خلاص؛ قولي إن الفريق عارف وهيتابع، ومتبعتيش الأداة تاني.",
    off: "مقدرتش أبلّغ الفريق دلوقتي. قولي له يجرّب تاني من صفحة التسجيل، أو يكتب لفريق المنصة على info@madeinegyptgate.com.",
    limited: "اتبعت بلاغات كتير من نفس المكان؛ قولي إن الفريق اتبلّغ قبل كده، ومتبعتيش الأداة تاني." },
};
export async function handleRegisterHelp(req, env, ctx, { agent = "janna" } = {}) {
  env = env || {};
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed", code: "method" }, 405);
  if (env.JANNA_KEY && req.headers.get("X-Janna-Key") !== env.JANNA_KEY) return json({ error: "unauthorized", code: "unauthorized" }, 401);
  const b = (await toolBody(req)) || {};
  const ih = await ipHash(req, env);
  const TT = agent === "bassem" ? TOOL_TEXT.m : TOOL_TEXT.f;
  if (!(await rateOk(env, "reghelpip|" + ih, REG_LIM.perIpHour, 3600))) return json({ ok: false, alerted: false, text: TT.limited });
  const r = await registerAlert(env, { agent, said: b.said || b.message || b.text || b.problem, name: b.name, company: b.company, email: b.email, phone: b.phone || b.mobile, page: b.page, source: "tool" });
  const contact = !!(line(b.email, 254) || line(b.phone || b.mobile, 40));
  return json({ ok: true, alerted: !!r.sent, text: r.sent ? (contact ? TT.sent : TT.sent_nocontact) : r.dup ? TT.dup : TT.off });
}
