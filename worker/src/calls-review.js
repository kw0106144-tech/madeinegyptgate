/* The automatic review of ONE conversation with Janna or Bassem for the daily calls report («تقرير مكالمات جنة وباسم اليومي», owner
   2026-11-20: «… عشان ابقي عارف مين بيزورنا وهل هي بترد صح ولا لا»). PURE: no I/O, no clock, no secrets — calls-report.js builds the
   conversation from Anam (analytics + the session's tool calls; the transcript only while analytics is not ready) or, when Anam cannot
   be read, from Bassem's / Janna's memory in D1, and hands it here; calls-render.js prints the result.
   Every verdict is an «تقييم تلقائي» (an automatic rating): deterministic rules, each flag with its turn numbers and at most one masked
   quote as the evidence. Nothing here ever returns raw call text: every quote is masked (text.js maskPII — written, spoken and
   foreign-language e-mails and phone numbers, 9–15-digit runs) and cleaned (forLLM), cut to 140 characters, and a link is reduced to
   its domain («لينك example.com»).
   Phase 1 rules (report spec §7): R1 promise_no_tool · R2 zero_results · R3 off_target · R4 competitor_offered · R5 last_user_unanswered
   (≥ 8 s of silence after the caller's last words) · R6 dissatisfied · R7 unverified_claim · R8 long_turn (> 30 s) · R9 bad_tag (a [..]
   outside the 12 style cues) · R10 foreign_script · R11 gulf_words · R12 link_read · R14 ui_trouble · R15 stt_noise · R16 slow_turn
   (first audio > 6 s) · R17 tool_failed · R18 nudge_after_promise · R19 no_next_step · R20 short / never joined. R13 price_mismatch is
   phase 2 (the spoken number forms of acc-plans.js). Rules that need Anam's timing or tool calls are «مش متاح» (`na`) when the turns
   come from the transcript only or from D1.
   conversation in: {agent, lang, mode: "anam" | "transcript" | "d1" | "counts", short, startMs, endMs, turns: [{i, user, persona, uStart,
   uEnd, pStart, pStop, firstAudio, speak, interrupted, origin: "engine" | "typed" | "", tools: [{name, status, args, result, error}]}],
   searches?: [{tool, query, count, titles}] (D1 mode), outcome: {inquiries[], meetings[], follows, tasks, registration, profile,
   emails_sent, wa_sent, deals}, d1Rows (any platform row that confirms an action), places: [names of governorates / cities]} */
import { norm, maskPII, forLLM, STOP } from "./text.js";

export const STYLE_TAGS = Object.freeze(["happy", "warm", "playful", "curious", "supportive", "concerned", "sad", "surprised", "angry", "distressed", "neutral", "laughter"]);
export const LIM = Object.freeze({ quote: 140, quotesPerSide: 2, longTurnS: 30, slowTurnS: 6, silenceMs: 8000, echo: 160, titles: 3, searches: 12 });
export const VERDICTS = Object.freeze(["not_useful", "partial", "useful", "no_ask", "short", "no_consent"]);
export const ASKS = Object.freeze(["supplier_search", "demand_search", "contact_request", "platform_question", "procedure", "none"]);
const BUSINESS = new Set(["supplier_search", "demand_search", "contact_request"]);
const GENERAL = new Set(["platform_question", "procedure"]);
/* the rules a missing source cannot judge: no timing / tool calls without Anam's analytics; nothing at all without recording consent */
const NA_TRANSCRIPT = ["promise_no_tool", "nudge_after_promise", "slow_turn", "zero_results", "off_target", "tool_failed"];
const NA_D1 = ["promise_no_tool", "nudge_after_promise", "slow_turn", "long_turn", "last_user_unanswered", "bad_tag"];

/* ---------- the patterns (run on norm()ed text unless they say «raw»: lower case, no diacritics, أإآ → ا, ة → ه, ى → ي, punctuation → space) ---------- */
/* U9's promise to search (report spec R1): a search / look-up verb. A bare «ثواني» / "one moment" is only a stall when the turn says
   little else (≤ 6 words): «ثواني أقولك: الباقة الأساسية …» answers at once — it is no promise without a tool (review 2026-11-20) */
export const PROMISE_RX = /(^| )(بدور|هدور|هجرب|ببحث|هبحث|بشوفلك|هشوفلك|بفتحلك|هفتحلك)|let me (check|search|look)/;
const STALL_RX = /(^| )ثواني|one moment/;
export const promised = np => PROMISE_RX.test(np) || (STALL_RX.test(np) && np.split(" ").filter(Boolean).length <= 6); // np = norm()ed
/* a seller: a factory / company / supplier looking for work, customers or tenders. «إحنا شركة …» alone says what he IS: with a firm wish
   to BUY (a supplier, raw material) and no wish to sell, he is a buyer (review 2026-11-20: a contractor «… ومحتاجين مورد حديد» is no seller) */
const SELF_RX = /(^| )(احنا|انا) (مصنع|شركه|مورد|موردين)/;
const SELL_WANT_RX = /(^| )[وف]?(بنصنع|بننتج|بنورد|بنكسي|بنجلخ)|(^| )[وف]?(عايز|عاوز|محتاج|عايزين|محتاجين|بدور علي) (فرص|فرصه|شغل|عملا|عميل|مشترين|مشتري|طلبات|مناقصات|زباين)/;
export const SELL_RX = new RegExp(SELF_RX.source + "|" + SELL_WANT_RX.source);
export const BUY_RX = /(^| )[وف]?(عايز|عاوز|محتاج|عايزين|محتاجين|بدور علي|بدور عن|ابغي|نفسي) (اشتري|نشتري|مورد|موردين|مصنع|مصانع|حد يوردلي|خامه|خامات)|(^| )(بشتري|هشتري|نشتري)( |$)|(^| )(looking for|need|want to buy)( a| an)? (supplier|manufacturer|factory|vendor)/;
const BUY_FIRM_RX = /(^| )[وف]?(عايز|عاوز|محتاج|عايزين|محتاجين|بدور علي|بدور عن|ابغي|نفسي) (اشتري|نشتري|مورد|موردين|حد يوردلي|خامه|خامات)|(^| )(بشتري|هشتري|نشتري)( |$)|(^| )(looking for|need|want to buy)( a| an)? (supplier|vendor)/;
/* R5: a goodbye / thanks is no question left without an answer (the caller closes the call after it; Anam notices the closed tab later) */
const BYE_RX = /^(?:(?:طيب|تمام|ماشي|اوك|اوكي|خلاص|حاضر|اه|ايوه|ok|okay)\s+)*(?:شكرا|متشكر|متشكره|متشكرين|مرسي|الف شكر|تسلمي|تسلم|مع السلامه|سلام|باي|thanks|thank you|bye|goodbye)(?:\s+(?:جدا|جزيلا|ليكي|ليك|يا جنه|يا باسم|يا فندم|كتير|خالص|مع السلامه|سلام|باي|you|so much|a lot|bye))*$/;
const CONTACT_RX = /(^| )(رقم (تليفون|التليفون|موبايل|الموبايل|المصنع|الشركه|التواصل)|رقمهم|رقمه|تليفونهم|تليفون|تلفون|عنوانهم|عنوان|اتواصل مع|اكلمهم|اكلمه|phone number|contact them)( |$)/;
const PLATFORM_RX = /(^| )(الباقات|باقه|الباقه|الاشتراك|اشتراك|بكام|التسجيل|اسجل|الدفع|ادفع|price of the plan|subscription|register)( |$)/;
const PROCEDURE_RX = /(^| )(سجل تجاري|السجل التجاري|ضرايب|ضرائب|الضريبه|ترخيص|رخصه|شهاده|شهادات|جمارك|الجمارك|اجراءات|الاجراءات|customs|licen[cs]e|certificate)( |$)/;
/* R6 — the reviewed regex */
export const DISSATISFIED_RX = /مستفدتش|ما ?استفدتش|مش مفيد|مالوش لازمه|زهقت|مش ده اللي|كلام عام|مضيعه وقت|didn ?t help|useless/;
/* R7 — «اتبعت / اتسجّل / اتحفظ / تم الإرسال / sent …»; a conditional («لو اتسجلت») or a question is no claim */
const CLAIM_RX = /(^| )(اتبعت|اتبعتت|اتسجل|اتسجلت|اتحفظ|اتحفظت|تم (ال)?ارسال|تم ارساله|بعتلك|بعتهولك|sent|submitted|saved)( |$)/;
const COND_RX = /(^| )(لو|لما|اول ما|بعد ما|ممكن|if|once|when|will)( |$)/;
export const GULF_RX = /(^| )(يا هلا|حياك|زين|وايد|شلونك|ايش|هلا والله|ابشر|الحين)( |$)/;
const LINK_SPOKEN_RAW = /https?:\/\/|www\.|\.com\b|دوت كوم|dot com/i;
export const UI_RX = /فين احط|مش لاقي|مش ظاهر|ما ?فيش حاجه علي الشاشه|مش عارف (ا)?فتح|مش شايف/;
/* R15 — speech-to-text phantoms (YouTube-subtitle lines the recogniser invents in silence) and the persona's «I did not hear you» */
const PHANTOM_RX = /اشتركوا في القناه|اشترك في القناه|شكرا للمشاهده|شكرا علي المشاهده|(^| )ترجمه (نانسي|محمد)|نانسي قنقر|subscribe to the channel|thanks for watching/;
const NOT_HEARD_RX = /ماسمعتش|مسمعتش|ما سمعتش|مش سامع|مش سامعه|مش سامعاك|الصوت مش واضح|الصوت بيقطع|ممكن تعيد|تعيد تاني|didn ?t (catch|hear)|could you repeat|sorry i missed/;
/* R3 — the persona calls results related / suitable */
const RELATED_RX = /(^| )(مرتبط|مرتبطه|مرتبطين|ليها علاقه|مناسب|مناسبه|مناسبين|تناسب|تناسبك|related|relevant|matching)( |$)/;
const COMPETITOR_RX = /(^| )(منافس|منافسين|منافسه|منافسيني|منافسينا|competitor|competitors)( |$)/;
const OFFER_RX = /(^| )(افتحلك|افتحهولك|افتحها|اوريك|اعرضلك|اعرضهولك|ملف|ملفه|بروفايل|تحب|تحبي|تشوف|اوصلك|عايز تشوف)/;
const PROFILE_RX = /(^| )(ملف|ملفك|بروفايل|صفحه شركتك|سجل|تسجل|اسجلك|التسجيل|باقه|الباقه|عضويه|profile|register|registration)/;
const NOANS_RX = /معنديش معلومه|معنديش معلومات|مش متاكده|مش متاكد|مقدرش افيدك|ماقدرش افيدك|مش عارفه|ارجع للجهه|مش متاح عندي|i don ?t have (that|this) information|i m not sure/;
/* R17 — the soft-error texts the lookup answers a malformed call with (index.js LOOKUP_TEXT, normalised), and an {error} answer */
const SOFT_ERR_RX = /طلب البحث وصل ناقص|مفيش كلمه بحث في الطلب|query required|bad json/;
const CODE_RAW = /\b(errMsg|undefined|NaN)\b|\[object Object\]|function\s*\(|=>|\{"|<\/?(div|span|br|script)\b/;
const CYRILLIC = /[Ѐ-ӿ]/, CJK = /[぀-ヿ㐀-鿿가-힯]/;
const SEARCH_TOOLS = /^(janna_lookup|janna_search|bassem_intel|platform_item|janna_item|bassem_web_search|knowledge_lookup)$/;
const ZERO_TOOLS = /^(janna_lookup|janna_search|bassem_intel|platform_item|janna_item)$/;
const FACTORY_SECTIONS = /^(factories|suppliers|products|market)$/;
const OPEN_TOOLS = /^(platform_item|janna_item|janna_navigate|bassem_open_item|janna_open_item)$/;
const OUTCOME_TOOLS = /^(janna_submit_form|janna_fill_registration|janna_follow|janna_schedule_meeting|janna_book_meeting|janna_start_meeting|bassem_save_profile|bassem_notify_member|bassem_tasks|janna_tasks)$/;

/* ---------- small helpers ---------- */
const s = v => (v == null ? "" : String(v));
const N = v => norm(s(v));
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const uniq = a => [...new Set(a)];
/* content words of a text: normalised, no stop words, the article / one attached و dropped (concrete-answer bigrams, query words) */
export const words = t => N(t).split(" ").filter(w => w.length > 1 && !STOP.has(w)).map(w => w.replace(/^و(?=\S{3,})/, "").replace(/^ال(?=\S{3,})/, "")).filter(w => w.length > 1);
/* a link in a quote shows as its domain only */
const linkToDomain = t => s(t).replace(/\bhttps?:\/\/([^\s/?#]+)[^\s]*/gi, (m, d) => "لينك " + d.replace(/^www\./i, "").toLowerCase()).replace(/\bwww\.([a-z0-9-]+\.[a-z.]{2,})[^\s]*/gi, (m, d) => "لينك " + d.toLowerCase());
/* every quote: links → domain, contacts masked (text.js), cleaned for display (forLLM: no markers, brackets or «»), ≤ 140 characters */
export const quote = (t, max = LIM.quote) => { const v = forLLM(maskPII(linkToDomain(t)), max); return v; };
export const domainsOf = t => uniq((s(t).match(/\bhttps?:\/\/([^\s/?#]+)/gi) || []).map(u => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase())).slice(0, 3);
/* a tool result as Anam returns it (a JSON string, an object, or text) → an object ({} when it is not JSON) */
export function parseResult(r) {
  if (r && typeof r === "object") return r;
  const t = s(r).trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return t ? { _text: t.slice(0, 2000) } : {};
  try { const o = JSON.parse(t); return o && typeof o === "object" ? (Array.isArray(o) ? { results: o } : o) : {}; } catch (e) { return { _text: t.slice(0, 2000) }; }
}
/* the public titles a result list carries (directory names, tender / RFQ titles, product names) */
const titleOf = x => (x && typeof x === "object" ? s(x.name || x.title || x.title_ar || x.product || x.label || x.title_en || "") : "");
export function resultsOf(o) {
  if (!o || typeof o !== "object") return [];
  if (Array.isArray(o.results)) return o.results.filter(x => x && typeof x === "object");
  if (o.item && typeof o.item === "object") return [o.item];
  if (o.found === true && (o.name || o.title)) return [o];
  return [];
}
/* zero results: count 0, found:false, or an empty list with no count (report spec R2) */
export function isZero(o) {
  if (!o || typeof o !== "object") return false;
  if (o.found === false) return true;
  if (typeof o.count === "number") return o.count === 0;
  if (Array.isArray(o.results)) return o.results.length === 0;
  return /لا توجد نتائج مطابقه|مفيش نتايج|مالقيتش/.test(N(o.text || o._text || ""));
}
const countOf = o => (o && typeof o.count === "number" ? o.count : resultsOf(o).length);
const failedTool = t => t.status === "failed" || !!t.error || (t.parsed && (typeof t.parsed.error === "string" || SOFT_ERR_RX.test(N(t.parsed.text || t.parsed._text || ""))));
const argOf = (t, k) => (t && t.args && typeof t.args === "object" && t.args[k] != null ? s(t.args[k]) : "");

/* ---------- self-description («قال في المكالمة — مش متأكد») ---------- */
const TITLE_W = "(?:مهندس|باشمهندس|بشمهندس|دكتور|دكتوره|أستاذ|استاذ|أستاذة|استاذه|مدام|حاج|كابتن)";
const NAME_RX = new RegExp("(?:^|\\s)(?:أنا|انا|معاك|معاكي|اسمي|انا اسمي)\\s+(?:ال)?(" + TITLE_W + ")?\\s*([\\u0621-\\u064A]{2,15})(?:\\s+(من|بتاع|صاحب|مدير|في)(?=\\s|$))?", "u");
const NOT_NAME = new Set(["عايز", "عاوز", "محتاج", "مش", "مستفدتش", "بدور", "بسأل", "كنت", "هنا", "فاهم", "فاهمه", "شغال", "صاحب", "مدير", "مسؤول", "من", "في", "بس", "لسه", "عندي",
  "متشكر", "كويس", "تمام", "موجود", "معاك", "معاكي", "سامع", "سامعك", "اسف", "آسف", "عارف", "شايف", "بقول", "بتكلم", "بكلمك", "قلتلك", "قولتلك", "اللي", "ده", "دي", "مصنع", "شركة", "شركه",
  "مهتم", "عضو", "مسجل", "زائر", "جديد", "عميل", "بايع", "مشتري", "طالب", "بشتغل", "اشتغل", "ابغى", "ابغي", "ممكن", "لا", "اه", "ايوه", "يعني", "والله", "طيب", "فين", "مين"]);
const COMPANY_RX = /(?:^|\s)(?:من|بتاع|بتاعة|إحنا|احنا|أنا|انا|عندي|عندنا|اسمها|اسمه|اسم)\s+(?:في\s+)?((?:مصنع|شركة|شركه|مجموعة|مجموعه|مؤسسة|مؤسسه|مكتب)(?:\s+[^\s،,.؟?!]{2,20}){1,4})/u;
const BRAND_RX = /\b([A-Z][\w&.-]{1,20}(?:\s+[A-Z][\w&.-]{1,20}){0,3}\s+(?:Group|Co|Company|Industries|Factory|Trading|Corp))\b/;
const COMPANY_STOP = /^(في|بتاع|اللي|و|وانا|وعايز|عايز|عاوز|بس|علشان|عشان|لـ|ل)$/;
/* a place said as a whole word, or with a joined و / ب / ف / لل before its «ال» («بالقاهرة»): «مطروحة» is no Matrouh, «بدري» no Badr */
const saidPlace = (nu, p) => { const w = N(p); return !!w && (nu.includes(" " + w + " ") || (/^ال/.test(w) && (["و", "ب", "ف"].some(x => nu.includes(" " + x + w + " ")) || nu.includes(" لل" + w.slice(2) + " ")))); };
export function selfDescription(turns, places = [], agent = "janna") {
  const o = { title: "", first: "", company: "", place: "", links: [], echo: "" };
  for (const t of turns) {
    const u = s(t.user); if (!u || t.noise) continue;
    if (!o.first) { const m = NAME_RX.exec(u); if (m && !NOT_NAME.has(m[2]) && (m[1] || m[3] || /اسمي|معاك/.test(m[0]))) { o.title = s(m[1]); o.first = m[2]; } }
    if (!o.company) {
      const m = COMPANY_RX.exec(u);
      if (m) { const w = m[1].split(/\s+/), out = [w[0]]; for (const x of w.slice(1)) { if (COMPANY_STOP.test(x)) break; out.push(x); } if (out.length > 1) o.company = out.slice(0, 5).join(" "); }
      if (!o.company) { const b = BRAND_RX.exec(u); if (b) o.company = b[1]; }
    }
    if (!o.place) { const nu = " " + N(u) + " "; for (const p of places) if (p && saidPlace(nu, p)) { o.place = p; break; } }
    for (const d of domainsOf(u)) if (!o.links.includes(d) && o.links.length < 3) o.links.push(d);
  }
  for (const t of turns) { // the persona's own echo of what the caller does («فهمت إن …»)
    const m = /(?:فهمت|فاهمة|فاهمه|فاهم)\s+(?:إن|ان|أن)\s+([^.!?؟\n]{5,400})/u.exec(s(t.persona));
    if (m) { o.echo = quote(m[1], LIM.echo); break; }
  }
  o.company = o.company ? quote(o.company, 60) : ""; o.first = o.first ? quote(o.first, 30) : ""; o.title = o.title ? quote(o.title, 20) : "";
  return o;
}

/* ---------- the review ---------- */
export function reviewConversation(c) {
  c = c || {};
  const agent = c.agent === "bassem" ? "bassem" : "janna", mode = c.mode || "anam";
  const out = { agent, mode, flags: [], na: [], ask: "none", askTurn: null, askQuote: "", personaQuote: "", seller: false, buyer: false, concrete: false, outcome: "",
    verdict: "partial", correct: true, wrong: [], searches: [], zeroQueries: [], zeroCounts: {}, noise: 0, productWords: [], generalUnanswered: false, offeredProfile: false, self: null, turns: 0, tools: 0 };
  if (c.short) { out.verdict = "short"; return out; }
  if (mode === "counts") { // a meeting without recording consent: counts, the outcome and the booking only — nothing of what was said
    out.verdict = "no_consent"; out.turns = (c.turns || []).length; out.tools = (c.turns || []).reduce((n, t) => n + ((t.tools || []).length), 0);
    out.outcome = outcomeKind(c.outcome); return out;
  }
  if (mode === "transcript") out.na.push(...NA_TRANSCRIPT);
  if (mode === "d1") out.na.push(...NA_D1);
  const na = new Set(out.na);
  const turns = (c.turns || []).map(t => ({ ...t, user: s(t.user), persona: s(t.persona), tools: (t.tools || []).map(x => ({ ...x, name: s(x.name).toLowerCase(), parsed: parseResult(x.result) })) }));
  out.turns = turns.length;
  /* one flag per rule: its turns (and seconds / tags) accumulate, `n` adds up, the first quote stays */
  const flag = (code, o) => {
    if (na.has(code)) return;
    o = o || {}; let f = out.flags.find(x => x.code === code);
    if (!f) { f = { code, turns: [] }; out.flags.push(f); }
    if (o.turns) f.turns = uniq([...f.turns, ...o.turns]).sort((a, b) => a - b);
    for (const k of ["secs", "tags"]) if (o[k]) f[k] = k === "tags" ? uniq([...(f[k] || []), ...o[k]]) : [...(f[k] || []), ...o[k]];
    if (o.n) f.n = (f.n || 0) + o.n;
    if (o.s != null) f.s = Math.max(f.s || 0, o.s);
    if (o.q && !f.q) f.q = o.q;
  };
  const qUsed = { user: 0, persona: 0 }, q = (side, text) => { if (!text || qUsed[side] >= LIM.quotesPerSide) return ""; const v = quote(text); if (v) qUsed[side]++; return v; };

  /* R15 — noise first: phantom lines leave the ask and the quotes */
  let lastStop = null;
  for (const t of turns) {
    const nu = N(t.user);
    if (nu && (PHANTOM_RX.test(nu) || (nu === "شكرا" && lastStop != null && num(t.uStart) != null && t.uStart - lastStop < 1000))) { t.noise = true; out.noise++; }
    if (t.persona && NOT_HEARD_RX.test(N(t.persona))) out.noise++;
    if (num(t.pStop) != null) lastStop = t.pStop;
  }
  if (out.noise) flag("stt_noise", { n: out.noise });
  const userTurns = turns.filter(t => t.user && !t.noise);

  /* the caller: seller / buyer, the ask label (one per call) */
  const anyUser = rx => userTurns.some(t => rx.test(N(t.user)));
  out.seller = anyUser(SELL_WANT_RX) || (anyUser(SELF_RX) && !anyUser(BUY_FIRM_RX));
  out.buyer = !out.seller && anyUser(BUY_RX);
  const tools = turns.flatMap(t => t.tools.map(x => ({ ...x, turn: t.i })));
  if (Array.isArray(c.searches)) for (const x of c.searches) tools.push({ name: s(x.tool).toLowerCase(), status: "completed", args: { query: x.query, section: x.section || "" }, parsed: { count: x.count, results: (x.titles || []).map(n => ({ name: n })) }, turn: null, fromMemory: true });
  out.tools = tools.length;
  const factorySearch = tools.some(x => /^(janna_lookup|janna_search)$/.test(x.name) && (!argOf(x, "section") || FACTORY_SECTIONS.test(argOf(x, "section"))));
  const pick = (rx, label) => { for (const t of userTurns) if (rx.test(N(t.user))) return { label, t }; return null; };
  const searchedFor = () => { // the persona searched factories / suppliers / products for his need: the caller's words just before that search
    const x = tools.find(y => /^(janna_lookup|janna_search)$/.test(y.name) && y.turn != null && (!argOf(y, "section") || FACTORY_SECTIONS.test(argOf(y, "section"))));
    const before = x ? userTurns.filter(t => t.i <= x.turn && N(t.user).length >= 6) : [];
    const t = before.length ? before[before.length - 1] : userTurns.find(u => N(u.user).length >= 6);
    return t ? { label: "supplier_search", t } : null;
  };
  const ask = (out.seller && pick(SELL_RX, "demand_search")) || (out.buyer && pick(BUY_RX, "supplier_search")) || pick(CONTACT_RX, "contact_request")
    || (factorySearch && !out.seller ? searchedFor() : null) || pick(PLATFORM_RX, "platform_question") || pick(PROCEDURE_RX, "procedure");
  if (ask) { out.ask = ask.label; out.askTurn = ask.t.i; out.askQuote = q("user", ask.t.user); }

  /* searches: counts, at most 3 public titles, off-target, zero results */
  const allTitles = [];
  for (const x of tools) {
    if (!SEARCH_TOOLS.test(x.name)) continue;
    const res = resultsOf(x.parsed), zero = ZERO_TOOLS.test(x.name) && isZero(x.parsed), qy = argOf(x, "query") || argOf(x, "title") || argOf(x, "q");
    const qw = words(qy), titles = res.map(titleOf).filter(Boolean);
    const matchTags = res.map(r => s(r.match)).filter(Boolean);
    /* off-target: U1 tags each result match all | partial | related; before U1, not one query word in the returned titles (directory and tender searches only) */
    const off = !zero && titles.length > 0 && /^(janna_lookup|janna_search|bassem_intel)$/.test(x.name) && (matchTags.length ? !matchTags.includes("all")
      : qw.length > 0 && !titles.some(tt => { const tw = words(tt); return qw.some(w => tw.some(z => z === w || (w.length >= 4 && z.startsWith(w)))); }));
    for (const tt of titles) allTitles.push(tt);
    if (out.searches.length < LIM.searches) out.searches.push({ tool: x.name, section: argOf(x, "section"), query: qy ? quote(qy, 80) : "", count: countOf(x.parsed), titles: titles.slice(0, LIM.titles).map(tt => quote(tt, 80)), off, zero, turn: x.turn, memory: !!x.fromMemory });
    if (zero) { flag("zero_results", { turns: x.turn != null ? [x.turn] : [], n: 1 }); if (qy) { const k = quote(qy, 80); if (!out.zeroQueries.includes(k)) out.zeroQueries.push(k); out.zeroCounts[k] = (out.zeroCounts[k] || 0) + 1; } }
    if (failedTool(x)) flag("tool_failed", { turns: x.turn != null ? [x.turn] : [] });
  }
  for (const x of tools) if (!SEARCH_TOOLS.test(x.name) && failedTool(x)) flag("tool_failed", { turns: x.turn != null ? [x.turn] : [] });
  /* his product: the persona's own lookup queries, the one sharing the most words with what the caller said first (a seller's searches are
     often for his customers' industries too) */
  const said = new Set(userTurns.flatMap(t => words(t.user)));
  const qs = uniq(tools.filter(x => /^(janna_lookup|janna_search)$/.test(x.name) && (!argOf(x, "section") || FACTORY_SECTIONS.test(argOf(x, "section")) || /^(tenders|rfqs)$/.test(argOf(x, "section")))).map(x => argOf(x, "query")).filter(Boolean));
  out.productWords = qs.map((qq, k) => ({ qq, k, n: words(qq).filter(w => said.has(w)).length })).sort((a, b) => b.n - a.n || a.k - b.k).map(x => x.qq).slice(0, 3);

  /* concrete answer: the persona said ≥ 2 consecutive words of a title or name a non-empty result returned */
  const personaN = turns.map(t => " " + words(t.persona).join(" ") + " ").join(" ");
  out.concrete = allTitles.some(tt => { const w = words(tt); for (let i = 0; i + 1 < w.length; i++) if (personaN.includes(" " + w[i] + " " + w[i + 1] + " ")) return true; return false; });

  /* R1 promise_no_tool + R18 nudge_after_promise */
  if (!na.has("promise_no_tool")) {
    for (let k = 0; k < turns.length; k++) {
      const t = turns[k];
      if (!t.persona || !promised(N(t.persona)) || t.tools.length) continue;
      let late = false;
      for (let j = k + 1; j < turns.length && !turns[j].user; j++) if (turns[j].tools.length) { late = true; break; } // the next persona turn before the next user message
      if (late) continue;
      flag("promise_no_tool", { turns: [t.i], q: q("persona", t.persona) || undefined });
      const nx = turns[k + 1];
      if (nx && !nx.user && nx.origin === "engine" && nx.persona) flag("nudge_after_promise", { turns: [nx.i] });
    }
  }
  /* R3 off_target: the persona called non-matching results related / suitable (same turn or the next one) */
  for (const sr of out.searches) {
    if (!sr.off || sr.turn == null) continue;
    const k = turns.findIndex(t => t.i === sr.turn);
    for (const t of [turns[k], turns[k + 1]].filter(Boolean)) if (t.persona && RELATED_RX.test(N(t.persona))) { flag("off_target", { turns: [t.i] }); break; }
  }
  /* R4 competitor_offered: a seller was offered a factory found by a search for his own product, or said «منافس» */
  if (out.seller) {
    const said = userTurns.find(t => COMPETITOR_RX.test(N(t.user)));
    if (said) flag("competitor_offered", { turns: [said.i], q: q("user", said.user) || undefined });
    const own = new Set(userTurns.flatMap(t => words(t.user)));
    for (const x of tools) {
      if (!/^(janna_lookup|janna_search)$/.test(x.name) || (argOf(x, "section") && !FACTORY_SECTIONS.test(argOf(x, "section")))) continue;
      if (!words(argOf(x, "query")).some(w => own.has(w))) continue; // a search for his own product (his own words)
      const names = resultsOf(x.parsed).map(titleOf).filter(Boolean);
      const k = turns.findIndex(t => t.i === x.turn); if (k < 0) continue;
      for (const t of turns.slice(k, k + 4)) {
        const pn = " " + words(t.persona).join(" ") + " ";
        const named = names.some(nm => { const w = words(nm); for (let i = 0; i + 1 < w.length; i++) if (pn.includes(" " + w[i] + " " + w[i + 1] + " ")) return true; return false; });
        if ((named && OFFER_RX.test(N(t.persona))) || t.tools.some(y => OPEN_TOOLS.test(y.name))) { flag("competitor_offered", { turns: [t.i] }); break; }
      }
    }
  }
  /* R5 last_user_unanswered: ≥ 8 s with no persona output after the caller's last words while the session stayed open */
  if (!na.has("last_user_unanswered")) {
    let k = turns.length - 1; while (k >= 0 && !turns[k].user && !turns[k].persona) k--;
    const t = turns[k];
    if (t && t.user && !t.noise && !t.persona && !BYE_RX.test(N(t.user)) && !turns.slice(k + 1).some(x => x.persona)) {
      const said = num(t.uEnd) != null ? t.uEnd : num(t.uStart), end = num(c.endMs);
      if (said != null && end != null && end - said >= LIM.silenceMs) flag("last_user_unanswered", { turns: [t.i], s: Math.round((end - said) / 1000), q: q("user", t.user) || undefined });
    }
  }
  /* R6 dissatisfied */
  for (const t of userTurns) if (DISSATISFIED_RX.test(N(t.user))) flag("dissatisfied", { turns: [t.i], q: q("user", t.user) || undefined });
  /* R7 unverified_claim: «اتبعت / اتسجّل …» with no confirming tool result and no platform row (inquiry, meeting, task, follow, mail, WhatsApp) */
  const confirmed = !!c.d1Rows || tools.some(x => OUTCOME_TOOLS.test(x.name) && x.status === "completed" && !failedTool(x) && x.parsed && (x.parsed.ok === true || x.parsed.sent === true || !!x.parsed.ref || /اتبعت برقم|ref|MIG-/i.test(s(x.parsed._text || x.parsed.text))));
  if (!confirmed) for (const t of turns) {
    if (!N(t.persona)) continue;
    /* sentence by sentence: a conditional («لو اتسجلت») or a question («هل حضرتك اتسجلت قبل كده؟ لو لأ …») is no claim */
    const claim = t.persona.split(/(?<=[.!؟?\n])/).some(sen => {
      const ns = N(sen), m = CLAIM_RX.exec(ns); if (!m) return false;
      return !COND_RX.test(ns.slice(Math.max(0, m.index - 24), m.index)) && !/(^| )هل( |$)/.test(ns.slice(0, m.index)) && !/[؟?]\s*$/.test(sen.trim());
    });
    if (claim) flag("unverified_claim", { turns: [t.i], q: q("persona", t.persona) || undefined });
  }
  /* R8 long_turn · R16 slow_turn · R9 bad_tag · R10 foreign_script · R11 gulf_words · R12 link_read */
  const userScripts = { cyr: userTurns.some(t => CYRILLIC.test(t.user)), cjk: userTurns.some(t => CJK.test(t.user)) };
  for (const t of turns) {
    if (!t.persona) continue;
    const sp = num(t.speak), fa = num(t.firstAudio);
    if (sp != null && sp > LIM.longTurnS) flag("long_turn", { turns: [t.i], secs: [Math.round(sp)] });
    if (fa != null && fa > LIM.slowTurnS) flag("slow_turn", { turns: [t.i], secs: [Math.round(fa * 10) / 10] });
    const bad = (t.persona.match(/\[([^[\]\n]{1,24})\]/g) || []).map(x => x.slice(1, -1).trim()).filter(x => !STYLE_TAGS.includes(x.toLowerCase()));
    if (bad.length) flag("bad_tag", { turns: [t.i], tags: bad.map(x => forLLM(maskPII(x), 24) || "…") });
    if ((CYRILLIC.test(t.persona) && !userScripts.cyr) || (CJK.test(t.persona) && !userScripts.cjk) || CODE_RAW.test(t.persona)) flag("foreign_script", { turns: [t.i] });
    if (GULF_RX.test(N(t.persona))) flag("gulf_words", { turns: [t.i] });
    if (LINK_SPOKEN_RAW.test(t.persona)) flag("link_read", { turns: [t.i] });
  }
  /* R14 ui_trouble */
  for (const t of userTurns) if (UI_RX.test(N(t.user))) flag("ui_trouble", { turns: [t.i], q: q("user", t.user) || undefined });

  /* the outcome, the next step (R19), a seller never offered a profile, a general question left without an answer */
  out.outcome = outcomeKind(c.outcome);
  const business = BUSINESS.has(out.ask);
  if (business && !out.outcome) flag("no_next_step");
  out.offeredProfile = turns.some(t => PROFILE_RX.test(N(t.persona))) || tools.some(x => /^(janna_fill_registration|janna_navigate)$/.test(x.name) && /register|profile/.test(argOf(x, "page") + argOf(x, "plan")));
  if (GENERAL.has(out.ask)) {
    const k = turns.findIndex(t => t.i === out.askTurn), reply = turns.slice(Math.max(0, k)).find(t => t.persona); // the same turn carries the reply to its words
    out.generalUnanswered = !reply || NOANS_RX.test(N(reply.persona));
  }
  /* a persona quote for the card (what she / he said about the ask): the first persona turn after the ask, else the first long one */
  if (!out.personaQuote) {
    const k = out.askTurn != null ? turns.findIndex(t => t.i === out.askTurn) : -1;
    const t = (k >= 0 ? turns.slice(k).find(x => x.persona && N(x.persona).length > 20) : null) || turns.find(x => x.persona && N(x.persona).length > 40);
    if (t) out.personaQuote = q("persona", t.persona);
  }
  out.self = selfDescription(turns, c.places || [], agent);

  /* the verdict (an automatic rating) and «صح / فيه غلط» */
  const has = code => out.flags.some(f => f.code === code);
  const answeredGeneral = GENERAL.has(out.ask) && !out.generalUnanswered;
  const good = out.concrete || !!out.outcome || answeredGeneral;
  if (has("dissatisfied")) out.verdict = "not_useful";
  else if (out.ask === "none" && !tools.length) out.verdict = "no_ask";
  else if ((has("last_user_unanswered") && business) || (business && !out.concrete && !out.outcome) || (has("promise_no_tool") && !out.concrete)) out.verdict = "not_useful";
  else if (good && ["promise_no_tool", "off_target", "competitor_offered", "unverified_claim", "no_next_step"].some(has)) out.verdict = "partial";
  else if (good) out.verdict = "useful";
  else out.verdict = "partial";
  out.wrong = ["off_target", "competitor_offered", "unverified_claim"].filter(has);
  out.correct = !out.wrong.length;
  return out;
}
/* the strongest outcome the platform recorded for the call */
export function outcomeKind(o) {
  o = o || {};
  if ((o.inquiries || []).some(x => x.kind !== "signup")) return "rfq";
  if ((o.meetings || []).length) return "meeting";
  if (o.registration || (o.inquiries || []).some(x => x.kind === "signup")) return "registration";
  if (o.follows > 0) return "follow";
  if (o.profile) return "profile";
  if (o.tasks > 0) return "task";
  return "";
}

/* ---------- the memory join (report spec §6, join 4): the session's caller turns against the memory turns of the same agent ---------- */
/* turns: the session's caller texts (raw); rows: [{subject, text}] of advisor_memory role-user turns in [start − 1 min, end + 10 min] → {subject, confidence: "likely" |
   "unsure"} | null. The texts are cleaned like the page writes them (memory.js clean: masked, ≤ 600) before norm() compares them. */
export function memoryJoin(turns, rows, cleanFn) {
  const mine = turns.map(t => N(cleanFn ? cleanFn(t) : t)).filter(Boolean);
  if (!mine.length || !rows || !rows.length) return null;
  const set = new Map(); for (const t of mine) set.set(t, (set.get(t) || 0) + 1);
  const by = new Map();
  /* a turn counts only with ≥ 8 normalised characters («أيوه» / «تمام» are in every call); «مش متأكد» needs one of ≥ 30 */
  for (const r of rows) { const k = N(r.text); if (k.length < 8 || !set.has(k)) continue; const e = by.get(r.subject) || { n: 0, long: 0, seen: new Set() }; if (e.seen.has(k)) continue; e.seen.add(k); e.n++; if (k.length >= 30) e.long++; by.set(r.subject, e); }
  let best = null; for (const [subject, e] of by) if (!best || e.n > best.n) best = { subject, ...e };
  if (!best) return null;
  if (best.n >= 3) return { subject: best.subject, confidence: "likely" };
  if (best.long >= 1) return { subject: best.subject, confidence: "unsure" };
  return null;
}
