# -*- coding: utf-8 -*-
"""ASSIST — one information page per assistant of the platform, and /llms.txt (owner 2026-11-28: «ظبط كل البيانات انها تظهر في جوجل»).

Loaded by seo_build.part.py («# ASSIST hook» lines: the loader at the end of _seo_build_module, the page specs in plan_pages, the CSS in
emit_assets, the footer links in site_footer, the _headers / _routes.json lines, emit() in build_static_seo).

  /janna-assistant/ + /en/janna-assistant/   «جنة», the AI assistant of every visitor (data/janna.js, worker/src/janna-session.js)
  /bassem-advisor/  + /en/bassem-advisor/    «باسم», the AI deal advisor of the Core Partner and Strategic Partner members, 365 days
                                             from activation (data/bassem.js, advisor.part.py, worker/src/advisor.js)
  Generated pages (same head, header, footer, styles, canonical / hreflang and sitemap entry as the hubs). Each says what the assistant
  does, for whom, how to start, the languages, what it does not do (the details of the opportunities are for members: worker/src/
  opp-lock.js), the privacy line (the legal center's privacy policy) and a FAQ; the FAQPage JSON-LD holds exactly the questions and
  answers the page shows. Every sentence comes from what the code and the knowledge files already say (docs/janna/kb/platform-faq.md
  §19, data/janna.js, data/bassem.js, advisor.part.py, register.part.py, the contact page): no capability is invented.

  /llms.txt   a plain-text description of the platform for AI assistants and answer engines (Arabic + English): the approved identity
              sentence, the owner / operator lines word for word (CLAUDE.md 2.7), the official contact details and the main sections
              with their links; the counts are computed from this build's data.
Browser code here is ES5 (CLAUDE.md 2.1).
"""

ASSIST_CSS = ('.as-list{margin:0;padding-inline-start:1.2em;display:flex;flex-direction:column;gap:6px}'
              '.as-faq h3{font-size:1rem;margin:14px 0 4px}.as-faq h3:first-of-type{margin-top:4px}.as-faq p{color:var(--muted)}'
              '.as-note{font-size:.86rem;color:var(--muted)}')

# «اسأل جنة» on this page: the same button the generated pages carry (#seoAsk, SEO_JS loads the assistant on the first tap)
ASSIST_ASK_JS = ('(function(){var b=document.querySelectorAll("[data-as-ask]");for(var i=0;i<b.length;i++){b[i].addEventListener("click",function(e){'
                 'var a=document.getElementById("seoAsk");if(a){e.preventDefault();a.click();}});}})();')


def assist_module(H):
    """H = the namespace of seo_build.part.py's _seo_build_module (its locals() at the end): the helpers are taken by name"""
    import json
    esc, X, S, SITE, HOST = H['esc'], H['X'], H['S'], H['SITE'], H['HOST']
    crumbs, home_crumb, hero, mk_title, mk_desc, abs_url, static_url = (H['crumbs'], H['home_crumb'], H['hero'], H['mk_title'], H['mk_desc'],
                                                                          H['abs_url'], H['static_url'])
    JANNA, BASSEM = '/janna-assistant/', '/bassem-advisor/'

    def lnk(L, p):
        """a generated page's own link in language L (its /en/ twin when this build has it)"""
        return ('/en' + p) if (L == 'en' and ('/en' + p) in S['en_paths']) else p

    def faq_ld(url, qa):
        return {"@type": "FAQPage", "@id": url + '#faq', "url": url,
                "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]}

    def page(L, path, h1, intro, logo, sections, qa, title, desc, about_ld, acts):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + path)
        ch, crumb_ld = crumbs([home_crumb(L), (h1, P + path)], L, url)
        top = hero(L, ch, h1, intro, logo=logo, acts=acts)
        secs = ''.join('<section class="card2"><h2>%s</h2>%s</section>' % (esc(t), b) for t, b in sections)
        faq = ('<section class="card2 as-faq" id="faq"><h2>%s</h2>%s</section>'
               % (X(L, 'أسئلة شائعة', 'Frequently asked questions'), ''.join('<h3>%s</h3><p>%s</p>' % (esc(q), esc(a)) for q, a in qa)))
        body = top + '<div class="wrap sx-main">%s%s<script>%s</script></div>' % (secs, faq, ASSIST_ASK_JS)
        about_ld['@id'] = url + '#assistant'
        page_ld = {"@context": "https://schema.org", "@graph": [about_ld, faq_ld(url, qa)]}
        meta = {'title': mk_title([title], L, suffix=False), 'desc': mk_desc([desc], L, ''), 'h1': h1, 'og_type': 'website', 'page_type': 'WebPage',
                'jsonld_crumbs': crumb_ld, 'jsonld_page': page_ld, 'about_id': url + '#assistant', 'kw': '',
                'og_image': logo, 'keywords': X(L, 'المساعد الذكي، منصة صنع في مصر، مصانع مصر، مناقصات مصر', 'AI assistant, Made in Egypt Gate, Egyptian factories, Egypt tenders')}
        return body, meta

    def ul(items):
        return '<ul class="as-list">%s</ul>' % ''.join('<li>%s</li>' % x for x in items)

    def privacy(L, who):
        return ('<p>%s <a href="%s">%s</a></p>'
                % (esc(who), esc(static_url('legal', L, '#privacy')), X(L, 'سياسة الخصوصية ←', 'Privacy policy →')))

    def render_janna(L):
        T = lambda a, e: esc(X(L, a, e))
        en = L == 'en'
        live = '/?live=1' if not en else static_url('contact', 'en') + ('&' if '?' in static_url('contact', 'en') else '?') + 'live=1'
        acts = ('<div class="sx-acts"><a class="btn btn-gold" href="%s" data-as-ask>%s</a><a class="btn btn-glass" href="%s">%s</a><a class="btn btn-glass" href="%s">%s</a></div>'
                % (esc(live), T('💬 اسأل جنة الآن', '💬 Ask Janna now'), esc(live), T('🎥 مكالمة فيديو مع جنة', '🎥 Video call with Janna'),
                   esc(static_url('contact', L, '#meet')), T('📅 اجتماع مع جنة', '📅 A meeting with Janna')))
        sections = [
            (X(L, 'لمن جنة؟', 'Who is Janna for?'),
             '<p>%s</p>' % T('لكل زائر للمنصة، من غير تسجيل: أصحاب المصانع والموردون، والمشترون وشركات التوريد، والمستثمرون والجهات. '
                             'وأعضاء باقتي «الشريك الأساسي» و«الشريك الاستراتيجي» يخدمهم المستشار الذكي «باسم» بعد تسجيل الدخول.',
                             'Every visitor of the platform, with no sign-up: factory owners and suppliers, buyers and supply companies, investors and '
                             'public bodies. Members of the Core Partner and Strategic Partner plans are served by the AI advisor Bassem once they sign in.')
             + '<p><a href="%s">%s</a></p>' % (esc(lnk(L, BASSEM)), T('تعرّف على باسم ←', 'Meet Bassem →'))),
            (X(L, 'ماذا تفعل جنة؟', 'What does Janna do?'),
             ul([T('تأخذك إلى أي قسم في المنصة وتشرح ما فيه.', 'Takes you to any section of the platform and explains what it holds.'),
                 T('تبحث معك في دليل المصانع والمنتجات والمناقصات وطلبات الأسعار.', 'Searches the directory of factories and products, the tenders and the requests for quotation with you.'),
                 T('تملأ معك نموذج طلب عرض السعر أو رسالة التواصل أو استمارة التسجيل بالحوار، ولا يُرسل شيء قبل أن تؤكده بنفسك.',
                   'Fills in the request for quotation, the contact message or the registration form with you by conversation; nothing is sent before you confirm it yourself.'),
                 T('تقترح الباقة المناسبة لمصنعك وتشرح ما تشمله.', 'Suggests the plan that suits your factory and explains what it includes.'),
                 T('تنشئ رمز QR لتكمل من موبايلك.', 'Makes a QR code so you can continue on your phone.'),
                 T('اجتماع فيديو مباشر معها لشرح المنصة، أو في موعد تختاره، ويصلك ملخص الاجتماع على بريدك.',
                   'A live video meeting to explain the platform, now or at a time you choose; the summary of the meeting reaches your e-mail.')])),
            (X(L, 'كيف تبدأ؟', 'How to start'),
             ul([T('اضغط زر «اسأل جنة» أو بطاقة جنة في أي صفحة من صفحات المنصة، واكتب أو تكلّم.', 'Tap «Ask Janna» or Janna’s card on any page of the platform, then type or talk.'),
                 T('للمكالمة بالفيديو: زر «اتكلم مع جنة»، ويطلب المتصفح إذن الميكروفون.', 'For a video call: the «Talk to Janna» button; the browser asks for the microphone.'),
                 T('لاجتماع في موعد تختاره: «اجتماع مع جنة» في صفحة اتصل بنا.', 'For a meeting at a time you choose: «A meeting with Janna» on the contact page.')])),
            (X(L, 'اللغات', 'Languages'),
             '<p>%s</p>' % T('تتحدث جنة العامية المصرية أساساً، والعربية الفصحى والإنجليزية.', 'Janna speaks Egyptian Arabic first, as well as Modern Standard Arabic and English.')),
            (X(L, 'ما لا تفعله جنة', 'What Janna does not do'),
             ul([T('لا ترفع مستنداتك ولا تدفع نيابةً عنك، ولا تطلب بيانات بطاقتك البنكية أبداً.', 'She does not upload your documents or pay for you, and never asks for your card details.'),
                 T('تفاصيل المناقصات وطلبات الأسعار والترسيات والمشاريع (الجهة والقيمة والمستندات ورابط الإعلان الرسمي) للأعضاء المشتركين وفق باقاتهم؛ تعرض جنة للزائر عنوان الفرصة وحالتها وتدعوه للتسجيل.',
                   'The details of tenders, RFQs, contract awards and projects (the entity, the value, the documents and the official notice) are for subscribed members within their plans; to a visitor Janna gives the title and the status of the opportunity and invites the registration.'),
                 T('المنصة لا تطرح المناقصات ولا ترسيها.', 'The platform does not issue or award tenders.'),
                 T('جنة مساعدة ذكاء اصطناعي وقد تخطئ؛ للتأكيد تواصل مع فريق المنصة.', 'Janna is an AI assistant and can make mistakes; to be sure, contact the platform team.')])
             + '<p><a href="%s">%s</a></p>' % (esc(static_url('contact', L)), T('تواصل مع فريق المنصة ←', 'Contact the platform team →'))),
            (X(L, 'الخصوصية', 'Privacy'),
             privacy(L, X(L, 'تُعالج المنصة بيانات المحادثات وفق سياسة الخصوصية وقانون حماية البيانات الشخصية رقم 151 لسنة 2020، ولا تُربط محادثاتك بحساب عضو إلا بعد تسجيل دخولك أنت بحسابك.',
                             'The platform processes the conversations under its privacy policy and the Personal Data Protection Law No. 151 of 2020; your conversations are linked to a member account only after you sign in to your own account.'))),
        ]
        qa = [(X(L, 'هل أحتاج إلى حساب للتحدث مع جنة؟', 'Do I need an account to talk to Janna?'),
               X(L, 'لا، جنة متاحة لكل زائر على صفحات المنصة من غير تسجيل.', 'No. Janna is there for every visitor on the platform’s pages, with no sign-up.')),
              (X(L, 'بأي لغة أتحدث مع جنة؟', 'In which language can I talk to Janna?'),
               X(L, 'بالعامية المصرية أو العربية الفصحى أو الإنجليزية.', 'In Egyptian Arabic, Modern Standard Arabic or English.')),
              (X(L, 'هل ترسل جنة طلب عرض السعر نيابةً عني؟', 'Does Janna send my request for quotation for me?'),
               X(L, 'تملأ معك النموذج بالحوار، ولا يُرسل الطلب إلا بعد أن تؤكده بنفسك؛ ثم تطابقه المنصة تلقائياً مع المصانع المسجّلة على المنصة وترسله إليها.',
                 'She fills in the form with you by conversation, and the request is sent only after you confirm it yourself; the platform then matches it automatically with the factories registered on the platform and sends it to them.')),
              (X(L, 'هل تعرض جنة تفاصيل المناقصات كاملة؟', 'Does Janna give the full details of tenders?'),
               X(L, 'تعرض للزائر عنوان الفرصة وحالتها ومواعيدها؛ أما التفاصيل الكاملة فللأعضاء المشتركين وفق باقاتهم.',
                 'To a visitor she gives the title, the status and the dates of the opportunity; the full details are for subscribed members within their plans.')),
              (X(L, 'كيف أتحدث مع أحد من فريق المنصة؟', 'How do I talk to someone from the platform team?'),
               X(L, 'من صفحة «اتصل بنا»: الخط الساخن وواتساب المنصة والبريد الإلكتروني ونموذج الاستفسار.',
                 'On the contact page: the hotline, the platform’s WhatsApp, e-mail and the enquiry form.'))]
        h1 = X(L, 'جنة، المساعدة الذكية لمنصة صنع في مصر', 'Janna, the AI assistant of Made in Egypt Gate')
        intro = X(L, 'جنة مساعدة ذكاء اصطناعي تستقبل زوار المنصة على صفحاتها: تعرّفهم بأقسامها وباقاتها، وتبحث معهم عن المصانع والمنتجات والمناقصات وطلبات الأسعار، وتملأ معهم النماذج بالحوار.',
                  'Janna is an AI assistant that welcomes visitors on the platform’s pages: she introduces its sections and plans, searches factories, products, tenders and requests for quotation with them, and fills in forms with them by conversation.')
        about_ld = {"@type": "Service", "name": X(L, 'جنة – المساعدة الذكية لمنصة صنع في مصر', 'Janna – the AI assistant of Made in Egypt Gate'), "serviceType": X(L, 'مساعدة ذكية للزوار', 'AI assistant for visitors'),
                    "description": intro, "provider": {"@id": SITE + '/#org'}, "areaServed": {"@type": "Country", "name": "EG"}, "availableLanguage": ["ar", "en"],
                    "audience": {"@type": "Audience", "audienceType": X(L, 'زوار المنصة', 'Visitors of the platform')}}
        return page(L, JANNA, h1, intro, '/img/janna.jpg', sections, qa,
                    X(L, 'جنة: المساعدة الذكية لمنصة صنع في مصر', 'Janna: the AI assistant of Made in Egypt Gate'),
                    X(L, 'جنة، المساعدة الذكية لمنصة صنع في مصر: ماذا تفعل، ولمن، وكيف تبدأ محادثة أو مكالمة فيديو، واللغات، وما لا تفعله، وأسئلة شائعة.',
                      'Janna, the AI assistant of Made in Egypt Gate: what she does, for whom, how to start a chat or a video call, the languages, what she does not do, and FAQs.'),
                    about_ld, acts)

    def render_bassem(L):
        T = lambda a, e: esc(X(L, a, e))
        acts = ('<div class="sx-acts"><a class="btn btn-gold" href="%s" data-mig-buy>%s</a><a class="btn btn-glass" href="%s" rel="nofollow">%s</a></div>'
                % (esc(static_url('register', L, '#partner')), T('باقات الشركاء ←', 'Partner plans →'),
                   esc(static_url('signin', L)), T('دخول الأعضاء', 'Members sign in')))
        sections = [
            (X(L, 'لمن باسم؟', 'Who is Bassem for?'),
             '<p>%s</p>' % T('لأعضاء باقتي «الشريك الأساسي» و«الشريك الاستراتيجي» فقط، بعد تسجيل الدخول بحسابهم؛ خادم المنصة يتأكد من الباقة قبل أن يظهر باسم. '
                             'والزوار وباقي الأعضاء تخدمهم المساعدة الذكية «جنة».',
                             'Members of the Core Partner and Strategic Partner plans only, signed in to their account; the platform’s server checks the plan before Bassem appears. '
                             'Visitors and the other members are served by the AI assistant Janna.')
             + '<p><a href="%s">%s</a></p>' % (esc(lnk(L, JANNA)), T('تعرّف على جنة ←', 'Meet Janna →'))),
            (X(L, 'ماذا يفعل باسم؟', 'What does Bassem do?'),
             ul([T('موجز يومي بالفرص الحقيقية في أسواق باقتك: المناقصات وطلبات الأسعار.', 'A daily brief of the real opportunities in your plan’s markets: tenders and requests for quotation.'),
                 T('متابعة صفقاتك في مسار واحد، وغرفة لكل صفقة فيها دليل التعاقد وكاتب الإيميلات وسجل المراسلات والخط الزمني.',
                   'Your deals in one pipeline, and a room for each deal with the contracting guide, the e-mail composer, the thread and the timeline.'),
                 T('صياغة الإيميلات وتذكيرك بالمواعيد.', 'Drafting your e-mails and reminding you of the deadlines.'),
                 T('مكالمات فيديو مباشرة معك.', 'Live video calls with you.'),
                 T('يتذكر ملف شركتك ومهامك ومحادثاتك السابقة ليكمل معك من حيث توقفتما.', 'He remembers your company profile, your tasks and your earlier conversations, to carry on where you left off.')])),
            (X(L, 'كيف تبدأ؟', 'How to start'),
             ul([T('اشترك في باقة «الشريك الأساسي» أو «الشريك الاستراتيجي».', 'Subscribe to the Core Partner or the Strategic Partner plan.'),
                 T('سجّل الدخول بحسابك (كود على بريدك الإلكتروني)؛ فيظهر باسم على صفحات المنصة وفي صفحة المستشار الذكي للصفقات.',
                   'Sign in to your account (a code by e-mail); Bassem then appears on the platform’s pages and on the AI deal advisor page.')])),
            (X(L, 'اللغات', 'Languages'),
             '<p>%s</p>' % T('يتحدث باسم العربية والإنجليزية.', 'Bassem speaks Arabic and English.')),
            (X(L, 'حدود الخدمة', 'Limits of the service'),
             ul([T('يعمل باسم مع العضو 365 يوماً من تفعيل الباقة، وبعدها يعرض التجديد فقط.', 'Bassem works with a member for 365 days from the plan’s activation; after that he only offers the renewal.'),
                 T('الفرص في حدود أسواق باقتك.', 'The opportunities are within your plan’s markets.'),
                 T('المنصة لا ترسي العقود ولا تضمن ترسية أي مناقصة أو عقد، والتقديم على المناقصات الحكومية عبر بواباتها الرسمية.',
                   'The platform does not award contracts and guarantees no tender or contract; government tenders are bid on through their official portals.'),
                 T('باسم مستشار ذكاء اصطناعي وقد يخطئ؛ راجع المعلومات المهمة قبل أي قرار.', 'Bassem is an AI advisor and can make mistakes; check important information before any decision.')])),
            (X(L, 'الخصوصية', 'Privacy'),
             privacy(L, X(L, 'ذاكرة باسم مرتبطة بحساب العضو، وتُعالج وفق سياسة الخصوصية وقانون حماية البيانات الشخصية رقم 151 لسنة 2020.',
                             'Bassem’s memory belongs to the member’s account and is processed under the privacy policy and the Personal Data Protection Law No. 151 of 2020.'))),
        ]
        qa = [(X(L, 'من يستطيع استخدام باسم؟', 'Who can use Bassem?'),
               X(L, 'أعضاء باقتي «الشريك الأساسي» و«الشريك الاستراتيجي» بعد تسجيل الدخول بحسابهم.', 'Members of the Core Partner and Strategic Partner plans, signed in to their account.')),
              (X(L, 'كم مدة خدمة باسم؟', 'How long does Bassem’s service last?'),
               X(L, '365 يوماً من تفعيل الباقة، ويمكن التجديد بعدها.', '365 days from the plan’s activation; it can be renewed after that.')),
              (X(L, 'ما الفرق بين جنة وباسم؟', 'What is the difference between Janna and Bassem?'),
               X(L, 'جنة تستقبل كل زوار المنصة وتعرّفهم بها وتساعدهم في البحث والتسجيل، وباسم مستشار شخصي لأعضاء باقات الشركاء يتابع فرصهم وصفقاتهم يومياً.',
                 'Janna welcomes every visitor of the platform, introduces it and helps with search and registration; Bassem is the personal advisor of the partner plans’ members and follows their opportunities and deals every day.')),
              (X(L, 'هل يضمن باسم الفوز بالمناقصات؟', 'Does Bassem guarantee winning tenders?'),
               X(L, 'لا. يرصد الفرص ويساعد في متابعتها وصياغة المراسلات، والمنصة لا ترسي العقود ولا تضمن ترسية أي مناقصة.',
                 'No. He finds the opportunities and helps you follow them and draft the correspondence; the platform does not award contracts and guarantees no tender.')),
              (X(L, 'بأي لغة يتحدث باسم؟', 'In which language does Bassem speak?'),
               X(L, 'العربية والإنجليزية.', 'Arabic and English.'))]
        h1 = X(L, 'باسم، المستشار الذكي للصفقات', 'Bassem, the AI deal advisor')
        intro = X(L, 'باسم مستشار أعمال ذكي شخصي لأعضاء باقتي «الشريك الأساسي» و«الشريك الاستراتيجي»، يعمل مع العضو 365 يوماً من تفعيل الباقة: فرص يومية، ومتابعة الصفقات، وصياغة الإيميلات.',
                  'Bassem is the personal AI business advisor of the Core Partner and Strategic Partner members, working with a member for 365 days from the plan’s activation: daily opportunities, deal follow-up and e-mail drafting.')
        about_ld = {"@type": "Service", "name": X(L, 'باسم – المستشار الذكي للصفقات', 'Bassem – the AI deal advisor'), "serviceType": X(L, 'مستشار أعمال ذكي لأعضاء باقات الشركاء', 'AI business advisor for partner-plan members'),
                    "description": intro, "provider": {"@id": SITE + '/#org'}, "areaServed": {"@type": "Country", "name": "EG"}, "availableLanguage": ["ar", "en"],
                    "audience": {"@type": "BusinessAudience", "audienceType": X(L, 'أعضاء باقتي الشريك الأساسي والشريك الاستراتيجي', 'Members of the Core Partner and Strategic Partner plans')}}
        return page(L, BASSEM, h1, intro, '/img/bassem.jpg', sections, qa,
                    X(L, 'باسم: المستشار الذكي للصفقات لأعضاء باقات الشركاء', 'Bassem: the AI deal advisor of the partner plans'),
                    X(L, 'باسم، المستشار الذكي للصفقات لأعضاء باقتي الشريك الأساسي والشريك الاستراتيجي: فرص يومية ومتابعة الصفقات وصياغة الإيميلات لمدة 365 يوماً.',
                      'Bassem, the AI deal advisor of the Core Partner and Strategic Partner members: daily opportunities, deal follow-up and e-mail drafting for 365 days.'),
                    about_ld, acts)

    def key():
        return ('assist', 1)

    def footer_links(L, li, hub):
        """the two links of the footer's «المنصة» column"""
        return (li(hub(JANNA), X(L, 'جنة، المساعدة الذكية', 'Janna, the AI assistant')) + li(hub(BASSEM), X(L, 'باسم، المستشار الذكي للصفقات', 'Bassem, the AI deal advisor')))

    def llms_txt():
        """/llms.txt: the platform in plain text for AI assistants (Arabic, then English); counts from this build's data"""
        def u(p):
            return SITE + p
        en_ok = lambda p: ('/en' + p) in S['en_paths']
        n_dir = len(S.get('dir_members') or [])
        secs = [h for h in (S.get('hub_sectors') or []) if h.get('indexable')][:12]
        govs = [g for g in (S.get('hub_govs') or []) if g.get('indexable')][:12]
        main = [('/factories/', 'دليل المصانع والشركات المصرية' + (' (%s ملفاً)' % '{:,}'.format(n_dir) if n_dir else ''), 'Directory of Egyptian manufacturers and suppliers' + (' (%s profiles)' % '{:,}'.format(n_dir) if n_dir else '')),
                ('/products/', 'المنتجات الصناعية المصرية', 'Egyptian industrial products'),
                ('/market/', 'السوق الإلكتروني', 'Online marketplace'),
                ('/tenders/', 'المناقصات في مصر (العنوان والحالة والمواعيد للجميع، والتفاصيل للأعضاء)', 'Tenders in Egypt (title, status and dates for everyone; the details for members)'),
                ('/rfq/', 'طلبات عروض الأسعار', 'Requests for quotation (RFQs)'),
                ('/awards/', 'الترسيات', 'Contract awards'),
                ('/projects/', 'المشاريع في مصر', 'Projects in Egypt'),
                ('/governorates/', 'محافظات مصر', 'Governorates of Egypt'),
                ('/industrial-zones/', 'المناطق الصناعية', 'Industrial zones'),
                ('/free-zones/', 'المناطق الحرة', 'Free zones'),
                ('/export/', 'أسواق التصدير', 'Export markets'),
                ('/news/', 'أخبار الصناعة المصرية بمصادرها', 'Egyptian industry news with their sources'),
                ('/events/', 'المعارض والفعاليات', 'Exhibitions and events'),
                (JANNA, 'جنة، المساعدة الذكية لكل زائر', 'Janna, the AI assistant of every visitor'),
                (BASSEM, 'باسم، المستشار الذكي للصفقات لأعضاء باقات الشركاء', 'Bassem, the AI deal advisor of the partner plans'),
                ('/register/', 'التسجيل والباقات السنوية', 'Registration and annual plans'),
                ('/about/', 'عن المنصة', 'About the platform'),
                ('/contact/', 'اتصل بنا', 'Contact'),
                ('/legal/', 'المركز القانوني (الشروط والخصوصية)', 'Legal center (terms and privacy)')]
        ar = ['# منصة صنع في مصر', '', '> ' + (HOST.get('IDENTITY_AR') or ''), '',
              'المالك: الجمعية المصرية للتنمية الصناعية', 'جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي).',
              'المشغّل: الحسيني جروب وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير', '',
              'المنصة منصة معلومات وأعمال، وليست جهة حكومية ولا جهة تعاقدات حكومية، ولا ترسي العقود. تفاصيل المناقصات وطلبات الأسعار والترسيات والمشاريع للأعضاء المشتركين وفق باقاتهم.', '',
              '## الأقسام الرئيسية', '']
        ar += ['- [%s](%s)' % (a, u(p)) for p, a, e in main]
        if secs:
            ar += ['', '## القطاعات الصناعية', ''] + ['- [%s](%s)' % (h['sec']['t_ar'], u(h['path'])) for h in secs]
        if govs:
            ar += ['', '## المحافظات', ''] + ['- [%s](%s)' % (g['g']['ar'], u(g['path'])) for g in govs]
        ar += ['', '## التواصل', '', '- العنوان: ' + (HOST.get('ADDRESS_AR') or ''), '- الخط الساخن: 02 38346757 (+20238346757)', '- البريد: info@madeinegyptgate.com',
               '- مواعيد العمل: ' + (HOST.get('HOURS_AR') or ''), '- [الخريطة](%s)' % (HOST.get('MAP_URL') or ''), '']
        en = ['# Made in Egypt Gate', '', '> ' + (HOST.get('IDENTITY_EN') or ''), '',
              'Owner: Egypt Industrial Development Association', 'A non-profit association registered under No. 6189 of 2017 (Ministry of Social Solidarity).',
              'Operator: ElHouseni Group & Partners — receiving requests, partner registration, customer service and development', '',
              'The platform is an information and business platform, not a government body or a government contracting authority, and it does not award contracts. The details of tenders, RFQs, contract awards and projects are for subscribed members within their plans.', '',
              '## Main sections', '']
        en += ['- [%s](%s)' % (e, u(('/en' + p) if en_ok(p) else p)) for p, a, e in main]
        if secs:
            en += ['', '## Industrial sectors', ''] + ['- [%s](%s)' % (h['sec']['t_en'], u(('/en' + h['path']) if en_ok(h['path']) else h['path'])) for h in secs if h['sec'].get('t_en')]
        if govs:
            en += ['', '## Governorates', ''] + ['- [%s](%s)' % (g['g']['en'], u(('/en' + g['path']) if en_ok(g['path']) else g['path'])) for g in govs if g['g'].get('en')]
        en += ['', '## Contact', '', '- Address: ' + (HOST.get('ADDRESS_EN') or ''), '- Hotline: +20 2 38346757', '- E-mail: info@madeinegyptgate.com',
               '- Working hours: ' + (HOST.get('HOURS_EN') or ''), '- [Map](%s)' % (HOST.get('MAP_URL') or ''), '']
        return '\n'.join(ar + ['---', ''] + en)

    def emit(OUT):
        txt = llms_txt()
        with open(OUT + 'llms.txt', 'w', encoding='utf-8') as f:
            f.write(txt)
        return {'llms_txt': len(txt.encode('utf-8'))}

    def headers():
        return '/llms.txt\n  Content-Type: text/plain; charset=utf-8\n  Cache-Control: public, max-age=3600\n'

    return {'css': ASSIST_CSS, 'pages': [(JANNA, 'assistant', render_janna), (BASSEM, 'assistant', render_bassem)], 'key': key,
            'footer_links': footer_links, 'emit': emit, 'headers': headers, 'routes_exclude': ['/llms.txt'], 'llms_txt': llms_txt}
