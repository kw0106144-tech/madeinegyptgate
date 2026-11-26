# «بحث وكتابة عميقة» — /research/#<id>: the document Bassem made in a member's call (worker/src/research.js; design part A §A.12.3).
# Private: noindex (seo/config.json noindex_static), never in a sitemap, never stored by the app's service worker (PWA_DEF never), no
# analytics (data/seo.js PRIV). The logic is data/research-view.js (ES5, T(ar, en) in code; every server string through textContent): the
# member's own sign-in opens it; the document shows no source, no link out and no provenance label; the status of a tender is computed
# when the page is read. No legal footnote (owner decision D9: none by default). The page texts wait for the owner's word-for-word OK
# (docs/app/OWNER-APPROVAL-AR.md §9).
PAGES['research'] = ('مستند – صنع في مصر', '', globals().get('COMMON_CSS', '') + '''
.rsh { background: linear-gradient(120deg, #4a0510 0%, #8E0B20 60%, #A50E26 100%); color: #fff; }
.rsh .wrap { padding-block: 22px 20px; display: flex; flex-direction: column; gap: 4px; }
.rsh .crumb { font-size: .8rem; opacity: .85; } .rsh .crumb a { color: #fff; }
.rsh h1 { font-size: clamp(1.2rem, 3vw, 1.7rem); font-weight: 900; color: #fff; margin: 0; }
.rsw { padding-block: 20px 70px; max-width: 860px; display: flex; flex-direction: column; gap: 14px; }
.rsa { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; overflow-wrap: anywhere; }
.rsa h1 { font-size: 1.35rem; font-weight: 900; margin: 0; }
.rsa h2 { font-size: 1.05rem; font-weight: 900; margin: 6px 0 4px; }
.rsa p, .rsa li { margin: 0; line-height: 1.9; }
.rss { font-weight: 700; }
.rssec { display: flex; flex-direction: column; gap: 8px; }
.rsi { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.rsi b { font-weight: 800; } .rsi small { color: var(--muted); }
.rsbd { display: inline-block; font-size: .74rem; font-weight: 700; background: #E3F7EA; color: #0B6B35; border-radius: 6px; padding: 0 6px; margin-inline-start: 6px; }
.rsst { align-self: flex-start; font-size: .78rem; font-weight: 700; border-radius: 999px; padding: 1px 10px; }
.rsst.ok { background: #E3F7EA; color: #0B6B35; } .rsst.warn { background: #FFF4D6; color: #7A5A00; } .rsst.err { background: #FDECEC; color: #8E0B20; } .rsst.info { background: #E8F1FB; color: #0B3B66; }
.rspost { background: var(--sunken, #f4f5f7); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; white-space: pre-wrap; }
.rsrow { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; border-bottom: 1px solid var(--line); padding: 6px 0; }
.rsact { display: flex; flex-wrap: wrap; gap: 8px; }
.rsb { font: inherit; font-weight: 800; border: 0; border-radius: 12px; padding: 10px 16px; min-height: 44px; cursor: pointer; background: #8E0B20; color: #fff; text-decoration: none; display: inline-flex; align-items: center; }
.rsb.l { background: var(--sunken, #f4f5f7); color: var(--fg); border: 1px solid var(--line); }
.rsl { font-weight: 700; }
.rsn { border-radius: 14px; padding: 14px 16px; font-weight: 700; line-height: 1.8; }
.rsn.err { background: #FDECEC; color: #8E0B20; } .rsn.info { background: #E8F1FB; color: #0B3B66; }
.rsk { color: var(--muted); font-size: .84rem; margin: 0; }
@media (max-width: 520px) { .rsb { width: 100%; justify-content: center; } }
@media print { header, footer, nav, .rsh, .rsact, .rsk, .jnl-btn, [class*="janna"] { display: none !important; } .rsa { border: 0; padding: 0; } body { background: #fff !important; } }
''', '''
<section class="rsh"><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › مستند</nav><h1>مستند من باسم</h1></div></section>
<main class="wrap rsw" id="top"><div id="rsDoc" aria-live="polite"><div class="rsn info">بنجهّز المستند…</div></div></main>
<script src="data/mig-api.js"></script>
<script src="data/research-view.js"></script>
''', '')
en_add([('مستند – صنع في مصر', 'Document – Made in Egypt Gate'), ('مستند', 'Document'), ('مستند من باسم', 'A document from Bassem'),
        ('بنجهّز المستند…', 'Preparing the document…')])
SEO['research'] = ('مستند خاص بعضو منصة صنع في مصر.', 'مستند, صنع في مصر', 'WebPage', [], 'yearly', '0.1')
