/* Tasks («المهام») — what Bassem or Janna started, promised or was asked to do with ONE client, so the next call (and the next day)
   carries on with it (owner, 2026-11-18 23:50: «عشان يكمّل تاسكاته يوم بعد يوم ويبقى عنده تاريخ العميل وعارف بدأ إيه ومكمّل في إيه»).
   Table memory_tasks (migrations/0009_memory_upgrades.sql). subject = members.id (Bassem's members) or 'v:' + a visitor id (Janna's
   visitors); agent = bassem | janna. Nothing here ever deletes a task: done / cancelled are statuses, the row stays.

   WHERE TASKS COME FROM (syncTasks, called by memory.js rebuildSummary after every call summary — deterministic, no LLM, idempotent):
     - the client's own requests in the call («فكرني بكرة بعرض الأسعار», «ابعتلي الإكسل على الواتساب», «دورلي على مستوردين في كينيا»)
       → source request, the due date read from the words (بكرة / النهارده / الساعة 9:30 / يوم الخميس / 25 نوفمبر …);
       a search the persona already did in the same call is no task (it is a search row of the memory);
     - the persona's own promises («هبعتلك ملخص بكرة», «هتابع معاك») → source promise (his / her own words: shown as unverified);
     - tool outcomes (data/bassem-memory.js reports {name, args, outcome}): a tool that was refused / failed → source failed («لسه ماتمّش»,
       retried next time); an e-mail drafted for a deal and not sent yet, an RFQ / contact form filled and not submitted, a registration
       started (Janna), a meeting scheduled (Janna, due = its date) → source tool, open;
     - the persona's tasks tool (tasksApi: add / done / cancel / reopen / due) → source persona.
   CLOSED AUTOMATICALLY when the matching tool succeeds (outcome ok), in the same call after the request or in a later call: a send /
   notify closes the e-mail / WhatsApp / reminder tasks, a follow closes the follow request (same words), a deal started closes the deal
   request, a search closes the search request with the same words, set_work_time / a scheduled meeting close the time requests,
   save_profile the profile request, an RFQ / contact submit its form task; the daily job (daily.js) closes deal tasks of won / lost
   deals, follow tasks of follows that are gone, past meetings, and Janna's registration task once the visitor is a member.
   OPEN TASKS + DUE DATES GO FIRST into the next call's context (tasksContext → memory.js memoryContext / visitor.js visitorContext). */
import { iso, cairoDay, cairoHM, addDays, sha256, jparse } from "./common.js";
import { norm, tokens, clean, forLLM, instructionLike, asciiDigits, MASK_EMAIL, MASK_PHONE, stem } from "./text.js";
import { hasTable } from "./acc-base.js";

export const TASK_LIM = Object.freeze({ title: 160, open: 200, context: 8, list: 20, perCall: 24 });
export const STATUSES = Object.freeze(["open", "done", "cancelled"]);
const llm = (s, n) => { const v = forLLM(s, n); return v && !instructionLike(s, { money: false }) && !instructionLike(v, { money: false }) ? v : ""; };
const unmask = s => String(s || "").split(MASK_EMAIL).join(" ").split(MASK_PHONE).join(" ").replace(/\s+/g, " ").trim();
const short = (s, n) => { const c = Array.from(String(s || "").trim()); return c.length > n ? c.slice(0, n - 1).join("").trim() + "…" : c.join(""); };
const hash = async s => (await sha256(String(s))).slice(0, 24);

/* ---------- families: what a task is about, and which tools close it (on norm() text: ا not أ, ه not ة, ي not ى) ---------- */
const FAMILY = [
  ["email", /ايميل|email|e mail|(^| )mail( |$)|بريد/],
  ["whatsapp", /واتس|whatsapp/],
  ["remind", /فكرني|فكريني|افكرك|هفكرك|ذكرني|remind/],
  ["follow", /تابع|متابع|follow|نبهني|بلغني|بلغيني|عرفني|عرفيني|alert|notify me/],
  ["deal", /صفق|deal/],
  ["quote", /عرض سعر|عرض اسعار|عروض اسعار|كوتيشن|تسعير|quotation|quote|rfq/],
  ["meeting", /اجتماع|meeting/],
  ["schedule", /ميعاد|معاد|موعد|الساعه|كلمني|كلميني|اتصل|call me|schedule|appointment/],
  ["profile", /بيانات المصنع|بيانات الشركه|ملف المصنع|بروفايل|profile/],
  ["register", /تسجيل|اسجل|سجلني|سجليني|اشترك|اشتراك|register|sign up|subscribe/],
  ["search", /دور|ابحث|هات|شوف|لاقي|طلع|find|search|look for|show me|get me/],
];
export const familyOf = text => { const n = norm(text); for (const [f, rx] of FAMILY) if (rx.test(n)) return f; return "other"; };
/* tool → its family; CLOSES = the task families a SUCCESSFUL call of it closes */
const TOOL_FAMILY = { bassem_draft_email: "email", bassem_send_email: "email", bassem_notify_member: "whatsapp", janna_follow: "follow", bassem_follow: "follow",
  bassem_start_deal: "deal", bassem_update_deal: "deal", bassem_set_work_time: "schedule", janna_schedule_meeting: "meeting", janna_book_meeting: "meeting",
  janna_start_meeting: "meeting", bassem_save_profile: "profile", janna_fill_registration: "register", janna_fill_rfq: "quote", janna_fill_contact: "contact",
  janna_submit_form: "quote" };
const SEARCH_TOOL = /^(janna_lookup|janna_search|janna_navigate|bassem_intel|bassem_web_search|platform_item|janna_item|bassem_open_item|bassem_open_opportunity|bassem_screen|bassem_open_guide)$/;
const CLOSES = { bassem_send_email: ["email", "quote"], bassem_notify_member: ["whatsapp", "email", "remind"], janna_follow: ["follow"], bassem_follow: ["follow"],
  bassem_start_deal: ["deal"], bassem_update_deal: ["deal"], bassem_set_work_time: ["schedule"], janna_schedule_meeting: ["meeting", "schedule"],
  janna_book_meeting: ["meeting", "schedule"], janna_start_meeting: ["meeting"], bassem_save_profile: ["profile"] };
export const toolFamily = name => TOOL_FAMILY[name] || (SEARCH_TOOL.test(name) ? "search" : "other");
const NEED_WORDS = new Set(["follow", "deal", "search", "quote"]); // these close only a task about the same thing (shared words)
const WRITE_RX = /(^| )(اكتبلي|اكتبيلي|اكتب|جهزلي|جهزيلي|حضرلي|صيغلي|هكتبلك|هجهزلك|write|draft|prepare)/, SEND_RX = /(^| )(ابعتلي|ابعتيلي|ابعت|هبعتلك|send)/;

/* ---------- the words of a task (what it is about, without the request / family / time words) ---------- */
const TASK_STOP = new Set(["فكرني", "فكريني", "تابعلي", "تابعيلي", "تابع", "متابعه", "متابعة", "ابعتلي", "ابعتيلي", "ابعت", "بلغني", "عرفني", "دورلي", "دوريلي", "دور", "ابحثلي", "شوفلي",
  "هاتلي", "جيبلي", "جهزلي", "حضرلي", "اكتبلي", "كلمني", "سجلني", "عايزك", "عاوزك", "عايز", "عاوز", "ممكن", "لو", "سمحت", "بكره", "النهارده", "انهارده", "بعد", "الساعه", "ساعه",
  "الصبح", "بالليل", "يوم", "الاسبوع", "اسبوع", "الشهر", "الجاي", "الجايه", "ونص", "وربع", "ايميل", "الايميل", "واتساب", "الواتساب", "واتس", "رساله", "هبعتلك", "هتابع",
  "هنتابع", "هفكرك", "هبلغك", "هرجعلك", "هكلمك", "هتواصل", "هجهزلك", "هحضرلك", "هكتبلك", "هدورلك", "هشوفلك", "معاك", "معاكي", "عليه", "عليها", "ده", "دي", "دا", "كده",
  "خلاص", "طيب", "تمام", "يعني", "كمان", "بقى", "بقي", "برضه", "برضو", "ياريت", "يا", "ريت", "اوكي", "حاضر", "ماشي", "بس", "اهو", "دلوقتي", "حالا", "فورا", "اول", "ما", "تقدر", "تقدري",
  "remind", "send", "follow", "find", "call", "please", "tomorrow", "today", "email", "whatsapp", "me", "you", "will", "can", "could", "up", "ll", "ok", "okay", "then", "also", "now"].flatMap(w => [norm(w), stem(w)])); // + the stem: taskWords() compares stems («متابعة» → «متابع»)
export const taskWords = text => tokens(unmask(text), 40).filter(w => !TASK_STOP.has(w) && !/^\d+$/.test(w)).slice(0, 12);
const overlap = (a, b) => { const s = new Set(b); return a.filter(w => s.has(w)).length; };
/* does a successful tool (its words) do THIS task (its words)? a follow is one precise thing («حديد الصلب في الخليج» ≠ «… في الصين»):
   ≥ 75 % of the task's words; a deal / quote: two shared words (or all of a shorter task); a search: one */
const wordsMatch = (fam, tw, cw) => !tw.length || (fam === "follow" ? overlap(tw, cw) / tw.length >= 0.75 : fam === "search" ? overlap(tw, cw) > 0 : overlap(tw, cw) >= Math.min(2, tw.length));

/* ---------- dates: the due date read from the words, Cairo local ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM') ---------- */
const AR_MONTHS = ["يناير", "فبراير", "مارس", "ابريل", "مايو", "يونيو", "يوليو", "اغسطس", "سبتمبر", "اكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = [["الحد", "الاحد", "sunday"], ["الاتنين", "الاثنين", "monday"], ["التلات", "الثلاثاء", "التلاتاء", "tuesday"], ["الاربع", "الاربعاء", "wednesday"], ["الخميس", "thursday"], ["الجمعه", "friday"], ["السبت", "saturday"]];
const pad = n => String(n).padStart(2, "0");
const validDay = (y, m, d) => { const t = Date.UTC(y, m - 1, d); const x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? y + "-" + pad(m) + "-" + pad(d) : ""; };
const dowOf = day => new Date(day + "T12:00:00Z").getUTCDay();
export function parseDue(text, baseMs = Date.now()) {
  const raw = asciiDigits(String(text || "")), n = norm(raw), today = cairoDay(baseMs);
  let day = "", time = "", m;
  if ((m = /(20\d\d)-(\d{1,2})-(\d{1,2})/.exec(raw))) day = validDay(+m[1], +m[2], +m[3]);
  if (!day && (m = /(^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(20\d\d|\d\d))?(?![\d\/])/.exec(raw))) {
    const y = m[4] ? (m[4].length === 2 ? 2000 + +m[4] : +m[4]) : +today.slice(0, 4); day = validDay(y, +m[3], +m[2]);
    if (day && !m[4] && day < today) day = validDay(y + 1, +m[3], +m[2]);
  }
  if (!day) for (let i = 0; i < 12 && !day; i++) {
    const rx = new RegExp("(^| )(\\d{1,2}) (" + AR_MONTHS[i] + "|" + EN_MONTHS[i] + ")( (20\\d\\d))?( |$)"), x = rx.exec(n);
    if (x) { const y = x[5] ? +x[5] : +today.slice(0, 4); day = validDay(y, i + 1, +x[2]); if (day && !x[5] && day < today) day = validDay(y + 1, i + 1, +x[2]); }
  }
  if (!day) {
    if (/(^| )(بعد بكره|day after tomorrow)( |$)/.test(n)) day = addDays(today, 2);
    else if (/(^| )(بكره|tomorrow)( |$)/.test(n)) day = addDays(today, 1);
    else if (/(^| )(النهارده|انهارده|النهارده|اليوم|today|tonight)( |$)/.test(n)) day = today;
    else if ((m = /(^| )بعد (\d{1,2}) (يوم|ايام)( |$)/.exec(n)) || (m = /(^| )in (\d{1,2}) days?( |$)/.exec(n))) day = addDays(today, Math.min(+m[2], 365));
    else if (/(^| )بعد يومين( |$)/.test(n)) day = addDays(today, 2);
    else if (/(^| )((ال)?اسبوع الجاي|next week)( |$)/.test(n)) day = addDays(today, 7);
    else if (/(^| )((ال)?شهر الجاي|next month)( |$)/.test(n)) day = addDays(today, 30);
    else for (let d = 0; d < 7 && !day; d++) if (new RegExp("(^| )(يوم )?(" + WEEKDAYS[d].join("|") + ")( |$)").test(n)) { const t = dowOf(today); day = addDays(today, ((d - t + 7) % 7) || 7); }
  }
  /* a time: «الساعة 9:30», «الساعة 10 ونص», «الساعة 3 العصر», «بالليل الساعة 8», «at 9:30 am» — on a light normalisation that keeps «:» */
  const tn = raw.toLowerCase().replace(/[\u064b-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}:.\s]/gu, " ").replace(/\s+/g, " ");
  if ((m = /(?:^| )(?:الساعه|at)\s*(\d{1,2})(?:[:.](\d{2}))?( ونص| و نص| وربع| و ربع| الا ربع)?/.exec(tn)) || (m = /(?:^| )(\d{1,2}):(\d{2})()(?= |$)/.exec(tn))) {
    let h = +m[1], mi = m[2] ? +m[2] : 0; const frac = (m[3] || "").trim();
    if (/ونص|و نص/.test(frac)) mi = 30; else if (/وربع|و ربع/.test(frac)) mi = 15; else if (/الا ربع/.test(frac)) { h = h - 1; mi = 45; }
    if (/(^| )(بالليل|بليل|مساء|مساءا|م|pm|p\.m|العصر|الضهر|بعد الضهر|المغرب)( |$)/.test(tn)) { if (h < 12) h += 12; }
    else if (!/(^| )(الصبح|صباحا|ص|am|a\.m)( |$)/.test(tn) && h >= 1 && h <= 6) h += 12; // «الساعة 3» in business hours = 15:00
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) time = pad(h) + ":" + pad(mi);
  }
  if (time && !day) day = time > cairoHM(baseMs) ? today : addDays(today, 1);
  return day ? day + (time ? "T" + time : "") : "";
}
export const dueOk = d => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(d || "")) && !!validDay(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10));
/* the due date as the persona says it: «بكرة (20 نوفمبر) الساعة 09:30», «متأخرة من 18 نوفمبر», «يوم 25 نوفمبر» */
export function dueAr(due, nowMs = Date.now()) {
  if (!dueOk(due)) return "";
  const d = due.slice(0, 10), t = due.length > 10 ? " الساعة " + due.slice(11) : "", today = cairoDay(nowMs);
  const a = (+d.slice(8, 10)) + " " + ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"][+d.slice(5, 7) - 1] + (d.slice(0, 4) !== today.slice(0, 4) ? " " + d.slice(0, 4) : "");
  if (d < today) return "متأخرة من " + a + t;
  if (d === today) return "النهارده" + t;
  if (d === addDays(today, 1)) return "بكرة (" + a + ")" + t;
  return "يوم " + a + t;
}
export function dueEn(due, nowMs = Date.now()) {
  if (!dueOk(due)) return "";
  const d = due.slice(0, 10), t = due.length > 10 ? " at " + due.slice(11) : "", today = cairoDay(nowMs);
  const a = (+d.slice(8, 10)) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+d.slice(5, 7) - 1] + (d.slice(0, 4) !== today.slice(0, 4) ? " " + d.slice(0, 4) : "");
  if (d < today) return "overdue since " + a + t;
  if (d === today) return "today" + t;
  if (d === addDays(today, 1)) return "tomorrow (" + a + ")" + t;
  return "on " + a + t;
}

/* ---------- what a call says (pure: the same call gives the same tasks) ---------- */
const REQ_VERBS = new Set(["ابدا", "ابدالي", "افتحلي", "اعملي", "ظبطلي", "فكرني", "فكريني", "ذكرني", "تابعلي", "تابعيلي", "ابعتلي", "ابعتيلي", "بلغني", "بلغيني", "عرفني", "عرفيني", "نبهني", "دورلي", "دوريلي", "ابحثلي", "شوفلي",
  "شوفيلي", "هاتلي", "هاتيلي", "جيبلي", "جهزلي", "جهزيلي", "حضرلي", "اكتبلي", "اكتبيلي", "كلمني", "كلميني", "سجلني", "سجليني"]);
/* one request per piece: «تابعلي فرص الحديد في الصين واكتبلي إيميل تعريفي» = a follow + an e-mail */
function pieces(s) { const out = []; let cur = []; for (const x of String(s).split(/\s+/).filter(Boolean)) { const n = norm(x); if (cur.length >= 2 && n.length > 3 && n[0] === "و" && REQ_VERBS.has(n.slice(1))) { out.push(cur.join(" ")); cur = [x.replace(/^و/, "")]; } else cur.push(x); } if (cur.length) out.push(cur.join(" ")); return out; }
const sentences = s => String(s || "").split(/[.!?؟\n؛]+|،\s+(?=و?(?:كمان|بعدين|وبعدين))/).flatMap(x => pieces(x.trim())).map(x => x.trim()).filter(x => Array.from(x).length >= 6);
const REQ_RX = /(^| )[وف]?(ابدا|ابدالي|نبدا|افتحلي|اعملي|اعمللي|ظبطلي|فكرني|فكريني|ذكرني|تابعلي|تابع لي|تابعيلي|ابعتلي|ابعتيلي|ابعت لي|بلغني|بلغيني|عرفني|عرفيني|نبهني|دورلي|دوريلي|ابحثلي|شوفلي|شوفيلي|هاتلي|هاتيلي|جيبلي|جهزلي|جهزيلي|حضرلي|اكتبلي|اكتبيلي|كلمني|كلميني|سجلني|سجليني|عايزك ت|عاوزك ت|عايزاكي ت|محتاجك ت|ممكن تبعت|ممكن تدور|ممكن تتابع|ممكن تكلم|ممكن تجهز|لو سمحت ت)|(^| )(remind me|follow up|send me|find me|get me|call me|start a deal|(can|could) you (please )?(send|find|follow|prepare|call|check|remind|start)|please (send|find|follow|prepare|call|check|remind|start))/;
const PROMISE_RX = /(^| )[وف]?(هتابع|هنتابع|هتابعلك|هفكرك|هبلغك|هابلغك|هرجعلك|هارجعلك|هكلمك|هاكلمك|هتواصل|هبعتلك|هابعتلك|هبعتهولك|هجهزلك|هحضرلك|هكتبلك|هدورلك|هشوفلك)|(^| )(i ll|i will|we ll|we will) (send|follow|call|remind|prepare|get back|check|look|find)/;
const LATER_RX = /(^| )[وف]?(هتابع|هنتابع|هتابعلك|هفكرك|هبلغك|هابلغك|هرجعلك|هارجعلك|هكلمك|هاكلمك|هتواصل)|follow up|get back|remind/;
const FUTURE_RX = /(^| )(بكره|بعد بكره|الاسبوع الجاي|الشهر الجاي|بعدين|المره الجايه|المكالمه الجايه|اول ما|لما|tomorrow|next week|later|next time|as soon as|الصبح|بالليل)( |$)|(^| )(يوم )?(الحد|الاحد|الاتنين|الاثنين|التلات|الثلاثاء|الاربع|الاربعاء|الخميس|الجمعه|السبت)( |$)/;
const NOW_RX = /(^| )(دلوقتي|دلوقت|حالا|فورا|ثواني|ثانيه|لحظه|now|right now|right away|one moment)( |$)/;
const RECALL_Q = /(^| )(فاكر|فاكره|فاكرين|تفتكر|remember)( |$)/;
const SMALLTALK = /(^| )(ازيك|ازيكم|اخبارك|عامل ايه|عامله ايه|how are you|thank you|شكرا|متشكر)( |$)/;
const PLAN_AR = { profile: "بيانات الشركة", basic: "الأساسية", premium: "المميزة", partner: "الشريك الأساسي", strategic: "الشريك الاستراتيجي" };
const argText = a => String((a && (a.query || a.label || a.title || a.product || a.deal || a.ref_id || a.ref || a.name || a.section || a.page)) || "");
/* a tool that did not happen, as one short line (memory.js failedAr wording) */
function failedTitle(name, a) {
  if (/follow/.test(name)) return "متابعة " + (a.label || a.ref_id || a.id || a.kind || "");
  if (name === "bassem_send_email") return "إرسال إيميل" + (a.deal ? " للصفقة " + a.deal : "");
  if (name === "bassem_draft_email") return "مسودة إيميل" + (a.deal ? " للصفقة " + a.deal : "");
  if (/start_deal|update_deal/.test(name)) return "صفقة " + (a.title || a.query || a.deal || a.ref || "");
  if (name === "bassem_save_profile") return "حفظ بيانات المصنع";
  if (name === "bassem_set_work_time") return "ميعاد الشغل اليومي" + (a.session_time || a.morning_time ? " " + (a.session_time || a.morning_time) : "");
  if (name === "bassem_notify_member") return "رسالة للعضو على " + (a.channel === "email" ? "الإيميل" : a.channel === "whatsapp" ? "الواتساب" : "الواتساب والإيميل");
  if (name === "janna_schedule_meeting" || name === "janna_book_meeting") return "ميعاد الاجتماع مع جنة";
  if (name === "janna_submit_form") return a.form === "contact" ? "إرسال رسالة التواصل" : "إرسال طلب عرض السعر";
  return name.replace(/_/g, " ");
}
const NO_FAILED_TASK = /^(janna_lookup|janna_search|janna_navigate|bassem_intel|bassem_web_search|platform_item|janna_item|bassem_open_item|bassem_open_opportunity|bassem_open_guide|bassem_screen|bassem_recall|janna_track|janna_start_meeting)$/;
/* {callId, turns:[{role, text, seq?}], tools:[{name, args, outcome, s?}], atMs} → {create: [task spec], closers: [{name, families, words, s}]} */
export function deriveTasks({ callId = "", turns = [], tools = [], atMs = Date.now(), follows } = {}) {
  const create = [], seen = new Set(), add = t => { if (!t.title || seen.has(t.tkeyBase) || create.length >= TASK_LIM.perCall) return; seen.add(t.tkeyBase); create.push(t); };
  const fset = follows ? new Set(follows.map(x => norm(x)).filter(Boolean)) : null;
  const followed = t => !!(fset && /follow/.test(t.name) && t.args && [t.args.label, t.args.ref_id, t.args.id].some(v => v && fset.has(norm(v))));
  const okTools = tools.filter(t => t && t.name && (t.outcome === "ok" || (!t.outcome && ((toolFamily(t.name) === "search" && SEARCH_TOOL.test(t.name)) || followed(t)))));
  const searchDone = (words, seq) => okTools.some(t => toolFamily(t.name) === "search" && (!words.length || overlap(words, taskWords(argText(t.args))) > 0) && !(Number.isInteger(t.s) && Number.isInteger(seq) && t.s <= seq));
  for (const t of turns) {
    if (!t || !t.text) continue;
    for (const s0 of sentences(t.text)) {
      const s = unmask(clean(s0, 400)), n = norm(s);
      if (!s || instructionLike(s, { money: false })) continue;
      if (t.role === "user") {
        if (!REQ_RX.test(n) || RECALL_Q.test(n) || SMALLTALK.test(n)) continue;
        const fam = familyOf(s), words = taskWords(s);
        if (fam === "search" && searchDone(words, t.seq)) continue; // done right away: the search itself is in the memory
        if (fam === "other" && okTools.some(x => !(Number.isInteger(x.s) && Number.isInteger(t.seq) && x.s <= t.seq))) continue; // a tool did it right away
        const w0 = norm(s.split(/\s+/)[0] || ""), title = /^[وف]/.test(w0) && REQ_VERBS.has(w0.slice(1)) ? s.replace(/^\s*[وف]/, "") : s; // «وابعتلي …» → «ابعتلي …»
        add({ tkeyBase: "r:" + fam + ":" + (words.slice().sort().join(" ") || n), kind: fam, title: short(title, TASK_LIM.title), source: "request", due: parseDue(s, atMs), seq: Number.isInteger(t.seq) ? t.seq : null, words });
      } else if (t.role === "persona") {
        if (!PROMISE_RX.test(n) || !(FUTURE_RX.test(n) || (LATER_RX.test(n) && !NOW_RX.test(n)))) continue;
        const fam = familyOf(s), words = taskWords(s);
        add({ tkeyBase: "p:" + fam + ":" + (words.slice().sort().join(" ") || n), kind: fam, title: short(s, TASK_LIM.title), source: "promise", due: parseDue(s, atMs), seq: Number.isInteger(t.seq) ? t.seq : null, words });
      }
    }
  }
  for (const t of tools) {
    if (!t || !t.name) continue;
    const a = t.args && typeof t.args === "object" ? t.args : {}, name = t.name, oc = t.outcome || "";
    if (oc === "refused" || oc === "failed") {
      if (NO_FAILED_TASK.test(name)) continue;
      const title = unmask(clean(failedTitle(name, a), TASK_LIM.title)).trim();
      add({ tkeyBase: "f:" + toolFamily(name) + ":" + norm(title), kind: toolFamily(name), title, source: "failed", due: "", seq: Number.isInteger(t.s) ? t.s : null, words: taskWords(argText(a) || title), tool: name });
      continue;
    }
    if (name === "bassem_draft_email" && a.deal) add({ tkeyBase: "e:draft:" + norm(a.deal), kind: "email", title: short("مسودة إيميل لسه ما اتبعتتش — صفقة " + clean(a.deal, 80), TASK_LIM.title), source: "tool", due: "", seq: Number.isInteger(t.s) ? t.s : null, words: taskWords(a.deal), ref: a.deal, tool: name });
    else if (name === "janna_fill_rfq") add({ tkeyBase: "q:" + norm(a.product || ""), kind: "quote", title: short("طلب عرض السعر لسه مااتبعتش" + (a.product ? ": " + clean(a.product, 80) : ""), TASK_LIM.title), source: "tool", due: "", seq: Number.isInteger(t.s) ? t.s : null, words: taskWords(a.product || ""), tool: name });
    else if (name === "janna_fill_contact") add({ tkeyBase: "c:contact", kind: "contact", title: "رسالة التواصل لسه مااتبعتتش", source: "tool", due: "", seq: Number.isInteger(t.s) ? t.s : null, words: [], tool: name });
    else if (name === "janna_fill_registration") add({ tkeyBase: "g:register", kind: "register", title: "يكمّل التسجيل" + (PLAN_AR[a.plan] ? " على باقة " + PLAN_AR[a.plan] : ""), source: "tool", due: "", seq: null, words: [], tool: name });
    else if ((name === "janna_schedule_meeting" || name === "janna_book_meeting") && oc !== "refused") {
      const due = dueOk(String(a.date || "") + (/^\d{2}:\d{2}$/.test(String(a.time || "")) ? "T" + a.time : "")) ? String(a.date) + (/^\d{2}:\d{2}$/.test(String(a.time || "")) ? "T" + a.time : "") : parseDue(String(a.date || "") + " " + (a.time ? "الساعة " + a.time : ""), atMs);
      add({ tkeyBase: "m:" + (due || norm(String(a.date || "") + " " + String(a.time || ""))), kind: "meeting", title: "اجتماع تعريفي مع جنة", source: "tool", due, seq: null, words: [], tool: name });
    }
  }
  /* the tools that close tasks: a success (ok; a search without an error) of a tool whose CLOSES lists the family */
  const closers = [];
  for (const t of okTools) {
    const a = t.args && typeof t.args === "object" ? t.args : {};
    let fams = CLOSES[t.name] || (toolFamily(t.name) === "search" ? ["search"] : []);
    if (t.name === "janna_submit_form") fams = a.form === "contact" ? ["contact"] : ["quote"];
    const writeOnly = t.name === "bassem_draft_email"; if (writeOnly) fams = ["email"];
    if (!fams.length) continue;
    closers.push({ name: t.name, families: fams, words: taskWords(argText(a)), s: Number.isInteger(t.s) ? t.s : null, deal: a.deal ? norm(a.deal) : "", writeOnly });
  }
  return { create, closers };
}

/* ---------- storage ---------- */
export const tasksOn = env => hasTable(env, "memory_tasks");
const UPSERT = `INSERT INTO memory_tasks (subject, agent, kind, title, status, source, due, call_id, ref, tkey, created_at, updated_at, done_at, done_by, data_json)
  VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, '', '', ?)
  ON CONFLICT(subject, agent, tkey) DO UPDATE SET
    title = excluded.title, updated_at = excluded.updated_at,
    due = CASE WHEN excluded.due != '' THEN excluded.due ELSE memory_tasks.due END,
    source = CASE WHEN memory_tasks.source = 'failed' AND excluded.source != 'failed' THEN excluded.source ELSE memory_tasks.source END,
    status = CASE WHEN memory_tasks.status != 'open' AND excluded.source IN ('request', 'promise', 'failed', 'tool') AND memory_tasks.call_id != excluded.call_id AND excluded.created_at > memory_tasks.done_at THEN 'open' ELSE memory_tasks.status END,
    done_by = CASE WHEN memory_tasks.status != 'open' AND excluded.source IN ('request', 'promise', 'failed', 'tool') AND memory_tasks.call_id != excluded.call_id AND excluded.created_at > memory_tasks.done_at THEN '' ELSE memory_tasks.done_by END,
    call_id = CASE WHEN memory_tasks.status != 'open' AND excluded.source IN ('request', 'promise', 'failed', 'tool') AND memory_tasks.call_id != excluded.call_id AND excluded.created_at > memory_tasks.done_at THEN excluded.call_id ELSE memory_tasks.call_id END,
    done_at = CASE WHEN memory_tasks.status != 'open' AND excluded.source IN ('request', 'promise', 'failed', 'tool') AND memory_tasks.call_id != excluded.call_id AND excluded.created_at > memory_tasks.done_at THEN '' ELSE memory_tasks.done_at END`;
const stmtUpsert = (env, subject, agent, callId, t, atIso) => env.DB.prepare(UPSERT).bind(subject, agent, t.kind || "other", String(t.title).slice(0, 400), t.source || "tool", t.due || "", callId || "",
  String(t.ref || "").slice(0, 64), t.tkey, atIso, atIso, JSON.stringify({ seq: t.seq == null ? null : t.seq, family: t.kind, words: (t.words || []).slice(0, 12), ...(t.tool ? { tool: t.tool } : {}) }));
const doneStmt = (env, id, status, at, by) => env.DB.prepare("UPDATE memory_tasks SET status = ?, done_at = ?, done_by = ?, updated_at = ? WHERE id = ? AND status = 'open'").bind(status, at, by, at, id);
/* apply one call's tasks to a subject: upsert what it opened, close what its successful tools did → {opened, closed} (idempotent) */
export async function syncTasks(env, subject, agent, callId, { turns = [], tools = [], atMs = Date.now(), follows } = {}) {
  if (!env || !env.DB || !subject || !(await tasksOn(env))) return null;
  agent = agent === "janna" ? "janna" : "bassem";
  const { create, closers } = deriveTasks({ callId, turns, tools, atMs, follows }), at = iso(atMs);
  for (const t of create) t.tkey = await hash(t.tkeyBase);
  const before = new Set(((await env.DB.prepare("SELECT tkey FROM memory_tasks WHERE subject = ? AND agent = ? AND tkey IN (" + (create.map(() => "?").join(", ") || "''") + ")").bind(subject, agent, ...create.map(t => t.tkey)).all()).results || []).map(r => r.tkey));
  if (create.length) await env.DB.batch(create.map(t => stmtUpsert(env, subject, agent, callId, t, at)));
  let closed = 0;
  if (closers.length) {
    const open = ((await env.DB.prepare("SELECT id, kind, title, source, due, call_id, data_json, ref FROM memory_tasks WHERE subject = ? AND agent = ? AND status = 'open' ORDER BY id LIMIT ?").bind(subject, agent, TASK_LIM.open).all()).results || [])
      .map(r => { const d = jparse(r.data_json, {}); return { id: r.id, kind: r.kind, title: r.title, source: r.source, due: r.due || "", call_id: r.call_id, seq: Number.isInteger(d.seq) ? d.seq : null, words: Array.isArray(d.words) ? d.words : [], ref: r.ref }; });
    const gone = new Set(), stmts = [], day = cairoDay(atMs);
    for (const c of closers) {
      for (const fam of c.families) {
        if (stmts.length && stmts.closedBy === c) break;
        /* the oldest matching open task of that family (a draft for THIS deal first) */
        const cand = open.filter(t => !gone.has(t.id) && t.kind === fam && !(t.call_id === callId && t.seq != null && c.s != null && c.s <= t.seq)
          && (!NEED_WORDS.has(fam) || wordsMatch(fam, t.words, c.words))
          && (!c.writeOnly || ((t.source === "request" || t.source === "promise") && WRITE_RX.test(norm(t.title)) && !SEND_RX.test(norm(t.title))))
          && !(fam === "remind" && t.due && t.due.slice(0, 10) > day));
        /* a follow / deal / search / quote closes every open task about the same thing (shared words); any other tool closes ONE task —
           the oldest (a draft for THIS deal first) */
        const picks = NEED_WORDS.has(fam) ? cand.filter(t => t.words.length).concat(cand.filter(t => !t.words.length).slice(0, 1)) : [(c.deal && cand.find(t => norm(t.ref) === c.deal)) || cand[0]].filter(Boolean);
        if (picks.length) { for (const p of picks) { gone.add(p.id); stmts.push(doneStmt(env, p.id, "done", at, "tool:" + c.name)); } stmts.closedBy = c; break; }
      }
    }
    if (stmts.length) { await env.DB.batch(stmts); closed = stmts.length; }
  }
  return { opened: create.filter(t => !before.has(t.tkey)).length, closed };
}

/* ---------- the open tasks for the next call (first in its context) ---------- */
export const SAID = Object.freeze({ bassem: "باسم قال (مش متأكد)", janna: "جنة قالت (مش متأكدة)", en: "You said (not checked)" }); // = memory.js SAID_AR for Bassem
const SRC_AR = { request: "طلب العضو", promise: SAID.bassem, failed: "لسه ماتمّش", persona: "", tool: "", staff: "" };
const SRC_AR_J = { request: "طلب الزائر", promise: SAID.janna, failed: "لسه ماتمّش", persona: "", tool: "", staff: "" };
const SRC_EN = { request: "Asked by the visitor", promise: SAID.en, failed: "Not done yet", persona: "", tool: "", staff: "" };
/* open tasks, the overdue and the soonest first, then the newest without a date → [{id, line, …}] */
export async function openTasks(env, subject, agent, { limit = TASK_LIM.context } = {}) {
  if (!env || !env.DB || !subject) return [];
  try {
    return ((await env.DB.prepare("SELECT id, kind, title, source, due, call_id, created_at FROM memory_tasks WHERE subject = ? AND agent = ? AND status = 'open' ORDER BY (CASE WHEN due = '' THEN 1 ELSE 0 END), due, id DESC LIMIT ?")
      .bind(subject, agent === "janna" ? "janna" : "bassem", Math.max(1, Math.min(limit, 50))).all()).results || []);
  } catch (e) { return []; } // no 0009 table yet
}
export function taskLine(t, { nowMs = Date.now(), lang = "ar", agent = "bassem" } = {}) {
  const title = llm(t.title, 140); if (!title) return "";
  const en = lang === "en", due = en ? dueEn(t.due, nowMs) : dueAr(t.due, nowMs), src = (en ? SRC_EN : agent === "janna" ? SRC_AR_J : SRC_AR)[t.source] || "";
  return "- " + (src ? src + ": " : "") + title + (due ? " — " + due : "");
}
export async function tasksContext(env, subject, agent, { nowMs = Date.now(), lang = "ar", limit = TASK_LIM.context } = {}) {
  return (await openTasks(env, subject, agent, { limit })).map(t => taskLine(t, { nowMs, lang, agent })).filter(Boolean);
}

/* ---------- the persona's tasks tool (bassem_tasks / janna_tasks, CLIENT tools with awaitResult — data/bassem-memory.js) ----------
   GET  …/tasks?status=open|done|all&limit≤20          → {count, tasks:[{id, title, kind, status, source, due, due_text, created_at}], text}
   POST …/tasks {action:"list"|"add"|"done"|"cancel"|"reopen"|"due", id?, title?, due?, kind?}
        add: title (3–160, never instruction-like), due (YYYY-MM-DD[THH:MM] or words: «بكرة الساعة 10»); done / cancel / reopen / due:
        id (the number the list gives), else the open task whose words match title best. Nothing is ever deleted. */
const ACTIONS = ["list", "add", "done", "cancel", "reopen", "due"];
const taskOut = (t, nowMs, lang) => ({ id: t.id, title: llm(t.title, 160), kind: t.kind, status: t.status, source: t.source, due: t.due, due_text: lang === "en" ? dueEn(t.due, nowMs) : dueAr(t.due, nowMs), created_at: t.created_at, ...(t.done_at ? { done_at: t.done_at } : {}) });
async function listOut(env, subject, agent, status, limit, nowMs, lang) {
  const where = status === "all" ? "" : " AND status = ?", args = status === "all" ? [] : [status];
  const rows = (await env.DB.prepare(`SELECT * FROM memory_tasks WHERE subject = ? AND agent = ?${where} ORDER BY (CASE WHEN status = 'open' THEN 0 ELSE 1 END), (CASE WHEN due = '' THEN 1 ELSE 0 END), due, id DESC LIMIT ?`).bind(subject, agent, ...args, limit).all()).results || [];
  const tasks = rows.map(t => taskOut(t, nowMs, lang)).filter(t => t.title);
  const en = lang === "en";
  const text = !tasks.length ? (en ? (status === "open" ? "No open tasks with this client." : "No tasks found.") : status === "open" ? "مفيش مهام مفتوحة مع العميل ده." : "مفيش مهام.")
    : (en ? (status === "open" ? "Open tasks" : "Tasks") + " (" + tasks.length + "): " : (status === "open" ? "المهام المفتوحة" : "المهام") + " (" + tasks.length + "): ")
      + tasks.map(t => "[" + t.id + "] " + t.title + (t.due_text ? " — " + t.due_text : "") + (status !== "open" ? " (" + (en ? t.status : t.status === "open" ? "مفتوحة" : t.status === "done" ? "خلصت" : "اتلغت") + ")" : "")).join(en ? "; " : "؛ ")
      + (en ? ". To close one: action done with its id." : ". علشان تقفل مهمة: action=done ومعاها الـ id بتاعها.");
  return { count: tasks.length, tasks, text: text.length > 1200 ? text.slice(0, 1199) + "…" : text };
}
async function findTask(env, subject, agent, input) {
  const id = typeof input.id === "number" ? input.id : /^\d{1,12}$/.test(String(input.id || "")) ? +input.id : 0;
  if (id) return env.DB.prepare("SELECT * FROM memory_tasks WHERE id = ? AND subject = ? AND agent = ?").bind(id, subject, agent).first();
  const words = taskWords(String(input.title || input.query || ""));
  if (!words.length) return null;
  const open = (await env.DB.prepare("SELECT * FROM memory_tasks WHERE subject = ? AND agent = ? AND status = 'open' ORDER BY id DESC LIMIT 100").bind(subject, agent).all()).results || [];
  let best = null, n = 0;
  for (const t of open) { const k = overlap(words, taskWords(t.title)); if (k > n) { n = k; best = t; } }
  return best;
}
/* → {status, body} */
export async function tasksApi(env, subject, agent, method, input, { nowMs = Date.now(), callId = "", lang = "ar", readOnly = false } = {}) {
  agent = agent === "janna" ? "janna" : "bassem";
  if (!(await tasksOn(env))) return { status: 503, body: { error: "tasks_off", code: "tasks_off", hint: "apply migrations/0009_memory_upgrades.sql" } };
  const bad = (field, why) => ({ status: 400, body: { error: "invalid", code: "invalid", field, ...(why ? { why } : {}) } });
  input = input && typeof input === "object" ? input : {};
  const action = method === "GET" ? "list" : String(input.action || "list").toLowerCase();
  if (!ACTIONS.includes(action)) return bad("action", ACTIONS.join(" | "));
  if (action === "list") {
    const status = ["open", "done", "cancelled", "all"].includes(String(input.status || "open")) ? String(input.status || "open") : "open";
    const limit = Math.min(Math.max(parseInt(input.limit, 10) || 10, 1), TASK_LIM.list);
    return { status: 200, body: await listOut(env, subject, agent, status, limit, nowMs, lang) };
  }
  if (readOnly) return { status: 403, body: { error: "read_only", code: "read_only" } };
  const at = iso(nowMs);
  if (action === "add") {
    const title = unmask(clean(input.title, TASK_LIM.title));
    if (Array.from(title).length < 3) return bad("title", "required (3–160 characters)");
    if (instructionLike(title, { money: false })) return bad("title", "instruction_like");
    let due = "";
    if (input.due != null && input.due !== "") { const d = String(input.due).trim(); due = dueOk(d) ? d : parseDue(d, nowMs); if (!due) return bad("due", "YYYY-MM-DD, YYYY-MM-DDTHH:MM or words like «بكرة الساعة 10»"); }
    const kind = /^[a-z]{2,12}$/.test(String(input.kind || "")) ? String(input.kind) : familyOf(title);
    const t = { tkey: await hash("a:" + kind + ":" + (taskWords(title).sort().join(" ") || norm(title))), kind, title, source: "persona", due, seq: null, words: taskWords(title) };
    await stmtUpsert(env, subject, agent, callId, t, at).run();
    const row = await env.DB.prepare("SELECT * FROM memory_tasks WHERE subject = ? AND agent = ? AND tkey = ?").bind(subject, agent, t.tkey).first();
    if (row && row.status !== "open") await env.DB.prepare("UPDATE memory_tasks SET status = 'open', done_at = '', done_by = '', updated_at = ? WHERE id = ?").bind(at, row.id).run();
    const out = taskOut({ ...row, status: "open", done_at: "" }, nowMs, lang);
    return { status: 201, body: { ok: true, task: out, text: (lang === "en" ? "Task saved: " : "اتسجّلت المهمة: ") + out.title + (out.due_text ? " — " + out.due_text : "") + " [" + out.id + "]" } };
  }
  const t = await findTask(env, subject, agent, input);
  if (!t) return { status: 404, body: { error: "no_task", code: "no_task", text: lang === "en" ? "No such task. List the open tasks first." : "مالقيتش المهمة دي. اطلب قايمة المهام المفتوحة الأول." } };
  if (action === "due") {
    const d = String(input.due || "").trim(), due = d === "" ? "" : dueOk(d) ? d : parseDue(d, nowMs);
    if (d && !due) return bad("due", "YYYY-MM-DD, YYYY-MM-DDTHH:MM or words");
    await env.DB.prepare("UPDATE memory_tasks SET due = ?, updated_at = ? WHERE id = ?").bind(due, at, t.id).run();
  } else if (action === "reopen") await env.DB.prepare("UPDATE memory_tasks SET status = 'open', done_at = '', done_by = '', updated_at = ? WHERE id = ?").bind(at, t.id).run();
  else await env.DB.prepare("UPDATE memory_tasks SET status = ?, done_at = ?, done_by = 'persona', updated_at = ? WHERE id = ?").bind(action === "done" ? "done" : "cancelled", at, at, t.id).run();
  const row = await env.DB.prepare("SELECT * FROM memory_tasks WHERE id = ?").bind(t.id).first(), out = taskOut(row, nowMs, lang);
  const said = lang === "en" ? { done: "Marked done: ", cancel: "Cancelled: ", reopen: "Reopened: ", due: "New date: " } : { done: "اتقفلت (خلصت): ", cancel: "اتلغت: ", reopen: "اتفتحت تاني: ", due: "الميعاد الجديد: " };
  return { status: 200, body: { ok: true, task: out, text: said[action] + out.title + (out.due_text ? " — " + out.due_text : "") } };
}

/* ---------- daily maintenance (daily.js): what the platform's own tables say is over → done / cancelled, bounded ---------- */
/* review 2026-11-19 #2: bounded by the cron tick's D1 budget (`left()` = statements still allowed; the caller's budgetDB) — the follows /
   deals of a subject are read once for all his tasks, and `after` = {follow, deal} (the last task ids checked) makes the next day start
   where this one stopped, so no task waits for ever behind the first ones. → {…counts, after, more} */
export async function maintainTasks(env, nowMs = Date.now(), { limit = 300, left = () => Infinity, after = {} } = {}) {
  if (!(await tasksOn(env))) return { skipped: "no 0009 table" };
  const at = iso(nowMs), today = cairoDay(nowMs), out = { meetings: 0, registered: 0, follows: 0, deals: 0, after: { follow: 0, deal: 0 }, more: false };
  /* a meeting whose day is over */
  out.meetings = (await env.DB.prepare("UPDATE memory_tasks SET status = 'done', done_at = ?, done_by = 'cron:past', updated_at = ? WHERE id IN (SELECT id FROM memory_tasks WHERE status = 'open' AND kind = 'meeting' AND due != '' AND substr(due, 1, 10) < ? LIMIT ?)").bind(at, at, today, limit).run()).meta.changes || 0;
  /* Janna's «يكمّل التسجيل» once the visitor is a member */
  try { out.registered = (await env.DB.prepare("UPDATE memory_tasks SET status = 'done', done_at = ?, done_by = 'cron:registered', updated_at = ? WHERE id IN (SELECT t.id FROM memory_tasks t JOIN janna_visitors v ON t.subject = 'v:' || v.visitor_id WHERE t.status = 'open' AND t.kind = 'register' AND v.member_id != '' LIMIT ?)").bind(at, at, limit).run()).meta.changes || 0; } catch (e) { /* no janna_visitors */ }
  /* from the last id checked, then from the start again (a wrap-around cursor) */
  const pick = async (kind, from) => {
    const q = "SELECT id, subject, title, data_json FROM memory_tasks WHERE status = 'open' AND kind = ? AND agent = 'bassem' AND id > ? ORDER BY id LIMIT ?";
    let rows = (await env.DB.prepare(q).bind(kind, from, limit).all()).results || [];
    if (rows.length < limit && from > 0) rows = rows.concat(((await env.DB.prepare(q).bind(kind, 0, limit - rows.length).all()).results || []).filter(r => r.id <= from));
    return rows;
  };
  const step = async (kind, read, hit, by) => {
    const cache = new Map(), rows = await pick(kind, Math.max(0, parseInt(after[kind], 10) || 0));
    let last = Math.max(0, parseInt(after[kind], 10) || 0);
    for (const t of rows) {
      if (left() < 4) { out.more = true; break; }
      if (!cache.has(t.subject)) { let r = []; try { r = (await read(t.subject)) || []; } catch (e) { r = []; } cache.set(t.subject, r); }
      const words = jparse(t.data_json, {}).words || taskWords(t.title), m = words.length ? hit(words, cache.get(t.subject)) : null;
      if (m) { await doneStmt(env, t.id, "done", at, by(m)).run(); out[kind === "follow" ? "follows" : "deals"]++; }
      last = t.id;
    }
    out.after[kind] = last;
  };
  /* a failed follow that has been saved since (the follows table has its label / ref) */
  await step("follow", sub => env.DB.prepare("SELECT label, ref_id FROM follows WHERE user_id = ? LIMIT 200").bind(sub).all().then(r => r.results), (words, rows) => rows.find(r => wordsMatch("follow", words, taskWords((r.label || "") + " " + (r.ref_id || "")))), () => "cron:followed");
  /* a deal request / failed deal whose deal now exists (started from the screen, or since won / lost) → done */
  await step("deal", sub => env.DB.prepare("SELECT title, stage FROM deals WHERE member_id = ? ORDER BY updated_at DESC LIMIT 100").bind(sub).all().then(r => r.results), (words, rows) => rows.find(r => overlap(words, taskWords(r.title)) >= Math.min(2, words.length)), d => "cron:deal_" + (d.stage || "open"));
  return out;
}
