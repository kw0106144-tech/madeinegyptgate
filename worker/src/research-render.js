/* «بحث وكتابة عميقة» — the renderer (design part A §A.9 counts, §A.11.4–5, §A.12, §A.13). PURE: the clock comes in as nowMs.
   It builds, from the checked draft (research-check.js) and the pack's INTERNAL metadata (origin, member, verified, page — never shown):
     doc    the customer document: title, summary, sections in the template's order (w sections from the data, m / a from the checked
            blocks), items (Worker-built labels: {type — entity — country}, platform names for platform items, deadlines, badges from data,
            a link only from linkable()), CTAs by direction. It stores DEADLINES, never a status (readDoc computes it when the document is
            read: a tender read after its deadline never says «مفتوحة»).
     say    the spoken result line (≤ 220 characters), block = the persona's context block (≤ 1,200), top = ≤ 5 items for the call screen,
     counts {buyers, tenders_open, rfqs_open, projects, platform: {factories, members, tenders}} (platform.* = platform-origin items only;
            tenders_open / rfqs_open = open / closing items with a known future deadline, never a web item).
   What it never writes: a source, a site, a link out, a provenance label, the date an item was found, an outside item's own title. */
import { cairoDay, addDays } from "./common.js";
import { KINDS, VOICE, TITLE, TYPE_WORDS, CTA, MARKETS, fill } from "./research-kinds.js";

export const LIM = Object.freeze({ say: 220, block: 1200, ack: 350, status: 250, top: 5, blockTop: 3, line: 160 });
const cut = (s, n) => { const a = Array.from(String(s || "")); return a.length <= n ? a.join("") : a.slice(0, n - 1).join("").replace(/\s+\S*$/, "") + "…"; };
/* the honest four-value status of a deadline on the Cairo day of nowMs (index.js tenderStatus, web-public.js statusOf) */
export function statusOf(deadline, nowMs = Date.now(), closed = false) {
  if (closed) return "closed";
  const d = /^(\d{4}-\d{2}-\d{2})/.exec(String(deadline || "")); if (!d) return "unknown";
  const today = cairoDay(nowMs);
  return d[1] < today ? "closed" : d[1] <= addDays(today, 7) ? "closing" : "open";
}
export const isOpen = st => st === "open" || st === "closing";
/* the ONE link predicate of every surface (§A.12.4): only platform pages that show no source and no provenance label — members' and
   imported directory profiles (never a researched «#x» row), product pages, the RFQ form and registration */
const LINK_OK = /^\/(?:factories|industrial_products)\/[^/?#]+\/$|^\/register\/$|^\/contact\/#rfq-form$/;
export function linkable(m) {
  if (!m || m.origin !== "platform" || m.pub) return "";
  if (m.type !== "company" && m.type !== "product") return "";
  let p = String(m.page || "");
  try { if (/^https:\/\/(?:www\.)?madeinegyptgate\.com\//.test(p)) p = new URL(p).pathname; } catch (e) { return ""; }
  try { p = decodeURI(p); } catch (e) { /* keep */ }
  if (!/^\/(?!\/)/.test(p) || /[<>"'\s\\]/.test(p) || !LINK_OK.test(p)) return "";
  return encodeURI(p);
}
const typeWord = (t, en) => (TYPE_WORDS[t] || TYPE_WORDS.fact)[en ? 1 : 0];
/* the Worker-built label of an item: a platform company / product by its platform name; anything else {type — entity — country} */
export function labelOf(m, en) {
  if (m.origin === "platform" && (m.type === "company" || m.type === "product") && m.name) return cut(m.name, 110);
  return [typeWord(m.type, en), m.entity, m.country || m.place].filter(Boolean).map(x => cut(x, 60)).join(" — ");
}
const badgeOf = m => (m.origin === "platform" && m.member ? "member" : m.origin === "platform" && m.verified && !m.pub ? "verified" : "");
/* one document item (what any customer surface may show of it) */
function docItem(m, line, en) {
  const x = { k: m.type, label: labelOf(m, en) };
  if (m.entity && !(m.origin === "platform" && m.type === "company")) x.entity = cut(m.entity, 100);
  if (m.place) x.place = cut(m.place, 80); if (m.country) x.country = cut(m.country, 60);
  if (m.deadline && /^\d{4}-\d{2}-\d{2}/.test(m.deadline)) x.deadline = m.deadline.slice(0, 10);
  if (m.cancelled) x.cancelled = true;
  if (m.value) x.value = cut(m.value, 60);
  if (m.activity && m.origin === "platform") x.activity = cut(m.activity, 80);
  const b = badgeOf(m); if (b) x.badge = b;
  const l = linkable(m); if (l) x.link = l;
  if (line) x.line = cut(line, LIM.line);
  return x;
}
const TENDERISH = new Set(["tender", "rfq"]);
/* counts by type (R4: platform counts from platform items only; a web tender is never counted open) */
export function countsOf(meta, nowMs) {
  const c = { buyers: 0, tenders_open: 0, rfqs_open: 0, projects: 0, opportunities: 0, platform: { factories: 0, members: 0, tenders: 0 } };
  for (const m of Object.values(meta || {})) {
    const st = TENDERISH.has(m.type) ? statusOf(m.deadline, nowMs, m.cancelled) : "";
    if (m.origin === "platform" && m.type === "company") { if (m.member) c.platform.members++; else c.platform.factories++; }
    if (m.type === "buyer" && m.origin !== "platform") c.buyers++;
    if (m.type === "project") c.projects++;
    if (TENDERISH.has(m.type) && m.origin !== "web" && isOpen(st) && m.deadline) { if (m.type === "tender") c.tenders_open++; else c.rfqs_open++; }
    if (TENDERISH.has(m.type) && m.origin === "platform" && isOpen(st)) c.platform.tenders++;
    if ((TENDERISH.has(m.type) && st !== "closed") || m.type === "project" || m.type === "buyer" || m.type === "buyer_list") c.opportunities++;
  }
  return c;
}
/* the w sections: which items each lists (the ids, in the pack's order) */
function wItems(key, meta, nowMs) {
  const all = Object.keys(meta);
  const st = id => statusOf(meta[id].deadline, nowMs, meta[id].cancelled);
  switch (key) {
    case "members": return all.filter(id => meta[id].origin === "platform" && meta[id].type === "company" && meta[id].member);
    case "directory": return all.filter(id => meta[id].origin === "platform" && meta[id].type === "company" && !meta[id].member);
    case "tender_buyers": return all.filter(id => TENDERISH.has(meta[id].type) && meta[id].entity && st(id) !== "closed");
    case "more_buyers": return all.filter(id => meta[id].origin !== "platform" && (meta[id].type === "buyer" || meta[id].type === "buyer_list" || meta[id].type === "project"));
    case "opportunities": return all.filter(id => (TENDERISH.has(meta[id].type) && st(id) !== "closed") || meta[id].type === "project" || (meta[id].type === "buyer" && meta[id].origin !== "platform"));
    case "related": case "players": return all.filter(id => meta[id].origin === "platform" && (meta[id].type === "company" || meta[id].type === "product" || TENDERISH.has(meta[id].type)) && !meta[id].ref_item);
    default: return [];
  }
}
const ctasOf = (kind, member) => { const K = KINDS[kind]; const out = []; if (member) out.push("mail"); if (K.side === "buyer") out.push("rfq"); else if (!member) out.push("register"); return out; };

/* render(checked, pack, kind, job) → {doc, say, block, top, counts}. job: {id, label, lang, voice_lang, params, member (bool), nowMs, ms, phone} */
export function render(checked, pack, kind, job) {
  const K = KINDS[kind], en = job.lang === "en" || job.lang !== "ar" && job.lang !== "ur" && job.lang !== "fa", nowMs = job.nowMs || Date.now();
  const meta = (pack && pack.meta) || {}, lines = (checked && checked.item_lines) || {}, p = job.params || {};
  const used = new Set();
  const sections = [];
  for (const S of K.sections) {
    const heading = en ? S.en : S.ar;
    if (S.t === "w") {
      let blocks = [];
      if (S.key === "next") blocks = ctasOf(kind, !!job.member).map(c => ({ type: "cta", cta: c }));
      else if (S.key === "header") blocks = [{ type: "row", text: (en ? "Date: " : "التاريخ: ") + cairoDay(nowMs) }].concat(p.buyer ? [{ type: "row", text: (en ? "To: " : "إلى: ") + cut(p.buyer, 100) }] : []);
      else if (S.key === "facts") { const id = Object.keys(meta).find(k => meta[k].ref_item); if (id) { blocks = [{ type: "item", ref: id }]; used.add(id); } }
      else if (S.key === "products" || S.key === "markets") { const f = Object.keys(meta).find(k => meta[k].type === "fact" && meta[k].about === "member_profile"); const v = f ? meta[f][S.key === "products" ? "products" : "markets"] : null; if (Array.isArray(v)) blocks = v.slice(0, 12).map(x => ({ type: "bullet", text: cut(x, 160) })); }
      else for (const id of wItems(S.key, meta, nowMs)) { if (used.has(id)) continue; used.add(id); blocks.push({ type: "item", ref: id }); if (blocks.length >= 12) break; }
      if (blocks.length) sections.push({ key: S.key, heading, blocks });
      continue;
    }
    const cs = ((checked && checked.sections) || []).find(x => x.key === S.key);
    if (!cs || !cs.blocks.length) continue;
    const blocks = cs.blocks.map(b => (b.type === "item_ref" ? (meta[b.ref] ? (used.add(b.ref), { type: "item", ref: b.ref }) : null) : { type: b.type, text: b.text, ...(b.subject ? { subject: b.subject } : {}) })).filter(Boolean);
    if (blocks.length) sections.push({ key: S.key, heading, blocks });
  }
  const items = {};
  for (const sec of sections) for (const b of sec.blocks) if (b.type === "item" && meta[b.ref] && !items[b.ref]) items[b.ref] = docItem(meta[b.ref], lines[b.ref], en);
  const T0 = TITLE[kind][en ? 1 : 0], prod = cut(p.product || p.subject || "", 60), q = cut(p.question || "", 60), mk = MARKETS[p.market] ? MARKETS[p.market][en ? 1 : 0] : "";
  const title = (checked && checked.title) || fill(T0, { p: prod, q, m: mk }).replace(/«»|“”/g, "").trim();
  const counts = countsOf(Object.fromEntries(Object.keys(items).map(k => [k, meta[k]])), nowMs);
  const doc = { v: 1, kind, lang: job.lang, dir: ["ar", "ur", "fa"].includes(job.lang) ? "rtl" : "ltr", title: cut(title, 120), summary: (checked && checked.summary) || "", sections, items, made: cairoDay(nowMs), label: job.label };
  const V = VOICE[job.voice || "bassem_ar"], where = job.phone ? V.where_phone : V.where;
  const say = cut(sayOf(V, kind, counts, { where: job.phone ? V.where_you_phone : V.where_you, need: (job.voice === "bassem_en" ? K.need_en : K.need_ar), p: prod }), LIM.say);
  const top = topOf(doc, nowMs, job.voice === "bassem_en");
  const block = blockOf(V, job, { say, top, rest: Math.max(0, Object.keys(items).length - LIM.blockTop), where, need: job.voice === "bassem_en" ? K.need_en : K.need_ar, prod, mk });
  return { doc, say, block, top, counts, empty: !Object.keys(items).length && !sections.some(x => x.blocks.some(b => b.type !== "cta" && b.type !== "item")) };
}
/* the cue: the counts by type, each part only when > 0 */
function sayOf(V, kind, c, v) {
  const K = KINDS[kind];
  if (K.own) return fill(V.done_doc, { need: v.need, where: v.where }).replace(/^./, x => x.toUpperCase());
  const parts = [];
  if (c.platform.members) parts.push(V.p_members(c.platform.members));
  if (c.platform.factories) parts.push(V.p_directory(c.platform.factories));
  if (c.buyers) parts.push(V.p_buyers(c.buyers));
  if (c.tenders_open) parts.push(V.p_tenders(c.tenders_open));
  if (c.rfqs_open) parts.push(V.p_rfqs(c.rfqs_open));
  if (!parts.length && c.opportunities) parts.push(V.p_opps(c.opportunities));
  if (!parts.length) return kind === "answer" || kind === "summary" || kind === "export_plan" ? fill(V.done_doc, { need: v.need, where: v.where }) : fill(V.empty, { p: v.p });
  return fill(V.done_cue, { parts: parts.join(V.and), where: v.where });
}
/* readDoc(doc, {nowMs, hidden}) → the document as a customer reads it NOW: statuses computed, the team's hidden items out, closed
   opportunities out of the opportunity sections, a closed tender's how_to_apply out */
export function readDoc(doc, { nowMs = Date.now(), hidden = [] } = {}) {
  if (!doc || typeof doc !== "object") return null;
  const H = new Set(hidden), items = {};
  for (const [k, it] of Object.entries(doc.items || {})) { if (H.has(k)) continue; const x = { ...it }; if (TENDERISH.has(x.k)) x.status = statusOf(x.deadline, nowMs, x.cancelled); items[k] = x; }
  const closedFacts = (doc.sections || []).some(s => s.key === "facts" && s.blocks.some(b => b.type === "item" && items[b.ref] && items[b.ref].status === "closed"));
  const OPP = new Set(["tender_buyers", "opportunities"]);
  const sections = (doc.sections || []).filter(s => !(s.key === "how_to_apply" && closedFacts)).map(s => ({ ...s, blocks: s.blocks.filter(b => b.type !== "item" || (items[b.ref] && !(OPP.has(s.key) && items[b.ref].status === "closed"))) })).filter(s => s.blocks.length);
  const used = new Set(); for (const s of sections) for (const b of s.blocks) if (b.type === "item") used.add(b.ref);
  for (const k of Object.keys(items)) if (!used.has(k)) delete items[k];
  return { ...doc, sections, items };
}
/* ≤ 5 items for the call screen (members first, then open opportunities, then the rest) */
export function topOf(doc, nowMs, en) {
  const d = readDoc(doc, { nowMs }); if (!d) return [];
  const rank = it => (it.badge === "member" ? 0 : it.status && isOpen(it.status) ? 1 : it.badge === "verified" ? 2 : 3);
  return Object.entries(d.items).sort((a, b) => rank(a[1]) - rank(b[1])).slice(0, LIM.top).map(([ref, it]) => ({ ref, ...it }));
}
function itemSpoken(V, it) {
  const st = it.status ? V.status_word[it.status] : "", bd = it.badge === "member" ? V.badge_member : it.badge === "verified" ? V.badge_verified : "";
  return [it.label, it.place && !String(it.label).includes(it.place) ? it.place : "", it.deadline ? it.deadline : TENDERISH.has(it.k) ? V.unknown_deadline : "", st, bd, it.line].filter(Boolean).join(" — ");
}
function blockOf(V, job, v) {
  const lab = job.label || "R1", en = job.voice === "bassem_en";
  const items = v.top.slice(0, LIM.blockTop).map((it, i) => "(" + (i + 1) + ") " + cut(itemSpoken(V, it), 230)).join(" ");
  const parts = [fill(V.block_head, { label: lab }), fill(V.block_job, { need: v.need, p: v.prod, mk: v.mk ? (en ? " (" + v.mk + ")" : " (" + v.mk + ")") : "", where: v.where })];
  if (v.say) parts.push(fill(V.block_said, { say: v.say }));
  if (items) parts.push(fill(V.block_top, { items }));
  if (v.rest > 0) parts.push(fill(V.block_rest, { n: v.rest, label: lab }));
  parts.push(V.block_rules, fill(V.block_end, { label: lab }));
  let b = parts.join("\n");
  if (Array.from(b).length > LIM.block) { parts.splice(3, 1, fill(V.block_top, { items: cut(items, Math.max(120, LIM.block - (b.length - items.length) - 10)) })); b = parts.join("\n"); }
  return cut(b, LIM.block);
}

/* ---------- the e-mail (§A.13): the document as text + HTML; deadlines as dates only (an e-mail cannot be updated), every value escaped,
   only linkable platform links + the document's own page; no source, no outside link, no label ---------- */
const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function mailOf(doc, { site = "https://madeinegyptgate.com/", id = "", nowMs = Date.now(), persona = "bassem" } = {}) {
  const d = readDoc(doc, { nowMs }); if (!d) return null;
  const en = d.dir === "ltr", W = en ? { dl: "Deadline: ", why: "You received this because you asked " + (persona === "janna" ? "Janna" : "Bassem") + " for it.", open: "Open the document: ", sub: "Document: ", member: "member on the platform", verified: "verified by the platform team" }
    : { dl: "آخر ميعاد: ", why: "وصلك لأنك طلبته من " + (persona === "janna" ? "جنة" : "باسم") + ".", open: "افتح المستند: ", sub: "مستند: ", member: "عضو على المنصة", verified: "موثّق من فريق المنصة" };
  const base = String(site).replace(/\/+$/, "/"), docUrl = base + "research/#" + encodeURIComponent(id);
  const itemTxt = it => [it.label, it.entity && !String(it.label).includes(it.entity) ? it.entity : "", it.place || it.country || "", it.deadline ? W.dl + it.deadline : "", it.badge === "member" ? W.member : it.badge === "verified" ? W.verified : "", it.line || ""].filter(Boolean).join(" — ");
  const txt = [d.title, d.summary ? "\n" + d.summary : ""], html = [`<h2 style="margin:0 0 8px">${escH(d.title)}</h2>`, d.summary ? `<p>${escH(d.summary)}</p>` : ""];
  for (const s of d.sections) {
    const rows = s.blocks.filter(b => b.type !== "cta");
    if (!rows.length) continue;
    txt.push("\n" + s.heading); html.push(`<h3 style="margin:16px 0 6px">${escH(s.heading)}</h3>`);
    for (const b of rows) {
      if (b.type === "item") { const it = d.items[b.ref]; if (!it) continue; const t = itemTxt(it), link = it.link ? base + it.link.replace(/^\//, "") : ""; txt.push("• " + t + (link ? "\n  " + link : "")); html.push(`<div style="padding:8px 10px;border:1px solid #e3e3e3;border-radius:8px;margin:6px 0">${escH(t)}${link ? `<br><a href="${escH(link)}">${escH(link)}</a>` : ""}</div>`); continue; }
      const head = b.subject ? b.subject + "\n" : "";
      txt.push((b.type === "bullet" || b.type === "step" ? "• " : "") + head + b.text);
      html.push(`<p style="white-space:pre-wrap;margin:6px 0">${b.subject ? `<b>${escH(b.subject)}</b><br>` : ""}${escH(b.text)}</p>`);
    }
  }
  txt.push("\n" + W.open + docUrl, "—", W.why);
  html.push(`<p style="margin-top:18px"><a href="${escH(docUrl)}">${escH(W.open + docUrl)}</a></p><p style="color:#777;font-size:12px">${escH(W.why)}</p>`);
  return { subject: cut(W.sub + d.title, 200), text: txt.join("\n").slice(0, 60000), html: `<div dir="${d.dir}" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:640px;margin:0 auto">${html.join("")}</div>` };
}
/* every customer-facing string of a rendered job, for the property test (the doc, say, block, top, the e-mail) */
export function stringsOf(r, mail) {
  const out = [];
  const walk = v => { if (v == null) return; if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === "object") Object.values(v).forEach(walk); };
  walk(r.doc); walk(r.say); walk(r.block); walk(r.top); if (mail) { walk(mail.subject); walk(mail.text); walk(mail.html); }
  return out;
}
export { CTA };
