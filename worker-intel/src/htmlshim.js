/* Minimal HTMLRewriter-compatible shim (read-only use: element + text handlers, getAttribute, onEndTag) so that the HTML
   list parser runs unchanged under node --test. The Worker uses the real HTMLRewriter. Supported selectors: tag, .class,
   #id, [attr], [attr=v], [attr*=v], [attr^=v], [attr$=v], :nth-child(n), :first-child, combined, with descendant (space)
   and child (>) combinators. Text handlers receive text of the matched element and its descendants (as HTMLRewriter). */
import { decodeEntities } from "./util.js";

const VOID = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
const AUTOCLOSE = new Set("li td th tr p option dt dd".split(" "));
const RAW = new Set(["script", "style", "textarea", "title"]);

function parseCompound(s) {
  const c = { tag: null, id: null, classes: [], attrs: [], nth: null };
  const re = /([a-zA-Z][a-zA-Z0-9-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([*^$]?=)\s*["']?([^"'\]]*)["']?)?\s*\]|:nth-child\(\s*(\d+)\s*\)|:(first-child)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) c.tag = m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push([m[4].toLowerCase(), m[5] || null, m[6] ?? null]);
    else if (m[7]) c.nth = +m[7];
    else if (m[8]) c.nth = 1;
  }
  return c;
}
export function parseSelector(sel) {
  const parts = [], toks = String(sel).trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
  let comb = " ";
  for (const t of toks) { if (t === ">") { comb = ">"; continue; } parts.push({ comb, c: parseCompound(t) }); comb = " "; }
  return parts;
}
function matchCompound(c, el) {
  if (c.tag && c.tag !== el.tag) return false;
  if (c.id && el.attrs.id !== c.id) return false;
  if (c.classes.length) { const cl = (el.attrs.class || "").split(/\s+/); if (!c.classes.every(x => cl.includes(x))) return false; }
  for (const [n, op, v] of c.attrs) {
    const a = el.attrs[n];
    if (a === undefined) return false;
    if (op === "=" && a !== v) return false;
    if (op === "*=" && !a.includes(v)) return false;
    if (op === "^=" && !a.startsWith(v)) return false;
    if (op === "$=" && !a.endsWith(v)) return false;
  }
  if (c.nth && el.index !== c.nth) return false;
  return true;
}
/* stack = open elements, last = current element */
export function matches(parts, stack) {
  const rec = (pi, si) => {
    if (pi < 0) return true;
    const p = parts[pi];
    if (pi === parts.length - 1) { return matchCompound(p.c, stack[si]) && (pi === 0 || nextUp(pi, si)); }
    return false;
  };
  const nextUp = (pi, si) => {
    const comb = parts[pi].comb, prev = parts[pi - 1];
    if (comb === ">") { const j = si - 1; return j >= 0 && matchCompound(prev.c, stack[j]) && (pi - 1 === 0 || nextUp(pi - 1, j)); }
    for (let j = si - 1; j >= 0; j--) if (matchCompound(prev.c, stack[j]) && (pi - 1 === 0 || nextUp(pi - 1, j))) return true;
    return false;
  };
  return rec(parts.length - 1, stack.length - 1);
}
function parseAttrs(s) {
  const a = {}, re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(s))) a[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return a;
}

export class ShimRewriter {
  constructor() { this.h = []; }
  on(selector, handlers) { this.h.push({ parts: parseSelector(selector), handlers }); return this; }
  transform(response) {
    const self = this;
    return { async text() { const html = typeof response === "string" ? response : await response.text(); self.run(html); return html; } };
  }
  run(html) {
    const stack = [], childCount = [0];
    const textRegs = () => this.h.filter(r => r.handlers.text && stack.some((_, i) => matches(r.parts, stack.slice(0, i + 1))));
    const emitText = t => { if (!t) return; for (const r of textRegs()) r.handlers.text({ text: t, lastInTextNode: true }); };
    const pop = () => { const el = stack.pop(); childCount.pop(); for (const f of el.end) try { f({ name: el.tag }); } catch (e) {} };
    let i = 0;
    const n = html.length;
    while (i < n) {
      const lt = html.indexOf("<", i);
      if (lt < 0) { emitText(html.slice(i)); break; }
      if (lt > i) emitText(html.slice(i, lt));
      if (html.startsWith("<!--", lt)) { const e = html.indexOf("-->", lt + 4); i = e < 0 ? n : e + 3; continue; }
      if (html[lt + 1] === "!" || html[lt + 1] === "?") { const e = html.indexOf(">", lt); i = e < 0 ? n : e + 1; continue; }
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(html.slice(lt, lt + 4000));
      if (!m) { emitText("<"); i = lt + 1; continue; }
      i = lt + m[0].length;
      const tag = m[2].toLowerCase();
      if (m[1]) { // end tag
        const k = stack.map(e => e.tag).lastIndexOf(tag);
        if (k >= 0) while (stack.length > k) pop();
        continue;
      }
      if (AUTOCLOSE.has(tag) && stack.length && stack[stack.length - 1].tag === tag) pop();
      if ((tag === "tr" || tag === "td" || tag === "th") && stack.length) {
        // close an open td/th when a new row starts
        if (tag === "tr") while (stack.length && (stack[stack.length - 1].tag === "td" || stack[stack.length - 1].tag === "th")) pop();
        if (tag === "tr" && stack.length && stack[stack.length - 1].tag === "tr") pop();
        if ((tag === "td" || tag === "th") && stack.length && (stack[stack.length - 1].tag === "td" || stack[stack.length - 1].tag === "th")) pop();
      }
      childCount[childCount.length - 1]++;
      const el = { tag, attrs: parseAttrs(m[3]), index: childCount[childCount.length - 1], end: [] };
      stack.push(el); childCount.push(0);
      const api = { tagName: tag, getAttribute: k => (Object.prototype.hasOwnProperty.call(el.attrs, k.toLowerCase()) ? el.attrs[k.toLowerCase()] : null), hasAttribute: k => Object.prototype.hasOwnProperty.call(el.attrs, k.toLowerCase()), onEndTag: f => el.end.push(f) };
      for (const r of this.h) if (r.handlers.element && matches(r.parts, stack)) r.handlers.element(api);
      const selfClosing = /\/\s*$/.test(m[3]);
      if (VOID.has(tag) || selfClosing) { pop(); continue; }
      if (RAW.has(tag)) {
        const close = html.toLowerCase().indexOf("</" + tag, i);
        const body = html.slice(i, close < 0 ? n : close);
        if (tag === "title" || tag === "textarea") emitText(body);
        i = close < 0 ? n : html.indexOf(">", close) + 1;
        pop();
      }
    }
    while (stack.length) pop();
  }
}
