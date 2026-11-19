/* migate-intel — parsers. Every parser returns raw records {ext_id, title, url, published, summary, deadline, entity,
   country, cpv, value, currency, notice_type, proc_group, proc_method, kind?} that store.normalise() turns into items.
   - rss / atom / sitemap (Google-News sitemaps): tolerant regex XML reader (CDATA, entities, namespaces)
   - json: declarative mapping {items: "path", fields: {name: "a.b|c.*.0" | {tpl: "..{x}.."} | {join: [...], sep}}}
   - html: list extraction through the HTMLRewriter API (Workers runtime) — selectors {item, fields: {name: {sel, attr?}}};
     outside the runtime (node --test) the same handlers run on a small HTMLRewriter-compatible shim (src/htmlshim.js). */
import { decodeEntities, stripHtml, absUrl } from "./util.js";
import { ShimRewriter } from "./htmlshim.js";
import { ADAPTERS as ADAPTERS_JSON } from "./adapters/json.js";
import { ADAPTERS as ADAPTERS_BIGTABLES } from "./adapters/bigtables.js";
import { ADAPTERS as ADAPTERS_HTMLLISTS } from "./adapters/htmllists.js";
import { ADAPTERS as ADAPTERS_EGYPT } from "./adapters/egypt.js";

/* ---------- per-source adapters (src/adapters/*.js) ----------
   One registry keyed by source id: { parse(text, src, Rewriter) → raw records, fetch?: { pages, headers, timeout_ms,
   retries, backoff_ms, follow_next }, detail?: { parse(html, rec), max, kinds } }. A source with an entry here is always
   parsed by its adapter, whatever its `parser` value; every other source keeps the generic parsers below. Workers have
   no file system, so each adapter module is imported statically (test/integration.test.mjs checks none is missing). */
export const ADAPTER_MODULES = { json: ADAPTERS_JSON, bigtables: ADAPTERS_BIGTABLES, htmllists: ADAPTERS_HTMLLISTS, egypt: ADAPTERS_EGYPT };
export const ADAPTERS = (() => {
  const all = {};
  for (const [mod, reg] of Object.entries(ADAPTER_MODULES)) {
    for (const [id, a] of Object.entries(reg || {})) {
      if (all[id]) throw new Error(`adapter ${id} is registered twice (${all[id].module} and ${mod})`);
      if (!a || typeof a.parse !== "function") throw new Error(`adapter ${id} (${mod}) has no parse()`);
      all[id] = Object.freeze({ ...a, module: mod });
    }
  }
  return Object.freeze(all);
})();
export const adapterFor = src => (src && Object.prototype.hasOwnProperty.call(ADAPTERS, src.id) ? ADAPTERS[src.id] : null);

/* ---------- XML feeds ---------- */
function tagText(block, names) {
  for (const n of names) {
    const re = new RegExp("<" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s[^>]*)?>([\\s\\S]*?)</" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ">", "i");
    const m = re.exec(block);
    if (m) {
      let v = m[2].trim();
      const cd = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
      if (cd) return cd[1].trim();
      return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
    }
  }
  return "";
}
function allTags(block, name) {
  const out = [], re = new RegExp("<" + name + "(\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "gi");
  let m; while ((m = re.exec(block))) out.push(m[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
  return out;
}
function attr(tag, name) { const m = new RegExp("\\s" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i").exec(tag); return m ? decodeEntities(m[2] ?? m[3]) : ""; }

export function detectXml(text) {
  const head = String(text || "").slice(0, 2000);
  if (/<feed[\s>]/i.test(head) && /xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(head)) return "atom";
  if (/<rss[\s>]|<rdf:RDF/i.test(head)) return "rss";
  if (/<urlset[\s>]/i.test(head)) return "sitemap";
  if (/<feed[\s>]/i.test(head)) return "atom";
  return "";
}
export function parseRss(xml, src = {}) {
  const out = [], base = src.endpoint || "";
  const re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const title = stripHtml(tagText(b, ["title"]));
    let link = decodeEntities(stripHtml(tagText(b, ["link"])));
    const guid = stripHtml(tagText(b, ["guid"]));
    if (!/^https?:\/\//i.test(link) && /^https?:\/\//i.test(guid)) link = guid;
    if (!link) { const ab = /<link\s[^>]*href=["']([^"']+)["']/i.exec(b); if (ab) link = decodeEntities(ab[1]); }
    const rdfAbout = /<item\s[^>]*rdf:about=["']([^"']+)["']/i.exec(m[0]);
    if (!link && rdfAbout) link = decodeEntities(rdfAbout[1]);
    const desc = tagText(b, ["description", "content:encoded", "summary"]);
    out.push({
      ext_id: guid || link, title, url: absUrl(link, base),
      published: stripHtml(tagText(b, ["pubDate", "dc:date", "published", "updated", "a10:updated"])),
      summary: stripHtml(desc), categories: allTags(b, "category").map(stripHtml), _raw: src.mapping && src.mapping.filter_re ? b : undefined,
    });
  }
  return out;
}
export function parseAtom(xml, src = {}) {
  const out = [], base = src.endpoint || "";
  const re = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const links = [...b.matchAll(/<link\b[^>]*>/gi)].map(x => x[0]);
    const alt = links.find(l => /rel=["']alternate["']/i.test(l)) || links.find(l => !/rel=/i.test(l)) || links[0] || "";
    const href = attr(alt, "href");
    const id = stripHtml(tagText(b, ["id"]));
    out.push({
      ext_id: id || href, title: stripHtml(tagText(b, ["title"])), url: absUrl(href || (/^https?:/.test(id) ? id : ""), base),
      published: stripHtml(tagText(b, ["published", "updated"])),
      summary: stripHtml(tagText(b, ["summary", "content"])),
      entity: stripHtml(tagText(b, ["author"]).replace(/<email>[\s\S]*?<\/email>/gi, "")),
      _raw: src.mapping && src.mapping.filter_re ? b : undefined,
    });
  }
  return out;
}
/* Google News sitemap: <url><loc/><news:news><news:publication_date/><news:title/></news:news></url> */
export function parseSitemap(xml, src = {}) {
  const out = [], re = /<url>([\s\S]*?)<\/url>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1], loc = decodeEntities(stripHtml(tagText(b, ["loc"])));
    const title = stripHtml(tagText(b, ["news:title", "image:title"]));
    if (!loc || !title) continue;
    out.push({ ext_id: loc, title, url: loc, published: stripHtml(tagText(b, ["news:publication_date", "lastmod"])), summary: "" });
  }
  return out;
}

/* ---------- JSON mapping ---------- */
export function getPath(obj, path) {
  if (path == null) return undefined;
  for (const alt of String(path).split("|")) {
    let cur = obj, ok = true;
    for (const seg of alt.split(".").filter(s => s !== "")) {
      if (cur == null) { ok = false; break; }
      if (seg === "*") {
        if (Array.isArray(cur)) cur = cur[0];
        else if (typeof cur === "object") { const vals = Object.values(cur); cur = vals.length ? vals[0] : undefined; }
        else { ok = false; break; }
      } else cur = cur[seg];
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}
function fieldValue(rec, spec) {
  if (spec == null) return undefined;
  if (typeof spec === "string") return getPath(rec, spec);
  if (spec.tpl) return spec.tpl.replace(/\{([^}]+)\}/g, (_, p) => { const v = getPath(rec, p); return v == null ? "" : encodeURIComponent(String(Array.isArray(v) ? v[0] : v)); });
  if (spec.join) return spec.join.map(p => getPath(rec, p)).map(v => Array.isArray(v) ? v[0] : v).filter(v => v != null && v !== "").map(v => stripHtml(String(v))).join(spec.sep || " — ");
  if (spec.const !== undefined) return spec.const;
  return undefined;
}
export function parseJson(text, src = {}) {
  const mp = src.mapping || {};
  let data = typeof text === "string" ? JSON.parse(text) : text;
  if (mp.unwrap) data = typeof getPath(data, mp.unwrap) === "string" ? JSON.parse(getPath(data, mp.unwrap)) : getPath(data, mp.unwrap);
  let arr = mp.items ? getPath(data, mp.items) : data;
  if (!Array.isArray(arr)) arr = arr && typeof arr === "object" ? Object.values(arr) : [];
  const F = mp.fields || {};
  return arr.map(rec => {
    const r = {};
    for (const k of Object.keys(F)) {
      let v = fieldValue(rec, F[k]);
      if (k !== "cpv" && Array.isArray(v)) v = v.find(x => x != null && x !== "");
      if (v != null && typeof v === "object" && k !== "cpv") v = Object.values(v)[0];
      if (Array.isArray(v) && k !== "cpv") v = v[0];
      r[k] = v == null ? "" : k === "cpv" ? v : typeof v === "string" ? v : String(v);
    }
    if (r.title) r.title = stripHtml(r.title);
    if (r.summary) r.summary = stripHtml(r.summary);
    if (r.url) r.url = absUrl(r.url, mp.base || src.endpoint);
    if (!r.ext_id) r.ext_id = r.url || r.title;
    return r;
  });
}

/* ---------- HTML list (HTMLRewriter) ---------- */
export async function parseHtml(html, src = {}, Rewriter) {
  const mp = src.mapping || {};
  const RW = Rewriter || (typeof HTMLRewriter !== "undefined" ? HTMLRewriter : ShimRewriter);
  const recs = [];
  let cur = null;
  const fields = mp.fields || {};
  let rw = new RW().on(mp.item, { element() { cur = { _t: {}, _open: {}, _done: {} }; recs.push(cur); } });
  for (const [name, spec0] of Object.entries(fields)) {
    const spec = typeof spec0 === "string" ? { sel: spec0 } : spec0;
    const sel = spec.sel ? mp.item + " " + spec.sel : mp.item;
    rw = rw.on(sel, {
      element(el) {
        const rec = cur;
        if (!rec || rec._done[name]) return;
        if (spec.attr) { if (rec[name] == null) { const v = el.getAttribute(spec.attr); if (v != null) { rec[name] = decodeEntities(v); rec._done[name] = !spec.all; } } return; }
        if (rec._open[name]) return;
        rec._open[name] = true;
        rec._t[name] = (rec._t[name] || "") + " ";
        try { el.onEndTag(() => { rec._open[name] = false; if (!spec.all) rec._done[name] = true; }); } catch (e) { /* void element */ }
      },
      text(t) {
        const rec = cur;
        if (!rec || spec.attr || rec._done[name] || !rec._open[name]) return;
        rec._t[name] += t.text;
      },
    });
  }
  const res = await rw.transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
  await res.text();
  const base = mp.base || src.endpoint;
  return recs.map(r => {
    const o = {};
    for (const name of Object.keys(fields)) {
      const v = r[name] != null ? r[name] : r._t[name] != null ? stripHtml(r._t[name]) : "";
      o[name] = String(v).replace(/[\u200e\u200f]/g, "").trim();
    }
    if (o.url) o.url = absUrl(o.url, base);
    if (mp.url_tpl && o.ext_id) o.url = mp.url_tpl.replace("{ext_id}", encodeURIComponent(o.ext_id));
    if (!o.ext_id) o.ext_id = o.url || o.title;
    return o;
  }).filter(o => o.title);
}

export async function parseBody(text, src, Rewriter) {
  const a = adapterFor(src);
  if (a) { const recs = await a.parse(text, src, Rewriter); if (!Array.isArray(recs)) throw new Error("adapter " + src.id + " returned no list"); return recs; }
  const p = src.parser;
  if (p === "adapter") throw new Error("no adapter registered for " + src.id);
  if (p === "json") return parseJson(text, src);
  if (p === "html") return parseHtml(text, src, Rewriter);
  const kind = p === "rss" || p === "atom" || p === "sitemap" ? (detectXml(text) || p) : detectXml(text);
  if (kind === "atom") return parseAtom(text, src);
  if (kind === "sitemap") return parseSitemap(text, src);
  if (kind === "rss") return parseRss(text, src);
  throw new Error("not a feed (got " + (String(text).trim().slice(0, 15).replace(/\s+/g, " ") || "empty body") + ")");
}
