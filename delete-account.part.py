# «حذف الحساب» — /delete-account/ (app parity plan 2026-11-20, item account-delete-request): the public, noindex page Google Play asks for
# («a web link where users can request the deletion of their account and data») and the dashboard's «🗑 طلب حذف الحساب» leads to. It only
# ASKS (worker/src/delete-requests.js — migration 0010): the owner runs the audited deletion within 30 days. Behind the owner's switches
# (data/flags.js; «🛠️ المطوّر» → «المزايا»):
#   account_delete OFF (the default until the owner approves the texts of docs/app/OWNER-APPROVAL-AR.md): the page says what the privacy
#     policy already says (/legal/#privacy: write to info@madeinegyptgate.com) — nothing new is promised;
#   account_delete ON: signed out → the e-mail-code sign-in (data/mig-api.js MIGAPI.open); signed in → «🗑 طلب حذف الحساب», a second
#     confirmation, then POST /api/me/delete-request and its status (GET); an e-mailed link session is asked to sign in with a code;
#   visitor_erase_request ON (the owner's exception to «Janna's memory is permanent»): «امسح كلامي مع جنة» for this device's random
#     visitor id (localStorage "mig-vid") → POST /api/janna/memory/erase-request.
# The texts of this page are DRAFTS until the owner approves them word for word (CLAUDE.md 2.7). Logic: data/delete-account.js (ES5,
# T(ar, en) in code); this file holds the shell. noindex (seo/config.json noindex_static), never in a sitemap, no third-party tags.
PAGES['delete-account'] = ('حذف الحساب – صنع في مصر', '', globals().get('COMMON_CSS', '') + '''
.dah { background: linear-gradient(120deg, #4a0510 0%, #8E0B20 60%, #A50E26 100%); color: #fff; }
.dah .wrap { padding-block: 26px 24px; display: flex; flex-direction: column; gap: 6px; }
.dah .crumb { font-size: .8rem; opacity: .85; } .dah .crumb a { color: #fff; }
.dah h1 { font-size: clamp(1.3rem, 3vw, 1.9rem); font-weight: 900; color: #fff; margin: 0; }
.dah p { opacity: .92; max-width: 60em; margin: 0; }
.daw { padding-block: 24px 70px; display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
.dac { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dac h2 { font-size: 1.12rem; font-weight: 900; margin: 0; }
.dac p, .dac li { margin: 0; line-height: 1.9; }
.dac ul { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 4px; }
.dast { border-radius: 14px; padding: 12px 14px; font-weight: 700; line-height: 1.8; }
.dast.warn { background: #FFF4D6; color: #7A5A00; } .dast.err { background: #FDECEC; color: #8E0B20; } .dast.ok { background: #E3F7EA; color: #0B6B35; } .dast.info { background: #E8F1FB; color: #0B3B66; }
.daa { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.dabtn { font: inherit; font-weight: 800; border: 0; border-radius: 12px; padding: 12px 18px; min-height: 44px; cursor: pointer; background: #8E0B20; color: #fff; }
.dabtn.l { background: var(--sunken, #f4f5f7); color: var(--fg); border: 1px solid var(--line); }
.dabtn[disabled] { opacity: .6; cursor: not-allowed; }
@media (max-width: 520px) { .dabtn { width: 100%; } }
''', '''
<section class="dah"><div class="wrap"><nav class="crumb"><a href="home.html">الرئيسية</a> › حذف الحساب</nav><h1>حذف الحساب</h1><p>طلب حذف حسابك على منصة صنع في مصر وبياناته.</p></div></section>
<main class="wrap daw" id="top">
  <section class="dac" id="daOff" data-mig-off="account_delete" data-mig-own="1" hidden><h2>إزاي تطلب حذف حسابك</h2><p>لطلب حذف حسابك وبياناتك ابعتلنا من بريد الحساب على <a href="mailto:info@madeinegyptgate.com" dir="ltr">info@madeinegyptgate.com</a>، زي ما <a href="legal.html#privacy">سياسة الخصوصية</a> بتقول.</p></section>
  <section class="dac" id="daMember" data-mig-feature="account_delete" hidden aria-live="polite"></section>
  <section class="dac" id="daVisitor" data-mig-feature="visitor_erase_request" hidden aria-live="polite"></section>
</main>
<script src="data/mig-api.js"></script>
<script src="data/delete-account.js"></script>
''', '')
en_add([('حذف الحساب – صنع في مصر', 'Delete your account – Made in Egypt Gate'), ('حذف الحساب', 'Delete your account'),
        ('طلب حذف حسابك على منصة صنع في مصر وبياناته.', 'Ask for the deletion of your Made in Egypt Gate account and its data.'),
        ('إزاي تطلب حذف حسابك', 'How to ask for the deletion of your account'),
        ('لطلب حذف حسابك وبياناتك ابعتلنا من بريد الحساب على', 'To ask for the deletion of your account and its data, write to us from the account\'s e-mail at'),
        ('، زي ما', ', as our'), ('سياسة الخصوصية', 'privacy policy'), ('بتقول.', 'says.')])
SEO['delete-account'] = ('طلب حذف حساب العضو على منصة صنع في مصر وبياناته.', 'حذف الحساب, حذف البيانات, صنع في مصر', 'WebPage', [], 'yearly', '0.1')
