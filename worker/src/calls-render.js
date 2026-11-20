/* The daily calls report as an e-mail (HTML + its plain-text mirror) and the team's CSV attachment — PURE (no I/O, no clock, no secrets).
   calls-report.js builds the report object (conversations already reviewed by calls-review.js, identities already masked by the detail
   setting) and sends what this module returns through the e-mail center (template team_calls_report).
   The rules of the body (report spec §8, §11; privacy spec): Arabic first, RTL, inline CSS, no images, only the platform's own links,
   Arabic-Indic digits in the Arabic text; «الخلاصة» ≤ 6 lines, then at most 15 cards of the customer conversations that need a look
   (worst first, 5 lines each), one line for every other conversation, the team's questions, the team tests, the system notes, the
   English twin and the footer. The body NEVER carries an Anam session id, a clientLabel tag, a rule code or a developer reference: they
   go to calls-<day>.csv (UTF-8 with BOM, masked like the body, formula guard). HTML ≤ 90 KB (Gmail clips at about 102 KB), CSV ≤ 300 KB. */

export const RENDER_LIM = Object.freeze({ htmlBytes: 90 * 1024, csvBytes: 300 * 1024, cards: 15, needs: 5, oneLiners: 400, problems: 3 });
export const CSV_COLS = Object.freeze(["date", "time_cairo", "agent", "lang", "who_kind", "who", "company_said", "ask", "verdict", "correct", "flags", "outcome", "zero_result_queries", "minutes", "parts", "session_ids"]);

/* ---------- words ---------- */
const AR_DIG = "٠١٢٣٤٥٦٧٨٩";
export const ar = v => String(v == null ? "" : v).replace(/[0-9]/g, d => AR_DIG[+d]);
const s = v => (v == null ? "" : String(v));
const esc = v => s(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bytes = t => new TextEncoder().encode(s(t)).length;
export const VERDICT = Object.freeze({
  not_useful: ["مافادتش", "not useful"], partial: ["جزئياً", "partly useful"], useful: ["مفيدة", "useful"], no_ask: ["من غير طلب", "no request"], short: ["قصيرة", "short"],
  no_consent: ["من غير موافقة تسجيل — مش متقيّمة", "no recording consent — not rated"], not_read: ["مااتقرتش من Anam — اتعدّت بس", "not read from Anam — counted only"] });
const VERDICT_RANK = { not_useful: 0, partial: 1, useful: 2, no_ask: 3, no_consent: 4, not_read: 5, short: 6 };
export const ASK = Object.freeze({ supplier_search: ["بيدوّر على مورّد", "looking for a supplier"], demand_search: ["بيدوّر على شغل وعملاء (بايع)", "a seller looking for work and customers"],
  contact_request: ["عايز يتواصل مع جهة", "wants to reach a company"], platform_question: ["سؤال عن المنصة والباقات", "a question about the platform and plans"],
  procedure: ["سؤال عن إجراءات (سجل، ضرايب، جمارك…)", "a question about procedures (register, tax, customs…)"], none: ["مفيش طلب واضح", "no clear request"] });
/* the flags in plain words: f = Janna's (feminine), m = Bassem's (masculine), en */
export const FLAG = Object.freeze({
  promise_no_tool: ["وعدت تدوّر ومادوّرتش", "وعد يدوّر ومادوّرش", "promised to search and did not"],
  nudge_after_promise: ["سكتت بعد الوعد ورجعت تستعجله", "سكت بعد الوعد ورجع يستعجله", "went quiet after the promise, then nudged the caller"],
  zero_results: ["بحث رجّع صفر", "بحث رجّع صفر", "a search returned nothing"],
  off_target: ["قالت على نتايج مش مطابقة إنها مناسبة", "قال على نتايج مش مطابقة إنها مناسبة", "called non-matching results relevant"],
  competitor_offered: ["عرضت على البايع منافسينه بدل عملاءه", "عرض على البايع منافسينه بدل عملاءه", "offered a seller his competitors instead of customers"],
  last_user_unanswered: ["آخر كلام العميل مالوش رد", "آخر كلام العميل مالوش رد", "the caller's last words got no answer"],
  dissatisfied: ["العميل قال إنه مااستفادش", "العميل قال إنه مااستفادش", "the caller said it did not help"],
  unverified_claim: ["قالت إن حاجة اتبعتت أو اتسجّلت والمنصة مافيهاش ده", "قال إن حاجة اتبعتت أو اتسجّلت والمنصة مافيهاش ده", "said something was sent or saved, and the platform has no record of it"],
  long_turn: ["ردود طويلة (أكتر من ٣٠ ثانية)", "ردود طويلة (أكتر من ٣٠ ثانية)", "long replies (over 30 s)"],
  bad_tag: ["كلمة غريبة بين قوسين في كلامها", "كلمة غريبة بين قوسين في كلامه", "a stray bracketed word in the reply"],
  foreign_script: ["حروف أو كود غريب في الرد", "حروف أو كود غريب في الرد", "foreign letters or code in the reply"],
  gulf_words: ["كلام خليجي مش مصري", "كلام خليجي مش مصري", "Gulf dialect words"],
  link_read: ["قرت لينك بصوت عالي", "قرا لينك بصوت عالي", "read a link aloud"],
  ui_trouble: ["العميل تاه في الشاشة", "العميل تاه في الشاشة", "the caller had trouble with the screen"],
  stt_noise: ["كلام اتسمع غلط أو دوشة", "كلام اتسمع غلط أو دوشة", "misheard speech or noise"],
  slow_turn: ["رد متأخر (أكتر من ٦ ثواني)", "رد متأخر (أكتر من ٦ ثواني)", "slow reply (over 6 s)"],
  tool_failed: ["أداة فشلت", "أداة فشلت", "a tool failed"],
  no_next_step: ["مفيش خطوة جاية (طلب، اجتماع، تسجيل أو متابعة)", "مفيش خطوة جاية (طلب، اجتماع، تسجيل أو متابعة)", "no next step (request, meeting, registration or follow)"],
});
const FLAG_ORDER = ["dissatisfied", "promise_no_tool", "competitor_offered", "unverified_claim", "off_target", "zero_results", "last_user_unanswered", "nudge_after_promise", "no_next_step",
  "tool_failed", "bad_tag", "long_turn", "slow_turn", "ui_trouble", "link_read", "gulf_words", "foreign_script", "stt_noise"];
const flagAr = (code, agent) => (FLAG[code] ? FLAG[code][agent === "bassem" ? 1 : 0] : "");
const flagEn = code => (FLAG[code] ? FLAG[code][2] : "");
const AGENT = { janna_ar: ["جنة", "Janna"], janna_en: ["جنة (إنجليزي)", "Janna (EN)"], bassem: ["باسم", "Bassem"] };
const agentKey = c => (c.agent === "bassem" ? "bassem" : c.lang === "en" ? "janna_en" : "janna_ar");
const OS = { iphone: ["آيفون", "iPhone"], android: ["أندرويد", "Android"], desktop: ["كمبيوتر", "desktop"] };
const INAPP = { google: ["جوه تطبيق جوجل", "inside the Google app"], facebook: ["جوه تطبيق فيسبوك", "inside the Facebook app"], instagram: ["جوه إنستجرام", "inside Instagram"] };
const APP = { ios: ["تطبيق المنصة (آيفون)", "the platform's app (iPhone)"], android: ["تطبيق المنصة (أندرويد)", "the platform's app (Android)"] };
const CONF = { sure: ["مؤكد", "confirmed"], likely: ["غالباً", "likely"], unsure: ["مش متأكد", "not sure"] };
const STAGE = { new: ["جديد", "new"], browsing: ["اتفرّج على المنصة", "looked around"], interested: ["سأل عن الباقات والتسجيل", "asked about plans"], lead: ["ساب طلب أو حدد اجتماع", "left a request or booked"],
  registering: ["بدأ التسجيل ولسه ماكمّلش", "started registering"], member: ["اتسجّل عضو", "registered"] };
const nAr = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? ar(n) + " " + few : ar(n) + " " + many);
const minAr = m => (m < 1 ? "أقل من دقيقة" : ar(m) + " دقيقة");
function deviceAr(d) { d = d || {}; const p = []; if (d.app && APP[d.app]) p.push(APP[d.app][0]); else { if (OS[d.os]) p.push(OS[d.os][0]); if (INAPP[d.inapp]) p.push(INAPP[d.inapp][0]); } return p.join(" "); }
function deviceEn(d) { d = d || {}; const p = []; if (d.app && APP[d.app]) p.push(APP[d.app][1]); else { if (OS[d.os]) p.push(OS[d.os][1]); if (INAPP[d.inapp]) p.push(INAPP[d.inapp][1]); } return p.join(" "); }
const turnsAr = f => (f.turns && f.turns.length ? " (" + (f.turns.length === 1 ? "الرد " : "الردود ") + f.turns.slice(0, 6).map(ar).join("، ") + ")" : "");
const turnsEn = f => (f.turns && f.turns.length ? " (turn" + (f.turns.length > 1 ? "s " : " ") + f.turns.slice(0, 6).join(", ") + ")" : "");
function flagLineAr(f, agent) {
  let t = flagAr(f.code, agent); if (!t) return "";
  if (f.code === "zero_results" && f.n > 1) t += " ×" + ar(f.n);
  if (f.code === "last_user_unanswered" && f.s) t += " — " + ar(f.s) + " ثانية من غير رد";
  if ((f.code === "long_turn" || f.code === "slow_turn") && f.secs && f.secs.length) t += ": " + f.secs.slice(0, 6).map(x => ar(x) + " ث").join("، ");
  if (f.code === "bad_tag" && f.tags && f.tags.length) t += ": " + f.tags.slice(0, 3).map(x => "[" + x + "]").join(" ");
  return t + turnsAr(f) + (f.q ? " «" + f.q + "»" : "");
}
function flagLineEn(f) {
  let t = flagEn(f.code); if (!t) return "";
  if (f.code === "zero_results" && f.n > 1) t += " ×" + f.n;
  if (f.code === "last_user_unanswered" && f.s) t += " — " + f.s + " s without an answer";
  if ((f.code === "long_turn" || f.code === "slow_turn") && f.secs && f.secs.length) t += ": " + f.secs.slice(0, 6).map(x => x + " s").join(", ");
  return t + turnsEn(f);
}
const sortFlags = fl => [...(fl || [])].filter(f => FLAG[f.code]).sort((a, b) => FLAG_ORDER.indexOf(a.code) - FLAG_ORDER.indexOf(b.code));

/* ---------- who ---------- */
function whoAr(w, c) {
  w = w || {}; const conf = CONF[w.confidence] ? " (" + CONF[w.confidence][0] + ")" : "", parts = [];
  if (w.kind === "member") {
    const nm = [w.title, w.name].filter(Boolean).join(" ") + (w.company ? " — " + w.company : "");
    parts.push("عضو" + (nm ? ": " + nm : "") + conf);
    if (w.plan) parts.push("باقة " + w.plan); if (w.sector) parts.push(w.sector); if (w.gov) parts.push(w.gov);
    if (w.email) parts.push(w.email); if (w.phone) parts.push("موبايل " + w.phone);
  } else if (w.kind === "staff") parts.push("فريق المنصة" + (w.first ? " — " + w.first : "") + conf);
  else if (w.kind === "meeting") {
    parts.push("اجتماع مع: " + (w.name || "—") + (w.company ? " — " + w.company : "") + conf);
    if (w.email) parts.push(w.email); if (w.phone) parts.push("موبايل " + w.phone);
  } else {
    parts.push((w.alias ? "زائر ·" + w.alias : "زائر مش معروف") + conf);
    if (w.visits) parts.push("زارنا " + nAr(w.visits, "مرة", "مرتين", "مرات", "مرة"));
    if (w.stage && STAGE[w.stage] && w.stage !== "new") parts.push("وصل لحد: " + STAGE[w.stage][0]);
  }
  const said = w.said || {}, sp = [];
  if (said.first) sp.push([said.title, said.first].filter(Boolean).join(" "));
  if (said.company) sp.push(said.company); if (said.place) sp.push(said.place);
  for (const d of said.links || []) sp.push("لينك " + d);
  if (sp.length && w.kind !== "member" && w.kind !== "staff") parts.push("قال في المكالمة — مش متأكد: " + sp.join(" · "));
  if (said.echo) parts.push("فهم " + (c && c.agent === "bassem" ? "باسم" : "جنة") + ": «" + said.echo + "»");
  return parts.filter(Boolean);
}
function whoShort(w) {
  w = w || {};
  if (w.kind === "member") return [w.title, w.name].filter(Boolean).join(" ") + (w.company ? " — " + w.company : "");
  if (w.kind === "staff") return "فريق المنصة" + (w.first ? " — " + w.first : "");
  if (w.kind === "meeting") return "اجتماع: " + (w.name || "—");
  return w.alias ? "زائر ·" + w.alias : "زائر مش معروف";
}
function whoEn(w) {
  w = w || {};
  if (w.kind === "member") return "member " + [w.title_en || "", w.name].filter(Boolean).join(" ") + (w.company ? " — " + w.company : "");
  if (w.kind === "staff") return "platform team";
  if (w.kind === "meeting") return "meeting booking";
  return w.alias ? "visitor ·" + w.alias : "unknown visitor";
}

/* ---------- one card (5 lines) and one line ---------- */
const OUTCOME_NONE = ["ولا حاجة", "nothing"];
function cardParts(c) {
  const r = c.review || {}, agent = c.agent, P = agent === "bassem" ? "باسم" : "جنة", did = agent === "bassem" ? "عمل" : "عملت", said = agent === "bassem" ? "قال" : "قالت";
  const a = [(VERDICT[r.verdict] || VERDICT.partial)[0] + " (تقييم تلقائي)", (AGENT[agentKey(c)] || AGENT.janna_ar)[0], ar(c.time || ""), minAr(c.minutes || 0) + (c.parts > 1 ? " · " + ar(c.parts) + " أجزاء" : ""), deviceAr(c.device)].filter(Boolean).join(" · ")
    + (c.notReady ? " · تفاصيل Anam لسه ماوصلتش" : "") + (c.kind === "outside" ? " · من برّه الموقع" : "");
  const b = whoAr(c.who, c);
  const askL = (ASK[r.ask] || ASK.none)[0], cq = r.askQuote && !c.consentless ? " — «" + r.askQuote + "»" : "";
  const sr = (r.searches || []);
  const dLines = [];
  if (sr.length) {
    const zero = sr.filter(x => x.zero).length, titles = [];
    for (const x of sr) for (const t of x.titles || []) if (titles.length < 3 && !titles.some(y => y.t === t)) titles.push({ t, off: x.off });
    dLines.push(nAr(sr.length, "بحث واحد", "بحثين", "عمليات بحث", "عملية بحث") + (zero ? " (" + ar(zero) + " منهم رجّع صفر)" : "") + (titles.length ? ": " + titles.map(x => x.t + (x.off ? " «مش مطابقة»" : "")).join("؛ ") : ""));
  } else if (r.tools) dLines.push(nAr(r.tools, "أداة واحدة", "أداتين", "أدوات", "أداة"));
  const out = (c.outcomes || []).map(o => o.ar).filter(Boolean);
  dLines.push("النتيجة: " + (out.length ? out.join("؛ ") : OUTCOME_NONE[0]));
  if (r.personaQuote && !c.consentless) dLines.push(P + " " + said + ": «" + r.personaQuote + "»");
  const fl = sortFlags(r.flags).map(f => flagLineAr(f, agent)).filter(Boolean);
  const mi = (c.missed || []).map(m => m.ar).filter(Boolean);
  const eLines = [];
  if (r.verdict === "no_consent") eLines.push("الاجتماع من غير موافقة على التسجيل: مفيش أي حاجة من الكلام في التقرير (عدد الردود " + ar(r.turns || 0) + "، الأدوات " + ar(r.tools || 0) + ").");
  if (fl.length) eLines.push("الغلط: " + fl.join("؛ "));
  else if (r.verdict !== "no_consent") eLines.push("الغلط: مفيش حاجة اتعلّمت تلقائياً");
  if (r.na && r.na.length && r.verdict !== "no_consent") eLines.push("مش متاح من غير Anam: " + r.na.map(k => flagAr(k, agent)).filter(Boolean).join("، "));
  if (mi.length) eLines.push("كان ممكن: " + mi.join("؛ "));
  if (r.wrong && r.wrong.length) eLines.push("صح ولا فيه غلط: فيه غلط — " + r.wrong.map(k => flagAr(k, agent)).join("، "));
  return { a, b, c: askL + cq, d: dLines, e: eLines, P, did };
}
function cardHtml(c) {
  const p = cardParts(c), row = (label, html) => `<div style="margin:2px 0"><b style="color:#5b0816">${esc(label)}</b> ${html}</div>`;
  return `<div style="border:1px solid #e3d6d8;border-radius:10px;padding:10px 12px;margin:10px 0;background:#fffdfd">`
    + `<div style="font-weight:bold;color:#8E0B20;margin-bottom:4px">${esc(p.a)}</div>`
    + row("مين:", esc(p.b.join(" · ")) + (c.who && c.who.link ? ` · <a href="${esc(c.who.link)}">افتح في لوحة التحكم</a>` : ""))
    + row("عايز إيه:", esc(p.c))
    + row(p.did + " إيه:", p.d.map(esc).join("<br>") + (c.outcomes || []).filter(o => o.link).map(o => ` · <a href="${esc(o.link)}">${esc(o.ref || "التفاصيل")}</a>`).join(""))
    + row("الغلط وكان ممكن:", p.e.map(esc).join("<br>"))
    + `</div>`;
}
function cardText(c) {
  const p = cardParts(c);
  return ["• " + p.a, "  مين: " + p.b.join(" · ") + (c.who && c.who.link ? " · " + c.who.link : ""), "  عايز إيه: " + p.c, "  " + p.did + " إيه: " + p.d.join(" / ")
    + (c.outcomes || []).filter(o => o.link).map(o => " · " + o.link).join(""), "  الغلط وكان ممكن: " + p.e.join(" / ")].join("\n");
}
function oneLine(c, more) {
  const r = c.review || {};
  const fl = sortFlags(r.flags).slice(0, 2).map(f => flagAr(f.code, c.agent));
  return [ar(c.time || ""), (AGENT[agentKey(c)] || AGENT.janna_ar)[0], minAr(c.minutes || 0), (VERDICT[r.verdict] || VERDICT.partial)[0], whoShort(c.who), /^(short|no_consent|not_read)$/.test(r.verdict) ? "" : (ASK[r.ask] || ASK.none)[0],
    c.kind === "outside" ? "من برّه الموقع" : "", fl.join("، "), (c.outcomes || []).map(o => o.ar).join("؛ "), more ? "التفاصيل في الملف المرفق" : ""].filter(Boolean).join(" · ");
}
function lineEn(c) {
  const r = c.review || {};
  return [c.time || "", (AGENT[agentKey(c)] || AGENT.janna_ar)[1], (c.minutes || 0) + " min", (VERDICT[r.verdict] || VERDICT.partial)[1], whoEn(c.who), /^(short|no_consent|not_read)$/.test(r.verdict) ? "" : (ASK[r.ask] || ASK.none)[1],
    c.kind === "outside" ? "outside the site" : "", sortFlags(r.flags).slice(0, 3).map(flagLineEn).join("; "), (c.outcomes || []).map(o => o.en).join("; ")].filter(Boolean).join(" · ");
}

/* ---------- the summary ---------- */
function summaryLines(rep) {
  const k = rep.counts || {}, L = [], E = [];
  const ag = k.byAgent || {}, agL = [], agE = [];
  for (const key of ["janna_ar", "janna_en", "bassem"]) if (ag[key]) { agL.push(AGENT[key][0] + " " + ar(ag[key])); agE.push(AGENT[key][1] + " " + ag[key]); }
  L.push("المكالمات: " + ar(k.conversations || 0) + (agL.length ? " (" + agL.join(" · ") + ")" : "") + " — عملاء " + ar(k.customers || 0) + " · فريق " + ar(k.team || 0) + " · من برّه الموقع " + ar(k.outside || 0) + " — " + minAr(k.minutes || 0) + " كلام");
  E.push("Calls: " + (k.conversations || 0) + (agE.length ? " (" + agE.join(" · ") + ")" : "") + " — customers " + (k.customers || 0) + " · team " + (k.team || 0) + " · outside the site " + (k.outside || 0) + " — " + (k.minutes || 0) + " min");
  const v = k.verdicts || {}, vL = [], vE = [];
  for (const key of ["useful", "partial", "not_useful", "no_ask", "short", "no_consent", "not_read"]) if (v[key]) { vL.push(VERDICT[key][0].split(" — ")[0] + " " + ar(v[key])); vE.push(VERDICT[key][1].split(" — ")[0] + " " + v[key]); }
  L.push("التقييم التلقائي للعملاء: " + (vL.length ? vL.join(" · ") : "مفيش")); E.push("Automatic rating (customers): " + (vE.length ? vE.join(" · ") : "none"));
  const o = k.outcomes || {}, refs = (o.rfqs || []).slice(0, 5);
  L.push("النتايج: طلبات " + ar((o.rfqs || []).length) + (refs.length ? " (" + refs.join("، ") + ")" : "") + " · اجتماعات " + ar(o.meetings || 0) + " · تسجيل " + ar(o.registrations || 0) + " · متابعات " + ar(o.follows || 0) + " · إيميلات باسم اتبعتت " + ar(o.bassem_emails || 0));
  E.push("Outcomes: requests " + (o.rfqs || []).length + (refs.length ? " (" + refs.join(", ") + ")" : "") + " · meetings " + (o.meetings || 0) + " · registrations " + (o.registrations || 0) + " · follows " + (o.follows || 0) + " · Bassem e-mails sent " + (o.bassem_emails || 0));
  const pr = (k.problems || []).slice(0, RENDER_LIM.problems);
  L.push("أكتر المشاكل: " + (pr.length ? pr.map(p => (FLAG[p.code] ? FLAG[p.code][p.agent === "bassem" ? 1 : 0] : p.code) + ": " + ar(p.n)).join(" · ") : "مفيش"));
  E.push("Top problems: " + (pr.length ? pr.map(p => flagEn(p.code) + ": " + p.n).join(" · ") : "none"));
  const pv = k.pv;
  if (pv) {
    L.push("زيارات الموقع: " + ar(pv.views || 0) + " مشاهدة · " + ar(pv.uniq || 0) + " زائر · " + ar(pv.mobile || 0) + " من الموبايل" + ((pv.sources || []).length ? " — أكتر المصادر: " + pv.sources.slice(0, 3).map(x => x[0] + " " + ar(x[1])).join("، ") : ""));
    E.push("Site visits: " + (pv.views || 0) + " views · " + (pv.uniq || 0) + " visitors · " + (pv.mobile || 0) + " on mobile" + ((pv.sources || []).length ? " — top sources: " + pv.sources.slice(0, 3).map(x => x[0] + " " + x[1]).join(", ") : ""));
  } else { L.push("زيارات الموقع: مش متاحة"); E.push("Site visits: not available"); }
  const op = k.opps || {}, nd = k.needs || {};
  L.push("فرص مفتوحة النهارده: مناقصات مصرية " + ar(op.tenders || 0) + "، طلبات أسعار " + ar(op.rfqs || 0) + " · أسئلة جديدة محتاجة إجابة: " + ar(nd.fresh || 0) + (nd.total != null ? " (الكل " + ar(nd.total) + ")" : ""));
  E.push("Open opportunities today: Egyptian tenders " + (op.tenders || 0) + ", RFQs " + (op.rfqs || 0) + " · new questions that need an answer: " + (nd.fresh || 0) + (nd.total != null ? " (all " + nd.total + ")" : ""));
  return { ar: L.slice(0, 6), en: E.slice(0, 6) };
}

/* ---------- the subject (no personal data: cc_mail_log keeps it) ---------- */
export function subjectOf(rep) {
  const k = rep.counts || {}, v = k.verdicts || {};
  return `تقرير مكالمات جنة وباسم — ${rep.dayAr}: ${ar(k.conversations || 0)} مكالمة (${ar(k.customers || 0)} عملاء، ${ar(v.useful || 0)} مفيدة) / Calls report ${rep.day}: ${k.conversations || 0} calls (${k.customers || 0} customers, ${v.useful || 0} useful)`;
}

/* ---------- the CSV ---------- */
const csvCell = v => { let t = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
export function csvOf(rep) {
  const rows = [], head = CSV_COLS.map(csvCell).join(",");
  let size = bytes("﻿" + head + "\n"), cut = 0;
  for (const c of rep.convs || []) {
    if (c.kind === "team" && rep.settings && rep.settings.tests === "off") continue;
    const r = c.review || {};
    const row = { date: rep.day, time_cairo: c.time || "", agent: c.agent, lang: c.lang, who_kind: (c.who && c.who.kind) || "", who: whoShort(c.who) + (c.who && c.who.email ? " (" + c.who.email + ")" : ""),
      company_said: (c.who && c.who.said && c.who.said.company) || "", ask: r.ask || "", verdict: r.verdict || "", correct: r.correct === false ? "no: " + (r.wrong || []).join(",") : /^(short|no_consent|not_read)$/.test(r.verdict) ? "" : "yes",
      flags: sortFlags(r.flags).map(f => f.code + (f.turns && f.turns.length ? "[" + f.turns.join(",") + "]" : "") + (f.n > 1 ? "x" + f.n : "")).join(";"),
      outcome: (c.outcomes || []).map(o => o.en).join("; "), zero_result_queries: (r.zeroQueries || []).map(q => q + ((r.zeroCounts || {})[q] > 1 ? " ×" + r.zeroCounts[q] : "")).join("; "), minutes: c.minutes || 0, parts: c.parts || 1, session_ids: (c.sessions || []).join(";") };
    const line = CSV_COLS.map(k => csvCell(row[k])).join(",");
    if (size + bytes(line + "\n") > RENDER_LIM.csvBytes) { cut++; continue; }
    rows.push(line); size += bytes(line + "\n");
  }
  return { text: "﻿" + [head, ...rows].join("\n") + "\n", rows: rows.length, cut };
}

/* ---------- the whole e-mail ---------- */
export function renderReport(rep) {
  rep = rep || {};
  const convs = rep.convs || [], tests = (rep.settings && rep.settings.tests) || "summary";
  const cust = convs.filter(c => c.kind === "customer"), team = convs.filter(c => c.kind === "team"), outside = convs.filter(c => c.kind === "outside");
  const look = cust.filter(c => c.review && (c.review.verdict === "not_useful" || c.review.verdict === "partial"))
    .sort((a, b) => VERDICT_RANK[a.review.verdict] - VERDICT_RANK[b.review.verdict] || (b.review.flags || []).length - (a.review.flags || []).length || (a.startMs || 0) - (b.startMs || 0));
  const rest = convs.filter(c => !look.includes(c) && c.kind !== "team").sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
  const sum = summaryLines(rep);
  const subject = subjectOf(rep);
  const csv = rep.csv === false ? { text: "", rows: 0, cut: 0 } : csvOf(rep);
  /* the body, built for a number of cards and of one-line calls; the cards that do not fit (≤ 15) become one line each, and over 90 KB the
     one-liners are cut first (to 30, Arabic and English alike), then the cards, then the last one-liners: the CSV keeps every call */
  const build = (nCards, nLines) => {
    const H = [], X = [];
    const h2 = t => { H.push(`<h3 style="color:#8E0B20;border-bottom:2px solid #8E0B20;padding-bottom:3px;margin:18px 0 8px">${esc(t)}</h3>`); X.push("", "== " + t + " =="); };
    const ul = items => { if (!items.length) return; H.push(`<ul style="margin:4px 0;padding-inline-start:20px">${items.map(x => `<li style="margin:2px 0">${x}</li>`).join("")}</ul>`); };
    if (rep.failedPrev) { const t = "تقرير يوم " + ar(rep.failedPrev.day) + " ماتبعتش: " + rep.failedPrev.reason + " — تقدر تبعته تاني من «المطوّر» ← «تقرير المكالمات»."; H.push(`<div style="background:#fff4e5;border:1px solid #f0b46c;border-radius:8px;padding:8px 10px;margin:6px 0">${esc(t)}</div>`); X.push("! " + t); }
    if (rep.banner) { H.push(`<div style="background:#fdecee;border:1px solid #e8a3ad;border-radius:8px;padding:8px 10px;margin:6px 0"><b>${esc(rep.banner.ar)}</b></div>`); X.push("! " + rep.banner.ar); }
    h2("الخلاصة — " + rep.dayAr);
    ul(sum.ar.map(esc)); X.push(...sum.ar.map(l => "- " + l));
    const cards = look.slice(0, nCards), overflow = look.slice(nCards);
    h2("مكالمات محتاجة نظرة");
    if (!look.length) { H.push(`<p style="margin:4px 0">${esc("مفيش مكالمة عميل اتقيّمت «مافادتش» أو «جزئياً».")}</p>`); X.push("مفيش مكالمة عميل اتقيّمت «مافادتش» أو «جزئياً»."); }
    for (const c of cards) { H.push(cardHtml(c)); X.push(cardText(c)); }
    const lines = [...overflow.map(c => oneLine(c, true)), ...rest.map(c => oneLine(c, false))];
    if (lines.length) {
      h2("باقي المكالمات");
      const shown = lines.slice(0, nLines);
      ul(shown.map(esc)); X.push(...shown.map(l => "- " + l));
      if (lines.length > shown.length) { const t = "و" + ar(lines.length - shown.length) + " مكالمة تانية — التفاصيل في الملف المرفق"; H.push(`<p>${esc(t)}</p>`); X.push(t); }
    }
    if ((rep.needs || []).length) {
      h2("أسئلة محتاجة إجابة من الفريق");
      const n = rep.needs.slice(0, RENDER_LIM.needs).map(q => "«" + q.question + "»" + (q.asked > 1 ? " (" + ar(q.asked) + " مرات)" : ""));
      ul(n.map(esc)); X.push(...n.map(l => "- " + l));
      if (rep.links && rep.links.dataDesk) { H.push(`<p style="margin:4px 0"><a href="${esc(rep.links.dataDesk)}">${esc("اكتب الإجابات من مكتب البيانات")}</a></p>`); X.push("مكتب البيانات: " + rep.links.dataDesk); }
    }
    if (tests !== "off" && (team.length || (rep.counts && rep.counts.meetingsTeam))) {
      h2("اختبارات الفريق");
      const mt = (rep.counts && rep.counts.meetingsTeam) || 0;
      const t = "مكالمات الفريق: " + ar(team.length) + (mt ? " · اجتماعات باسم مع الفريق: " + ar(mt) : "") + (team.length ? " — " + team.map(c => ar(c.time || "") + " " + (AGENT[agentKey(c)] || AGENT.janna_ar)[0] + " " + (VERDICT[(c.review || {}).verdict] || VERDICT.partial)[0]).join("، ") : "");
      H.push(`<p style="margin:4px 0">${esc(t)}</p>`); X.push(t);
      if (tests === "full") for (const c of team) { H.push(cardHtml(c)); X.push(cardText(c)); }
    }
    const notes = [...(rep.notes || [])];
    if (csv.cut) notes.push({ ar: "الملف المرفق اتقصّ: " + ar(csv.cut) + " مكالمة مادخلتش (الحد ٣٠٠ كيلوبايت).", en: "The attachment was cut: " + csv.cut + " calls left out (300 KB limit)." });
    if (notes.length) { h2("ملاحظات النظام"); ul(notes.map(n => esc(n.ar))); X.push(...notes.map(n => "- " + n.ar)); }
    /* the English twin: the summary lines and one line per conversation (CLAUDE.md 2.2), as many as the Arabic part shows */
    const enAll = convs.filter(c => c.kind !== "team" || tests !== "off"), enShown = enAll.slice(0, cards.length + nLines).map(lineEn);
    const enMore = enAll.length > enShown.length ? "… and " + (enAll.length - enShown.length) + " more calls — see the attached file" : "";
    H.push(`<div dir="ltr" style="text-align:left;border-top:1px solid #ddd;margin-top:18px;padding-top:8px;color:#333"><h3 style="margin:6px 0">${esc("Summary — " + rep.day)}</h3>`
      + `<ul style="margin:4px 0;padding-left:20px">${sum.en.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`
      + (enAll.length ? `<h3 style="margin:10px 0 6px">${esc("Calls")}</h3><ul style="margin:4px 0;padding-left:20px">${enShown.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` + (enMore ? `<p>${esc(enMore)}</p>` : "") : "")
      + (notes.length ? `<h3 style="margin:10px 0 6px">${esc("System notes")}</h3><ul style="margin:4px 0;padding-left:20px">${notes.map(n => `<li>${esc(n.en)}</li>`).join("")}</ul>` : "") + "</div>");
    X.push("", "== Summary — " + rep.day + " ==", ...sum.en.map(l => "- " + l));
    if (enAll.length) X.push("", "== Calls ==", ...enShown.map(l => "- " + l), ...(enMore ? [enMore] : []));
    if (notes.length) X.push("", "== System notes ==", ...notes.map(n => "- " + n.en));
    /* the footer (+ the default-recipient note while it applies) */
    const f1 = "تقرير داخلي لإدارة المنصة — فيه بيانات أشخاص: ماتبعتهوش لحد برّه الإدارة. المستلمين والميعاد من «المطوّر» ← «تقرير المكالمات».";
    const f2 = rep.defaultNote ? "المستلم الافتراضي: " + rep.defaultNote.to.join("، ") + " (ده كمان إيميل خدمة العملاء العام) — غيّره من «المطوّر» ← «تقرير المكالمات»." : "";
    const f3 = "Internal management report — it contains personal data: do not forward it outside management. Recipients and time: «Developer» → «Calls report»." + (rep.defaultNote ? " Default recipient (also the public customer-service mailbox) — change it there." : "");
    H.push(`<div style="color:#666;font-size:12px;border-top:1px solid #ddd;margin-top:16px;padding-top:8px">${esc(f1)}${f2 ? "<br>" + esc(f2) : ""}<br><span dir="ltr">${esc(f3)}</span></div>`);
    X.push("", "—", f1, ...(f2 ? [f2] : []), f3);
    const html = `<div dir="rtl" lang="ar" style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.75;color:#1d1d1d;max-width:780px;margin:0 auto;text-align:right">${H.join("")}</div>`;
    return { html, text: X.join("\n").replace(/^\n+/, ""), cards: cards.length };
  };
  let n = Math.min(RENDER_LIM.cards, look.length), nl = RENDER_LIM.oneLiners, out = build(n, nl);
  while (bytes(out.html) > RENDER_LIM.htmlBytes && (nl > 30 || n > 0 || nl > 0)) {
    if (nl > 30) nl = Math.max(30, Math.floor(nl * 3 / 4));
    else if (n > 0) n = Math.max(0, n - Math.max(1, Math.ceil(n / 4)));
    else nl = Math.max(0, nl - Math.max(1, Math.ceil(nl / 4)));
    out = build(n, nl);
  }
  return { subject, html: out.html, text: out.text, csv: csv.text, csvRows: csv.rows, csvCut: csv.cut, cards: out.cards, look: look.length, htmlBytes: bytes(out.html) };
}
