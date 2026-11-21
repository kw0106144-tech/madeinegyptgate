# «فرص السوق» — /market-opportunities/ (owner 2026-11-20: «أنا عايزها تدور وتطلع بيان ورد حتي لو المعلومه مش علي المنصه تجيبها او
# يجيبها من المصادر الخارجيه ويضيفها علي المنصه»; web data «تظهر علطول», no review gate). The tenders, RFQs, potential buyers, lists of
# plants, new projects and news that Janna's and Bassem's web searches found, published at once by worker/src/web-public.js
# (GET /api/janna/opportunities; owner switch web_leads_public, locked until migration 0012) — the opportunity itself in the platform's
# words, NEVER where it came from: his rule «ميكتبش مصدر اي معلومه» / «ميقولوش حاجه ولا من بره بيانات المنصه ولاغيره هما يقولوا المعلومه
# وخلاص» (no site, portal, newspaper, domain, link, quoted snippet, and no «from outside» / «from the internet» / «not verified» mark on an
# item). The name: «فرص السوق» / "Market opportunities" (the dictionary's own pair) — not «فرص من متابعة السوق», which his rule lists as a
# provenance mark. The honesty floor stays (not a mark): a closed tender reads «منتهية», never open; an unknown deadline reads «ميعادها
# مش معروف», never open; no company is called a member, and the page-level line at the bottom is the one of the tenders page (oldlists.part.py:
# for information only, the reference is the owning entity, the tenders disclaimer link). «عايز التفاصيل» opens Janna's live call on this
# page (data/janna-live.js), and the box under the list leads to the registration / sign-in pages. noindex (seo/config.json
# noindex_static): content gathered from the web and shown without a source is not offered to search engines; never in a sitemap.
# Logic: data/market-opps.js (ES5, T(ar, en) in code); this file holds the shell and the English of its markup.
HEROS['market-opportunities'] = ('m3.jpg', '<a href="rfqs.html">طلبات الأسعار</a> › فرص السوق', 'فرص السوق',
                                 'أحدث المناقصات وطلبات عروض الأسعار والعملاء المحتملين والمشاريع الجديدة لمنتجات المصانع، في مصر وفي الأسواق التانية.', '')
PAGES['market-opportunities'] = ('فرص السوق – صنع في مصر', 'rfq', COMMON_CSS + '''
.mo-w { max-width: 1100px; }
.mo-tools { display: flex; flex-direction: column; gap: 10px; }
.mo-tools form { display: flex; flex-wrap: wrap; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
.mo-tools input, .mo-tools select { font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; min-width: 0; min-height: 44px; }
.mo-tools input[type=search] { flex: 2 1 220px; } .mo-tools select { flex: 1 1 150px; }
.mo-tools button[type=submit] { min-height: 44px; }
.mo-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.mo-seg button { font: inherit; font-weight: 700; font-size: .86rem; border: 1px solid var(--line); background: var(--surface); color: var(--fg); border-radius: 999px; padding: 7px 14px; cursor: pointer; min-height: 38px; }
.mo-seg button[aria-pressed="true"] { background: var(--green); border-color: var(--green); color: #fff; }
.mo-seg .n { opacity: .75; font-weight: 600; margin-inline-start: 4px; }
.mo-cnt { margin: 0; font-weight: 700; }
.mo-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.mo-c { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.mo-c.closed { opacity: .78; }
.mo-top { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mo-b { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 10px; font-size: .78rem; font-weight: 800; background: var(--sunken, #f4f5f7); color: var(--fg); }
.mo-b.ty { background: var(--green-soft, #E7F6EC); color: var(--green, #0B6B35); }
.mo-b.of { background: #EEF3FD; color: #1E4FB0; }
.mo-b.open { background: #E7F6EC; color: #15803D; } .mo-b.closing { background: #FFF4E0; color: #A15C07; } .mo-b.closed { background: #FDECEE; color: #B42318; } .mo-b.unknown { background: var(--sunken, #f4f5f7); color: var(--muted); }
:root[data-theme="dark"] .mo-b.of { background: #102035; color: #93C5FD; } :root[data-theme="dark"] .mo-b.open { background: #0F2A1A; color: #4ADE80; }
:root[data-theme="dark"] .mo-b.closing { background: #2E2208; color: #FBBF24; } :root[data-theme="dark"] .mo-b.closed { background: #2E1012; color: #F87171; }
.mo-c h3 { font-size: 1.02rem; font-weight: 800; margin: 0; line-height: 1.6; overflow-wrap: anywhere; }
.mo-m { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: .88rem; }
.mo-m dt { color: var(--muted); font-weight: 600; } .mo-m dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.mo-a { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px; }
.mo-a .btn { min-height: 40px; }
.mo-msg { border-radius: 14px; padding: 14px 16px; font-weight: 700; line-height: 1.8; background: var(--sunken, #f4f5f7); }
.mo-msg.err { background: #FDECEE; color: #B42318; } :root[data-theme="dark"] .mo-msg.err { background: #2E1012; color: #F87171; }
.mo-more { display: flex; justify-content: center; }
.mo-cta { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
.mo-cta p { margin: 0; font-weight: 700; flex: 1 1 260px; }
.mo-cta .acts { display: flex; flex-wrap: wrap; gap: 8px; }
.mo-note { font-size: .84rem; margin: 0; }
@media (max-width: 560px) { .mo-list { grid-template-columns: 1fr; } .mo-tools form > * { flex: 1 1 100%; } .mo-cta .acts, .mo-cta .acts .btn { width: 100%; } }
''', '''%HERO%
<main class="wrap pbody2 mo-w" id="top">
  <section class="mo-tools" aria-label="دوّر في الفرص">
    <form id="moF" role="search"><input id="moQ" type="search" maxlength="80" dir="auto" placeholder="دوّر بالمنتج أو الجهة أو أي كلمة…" aria-label="دوّر في الفرص"><select id="moM" aria-label="السوق"><option value="">كل الأسواق</option></select><button class="btn btn-green" type="submit">🔎 دوّر</button></form>
    <div class="mo-seg" id="moT" role="group" aria-label="نوع الفرصة" translate="no"></div>
    <p class="mo-cnt" id="moC" aria-live="polite" translate="no"></p>
  </section>
  <div class="mo-list" id="moL" translate="no" aria-live="polite"></div>
  <div class="mo-more" id="moP" translate="no"></div>
  <section class="mo-cta"><p>عايز فرص زي دي لمنتجك؟ سجّل منشأتك في المنصة، أو كلّم جنة تدوّرلك دلوقتي.</p><div class="acts"><a class="btn btn-gold" href="register.html">✍️ سجّل منشأتك</a><a class="btn btn-line" href="signin.html" rel="nofollow">دخول</a></div></section>
  <p class="muted mo-note">ℹ️ الفرص دي للإعلام فقط، والمرجع لشروطها ومواعيدها هو الجهة صاحبة الفرصة نفسها. راجع <a href="legal.html#tenders">إخلاء مسؤولية المناقصات</a>.</p>
</main>
<script src="data/market-opps.js"></script>
''', '')
en_add([('فرص السوق – صنع في مصر', 'Market opportunities – Made in Egypt Gate'),
        ('أحدث المناقصات وطلبات عروض الأسعار والعملاء المحتملين والمشاريع الجديدة لمنتجات المصانع، في مصر وفي الأسواق التانية.',
         'The latest tenders, requests for quotation, potential buyers and new projects for factories’ products, in Egypt and in other markets.'),
        ('دوّر في الفرص', 'Search the opportunities'), ('دوّر بالمنتج أو الجهة أو أي كلمة…', 'Search by product, entity or any word…'),
        ('🔎 دوّر', '🔎 Search'), ('نوع الفرصة', 'Type of opportunity'),
        ('عايز فرص زي دي لمنتجك؟ سجّل منشأتك في المنصة، أو كلّم جنة تدوّرلك دلوقتي.', 'Want opportunities like these for your product? Register your company on the platform, or talk to Janna and she will look for you now.'),
        ('✍️ سجّل منشأتك', '✍️ Register your company'),
        ('ℹ️ الفرص دي للإعلام فقط، والمرجع لشروطها ومواعيدها هو الجهة صاحبة الفرصة نفسها. راجع', 'ℹ️ These opportunities are for information only; the reference for their terms and dates is the entity that owns each opportunity. See the')])
SEO['market-opportunities'] = ('أحدث المناقصات وطلبات عروض الأسعار والعملاء المحتملين والمشاريع الجديدة لمنتجات المصانع على منصة صنع في مصر.',
                               'فرص السوق, مناقصات, طلبات عروض أسعار, عملاء محتملين, مشاريع جديدة, صنع في مصر', 'WebPage', [('طلبات الأسعار', 'rfqs.html')], 'daily', '0.3')
