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
     bassem_web_search         websearch.js      POST /api/advisor/web → feature_off (200, the model hears the text)
                               web-hunt.js       POST /api/advisor/hunt → feature_off (200)
     janna_web_search          websearch.js      POST /api/janna/web → feature_off (200)
                               web-hunt.js       POST /api/janna/hunt → feature_off (200)
     web_leads                 web-leads.js      the web results Janna / Bassem find are kept for the data desk (off → nothing stored;
                                                 locked until migration 0012)
     web_leads_public          web-public.js     GET /api/janna/opportunities → {off: true} (the page «فرص السوق» says it is not available;
                                                 data/flags.js hides its menu link); locked until migration 0012
     web_leads_lookup          index.js          janna_lookup says no published opportunity (the platform's own results only); locked until 0012
     chat_photos               chat-media.js     POST /api/janna/media/look, /api/janna/media/ticket, /api/advisor/media/look → 503
                                                 feature_off; janna-session.js gives Janna's call no photo ticket (OFF by default; LOCKED
                                                 while the Worker has no AI binding: featureOn ignores locks, so the endpoints check env.AI too)
     calls_report              calls-report.js   the daily calls report e-mail (platform cron) is skipped before any Anam / D1 read;
                                                 POST /api/admin/cc/dev/calls-report/send (+ /preview) → 503 feature_off
   The platform's own apps (user agent «MIGApp/<v> (ios|android)», app-ua.js; app parity plan 2026-11-20 — the defaults keep the apps
   exactly like the website, the texts of the OFF rows wait for the owner's approval: docs/app/OWNER-APPROVAL-AR.md):
     app_buy_ios / app_buy_android  payments.js + acc-me.js  POST /api/pay/checkout, POST /api/me/invoices from THAT app → 403 app_buy_off
                               janna-session.js  a session asked from THAT app gets a fixed «no prices» line (data/flags.js hides the UI)
     account_delete            delete-requests.js GET|POST /api/me/delete-request → 503 feature_off (locked until migration 0010)
     visitor_erase_request     delete-requests.js POST /api/janna/memory/erase-request → 503 feature_off (locked until migration 0010)
     store_review_signin       review-signin.js  POST /api/auth/request + /verify: the ONE review address with the owner's code (locked
                                                 until that address + code are saved and unexpired: acc-dev.js /dev/review)
     call_consent_app / _web   janna-session.js  POST /api/janna/session without consent: true from the app / a browser → 400 consent_required
     app_janna_autovoice       (site only)       data/janna-welcome.js: Janna's voice waits for a tap in the app unless this is on
   Rows are LOCKED (effective off, cannot be switched ON from here; OFF is always allowed) while what they need is missing: whatsapp_send
   until the respond.io token test passed; bassem_web_search / janna_web_search until a web-search key + their tool secret exist (both in
   «مفاتيح الخدمات»); web_leads, web_leads_public, web_leads_lookup, account_delete, visitor_erase_request until their migration is applied. chat_photos while the Worker has no AI binding (env.AI).
   calls_report until an e-mail route («البريد») and a report recipient exist.
   The two privacy rules are PERMANENT POLICY (POLICIES): shown, never switches.
   Reader: loadFeatures(env) — ≤ 1 D1 read per isolate per 30 s (memo per env.DB; acc.js ccBoot warms it at the start of every request /
   cron run), featureOn(env, key) async, featureSync(env, key) from the memo (the default before the first load). No 0006 tables → the
   defaults; any other read error → the last good view, else the defaults (a D1 hiccup never switches the platform off).
   Leaf module: imports service-keys.js and email-center.js only (inquiries.js, whatsapp.js, auth.js, janna-session.js, websearch.js, web-hunt.js,
   web-leads.js, digest.js, bassem-meetings.js, calls-report.js import it). It reads the «🔗 وصّل البحث بجنة وباسم» state itself (cc_settings
   websearch.connect — nit 2: never through acc-wsconnect.js, which imports this file). */
import { loadServiceKeys, respondioToken, webSearchConfig } from "./service-keys.js";
import { mailReady } from "./email-center.js"; // calls_report's lock: an e-mail route exists (imports crypto.js only — no cycle)

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
  { key: "call_holo", default: true, scope: "client",
    label_ar: "كروت البحث على فيديو مكالمات جنة وباسم", label_en: "Search cards on the Janna and Bassem call video",
    desc_ar: "وجنة أو باسم بيدوّروا (مناقصات، طلبات أسعار، مصانع، فرص برّه مصر) بيظهر على الفيديو نفسه حوالين الوش اللي بيدوّروا عليه واللي لقوه، كروت صغيرة لو دوست عليها بتفتح على الشاشة. لو قفلته، الكروت مابتظهرش والنتايج بتفضل على الشاشة زي الأول.",
    desc_en: "While Janna or Bassem searches (tenders, RFQs, factories, opportunities abroad), small cards on the video itself, around the face, show what is searched for and what was found; a tap opens it on the shared screen. Off: no cards; the results stay on the shared screen as before.",
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
  { key: "calls_report", default: true, scope: "server",
    label_ar: "تقرير مكالمات جنة وباسم اليومي (إيميل)", label_en: "Daily Janna & Bassem calls report (e-mail)",
    desc_ar: "كل يوم الصبح في الميعاد اللي بتحدده (الافتراضي ٨:٣٠ بتوقيت القاهرة) بيوصل لمستلمي التقرير إيميل بمكالمات جنة وباسم في اليوم اللي فات: مين كلّم، سأل عن إيه، اتقاله إيه، الأدوات رجّعت إيه، النتيجة، وتقييم تلقائي لكل مكالمة. لو قفلته، مفيش تقرير ولا أي قراية من Anam علشانه.",
    desc_en: "Every morning at the time you set (default 08:30 Cairo time) the report recipients get an e-mail with yesterday's Janna and Bassem calls: who talked, what they asked, what they were told, what the tools returned, the outcome and an automatic rating of each call. Off: no report and no Anam reads for it.",
    lock_rule_ar: "مقفول لحد ما يبقى فيه طريقة إرسال إيميل في «البريد» ومستلم للتقرير في «المطوّر» ← «تقرير المكالمات»", lock_rule_en: "Locked until «E-mail» has a way to send and the report has a recipient («Developer» → «Calls report»)",
    enforced_by: ["cron: calls report", "POST /api/admin/cc/dev/calls-report/send → 503 feature_off"] },
  { key: "whatsapp_send", default: true, scope: "server",
    label_ar: "إرسال واتساب", label_en: "WhatsApp sending",
    desc_ar: "زرار إيقاف إضافي لكل رسايل الواتساب. التشغيل الحقيقي بيتعمل من «مفاتيح الخدمات» (اختبار توكن respond.io ← رسالة تجربة لرقم المنصة ← «تشغيل إرسال واتساب الحقيقي»). لو قفلته هنا، مفيش أي رسالة واتساب بتطلع (ولا حتى رسالة التجربة) والإيميل بيشتغل بداله.",
    desc_en: "An extra OFF for every WhatsApp message. Going live is done in «Service keys» (respond.io token test → test message to the platform's number → «switch real WhatsApp sending on»). Off here: no WhatsApp message leaves (not even the test message); e-mail is used instead.",
    lock_rule_ar: "مقفول لحد ما اختبار توكن respond.io ينجح في «مفاتيح الخدمات»", lock_rule_en: "Locked until the respond.io token test passes in «Service keys»",
    enforced_by: ["every WhatsApp send → dry run", "POST /api/admin/cc/keys/wa-test → 409 feature_off"] },
  { key: "bassem_web_search", default: true, scope: "server",
    label_ar: "بحث باسم على الإنترنت والبحث عن فرص", label_en: "Bassem's web search and opportunity hunt",
    desc_ar: "باسم بيدوّر على الإنترنت (مش بس في بيانات المنصة) — ولعضوه البايع على مناقصات وطلبات أسعار وعملاء ومشاريع جديدة لمنتجه — وبيقول المعلومة نفسها وخلاص: عمره ما يقول اسم موقع ولا لينك ولا مصدر ولا إنها من الإنترنت، والمصدر بيتحفظ لفريق المنصة بس (مكتب البيانات). محتاج مفتاح بحث و«سر أدوات باسم» في «مفاتيح الخدمات» ودوسة «🔗 وصّل البحث بجنة وباسم».",
    desc_en: "Bassem searches the web (not only the platform's data) — and, for a member who sells, hunts for tenders, RFQs, buyers and new projects for the product — and says the information itself: never a site, a link, a source or that it comes from the web; the source is kept for the platform team only (the data desk). Needs a web-search key and «Bassem's tool secret» in «Service keys» and a press on «🔗 Connect web search to Janna and Bassem».",
    lock_rule_ar: "مقفول لحد ما يتحط مفتاح بحث الإنترنت في «مفاتيح الخدمات»", lock_rule_en: "Locked until a web-search key is saved in «Service keys»",
    enforced_by: ["POST /api/advisor/web → feature_off (200)", "POST /api/advisor/hunt → feature_off (200)"] },
  /* 📎 photos in the chats of Janna and Bassem (owner 2026-11-20: «مفيش في شاشه الشات بتاعت جنة او باسم مكان العميل يحطلهم في صوره»).
     Phase 1A + 1A+: the photo is read once by Workers AI and never stored; the texts behind the switch wait for the owner's word-for-word
     approval (docs/app/OWNER-APPROVAL-AR.md §8). Locked until the Worker is deployed with its [ai] binding (worker/wrangler.toml). */
  { key: "chat_photos", default: false, scope: "both",
    label_ar: "صور في مكالمات جنة وباسم و«اكتبلي» (📎)", label_en: "Photos in Janna and Bassem calls and «Write to me» (📎)",
    desc_ar: "زرار 📎 في خانة الكتابة في مكالمة جنة أو باسم وفي فقاعة «اكتبلي»: الزائر أو العضو يصوّر أو يختار صورة، والمنصة بتقراها بالذكاء الاصطناعي (Cloudflare Workers AI) وبتقول لجنة أو باسم وصفها علشان يدوّروا عليها قدامه. جنة وباسم مش بيشوفوا الصورة نفسها، والصورة مابتتحفظش — وصفها المكتوب بيبقى جزء من كلام المكالمة وذاكرتها. شغّله بعد ما توافق على النصوص (docs/app/OWNER-APPROVAL-AR.md القسم 8) وتجرّب «🔎 تجربة قراءة صورة».",
    desc_en: "The 📎 button in the text box of Janna's and Bassem's calls and in the «Write to me» bubble: a visitor or member takes or picks a photo; the platform reads it with AI (Cloudflare Workers AI) and tells Janna or Bassem what it shows so they search for it on screen. Janna and Bassem do not see the photo itself, and it is not stored — its written description becomes part of the call and its memory. Switch it on after you approve the texts (docs/app/OWNER-APPROVAL-AR.md section 8) and try «🔎 Test a photo reading».",
    lock_rule_ar: "مقفول لحد ما الـ Worker يتنشر بربط الذكاء الاصطناعي (AI)", lock_rule_en: "Locked until the Worker is deployed with its AI binding",
    enforced_by: ["POST /api/janna/media/look, /api/janna/media/ticket, /api/advisor/media/look → 503 feature_off", "POST /api/janna/session (agent janna): no media_ticket", "site"] },
  { key: "janna_web_search", default: true, scope: "server",
    label_ar: "بحث جنة على الإنترنت والبحث عن فرص", label_en: "Janna's web search and opportunity hunt",
    desc_ar: "جنة بتدوّر على الإنترنت لأي زائر (مسجّل أو لأ) على مناقصات وطلبات أسعار وعملاء ومشاريع جديدة لمنتجه لما بيانات المنصة مش كفاية، وبتقول المعلومة نفسها وخلاص: عمرها ما تقول اسم موقع ولا لينك ولا مصدر ولا إنها من الإنترنت، والمصدر بيتحفظ لفريق المنصة بس. بتاخد من الحد اليومي لبحث الإنترنت لحد «حد جنة» بس، علشان أعضاء باسم مايتأثروش. محتاجة مفتاح بحث في «مفاتيح الخدمات» ودوسة «🔗 وصّل البحث بجنة وباسم» (بتعمل «سر أدوات جنة»).",
    desc_en: "Janna searches the web for any visitor (registered or not) for tenders, RFQs, buyers and new projects for their product when the platform's data is not enough, and says the information itself: never a site, a link, a source or that it comes from the web; the source is kept for the platform team only. She uses the daily web-search cap only up to «Janna's share», so Bassem's members are never affected. Needs a search key in «Service keys» and a press on «🔗 Connect web search to Janna and Bassem» (it makes «Janna's tool secret»).",
    lock_rule_ar: "مقفول لحد ما يتحط مفتاح بحث الإنترنت في «مفاتيح الخدمات»", lock_rule_en: "Locked until a web-search key is saved in «Service keys»",
    enforced_by: ["POST /api/janna/web → feature_off (200)", "POST /api/janna/hunt → feature_off (200)"] },
  { key: "web_leads", default: true, scope: "server",
    label_ar: "حفظ نتايج الإنترنت لمكتب البيانات", label_en: "Keep web results for the data desk",
    desc_ar: "الفرص اللي جنة وباسم بيلاقوها على الإنترنت (الرابط والعنوان والموقع ونبذة قصيرة، من غير تليفونات ولا إيميلات) بتتحفظ في «🌐 فرص من الإنترنت» على مكتب البيانات — المصدر واللينك للفريق بس. الفرصة نفسها (من غير مصدر) بتتنشر على طول في «فرص السوق» وبتقولها جنة وباسم لو المفتاحين اللي تحت شغّالين، والفريق بيشيل الغلط بدوسة. لو شروط مزود البحث بتاعك مابتسمحش بحفظ النتايج، اقفله (ولو مابتسمحش بعرضها، اقفل المفتاحين اللي تحت): البحث نفسه بيفضل شغّال.",
    desc_en: "The opportunities Janna and Bassem find on the web (link, title, site and a short snippet, without phone numbers or e-mails) are kept in «🌐 Web leads» on the data desk — the source and the link are for the team only. The opportunity itself (without any source) is published at once on «Market opportunities» and said by Janna and Bassem while the two switches below are on, and the team removes anything wrong with one press. If your search provider's terms do not allow keeping results, switch it off (if they do not allow showing them, switch the two below off): the search itself keeps working.",
    lock_rule_ar: "مقفول لحد ما ملف قاعدة البيانات 0012_web_leads.sql يتشغّل (GitHub ← Actions ← d1-migrate)", lock_rule_en: "Locked until the database file 0012_web_leads.sql is applied (GitHub → Actions → d1-migrate)",
    enforced_by: ["web results are stored for the data desk (web-leads.js)", "GET|PUT /api/team/desk/leads"] },
  /* «فرص السوق» (owner 2026-11-20: web data «تظهر علطول», no review; «ميكتبش مصدر اي معلومه», «ميقولوش حاجه ولا من بره بيانات المنصه
     ولاغيره هما يقولوا المعلومه وخلاص»): the web leads published on the platform (web-public.js) — the opportunity itself, never its source.
     ON by default (the owner's decision), locked until migration 0012 like web_leads; the team hides a wrong one on the data desk. */
  { key: "web_leads_public", default: true, scope: "both",
    label_ar: "صفحة «فرص السوق» على المنصة", label_en: "The «Market opportunities» page on the platform",
    desc_ar: "الفرص اللي جنة وباسم بيلاقوها على الإنترنت (مناقصات وطلبات أسعار وعملاء محتملين ومشاريع جديدة وأخبار) بتتنشر على طول، من غير مراجعة، في صفحة «فرص السوق» (/market-opportunities/) ولينكها في القايمة: الفرصة نفسها بس — نوعها وعنوان قصير والجهة أو الشركة والمنتج والسوق وحالتها وتاريخ ما المنصة لقيتها — من غير أي مصدر ولا لينك ولا تليفون ولا إيميل. المناقصة اللي ميعادها عدّى بتظهر «منتهية»، واللي ميعادها مش معروف بيتقال كده. فريق البيانات بيشيل أي فرصة غلط بدوسة «🙈 إخفاء من المنصة» في مكتب البيانات. لو قفلته، الصفحة ولينكها بيختفوا.",
    desc_en: "The opportunities Janna and Bassem find on the web (tenders, RFQs, potential buyers, new projects, news) are published at once, without a review, on the «Market opportunities» page (/market-opportunities/) and its menu link: the opportunity itself only — its type, a short title, the entity or company, the product, the market, its status and the day the platform found it — with no source, link, phone number or e-mail. A tender whose deadline passed shows as «closed»; an unknown deadline is said as such. The data team removes any wrong opportunity with «🙈 Hide from the platform» on the data desk. Off: the page and its link disappear.",
    lock_rule_ar: "مقفول لحد ما ملف قاعدة البيانات 0012_web_leads.sql يتشغّل (GitHub ← Actions ← d1-migrate)", lock_rule_en: "Locked until the database file 0012_web_leads.sql is applied (GitHub → Actions → d1-migrate)",
    enforced_by: ["GET /api/janna/opportunities → off (web-public.js)", "site"] },
  { key: "web_leads_lookup", default: true, scope: "server",
    label_ar: "جنة وباسم بيقولوا «فرص السوق»", label_en: "Janna and Bassem say the «Market opportunities»",
    desc_ar: "لما جنة أو باسم بيدوّروا في المنصة على مناقصات أو طلبات أسعار أو عملاء أو مشاريع أو أخبار، بيقولوا كمان فرص «فرص السوق» المنشورة اللي تطابق الكلام — بعد نتايج المنصة نفسها وبعددها لوحدها (أعداد المنصة ماتكبرش بيها) — كمعلومة وبس، من غير أي مصدر، ومن غير ما يقولوا إنها من بيانات المنصة أو إن الشركة مسجّلة. اللي اتخفت من مكتب البيانات مابتتقالش (خلال 10 دقايق). لو قفلته، بيقولوا نتايج المنصة بس.",
    desc_en: "When Janna or Bassem search the platform for tenders, RFQs, customers, projects or news, they also say the published «Market opportunities» that match — after the platform's own results and counted apart (the platform's counts never grow with them) — as information only, with no source, and without saying they come from the platform's data or that the company is registered. What the data desk hides is no longer said (within 10 minutes). Off: they say the platform's results only.",
    lock_rule_ar: "مقفول لحد ما ملف قاعدة البيانات 0012_web_leads.sql يتشغّل (GitHub ← Actions ← d1-migrate)", lock_rule_en: "Locked until the database file 0012_web_leads.sql is applied (GitHub → Actions → d1-migrate)",
    enforced_by: ["POST /api/janna/lookup (sections tenders, rfqs, customers, projects, news): the published opportunities after the platform's results (index.js)"] },
  /* ---- the platform's own apps (app/: Android + iPhone, user agent «MIGApp/<v> (ios|android)», app-ua.js) and the store rules (app parity
     plan 2026-11-20). The defaults keep the apps EXACTLY like the website; the texts behind the rows that ship OFF wait for the owner's
     word-for-word approval (docs/app/OWNER-APPROVAL-AR.md). ---- */
  { key: "app_buy_ios", default: true, scope: "both",
    label_ar: "الأسعار والدفع جوه تطبيق الآيفون", label_en: "Prices and payment inside the iPhone app",
    desc_ar: "شغّالة = تطبيق الآيفون زي الموقع بالظبط: الباقات وأسعارها و«ادفع الآن» والتجديد والترقية. لو قفلتها (مراجعة App Store، قاعدة Apple 3.1.1)، كل ده بيختفي جوه تطبيق الآيفون بس — الموقع وتطبيق الأندرويد زي ما هم — وجنة ماتتكلمش في أسعار جوه التطبيق، والسيرفر بيرفض أي دفع جاي من التطبيق. التسجيل بيفضل شغّال، والفريق بيتابع الباقة مع العضو.",
    desc_en: "On = the iPhone app is exactly like the website: plans and prices, «Pay now», renewal and upgrade. Off (App Store review, Apple rule 3.1.1): all of it disappears inside the iPhone app only — the website and the Android app stay as they are — Janna talks about no prices in the app, and the server refuses any payment coming from the app. Registration keeps working, and the team settles the plan with the member.",
    enforced_by: ["POST /api/me/invoices, POST /api/pay/checkout from the iPhone app → 403 app_buy_off", "POST /api/janna/session from the iPhone app → a «no prices» line", "site"] },
  { key: "app_buy_android", default: true, scope: "both",
    label_ar: "الأسعار والدفع جوه تطبيق الأندرويد", label_en: "Prices and payment inside the Android app",
    desc_ar: "شغّالة = تطبيق الأندرويد زي الموقع بالظبط: الباقات وأسعارها و«ادفع الآن» والتجديد والترقية. لو قفلتها (سياسة الدفع في Google Play)، كل ده بيختفي جوه تطبيق الأندرويد بس — الموقع وتطبيق الآيفون زي ما هم — وجنة ماتتكلمش في أسعار جوه التطبيق، والسيرفر بيرفض أي دفع جاي من التطبيق. التسجيل بيفضل شغّال، والفريق بيتابع الباقة مع العضو.",
    desc_en: "On = the Android app is exactly like the website: plans and prices, «Pay now», renewal and upgrade. Off (Google Play payments policy): all of it disappears inside the Android app only — the website and the iPhone app stay as they are — Janna talks about no prices in the app, and the server refuses any payment coming from the app. Registration keeps working, and the team settles the plan with the member.",
    enforced_by: ["POST /api/me/invoices, POST /api/pay/checkout from the Android app → 403 app_buy_off", "POST /api/janna/session from the Android app → a «no prices» line", "site"] },
  { key: "account_delete", default: false, scope: "both",
    label_ar: "طلب حذف الحساب", label_en: "Account deletion requests",
    desc_ar: "زرار «🗑 طلب حذف الحساب» في لوحة العضو وصفحة /delete-account/ (رابط Google Play). الطلب نفسه مابيمسحش أي حاجة: بيوصلك في «الأعضاء والاشتراكات» ← «طلبات حذف الحساب»، وإنت بتنفّذ الحذف المسجّل خلال 30 يوم. شغّله بعد ما توافق على النصوص (docs/app/OWNER-APPROVAL-AR.md).",
    desc_en: "The «🗑 Request account deletion» button in the member dashboard and the /delete-account/ page (Google Play's link). The request deletes nothing by itself: it reaches you in «Members & subscriptions» → «Account deletion requests», and you run the audited deletion within 30 days. Switch it on after you approve the texts (docs/app/OWNER-APPROVAL-AR.md).",
    lock_rule_ar: "مقفول لحد ما ملف قاعدة البيانات 0010_delete_requests.sql يتشغّل (GitHub ← Actions ← d1-migrate)", lock_rule_en: "Locked until the database file 0010_delete_requests.sql is applied (GitHub → Actions → d1-migrate)",
    enforced_by: ["GET|POST /api/me/delete-request → 503 feature_off", "site"] },
  { key: "visitor_erase_request", default: false, scope: "both",
    label_ar: "طلب مسح كلام الزائر مع جنة", label_en: "Visitor requests to erase their Janna conversations",
    desc_ar: "استثناء من قاعدة «ذاكرة جنة دايمة» (قرارك): زائر من غير حساب يقدر يطلب من صفحة /delete-account/ مسح كلامه مع جنة على الجهاز ده. الطلب بيسجّل رقم الزائر العشوائي بس، ومابيمسحش حاجة لوحده: إنت بتنفّذ المسح المسجّل من «ذاكرة جنة وباسم».",
    desc_en: "An exception to the «Janna's memory is permanent» rule (your decision): a visitor without an account can ask on the /delete-account/ page to erase their conversations with Janna on this device. The request records only the random visitor id and deletes nothing by itself: you run the audited erasure from «Janna & Bassem memory».",
    lock_rule_ar: "مقفول لحد ما ملف قاعدة البيانات 0010_delete_requests.sql يتشغّل (GitHub ← Actions ← d1-migrate)", lock_rule_en: "Locked until the database file 0010_delete_requests.sql is applied (GitHub → Actions → d1-migrate)",
    enforced_by: ["POST /api/janna/memory/erase-request → 503 feature_off", "site"] },
  { key: "store_review_signin", default: false, scope: "server",
    label_ar: "دخول مراجعي المتاجر", label_en: "App-store reviewer sign-in",
    desc_ar: "علشان مراجع App Store أو Google Play يدخل بحساب عضو من غير كود على الإيميل: إيميل واحد وكود ثابت من 6 أرقام بتحطهم تحت، صالحين 30 يوم بالكتير. كل دخول بيتسجّل في السجل. فعّل باقة حقيقية على الحساب ده وقت المراجعة، واقفل المفتاح بعد الموافقة.",
    desc_en: "So an App Store or Google Play reviewer can sign in to a member account without an e-mailed code: one address and a fixed 6-digit code you set below, valid 30 days at most. Every sign-in is logged. Activate a real plan on that account for the review, and switch this off after the approval.",
    lock_rule_ar: "مقفول لحد ما تحفظ إيميل المراجعة والكود (تحت) وتاريخ انتهائهم لسه ماجاش", lock_rule_en: "Locked until you save the review address and code (below) and they have not expired",
    enforced_by: ["POST /api/auth/request + /verify for that address with that code → a normal session, audited review.signin"] },
  { key: "call_consent_app", default: false, scope: "both",
    label_ar: "موافقة قبل مكالمة الذكاء الاصطناعي — جوه التطبيق", label_en: "Consent before the AI call — inside the app",
    desc_ar: "قبل أول مكالمة مع جنة أو باسم جوه التطبيق بتظهر رسالة إن المكالمة مع مساعد بالذكاء الاصطناعي وإن الصوت بيروح لمزوّد المحادثة المرئية (Anam)، والعضو بيوافق (قاعدة Apple 5.1.2). شغّله بعد ما توافق على نص الرسالة (docs/app/OWNER-APPROVAL-AR.md). السيرفر بيرفض أي مكالمة من التطبيق من غير الموافقة.",
    desc_en: "Before the first call with Janna or Bassem inside the app, a message says the call is with an AI assistant and the voice goes to the video-chat provider (Anam), and the member agrees (Apple rule 5.1.2). Switch it on after you approve the message (docs/app/OWNER-APPROVAL-AR.md). The server refuses any call from the app without that consent.",
    enforced_by: ["POST /api/janna/session from the app without consent → 400 consent_required", "site"] },
  { key: "call_consent_web", default: false, scope: "both",
    label_ar: "موافقة قبل مكالمة الذكاء الاصطناعي — على الموقع", label_en: "Consent before the AI call — on the website",
    desc_ar: "نفس رسالة الموافقة قبل أول مكالمة مع جنة أو باسم، على الموقع في المتصفح (قانون حماية البيانات 151 لسنة 2020). شغّله بعد ما توافق على النص. السيرفر بيرفض أي مكالمة من الموقع من غير الموافقة.",
    desc_en: "The same consent message before the first call with Janna or Bassem, on the website in a browser (Egypt's data protection law 151/2020). Switch it on after you approve the text. The server refuses any call from the website without that consent.",
    enforced_by: ["POST /api/janna/session from a browser without consent → 400 consent_required", "site"] },
  { key: "app_janna_autovoice", default: false, scope: "client",
    label_ar: "جنة بتتكلم لوحدها أول ما التطبيق يفتح", label_en: "Janna speaks by herself when the app opens",
    desc_ar: "مقفولة = زي المتصفحات على الموبايل بالظبط: صندوق جنة بيقول «🔊 اسمع صوتي» وصوتها بيبدأ أول ما الزائر يلمس الشاشة. شغّالة = جنة بتتكلم بصوت عالي لوحدها مع كل فتحة للتطبيق (والآيفون ممكن يشغّل صوتها حتى وهو على الصامت).",
    desc_en: "Off = exactly like phone browsers: Janna's box says «🔊 Hear my voice» and her voice starts at the visitor's first tap. On = Janna speaks aloud by herself every time the app opens (an iPhone may play it even on silent).",
    enforced_by: ["site"] },
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
    if (d.key === "bassem_web_search" || d.key === "janna_web_search") {
      const c = await webSearchConfig(env), J = d.key === "janna_web_search";
      if (!c.key) return { locked: c.reason === "key_unreadable" || c.janna_reason === "key_unreadable" ? T("key_unreadable", "مقفول: مفتاح بحث الإنترنت المحفوظ مش مقروء — دخّله تاني في «مفاتيح الخدمات»", "Locked: the saved web-search key cannot be read — enter it again in «Service keys»") : T("no_key", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
      if (!(J ? c.janna_secret : c.tool_secret)) return { locked: J ? T("no_tool_secret", "مقفول لحد ما تدوس «🔗 وصّل البحث بجنة وباسم» في «مفاتيح الخدمات» (بيعمل «سر أدوات جنة»)", "Locked until «🔗 Connect web search to Janna and Bassem» is pressed in «Service keys» (it makes «Janna's tool secret»)")
        : T("no_tool_secret", "مقفول لحد ما يتحط «سر أدوات باسم» في «مفاتيح الخدمات»", "Locked until «Bassem's tool secret» is saved in «Service keys»"), needs: null, ready: false };
      if (!c.provider) return { locked: null, needs: T("no_provider", "اختار مزود البحث (Tavily / Serper / Brave) في «مفاتيح الخدمات»", "Choose the search provider (Tavily / Serper / Brave) in «Service keys»"), ready: false };
      if (c.cap <= 0) return { locked: null, needs: T("cap_zero", "الحد اليومي للبحث = 0 في «مفاتيح الخدمات»", "The daily search cap is 0 in «Service keys»"), ready: false };
      if (J && c.cap_janna <= 0) return { locked: null, needs: T("cap_janna_zero", "حد جنة اليومي = 0 في «مفاتيح الخدمات»", "Janna's daily share is 0 in «Service keys»"), ready: false };
      if (!(await connectedOf(env))[J ? "janna" : "bassem"]) return { locked: null, needs: T("not_connected", "دوس «🔗 وصّل البحث بجنة وباسم» في «مفاتيح الخدمات»", "Press «🔗 Connect web search to Janna and Bassem» in «Service keys»"), ready: false };
      return NONE;
    }
    // 📎 photos: the Worker's Workers AI binding ([ai] in worker/wrangler.toml) — without it nothing can read a photo
    if (d.key === "chat_photos") return env && env.AI && typeof env.AI.run === "function" ? NONE : { locked: T("no_ai", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
    if (d.key === "web_leads" || d.key === "web_leads_public" || d.key === "web_leads_lookup") return (await leadsStoreOn(env)) ? NONE : { locked: T("migration_needed", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
    // the daily calls report (calls-report.js): an e-mail route (the e-mail center's config, RESEND_API_KEY or the SEND_EMAIL binding) and a recipient
    if (d.key === "calls_report") {
      if (!mailReady(env)) return { locked: T("no_route", "مقفول: مفيش طريقة إرسال إيميل شغّالة — شغّلها من «البريد»", "Locked: no working e-mail route — set it up in «E-mail»"), needs: null, ready: false };
      if (!(await callsReportTo(env)).length) return { locked: T("no_recipient", "مقفول: مفيش مستلم للتقرير — حطّه في «المطوّر» ← «تقرير المكالمات»", "Locked: the report has no recipient — set one in «Developer» → «Calls report»"), needs: null, ready: false };
      return NONE;
    }
    // the app's store rows: the deletion requests need their table (migration 0010); the reviewer sign-in needs its address + code, unexpired
    if (d.key === "account_delete" || d.key === "visitor_erase_request") {
      return (await deleteStoreOn(env)) ? NONE : { locked: T("migration_needed", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
    }
    if (d.key === "store_review_signin") {
      const r = await readReview(env);
      if (!r) return { locked: T("no_review_account", d.lock_rule_ar, d.lock_rule_en), needs: null, ready: false };
      if (!r.live) return { locked: T("review_expired", "مقفول: مدة إيميل المراجعة والكود خلصت — حطّهم تاني بمدة جديدة (30 يوم بالكتير)", "Locked: the review address and code have expired — save them again with a new period (30 days at most)"), needs: null, ready: false };
      return NONE;
    }
  } catch (e) { return { locked: T("state_unknown", "مش قادرين نتأكد من المفاتيح دلوقتي", "The keys cannot be checked right now"), needs: null, ready: false }; }
  return NONE;
}

/* ---------- the app's store rows: what their locks read (leaf helpers; review-signin.js and delete-requests.js use the same) ---------- */
/* migration 0010 (cc_delete_requests) applied? A table that exists stays known for the isolate; a missing one is asked again after 60 s */
const DEL_MEMO = new WeakMap(); // env.DB → {ok, at}
export async function deleteStoreOn(env) {
  const db = dbOf(env); if (!db) return false;
  const m = DEL_MEMO.get(db); if (m && (m.ok || Date.now() - m.at < 60000)) return m.ok;
  let ok = false; try { await db.prepare("SELECT 1 AS x FROM cc_delete_requests LIMIT 1").first(); ok = true; } catch (e) { ok = false; }
  DEL_MEMO.set(db, { ok, at: Date.now() }); return ok;
}
/* migration 0012 (web_leads, the data desk's «🌐 فرص من الإنترنت») applied? the same memo rule (web-leads.js reads it from here) */
const LEADS_MEMO = new WeakMap(); // env.DB → {ok, at}
export async function leadsStoreOn(env) {
  const db = dbOf(env); if (!db) return false;
  const m = LEADS_MEMO.get(db); if (m && (m.ok || Date.now() - m.at < 60000)) return m.ok;
  let ok = false; try { await db.prepare("SELECT 1 AS x FROM web_leads LIMIT 1").first(); ok = true; } catch (e) { ok = false; }
  LEADS_MEMO.set(db, { ok, at: Date.now() }); return ok;
}
export const forgetLeadsStore = env => { const db = dbOf(env); if (db) LEADS_MEMO.delete(db); };
/* «🔗 وصّل البحث بجنة وباسم»: are the web tools on the personas? (cc_settings websearch.connect, written by acc-wsconnect.js: v2
   {connected: {bassem, janna}}; a v1 state = Bassem's search alone, without the hunt → not connected) — display only (the needs) */
export async function connectedOf(env) {
  const db = dbOf(env); if (!db) return { bassem: false, janna: false };
  try {
    const r = await db.prepare("SELECT v FROM cc_settings WHERE k = 'websearch.connect' AND scope = 'system'").first();
    const o = r ? JSON.parse(String(r.v || "")) : null, c = o && o.v === 2 && o.connected && typeof o.connected === "object" ? o.connected : {};
    return { bassem: c.bassem === true, janna: c.janna === true };
  } catch (e) { return { bassem: false, janna: false }; }
}
/* «دخول مراجعي المتاجر»: cc_settings k = REVIEW_KEY (scope 'system'; dev.* is reserved for the owner's /dev API, acc-plans.js RESERVED):
   {v:1, email, code_hash (HMAC of the code with CONFIG_SECRET — never the code), until (ISO, ≤ 30 days after it was set), by, at}.
   → null (nothing saved / unreadable) | {email, code_hash, until, by, at, live: until is still ahead} — never throws */
export const REVIEW_KEY = "dev.review_signin", REVIEW_MAX_DAYS = 30;
export async function readReview(env) {
  const db = dbOf(env); if (!db) return null;
  try {
    const r = await db.prepare("SELECT v FROM cc_settings WHERE k = ? AND scope = 'system'").bind(REVIEW_KEY).first();
    const o = r ? JSON.parse(String(r.v || "")) : null;
    if (!o || typeof o !== "object" || typeof o.email !== "string" || !o.email || typeof o.code_hash !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(o.code_hash)) return null;
    const until = String(o.until || ""), t = Date.parse(until);
    return { email: o.email, code_hash: o.code_hash, until, by: String(o.by || ""), at: String(o.at || ""), live: t > Date.now() };
  } catch (e) { return null; }
}

/* «تقرير المكالمات اليومي» (calls-report.js): cc_settings k = CALLS_REPORT_KEY (scope 'system'; dev.* is reserved for the owner's /dev API) —
   the recipients the owner saved (JSON `to`, ≤ 5), else the platform's own mailboxes TEAM_EMAIL + ADMIN_EMAILS (common.js adminEmails).
   → [addresses] (lower case) — never throws */
export const CALLS_REPORT_KEY = "dev.calls_report";
const MAIL_RX = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/; // advisor.js isEmail
const mailOk = e => typeof e === "string" && e.length <= 254 && MAIL_RX.test(e);
export async function callsReportTo(env) {
  const db = dbOf(env); let to = [];
  if (db) try { const r = await db.prepare("SELECT v FROM cc_settings WHERE k = ? AND scope = 'system'").bind(CALLS_REPORT_KEY).first(); const o = r ? JSON.parse(String(r.v || "")) : null; if (o && Array.isArray(o.to)) to = o.to.map(x => String(x || "").trim().toLowerCase()).filter(mailOk).slice(0, 5); } catch (e) { to = []; }
  if (to.length) return to;
  return [...new Set([String((env && env.TEAM_EMAIL) || ""), ...String((env && env.ADMIN_EMAILS) || "").split(/[\s,;]+/)].map(x => x.replace(/[\r\n\t]+/g, " ").trim().slice(0, 254).toLowerCase()).filter(mailOk))];
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
