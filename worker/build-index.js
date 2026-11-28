// Builds worker/src/data.json — a compact search index of the platform's public directory data for Janna's lookup API.
// Run: node worker/build-index.js   (after updating data/*.js). No phone numbers or personal data are included.
const fs = require('fs'), vm = require('vm'), path = require('path');
/* the Worker's own ES modules (src/lookup-terms.js → src/text.js) build the search words, so the index and the queries always meet. Loading
   them from this CommonJS script can print a module-loader notice on some Node 22 versions (require of an ES module, a package.json
   without "type"); CI treats any stderr line as a failed data load, so ONLY those two notices are dropped — every other warning prints */
const WARN = process.listeners('warning'); process.removeAllListeners('warning');
process.on('warning', w => { if (w && (w.code === 'MODULE_TYPELESS_PACKAGE_JSON' || (w.name === 'ExperimentalWarning' && /ES Module|require\(\)/.test(String(w.message))))) return; WARN.forEach(f => f.call(process, w)); });
const LK = require('./src/lookup-terms.js'), TX = require('./src/text.js');
const D = path.join(__dirname, '..', 'data') + '/';
const ctx = { window: {}, document: { createElement() { return {}; }, head: { appendChild() {} } }, console }; ctx.window = ctx; vm.createContext(ctx);
// the published Control Center edits first (ACC-CONTRACT §4.6, P-T2): hidden rows are skipped by forEach, adds are indexed
try { vm.runInContext(fs.readFileSync(D + 'mig-overlay.js', 'utf8'), ctx); const ov = process.env.MIG_OVERLAY_FILE || path.join(__dirname, '..', 'build', 'overlay.js'); if (fs.existsSync(ov)) vm.runInContext(fs.readFileSync(ov, 'utf8'), ctx); } catch (e) { console.error('overlay', e.message); }
for (const f of ['regions', 'factories', 'facx', 'oldfac', 'oldfacd', 'oldprod', 'oldtend', 'oldrfq', 'offers', 'zones', 'real', 'videos']) try { vm.runInContext(fs.readFileSync(D + f + '.js', 'utf8'), ctx); } catch (e) { console.error(f, e.message); }
const c = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const img = x => /\.(jpe?g|png|webp|gif)$/i.test(String(x).trim());
const R = ctx.MIGREG || {}; const GN = k => { try { return (R.name && R.name(k)) || k || ''; } catch (e) { return k || ''; } };
const out = { v: new Date().toISOString().slice(0, 10), lk: LK.lookupVersion(), f: [], p: [], t: [], q: [], o: [], z: [], i: [] };
/* f rows: [name, type, activity, location, products, "company.html#<ref>", words, sub-activity]
   words (f[6]) = what the company makes, as the lookup searches it (src/lookup-terms.js storedForms() + the group phrases it holds,
   each once): «<name + product words>|<description words>», every word as its number in fv (fixed-width base 36, fw characters: the
   bundle stores Arabic as \u escapes, 6 bytes a letter, so each word is written once). The description is data/oldfacd.js (the
   imported listings) or the researched text of data/facx.js, so «أكسجين», «درافيل» or «أسطوانات بوتاجاز» are found where the company
   wrote them. Contacts never enter: e-mails, links and phone-like digit runs are cut before the words are taken, and a word with a digit
   is never kept (a short code like «co2» apart). Description boilerplate («تعمل», «مجال»: lookup-terms.js FILLER) is left out. The
   activity labels (f[2], the old site's sub-activity: f[7] = its index in fs, -1 = none) stay apart: the lookup uses them only to order
   companies that match equally. */
const CUT = s => c(s).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ').replace(/(https?:\/\/|www\.)\S+/gi, ' ').replace(/\S+\.(com|net|org|eg|info|biz)(\/\S*)?(?=\s|$)/gi, ' ')
  .replace(/(\+?[\d٠-٩][\d٠-٩\s\-]{7,}[\d٠-٩])/g, ' ');
const stop = w => TX.STOP.has(w);
const keyWords = (...texts) => { const o = []; for (const t of texts) { const s = CUT(t); for (const w of LK.words(s)) { if (w.length < 2 || (/[\d٠-٩]/.test(w) && !/^[a-z]{1,4}\d{1,3}$/.test(w)) || stop(w)) continue; for (const k of LK.storedForms(w)) if (k && k.length >= 2 && !stop(k) && !o.includes(k)) o.push(k); }
  for (const k of LK.phraseTokens(s)) if (!o.includes(k)) o.push(k); } return o; }; // + the group phrases found in it («اسطوان_غاز»), one text at a time
const FD = ctx.MIGOLDFACD || [];
const rows = [];
(ctx.MIGOLDFAC || []).forEach((f, i) => { const prods = (f[9] || []).filter(x => !img(x) && c(x) !== c(f[0])).slice(0, 10).map(c); rows.push({ r: [c(f[0]), c(f[3]), c(f[1]), c(f[2]) || GN(f[10]), prods.join('، '), 'company.html#' + (f[16] || i)], n: keyWords(c(f[0]), ...(f[9] || []).filter(x => !img(x)).map(c)), d: keyWords(FD[i]), sub: c(f[12]) }); });
((ctx.MIGFACX && ctx.MIGFACX.list) || []).forEach((f, i) => rows.push({ r: [c(f[0]), c(f[3]), c(f[1]), c(f[2]), c(f[4]).replace(/(\+?\d[\d\s-]{7,}\d)/g, '').slice(0, 160), 'company.html#x' + i], n: keyWords(f[0]), d: keyWords(f[4]), sub: '' }));
/* oe = the OFFICIAL company e-mails of researched directory rows (data/facx.js element 10, owner decision 2026-11-28): ref → [e-mails, web site,
   source page]. Admin-side only (the Worker bundle, never a public file); teasers.js officialAddresses() passes each through officialEmail(). */
out.oe = {};
((ctx.MIGFACX && ctx.MIGFACX.list) || []).forEach((f, i) => { const o = f[10]; if (o && Array.isArray(o.official_email) && o.official_email.length)
  out.oe['x' + i] = [o.official_email.slice(0, 3).map(c), c(o.web || f[9] || ''), c((o.sources || [])[0] || f[8] || '')]; });
out.fs = [...new Set(rows.map(x => x.sub).filter(Boolean))];
const SUB = new Map(out.fs.map((s, i) => [s, i]));
const VOC = new Map(), bags = rows.map(x => { const n = new Set(x.n); return [x.n, x.d.filter(k => !n.has(k) && LK.indexable(k))]; });
bags.forEach(b => b.forEach(l => l.forEach(k => { if (!VOC.has(k)) VOC.set(k, VOC.size); })));
out.fv = [...VOC.keys()]; out.fw = Math.max(1, Math.ceil(Math.log(Math.max(2, VOC.size)) / Math.log(36)));
const ids = l => l.map(k => VOC.get(k).toString(36).padStart(out.fw, '0')).join('');
rows.forEach((x, i) => out.f.push([...x.r, ids(bags[i][0]) + '|' + ids(bags[i][1]), x.sub ? SUB.get(x.sub) : -1]));
(ctx.MIGOLDP || []).forEach(p => out.p.push([c(p[0]), c(p[1]), c(p[2])]));
// tender status = the honest 4-value rule from the deadline, as of the build day (Cairo); the Worker recomputes it per request
// (src/index.js tenderStatus): passed → منتهية, ≤ 7 days → تنتهي قريباً, later → سارية, no deadline → غير محدد الموعد
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const IN7 = new Date(Date.parse(TODAY + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
const tst = dl => { const d = (/^(\d{4}-\d{2}-\d{2})/.exec(c(dl)) || [])[1]; return !d ? 'غير محدد الموعد' : d < TODAY ? 'منتهية' : d <= IN7 ? 'تنتهي قريباً' : 'سارية'; };
(ctx.MIGTEND || []).forEach(t => out.t.push([c(t[0]), c(t[1]), tst(t[9]), c(t[3]), c(t[4]), c(t[5]) || GN(t[10]), c(t[6]), c(t[9])]));
(ctx.MIGRFQ || []).filter(q => c(q[3]) || c(q[5])).forEach(q => out.q.push([c(q[0]), c(q[1]), c(q[2]), c(q[3]).replace(/(\+?\d[\d\s-]{7,}\d)/g, '').slice(0, 200), c(q[5])]));
(ctx.MIGOFFERS || []).forEach(o => out.o.push([c(o.product_ar), c(o.brand), c(o.store_ar), o.price_egp, o.old_price_egp, c(o.category_ar), c(o.valid_to), 'offer.html#' + o.id]));
(ctx.MIGZONES || []).forEach(z => out.z.push([c(z.name_ar), c(z.name_en), z.type, GN(z.region_code), c(z.city), [].concat(z.focus_sectors_ar || []).join('، '), 'city.html#' + z.id]));
// i = dated, verified items for follow digests / deadline reminders / Bassem's morning count (src/digest.js):
// [kind, id, date, sector, governorate, title, site url, deadline, market, entity, source url, aliases]
// aliases = the ids the PAGES use for the same item, so a ☆ follow made on a page resolves to it (deadline reminders) and the
// alert links open the item itself: opportunity.html#<et003|in4> (data/regions.js MIGOID / pages.part.py realIntl), and the interactive
// lists at their clean URLs /tenders/search/#<ref> and /rfq/search/#<ref> (the /tenders/ and /rfq/ hubs do not open items).
// The old page ids "OT-<ref>" / "OR-<ref>" stay as aliases so follows made with them still resolve.
// Only sourced data. data/projects.js ("SAMPLE DATA") and data/deals.js (illustrative) are deliberately NOT included.
const crypto = require('crypto'); const hid = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const day = s => { const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; };
const I = (k, id, d, sec, gov, title, url, dl, mk, ent, src, al) => { if (!id || !c(title)) return; out.i.push([k, String(id).slice(0, 120), day(d), c(sec), c(gov), c(title).slice(0, 220), url || '', day(dl), mk || 'local', c(ent).slice(0, 120), src || '', (al || []).filter(Boolean).map(x => String(x).slice(0, 120))]); };
const RL = ctx.REAL || {};
const OID = (t, i) => (typeof ctx.MIGOID === 'function' ? ctx.MIGOID(t, i) : (/(\d+)$/.exec(String(t.id || '')) ? 'ET' + /(\d+)$/.exec(String(t.id || ''))[1] : 'MD' + (i + 1)));
(RL.tenders || []).forEach((t, i) => { const a = OID(t, i); I('tender', t.id || t.ref, t.publish_date, t.sector_ar, GN(t.region_code), t.title_ar, 'opportunity.html#' + a.toLowerCase(), t.closing_date, 'local', t.entity_ar, t.source_url, [a]); });
(RL.tenders_intl || []).forEach((t, i) => I('tender', t.ref || hid(t.title_ar), t.publish_date, t.sector_ar, c(t.country_ar), t.title_ar, 'opportunity.html#in' + (i + 1), t.closing_date, ['gulf', 'africa', 'asia', 'europe'].includes(t.market) ? t.market : 'local', t.entity_ar, t.source_url, ['IN' + (i + 1)]));
const seenT = new Set(out.i.map(x => x[1]));
(ctx.MIGTEND || []).forEach(t => { if (seenT.has(c(t[0]))) return; seenT.add(c(t[0])); I('tender', c(t[0]), '', t[6], c(t[5]) || GN(t[10]), t[3], 'tenders/search/#' + encodeURIComponent(c(t[0])), t[9], 'local', t[4], t[11], ['OT-' + c(t[0])]); });
(ctx.MIGRFQ || []).forEach(q => I('rfq', c(q[0]), q[1], q[9], GN(q[7]), q[2], 'rfq/search/#' + encodeURIComponent(c(q[0])), q[6], 'local', '', q[8], ['OR-' + c(q[0])]));
(RL.news || []).forEach(n => I('news', hid(n.url || n.title_ar), n.date, n.category_ar, GN(n.region_code), n.title_ar, 'news.html', '', 'local', n.source_name, n.url));
(RL.events || []).forEach(e => I('event', e.id || hid(e.name_ar), e.start_date, e.sector_ar, GN(e.region_code) || c(e.city), e.name_ar, 'event.html#' + encodeURIComponent(e.id || ''), e.start_date, 'local', e.organizer || e.venue, e.source_url || e.url));
(RL.awards || []).forEach(a => I('award', hid(a.title_ar + a.date), a.date, '', GN(a.region_code) || c(a.city), a.title_ar + (a.winner_ar ? ' — ' + a.winner_ar : ''), 'winners.html', '', 'local', a.awarding_entity_ar, a.source_url));
(ctx.MIGOFFERS || []).forEach(o => I('offer', o.id, o.valid_from || o.checked_at || '', o.category_ar, (o.cities_ar || []).join('، '), o.product_ar + (o.store_ar ? ' — ' + o.store_ar : ''), 'offer.html#' + o.id, o.valid_to, 'local', o.store_ar, o.source_url || o.url));
// visible counts for the Control Center statistics (acc §3.1.2 contentCounts; hidden rows of hole collections are skipped)
const vis = a => (a || []).filter(Boolean).length;
out.n = { news: vis(RL.news), events: vis(RL.events), awards: vis(RL.awards), videos: vis(ctx.MIGVIDS), products: vis(ctx.MIGOLDP) };
fs.writeFileSync(path.join(__dirname, 'src', 'data.json'), JSON.stringify(out));
console.log('index', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])), fs.statSync(path.join(__dirname, 'src', 'data.json')).size, 'bytes');
// the full public records + clean page URLs for /api/janna/item and the lookup's open_url (worker/build-items.js → src/items.json)
try { require('./build-items.js'); } catch (e) { console.error('items', e.message); }
