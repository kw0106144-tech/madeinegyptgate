/* «🛠️ المطوّر / Developer» — the feature switches «المزايا» (owner request 2026-11-19: a developer panel so he can change anything and
   add / remove features without us). THE registry of the platform's real features the owner may switch on / off from the Control Center
   (owner only: acc-dev.js GET|PUT /api/admin/cc/dev/features, audited as dev.features), stored in cc_settings k = 'features' (scope
   'system'; JSON {v:1, values:{key: true|false}, changed:{key:{at, by}}} — a key without a stored choice = its default), exposed to the
   site through GET /api/settings → features (scope client | both, EFFECTIVE values: acc-plans.js publicSettings) and ENFORCED on the
   server where the feature runs (scope server | both):
     janna_live / bassem_live  janna-session.js  POST /api/janna/session (agent janna / bassem) → 503 feature_off
     bassem_live               bassem-meetings.js POST /api/admin/cc/meetings (a new meeting invite) → 503 feature_off
     registrations             auth.js           POST /api/auth/verify for an e-mail WITHOUT an account → 503 feature_off (members sign in)
                               inquiries.js      POST /api/inquiries kind signup → 503 feature_off (a staff entry still works)
     rfq_autoroute             inquiries.js      no automatic routing (new requests, cron retries, re-match): the team handles them
                                                 («محتاج تدخل», like a request without a match); the console's manual resend still routes
     bassem_morning            whatsapp.js       bassemCron: the morning message is skipped («كلّمني الساعة» keeps working)
     daily_digest              digest.js         dailyJobs: digests + deadline reminders skipped (the item sync and housekeeping still run)
     whatsapp_send             whatsapp.js       waLive() false → every send is a dry run: an extra OFF on top of «مفاتيح الخدمات»
                               acc-keys.js       POST /keys/wa-test (the owner's test message) → 409 feature_off; can_send_test false
     bassem_web_search         websearch.js      POST /api/advisor/web → 503 feature_off
   Two rows are LOCKED (effective off, cannot be switched ON from here; OFF is always allowed) while what they need is missing, both in
   «مفاتيح الخدمات»: whatsapp_send until the respond.io token test passed; bassem_web_search until a web-search key + tool secret exist.
   The two privacy rules are PERMANENT POLICY (POLICIES): shown, never switches.
   Reader: loadFeatures(env) — ≤ 1 D1 read per isolate per 30 s (memo per env.DB; acc.js ccBoot warms it at the start of every request /
   cron run), featureOn(env, key) async, featureSync(env, key) from the memo (the default before the first load). No 0006 tables → the
   defaults; any other read error → the last good view, else the defaults (a D1 hiccup never switches the platform off).
   Leaf module: imports service-keys.js only (inquiries.js, whatsapp.js, auth.js, janna-session.js, websearch.js, digest.js, bassem-meetings.js import it). */
import { loadServiceKeys, respondioToken, webSearchConfig } from "./service-keys.js";

export const FEATURES_KEY = "features";
export const FLAGS_MEMO_MS = 30000;
export const SCOPES = Object.freeze(["server", "client", "both"]);
const T = (code, ar, en) => Object.freeze({ code, ar, en });

/* the registry — order = the order on the panel. default: what the platform does when the owner never touched the row. */
export const FEATURES = Object.freeze([
  { key: "janna_live", default: true, scope: "both",
    label_ar: "مكالمات جنة المباشرة (فيديو)", label_en: "Janna live video calls",
    desc_ar: "زرار «اتكلم مع جنة» على صفحات الموقع. لو قفلته، الزرار بيختفي والسيرفر بيرفض أي مكالمة جديدة مع جنة.",
    desc_en: "The «talk to Janna» button on the site's pages. Off: the button is hidden and the server refuses any new call with Janna.",
    enforced_by: ["POST /api/janna/session (agent janna) → 503 feature_off", "site"] },
  { key: "bassem_live", default: true, scope: "both",
    label_ar: "مكالمات باسم المباشرة (فيديو)", label_en: "Bassem live video calls",
    desc_ar: "مكالمات المستشار الذكي باسم مع الأعضاء. لو قفلته، زرار المكالمة بيختفي والسيرفر بيرفض أي مكالمة جديدة مع باسم، ولوحة التحكم مابتبعتش باسم لاجتماعات جديدة («📞 اجتماعات باسم»).",
    desc_en: "The AI advisor Bassem's calls with members. Off: the call button is hidden, the server refuses any new call with Bassem, and the Control Center sends him to no new meeting («📞 Bassem's meetings»).",
    enforced_by: ["POST /api/janna/session (agent bassem) → 503 feature_off", "POST /api/admin/cc/meetings → 503 feature_off", "site"] },
  { key: "janna_welcome", default: true, scope: "client",
    label_ar: "صندوق دعوة جنة", label_en: "Janna's invitation box",
    desc_ar: "الصندوق اللي بيظهر للزائر ومعاه زرار كبير «اتكلم مع جنة». لو قفلته، الصندوق مابيظهرش (المكالمة نفسها بتفضل شغالة من زرارها).",
    desc_en: "The box shown to visitors with the big «talk to Janna» button. Off: the box is not shown (calls still work from their own button).",
    enforced_by: ["site"] },
  { key: "standing_figures", default: true, scope: "client",
    label_ar: "جنة وباسم واقفين على الصفحات", label_en: "Standing Janna & Bassem figures",
    desc_ar: "صورة جنة واقفة على صفحات الموقع وباسم على صفحة المستشار. لو قفلته، الصور بتختفي.",
    desc_en: "Janna's standing figure on the site's pages and Bassem's on the advisor page. Off: the figures are hidden.",
    enforced_by: ["site"] },
  { key: "noise_mode_default", default: false, scope: "client",
    label_ar: "«وضع الدوشة» شغّال من أول المكالمة", label_en: "Noisy-room mode on from the start",
    desc_ar: "لو شغّلته، كل مكالمة مع جنة أو باسم بتبدأ في «وضع الدوشة» (الدوشة اللي حوالين الزائر ماتقطعش كلامهم). مقفول = الزائر بيشغّله بنفسه لما يحتاجه.",
    desc_en: "On: every call with Janna or Bassem starts in noisy-room mode (noise around the visitor does not cut them off). Off: visitors switch it on themselves.",
    enforced_by: ["site"] },
  { key: "call_languages", default: true, scope: "client",
    label_ar: "زرار لغة الكلام 🌐 في مكالمات جنة وباسم", label_en: "The 🌐 speaking-language button in Janna and Bassem calls",
    desc_ar: "الزائر يختار يتكلم بأي لغة. لو قفلته، الزرار والاقتراحات بيختفوا وجنة وباسم بيسمعوا عربي زي الأول (وجنة الإنجليزي إنجليزي)، واللي بيكتب بلغته بيترد عليه بلغته برضه.",
    desc_en: "Visitors choose to speak in any language. Off: the button and the suggestions disappear and Janna and Bassem hear Arabic as before (English Janna: English); someone who types in their own language is still answered in it.",
    enforced_by: ["site"] },
  { key: "intel_pages", default: true, scope: "client",
    label_ar: "صفحات مركز المعلومات (/intel/)", label_en: "Intelligence center pages (/intel/)",
    desc_ar: "روابط صفحات مركز المعلومات (مناقصات ومشاريع وأخبار بتتحدّث تلقائي) من صفحات الموقع ومن شاشة باسم في المكالمة. لو قفلته، الموقع وباسم مابيعرضوش روابطها ولا بيفتحوها. الصفحات نفسها بيخدمها Worker تاني (migate-intel) وبتفضل شغالة زي ما هي لأي حد عنده الرابط أو جاي من البحث — مش بتتقفل من هنا.",
    desc_en: "Links to the intelligence center pages (auto-updated tenders, projects, news) from the site's pages and from Bassem's call screen. Off: the site and Bassem no longer show or open them. The pages themselves are served by another Worker (migate-intel) and stay online as they are for anyone with a link or coming from search — they are not switched off here.",
    enforced_by: ["site"] },
  { key: "registrations", default: true, scope: "both",
    label_ar: "التسجيل الجديد", label_en: "New registrations",
    desc_ar: "حسابات جديدة بكود على الإيميل وطلبات الاشتراك في الباقات. لو قفلته، الأعضاء الحاليين بيدخلوا عادي، وأي حد جديد بتظهرله رسالة إن التسجيل موقوف مؤقتاً. إضافة عضو من لوحة الإدارة بتفضل شغالة.",
    desc_en: "New accounts by e-mail code and plan applications. Off: existing members sign in as usual; anyone new is told registration is paused. Adding a member from the Control Center keeps working.",
    enforced_by: ["POST /api/auth/verify (an e-mail without an account) → 503 feature_off", "POST /api/inquiries (kind signup) → 503 feature_off", "site"] },
  { key: "rfq_autoroute", default: true, scope: "server",
    label_ar: "توزيع الطلبات تلقائياً على المصانع", label_en: "Automatic routing of buyer requests",
    desc_ar: "طلبات الأسعار والسلال بتتبعت تلقائياً للمصانع المسجّلة المطابقة. لو قفلته، كل طلب جديد بيروح للفريق («محتاج تدخل») يوزّعه بنفسه، و«إعادة الإرسال» من لوحة الإدارة بتفضل شغالة.",
    desc_en: "RFQs and baskets go automatically to matching registered factories. Off: every new request goes to the team («needs action») to handle by hand; a manual resend from the admin console still works.",
    enforced_by: ["POST /api/inquiries (routing)", "cron: delivery retries", "re-match when a member joins"] },
  { key: "bassem_morning", default: true, scope: "server",
    label_ar: "رسالة باسم الصباحية", label_en: "Bassem's morning message",
    desc_ar: "رسالة «صباح الخير» اليومية من باسم للأعضاء (واتساب لما يشتغل، وإلا إيميل). لو قفلته، مفيش رسايل صباحية؛ مواعيد «كلّمني الساعة» بتفضل شغالة.",
    desc_en: "Bassem's daily good-morning message to members (WhatsApp once live, otherwise e-mail). Off: no morning messages; «call me at» times keep working.",
    enforced_by: ["cron: Bassem's morning message"] },
  { key: "daily_digest", default: true, scope: "server",
    label_ar: "الملخص اليومي وتذكير المواعيد", label_en: "Daily digest & deadline reminders",
    desc_ar: "إيميل وإشعار الصبح بالجديد اللي يطابق متابعات العضو، وتذكير قبل آخر موعد بـ 7 أيام وبيوم. لو قفلته، مفيش ملخصات ولا تذكيرات.",
    desc_en: "The morning e-mail / notification with new items matching a member's follows, and reminders 7 days and 1 day before a deadline. Off: no digests and no reminders.",
    enforced_by: ["cron: daily digests + deadline reminders"] },
  { key: "whatsapp_send", default: true, scope: "server",
    label_ar: "إرسال واتساب", label_en: "WhatsApp sending",
    desc_ar: "زرار إيقاف إضافي لكل رسايل الواتساب. التشغيل الحقيقي بيتعمل من «مفاتيح الخدمات» (اختبار توكن respond.io ← رسالة تجربة لرقم المنصة ← «تشغيل إرسال واتساب الحقيقي»). لو قفلته هنا، مفيش أي رسالة واتساب بتطلع (ولا حتى رسالة التجربة) والإيميل بيشتغل بداله.",
    desc_en: "An extra OFF for every WhatsApp message. Going live is done in «Service keys» (respond.io token test → test message to the platform's number → «switch real WhatsApp sending on»). Off here: no WhatsApp message leaves (not even the test message); e-mail is used instead.",
    lock_rule_ar: "مقفول لحد ما اختبار توكن respond.io ينجح في «مفاتيح الخدمات»", lock_rule_en: "Locked until the respond.io token test passes in «Service keys»",
    enforced_by: ["every WhatsApp send → dry run", "POST /api/admin/cc/keys/wa-test → 409 feature_off"] },
  { key: "bassem_web_search", default: true, scope: "server",
    label_ar: "بحث باسم على الإنترنت", label_en: "Bassem's web search",
    desc_ar: "باسم بيدوّر على الإنترنت (مش بس في بيانات المنصة) وبيقول إن النتيجة من الإنترنت. محتاج مفتاح بحث و«سر أدوات باسم» في «مفاتيح الخدمات».",
    desc_en: "Bassem searches the web (not only the platform's data) and says the result comes from the web. Needs a web-search key and «Bassem's tool secret» in «Service keys».",
    lock_rule_ar: "مقفول لحد ما يتحط مفتاح بحث الإنترنت في «مفاتيح الخدمات»", lock_rule_en: "Locked until a web-search key is saved in «Service keys»",
    enforced_by: ["POST /api/advisor/web → 503 feature_off"] },
].map(f => Object.freeze({ ...f, ...(f.lock_rule_ar ? { locked: f.lock_rule_ar + " / " + f.lock_rule_en } : {}), enforced_by: Object.freeze([...f.enforced_by]) })));
/* registry shape: {key, label_ar, label_en, desc_ar, desc_en, default, scope: server|client|both, locked?: "<ar> / <en>" (the rule of a row
   that can be locked — whether it is locked NOW is stateOf(), returned by the API as `locked: null | {code, ar, en}`), enforced_by} */
export const FEATURE_KEYS = Object.freeze(FEATURES.map(f => f.key));
const BY = new Map(FEATURES.map(f => [f.key, f]));
export const featureDef = k => (typeof k === "string" && BY.has(k) ? BY.get(k) : null);

/* the two privacy rules (owner decisions 2026-11-19): permanent policy, shown on the panel, never a switch (PUT → 422 code policy) */
export const POLICIES = Object.freeze([
  Object.freeze({ key: "visitor_links_signed_in", permanent: true,
    label_ar: "ربط زائر جنة بحساب عضو بدخول العضو نفسه بس", label_en: "A Janna visitor is linked to a member only by that member's own sign-in",
    desc_ar: "ذاكرة جنة عن زائر بتتربط بحساب عضو بس لما العضو نفسه يكون داخل بحسابه بكود على الإيميل. إيميل أو رقم قاله الزائر لجنة مابيربطش أي حاجة. دي قاعدة خصوصية ثابتة ومش زرار.",
    desc_en: "Janna's memory of a visitor is linked to a member account only when that member is signed in with an e-mail code. An e-mail or number a visitor told Janna never links anything. A permanent privacy rule, not a switch." }),
  Object.freeze({ key: "knowledge_team_approved", permanent: true,
    label_ar: "بنك المعلومات: إجابات الفريق بس", label_en: "Knowledge bank: team-approved answers only",
    desc_ar: "جنة وباسم بيستخدموا من «بنك المعلومات» بس الإجابات اللي الفريق كتبها أو وافق عليها؛ أي حاجة جاية من الزوار مابتوصلش للمساعدين من غير مراجعة إنسان. قاعدة ثابتة ومش زرار.",
    desc_en: "Janna and Bassem use only the knowledge-bank answers the team wrote or approved; nothing reported by visitors reaches the assistants without a person's review. A permanent rule, not a switch." }),
]);
const POLICY_KEYS = new Set(POLICIES.map(p => p.key));
export const isPolicy = k => POLICY_KEYS.has(k);

/* the public «feature_off» answer text of a switched-off feature */
export function offMessage(key) {
  if (key === "registrations") return "التسجيل الجديد موقوف مؤقتاً — جرّب تاني بعد شوية / New registrations are paused for now — please try again later";
  const d = featureDef(key);
  return d ? `${d.label_ar}: موقوفة مؤقتاً / ${d.label_en}: paused for now` : "الخدمة دي موقوفة مؤقتاً / this service is paused for now";
}

/* ---------- the stored value ---------- */
/* cc_settings.v → {values, changed}: only known keys, only booleans; the plain form {key: bool} is read too */
export function parseStore(s) {
  let o = null; try { o = JSON.parse(String(s == null ? "" : s)); } catch (e) { o = null; }
  const values = {}, changed = {};
  if (!o || typeof o !== "object" || Array.isArray(o)) return { values, changed };
  const src = o.values && typeof o.values === "object" && !Array.isArray(o.values) ? o.values : o;
  for (const k of FEATURE_KEYS) if (typeof src[k] === "boolean") values[k] = src[k];
  const ch = o.changed && typeof o.changed === "object" && !Array.isArray(o.changed) ? o.changed : {};
  for (const k of FEATURE_KEYS) { const c = ch[k]; if (c && typeof c === "object") changed[k] = { at: String(c.at || "").slice(0, 40), by: String(c.by || "").slice(0, 254) }; }
  return { values, changed };
}
export const storeJson = (values, changed) => {
  const v = {}, c = {};
  for (const k of FEATURE_KEYS) { if (typeof values[k] === "boolean") v[k] = values[k]; if (changed && changed[k]) c[k] = { at: String(changed[k].at || ""), by: String(changed[k].by || "") }; }
  return JSON.stringify({ v: 1, values: v, changed: c });
};

const EMPTY = Object.freeze({ loaded: false, values: Object.freeze({}), changed: Object.freeze({}), updated_at: "", updated_by: "" });
const MEMO = new WeakMap(); // env.DB → {at, v}
const dbOf = env => (env && env.DB && typeof env.DB.prepare === "function" ? env.DB : null);
const noTable = e => /no such table/i.test(String((e && e.message) || e));
async function readStore(db) {
  // scope 'system' only: a 'custom' row of the same name (acc-plans.js reserves the name now) never counts
  const r = await db.prepare("SELECT v, updated_at, updated_by FROM cc_settings WHERE k = ? AND scope = 'system'").bind(FEATURES_KEY).first();
  if (!r) return { ...EMPTY, loaded: true };
  const p = parseStore(r.v);
  return { loaded: true, values: Object.freeze(p.values), changed: Object.freeze(p.changed), updated_at: String(r.updated_at || ""), updated_by: String(r.updated_by || "") };
}
/* → the view (never throws); memo 30 s per database; `fresh` re-reads (after a write, the crons' and WhatsApp's last checks) */
export async function loadFeatures(env, { fresh = false } = {}) {
  const db = dbOf(env); if (!db) return EMPTY;
  const hit = MEMO.get(db);
  if (!fresh && hit && Date.now() - hit.at < FLAGS_MEMO_MS) return hit.v;
  try { const v = Object.freeze(await readStore(db)); MEMO.set(db, { at: Date.now(), v }); return v; }
  catch (e) {
    if (noTable(e)) { const v = Object.freeze({ ...EMPTY, loaded: true }); MEMO.set(db, { at: Date.now(), v }); return v; } // no 0006 tables: the defaults
    return hit ? hit.v : EMPTY; // a read error: the last good view (not refreshed: the next call tries again), else the defaults
  }
}
export const forgetFeatures = env => { const db = dbOf(env); if (db) MEMO.delete(db); };
/* the owner's choice of one feature in a view: the stored value, else the default (an unknown key → false) */
export function valueOf(view, key) {
  const d = featureDef(key); if (!d) return false;
  const v = view && view.values ? view.values[key] : undefined;
  return typeof v === "boolean" ? v : d.default;
}
export async function featureOn(env, key, opts) {
  const d = featureDef(key); if (!d) return false;
  try { return valueOf(await loadFeatures(env, opts), key); } catch (e) { return d.default; }
}
/* sync — from the last loaded view (EMPTY = the defaults before ccBoot loaded it for this database) */
export function featureSync(env, key) {
  const db = dbOf(env), hit = db && MEMO.get(db);
  return valueOf(hit ? hit.v : EMPTY, key);
}

/* ---------- locks & what a row still waits for (the panel and the PUT guard; enforcement of the keys stays where it was) ---------- */
const NONE = Object.freeze({ locked: null, needs: null, ready: true });
const dryEnvOn = env => { const v = String(env && env.WA_DRY_RUN != null ? env.WA_DRY_RUN : "").trim(); return v !== "" && v !== "0"; };
/* → {locked: null | {code, ar, en}, needs: null | {code, ar, en}, ready} — never throws, never returns a value of a key */
export async function stateOf(env, d) {
  try {
    if (d.key === "whatsapp_send") {
      const v = await loadServiceKeys(env);
      if (!respondioToken(env)) return { locked: T("no_token", "مقفول: مفيش توكن respond.io لسه — حطّه واختبره في «مفاتيح الخدمات»", "Locked: no respond.io token yet — save and test it in «Service keys»"), needs: null, ready: false };
      if (dryEnvOn(env)) return { locked: T("dry_run_env", "مقفول من إعدادات الـ Worker (WA_DRY_RUN = 1) — محتاج نشر جديد بـ 0", "Locked by the Worker setting WA_DRY_RUN = 1 — a new deploy with 0 is needed"), needs: null, ready: false };
      if (!v.wa_test_ok_at) return { locked: T("token_test_required", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
      if (!v.wa_live) return { locked: null, needs: T("switch_off", "مستني زرار «تشغيل إرسال واتساب الحقيقي» في «مفاتيح الخدمات» (بعد رسالة التجربة)", "Waiting for «switch real WhatsApp sending on» in «Service keys» (after the test message)"), ready: false };
      return NONE;
    }
    if (d.key === "bassem_web_search") {
      const c = await webSearchConfig(env);
      if (!c.key) return { locked: c.reason === "key_unreadable" ? T("key_unreadable", "مقفول: مفتاح بحث الإنترنت المحفوظ مش مقروء — دخّله تاني في «مفاتيح الخدمات»", "Locked: the saved web-search key cannot be read — enter it again in «Service keys»") : T("no_key", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
      if (!c.tool_secret) return { locked: T("no_tool_secret", "مقفول لحد ما يتحط «سر أدوات باسم» في «مفاتيح الخدمات»", "Locked until «Bassem's tool secret» is saved in «Service keys»"), needs: null, ready: false };
      if (!c.provider) return { locked: null, needs: T("no_provider", "اختار مزود البحث (Tavily / Serper / Brave) في «مفاتيح الخدمات»", "Choose the search provider (Tavily / Serper / Brave) in «Service keys»"), ready: false };
      if (c.cap <= 0) return { locked: null, needs: T("cap_zero", "الحد اليومي للبحث = 0 في «مفاتيح الخدمات»", "The daily search cap is 0 in «Service keys»"), ready: false };
      return NONE;
    }
  } catch (e) { return { locked: T("state_unknown", "مش قادرين نتأكد من المفاتيح دلوقتي", "The keys cannot be checked right now"), needs: null, ready: false }; }
  return NONE;
}

/* ---------- the views ---------- */
/* the panel (owner): every row with its value, effective state, lock and what it waits for */
export async function featuresView(env, { fresh = true } = {}) {
  const view = await loadFeatures(env, { fresh });
  const features = [];
  for (const d of FEATURES) {
    const st = await stateOf(env, d), value = valueOf(view, d.key), ch = view.changed[d.key] || null;
    features.push({ key: d.key, label_ar: d.label_ar, label_en: d.label_en, desc_ar: d.desc_ar, desc_en: d.desc_en, default: d.default, scope: d.scope,
      value, overridden: typeof view.values[d.key] === "boolean", effective: !!(value && !st.locked && st.ready), locked: st.locked, needs: value && !st.locked ? st.needs : null,
      ...(d.lock_rule_ar ? { lock_rule_ar: d.lock_rule_ar, lock_rule_en: d.lock_rule_en } : {}),
      enforced_by: [...d.enforced_by], updated_at: ch ? ch.at : "", updated_by: ch ? ch.by : "" });
  }
  return { features, policies: POLICIES.map(p => ({ ...p })), updated_at: view.updated_at, updated_by: view.updated_by, public: { path: "/api/settings", field: "features" } };
}
/* the site (GET /api/settings): scope client | both, effective values only — no server row, no lock text, no key state */
export async function publicFeatures(env) {
  const view = await loadFeatures(env), features = {};
  for (const d of FEATURES) {
    if (d.scope === "server") continue;
    const st = await stateOf(env, d);
    features[d.key] = !!(valueOf(view, d.key) && !st.locked && st.ready);
  }
  return { features, features_v: view.updated_at || "" };
}
