// Builds worker/src/items.json — the FULL public record of every directory item, for /api/janna/item and the richer
// /api/janna/lookup results (src/janna-item.js). Companion of build-index.js (data.json stays the compact search index).
// Run: node worker/build-items.js   (after data/*.js change and after the site build, so site/_seo/hash/*.json gives clean URLs;
// without the site build it falls back to the hash shims company.html#N / opportunity.html#et003 …, which the site resolves itself).
// Env overrides (shadow trees): MIG_DATA_DIR, MIG_SITE_DIR, MIG_OVERLAY_FILE.
// Only public, sourced fields. NEVER: phones, e-mails, personal names of requesters, data/deals.js, the projects' research-only
// progress % / packages (owner decision, data/projects.js header), REAL.tenders[].estimated_value_sar (a copy of the bid bond left
// from the Saudi template — 56/56 rows equal bid_bond_egp — so it is NOT an estimated value and is dropped).
const fs = require('fs'), vm = require('vm'), path = require('path');
const D = (process.env.MIG_DATA_DIR || path.join(__dirname, '..', 'data')).replace(/\/?$/, '/');
const SITE_DIR = (process.env.MIG_SITE_DIR || path.join(__dirname, '..', 'site')).replace(/\/?$/, '/');
const ctx = { window: {}, document: { createElement() { return {}; }, head: { appendChild() {} } }, console }; ctx.window = ctx; vm.createContext(ctx);
try { vm.runInContext(fs.readFileSync(D + 'mig-overlay.js', 'utf8'), ctx); const ov = process.env.MIG_OVERLAY_FILE || path.join(__dirname, '..', 'build', 'overlay.js'); if (fs.existsSync(ov)) vm.runInContext(fs.readFileSync(ov, 'utf8'), ctx); } catch (e) { console.error('overlay', e.message); }
for (const f of ['regions', 'factories', 'facx', 'oldfac', 'oldfacd', 'oldprod', 'oldtend', 'oldrfq', 'offers', 'zones', 'real', 'projects']) try { vm.runInContext(fs.readFileSync(D + f + '.js', 'utf8'), ctx); } catch (e) { console.error(f, e.message); }
const c = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
/* contacts never leave the platform: phone-like digit runs, e-mails and bare URLs are cut from free text */
const cut = (t, max) => (max && t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t);
const clean = (s, max) => cut(c(s).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '').replace(/(https?:\/\/|www\.)\S+/gi, '').replace(/(\+?\d[\d\s-]{7,}\d)/g, '').replace(/\s+/g, ' ').trim(), max);
/* governorate name from its code; no code → '' (never the placeholder «غير محددة», which is not data) */
const R = ctx.MIGREG || {}; const GN = k => { if (!k) return ''; try { return (R.name && R.name(k)) || k; } catch (e) { return k; } };
const num = v => (typeof v === 'number' && isFinite(v) ? v : (v != null && /^\d+(\.\d+)?$/.test(String(v).trim()) ? +v : null));
const nfc = s => String(s || '').normalize('NFC');
/* site/_seo/hash/<type>.json: hash id → clean URL of the record (written by the site build); {} when the site is not built */
const HASH = t => { try { return JSON.parse(fs.readFileSync(SITE_DIR + '_seo/hash/' + t + '.json', 'utf8')); } catch (e) { return {}; } };
const HC = HASH('company'), HO = HASH('opportunity'), HW = HASH('winner'), HP = HASH('project'), HF = HASH('offer'), HZ = HASH('city');
const legacySlug = u => { try { const seg = new URL(String(u || '')).pathname.split('/').filter(Boolean); return seg.length ? nfc(decodeURIComponent(seg[seg.length - 1])) : ''; } catch (e) { return ''; } };
/* static paths are stored DECODED (UTF-8 is a third of the %-encoded size); src/janna-item.js encodes them into open_url */
const enc = p => { p = String(p || ''); if (p.charAt(0) !== '/') return p; try { return nfc(decodeURI(p)); } catch (e) { return p; } };
const OID = (t, i) => (typeof ctx.MIGOID === 'function' ? ctx.MIGOID(t, i) : (/(\d+)$/.exec(String(t.id || '')) ? 'ET' + /(\d+)$/.exec(String(t.id || ''))[1] : 'MD' + (i + 1)));
const out = { v: new Date().toISOString().slice(0, 10), t: [], q: [], f: {}, p: [], o: [], z: [], a: [], j: [] };
const RL = ctx.REAL || {};

/* ---- tenders: every MIGTEND row (same key as data.json t: ref + title) merged with its REAL.tenders record, then the international ones */
const realBy = new Map(); (RL.tenders || []).forEach((r, j) => { if (r && !realBy.has(c(r.title_ar))) realBy.set(c(r.title_ar), [j, r]); });
const seenId = new Set(), uid = b => { let id = b || 'tender', k = 2; while (seenId.has(id)) id = b + '~' + k++; seenId.add(id); return id; };
(ctx.MIGTEND || []).forEach((t, i) => {
  if (!t) return;
  const rj = realBy.get(c(t[3])), r = rj ? rj[1] : null, src = c(t[11]);
  let p = '';
  if (r) { const oid = OID(r, rj[0]).toLowerCase(); p = HO[oid] || 'opportunity.html#' + oid; }
  else if (/madeinegyptgate\.com\/tender-item\//.test(src.replace('www.', ''))) { const ls = legacySlug(src); if (ls) p = '/tender-item/' + ls + '/'; }
  const ref = r ? c(r.ref) || c(t[0]).replace(/^OFF:/, '') : c(t[0]);
  out.t.push({ key: c(t[0]) + '|' + c(t[3]), id: uid(r ? c(r.id) : c(t[0])), ref, ptype: c(r && r.procurement_type) || c(t[1]), title: c(t[3]), title_en: c(r && r.title_en),
    entity: c(t[4]) === 'جهة حكومية' && !r ? '' : c(r && r.entity_ar) || c(t[4]), entity_en: c(r && r.entity_en), gov: c(t[5]) || GN(t[10]), city: c(r && r.city), sector: c(t[6]),
    kind: r ? (r.kind === 'public-company' ? 'شركة عامة' : 'جهة حكومية') : '', publish: c(r && r.publish_date), deadline: c(t[9]) || c(r && r.closing_date),
    bond_egp: r ? num(r.bid_bond_egp) : num(t[8]), bond_note: c(r && r.bid_bond_note), booklet_egp: r ? num(r.booklet_price_egp) : num(t[7]),
    docs: r ? c(r.source_url) : (/madeinegyptgate\.com/.test(src) ? '' : src), via: r ? c(r.via).split(' (')[0] : '', market: 'local', country: 'مصر',
    flags: +t[12] || 0, path: p ? enc(p) : '', list: r ? '' : 'tenders/search/#' + encodeURIComponent(c(t[0])) }); /* REAL rows' list refs «OFF:…» are not unique (OFF:1, OFF:) */
});
(RL.tenders_intl || []).forEach((r, j) => {
  if (!r || !c(r.title_ar)) return;
  const h = 'in' + (j + 1), p = HO[h] || 'opportunity.html#' + h;
  out.t.push({ key: 'intl|' + c(r.ref), id: uid('intl-' + (c(r.ref) || h)), ref: c(r.ref), ptype: r.kind === 'pvt' ? 'جهة خاصة' : 'جهة حكومية', title: c(r.title_ar), title_en: c(r.title_en),
    entity: c(r.entity_ar), entity_en: c(r.entity_en), gov: '', city: c(r.city), sector: c(r.sector_ar), kind: '', publish: c(r.publish_date), deadline: c(r.closing_date),
    est_value: num(r.estimated_value), currency: c(r.currency), docs: c(r.source_url), via: c(r.source_name), market: ['gulf', 'africa', 'asia', 'europe'].includes(r.market) ? r.market : 'intl',
    country: c(r.country_ar), country_en: c(r.country_en), flags: 0, path: enc(p), list: '' });
});
/* ---- RFQs: full details (contacts removed), quantity / delivery / deadline when given */
(ctx.MIGRFQ || []).filter(q => q && (c(q[3]) || c(q[5]))).forEach(q => {
  const ls = legacySlug(q[8]), stat = ls && fs.existsSync(SITE_DIR + 'rfq/' + ls + '/index.html') ? '/rfq/' + ls + '/' : '';
  out.q.push({ id: c(q[0]), date: c(q[1]), title: c(q[2]), details: clean(q[3], 900), details_en: clean(q[10], 900), delivery: clean(q[4]), qty: clean(q[5]), deadline: c(q[6]),
    gov: GN(q[7]), sector: c(q[9]), flags: +q[11] || 0, path: enc(stat || 'rfq/search/#' + encodeURIComponent(c(q[0]))), list: 'rfq/search/#' + encodeURIComponent(c(q[0])) });
});
/* ---- factories: keyed by data.json f[5]'s hash (company.html#<key>) — description snippet, verified mark, governorate, clean URL
   verified = «✓ موثّق من فريق المنصة», the site's own test (pages.part.py VFX, seo_build.part.py): one of the 91 companies of
   data/factories.js (MIGFAC) by its name or by the spelling data/facx.js keeps for it (SAME), and the directory listing of the same
   company (seo_build name_key) — the old f[4] / f[5] flags of oldfac.js / facx.js are 0 for every row (lookup-index 2026-11-20) */
const FD = ctx.MIGOLDFACD || [], FX = (ctx.MIGFACX && ctx.MIGFACX.list) || [];
const SAME = (ctx.MIGFACX && ctx.MIGFACX.same) || (() => { try { const m = /var SAME = (\{[^;]*\});/.exec(fs.readFileSync(D + 'facx.js', 'utf8')); return m ? JSON.parse(m[1]) : {}; } catch (e) { return {}; } })();
const TEAM = new Set((ctx.MIGFAC || []).map(f => c(f && f.name_ar)).filter(Boolean)); for (const [k, v] of Object.entries(SAME)) if (TEAM.has(c(k))) TEAM.add(c(v));
const nameKey = s => String(s || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0)).toLowerCase()
  .replace(/[ً-ْٰ]/g, '').replace(/ـ/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[^ء-يa-z0-9]+/g, ' ').replace(/(^|\s)(co|ltd|llc|sae|inc|company)(?=\s|$)/g, ' ').replace(/(^|\s)(ش م م|ش م|ش ذ م م|ذ م م)(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(/^(الشركه|شركه|مصنع|مصانع|مؤسسه)\s+/, '').replace(/ /g, '');
const MEMBER = new Map(); (ctx.MIGOLDFAC || []).forEach((f, i) => { if (f && !MEMBER.has(nameKey(f[0]))) MEMBER.set(nameKey(f[0]), i); });
const teamMember = new Set(); FX.forEach(x => { if (x && TEAM.has(c(x[0])) && MEMBER.has(nameKey(x[0]))) teamMember.add(MEMBER.get(nameKey(x[0]))); });
(ctx.MIGOLDFAC || []).forEach((f, i) => { if (!f) return; const k = String(f[16] || i); out.f[k] = [clean(FD[i], 140), f[4] || teamMember.has(i) ? 1 : 0, GN(f[10]), enc(HC[k] || 'company.html#' + k), +f[11] || 0]; });
FX.forEach((f, i) => { if (!f) return; const k = 'x' + i; out.f[k] = [clean(f[4], 140), f[5] || TEAM.has(c(f[0])) ? 1 : 0, '', enc(HC[k] || 'company.html#' + k), 0]; });
/* ---- products (data.json p order): the full product page /industrial_products/<legacy slug>/ */
(ctx.MIGOLDP || []).forEach(p => { if (!p) return; const ls = legacySlug(p[5]); out.p.push({ key: c(p[0]) + '|' + c(p[1]), name: c(p[0]), maker: c(p[1]).replace(/^من إنتاج\s*/, ''), cat: c(p[2]), name_en: c(p[6]), flags: +p[7] || 0, path: ls ? enc('/industrial_products/' + ls + '/') : 'market.html' }); });
/* ---- retail offers */
(ctx.MIGOFFERS || []).forEach(o => { if (!o) return; out.o.push({ id: c(o.id), product: c(o.product_ar), product_en: c(o.product_en), brand: c(o.brand), store: c(o.store_ar), price_egp: num(o.price_egp), old_price_egp: num(o.old_price_egp),
  discount_pct: num(o.discount_pct), size: c(o.size_unit), cat: c(o.category_ar), cities: [].concat(o.cities_ar || []).map(c).join('، '), valid_from: c(o.valid_from), valid_to: c(o.valid_to), docs: c(o.source_url || o.url), path: enc(HF[o.id] || 'offer.html#' + o.id) }); });
/* ---- industrial cities / zones */
(ctx.MIGZONES || []).forEach(z => { if (!z) return; out.z.push({ id: c(z.id), name: c(z.name_ar), name_en: c(z.name_en), type: c(z.type), gov: GN(z.region_code), city: c(z.city), area: c(z.area_text), sectors: [].concat(z.focus_sectors_ar || []).map(c).join('، '), docs: c(z.coord_source), path: enc(HZ[z.id] || 'city.html#' + z.id) }); });
/* ---- contract awards: winner, awarding entity, the published value(s) in millions with their currency */
(RL.awards || []).forEach((a, i) => { if (!a || !c(a.title_ar)) return; const vals = [['egp', 'جنيه'], ['usd', 'دولار'], ['eur', 'يورو'], ['sar', 'ريال سعودي'], ['aed', 'درهم إماراتي']].map(([k, n]) => [k.toUpperCase(), num(a['value_' + k + '_million']), n]).filter(x => x[1] != null);
  out.a.push({ id: String(i), title: c(a.title_ar), winner: c(a.winner_ar), entity: c(a.awarding_entity_ar), gov: GN(a.region_code), city: c(a.city), date: c(a.date), values_million: vals, docs: c(a.source_url), path: enc(HW[String(i)] || 'winner.html#' + i) }); });
/* ---- projects (MIG.PROJECTS_REAL, each with its source): value in EGP million only where published; NOT the progress % / packages */
const M = ctx.MIG || {}, ST = M.STAGES || [], NA = s => (/^(لم يُعلن|لم يعلن|—|-)$/.test(c(s)) ? '' : c(s));
(M.PROJECTS || M.PROJECTS_REAL || []).forEach(p => { if (!p || !c(p[1])) return; const nw = (p[14] || []).filter(Boolean).slice(-1)[0] || [];
  out.j.push({ id: c(p[0]), name: c(p[1]), gov: c(p[2]).replace(/^محافظة\s+/, ''), location: c(p[3]), sector: c(p[4]), stage: ST[p[5]] || '', value_mn_egp: num(p[6]), owner: NA(p[7]), contractor: NA(p[8]), consultant: NA(p[9]),
    start: c(p[10]), end: c(p[11]), news_date: c(nw[0]), news: clean(nw[1], 320), docs: c(p[15]), path: enc(HP[c(p[0])] || 'project.html#' + c(p[0])) }); });
/* ---- members-only opportunities (owner 2026-11-28): the locked fields of the public data files (tools/opp_split.js — the site build
   publishes the redacted copies), served only by GET /api/me/opps to a member whose plan covers them (src/opp-lock.js) */
try { out.L = require(path.join(__dirname, '..', 'tools', 'opp_split.js')).splitDir(D).locked; } catch (e) { console.error('opp_split', e.message); out.L = {}; }
const file = path.join(__dirname, 'src', 'items.json'); fs.writeFileSync(file, JSON.stringify(out));
console.log('items', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : v])), fs.statSync(file).size, 'bytes', Object.keys(HO).length ? 'clean URLs' : 'shim URLs (site not built)');
