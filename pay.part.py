# Invoice payment page: pay.html#inv=<pay_token>[&r=1] → /pay/ after the clean-URL build (ACC-CONTRACT §1.8). Public, noindex (seo/config.json
# noindex_static, P-T4), not in the sitemap, no third-party tags (data/seo.js PRIV, X-site-side-6). The token lives only in the address hash
# (never sent to our server as part of a page URL, never in a Referer); the page reads the invoice with GET /api/pay/invoice?t=<token>:
#   open + gateway ready        → the invoice card + «ادفع الآن» → POST /api/pay/checkout {t} → the provider's hosted page (no card field here, ever)
#   open + manual instructions  → bank transfer / InstaPay text from the settings + «اكتب رقم الفاتورة في بيان التحويل»
#   open + nothing ready        → «بوابة الدفع لسه بتتجهّز …» (register.html wording)
#   return from the provider (r=1) → «جاري تأكيد الدفع…», polling every 3 s up to 60 s → paid / failed / timeout
#   paid · void · refunded · expired → final messages;  unknown / wrong token → «الرابط ده مش صحيح أو انتهى»
# The logic is data/pay.js (bilingual T(ar, en) in code); this file only holds the page shell.
PAGES['pay'] = ('دفع الفاتورة – صنع في مصر', '', globals().get('COMMON_CSS', '') + '''
.payh { background: linear-gradient(120deg, #4a0510 0%, #8E0B20 60%, #A50E26 100%); color: #fff; }
.payh .wrap { padding-block: 26px 24px; display: flex; flex-direction: column; gap: 6px; }
.payh .crumb { font-size: .8rem; opacity: .85; } .payh .crumb a { color: #fff; }
.payh h1 { font-size: clamp(1.3rem, 3vw, 1.9rem); font-weight: 900; color: #fff; margin: 0; }
.payh p { opacity: .92; max-width: 60em; margin: 0; }
.payw { padding-block: 24px 70px; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.payc { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.payc h2 { font-size: 1.15rem; font-weight: 900; margin: 0; }
.payinv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; margin: 0; font-size: .95rem; }
.payinv dt { color: var(--muted); } .payinv dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
.payinv dd.tot { font-size: 1.2rem; color: var(--green); font-weight: 900; }
.payst { border-radius: 14px; padding: 12px 14px; font-weight: 700; font-size: .95rem; line-height: 1.8; }
.payst.warn { background: #FFF4D6; color: #7A5A00; } .payst.err { background: #FDECEC; color: #8E0B20; } .payst.ok { background: #E3F7EA; color: #0B6B35; } .payst.info { background: #E8F1FB; color: #0B3B66; }
.paybtn { font: inherit; font-weight: 900; font-size: 1.05rem; border: 0; border-radius: 14px; padding: 13px 22px; background: #0B6B35; color: #fff; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; justify-content: center; text-decoration: none; }
.paybtn[disabled] { background: #9fb5ae; cursor: not-allowed; }
.paya { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.payman { white-space: pre-line; background: var(--sunken, #f6f1f2); border-radius: 12px; padding: 12px 14px; font-size: .92rem; line-height: 1.9; overflow-wrap: anywhere; }
.paytag { display: inline-block; border-radius: 99px; padding: 2px 10px; font-size: .78rem; font-weight: 800; background: #FFF4D6; color: #7A5A00; }
.paysp { width: 22px; height: 22px; border-radius: 50%; border: 3px solid currentColor; border-inline-end-color: transparent; display: inline-block; vertical-align: middle; animation: paysp .9s linear infinite; }
@keyframes paysp { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .paysp { animation: none; } }
.pays { display: flex; flex-direction: column; gap: 12px; }
.pays .payc { padding: 16px; gap: 8px; } .pays h3 { font-size: .98rem; font-weight: 900; margin: 0; }
.pays ul { margin: 0; padding-inline-start: 18px; font-size: .86rem; color: var(--muted); display: flex; flex-direction: column; gap: 4px; }
.paysk { height: 18px; border-radius: 8px; background: linear-gradient(90deg, var(--line), transparent, var(--line)); background-size: 200% 100%; animation: paysk 1.2s linear infinite; }
@keyframes paysk { to { background-position: -200% 0; } }
@media (max-width: 900px) { .payw { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 520px) { .payinv { grid-template-columns: 1fr; gap: 2px; } .payinv dd { margin-bottom: 8px; } .paybtn { width: 100%; } }
''', '''
<section class="payh"><div class="wrap"><nav class="crumb" id="payCr"><a href="home.html">الرئيسية</a> › دفع الفاتورة</nav><h1 id="payH">دفع الفاتورة</h1><p id="payP">صفحة دفع اشتراك منصة صنع في مصر.</p></div></section>
<main class="wrap payw" id="top"><section class="payc" id="payBox" aria-live="polite"><div class="paysk"></div><div class="paysk" style="width:60%"></div></section><aside class="pays" id="paySide"></aside></main>
<script src="data/pay.js"></script>
''', '')
en_add([('دفع الفاتورة – صنع في مصر', 'Invoice payment – Made in Egypt Gate'), ('دفع الفاتورة', 'Invoice payment'),
        ('صفحة دفع اشتراك منصة صنع في مصر.', 'The subscription payment page of Made in Egypt Gate.')])
