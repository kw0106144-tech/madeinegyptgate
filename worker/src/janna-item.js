/* One directory item, in full — for Bassem / Janna (Anam SERVER_WEBHOOK tool, proposal anam/janna_item.json) and the screen.
   - GET  /api/janna/item?section=tenders&id=eg-tnd-003      (or &ref=6/2026/2027, or &title=…)
   - POST /api/janna/item  {section, id|ref|title}           (Anam webhooks POST the tool arguments as the top-level JSON body,
                                                               like /api/janna/lookup; {arguments:{…}} / {parameters:{…}} are unwrapped too)
   → {found, section, id, ref, title, …every public field the platform has…, open_url, list_url?, documents_url?, contact, text}
   `text` is a short spoken summary in Egyptian Arabic built ONLY from fields that exist (no field → not mentioned, never guessed).
   Data: src/items.json (worker/build-items.js: the full public records + the clean URL of each item's page) next to src/data.json.
   Also exported for /api/janna/lookup (src/index.js): enrichResult() adds id / ref_no / open_url / the amounts to each result.
   Contacts: the platform never gives private phones / e-mails; contact goes through the platform (contact rules in `contact`). */
import DATA from "./data.json";
import ITEMS from "./items.json";
import { norm } from "./text.js";
import { cairoDay, addDays } from "./common.js";

export const SITE = "https://madeinegyptgate.com/";
/* stored paths: "/tender-item/eg-tnd-003/" (decoded UTF-8) or a site hash link "tenders/search/#OFF%3A1" (already encoded) */
export function absUrl(p) {
  p = String(p || ""); if (!p) return ""; if (/^https:\/\/(www\.)?madeinegyptgate\.com\//.test(p)) return p;
  if (/^https?:\/\//i.test(p)) return ""; /* only the platform's own pages open on the screen */
  return p.charAt(0) === "/" ? SITE + encodeURI(p.slice(1)) : SITE + p;
}
/* the honest 4-value tender status, at request time (same rule as src/index.js tenderStatus) */
export function statusOf(deadline, nowMs = Date.now()) {
  const d = /^(\d{4}-\d{2}-\d{2})/.exec(String(deadline || "")); if (!d) return "غير محدد الموعد";
  const today = cairoDay(nowMs); return d[1] < today ? "منتهية" : d[1] <= addDays(today, 7) ? "تنتهي قريباً" : "سارية";
}
const T = ITEMS.t || [], Q = ITEMS.q || [], F = ITEMS.f || {}, P = ITEMS.p || [], O = ITEMS.o || [], Z = ITEMS.z || [], A = ITEMS.a || [], J = ITEMS.j || [];
const T_KEY = new Map(T.map(t => [t.key, t])), T_ID = new Map(T.map(t => [t.id, t])), P_KEY = new Map(P.map(p => [p.key, p]));
const hashOf = u => { const m = /#(.+)$/.exec(String(u || "")); return m ? m[1] : ""; };
/* the key the tenders LIST opens a card by (data.json t[0]: «OFF:6/2026/2027», a legacy number …) — Egyptian tenders only. «OFF:» keys are
   NOT unique (OFF:1 ×5): open the item by its id / open_url, or pass this key WITH the title (consolidation: holo5's OFF:<ref> mismatch) */
const listKey = t => (t && t.market === "local" ? String(t.key || "").split("|")[0] : "");
const up = s => String(s || "").trim().toUpperCase();
const SECTIONS = { tenders: "tenders", tender: "tenders", rfqs: "rfqs", rfq: "rfqs", factories: "factories", factory: "factories", suppliers: "factories", companies: "factories", company: "factories",
  products: "products", product: "products", market: "products", offers: "offers", offer: "offers", cities: "cities", city: "cities", zones: "cities", awards: "awards", award: "awards", winners: "awards", projects: "projects", project: "projects" };
export const sectionOf = s => SECTIONS[String(s || "").toLowerCase().trim()] || "";

/* ---------- spoken Arabic helpers (Egyptian) ---------- */
const MON = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export function sayDate(d, nowMs = Date.now()) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(d || "")); if (!m) return "";
  const y = m[1], mon = MON[+m[2] - 1] || ""; if (!m[3]) return mon + " " + y;
  return (+m[3]) + " " + mon + (y === cairoDay(nowMs).slice(0, 4) ? "" : " " + y);
}
const g = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
/* 1000000 → «مليون جنيه», 7000 → «7 آلاف جنيه», 450000 → «450 ألف جنيه», 1500 → «1,500 جنيه» */
export function sayMoney(v, unit = "جنيه") {
  if (typeof v !== "number" || !isFinite(v)) return "";
  const big = (x, one, two, many) => (x === 1 ? one : x === 2 ? two : g(x) + " " + many);
  if (v >= 1e9 && v % 1e7 === 0) return big(v / 1e9, "مليار", "2 مليار", "مليار") + " " + unit;
  if (v >= 1e6 && v % 1e4 === 0) return big(v / 1e6, "مليون", "2 مليون", "مليون") + " " + unit;
  if (v >= 1000 && v % 1000 === 0) { const k = v / 1000; return (k === 1 ? "ألف" : k === 2 ? "ألفين" : k <= 10 ? k + " آلاف" : g(k) + " ألف") + " " + unit; }
  return g(v) + " " + unit;
}
const sayMillion = (m, unit) => (m >= 1000 ? g(m / 1000) + " مليار " + unit : (m === 1 ? "مليون " : g(m) + " مليون ") + unit);
const STP = { "سارية": "ولسه مفتوحة", "تنتهي قريباً": "يعني قربت تقفل", "منتهية": "يعني الميعاد خلص", "غير محدد الموعد": "" };
const first = (s, n) => { s = String(s || "").split(/[،,]\s*/).filter(Boolean); return s.slice(0, n).join("، "); };
const short = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };
const join = parts => parts.filter(Boolean).join(" ").replace(/\s+([،.])/g, "$1").replace(/\s+/g, " ").trim();
const CONTACT = {
  tenders: "التقديم الرسمي عند الجهة نفسها من الإعلان الرسمي (documents_url). المنصة مش بتطرح ولا بترسي المناقصات، ومفيش أرقام تليفونات أو إيميلات خاصة.",
  rfqs: "صاحب الطلب بياناته الشخصية مش متاحة؛ العضو يسجّل عرض سعره من صفحة الطلب على المنصة (list_url) والمنصة تبلغه بأي تحديث.",
  factories: "التواصل مع المصنع عن طريق زر «اطلب عرض سعر» في صفحته على المنصة — مفيش أرقام تليفونات أو إيميلات خاصة.",
  products: "السعر عند الطلب: من زر «اطلب عرض سعر» في صفحة المنتج أو المصنع على المنصة.",
  offers: "العرض من صفحة المحل الرسمية (documents_url)؛ الأسعار ممكن تتغير بعد آخر مراجعة.",
  cities: "البيانات من المصادر الرسمية المفتوحة للمنطقة.", awards: "بيانات الترسية منقولة من مصدرها المنشور (documents_url).", projects: "بيانات المشروع من مصدره المنشور (documents_url)؛ التواصل مع الجهة المالكة مش من خلال المنصة.",
};

/* ---------- records ---------- */
function tenderRecord(t, nowMs) {
  const st = statusOf(t.deadline, nowMs), intl = t.market !== "local";
  const rec = { section: "tenders", id: t.id, ref: t.ref, title: t.title, title_en: t.title_en || undefined, type: t.ptype || undefined, entity: t.entity || undefined, entity_en: t.entity_en || undefined,
    entity_kind: t.kind || undefined, market: t.market, country: t.country || undefined, country_en: t.country_en || undefined, governorate: t.gov || undefined, city: t.city || undefined, activity: t.sector || undefined,
    publish_date: t.publish || undefined, deadline: t.deadline || undefined, status: st, bid_bond_egp: t.bond_egp ?? undefined, bid_bond_note: t.bond_note || undefined,
    booklet_price_egp: t.booklet_egp ?? undefined, estimated_value: t.est_value ?? undefined, currency: t.currency || undefined,
    documents_url: t.docs || undefined, source: t.via || undefined, open_url: absUrl(t.path), list_url: t.list ? absUrl(t.list) : undefined,
    list_key: listKey(t) || undefined, contact: CONTACT.tenders };
  const where = intl ? [t.country, t.city].filter(Boolean).join(" – ") : t.gov ? t.gov + (t.city && !t.city.includes(t.gov) ? " (" + t.city + ")" : t.city ? " (" + t.city.split(" - ")[0] + ")" : "") : "";
  const money = [];
  if (rec.bid_bond_egp != null) money.push("قيمة التأمين الابتدائي " + sayMoney(rec.bid_bond_egp) + (t.bond_note ? " (" + t.bond_note + ")" : ""));
  else if (t.bond_note) money.push("التأمين " + t.bond_note);
  if (rec.booklet_price_egp != null) money.push("ثمن الكراسة " + sayMoney(rec.booklet_price_egp));
  if (rec.estimated_value != null) money.push("القيمة التقديرية " + g(rec.estimated_value) + " " + (t.currency || ""));
  rec.text = join([
    (intl ? "المناقصة دي دولية" : "المناقصة دي") + (t.entity ? " من " + t.entity : "") + (where ? " في " + where : "") + "،",
    t.ref ? "رقمها " + t.ref + "،" : "",
    t.deadline ? "آخر ميعاد للتقديم " + sayDate(t.deadline, nowMs) + (STP[st] ? " " + STP[st] : "") + "." : "وميعاد التقديم مش معلن في بيانات المنصة.",
    money.length ? money.join("، و") + "." : "ومفيش مبالغ (تأمين أو ثمن كراسة) منشورة على المنصة للمناقصة دي.",
    !t.entity ? "اسم الجهة مش مذكور في بيانات المنصة." : "",
    t.docs ? "الشروط والكراسة من الإعلان الرسمي" + (t.via ? " على " + t.via : "") + "." : "",
  ]);
  return rec;
}
function rfqRecord(q, nowMs) {
  const rec = { section: "rfqs", id: q.id, ref: q.id, title: q.title, date: q.date || undefined, activity: q.sector || undefined, governorate: q.gov || undefined, quantity: q.qty || undefined,
    delivery: q.delivery || undefined, deadline: q.deadline || undefined, details: q.details || undefined, details_en: q.details_en || undefined, open_url: absUrl(q.path), list_url: absUrl(q.list), contact: CONTACT.rfqs };
  rec.text = join([
    "طلب عرض السعر رقم " + q.id + (q.date ? " اتنشر يوم " + sayDate(q.date, nowMs) : "") + (q.sector ? " في قطاع " + q.sector : "") + ".",
    "المطلوب: " + short(q.title.replace(/^طلب عرض (ال)?(سعر|أسعار)\s*[–-]\s*/, ""), 150) + ".",
    q.qty ? "الكمية: " + q.qty + "." : "", q.delivery ? "مكان التسليم: " + q.delivery + "." : q.gov ? "المحافظة: " + q.gov + "." : "", q.deadline ? "آخر ميعاد " + sayDate(q.deadline, nowMs) + "." : "",
    "تقدر تسجّل عرض سعرك من صفحة الطلب على المنصة، وبيانات صاحب الطلب الشخصية مش متاحة.",
  ]);
  return rec;
}
function factoryRecord(f) {
  const k = hashOf(f[5]), x = F[k] || [];
  const rec = { section: "factories", id: k, title: f[0], name: f[0], type: f[1] || undefined, activity: f[2] || undefined, location: f[3] || undefined, governorate: x[2] || undefined,
    products: f[4] || undefined, description: x[0] || undefined, verified: x[1] ? true : undefined, open_url: absUrl(x[3] || f[5]), contact: CONTACT.factories };
  rec.text = join([
    f[0] + (f[1] ? " — " + f[1] : "") + (f[3] ? " في " + f[3] : "") + (f[2] ? "، نشاطه " + f[2] : "") + ".",
    f[4] ? "من منتجاته: " + first(f[4], 5) + "." : "", x[1] ? "المنشأة موثّقة من فريق المنصة." : "",
    "التواصل من زر «اطلب عرض سعر» في صفحته على المنصة.",
  ]);
  return rec;
}
function productRecord(p, i) {
  const rec = { section: "products", id: "p" + i, title: p.name, name: p.name, name_en: p.name_en || undefined, maker: p.maker || undefined, category: p.cat || undefined, open_url: absUrl(p.path), contact: CONTACT.products };
  rec.text = join([p.name + (p.maker ? " من إنتاج " + p.maker : "") + ".", "السعر عند الطلب من المصنع عن طريق زر «اطلب عرض سعر» على المنصة."]);
  return rec;
}
function offerRecord(o, nowMs) {
  const rec = { section: "offers", id: o.id, title: o.product, product: o.product, product_en: o.product_en || undefined, brand: o.brand || undefined, store: o.store || undefined, price_egp: o.price_egp ?? undefined,
    old_price_egp: o.old_price_egp ?? undefined, discount_pct: o.discount_pct ?? undefined, size: o.size || undefined, category: o.cat || undefined, cities: o.cities || undefined,
    valid_from: o.valid_from || undefined, valid_to: o.valid_to || undefined, documents_url: o.docs || undefined, open_url: absUrl(o.path), contact: CONTACT.offers };
  rec.text = join([
    "عرض " + o.product + (o.store ? " في " + o.store : "") + (o.price_egp != null ? ": بـ" + sayMoney(o.price_egp) : "") + (o.old_price_egp != null ? " بدل " + sayMoney(o.old_price_egp) : "") + (o.discount_pct != null ? " (خصم " + Math.round(o.discount_pct) + "٪)" : "") + ".",
    o.valid_to ? "ساري لحد " + sayDate(o.valid_to, nowMs) + "." : "", o.cities ? "في " + o.cities + "." : "",
  ]);
  return rec;
}
function cityRecord(z) {
  const rec = { section: "cities", id: z.id, title: z.name, name: z.name, name_en: z.name_en || undefined, type: z.type || undefined, governorate: z.gov || undefined, city: z.city || undefined,
    area: z.area || undefined, sectors: z.sectors || undefined, documents_url: z.docs || undefined, open_url: absUrl(z.path), contact: CONTACT.cities };
  rec.text = join([z.name + (z.gov ? " في محافظة " + z.gov : "") + ".", z.area ? "المساحة: " + z.area + "." : "", z.sectors ? "أهم القطاعات: " + first(z.sectors, 5) + "." : ""]);
  return rec;
}
function awardRecord(a, nowMs) {
  const rec = { section: "awards", id: a.id, title: a.title, winner: a.winner || undefined, entity: a.entity || undefined, governorate: a.gov || undefined, city: a.city || undefined, date: a.date || undefined,
    values_million: a.values_million.length ? a.values_million.map(v => ({ currency: v[0], value_million: v[1] })) : undefined, documents_url: a.docs || undefined, open_url: absUrl(a.path), contact: CONTACT.awards };
  rec.text = join([
    "الترسية دي: " + a.title + (a.winner ? "، والفايز " + a.winner : "") + (a.entity ? "، من " + a.entity : "") + (a.date ? "، بتاريخ " + sayDate(a.date, nowMs) : "") + ".",
    a.values_million.length ? "قيمة العقد المنشورة " + a.values_million.map(v => sayMillion(v[1], v[2])).join(" (أو ") + (a.values_million.length > 1 ? ")" : "") + "." : "وقيمة العقد مش منشورة.",
  ]);
  return rec;
}
function projectRecord(p, nowMs) {
  const rec = { section: "projects", id: p.id, title: p.name, name: p.name, governorate: p.gov || undefined, location: p.location || undefined, activity: p.sector || undefined, stage: p.stage || undefined,
    value_egp_million: p.value_mn_egp ?? undefined, owner: p.owner || undefined, contractor: p.contractor || undefined, consultant: p.consultant || undefined, start_year: p.start || undefined,
    end_year: p.end || undefined, latest_news: p.news || undefined, latest_news_date: p.news_date || undefined, documents_url: p.docs || undefined, open_url: absUrl(p.path), contact: CONTACT.projects };
  rec.text = join([
 (/^مشروع/.test(p.name) ? "" : "مشروع ") + p.name + (p.gov ? " في " + p.gov : "") + (p.location ? " (" + p.location + ")" : "") + (p.sector ? "، قطاع " + p.sector : "") + (p.stage ? "، ومرحلته دلوقتي " + p.stage : "") + ".",
    p.owner ? "المالك " + p.owner + (p.contractor ? "، والمقاول " + p.contractor : "") + (p.consultant ? "، والاستشاري " + p.consultant : "") + "." : p.contractor ? "المقاول " + p.contractor + "." : "",
    p.value_mn_egp != null ? "القيمة المعلنة حوالي " + sayMillion(p.value_mn_egp, "جنيه") + "." : "",
    p.news ? "آخر خبر" + (p.news_date ? " (" + sayDate(p.news_date, nowMs) + ")" : "") + ": " + short(p.news, 220) : "",
  ]);
  return rec;
}

/* ---------- finding one item: exact id → exact ref → best title match (others listed) ---------- */
const nn = s => norm(s);
function bestByTitle(list, title, get) {
  const q = nn(title); if (!q) return [];
  const words = q.split(" ").filter(w => w.length > 1);
  const sc = list.map((x, i) => { const h = nn(get(x)); if (!h) return [0, i]; if (h === q) return [1000, i]; let s = h.includes(q) ? 500 : 0; for (const w of words) if (h.includes(w)) s += w.length; return [words.length && s < 0.6 * words.join("").length && s < 500 ? 0 : s, i]; })
    .filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]);
  return sc.map(x => list[x[1]]);
}
export function findItem(section, a = {}, nowMs = Date.now()) {
  const sec = sectionOf(section), id = String(a.id ?? "").trim(), ref = String(a.ref ?? "").trim(), title = String(a.title || a.query || a.name || "").trim().slice(0, 300);
  if (!sec) return { error: "section", found: false };
  let hit = null, many = [], shared = 0;
  const pick = (list, byId, byRef, getTitle) => {
    if (id) hit = byId(id); if (!hit && ref) { many = list.filter(x => byRef(x, ref)); hit = many[0] || null; }
    if (!hit && (id || ref)) { many = list.filter(x => byRef(x, id || ref)); hit = many[0] || null; }
    if (!hit && ref && ref !== id) hit = byId(ref); /* an id sent as ref ({factories, ref:"0"}, {tenders, ref:"eg-tnd-003"}) */
    if (hit && many.length > 1) { if (title) { const b = bestByTitle(many, title, getTitle); if (b[0]) hit = b[0]; else shared = many.length; } else shared = many.length; } /* a number several items share */
    if (!hit && title) { many = bestByTitle(list, title, getTitle); hit = many[0] || null; }
  };
  let rec = null;
  if (sec === "tenders") { pick(T, x => T_ID.get(x) || null, (t, r) => up(t.ref) === up(r) || up(listKey(t)) === up(r) || up(listKey(t)) === "OFF:" + up(r), t => t.title + " " + t.entity); if (hit) rec = tenderRecord(hit, nowMs); }
  else if (sec === "rfqs") { pick(Q, x => Q.find(q => q.id === x) || null, (q, r) => q.id === r, q => q.title); if (hit) rec = rfqRecord(hit, nowMs); }
  else if (sec === "factories") { pick(DATA.f, x => { const k = String(x).replace(/^.*company\.html#/, ""); return DATA.f.find(f => hashOf(f[5]) === k) || null; }, () => false, f => f[0]); if (hit) rec = factoryRecord(hit); }
  else if (sec === "products") { pick(P, x => { const m = /^p?(\d{1,5})$/i.exec(String(x).trim()); return m ? P[+m[1]] || null : null; }, () => false, p => p.name + " " + p.maker); if (hit) rec = productRecord(hit, P.indexOf(hit)); }
  else if (sec === "offers") { pick(O, x => O.find(o => o.id === x) || null, () => false, o => o.product + " " + o.store); if (hit) rec = offerRecord(hit, nowMs); }
  else if (sec === "cities") { pick(Z, x => Z.find(z => z.id === x) || null, () => false, z => z.name + " " + z.name_en); if (hit) rec = cityRecord(hit); }
  else if (sec === "awards") { pick(A, x => A.find(w => w.id === x) || null, () => false, w => w.title + " " + w.winner); if (hit) rec = awardRecord(hit, nowMs); }
  else if (sec === "projects") { pick(J, x => J.find(p => p.id === x.toLowerCase()) || null, () => false, p => p.name); if (hit) rec = projectRecord(hit, nowMs); }
  if (!rec) return { found: false, section: sec, text: "مش لاقي العنصر ده في بيانات المنصة" + (title ? " («" + short(title, 60) + "»)" : "") + ". متخترعش بيانات؛ دوّر الأول بـ janna_lookup وخد الـ id من النتيجة." };
  const others = many.filter(x => x !== hit).slice(0, 4).map(x => sec === "factories" ? { id: hashOf(x[5]), title: x[0] } : sec === "products" ? { id: "p" + P.indexOf(x), title: x.name } : { id: x.id, title: x.title || x.name || x.product });
  /* review 2026-11-18 #11: a shared number (OFF:1 ×5 …) without a title is NOT one item — say so and name the others */
  if (shared > 1) { rec.ambiguous = true; rec.matches = shared; rec.text += ` تنبيه: الرقم «${short(ref || id, 40)}» مشترك بين ${shared} بنود في بيانات المنصة، والتفاصيل دي لأول واحد بس. التانيين: ` + others.map(o => "«" + short(o.title, 70) + "» (id " + o.id + ")").join("، ") + (shared > others.length + 1 ? " وغيرهم" : "") + ". اسأل العضو يقصد أنهي واحد، وهات تفاصيله بالـ id."; }
  return Object.assign({ found: true }, rec, others.length ? { others } : {});
}

/* ---------- /api/janna/lookup results: the same ids + clean URLs + the amounts (backward compatible: fields are only ADDED) ---------- */
export function enrichResult(section, r, nowMs = Date.now()) {
  const sec = sectionOf(section) || section; if (!r || typeof r !== "object") return r;
  if (sec === "tenders") {
    const t = r.market && r.market !== "local" ? T_KEY.get("intl|" + r.ref) : T_KEY.get(r.ref + "|" + r.title);
    if (!t) return r;
    return Object.assign(r, { id: t.id, ref_no: t.ref || undefined, entity: t.entity || r.entity, city: t.city || undefined, publish_date: t.publish || undefined,
      bid_bond_egp: t.bond_egp ?? undefined, bid_bond_note: t.bond_note || undefined, booklet_price_egp: t.booklet_egp ?? undefined, estimated_value: t.est_value ?? undefined, currency: t.currency || undefined,
      documents_url: t.docs || undefined, open_url: absUrl(t.path), list_url: t.list ? absUrl(t.list) : undefined, list_key: listKey(t) || undefined, market: t.market, country: t.market !== "local" ? t.country : undefined,
      /* «tenders/search/#OFF:1» may open ANOTHER tender (shared number): when the record has no unique list link, url = its own page */
      ...(!t.list && absUrl(t.path) ? { url: absUrl(t.path) } : {}) });
  }
  if (sec === "rfqs") { const q = Q.find(x => x.id === String(r.ref)); return q ? Object.assign(r, { id: q.id, activity: q.sector || undefined, governorate: q.gov || undefined, deadline: q.deadline || undefined, open_url: absUrl(q.path), list_url: absUrl(q.list) }) : r; }
  if (r.product !== undefined && r.maker !== undefined) { const p = P_KEY.get(r.product + "|من إنتاج " + r.maker) || P_KEY.get(r.product + "|" + r.maker); return p ? Object.assign(r, { id: "p" + P.indexOf(p), section: "products", open_url: absUrl(p.path) }) : r; }
  if (r.name !== undefined && /company\.html#/.test(r.url || "")) { const k = hashOf(r.url), x = F[k] || []; return Object.assign(r, { id: k, section: "factories", governorate: x[2] || undefined, verified: x[1] ? true : undefined, open_url: absUrl(x[3] || r.url) }); }
  if (sec === "offers") { const o = O.find(x => absUrl(x.path) && hashOf(r.url) === x.id); return o ? Object.assign(r, { id: o.id, discount_pct: o.discount_pct ?? undefined, cities: o.cities || undefined, open_url: absUrl(o.path) }) : r; }
  if (sec === "cities") { const z = Z.find(x => hashOf(r.url) === x.id); return z ? Object.assign(r, { id: z.id, open_url: absUrl(z.path) }) : r; }
  return r;
}

/* ---------- HTTP: same key rule and CORS as /api/janna/lookup ---------- */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Janna-Key" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
export async function handleItem(req, env, ctx, nowMs = Date.now()) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method" }, 405);
  if (env && env.JANNA_KEY && req.headers.get("X-Janna-Key") !== env.JANNA_KEY) return json({ error: "unauthorized" }, 401);
  let a = Object.fromEntries(new URL(req.url).searchParams);
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    if (b && typeof b === "object") { for (const k of ["arguments", "parameters", "args", "input"]) if (b[k] && typeof b[k] === "object") b = Object.assign({}, b[k], b); a = Object.assign(a, b); }
  }
  const sec = sectionOf(a.section);
  if (!sec) return json({ error: "section required", sections: ["tenders", "rfqs", "factories", "products", "offers", "cities", "awards", "projects"] }, 400);
  if (!a.id && !a.ref && !a.title && !a.query && !a.name) return json({ error: "id, ref or title required" }, 400);
  const r = findItem(sec, { id: a.id == null ? "" : String(a.id).slice(0, 160), ref: a.ref == null ? "" : String(a.ref).slice(0, 160), title: String(a.title || a.query || a.name || "").slice(0, 300) }, nowMs);
  /* an Anam webhook answer that is not 2xx may never reach the model (holo5 tools.md #4): POST says «not found» with 200; GET keeps 404 */
  return json(r, r.found || req.method === "POST" ? 200 : 404);
}
