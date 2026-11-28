/* A text report as a PDF (A4, as many pages as it needs), written here with no library — the platform's daily partner report
   (daily-mail.js, «تقرير باسم اليومي»). Arabic is shaped (contextual forms, lam-alef) and ordered right to left here, lines are wrapped by
   their measured width, Latin words / numbers / links keep their own order; the text is real text (searchable, copyable) in the embedded
   DejaVu Sans subset of pdf-font.js. The PDF writer and the Arabic shaping are the ones of madeinuaegate's invoice PDF
   (functions/_lib/invoice-pdf.js), made multi-page. reportPdf({title, blocks}) → Uint8Array; nothing in it is invented here: the caller
   gives every line. A character the font does not hold is drawn as «?». */
import { FONT as F, AR_FORMS } from "./pdf-font.js";

const PW = 595.28, PH = 841.89, M = 42, LH = 1.45;
const COLOR = { text: "0.114 0.114 0.106", head: "0.557 0.043 0.125", muted: "0.42 0.42 0.42" };

/* ---------- Arabic: contextual forms, lam-alef, right-to-left order (invoice-pdf.js) ---------- */
const AR = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
const MARK = /[ً-ٰؐ-ؚۖ-ۭ]/g; // diacritics: not drawn
const forms = cp => AR_FORMS.forms[cp];
const joinsNext = cp => cp === 0x0640 || !!(forms(cp) && forms(cp)[2]);
const joins = cp => cp === 0x0640 || !!forms(cp);
export function shapeArabic(s) {
  const cps = Array.from(String(s).replace(MARK, "")).map(c => c.codePointAt(0)), out = [];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i], prev = cps[i - 1], next = cps[i + 1];
    const fromPrev = prev != null && joinsNext(prev) && joins(c);
    if (c === 0x0644 && AR_FORMS.lamAlef[next]) { out.push(AR_FORMS.lamAlef[next][fromPrev ? 1 : 0]); i++; continue; }
    const f = forms(c);
    if (!f) { out.push(c); continue; }
    const toNext = joinsNext(c) && next != null && joins(next);
    const k = fromPrev && toNext ? 3 : fromPrev ? 1 : toNext ? 2 : 0;
    out.push(f[k] || f[0] || c);
  }
  return out;
}
const MIRROR = { 40: 41, 41: 40, 91: 93, 93: 91, 123: 125, 125: 123, 60: 62, 62: 60, 171: 187, 187: 171 };
/* logical → visual order for a right-to-left line: Arabic runs reversed, Latin words and numbers kept left to right */
export function visualRtl(cps) {
  const type = c => (c >= 0x0600 && c <= 0x06FF) || (c >= 0xFB50 && c <= 0xFEFF) ? "R" : /[\p{L}\p{N}]/u.test(String.fromCodePoint(c)) ? "L" : "N";
  const t = cps.map(type);
  for (let i = 0; i < t.length; i++) if (t[i] === "N") {
    let a = i - 1; while (a >= 0 && t[a] === "N") a--; let b = i + 1; while (b < t.length && t[b] === "N") b++;
    t[i] = a >= 0 && b < t.length && t[a] === "L" && t[b] === "L" ? "L" : "R";
  }
  const runs = [];
  for (let i = 0; i < cps.length; i++) { if (runs.length && runs[runs.length - 1].t === t[i]) runs[runs.length - 1].c.push(cps[i]); else runs.push({ t: t[i], c: [cps[i]] }); }
  return runs.reverse().flatMap(r => (r.t === "R" ? r.c.slice().reverse().map(c => MIRROR[c] || c) : r.c));
}

/* ---------- text → glyphs → lines ---------- */
const Q = F.cmap[63] || 0;
const glyphsOf = cps => cps.map(c => { const id = F.cmap[c]; return id == null ? Q : id; });
const widthOf = (g, size) => g.reduce((a, id) => a + (F.adv[id] || 0), 0) * size / F.upem;
const visual = (s, rtl) => (rtl ? visualRtl(shapeArabic(s)) : Array.from(s).map(c => c.codePointAt(0)));
/* one paragraph → wrapped lines [{g, cps, w, rtl}] at most maxW wide (a word longer than a line is cut by characters) */
export function wrap(text, size, maxW) {
  const s = String(text == null ? "" : text).replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const rtl = AR.test(s), words = s.split(" "), out = [];
  const mk = str => { const cps = visual(str, rtl), g = glyphsOf(cps); return { g, cps, w: widthOf(g, size), rtl }; };
  let cur = "";
  for (let w of words) {
    const next = cur ? cur + " " + w : w;
    if (mk(next).w <= maxW) { cur = next; continue; }
    if (cur) out.push(mk(cur));
    while (mk(w).w > maxW && Array.from(w).length > 1) { // a long link / number: cut it
      const a = Array.from(w); let k = a.length - 1;
      while (k > 1 && mk(a.slice(0, k).join("")).w > maxW) k--;
      out.push(mk(a.slice(0, k).join(""))); w = a.slice(k).join("");
    }
    cur = w;
  }
  if (cur) out.push(mk(cur));
  return out;
}

/* ---------- PDF writer ---------- */
const enc = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
const b64 = s => { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const hex4 = n => n.toString(16).padStart(4, "0");
const num = n => (Math.round(n * 1000) / 1000).toString();
const pdfStr = s => String(s || "").replace(/[^\x20-\x7e]/g, "").replace(/[()\\]/g, "").slice(0, 120);

/* blocks: [{text, size?, color?: text|head|muted, gap?: points before, align?: auto|center, rule?: true}] */
export function reportPdf({ title = "Report", blocks = [], author = "Made in Egypt Gate" } = {}) {
  const used = new Map(), pages = [[]];
  let y = PH - M;
  const maxW = PW - 2 * M;
  const page = () => pages[pages.length - 1];
  const newPage = () => { pages.push([]); y = PH - M; };
  for (const b of blocks) {
    if (b.rule) { if (y - 10 < M) newPage(); y -= (b.gap || 6); page().push({ rule: true, y }); y -= 6; continue; }
    const size = b.size || 10.5, lines = wrap(b.text, size, maxW), lh = size * LH;
    if (b.gap) y -= b.gap;
    for (const l of lines) {
      if (y - lh < M) newPage();
      y -= lh;
      for (let i = 0; i < l.g.length; i++) if (!used.has(l.g[i])) used.set(l.g[i], l.cps[i]);
      const x = b.align === "center" ? M + (maxW - l.w) / 2 : l.rtl ? PW - M - l.w : M;
      page().push({ g: l.g, x, y: y + size * 0.3, size, color: COLOR[b.color] || COLOR.text });
    }
  }
  const pageNo = pi => glyphsOf(Array.from(`${pi + 1}/${pages.length}`).map(c => c.codePointAt(0)));
  pages.forEach((x, pi) => { for (const c of Array.from(`${pi + 1}/${pages.length}`)) { const g = F.cmap[c.codePointAt(0)]; if (g != null && !used.has(g)) used.set(g, c.codePointAt(0)); } });
  const objs = [], add = parts => { objs.push(parts); return objs.length; };
  const stream = (dict, bytes) => [`<< ${dict} /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream"];
  const catalog = add(null), pagesId = add(null);
  const s = 1000 / F.upem, ttf = b64(F.ttf);
  const file = add(stream(`/Length1 ${ttf.length}`, ttf));
  const desc = add([`<< /Type /FontDescriptor /FontName /${F.name} /Flags 32 /FontBBox [${F.bbox.map(v => Math.round(v * s)).join(" ")}] /ItalicAngle 0 /Ascent ${Math.round(F.ascent * s)} /Descent ${Math.round(F.descent * s)} /CapHeight ${Math.round(F.capHeight * s)} /StemV 80 /FontFile2 ${file} 0 R >>`]);
  const ids = [...used.keys()].sort((a, b) => a - b);
  const w = ids.map(id => `${id} [${Math.round((F.adv[id] || 0) * s)}]`).join(" ");
  const cid = add([`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${F.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /DW 500 /W [${w}] >>`]);
  const u16 = cp => cp > 0xFFFF ? hex4(0xD800 + ((cp - 0x10000) >> 10)) + hex4(0xDC00 + ((cp - 0x10000) & 1023)) : hex4(cp);
  const bf = ids.map(id => `<${hex4(id)}> <${u16(used.get(id))}>`);
  let cm = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n";
  for (let j = 0; j < bf.length; j += 100) { const part = bf.slice(j, j + 100); cm += `${part.length} beginbfchar\n${part.join("\n")}\nendbfchar\n`; }
  cm += "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
  const tu = add(stream("", enc(cm)));
  const font = add([`<< /Type /Font /Subtype /Type0 /BaseFont /${F.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`]);
  const kids = [];
  pages.forEach((draws, pi) => {
    let content = "";
    for (const d of draws) content += d.rule ? `0.8 0.8 0.8 RG 0.6 w ${num(M)} ${num(d.y)} m ${num(PW - M)} ${num(d.y)} l S\n` : `BT /F0 ${num(d.size)} Tf ${d.color} rg ${num(d.x)} ${num(d.y)} Td <${d.g.map(hex4).join("")}> Tj ET\n`;
    content += `BT /F0 8 Tf ${COLOR.muted} rg ${num(PW / 2 - 8)} ${num(M / 2)} Td <${pageNo(pi).map(hex4).join("")}> Tj ET\n`;
    const cBytes = enc(content), cId = add(stream("", cBytes));
    kids.push(add([`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(PW)} ${num(PH)}] /Resources << /Font << /F0 ${font} 0 R >> >> /Contents ${cId} 0 R >>`]));
  });
  objs[pagesId - 1] = [`<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`];
  objs[catalog - 1] = [`<< /Type /Catalog /Pages ${pagesId} 0 R >>`];
  const info = add([`<< /Title (${pdfStr(title) || "Report"}) /Author (${pdfStr(author)}) /Producer (madeinegyptgate.com) >>`]);
  const chunks = [enc("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")]; let off = chunks[0].length; const xref = [];
  objs.forEach((parts, i) => {
    xref.push(off);
    for (const p of [`${i + 1} 0 obj\n`, ...parts, "\nendobj\n"]) { const b = typeof p === "string" ? enc(p) : p; chunks.push(b); off += b.length; }
  });
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + xref.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  tail += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${off}\n%%EOF\n`;
  chunks.push(enc(tail));
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
export function toBase64(bytes) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
