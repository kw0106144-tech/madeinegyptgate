# -*- coding: utf-8 -*-
"""Static SEO layer for منصة صنع في مصر / Made in Egypt Gate (spec: docs/janna/SEO-SPEC.md §1).

What it builds (all server-rendered, self-canonical, trailing slash, AR at the root and EN under /en/):
  legacy WordPress URLs kept as canonical pages: /factories/<slug>/, /industrial_products/<slug>/, /tender-item/<slug>/, /rfq/<slug>/
  hubs from real data only (thresholds in seo/config.json): /factories/ (+/page/N/), /factories/<sector>/, /factories/<sector>/<gov>/,
  /governorates/<gov>/, /industrial-zones/<id>/, /free-zones/, /products/, /tenders/, /tenders/category/<cat>/, /tenders/entity/<slug>/,
  /rfq/, /awards/, /news/, /events/, /projects/, /offers/, /export/<market>/, /site-map/
  plus sitemaps (index + children, real lastmod), robots.txt, _headers, _routes.json, _redirects, /_seo/{redirects,pages,en-paths}.json,
  /_seo/hash/<type>.json and the hash shims (company.html#N → clean URL), and the installable app (PWA, emit_pwa): /manifest.webmanifest,
  /manifest.en.webmanifest, /sw.js, /offline/, /favicon.ico, /apple-touch-icon.png (+ the app tags in every <head>: pwa_head).

Use from site.py (after seo.part.py and after the pages loop):
    exec(open(B + 'seo_build.part.py', encoding='utf-8').read())
    SEO_STATS = build_static_seo(OUT)
Standalone into any directory (e.g. a temp dir):
    python3 seo_build.part.py <out-dir> [--today YYYY-MM-DD] [--no-dump] [--no-lastmod-save]

Everything lives inside _seo_build_module(); exec() into site.py only adds the names in SEO_API (no clobbering of site.py globals).
Visual layer (section pages as rich as the app pages): photo heroes, stat cards, a search bar into the interactive lists, photo tiles
and card grids (companies, products, tenders, projects, news, videos, events, offers), built from the project's own pictures only
(VIS_* maps, vimg() WebP variants under /assets/img/v/); the cards keep the anchors and texts of the former lists.
Honesty rules enforced here: counts are computed from the data at build time; sample data (MIG.LEADS, sample projects) never makes a page;
no factory phone / WhatsApp / e-mail in HTML, JSON-LD or sitemaps (descriptions are scrubbed); public-source factories are labelled
«بيانات من مصادر عامة – غير مسجّل في المنصة» and get no memberOf.
"""


def _seo_build_module(HOST):
    import os, re, json, hashlib, html as _html, unicodedata, datetime, subprocess, sys, io, csv, time
    from urllib.parse import quote, unquote, urlparse

    B = os.environ.get('MIG_SEO_ROOT') or HOST.get('B') or (os.path.dirname(os.path.abspath(HOST.get('__file__') or '.')) + '/')
    if not B.endswith('/'):
        B += '/'
    SITE = 'https://madeinegyptgate.com'
    AR_RX = re.compile('[؀-ۿ]')
    MANIFEST = []          # one row per generated URL (spec §1.11 site/_seo/pages.json)
    S = {}                 # build state (data, model, config, page registry)
    PERSIST = {}           # survives _init(): build start time (seo_prepare), notes from seo_rewrite_links() on site.py pages
    FPROF = {}             # FPROF hook: rich company profile (seo_fprof.part.py): {'render', 'assets'}; filled at the end of this module
    APPDL = {}             # APPDL hook: the app download page /app/, the APK channel, assetlinks.json (seo_app.part.py); filled at the end

    # ------------------------------------------------------------------ small utilities
    def esc(s):
        return _html.escape('' if s is None else str(s), quote=True)

    def strip_tags(s):
        return re.sub(r'<[^>]+>', ' ', s or '')

    def words(text):
        return len(re.findall(r'\S+', strip_tags(text)))

    def nfc(s):
        return unicodedata.normalize('NFC', s or '')

    def latin_digits(s):
        return str(s or '').translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))

    def sha(s, n=12):
        return hashlib.sha1((s if isinstance(s, bytes) else str(s).encode('utf-8'))).hexdigest()[:n]

    def jdump(o):
        return json.dumps(o, ensure_ascii=False, separators=(',', ':'), sort_keys=False)

    def ld(o):
        # JSON-LD inside <script>: valid JSON with "<", ">", "&", U+2028/2029 as \u escapes, so no "</script>", "<!--" or "<script"
        # sequence (from data or a baked admin override) can change how the HTML parser reads the element (same as the edge's safeJsonLd)
        return (jdump(o).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
                .replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))

    def fmt_n(n):
        return '{:,}'.format(int(n))

    def ar_n(n, one, plural, many=None):
        """Arabic number + counted noun: 3–10 take the plural («9 مناقصات»), 11+ the singular («12 مناقصة»), 1–2 the singular"""
        n = int(n)
        return '%s %s' % (fmt_n(n), plural if 3 <= n % 100 <= 10 else (many or one))

    AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    def pdate(s):
        try:
            return datetime.date.fromisoformat(str(s)[:10])
        except Exception:
            return None

    def full_date(s):
        """'YYYY-MM-DD' (a valid calendar date) or None: partial dates such as '2025-06' are not valid sitemap/XSD dates"""
        s = str(s or '')[:10]
        return s if re.fullmatch(r'\d{4}-\d{2}-\d{2}', s) and pdate(s) else None

    def fmt_date(s, L='ar'):
        d = s if isinstance(s, datetime.date) else pdate(s)
        if not d:
            return str(s or '')
        return ('%d %s %d' % (d.day, AR_MONTHS[d.month - 1], d.year)) if L == 'ar' else ('%d %s %d' % (d.day, EN_MONTHS[d.month - 1], d.year))

    def X(L, ar, en):
        return en if L == 'en' else ar

    def slug_ascii(s, maxlen=80):
        s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().lower()
        s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
        return re.sub(r'-{2,}', '-', s)[:maxlen].strip('-')

    def legacy_slug(url):
        """decoded, NFC-normalised last path segment of a legacy WordPress URL"""
        p = urlparse(str(url or '')).path
        seg = [x for x in p.split('/') if x]
        return nfc(unquote(seg[-1])) if seg else ''

    def pct(path):
        return quote(nfc(path), safe="/-_.~")

    def abs_url(path):
        return SITE + pct(path)

    def base36(h):
        n, out, al = int(h, 16), '', '0123456789abcdefghijklmnopqrstuvwxyz'
        while n:
            n, r = divmod(n, 36)
            out = al[r] + out
        return out or '0'

    def name_key(s):
        """matching key for names (port of the clean-up's norm.js key())"""
        s = latin_digits(s).lower()
        s = re.sub('[ً-ْٰ]', '', s).replace('ـ', '')
        s = re.sub('[أإآٱ]', 'ا', s).replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
        s = re.sub('[^ء-يa-z0-9]+', ' ', s)
        s = re.sub(r'(^|\s)(co|ltd|llc|sae|inc|company)(?=\s|$)', ' ', s)
        s = re.sub(r'(^|\s)(ش م م|ش م|ش ذ م م|ذ م م)(?=\s|$)', ' ', s)
        s = re.sub(r'\s+', ' ', s).strip()
        s = re.sub(r'^(الشركه|شركه|مصنع|مصانع|مؤسسه)\s+', '', s)
        return s.replace(' ', '')

    # ---- privacy (spec §0, §1.5): no phone / fax / hotline / WhatsApp / e-mail / street address of a company reaches HTML, JSON-LD, CSV or the manifest
    EMAIL_RX = re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')
    _SEP_AT = r'(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|\s+at\s+|＠|\s*\[@\]\s*)'
    _SEP_DOT = r'(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|\s+dot\s+|\.)'
    OBF_EMAIL_RX = re.compile(r'[\w.+-]+\s*' + _SEP_AT + r'\s*[\w-]+(?:\s*' + _SEP_DOT + r'\s*[\w-]+)*?\s*' + _SEP_DOT + r'\s*(?:com|net|org|eg|info|biz|co|gov|edu)\b', re.I)
    _PH_LABEL = (r'(?:تليفون|تلفون|تليفاكس|تلفاكس|هاتف|الهاتف|هواتف|موبايل|محمول|المحمول|جوال|الجوال|واتساب|واتس\s*اب|واتس|فاكس|الفاكس|'
                 r'الخط الساخن|خط ساخن|الخط المختصر|رقم مختصر|خدمة العملاء|للاتصال|للتواصل|اتصل بنا|اتصلوا بنا|اتصل|'
                 r'\b(?:tel(?:ephone)?|phone|mob(?:ile)?|cell|fax|whats\s*app|hot\s*line|call(?:\s+us)?)\b|'
                 r'(?<![ء-ي])[تفم](?=\s*[:：]))')
    LABELED_NUM_RX = re.compile(_PH_LABEL + r'\s*[:：.\-/]?\s*\(?\s*\+?\d[\d\s\-./()]{3,}\d\)?', re.I)
    NUMLIKE_RX = re.compile(r'(?<![0-9A-Za-z.])(?:\(\s*)?(?:\+|00)?\s*\(?\d[\d\s\-./()]{5,}\d\)?(?![0-9A-Za-z])')
    URL_RX = re.compile(r'(?:https?://|www\.)\S+|\bwa\.me/\S+', re.I)
    LABEL_LEFT_RX = re.compile(r'(?:تليفون|تلفون|تليفاكس|تلفاكس|هاتف|موبايل|محمول|جوال|واتساب|فاكس|ايميل|إيميل|البريد الإلكتروني|البريد الالكتروني|الخط الساخن|'
                               r'E-?mail|Tel|Phone|Mobile|Fax|WhatsApp|Hotline)\s*[:：]\s*(?=[\s،,.;\-–]|$)', re.I)
    PLACEHOLDER_RX = re.compile(r'لوريم\s*[إا]يبسوم|lorem\s+ipsum|dolor\s+sit\s+amet|من الحقائق المعروفة أن القارئ|هذا النص هو مثال لنص|'
                                r'it is a (?:long established|well[- ]known) fact that a reader', re.I)
    _AR = 'ء-ي'
    # street-level address parts (city / governorate stay): «60 شارع الجمهورية», «عمارة 3», «الدور الأول», «قطعة رقم 117», «ص.ب 12», «2 ميدان النافورة» …
    ADDR_RX = re.compile(
        r'(?<![' + _AR + r'])(?:شارع|شارغ|\d+\s*ش(?![' + _AR + r'])|ش\s*\.?\s*\d|\d+\s*طريق|(?:أول|اول|بداية)\s+طريق|'
        r'طريق\s+(?:مصر|القاهرة|الإسكندرية|الاسكندرية|اسكندرية|السويس|الإسماعيلية|الاسماعيلية|بلبيس|الواحات|الفيوم|الكريمات|الأوتوستراد|الاوتوستراد|الدائري|المحور|الحرية)|'
        r'الكيلو\s*\d|كيلو\s*\d|ك\s*\d+|كم\s*\d+|عمار[ةه]\s*(?:رقم\s*)?\d|برج\s*(?:رقم\s*)?\d|أبراج\s+\S+|ابراج\s+\S+|'
        r'الدور\s+(?:الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|الأرضي|الارضي|الأخير|الاخير|\d+)|دور\s*\d|شق[ةه]\s*(?:رقم\s*)?\d|مكتب\s*(?:رقم\s*)?\d|'
        r'قطع[ةه]\s*(?:رقم\s*)?\d|بلوك\s*(?:رقم\s*)?\d|مبن[ىي]\s*(?:رقم\s*)?\d|المجاورة\s+\S+|الحي\s+(?:الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d+)|'
        r'ص\s*\.?\s*ب\s*\.?\s*\d|صندوق بريد|الرمز البريدي|مزلقان|\d+\s*ميدان|ميدان\s+(?!العمل|الصناع|التجار|الإنتاج|الانتاج|الأعمال|الاعمال)[' + _AR + r']\S*)'
        r'|\bP\.?\s*O\.?\s*Box\b|\bBuilding\s+(?:No\.?\s*)?\d+|\b\d+(?:st|nd|rd|th)?\s+Floor\b'
        # English street names are matched case-sensitively («Salah Salem Street», «38 Street»), so «street lighting» stays
        r'|(?-i:\b\d+[A-Za-z]?,?\s+(?:[A-Z][\w\'.-]*\s+){1,4}(?:St\.?|Street|Rd\.?|Road|Ave\.?|Avenue)\b)'
        r'|(?-i:\b(?:Street|St\.|Road|Rd\.)\s*(?:No\.?\s*)?\d+|\b\d+\s+(?:Street|St\.|Road|Rd\.)(?=[\s,.;:)]|$))', re.I)
    # «on Salah Salem Street», «at Tahrir Square» (no number): an address only inside a sentence that says where the company is (LOC_RX),
    # so names like «Silk Road Trading» or «Square Office Furniture» are not taken for addresses
    ADDR_NAME_RX = re.compile(r'\b(?:[A-Z][\w\'.-]*\s+){1,4}(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Square|Sq\.)(?=[\s,.;:)]|$)')
    # a sentence that is about where the company sits («ويقع مقرها في …», "headquartered at …") goes as a whole
    LOC_RX = re.compile(r'(?<![' + _AR + r'])(?:[وف]?(?:يقع|تقع|يوجد|توجد|تتخذ)|مقر(?:ها|ه|ات|اتها)?|المقر|عنوان(?:ها|ه)?|العنوان)(?![' + _AR + r'])'
                        r'|\b(?:located|headquarter(?:s|ed)?|address|premises|based at|offices? (?:is|are) at|head office|main office|p\.?\s*o\.?\s*box)\b', re.I)
    ADDR_TAIL_RX = re.compile(r'^(?:و?(?:المتفرع|متفرع|بالقرب|بجوار|أمام|امام|خلف|عند تقاطع|تقاطع|الدور|دور|عمار|برج|مبنى|شق|مكتب|بلوك|قطع|الحي|المجاورة|مجاورة|أبراج|ابراج))|^(?:off|near|next to|opposite|behind|floor|building|block)\b', re.I)
    SENT_SPLIT_RX = re.compile(r'(?<=[.!؟?…])(?<![A-Z]\.[A-Z]\.)(?<!\bSt\.)(?<!\bNo\.)(?<!\bRd\.)(?<!\bDr\.)(?<!\bMr\.)(?<!\bEng\.)(?<!\bد\.)(?<!\bم\.)\s+|\n+')   # not after «P.O.», «St.», «Dr.», «د.»
    CLAUSE_SPLIT_RX = re.compile(r'(\s*[,،;؛]\s*|\s+[-–—]\s+|\s*\|\s*)')

    def _is_phone(s):
        d = re.sub(r'\D', '', s)
        plus = bool(re.match(r'^[\s(]*(?:\+|00)', s))
        if plus and 8 <= len(d) <= 15:
            return True                       # +20 2 2241 9416, 00201001234567, +966 …
        return d.startswith('0') and 9 <= len(d) <= 11   # 02/ 22 419 416, (02) 2241 9416, 03/4251234, 0100 123 4567

    def scrub_contacts(text):
        t = latin_digits(text or '')
        t = EMAIL_RX.sub(' ', t)
        t = OBF_EMAIL_RX.sub(' ', t)
        t = URL_RX.sub(' ', t)
        t = LABELED_NUM_RX.sub(' ', t)
        t = NUMLIKE_RX.sub(lambda m: ' ' if _is_phone(m.group(0)) else m.group(0), t)
        return LABEL_LEFT_RX.sub(' ', t)

    def scrub_address(text):
        out = []
        for sent in SENT_SPLIT_RX.split(text or ''):
            if not sent or not sent.strip():
                continue
            loc = LOC_RX.search(sent)
            if not ADDR_RX.search(sent) and not (loc and ADDR_NAME_RX.search(sent)):
                out.append(sent.strip())
                continue
            if loc:
                continue                      # «ويقع مقرها في 60 شارع الجمهورية بمنطقة وسط البلد في القاهرة.» → dropped
            parts = CLAUSE_SPLIT_RX.split(sent)
            keep, drop_next, prev = [], False, None
            for i in range(0, len(parts), 2):
                seg = parts[i]
                sep = parts[i + 1] if i + 1 < len(parts) else ''
                s0 = seg.strip()
                if not s0:
                    continue
                if ADDR_RX.search(seg) or (drop_next and ADDR_TAIL_RX.match(s0)):
                    drop_next = True
                    continue
                drop_next = False
                if s0 == prev:
                    continue                  # «القاهرة,القاهرة»
                keep.append(seg + sep)
                prev = s0
            s2 = ''.join(keep).strip(' ,،;؛-–—|')
            if s2:
                out.append(s2)
        return ' '.join(out)

    def scrub(text):
        """privacy: no phone / fax / hotline / WhatsApp / e-mail / raw URL / street address from a company text reaches the static output;
        template filler («لوريم إيبسوم», "It is a well-known fact that a reader…") counts as no text"""
        if not text or PLACEHOLDER_RX.search(text):
            return ''
        t = scrub_contacts(text)
        t = scrub_address(t)
        # leftovers of removed numbers: «أو أو», a lone "email" / «البريد» before punctuation
        t = re.sub(r'(?:(?<=\s)|^)(?:أو|او|or|و)(?:\s+(?:أو|او|or|و))+(?=\s|$)', ' ', t, flags=re.I)
        t = re.sub(r'(?:(?<=[\s,،.])|^)(?:e-?mail|البريد(?: الإلكتروني| الالكتروني)?|ايميل|إيميل)(?=\s*(?:[,،.;:]|$))', ' ', t, flags=re.I)
        t = re.sub(r'(?:(?<=\s)|^)(?:أو|او|or|و|and)\s*(?=[.,،;:]|$)', ' ', t, flags=re.I)
        t = re.sub(r'([.!؟?])(?:\s*[,،;])+', r'\1', t)
        t = re.sub(r'\s+([،,.;:])', r'\1', t)
        t = re.sub(r'([،,;:\-–])(?:\s*[،,;:\-–])+', r'\1', t)
        t = re.sub(r'\(\s*\)', ' ', t)
        return re.sub(r'\s+', ' ', t).strip(' -–،,;:|')

    _OBF_SEP_RX = re.compile(r'\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|＠|\[@\]|\s+at\s+', re.I)
    _LABEL_END_RX = re.compile(_PH_LABEL + r'\s*[:：.\-/]?\s*\(?\s*\+?$', re.I)
    _NUMRUN_RX = re.compile(r'\d[\d\s\-./()]{3,}\d')

    def has_contact(text):
        """phone (mobile, landline, hotline, +country), e-mail (incl. «info [at] x [dot] com») or wa.me link in a text
        (same detectors as scrub(), arranged so that a long page is checked quickly: separators and digit runs first)"""
        t = latin_digits(text or '')
        if ('@' in t or '＠' in t) and EMAIL_RX.search(t):
            return True
        if 'wa.me/' in t.lower():
            return True
        for m in _OBF_SEP_RX.finditer(t):
            if OBF_EMAIL_RX.search(t, max(0, m.start() - 80), m.end() + 80):
                return True
        t = re.sub(r'(?:https?://|www\.)\S+', ' ', t)      # file names and paths inside URLs are not phone numbers
        for m in _NUMRUN_RX.finditer(t):
            if _LABEL_END_RX.search(t, max(0, m.start() - 40), m.start()):
                return True
        return any(_is_phone(m.group(0)) for m in NUMLIKE_RX.finditer(t))

    def first_words(text, n):
        w = re.findall(r'\S+', strip_tags(text))
        return ' '.join(w[:n]) + ('…' if len(w) > n else '')

    def clip(s, n):
        s = re.sub(r'\s+', ' ', str(s or '')).strip()
        if len(s) <= n:
            return s
        cut = s[:n + 1]
        sp = cut.rfind(' ')
        return (cut[:sp] if sp > n * 0.6 else s[:n]).rstrip(' ،,.-–:') + '…'

    STOP_TAIL = re.compile(r'(?:\s+(?:of|and|for|the|to|in|with|a|an|on|at|by|from|&|في|من|على|إلى|الى|عن|مع|و|لـ|بـ|حتى|ضمن|–|-|،|,|:))+$', re.I)

    def cut(s, n):
        """clip to n characters at a word boundary, without an ellipsis and without a dangling preposition (for titles)"""
        s = re.sub(r'\s+', ' ', str(s or '')).strip()
        if len(s) <= n:
            return s
        c = s[:n + 1]
        sp = c.rfind(' ')
        c = (c[:sp] if sp > n * 0.5 else s[:n]).rstrip(' ،,.-–:')
        prev = None
        while prev != c:
            prev = c
            c = STOP_TAIL.sub('', c).rstrip(' ،,.-–:(')
        return c

    def load_json(path, default=None):
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return default
        except Exception as e:
            raise RuntimeError('seo_build: cannot read %s: %s' % (path, e))

    # ------------------------------------------------------------------ configuration
    CFG_DEFAULT = {
        "min_hub_members": 5, "min_tender_cat": 3, "min_tender_entity": 3, "min_tender_entity_page": 2, "min_company_words": 35, "min_company_words_with_products": 20,
        "min_company_products": 3, "min_facx_words": 40, "min_product_words": 20, "min_gov_items": 3, "news_index_min_words": 150,
        "tender_expired_index_days": 90, "tender_undated_index": False, "listing_page_size": 50, "slug_mode": "legacy", "offer_default_days": 14,
        "sitemap_max_urls": 10000, "max_pages": 18000, "today": None, "fonts": "google",
        "en": {"enabled": True, "only_indexable": True, "min_text_nodes_ratio": 0.95, "max_arabic_ratio": 0.05},
        "assistant": {"enabled": False, "scripts": [], "label_ar": "اسأل جنة", "label_en": "Ask Janna", "idle_desktop_ms": 0},
        "static_paths": {}, "generated_keys": [], "app_paths": {}, "shim_keys": {}, "noindex_static": [], "canonical_static": {},
        "redirect_extra": {}, "zone_match": {}, "product_category_sector": {}, "static_min_words": 30, "flat_pages": ["janna"], "gated_static": ["radar", "advisor"],
        "en_home": True, "product_index_image": True, "min_product_words_with_image": 0,
    }

    def load_config():
        cfg = json.loads(json.dumps(CFG_DEFAULT))
        user = load_json(B + 'seo/config.json', {}) or {}
        for k, v in user.items():
            if k.startswith('_'):
                continue
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
        if os.environ.get('MIG_SEO_SLUG_MODE') in ('legacy', 'hash'):
            cfg['slug_mode'] = os.environ['MIG_SEO_SLUG_MODE']   # A10 switch without editing config.json
        sec = load_json(B + 'seo/sectors.json')
        gov = load_json(B + 'seo/governorates.json')
        cats = load_json(B + 'seo/tender-cats.json')
        kws = load_json(B + 'seo/keywords.json', {"clusters": []})
        if not sec or not gov or not cats:
            raise RuntimeError('seo_build: seo/sectors.json, seo/governorates.json and seo/tender-cats.json are required')
        assert len(gov['governorates']) == 27, 'seo/governorates.json must hold exactly 27 governorates'
        return cfg, sec, gov, cats, kws

    # ------------------------------------------------------------------ data
    def load_data(dump=True):
        """D = the data/*.js globals as JSON (tools/dump-data.mjs; re-dumped when any data file is newer than build/data.json)"""
        out = os.environ.get('MIG_SEO_DATA') or (B + 'build/data.json')
        data_dir = B + 'site/data' if os.path.isdir(B + 'site/data') else B + 'data'
        if dump:
            newest = 0
            for f in os.listdir(B + 'data'):
                if f.endswith('.js'):
                    newest = max(newest, os.path.getmtime(B + 'data/' + f))
            for f in ('exportmarket.part.py', 'tools/dump-data.mjs'):
                if os.path.exists(B + f):
                    newest = max(newest, os.path.getmtime(B + f))
            # deploy 2: the published Control Center overlay that tools/dump-data.mjs bakes in (P-T1; deploy.sh pulls it into build/overlay.js)
            ovf = os.environ.get('MIG_OVERLAY_FILE') or (B + 'build/overlay.js')
            if os.path.exists(ovf):
                newest = max(newest, os.path.getmtime(ovf))
            if not os.path.exists(out) or os.path.getmtime(out) < newest:
                subprocess.run(['node', B + 'tools/dump-data.mjs', data_dir, out], check=True, stdout=sys.stderr)
        D = load_json(out)
        if not D:
            raise RuntimeError('seo_build: %s missing; run node tools/dump-data.mjs site/data build/data.json' % out)
        return D

    # ------------------------------------------------------------------ English (port of data/i18n.js tr())
    NUM_RX = re.compile(r'[0-9٠-٩][0-9٠-٩,.:%/\-]*')
    SEP_RX = re.compile(r'( · | – | — | \| |: )')

    def tr(s):
        """Arabic → English with the site's dictionary; None when any Arabic remains (the EN gate then decides). Memoised per build."""
        if s is None:
            return None
        cache = S.setdefault('tr_cache', {})
        k0 = str(s)
        if k0 in cache:
            return cache[k0]
        v = _tr(k0)
        cache[k0] = v
        return v

    def _af(x):
        # only the guillemets: «،» «؛» «؟» (data/i18n.js af() converts them too) are Arabic-block characters, and turning them
        # into , ; ? here would let translations through that the EN gate rejects today (new /en/ pages, new hreflang)
        return x.replace('«', '“').replace('»', '”') if x else x

    def _tr(s):
        t = re.sub(r'\s+', ' ', str(s)).strip()
        if not t:
            return ''
        if not AR_RX.search(t):
            return t
        DICT = S['dict']
        v0 = DICT.get(t)
        if isinstance(v0, str) and v0 and '{n}' not in v0 and not AR_RX.search(v0) and tr_ok(t, v0):
            return v0                          # exact entry (names with numbers: «مصنع 6 أكتوبر …», «(73)»)
        nums = []

        def _n(m):
            nums.append(m.group(0))
            return '{n}'
        k = NUM_RX.sub(_n, t)
        v = DICT.get(k)
        if v is None:
            m = re.match(r'^([^؀-ۿA-Za-z0-9{]*)([\s\S]*?)([^؀-ۿA-Za-z0-9}]*)$', k)
            if m and (m.group(1) or m.group(3)) and m.group(2) and DICT.get(m.group(2)) is not None:
                # «» left around the translated core become “” (data/i18n.js af()): the dictionary already gives the inner
                # ones in English form — «النصر للسيارات» تستهدف … was «El Nasr Automotive” targets …
                v = _af(m.group(1)) + DICT[m.group(2)] + _af(m.group(3))
        if v is None and '، ' in t:
            parts = [tr(x) for x in t.split('، ')]
            if all(p is not None for p in parts):
                return ', '.join(p.strip() for p in parts)
        if v is None:
            parts = SEP_RX.split(t)
            if len(parts) > 1:
                outp = [p if SEP_RX.fullmatch(p) else tr(p) for p in parts]
                if all(p is not None for p in outp):
                    return ''.join(outp)
            return None
        it = iter(nums)
        v = re.sub(r'\{n\}', lambda m: latin_digits(next(it, '')).rstrip(',.:/-'), v)
        if AR_RX.search(v) or not tr_ok(t, v):
            return None
        return v

    # The dictionary (data/i18n-en.js) still carries entries from the Saudi / UAE versions of the platform («المصرية» → "Saudi",
    # «رئيس الدولة» → "UAE President", «بنك التصدير» → "Saudi EXIM" …). A translation may name a foreign country, city, currency or
    # brand only as often as the Arabic source does, and an Arabic text about Egypt must stay about Egypt in English.
    FOREIGN_MARKERS = [(re.compile(r'\bSaudi', re.I), re.compile('سعود')), (re.compile(r'\bKSA\b'), re.compile('سعود|المملكة')),
                       (re.compile(r'\bRiyadh', re.I), re.compile('رياض')), (re.compile(r'\bJedd?ah|\bJiddah', re.I), re.compile('جد[ةه]')),
                       (re.compile(r'\bDammam', re.I), re.compile('دمام')), (re.compile(r'\bMak+ah\b|\bMecca\b', re.I), re.compile('مك[ةه]')),
                       (re.compile(r'\bKingdom\b', re.I), re.compile('مملك|المملك')), (re.compile(r'\bSAR\b|\bRiyals?\b', re.I), re.compile('ريال')),
                       (re.compile(r'\bAramco', re.I), re.compile('أرامكو|ارامكو')), (re.compile(r'\bSASO\b'), re.compile('SASO|ساسو|سعود')),
                       (re.compile(r'\bEmirat', re.I), re.compile('[إا]مار')), (re.compile(r'\bUAE\b'), re.compile('[إا]مارات')),
                       (re.compile(r'\bDubai', re.I), re.compile('دبي')), (re.compile(r'\bAbu\s*Dhabi', re.I), re.compile('ظبي')),
                       (re.compile(r'\bSharjah', re.I), re.compile('شارق')), (re.compile(r'\bAjman', re.I), re.compile('عجمان')),
                       (re.compile(r'\bAED\b|\bDirhams?\b', re.I), re.compile('درهم')), (re.compile(r'\bNahyan|\bbin Zayed', re.I), re.compile('نهيان|زايد')),
                       (re.compile(r'madeinsaudigate|madeinuaegate', re.I), re.compile(r'madeinsaudigate|madeinuaegate', re.I))]
    EGYPT_AR_RX = re.compile(r'(?<![ء-ي])[وبلفك]?(?:ال)?مصر(?:ي|ية|يه|يين|يون|يا)?(?![ء-ي])')

    def tr_ok(ar, en):
        for en_rx, ar_rx in FOREIGN_MARKERS:
            if en_rx.search(en) and not ar_rx.search(ar) and not en_rx.search(ar):   # Latin words already in the Arabic text (brands, URLs) count too
                return False
        if EGYPT_AR_RX.search(ar) and not re.search(r'egypt|misr(?![a-z])|masr', en, re.I):
            return False                       # «المصرية» → "Saudi": the English must still say Egypt / Egyptian (or Misr, Masreya … in names)
        return True

    def T(L, ar, en=None):
        """data string in language L: explicit English value, else dictionary, else the Arabic original (counted by the EN gate)"""
        if L != 'en':
            return ar
        if en:
            return en
        v = tr(ar)
        return v if v is not None else ar

    # ------------------------------------------------------------------ taxonomy
    def norm_sector(raw):
        """raw or canonical sector label → sector slug | None"""
        r = re.sub(r'\s+', ' ', str(raw or '')).strip()
        if not r:
            return None
        SEC = S['sec_by_ar']
        if r in SEC:
            return SEC[r]['slug']
        syn = S['sec_syn'].get(r)
        if syn and syn in SEC:
            return SEC[syn]['slug']
        for slug, rx in S['sec_rules']:
            if rx.search(r):
                return slug
        return None

    def gov_of(rec):
        """governorate code of a record (dict with 'gov', or free text through the governorate name/alias regexes)"""
        if isinstance(rec, dict):
            g = rec.get('gov') or ''
            if g in S['gov_by_code']:
                return g
            rec = rec.get('loc') or rec.get('city') or ''
        t = str(rec or '')
        if t in S['gov_by_code']:
            return t
        for code, rx in S['gov_rx']:
            if rx.search(t):
                return code
        return ''

    def zone_of(c):
        Z = S['zone_by_id']
        for zid, rx in S['zone_rx']:
            z = Z.get(zid)
            if not z:
                continue
            if rx.search(c.get('loc') or ''):
                return zid
        for zid, rx in S['zone_rx']:
            z = Z.get(zid)
            if z and c.get('gov') == z['region_code'] and rx.search(c.get('desc') or ''):
                return zid
        return ''

    # ------------------------------------------------------------------ URL scheme
    def url_for(kind, rec=None, lang='ar', page=1):
        """'/…/' (decoded, NFC, trailing slash) for any page kind; EN = '/en' + the AR path"""
        if kind == 'company':
            p = rec['path']
        elif kind in ('product', 'tender', 'rfq', 'news', 'event', 'award', 'project', 'offer', 'zone', 'export', 'tender-entity', 'tender-cat'):
            p = rec['path']
        elif kind == 'sector':
            p = '/factories/%s/' % rec['slug']
        elif kind == 'sector-gov':
            p = '/factories/%s/%s/' % (rec[0]['slug'], rec[1]['slug'])
        elif kind == 'gov':
            p = '/governorates/%s/' % rec['slug']
        elif kind == 'static':
            p = S['cfg']['static_paths'].get(rec, '/%s/' % rec)
        else:
            p = {'dir': '/factories/', 'govs': '/governorates/', 'zones': '/industrial-zones/', 'free-zones': '/free-zones/', 'products': '/products/',
                 'tenders': '/tenders/', 'rfq': '/rfq/', 'awards': '/awards/', 'news': '/news/', 'events': '/events/', 'projects': '/projects/',
                 'offers': '/offers/', 'exports': '/export/', 'site-map': '/site-map/', 'rfq-new': '/rfq/new/', 'home': '/'}[kind]
        if page and page > 1:
            p = p + 'page/%d/' % page
        return ('/en' + p) if lang == 'en' else p

    def static_url(key, L='ar', frag=''):
        """link to a site.py static page; EN only when the EN file exists in OUT"""
        p = S['cfg']['static_paths'].get(key, '/%s/' % key)
        if L == 'en':
            if os.path.exists(S['OUT'] + 'en' + p + 'index.html'):
                p = '/en' + p
            else:
                # no EN twin: keep the visitor in English (the page translates itself; the edge middleware serves
                # /x/?lang=en with 200 and the canonical stays the bare path) — found by the post-deploy EN crawl
                p = p + ('&' if '?' in p else '?') + 'lang=en'
        return p + frag

    def app_url(key):
        p = S['cfg']['app_paths'].get(key)
        if not p:
            return ''
        hp = HOST.get('pages')
        return p if (os.path.exists(S['OUT'] + p.lstrip('/') + 'index.html') or (isinstance(hp, dict) and key in hp and S.get('app_pages_expected'))) else ''

    def lk(L, path):
        """cross-link from a page in language L: the EN twin when it exists, else the AR page"""
        if L == 'en' and ('/en' + path) in S['en_paths']:
            return '/en' + path
        return path

    IMPORT_RX = re.compile(r'استيراد|إستيراد|مستورد|وكيل|وكلاء|توكيل|\bimport|\bsole agent|\bagent for', re.I)

    # ------------------------------------------------------------------ model
    def build_model(D):
        cfg = S['cfg']
        today = S['today']
        # --- taxonomy maps
        sec_list = S['sectors']
        S['sec_by_ar'] = {s['ar']: s for s in sec_list}
        S['sec_by_slug'] = {s['slug']: s for s in sec_list}
        S['sec_syn'] = S['sec_cfg'].get('synonyms', {})
        S['sec_rules'] = [(slug, re.compile(rx)) for slug, rx in S['sec_cfg'].get('rules', [])]
        gl = S['govs']
        S['gov_by_code'] = {g['code']: g for g in gl}
        S['gov_by_slug'] = {g['slug']: g for g in gl}
        W = '0-9A-Za-zؠ-ٟٱ-ۓ'

        def wrx(words_):
            alts = '|'.join(re.escape(w) for w in sorted(set(w for w in words_ if w), key=len, reverse=True))
            return re.compile('(?:^|[^%s])[وبلفك]?(?:%s)(?=$|[^%s])' % (W, alts, W), re.I)
        reg_alias = {r[0]: [r[1]] + list(r[3] or []) for r in D.get('regions', [])}
        S['gov_rx'] = [(g['code'], wrx(reg_alias.get(g['code'], [g['ar']]))) for g in gl]
        S['gov_ar2code'] = {}
        for g in gl:
            S['gov_ar2code'][g['ar']] = g['code']
            S['gov_ar2code']['محافظة ' + g['ar']] = g['code']
        # --- zones
        zones = []
        for z in D.get('zones', []):
            z = dict(z)
            z['path'] = '/industrial-zones/%s/' % z['id']
            zones.append(z)
        S['zones'] = zones
        S['zone_by_id'] = {z['id']: z for z in zones}
        S['zone_rx'] = [(zid, wrx(pats)) for zid, pats in cfg.get('zone_match', {}).items() if not zid.startswith('_') and zid in S['zone_by_id']]
        # --- members (oldfac) and public-source factories (facx)
        companies = []
        reserved = set(S['sec_by_slug']) | {'page', 'search', 'downloads', 'category'}
        facd = D.get('facd', [])
        desc_count = {}
        for i, x in enumerate(D.get('fac', [])):
            if x is None:                      # hidden in the Control Center (null in data.json)
                continue
            d = scrub(facd[i] if i < len(facd) else '')
            desc_count[d] = desc_count.get(d, 0) + 1
        slugs_seen = set()
        for i, x in enumerate(D.get('fac', [])):
            if x is None:
                continue
            ls = legacy_slug(x[7])
            if not ls:
                raise RuntimeError('seo_build: member %d has no legacy URL' % i)
            if ls in slugs_seen:
                raise RuntimeError('seo_build: duplicate legacy slug %s' % ls)
            slugs_seen.add(ls)
            if ls.isascii() and ls.lower() in reserved:
                raise RuntimeError('seo_build: legacy slug "%s" collides with a hub slug' % ls)
            d = scrub(facd[i] if i < len(facd) else '')
            c = {'kind': 'member', 'i': i, 'hid': str(i), 'name': re.sub(r'\s+', ' ', x[0]).strip(), 'sector': x[1], 'sslug': norm_sector(x[1]),
                 'type': x[3] or '', 'verified': bool(x[4]), 'logo': (x[5], x[6]) if isinstance(x[5], int) and x[5] >= 0 else None,
                 'legacy': ls, 'loc': x[2] or '', 'gov': x[10] or '', 'flags': x[11] or 0, 'desc': d, 'desc_raw': (facd[i] if i < len(facd) else '') if d else '',
                 'dup_desc': bool(d) and desc_count.get(d, 0) > 1, 'names': list(x[9] or []),
                 'pfx': (D.get('facd_pfx') or {}).get(str(i), '')}
            if not c['gov'] or c['gov'] not in S['gov_by_code']:
                c['gov'] = ''
            if cfg.get('slug_mode') == 'hash':
                c['path'] = '/factories/c-%s/' % base36(hashlib.sha1(ls.encode('utf-8')).hexdigest())[:7]
            else:
                c['path'] = '/factories/%s/' % ls
            c['legacy_path'] = '/factories/%s/' % ls
            c['words'] = words(c['desc'])
            companies.append(c)
        member_keys = {}
        for c in companies:
            member_keys.setdefault(name_key(c['name']), c)
        migfac_by_name = {f.get('name_ar'): f for f in D.get('migfac', [])}
        facx_alias = {}
        used = set(slugs_seen) | reserved
        # the 91 companies of data/factories.js (MIGFAC) are verified by hand by the platform team and are its clients (owner
        # decision 2026-11-18): «✓ موثّق من فريق المنصة». Same test as the pages' VFX() (pages.part.py): a MIGFAC name_ar, or the
        # researched spelling data/facx.js keeps for it (facx.js SAME). Only the other researched rows are public-source data.
        team_names = set((f.get('name_ar') or '').strip() for f in (D.get('migfac') or []) if isinstance(f, dict))
        same = D.get('facx_same') or {"مجموعة سيراميكا كليوباترا": "سيراميكا كليوباترا", "السجاد الشرقي (أورينتال ويفرز)": "النساجون الشرقيون",
                                      "فريش للأجهزة المنزلية": "فريش للأجهزة الكهربائية", "الأسمنت العربية": "الشركة العربية للأسمنت"}
        team_names |= set(v for k, v in same.items() if k in team_names)
        for i, x in enumerate(D.get('facx', [])):
            if x is None:
                continue
            name = re.sub(r'\s+', ' ', x[0]).strip()
            hid = 'x%d' % i
            team = (x[0] or '').strip() in team_names or name in team_names
            dupm = member_keys.get(name_key(name))
            if dupm:
                facx_alias[hid] = dupm
                if team:
                    dupm['team'] = True     # the MIGFAC company's directory listing is the same company: verified too
                if x[9] and not dupm.get('website'):
                    dupm['website'] = x[9]
                continue
            mf = migfac_by_name.get(x[0]) or {}
            name_en = mf.get('name_en') or ''
            if not name_en:
                v = tr(name)
                name_en = v or ''
            host = urlparse(x[9] or x[8] or '').netloc.replace('www.', '').split('.')[0]
            base = slug_ascii(name_en) or slug_ascii(host) or 'factory-%d' % i
            slug, k = base, 2
            while slug in used:
                slug = '%s-%d' % (base, k)
                k += 1
            used.add(slug)
            gov = (D.get('facx_gov') or [''] * (i + 1))[i] or mf.get('region_code') or ''
            d = scrub(x[4] or '')
            c = {'kind': 'public', 'i': i, 'hid': hid, 'name': name, 'name_en': name_en, 'sector': x[1], 'sslug': norm_sector(x[1]), 'type': x[3] or 'مصنع',
                 'verified': False, 'logo': None, 'legacy': '', 'loc': x[2] or '', 'gov': gov if gov in S['gov_by_code'] else '', 'flags': 0,
                 'desc': d, 'desc_raw': (x[4] or '') if d else '', 'dup_desc': False, 'names': list((D.get('facx_fp') or {}).get(x[0]) or []), 'source': x[8] or '', 'website': x[9] or '',
                 'path': '/factories/%s/' % slug, 'legacy_path': '', 'pfx': '', 'team': team}
            c['words'] = words(d)
            companies.append(c)
        for c in companies:
            c['zone'] = zone_of(c)
            if not c.get('name_en'):
                c['name_en'] = ''
        S['companies'] = companies
        S['facx_alias'] = facx_alias
        S['company_by_url'] = {}
        for c in companies:
            if c['kind'] == 'member':
                S['company_by_url'][nfc(unquote((D['fac'][c['i']][7] or '').replace('://madeinegyptgate', '://www.madeinegyptgate')))] = c
        # --- products
        products = []
        p2f = D.get('p2f', [])
        pslugs = set()
        for i, x in enumerate(D.get('prod', [])):
            if x is None:
                continue
            ls = legacy_slug(x[5])
            if not ls or ls in pslugs:
                raise RuntimeError('seo_build: product %d legacy slug missing/duplicate: %r' % (i, ls))
            pslugs.add(ls)
            maker = S['company_by_url'].get(nfc(unquote((p2f[i] if i < len(p2f) else '') or ''))) if i < len(p2f) and p2f[i] else None
            desc = scrub(x[1] or '')
            p = {'i': i, 'name': re.sub(r'\s+', ' ', x[0]).strip(), 'desc': desc, 'desc_raw': (x[1] or '') if desc else '', 'cat': x[2] or '', 'img': (x[3], x[4]) if isinstance(x[3], int) and x[3] >= 0 else None,
                 'legacy': ls, 'path': '/industrial_products/%s/' % ls, 'name_en': x[6] or '', 'flags': x[7] or 0, 'maker': maker}
            p['sslug'] = (maker or {}).get('sslug') or cfg.get('product_category_sector', {}).get(p['cat'])
            # «صنع في مصر» / countryOfOrigin only when the listed maker is a factory whose own text does not say it imports or is an agent
            p['mie'] = bool(maker and maker['type'] == 'مصنع' and not IMPORT_RX.search(maker.get('desc_raw') or maker.get('desc') or ''))
            products.append(p)
            if maker:
                maker.setdefault('prods', []).append(p)
        S['products'] = products
        # --- tenders (legacy WordPress rows, REAL rows with sources, international)
        real = D.get('real', {})
        real_by_title = {}
        for j, t in enumerate(real.get('tenders', [])):
            if t is None:
                continue
            real_by_title.setdefault(t.get('title_ar'), (j, t))
        oid = D.get('real_oid', [])
        tenders = []
        tslugs = set()
        for i, x in enumerate(D.get('tend', [])):
            src = x[11] or ''
            t = {'i': i, 'src': 'legacy', 'fid': str(x[0] or ''), 'ref': x[0] or '', 'ptype': x[1] or '', 'title': re.sub(r'\s+', ' ', x[3] or '').strip(),
                 'entity': '' if (x[4] or '').strip() in ('', 'جهة حكومية') else x[4].strip(), 'gov': x[10] or '', 'sector': x[6] or '',
                 'booklet': x[7] or '', 'bond': x[8] or '', 'deadline': x[9] or '', 'source': '', 'flags': x[12] or 0, 'title_en': '', 'entity_en': '',
                 'publish': '', 'city': '', 'hid': []}
            if '/madeinegyptgate.com/tender-item/' in src.replace('www.', ''):
                ls = legacy_slug(src)
                t['path'] = '/tender-item/%s/' % ls
                t['legacy'] = ls
            else:
                rj = real_by_title.get(x[3])
                if rj:
                    j, r = rj
                    t.update({'src': 'real', 'rid': r.get('id') or '', 'title_en': r.get('title_en') or '', 'entity_en': r.get('entity_en') or '',
                              'publish': r.get('publish_date') or '', 'city': r.get('city') or '', 'ref': r.get('ref') or t['ref'].replace('OFF:', ''),
                              'booklet': r.get('booklet_price_egp') or t['booklet'], 'bond': r.get('bid_bond_egp') or t['bond'],
                              'ptype': r.get('procurement_type') or t['ptype'], 'via': r.get('via') or ''})
                    if j < len(oid):
                        t['hid'].append(oid[j].lower())
                    base = slug_ascii(r.get('id') or '') or 'tender-%d' % i
                else:
                    t['src'] = 'real'
                    base = 'tender-%s' % (slug_ascii(t['ref']) or i)
                slug, k = base, 2
                while slug in tslugs:
                    slug = '%s-%d' % (base, k)
                    k += 1
                tslugs.add(slug)
                t['path'] = '/tender-item/%s/' % slug
                t['legacy'] = ''
                t['source'] = src
            tenders.append(t)
        for j, r in enumerate(real.get('tenders_intl', [])):
            if r is None:
                continue
            base = slug_ascii(r.get('ref') or '') or 'intl-%d' % (j + 1)
            slug, k = base, 2
            while slug in tslugs:
                slug = '%s-%d' % (base, k)
                k += 1
            tslugs.add(slug)
            tenders.append({'i': j, 'src': 'intl', 'ref': r.get('ref') or '', 'ptype': r.get('kind') or '', 'title': re.sub(r'\s+', ' ', r.get('title_ar') or '').strip(),
                            'title_en': r.get('title_en') or '', 'entity': r.get('entity_ar') or '', 'entity_en': r.get('entity_en') or '', 'gov': '',
                            'sector': r.get('sector_ar') or '', 'booklet': '', 'bond': '', 'deadline': r.get('closing_date') or '', 'publish': r.get('publish_date') or '',
                            'source': r.get('source_url') or '', 'source_name': r.get('source_name') or '', 'flags': 0, 'market': r.get('market') or '',
                            'country': r.get('country_ar') or '', 'country_en': r.get('country_en') or '', 'city': r.get('city') or '',
                            'value': r.get('estimated_value'), 'currency': r.get('currency') or '', 'path': '/tender-item/%s/' % slug, 'legacy': '', 'hid': ['in%d' % (j + 1)]})
        for t in tenders:
            if t['src'] == 'intl':
                t['cat'] = 'international'
            else:
                t['cat'] = S['cat_by_sector'].get(t['sector']) or S['cat_by_sector'].get(S['sec_by_slug'].get(norm_sector(t['sector']) or '', {}).get('ar', '')) or 'general-supplies'
            dl = pdate(t['deadline'])
            if not dl:
                t['status'] = 'undated'
            elif dl >= today:
                t['status'] = 'soon' if (dl - today).days <= 7 else 'open'
            else:
                t['status'] = 'closed'
            t['days_left'] = (dl - today).days if dl else None
        S['tenders'] = tenders
        pubs = [d for d in (full_date(t.get('publish')) for t in tenders) if d and d <= today.isoformat()]
        S['tenders_newest'] = max(pubs) if pubs else ''
        # --- RFQs
        rfqs = []
        for i, x in enumerate(D.get('rfq', [])):
            ls = legacy_slug(x[8])
            rfqs.append({'i': i, 'no': str(x[0] or ''), 'date': x[1] or '', 'title': re.sub(r'\s+', ' ', x[2] or '').strip(), 'details': scrub(x[3] or ''),
                         'delivery': scrub(x[4] or ''), 'qty': scrub(x[5] or ''), 'deadline': x[6] or '', 'gov': x[7] or '', 'sector': x[9] or '',
                         'details_en': scrub(x[10] or ''), 'flags': x[11] or 0, 'legacy': ls,
                         'path': ('/rfq/%s/' % ls) if ls else '/rfq/%s/' % slug_ascii(x[0])})
        S['rfqs'] = rfqs
        # --- news / events / awards
        news = []
        for i, n in enumerate(real.get('news', [])):
            if n is None:
                continue
            # procurement news («أخبار المشتريات») is for Premium members and up (owner's plan matrix 2026-11-18): it is shown in the app
            # (data/plan.js newsOK) and never published as a static /news/ page, hub entry or sitemap URL (0 such items on 2026-11-19)
            if str(n.get('category_ar') or '').strip() == 'أخبار المشتريات':
                continue
            d = n.get('date') or ''
            news.append(dict(n, i=i, path='/news/%s-%s/' % (d[:10] or 'undated', sha(n.get('url') or n.get('title_ar') or str(i), 6))))
        S['news'] = news
        events = []
        for i, e in enumerate(real.get('events', [])):
            if e is None:
                continue
            events.append(dict(e, i=i, path='/events/%s/' % (slug_ascii(e.get('id')) or 'event-%d' % i)))
        S['events'] = events
        awards = []
        aslugs = set()
        for i, a in enumerate(real.get('awards', [])):
            if a is None:
                continue
            seg = [s for s in urlparse(a.get('source_url') or '').path.split('/') if s]
            base = slug_ascii(seg[-1] if seg else '')
            base = re.sub(r'-?(html?|php|aspx?)$', '', base)
            if not re.search('[a-z]{3}', base) or len(base) < 8 or base.isdigit():
                base = '%s-%s' % ((a.get('date') or 'award')[:10], sha(a.get('title_ar') or str(i), 6))
            slug, k = base[:70].strip('-'), 2
            while slug in aslugs:
                slug = '%s-%d' % (base[:66], k)
                k += 1
            aslugs.add(slug)
            awards.append(dict(a, i=i, path='/awards/%s/' % slug))
        S['awards'] = awards
        # --- projects (MIG.PROJECTS_REAL only: real, sourced; never MIG.LEADS / sample data)
        projects = []
        for i, p in enumerate(D.get('projects_real', [])):
            projects.append({'i': i, 'id': p[0], 'name': p[1], 'gov_text': p[2], 'gov': S['gov_ar2code'].get(p[2]) or gov_of(p[2]), 'loc': p[3], 'sector': p[4],
                             'stage': p[5], 'value': p[6], 'owner': p[7], 'contractor': p[8], 'consultant': p[9], 'start': p[10], 'end': p[11],
                             'updates': p[14] or [], 'source': p[15] or '', 'img': p[16] or '', 'path': '/projects/%s/' % slug_ascii(p[0])})
        S['projects'] = projects
        S['stages'] = D.get('project_stages') or []
        # --- retail offers
        offers = []
        for i, o in enumerate(D.get('offers', [])):
            o = dict(o, i=i, path='/offers/%s/' % (slug_ascii(o.get('id')) or 'offer-%d' % i))
            # a leaflet without an end date is not «valid forever»: it counts as current for offer_default_days after it was checked
            vt = full_date(o.get('valid_to'))
            if vt:
                o['end'], o['end_assumed'] = vt, False
            else:
                base = max([d for d in (full_date(o.get('source_checked')), full_date(o.get('valid_from'))) if d] or [today.isoformat()])
                o['end'] = (pdate(base) + datetime.timedelta(days=int(cfg.get('offer_default_days', 14)))).isoformat()
                o['end_assumed'] = True
            o['current'] = o['end'] >= today.isoformat()
            offers.append(o)
        S['offers'] = offers
        chk = [d for d in (full_date(o.get('source_checked')) for o in offers) if d]
        S['offers_checked'] = max(chk) if chk else ''
        # --- export markets (exportmarket.part.py data; the typed-in demand numbers m[4]/m[8] are not used)
        exports = []
        em = D.get('export_markets') or {}
        for k in (em.get('KEYS') or []):
            m = em['M'].get(k)
            if not m:
                continue
            exports.append({'key': k, 'name': m[1], 'img': m[2], 'desc': m[3], 'ship_time': m[5], 'scope': m[6], 'cities': [c[1] for c in (m[7] or [])],
                            'reqs': m[9] or [], 'ship': m[10] or '', 'label': m[11] if len(m) > 11 else '', 'path': '/export/%s/' % k})
        S['exports'] = exports

    # ------------------------------------------------------------------ indexability (spec §1.3 table + §1.4 thresholds)
    def indexable(kind, rec, ctx=None):
        cfg = S['cfg']
        if kind == 'company':
            if rec['kind'] == 'public':
                ok = rec['words'] >= cfg['min_facx_words']
                return ok, ('public_desc_%dw' % rec['words']) + ('' if ok else '<%d' % cfg['min_facx_words'])
            if rec['dup_desc']:
                return False, 'duplicate_description'
            if rec['words'] >= cfg['min_company_words']:
                return True, 'desc_%dw' % rec['words']
            np_ = len(rec.get('prods') or []) or len(rec['names'])
            if rec['words'] >= cfg['min_company_words_with_products'] and np_ >= cfg['min_company_products']:
                return True, 'desc_%dw+%dproducts' % (rec['words'], np_)
            return False, 'thin_desc_%dw' % rec['words']
        if kind == 'product':
            # spec §1.3: «≥20 words or ≥1 image»; product_index_image / min_product_words_with_image let the owner tighten the image rule
            w = words(rec['desc'])
            if rec['img'] and cfg.get('product_index_image', True) and w >= int(cfg.get('min_product_words_with_image', 0) or 0):
                return True, 'image_%dw' % w
            return (w >= cfg['min_product_words']), 'desc_%dw' % w
        if kind == 'tender':
            st = rec['status']
            if st in ('open', 'soon'):
                return True, 'open'
            if st == 'closed':
                age = (S['today'] - pdate(rec['deadline'])).days
                if age <= cfg['tender_expired_index_days']:
                    return True, 'closed_%dd' % age
                return False, 'closed_%dd>%d' % (age, cfg['tender_expired_index_days'])
            return bool(cfg['tender_undated_index']), 'no_deadline_incomplete'
        if kind == 'news':
            w = words(rec.get('body_ar') or '')
            return (w >= cfg['news_index_min_words']), 'body_%dw' % w if w else 'summary_only'
        if kind in ('hub-sector', 'hub-sector-gov'):
            n = ctx
            return n >= cfg['min_hub_members'], 'members_%d' % n
        if kind == 'tender-cat':
            return ctx >= cfg['min_tender_cat'], 'tenders_%d' % ctx
        if kind == 'tender-entity':
            return ctx >= cfg['min_tender_entity'], 'tenders_%d' % ctx
        if kind == 'gov':
            return ctx >= cfg['min_gov_items'], 'items_%d' % ctx
        if kind == 'offer':
            return False, 'ephemeral_offer'
        return True, 'default'

    # ------------------------------------------------------------------ assets (shared CSS/JS, product images)
    def _host_or_file(name, path, rx):
        v = HOST.get(name)
        if isinstance(v, str) and v:
            return v
        try:
            m = re.search(rx, open(B + path, encoding='utf-8').read(), re.S)
            return m.group(1) if m else ''
        except Exception:
            return ''

    SEO_CSS = r'''
body{margin:0}
.sx-hero .sx-crumbs{color:rgba(255,255,255,.88)}
.skip{position:absolute;inset-inline-start:-9999px;top:8px;z-index:99;background:#fff;color:#000;padding:8px 12px;border-radius:8px}.skip:focus{inset-inline-start:12px}
.site-hdr .wrap{display:flex;align-items:center;gap:14px;padding-block:8px}
.site-nav{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.site-nav a{color:var(--fg);font-weight:700;border-radius:8px}
.site-nav a:hover{background:var(--green-soft);color:var(--green)}
.hdr-acts{display:flex;gap:8px;align-items:center;margin-inline-start:auto}
.site-hdr .site-nav > a.nav-in{display:none}
/* phones: «دخول» is a compact 👤 icon right after ☰ (like the app pages' header, data/mig-api.js .mig-in; its name stays in aria-label)
   and the last item of the open ☰ menu; up to 420px the bar's gaps, paddings and logo are a little tighter so it never wraps at 360px */
@media(max-width:560px){.site-hdr .hdr-acts .hdr-in{order:-1;display:inline-grid;place-items:center;flex:none;width:34px;height:34px;padding:0;gap:0;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font-size:0;line-height:0}
.site-hdr .hdr-acts .hdr-in::before{content:"\1F464";font-size:1rem;line-height:1}
.site-hdr .hdr-acts .hdr-in:hover{border-color:var(--green);background:var(--green-soft)}
.site-hdr .site-nav.open > a.nav-in{display:flex;color:var(--green)}}
@media(max-width:420px){.site-hdr .wrap{gap:8px}.site-hdr .hdr-acts{gap:6px}.site-hdr .brand img{height:42px}.site-hdr .menu-btn2{padding:8px 10px}.site-hdr .hdr-acts .btn-sm:not(.hdr-in){padding-inline:10px}}
.sx-hero{background:linear-gradient(135deg,var(--green-deep),#4A0510);color:#fff}
.sx-hero .wrap{padding-block:22px 26px;display:flex;flex-direction:column;gap:10px}
.sx-hero h1{font-size:clamp(1.45rem,3.4vw,2.2rem);font-weight:800}
.sx-hero .intro{max-width:56em;opacity:.95;line-height:1.9}
.sx-hero a{color:#fff;text-decoration:underline}
.sx-crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:2px 6px;margin:0;padding:0;font-size:.82rem;opacity:.9}
.sx-crumbs li+li::before{content:"›";margin-inline-end:6px;opacity:.75}
html[dir=ltr] .sx-crumbs li+li::before{content:"›"}
.sx-crumbs a{color:inherit;text-decoration:none}.sx-crumbs a:hover{text-decoration:underline}
.sx-chips{display:flex;flex-wrap:wrap;gap:6px}.sx-chips span{background:rgba(255,255,255,.14);border-radius:999px;padding:2px 12px;font-size:.82rem;font-weight:700}
.sx-main{padding-block:24px 48px;display:flex;flex-direction:column;gap:20px}
.sx-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}
.sx-grid>*{min-width:0;display:flex;flex-direction:column;gap:16px}
@media(max-width:900px){.sx-grid{grid-template-columns:1fr}}
.card2 p+p{margin-top:8px}
.sx-facts{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;margin:0;font-size:.92rem}.sx-facts dt{color:var(--muted)}.sx-facts dd{margin:0;font-weight:700;min-width:0;overflow-wrap:anywhere}
.dir-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.dir-list li{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:var(--surface);min-width:0}
.dir-list li>a{font-weight:800;line-height:1.5;overflow-wrap:anywhere}
.dir-list .m{display:block;color:var(--muted);font-size:.8rem}
.dir-list p{font-size:.84rem;margin-top:4px;color:var(--fg);line-height:1.7}
.dir-list .pub{display:inline-block;margin-top:4px;font-size:.72rem;font-weight:800;color:#8C6A00;background:var(--gold-soft);border-radius:999px;padding:0 8px}
.pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:6px}
.pager a,.pager span{min-width:40px;text-align:center;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.pager [aria-current]{background:var(--green);color:#fff;border-color:var(--green)}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:.85rem;background:var(--surface);color:var(--fg)}
.links a:hover{border-color:var(--green);color:var(--green)}.links small{color:var(--muted)}
.faq{display:flex;flex-direction:column;gap:8px}.faq details{border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:var(--surface)}
.faq summary{font-weight:800;cursor:pointer}.faq details p{margin-top:6px}
.cta{background:var(--gold-soft);border:1px solid var(--gold);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px}
.cta .btn{align-self:flex-start;white-space:normal}
.note{font-size:.8rem;color:var(--muted)}
.sx-expired{opacity:.55}.sx-expired a{text-decoration:line-through}
.banner-end{background:#FDECEC;color:#8E0B20;border-radius:12px;padding:10px 14px;font-weight:800}
.banner-info{background:var(--sunken);border-radius:12px;padding:10px 14px;font-weight:700}
.pubtag{background:var(--gold-soft);color:#6B5000;border:1px solid var(--gold);border-radius:12px;padding:8px 12px;font-weight:800;font-size:.9rem}
.vtag{background:#ECFDF3;color:#05603A;border:1px solid #6CE9A6;border-radius:12px;padding:8px 12px;font-weight:800;font-size:.9rem}
.dir-list .vf{display:inline-block;margin-top:4px;font-size:.72rem;font-weight:800;color:#05603A;background:#ECFDF3;border-radius:999px;padding:0 8px}
.pimg{width:160px;height:160px;border-radius:14px;border:1px solid var(--line);object-fit:cover;background:#fff}
.logo{width:96px;height:96px;border-radius:16px;border:3px solid #fff;background:#fff;object-fit:contain;flex:none}
.hrow{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.plist{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}
.plist li{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}
.plist a{display:flex;flex-direction:column;color:var(--fg)}.plist img{width:100%;height:auto;aspect-ratio:1;object-fit:cover;background:#fff}
.plist b{padding:8px 10px;font-size:.85rem;line-height:1.5}
.tlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.tlist li{border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:var(--surface)}
.tlist a{font-weight:800}.tlist .m{display:block;font-size:.8rem;color:var(--muted)}
.sx-st{display:inline-block;border-radius:999px;padding:0 10px;font-size:.75rem;font-weight:800}
.sx-st-open{background:#E6F4EA;color:#1E6B34}.sx-st-soon{background:#FFF4E0;color:#A86400}.sx-st-closed{background:#FDECEC;color:#B42318}.sx-st-undated{background:var(--sunken);color:var(--muted)}
.sx-tbl{width:100%;border-collapse:collapse;font-size:.9rem}.sx-tbl th,.sx-tbl td{border-bottom:1px solid var(--line);padding:8px;text-align:start;vertical-align:top}
.cols2{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 18px}.cols2 a{display:block;padding:3px 0}
.lang-banner{display:block;text-align:center;background:var(--gold);color:#1A1204;font-weight:800;padding:6px}
.ask-btn{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom,0px));inset-inline-end:18px;z-index:45;border:0;border-radius:999px;background:var(--green);color:#fff;font-weight:800;padding:10px 16px;box-shadow:0 10px 24px -8px rgba(0,0,0,.4);cursor:pointer}
@media(max-width:600px){.sx-hero .wrap{padding-block:18px 20px}.sx-facts{grid-template-columns:1fr}.sx-facts dt{margin-top:4px}}
html.mig-app .sx-share[data-mig-app-only][hidden]{display:inline-flex!important}.sx-share{align-self:flex-start;align-items:center;gap:6px;min-height:40px;border:1px solid rgba(255,255,255,.55);border-radius:999px;background:rgba(255,255,255,.14);color:inherit;font:inherit;font-weight:800;font-size:.88rem;padding:6px 16px;cursor:pointer;margin-top:4px}
'''

    SEO_JS = r'''(function(){var d=document,h=d.documentElement;
try{var th=localStorage.getItem("mig-theme");if(th)h.setAttribute("data-theme",th);}catch(e){}
/* the phone menu (up to 1240px, site.py SHARED_CSS): it scrolls inside the screen below the header (--nav-top) while the page behind it stays locked (html.nav-open); each section opens from its title (accordion, the same rules as site.py SHARED_JS); a chosen link or Esc closes it */
var b=d.getElementById("menuBtn2"),n=d.getElementById("siteNav");if(b&&n){var nmq=window.matchMedia?matchMedia("(max-width: 1240px)"):null,narrow=function(){return nmq?nmq.matches:innerWidth<=1240;},
fit=function(){if(n.classList.contains("open"))n.style.setProperty("--nav-top",Math.max(0,Math.round(n.getBoundingClientRect().top))+"px");},
nset=function(o){n.classList.toggle("open",o);b.setAttribute("aria-expanded",o?"true":"false");b.textContent=o?"✕":"☰";h.classList.toggle("nav-open",o&&narrow());if(o){n.scrollTop=0;fit();if(narrow())[].forEach.call(n.querySelectorAll(".dd > a"),function(t){t.setAttribute("aria-expanded",t.parentNode.classList.contains("open")?"true":"false");});}};
b.addEventListener("click",function(){nset(!n.classList.contains("open"));});
n.addEventListener("click",function(e){var a=e.target.closest?e.target.closest("a"):null;if(!a||!n.classList.contains("open")||!narrow())return;
var p=a.parentNode,m=p&&p.classList&&p.classList.contains("dd")?p.querySelector(".menu"):null;if(!m){nset(false);return;}
e.preventDefault();var x=!p.classList.contains("open");p.classList.toggle("open",x);a.setAttribute("aria-expanded",x?"true":"false");
if(x){var nr=n.getBoundingClientRect(),mr=m.getBoundingClientRect();if(mr.bottom>nr.bottom)n.scrollTop+=Math.min(mr.bottom-nr.bottom+8,a.getBoundingClientRect().top-nr.top);}});
d.addEventListener("keydown",function(e){if(e.key==="Escape"&&n.classList.contains("open")){nset(false);try{b.focus();}catch(x){}}});
addEventListener("resize",function(){if(n.classList.contains("open")){h.classList.toggle("nav-open",narrow());fit();}});}
d.addEventListener("click",function(e){var a=e.target.closest?e.target.closest("a[data-lang]"):null;if(a)try{localStorage.setItem("mig-lang",a.getAttribute("data-lang"));}catch(x){}
var r=e.target.closest?e.target.closest("a[data-rfq]"):null;if(r)try{sessionStorage.setItem("mig-rfq-to",r.getAttribute("data-rfq"));}catch(x){}});
try{var alt=d.querySelector('link[rel="alternate"][hreflang="en"]');if(h.lang==="ar"&&alt&&localStorage.getItem("mig-lang")==="en"){var bn=d.createElement("a");bn.href=alt.getAttribute("href");bn.className="lang-banner";bn.setAttribute("data-lang","en");bn.setAttribute("lang","en");bn.textContent="English version of this page →";d.body.insertBefore(bn,d.body.firstChild);}}catch(e){}
/* statuses computed at build time are re-checked against today's date in Cairo (the site is rebuilt daily, not every minute) */
try{var td;try{td=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}catch(x){}
if(!/^\d{4}-\d{2}-\d{2}$/.test(td||"")){var nw=new Date();td=nw.getFullYear()+"-"+("0"+(nw.getMonth()+1)).slice(-2)+"-"+("0"+nw.getDate()).slice(-2);}
var EN=h.lang==="en",each=function(s,f){[].forEach.call(d.querySelectorAll(s),f);};
each("[data-deadline]",function(el){var dl=el.getAttribute("data-deadline"),k=Math.round((Date.parse(dl)-Date.parse(td))/864e5);if(isNaN(k))return;
if(k<0){el.className="sx-st sx-st-closed";el.textContent=EN?"Closed":"منتهية";}else if(k<=7&&/sx-st-open/.test(el.className)){el.className="sx-st sx-st-soon";el.textContent=EN?"Closing soon":"تنتهي قريباً";}});
each("[data-show-after]",function(el){if(td>el.getAttribute("data-show-after"))el.hidden=false;});
each("[data-after]",function(el){if(td>el.getAttribute("data-after"))el.textContent=el.getAttribute("data-after-text")||el.textContent;});
each("[data-valid-to]",function(el){if(td>el.getAttribute("data-valid-to")){el.classList.add("sx-expired");var v=el.querySelector(".sx-vt");if(v)v.textContent=EN?" · ended":" · انتهى العرض";}});}catch(e){}
/* "Ask Janna": the assistants load on demand. They take their language from MIGLANG, which data/i18n.js sets from ?lang=en or
   the remembered choice; an /en/ page is English already, so it sets MIGLANG itself and remembers the choice (as ?lang=en
   does) and skips data/i18n.js: no page translator and no 7.7 MB dictionary on a static page (SEO spec 1.6) */
/* «🔗 شارك الصفحة» — inside the platform's own app only (no address bar there; [data-mig-app-only], pwa_head): the phone's share sheet
   (navigator.share — data/pwa.js gives Android's WebView the app's own), else the link is copied */
d.addEventListener("click",function(e){var sb=e.target.closest?e.target.closest("[data-mig-share]"):null;if(!sb)return;var u=location.href.split("#")[0],t=d.title,en=h.lang==="en";
var ok=function(){sb.textContent=en?"✓ Link copied":"✓ اتنسخ الرابط";};
if(navigator.share){try{var sp=navigator.share({title:t,url:u});if(sp&&sp.then)sp.then(null,function(){});}catch(x){}return;}
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(ok,function(){});});
var ask=d.getElementById("seoAsk");if(ask){var go=function(){if(ask.dataset.done)return;ask.dataset.done="1";ask.disabled=true;var l=(window.SEO_ASK_SRC||[]).slice(),i=0;
if(h.lang==="en"){window.MIGLANG="en";try{localStorage.setItem("mig-lang","en");}catch(x){}l=l.filter(function(s){return!/^\/data\/i18n\.js(\?|$)/.test(s);});}
(function nx(){if(i>=l.length){ask.hidden=true;return;}var s=d.createElement("script");s.src=l[i++];s.charset="utf-8";s.onload=s.onerror=nx;d.body.appendChild(s);})();};
ask.addEventListener("click",go);var idle=+ask.getAttribute("data-idle")||0;if(idle&&matchMedia("(min-width: 1024px)").matches&&window.requestIdleCallback)setTimeout(function(){requestIdleCallback(go);},idle);}
})();
'''

    # the design language of the interactive app pages (pages.part.py .phero / .fstats / .tools2 / .fc, regions.part.py governorate cards,
    # media2.part.py video cards), prefixed sx- so it never collides with the site.py classes the bundle also carries
    VIS_CSS = r'''
.sx-hero.ph{position:relative;overflow:hidden;isolation:isolate;background:#3a0712}
.sx-hero.ph .hbg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;opacity:.72;transform:scale(1.03);animation:sxkb 24s ease-in-out infinite alternate}
@keyframes sxkb{to{transform:scale(1.13) translate(-1.5%,1%)}}
.sx-hero.ph::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(270deg,rgba(36,3,9,.92) 0%,rgba(36,3,9,.72) 48%,rgba(36,3,9,.3) 100%)}
html[dir=ltr] .sx-hero.ph::before{background:linear-gradient(90deg,rgba(36,3,9,.92) 0%,rgba(36,3,9,.72) 48%,rgba(36,3,9,.3) 100%)}
.sx-hero.ph .wrap{padding-block:40px 46px;min-height:330px;justify-content:center}
.sx-hero.ph.sm .wrap{min-height:230px;padding-block:30px 36px}
.sx-hero.ph h1{font-size:clamp(1.55rem,4vw,2.6rem);line-height:1.35;text-shadow:0 2px 18px rgba(0,0,0,.35)}
.sx-hero.ph .intro{max-width:52em;font-size:.97rem;opacity:.93}
.sx-hero .sx-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.sx-hero .sx-acts a{text-decoration:none}.sx-hero a.btn-gold{color:#1A1204}
.btn-glass{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.32);color:#fff}.btn-glass:hover{background:rgba(255,255,255,.24)}
.sx-cred{position:absolute;bottom:6px;inset-inline-end:14px;max-width:70%;font-size:.66rem;line-height:1.4;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sx-hero .sx-cred a{color:inherit;text-decoration:none}
.sx-hero .logo{box-shadow:0 10px 28px -12px rgba(0,0,0,.6)}
.sx-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sx-stat{background:var(--surface);border:1px solid var(--line);border-inline-start:4px solid var(--green);border-radius:14px;padding:14px 16px;color:var(--fg);display:flex;flex-direction:column;gap:2px;box-shadow:0 12px 26px -22px rgba(0,0,0,.45);transition:transform .2s ease}
a.sx-stat:hover{transform:translateY(-3px);color:var(--fg)}
.sx-stat b{font-size:1.7rem;font-weight:800;color:var(--green);line-height:1.25}
.sx-stat span{font-size:.84rem;color:var(--muted);line-height:1.5}
.sx-search{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 14px 30px -26px rgba(0,0,0,.5)}
.sx-search input[type=search],.sx-search select{font:inherit;color:var(--fg);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:0}
.sx-search input[type=search]{flex:3 1 260px}.sx-search select{flex:1 1 170px}
.sx-search .vchk{display:flex;align-items:center;gap:6px;font-size:.86rem;color:var(--fg)}
.sx-search button{flex:0 0 auto}
.sx-sec{display:flex;flex-direction:column;gap:14px;min-width:0}
.sx-sh{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px}
.sx-sh h2{font-size:1.28rem;font-weight:800;display:flex;align-items:center;gap:10px;margin:0}
.sx-sh h2::before{content:"";width:5px;height:1.1em;border-radius:3px;background:var(--gold);flex:none}
.sx-sh .more{font-weight:800;color:var(--green);font-size:.9rem;white-space:nowrap}
.sx-sh p{flex-basis:100%;color:var(--muted);font-size:.88rem;margin:0;line-height:1.8}
.sx-dir .dir-list{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.sx-fc{position:relative;padding:0!important;border-radius:16px!important;overflow:hidden;display:flex;flex-direction:column;transition:transform .25s ease,box-shadow .25s ease}
.sx-fc:hover{transform:translateY(-4px);box-shadow:0 18px 34px -20px rgba(0,0,0,.45)}
.sx-fc .cv{position:relative;height:96px;background:var(--sunken)}
.sx-fc .cv>img{display:block;width:100%;height:100%;object-fit:cover}
.sx-fc .cv::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(40,4,10,.55),rgba(40,4,10,.05))}
.sx-fc .lg{position:absolute;z-index:1;bottom:-26px;inset-inline-start:14px;width:58px;height:58px;border-radius:14px;background:#fff;border:1px solid var(--line);display:grid;place-items:center;font-weight:800;font-size:1.25rem;color:var(--green);overflow:hidden;box-shadow:0 6px 16px -8px rgba(0,0,0,.4)}
.sx-fc .lg img{width:100%;height:100%;object-fit:contain}
.sx-fc .b{padding:34px 14px 14px;display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}
.sx-fc .b>a{font-weight:800;line-height:1.5;color:var(--fg);overflow-wrap:anywhere}
.sx-fc .b>a::after{content:"";position:absolute;inset:0;z-index:2}
.sx-fc:hover .b>a{color:var(--green)}
.sx-fc .m,.sx-fc .sc{display:block;font-size:.78rem;color:var(--muted)}
.sx-fc .sc::before{content:"🏷️ "}
.sx-fc p{font-size:.82rem;color:var(--muted);line-height:1.7;margin:0}
.sx-fc .pp{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.sx-fc .pp span{font-size:.72rem;border-radius:6px;padding:1px 8px;font-weight:700;background:var(--gold-soft);color:var(--gold-deep)}
.sx-fc .pp span::before{content:"📦 "}
.sx-fc .pp img{width:40px;height:40px;border-radius:8px;border:1px solid var(--line);object-fit:cover;background:#fff}
.sx-fc .ft{display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:8px}
.sx-fc .ft::after{content:"ملف المنشأة ←";font-size:.8rem;font-weight:800;color:var(--green)}
html[lang=en] .sx-fc .ft::after{content:"Company profile →"}
.sx-fc .vf,.sx-fc .pub,.sx-fc .mem{margin:0}
.dir-list .mem{display:inline-block;font-size:.72rem;font-weight:800;color:var(--muted);background:var(--sunken);border-radius:999px;padding:0 8px}
.sx-tiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:12px}
.sx-tiles.lg{grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.sx-tiles li{position:relative;min-width:0}
.sx-tiles a{position:relative;display:flex;align-items:flex-end;aspect-ratio:16/10;border-radius:14px;overflow:hidden;isolation:isolate;color:#fff;background:#3a0712;text-decoration:none;box-shadow:0 12px 26px -20px rgba(0,0,0,.55)}
.sx-tiles img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;transition:transform .6s ease}
.sx-tiles a::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,rgba(28,3,8,.92) 0%,rgba(28,3,8,.4) 55%,rgba(28,3,8,.06) 100%)}
.sx-tiles a:hover img{transform:scale(1.08)}
.sx-tiles .t{padding:10px 12px;font-weight:800;line-height:1.45;font-size:.95rem;min-width:0;overflow-wrap:anywhere}
.sx-tiles small{display:block;font-weight:700;opacity:.86;font-size:.76rem}
.sx-tiles .bd{position:absolute;z-index:2;top:8px;inset-inline-start:8px;pointer-events:none;background:rgba(255,255,255,.93);color:var(--green-deep);border-radius:8px;padding:1px 8px;font-size:.72rem;font-weight:800;letter-spacing:.02em}
.sx-gcards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.sx-gc{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;min-width:0;transition:transform .25s ease,box-shadow .25s ease}
.sx-gc:hover{transform:translateY(-4px);box-shadow:0 18px 34px -20px rgba(0,0,0,.45)}
.sx-gc .ph{position:relative;aspect-ratio:16/9;background:var(--sunken)}
.sx-gc .ph img{display:block;width:100%;height:100%;object-fit:cover}
.sx-gc .code{position:absolute;top:10px;inset-inline-start:10px;background:var(--green-deep);color:#fff;border-radius:8px;padding:2px 9px;font-size:.74rem;font-weight:800;letter-spacing:.05em}
.sx-gc .b{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
.sx-gc .b>a{font-weight:800;font-size:1.06rem;color:var(--fg)}.sx-gc .b>a::after{content:"";position:absolute;inset:0;z-index:2}
.sx-gc:hover .b>a{color:var(--green)}
.sx-gc p{font-size:.82rem;color:var(--muted);line-height:1.7;margin:0}
.sx-gc .ct{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.78rem;color:var(--muted);margin-top:auto;padding-top:6px}
.sx-gc .ct b{color:var(--green);font-weight:800}
.sx-gc .ft::after{content:"استكشف المحافظة ←";font-size:.84rem;font-weight:800;color:var(--green)}
html[lang=en] .sx-gc .ft::after{content:"Explore the governorate →"}
.sx-prod .plist,.sx-gal .plist{grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}
.sx-prod .plist li,.sx-gal .plist li{display:flex;flex-direction:column;box-shadow:0 12px 26px -22px rgba(0,0,0,.45);transition:transform .25s ease}
.sx-prod .plist li:hover,.sx-gal .plist li:hover{transform:translateY(-3px)}
.sx-prod .plist a,.sx-gal .plist a{flex:1}
.sx-prod .plist img,.sx-gal .plist img{object-fit:contain;padding:6px}
.sx-prod .plist b,.sx-gal .plist b{padding:8px 12px 4px}
.sx-prod .plist small{display:block;padding:0 12px 10px;font-size:.74rem;color:var(--muted);line-height:1.5}
.sx-noimg{display:grid;place-items:center;width:100%;aspect-ratio:1;background:linear-gradient(135deg,var(--green-soft),var(--gold-soft));color:var(--green);font-size:2rem;font-weight:800}
.sx-tg .tlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.sx-tg .tlist li{position:relative;display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:14px;border-inline-start:4px solid var(--green);box-shadow:0 12px 26px -22px rgba(0,0,0,.45);transition:transform .2s ease}
.sx-tg .tlist li:hover{transform:translateY(-3px)}
.sx-tg .tlist li.st-soon{border-inline-start-color:#E08A00}.sx-tg .tlist li.st-closed{border-inline-start-color:#B42318;opacity:.8}.sx-tg .tlist li.st-undated{border-inline-start-color:var(--line)}
.sx-tg .tp{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sx-dl{font-size:.75rem;font-weight:800;color:var(--muted)}.sx-dl::before{content:"⏳ "}
.sx-tg .tlist a{line-height:1.6}.sx-tg .tlist a::after{content:"";position:absolute;inset:0}
.sx-tg .ft{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
.sx-pjs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.sx-pj{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;min-width:0;transition:transform .25s ease,box-shadow .25s ease}
.sx-pj:hover{transform:translateY(-4px);box-shadow:0 18px 34px -20px rgba(0,0,0,.45)}
.sx-pj .top{position:relative;isolation:isolate;min-height:150px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;color:#fff;background:#3a0712}
.sx-pj .top img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.sx-pj .top::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(36,3,9,.25),rgba(36,3,9,.9))}
.sx-pj .top .chip{align-self:flex-start}
.sx-pj .top a{color:#fff;font-weight:800;line-height:1.5}.sx-pj .top a::after{content:"";position:absolute;inset:0;z-index:2}
.sx-pj .top small{opacity:.88;font-size:.78rem}
.sx-pj .b{padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px}
.sx-pj .vr{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.sx-pj .vr b{font-size:1.1rem;color:var(--green);font-weight:800}
.sx-bar{display:block;height:6px;border-radius:9px;background:var(--sunken);overflow:hidden}.sx-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--green))}
.sx-pj dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0;font-size:.8rem}.sx-pj dt{color:var(--muted)}.sx-pj dd{margin:0;font-weight:700;min-width:0;overflow-wrap:anywhere}
.sx-news,.sx-vids,.sx-evs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.sx-nc,.sx-vc,.sx-ec{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;min-width:0;transition:transform .25s ease,box-shadow .25s ease}
.sx-nc:hover,.sx-vc:hover,.sx-ec:hover{transform:translateY(-4px);box-shadow:0 18px 34px -20px rgba(0,0,0,.45)}
.sx-nc>img,.sx-nc>.sx-noimg{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;background:var(--sunken)}
.sx-nc .b,.sx-vc .b,.sx-ec .b{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.sx-nc .m,.sx-ec .m{font-size:.76rem;color:var(--muted)}
.sx-nc a{font-weight:800;line-height:1.6;color:var(--fg)}.sx-nc a::after{content:"";position:absolute;inset:0;z-index:2}
.sx-nc:hover a{color:var(--green)}
.sx-nc p{font-size:.82rem;color:var(--muted);line-height:1.75;margin:0}
.sx-nc.big{grid-column:span 2;flex-direction:row}.sx-nc.big>img{width:56%;aspect-ratio:auto;min-height:240px}.sx-nc.big .b{justify-content:center;padding:18px 20px}.sx-nc.big a{font-size:1.2rem}
.sx-vc .th{position:relative;display:block;aspect-ratio:16/9;background:#000}
.sx-vc .th img,.sx-vc .th iframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0}
.sx-vc .pl{position:absolute;top:50%;left:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 8px 24px rgba(0,0,0,.35);transition:transform .2s ease}
.sx-vc .pl::after{content:"";position:absolute;top:50%;left:50%;margin:-11px 0 0 -6px;border-style:solid;border-width:11px 0 11px 18px;border-color:transparent transparent transparent var(--green)}
.sx-vc .th:hover .pl{transform:scale(1.08)}
.sx-vc .du{position:absolute;bottom:8px;inset-inline-start:8px;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;padding:0 7px;font-size:.74rem;font-weight:700;direction:ltr}
.sx-vc .b b{font-size:.92rem;line-height:1.6}.sx-vc .b small{font-size:.76rem;color:var(--muted)}.sx-vc .chip{align-self:flex-start}
.sx-ec .ph{position:relative;aspect-ratio:16/9;background:#fff;border-bottom:1px solid var(--line)}
.sx-ec .ph img{display:block;width:100%;height:100%;object-fit:contain}.sx-ec .ph .sx-noimg{aspect-ratio:auto;height:100%}
.sx-ec .dt{position:absolute;top:10px;inset-inline-start:10px;display:flex;flex-direction:column;align-items:center;min-width:52px;background:var(--green);color:#fff;border-radius:10px;padding:4px 8px;font-size:.72rem;font-weight:700;line-height:1.3;box-shadow:0 6px 14px -6px rgba(0,0,0,.4)}
.sx-ec .dt b{font-size:1.2rem}
.sx-ec a{font-weight:800;line-height:1.55;color:var(--fg)}.sx-ec a::after{content:"";position:absolute;inset:0;z-index:2}
.sx-oc .tlist,.sx-aw .tlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.sx-oc .tlist li{position:relative;display:flex;flex-direction:column;gap:6px;padding:0;overflow:hidden;border-radius:14px}
.sx-oc .ph{position:relative;aspect-ratio:4/3;background:#fff;border-bottom:1px solid var(--line)}.sx-oc .ph img{display:block;width:100%;height:100%;object-fit:contain}
.sx-oc .disc{position:absolute;top:8px;inset-inline-start:8px;background:#B42318;color:#fff;border-radius:8px;padding:1px 8px;font-size:.74rem;font-weight:800;direction:ltr}
.sx-oc .tlist li>a,.sx-oc .tlist li>.m,.sx-oc .tlist li>s,.sx-oc .tlist li>small{margin-inline:14px}
.sx-oc .tlist li>a::after{content:"";position:absolute;inset:0}
.sx-oc .tlist li>small{margin-bottom:12px;color:var(--muted);font-size:.74rem}
.sx-oc .m{color:var(--green)!important;font-weight:800;font-size:.95rem!important}.sx-oc s{color:var(--muted);font-size:.8rem}
.sx-aw .tlist li{position:relative;padding:14px 16px 14px;border-inline-start:4px solid var(--gold)}
.sx-aw .tlist li::before{content:"🏆";font-size:1.4rem;line-height:1}
.sx-aw .tlist a::after{content:"";position:absolute;inset:0}
.sx-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;counter-reset:st}
.sx-steps li{position:relative;background:var(--sunken);border-radius:14px;padding:44px 14px 14px;counter-increment:st;line-height:1.7}
.sx-steps li::before{content:counter(st);position:absolute;top:10px;inset-inline-start:14px;width:28px;height:28px;border-radius:50%;background:var(--green);color:#fff;display:grid;place-items:center;font-weight:800}
.sx-grid .sx-dir .dir-list,.sx-grid .sx-dir .dir-list{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.sx-band{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:2px;background:var(--green-deep);border-radius:16px;overflow:hidden;color:#fff}
.sx-band div{padding:14px 16px;background:rgba(255,255,255,.04)}.sx-band b{display:block;font-size:1.15rem;font-weight:800}.sx-band span{font-size:.78rem;opacity:.85}
@media(max-width:1100px){.sx-dir .dir-list,.sx-gcards{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){.sx-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sx-dir .dir-list,.sx-gcards{grid-template-columns:repeat(2,minmax(0,1fr))}.sx-nc.big{grid-column:auto;flex-direction:column}.sx-nc.big>img{width:100%;aspect-ratio:16/9;min-height:0}}
@media(max-width:700px){.sx-hero.ph::before{background:linear-gradient(0deg,rgba(36,3,9,.96),rgba(36,3,9,.72))}html[dir=ltr] .sx-hero.ph::before{background:linear-gradient(0deg,rgba(36,3,9,.96),rgba(36,3,9,.72))}.sx-hero.ph .wrap,.sx-hero.ph.sm .wrap{min-height:0;padding-block:24px 30px}.sx-cred{max-width:92%}}
@media(max-width:560px){.sx-dir .dir-list,.sx-gcards{grid-template-columns:minmax(0,1fr)}.sx-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sx-tiles .t{font-size:.84rem;padding:8px 10px}.sx-stat b{font-size:1.4rem}.sx-search{padding:10px}.sx-search button{flex:1 1 100%}}
@media(prefers-reduced-motion:reduce){.sx-hero.ph .hbg{animation:none}.sx-tiles a:hover img{transform:none}}
'''

    VIS_JS = r'''(function(){var d=document,h=d.documentElement,EN=h.lang==="en";
/* hero search bars: the interactive lists read the query from sessionStorage (mig-q, mig-city) and the directory from #q= / #verified */
[].forEach.call(d.querySelectorAll("form.sx-search"),function(f){f.addEventListener("submit",function(e){var q=f.elements.q?String(f.elements.q.value||"").trim():"",c=f.elements.city?f.elements.city.value:"",v=f.elements.verified&&f.elements.verified.checked;
try{if(q)sessionStorage.setItem("mig-q",q);else sessionStorage.removeItem("mig-q");if(c)sessionStorage.setItem("mig-city",c);}catch(x){}
var qs=[];if(q)qs.push("q="+encodeURIComponent(q));if(EN)qs.push("lang=en");var u=f.getAttribute("action")+(qs.length?"?"+qs.join("&"):"");if(v)u+="#verified";else if(q&&f.getAttribute("data-hq"))u+="#q="+encodeURIComponent(q);e.preventDefault();location.href=u;});});
/* videos: the thumbnail is a link to YouTube; a click plays the video in place (youtube-nocookie, loaded only on demand) */
d.addEventListener("click",function(e){var a=e.target.closest?e.target.closest("a[data-yt]"):null;if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.button)return;var id=a.getAttribute("data-yt");if(!/^[A-Za-z0-9_-]{11}$/.test(id))return;e.preventDefault();
var f=d.createElement("iframe");f.src="https://www.youtube-nocookie.com/embed/"+id+"?autoplay=1&rel=0";f.title=a.getAttribute("aria-label")||"YouTube";f.setAttribute("allow","autoplay; encrypted-media; picture-in-picture; fullscreen");f.setAttribute("allowfullscreen","");f.loading="lazy";
var w=d.createElement("span");w.className="th";w.appendChild(f);a.parentNode.replaceChild(w,a);});
/* «باقي N يوماً»: days left until a tender closes, recomputed from today's date in Cairo (the page is rebuilt daily) */
try{var td;try{td=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}catch(x){}
if(!/^\d{4}-\d{2}-\d{2}$/.test(td||"")){var nw=new Date();td=nw.getFullYear()+"-"+("0"+(nw.getMonth()+1)).slice(-2)+"-"+("0"+nw.getDate()).slice(-2);}
var AR=function(n){var m=n%100;return n===1?"يوم واحد":n===2?"يومان":(m>=3&&m<=10?n+" أيام":n.toLocaleString("en-US")+" يوماً");};
[].forEach.call(d.querySelectorAll("[data-dl]"),function(el){var k=Math.round((Date.parse(el.getAttribute("data-dl"))-Date.parse(td))/864e5);if(isNaN(k))return;
if(k<0){el.textContent="";el.hidden=true;}else if(k===0)el.textContent=EN?"Last day":"آخر يوم للتقديم";else el.textContent=EN?k+(k===1?" day left":" days left"):"باقي "+AR(k);});}catch(e){}
})();
'''

    # the governorate pages as madeinsaudigate region.html (the app's /governorates/explore/ .rgbar / .rkpi / .rtabs): the strip of the
    # 27 governorates under the hero, five KPI cards and the tabs over the sections — prefixed sx-, sizes as the app page
    GOV_CSS = r'''
.sx-rgbar{position:sticky;top:calc(env(safe-area-inset-top,0px) + var(--sx-hh,0px));z-index:25;background:var(--surface);border-bottom:1px solid var(--line);box-shadow:0 10px 20px -18px rgba(0,0,0,.35)}
.sx-rgbar ul{list-style:none;margin:0;padding:8px 2px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.sx-rgbar li{flex:none}
.sx-rgbar a{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font-size:.84rem;font-weight:700;line-height:1.5;white-space:nowrap;text-decoration:none;transition:background .2s ease,color .2s ease,border-color .2s ease}
.sx-rgbar a small{font-size:.66rem;color:var(--muted);font-weight:700;letter-spacing:.04em}
.sx-rgbar a:hover{border-color:var(--green);color:var(--green)}
.sx-rgbar a.on{background:var(--green);border-color:var(--green);color:#fff}.sx-rgbar a.on small{color:rgba(255,255,255,.75)}
.sx-rgbar a:focus-visible{outline:2px solid var(--green);outline-offset:1px}
.sx-stats.sx-k5{grid-template-columns:repeat(5,minmax(0,1fr))}
.sx-stat.on{background:var(--green-soft)}
.sx-tabbox{gap:16px}
.sx-tabbox,.sx-tabbox [id],.sx-rgbar~.sx-main>[id]{scroll-margin-top:calc(env(safe-area-inset-top,0px) + var(--sx-hh,0px) + 72px)}
.sx-tabbox.on>.sx-tp{scroll-margin-top:calc(env(safe-area-inset-top,0px) + var(--sx-hh,0px) + 72px + var(--sx-tpo,0px))}
.sx-tabs{display:flex;gap:6px;flex-wrap:wrap}
.sx-tabs a{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:7px 14px;font-weight:700;font-size:.88rem;line-height:1.5;color:var(--fg);text-decoration:none}
.sx-tabs a:hover{border-color:var(--green);color:var(--green)}
.sx-tabs a[aria-selected=true]{background:var(--green-deep);border-color:var(--green-deep);color:#fff}
.sx-tabs a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.sx-tp{display:flex;flex-direction:column;gap:14px;min-width:0}
.sx-tp[hidden]{display:none!important}
.sx-tabbox:not(.on) .sx-tp+.sx-tp{border-top:1px dashed var(--line);padding-top:18px}
.sx-more{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.sx-empty{background:var(--sunken);border:1px dashed var(--line);border-radius:14px;padding:22px;text-align:center;color:var(--muted);display:flex;flex-direction:column;gap:10px;align-items:center}
.sx-empty p{margin:0;line-height:1.8}
.sx-st-rfq{background:var(--gold-soft);color:var(--gold-deep)}.sx-tg .tlist li.st-rfq{border-inline-start-color:var(--gold)}
@media(max-width:1000px){.sx-stats.sx-k5{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:560px){.sx-tabbox{padding:14px}.sx-tp .sx-prod .plist{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}
@media(max-width:520px){.sx-stats.sx-k5{grid-template-columns:repeat(2,minmax(0,1fr))}.sx-tabs a{padding:6px 11px;font-size:.84rem}}
'''

    GOV_JS = r'''(function(){var d=document,h=d.documentElement;
/* governorate pages: the strip of the 27 governorates sticks right under the sticky header (--sx-hh = the header's height) and the
   page's own governorate is brought into view inside the strip — the strip scrolls, never the page. The web font (Cairo) mostly
   swaps in after 'load' (its stylesheet comes media=print, then onload) and changes the chips' widths, so the strip is centred
   again when the fonts are ready / done loading and on resize — until the visitor touches the strip (pointer, wheel, keys, focus) */
var hd=d.querySelector(".site-hdr"),hh=function(){if(hd&&!h.classList.contains("nav-open"))h.style.setProperty("--sx-hh",Math.round(hd.getBoundingClientRect().height)+"px");};
var fonts=function(f){try{var F=d.fonts;if(F){if(F.ready)F.ready.then(function(){f();});if(F.addEventListener)F.addEventListener("loadingdone",function(){f();});}}catch(e){}};
hh();addEventListener("resize",hh);addEventListener("load",hh);
[].forEach.call(d.querySelectorAll(".sx-rgbar ul"),function(sc){var on=sc.querySelector("a.on"),moved=false;if(!on)return;
var mid=function(){if(moved)return;var a=on.getBoundingClientRect(),b=sc.getBoundingClientRect();sc.scrollLeft+=(a.left+a.width/2)-(b.left+b.width/2);};
["pointerdown","touchstart","wheel","keydown","focusin"].forEach(function(t){sc.addEventListener(t,function(){moved=true;},{passive:true});});
mid();addEventListener("load",mid);addEventListener("resize",function(){mid();});fonts(mid);});
/* tabs: every panel is in the HTML and readable without JS (the tab row is then a list of in-page links). Here they become an ARIA
   tablist (roving tabindex; arrows, Home, End; right-to-left aware) and #tenders, #products … — or any id inside a panel, e.g. #list —
   opens its tab; the KPI cards (data-tab) open theirs and are marked with the open tab. The panels get no tabindex: each holds links,
   and a focusable panel would be focused (and outlined) by the browser on every #deep-link */
[].forEach.call(d.querySelectorAll("[data-sx-tabs]"),function(box){var list=box.querySelector(".sx-tabs");if(!list)return;
var tabs=[].slice.call(list.querySelectorAll("a[data-tab]")),panels=[],i,cur=-1;if(!tabs.length)return;
for(i=0;i<tabs.length;i++){var p=d.getElementById(tabs[i].getAttribute("data-tab"));if(!p)return;panels.push(p);}
var kpis=[].slice.call(d.querySelectorAll("a.sx-stat[data-tab]"));
list.setAttribute("role","tablist");
tabs.forEach(function(t,k){t.setAttribute("role","tab");t.setAttribute("aria-controls",panels[k].id);panels[k].setAttribute("role","tabpanel");panels[k].setAttribute("aria-labelledby",t.id);});
box.classList.add("on");
var show=function(k,focus){cur=k;tabs.forEach(function(t,j){var on=j===k;t.setAttribute("aria-selected",on?"true":"false");t.setAttribute("tabindex",on?"0":"-1");panels[j].hidden=!on;});
var id=panels[k].id;kpis.forEach(function(a){a.classList.toggle("on",a.getAttribute("data-tab")===id);});tpo(k);if(focus)tabs[k].focus();};
var tpo=function(k){try{box.style.setProperty("--sx-tpo",Math.max(0,Math.round(panels[k].getBoundingClientRect().top-box.getBoundingClientRect().top))+"px");}catch(e){}};
var owner=function(el){while(el&&el!==box){var k=panels.indexOf(el);if(k>-1)return k;el=el.parentNode;}return -1;};
var hid=function(s){s=String(s||"").replace(/^#/,"");try{return decodeURIComponent(s);}catch(e){return s;}};
var mark=function(id){try{history.replaceState(history.state,"",location.pathname+location.search+"#"+encodeURIComponent(id));}catch(e){}};
/* a deep link is scrolled to once more when the page has loaded (web fonts, images) unless the visitor has scrolled, clicked or typed */
var deep=null,user=false,jump=function(){if(deep)try{deep.scrollIntoView({block:"start"});}catch(e){}},again=function(){if(cur>-1)tpo(cur);if(!user)jump();};
["wheel","touchstart","mousedown","keydown"].forEach(function(t){addEventListener(t,function(){user=true;},{passive:true});});
addEventListener("load",again);fonts(again);
var go=function(id,scroll){var el=id?d.getElementById(id):null,k=el?owner(el):-1;if(k<0)return false;show(k);
if(scroll){deep=el===panels[k]?box:el;jump();}return true;};
if(!go(hid(location.hash),true)){var def=0;for(i=0;i<panels.length;i++)if(panels[i].hasAttribute("data-default")){def=i;break;}show(def);}
addEventListener("hashchange",function(){go(hid(location.hash),true);});
addEventListener("resize",function(){if(cur>-1)tpo(cur);});
list.addEventListener("click",function(e){var t=e.target;while(t&&t!==list&&tabs.indexOf(t)<0)t=t.parentNode;var k=tabs.indexOf(t);
if(k<0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;e.preventDefault();show(k);mark(panels[k].id);});
list.addEventListener("keydown",function(e){var k=tabs.indexOf(d.activeElement);if(k<0||e.altKey||e.ctrlKey||e.metaKey)return;var n=tabs.length,key=e.key,rtl=false,to=-1;
try{rtl=getComputedStyle(list).direction==="rtl";}catch(x){}
if(key==="ArrowRight"||key==="Right")to=rtl?k-1:k+1;else if(key==="ArrowLeft"||key==="Left")to=rtl?k+1:k-1;else if(key==="Home")to=0;else if(key==="End")to=n-1;
else if(key===" "||key==="Spacebar"||key==="Enter"){e.preventDefault();show(k);mark(panels[k].id);return;}else return;
e.preventDefault();to=(to+n)%n;show(to,true);mark(panels[to].id);});
d.addEventListener("click",function(e){if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button)return;var a=e.target;while(a&&a.nodeName!=="A")a=a.parentNode;
if(!a||!a.hash||a.pathname!==location.pathname||list.contains(a))return;var id=hid(a.hash);if(go(id,true)){e.preventDefault();mark(id);}});});
})();
'''

    def emit_assets(OUT):
        base = _host_or_file('BASE_CSS', 'factory-profile.html', r'<style>(.*?)</style>')
        shared = _host_or_file('SHARED_CSS', 'site.py', r"SHARED_CSS = '''(.*?)'''")
        common = _host_or_file('COMMON_CSS', 'pages.part.py', r"COMMON_CSS = '''(.*?)'''")
        css = base + '\n' + shared + '\n' + common + '\n' + SEO_CSS + VIS_CSS + GOV_CSS
        css += PPROF.get('css', '')   # PPROF hook: product-view CSS (seo_pprof.part.py)
        css += APPDL.get('css', '')   # APPDL hook: the app download page (seo_app.part.py)
        # same theme handling as site.py page(): dark mode only through the theme toggle (data-theme), never automatic
        css = css.replace('@media (prefers-color-scheme: dark)', '@media not all')
        fonts_local = [f for f in (os.listdir(OUT + 'fonts') if os.path.isdir(OUT + 'fonts') else []) if f.endswith('.woff2')]
        if S['cfg'].get('fonts') == 'self' and fonts_local:
            ff = ''.join("@font-face{font-family:Cairo;src:url(/fonts/%s) format('woff2');font-display:swap;font-weight:%s}" % (f, '800' if '800' in f else '700' if '700' in f else '400') for f in sorted(fonts_local))
            css = ff + css
        os.makedirs(OUT + 'assets', exist_ok=True)
        srcs = []
        for sname in S['cfg'].get('assistant', {}).get('scripts', []):
            f = B + sname
            if os.path.exists(f):
                srcs.append('/%s?v=%s' % (sname, hashlib.md5(open(f, 'rb').read()).hexdigest()[:8]))
        S['assistant_src'] = srcs
        js = 'window.SEO_ASK_SRC=%s;\n' % json.dumps(srcs) + SEO_JS + VIS_JS + GOV_JS + FTR_JS   # FTR_JS: the footer's partner strip (site_footer)
        js += PPROF.get('js', '')     # PPROF hook: product-page behaviour (seo_pprof.part.py)
        if FPROF:   # FPROF hook: the company-profile CSS / JS ride in the same bundle
            css, js = FPROF['assets'](css, js)
        h1 = sha(css, 10)
        h2 = sha(js, 10)
        for f in os.listdir(OUT + 'assets'):
            if re.match(r'seo-[0-9a-f]{10}\.(css|js)$', f) and f not in ('seo-%s.css' % h1, 'seo-%s.js' % h2):
                os.remove(OUT + 'assets/' + f)
        open(OUT + 'assets/seo-%s.css' % h1, 'w', encoding='utf-8').write(css)
        open(OUT + 'assets/seo-%s.js' % h2, 'w', encoding='utf-8').write(js)
        S['css_url'] = '/assets/seo-%s.css' % h1
        S['js_url'] = '/assets/seo-%s.js' % h2

    _PIL = {}

    def crop_cell(kind, sheet, cell):
        """one cell of a 10×10 sprite sheet (img/old/pr*.jpg, lg*.jpg) → /assets/img/<sha>.jpg (Pillow optional)"""
        key = (kind, sheet, cell)
        if key in S['crops']:
            return S['crops'][key]
        S['crops'][key] = None
        try:
            from PIL import Image
        except Exception:
            return None
        path = B + 'img/old/%s%d.jpg' % ('pr' if kind == 'p' else 'lg', sheet)
        if not os.path.exists(path):
            return None
        im = _PIL.get(path)
        if im is None:
            im = _PIL[path] = Image.open(path).convert('RGB')
        w, h = im.size
        cw, ch = w // 10, h // 10
        c = int(cell)
        box = ((c % 10) * cw, (c // 10) * ch, (c % 10 + 1) * cw, (c // 10 + 1) * ch)
        part = im.crop(box)
        if kind == 'p':
            # the old site's grey «Made in Egypt» box (no product photo was uploaded): the product page keeps it as before, the visual
            # cards show a styled tile instead (prod_img); found by its look (flat light grey) since the copies differ by JPEG noise
            try:
                from PIL import ImageStat
                st = ImageStat.Stat(part)
                mean, sd = sum(st.mean) / 3.0, sum(st.stddev) / 3.0
                raw = part.resize((40, 40)).tobytes()
                grey = sum(1 for i in range(0, len(raw), 3) if abs(raw[i] - raw[i + 1]) < 12 and abs(raw[i + 1] - raw[i + 2]) < 12 and 170 < raw[i] < 235) / 1600.0
                S.setdefault('crop_ph', {})[key] = bool(215 <= mean <= 235 and sd <= 32 and grey >= 0.5)
            except Exception:
                pass
        buf = io.BytesIO()
        part.save(buf, 'JPEG', quality=84, optimize=True)
        data = buf.getvalue()
        name = sha(data, 14) + '.jpg'
        os.makedirs(S['OUT'] + 'assets/img', exist_ok=True)
        fp = S['OUT'] + 'assets/img/' + name
        if not os.path.exists(fp):
            open(fp, 'wb').write(data)
        S['crops'][key] = ('/assets/img/' + name, cw, ch)
        return S['crops'][key]

    # ------------------------------------------------------------------ visual layer (photo heroes, stat cards, search bar, card grids)
    # The section pages look like the interactive app pages (site.py: factories, market, projects, governorates): a photo hero, stat
    # cards with counts computed from the data, a search bar that opens the interactive list, and card grids with photos. Every picture
    # comes from the project itself (owner rule: real data only): img/ind (Wikimedia Commons photos of Egyptian industry and
    # infrastructure, credits in img/ind/map.json), img/gov (governorate photos, sources in data/regions.js), the sector covers of the
    # interactive directory (img/e*.jpg, img/m*.jpg), the members' logos and product photos (img/old sprite sheets), the news / event /
    # offer photos named in the data and the YouTube thumbnails of data/videos.js (img/yt). A photo that stands for a sector is labelled
    # «صورة توضيحية» and is never shown as a given company's own factory. All the SEO text, links and JSON-LD stay as they were: the
    # cards carry the same anchors and texts as the former lists (company_li, tender_li …) plus pictures.
    VIS_HUB_IMG = {'dir': 'img/ind/sadat-ezz-steel.jpg', 'govs': 'img/gov/gv-GIZ.jpg', 'zones': 'img/ind/sokhna-industrial-zone.jpg',
                   'free-zones': 'img/ind/alex-free-zone.jpg', 'products': 'img/ind/alexandria-port.jpg', 'tenders': 'img/ind/nac-power-plant.jpg',
                   'rfq': 'img/ind/borg-farag-allah-2.jpg', 'awards': 'img/ind/dabaa-construction.jpg', 'events': 'img/e3.jpg', 'projects': 'img/ind/prj-wind.jpg',
                   'offers': 'img/m2.jpg', 'exports': 'img/ind/dekheila-port.jpg', 'home': 'img/hero.jpg', 'intl': 'img/ind/dekheila-port.jpg'}
    # sector → generic illustrative photo (company cards and company headers: never a photo of another, identifiable company's plant)
    VIS_SEC_COVER = {'food': 'img/m2.jpg', 'agriculture': 'img/ind/prj-agri.jpg', 'feed-fertilizers': 'img/ind/prj-agri-2.jpg', 'chemicals': 'img/e1.jpg',
                     'oil-gas': 'img/ind/prj-petro.jpg', 'detergents': 'img/e1.jpg', 'paints-inks': 'img/e1.jpg', 'pharma': 'img/e1.jpg', 'medical-equipment': 'img/m0.jpg',
                     'plastics': 'img/m3.jpg', 'packaging': 'img/m3.jpg', 'printing': 'img/m3.jpg', 'steel-metals': 'img/ind/machine-workshop.jpg',
                     'mining': 'img/ind/phosphate-mine.jpg', 'building-materials': 'img/ind/prj-housing-2.jpg', 'marble-granite': 'img/ind/phosphate-mine.jpg', 'glass-ceramics': 'img/m0.jpg',
                     'contracting': 'img/ind/ccpp-construction.jpg', 'electrical': 'img/m4.jpg', 'home-appliances': 'img/e2.jpg', 'it-office': 'img/e3.jpg',
                     'safety-fire': 'img/ind/ccpp-piping.jpg', 'machinery': 'img/ind/machine-workshop.jpg', 'tools-instruments': 'img/m0.jpg', 'pumps-compressors': 'img/ind/ccpp-piping.jpg',
                     'spare-parts': 'img/e0.jpg', 'heavy-equipment': 'img/ind/port-tawfik-shipyard.jpg', 'hvac': 'img/e2.jpg', 'water-treatment': 'img/v5.jpg',
                     'automotive': 'img/e0.jpg', 'textiles': 'img/m3.jpg', 'furniture': 'img/m3.jpg', 'hotel-equipment': 'img/e4.jpg', 'sports-goods': 'img/e4.jpg',
                     'consulting': 'img/e3.jpg', 'insurance-finance': 'img/m1.jpg', 'transport-shipping': 'img/ind/prj-port.jpg', 'general-supplies': 'img/m3.jpg'}
    # sector hubs and sector tiles: a photo of the sector in Egypt where the project has one (Wikimedia Commons, credited on the hero)
    VIS_SEC_IMG = dict(VIS_SEC_COVER, **{'food': 'img/ind/armant-sugar-plant.jpg', 'steel-metals': 'img/ind/sadat-ezz-steel.jpg', 'building-materials': 'img/ind/ncc-cement-benisuef.jpg',
                                        'oil-gas': 'img/ind/damietta-lng.jpg', 'transport-shipping': 'img/ind/dekheila-port.jpg', 'it-office': 'img/ind/smart-village.jpg',
                                        'heavy-equipment': 'img/ind/dabaa-reactor-transport.jpg', 'electrical': 'img/ind/prj-power-2.jpg', 'chemicals': 'img/ind/sadat-prima.jpg',
                                        'contracting': 'img/ind/prj-housing.jpg', 'marble-granite': 'img/ind/prj-mining-2.jpg', 'general-supplies': 'img/ind/alexandria-port.jpg'})
    # sectors whose tile shows the members' own product photos (a 2×2 mosaic) instead of a stock photo, when 4 photos exist
    VIS_SEC_MOSAIC = ('plastics', 'furniture', 'packaging', 'printing', 'textiles', 'pharma', 'detergents', 'paints-inks', 'home-appliances', 'hvac', 'spare-parts',
                      'tools-instruments', 'glass-ceramics', 'medical-equipment', 'automotive', 'hotel-equipment', 'sports-goods')
    # what a photo shows (alt text); photos that are not of a known place in Egypt are only «صورة توضيحية» (illustrative)
    VIS_PHOTO_DESC = {
        'img/ind/adabiya-port.jpg': ('ميناء الأدبية', 'Adabiya Port'), 'img/ind/alex-free-zone.jpg': ('المنطقة الحرة العامة بالإسكندرية', 'Alexandria Public Free Zone'),
        'img/ind/alex-free-zone-2.jpg': ('المنطقة الحرة العامة بالإسكندرية', 'Alexandria Public Free Zone'), 'img/ind/alexandria-port.jpg': ('ميناء الإسكندرية', 'Alexandria Port'),
        'img/ind/prj-port.jpg': ('ميناء الإسكندرية', 'Alexandria Port'), 'img/ind/arish-port.jpg': ('ميناء العريش', 'El-Arish Port'),
        'img/ind/armant-sugar-plant.jpg': ('مصنع سكر في مصر', 'A sugar plant in Egypt'), 'img/ind/aswan-efaco-ferroalloys.jpg': ('مصنع إيفاكو للسبائك الحديدية بأسوان', 'EFACO ferroalloys plant, Aswan'),
        'img/ind/borg-farag-allah-1.jpg': ('مصنع فرج الله ببرج العرب الجديدة', 'Farag Allah factory, New Borg El Arab'), 'img/ind/borg-farag-allah-2.jpg': ('مصنع فرج الله ببرج العرب الجديدة', 'Farag Allah factory, New Borg El Arab'),
        'img/ind/borg-tech-park.jpg': ('الحديقة التكنولوجية ببرج العرب الجديدة', 'New Borg El Arab Technology Park'),
        'img/ind/dabaa-construction.jpg': ('موقع إنشاء محطة الضبعة النووية', 'El Dabaa nuclear power plant construction site'),
        'img/ind/dabaa-reactor-transport.jpg': ('نقل معدات محطة الضبعة النووية', 'Transport of El Dabaa nuclear plant equipment'),
        'img/ind/damietta-lng.jpg': ('دمياط', 'Damietta'), 'img/ind/prj-petro.jpg': ('دمياط', 'Damietta'),
        'img/ind/dekheila-port.jpg': ('ميناء الدخيلة بالإسكندرية', 'The port of Dekheila, Alexandria'),
        'img/ind/mog-factory.jpg': ('مصنع موج للصناعات المتطورة', 'MOG For Developed Industries factory'),
        'img/ind/nac-power-plant.jpg': ('محطة كهرباء العاصمة الإدارية الجديدة', 'New Administrative Capital power plant'), 'img/ind/prj-power.jpg': ('محطة كهرباء العاصمة الإدارية الجديدة', 'New Administrative Capital power plant'),
        'img/ind/ncc-cement-benisuef.jpg': ('مصنع لإنتاج الأسمنت', 'A cement production plant'), 'img/ind/prj-cement.jpg': ('مصنع لإنتاج الأسمنت', 'A cement production plant'),
        'img/ind/port-tawfik-shipyard.jpg': ('ترسانة بور توفيق بالسويس', 'Port Tawfik shipyard, Suez'), 'img/ind/prj-agri.jpg': ('الري في الصحراء المصرية', 'Irrigation in the Egyptian desert'),
        'img/ind/prj-airport.jpg': ('مطار سفنكس الدولي', 'Sphinx International Airport'), 'img/ind/prj-airport-2.jpg': ('مبنى الركاب 3 بمطار القاهرة', 'Cairo Airport Terminal 3'),
        'img/ind/prj-housing.jpg': ('مدينة برج العرب الجديدة', 'New Borg El Arab City'), 'img/ind/prj-housing-2.jpg': ('مدينة برج العرب الجديدة', 'New Borg El Arab City'),
        'img/ind/prj-power-2.jpg': ('محطة كهرباء السد العالي بأسوان', 'Aswan Dam power plant'), 'img/ind/prj-rail-2.jpg': ('قطار السكك الحديدية المصرية', 'An Egyptian National Railways train'),
        'img/ind/prj-rail.jpg': ('إنشاء كوبري سكة حديد في قنا', 'Railway bridge construction in Qena'), 'img/ind/prj-road-2.jpg': ('إنشاء كوبري سكة حديد في قنا', 'Railway bridge construction in Qena'),
        'img/ind/prj-tunnel.jpg': ('نفق أحمد حمدي', 'Ahmed Hamdi Tunnel'), 'img/ind/prj-wind.jpg': ('توربينات الرياح بالزعفرانة', 'Wind turbines at Zafarana'),
        'img/ind/prj-wind-2.jpg': ('توربينات الرياح بالزعفرانة', 'Wind turbines at Zafarana'), 'img/ind/sadat-ezz-steel.jpg': ('مصنع حديد عز بمدينة السادات', 'Ezz Steel plant, Sadat City'),
        'img/ind/sadat-prima.jpg': ('مصنع بمدينة السادات', 'A factory in Sadat City'), 'img/ind/smart-village.jpg': ('القرية الذكية', 'Smart Village'),
        'img/ind/smart-village-2.jpg': ('مبنى في القرية الذكية', 'A building in Smart Village'), 'img/ind/sokhna-industrial-zone.jpg': ('المنطقة الصناعية بالعين السخنة', 'Ain Sokhna Industrial Zone'),
        'img/ind/prj-industry-2.jpg': ('المنطقة الصناعية بالعين السخنة', 'Ain Sokhna Industrial Zone'), 'img/hero.jpg': ('نهر النيل في القاهرة', 'The Nile in Cairo'),
        'img/cities/10th-of-ramadan.jpg': ('مدينة العاشر من رمضان', '10th of Ramadan City'), 'img/cities/6th-of-october.jpg': ('مدينة السادس من أكتوبر', '6th of October City'),
        'img/cities/new-damietta.jpg': ('دمياط الجديدة', 'New Damietta'), 'img/cities/new-borg-el-arab.jpg': ('برج العرب الجديدة', 'New Borg El Arab'),
        'img/cities/kafr-el-dawwar.jpg': ('كفر الدوار', 'Kafr El Dawwar'), 'img/cities/mahalla-el-kubra.jpg': ('المحلة الكبرى', 'El Mahalla El Kubra')}
    # a zone's own photo: only where img/ind/map.json (the interactive pages' stand-ins) really shows that zone or its city, or a city photo
    # of img/cities; every other zone shows its governorate's photo (never a photo of another place under the zone's name)
    VIS_ZONE_OWN = {'sczone-sokhna-iz', 'teda-egypt-sokhna', 'sczone-adabiya-port', 'sczone-arish-port', 'fz-alexandria', 'fz-suez', 'fz-damietta', 'ic-sadat-city',
                    'ic-new-borg-el-arab', 'fz-planned-new-borg-el-arab', 'ic-new-beni-suef', 'tp-smart-village', 'tp-silicon-waha-borg-el-arab'}
    VIS_ZONE_CITY = {'ic-10th-of-ramadan': 'img/cities/10th-of-ramadan.jpg', 'fz-planned-10th-ramadan': 'img/cities/10th-of-ramadan.jpg',
                     'ic-6th-of-october': 'img/cities/6th-of-october.jpg', 'fz-media-6-october': 'img/cities/6th-of-october.jpg',
                     'ic-new-damietta': 'img/cities/new-damietta.jpg', 'ia-damietta-furniture-city': 'img/cities/new-damietta.jpg'}

    def photo_alt(rel, L, subject=''):
        """alt text of a project photo: what it shows when the project knows it (a place in Egypt), else «صورة توضيحية – subject»"""
        rel = str(rel or '').lstrip('/')
        d = VIS_PHOTO_DESC.get(rel)
        if d:
            return X(L, d[0], d[1])
        m = re.match(r'img/gov/gv-([A-Z]{3})\.jpg$', rel)
        if m and m.group(1) in S['gov_by_code']:
            g = S['gov_by_code'][m.group(1)]
            return X(L, 'محافظة %s' % g['ar'], '%s governorate' % g['en'])
        return X(L, 'صورة توضيحية', 'Illustrative photo') + ((' – ' + subject) if subject else '')

    VIS_ZONE_FALLBACK = {'industrial_city': 'img/ind/prj-industry-2.jpg', 'industrial_area': 'img/ind/prj-industry-2.jpg', 'free_zone': 'img/ind/alex-free-zone.jpg',
                         'tech_park': 'img/ind/smart-village.jpg', 'port_zone': 'img/ind/prj-port.jpg', 'investment_zone': 'img/ind/sokhna-industrial-zone.jpg'}

    def js_value(rel, rx):
        """the JSON value right after the regex rx in a data file (window.MIGVIDS=[…], var Z = {…} …); None when absent"""
        try:
            t = open(B + rel, encoding='utf-8').read()
            m = re.search(rx, t)
            return json.JSONDecoder().raw_decode(t, m.end())[0] if m else None
        except Exception:
            return None

    def load_visual():
        V = {}
        ind = load_json(B + 'img/ind/map.json', {}) or {}
        V['zone_img'] = dict(ind.get('zones') or {})
        V['prj_img'] = dict(ind.get('projects') or {})
        V['credits'] = dict(ind.get('credits') or {})
        rules = []
        for r in (js_value('data/indimg.js', r'\bR = ') or []):
            try:
                rules.append((r[0], re.compile(r[1])))
            except Exception:
                pass
        V['prj_rules'] = rules
        gi = js_value('data/regions.js', r'\bIMG = ') or {}
        V['gov_img'] = dict((S['D'].get('region_img') or {}))
        V['gov_src'] = {}
        for k, v in gi.items():
            if isinstance(v, list) and v:
                V['gov_img'][k] = v[0]
                if len(v) > 1 and v[1]:
                    V['gov_src'][k] = v[1]
        vids = js_value('data/videos.js', r'window\.MIGVIDS\s*=\s*') or []
        V['videos'] = [v for v in vids if isinstance(v, dict) and re.fullmatch(r'[A-Za-z0-9_-]{11}', str(v.get('id') or ''))
                       and v.get('thumb') and os.path.isfile(B + str(v['thumb']).lstrip('/'))]
        V['prj_seen'] = {}
        S['vis'] = V

    _VSRC = {}

    def vimg(rel, w, h=None, mode='cover', q=64):
        """(url, width, height) of a build-time copy of a project image: 'cover' crops to w×h, 'contain' fits w×h on white, 'width' scales to
        width w. Never upscales. WebP (JPEG without WebP support), content-hashed under /assets/img/v/ (immutable cache, see emit_headers);
        without Pillow the original /img/… file is used. None when the file does not exist."""
        rel = str(rel or '').lstrip('/')
        if not rel or '..' in rel:
            return None
        key = (rel, w, h, mode, q)
        V = S.setdefault('variants', {})
        if key in V:
            return V[key]
        V[key] = None
        src = B + rel
        if not os.path.isfile(src):
            return None
        try:
            from PIL import Image
        except Exception:
            V[key] = ('/' + rel, w, h or int(w * 9 / 16))
            return V[key]
        try:
            # a few decoded sources stay in memory: a photo is usually asked for in 2–3 sizes in a row (hero 768/1600, tile, card)
            dk = (src, w * 2 >= 1600)
            im = _VSRC.get(dk)
            if im is None:
                im = Image.open(src)
                if im.format == 'JPEG':
                    im.draft('RGB', (1600, 1600) if dk[1] else (w * 2, (h or w) * 2))
                im = im.convert('RGB')
                if len(_VSRC) >= 6:
                    _VSRC.pop(next(iter(_VSRC)))
                _VSRC[dk] = im
        except Exception:
            return None
        iw, ih = im.size
        RS = getattr(Image, 'Resampling', Image)
        rs = RS.BICUBIC

        def resize(img, size):
            return img.resize(size, rs, reducing_gap=2.0) if size != img.size else img
        if mode == 'width':
            tw = min(w, iw)
            out = resize(im, (tw, max(1, round(ih * tw / float(iw)))))
        elif mode == 'contain':
            s = min(w / float(iw), h / float(ih), 1.0)
            nw, nh = max(1, round(iw * s)), max(1, round(ih * s))
            out = Image.new('RGB', (w, h), (255, 255, 255))
            out.paste(resize(im, (nw, nh)), ((w - nw) // 2, (h - nh) // 2))
        else:
            a = w / float(h)
            if iw / float(ih) > a:
                cw, ch = ih * a, float(ih)
            else:
                cw, ch = float(iw), iw / a
            x0, y0 = (iw - cw) / 2.0, (ih - ch) * 0.45
            crop = im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch)))
            tw = min(w, int(cw))
            out = resize(crop, (tw, max(1, round(tw / a))))
        buf = io.BytesIO()
        ext = 'webp'
        try:
            out.save(buf, 'WEBP', quality=q, method=2)
        except Exception:
            buf = io.BytesIO()
            out.save(buf, 'JPEG', quality=q + 8, optimize=True, progressive=True)
            ext = 'jpg'
        data = buf.getvalue()
        name = sha(data, 14) + '.' + ext
        d = S['OUT'] + 'assets/img/v/'
        os.makedirs(d, exist_ok=True)
        if not os.path.exists(d + name):
            with open(d + name, 'wb') as f:
                f.write(data)
        V[key] = ('/assets/img/v/' + name, out.size[0], out.size[1])
        return V[key]

    def vis_credit(rel, L):
        """visible credit line for a Wikimedia Commons photo (img/ind, img/gov); '' for the platform's own pictures"""
        rel = str(rel or '').lstrip('/')
        V = S.get('vis') or {}
        cr = (V.get('credits') or {}).get(rel)
        if cr and cr.get('source'):
            au = re.sub(r'\s+', ' ', str(cr.get('author') or '')).strip()
            if L == 'en' and AR_RX.search(au):
                au = ''
            lic = str(cr.get('license') or '')
            txt = X(L, 'الصورة: ', 'Photo: ') + ' · '.join(x for x in [au[:60], lic, 'Wikimedia Commons'] if x)
            return '<small class="sx-cred"><a href="%s" rel="nofollow noopener" target="_blank">%s</a></small>' % (esc(cr['source']), esc(txt))
        m = re.match(r'img/gov/gv-([A-Z]{3})\.jpg$', rel)
        if m and (V.get('gov_src') or {}).get(m.group(1)):
            return '<small class="sx-cred"><a href="%s" rel="nofollow noopener" target="_blank">%s</a></small>' % (
                esc(V['gov_src'][m.group(1)]), X(L, 'الصورة: Wikimedia Commons', 'Photo: Wikimedia Commons'))
        return ''

    def hero_bg(rel, alt):
        """the hero photo: eager, fetchpriority=high, 768w / 1600w variants (the LCP candidate of the page)"""
        vs = []
        for w in (768, 1600):
            v = vimg(rel, w, None, 'width', 58)
            if v and v[0] not in [x[0] for x in vs]:
                vs.append(v)
        if not vs:
            return '', None
        big = vs[-1]
        srcset = ', '.join('%s %dw' % (v[0], v[1]) for v in vs) if len(vs) > 1 else ''
        pre = (vs[0][0], srcset)
        # phones take the 768w file: the photo sits behind the dark gradient, so its full resolution would not show
        return ('<img class="hbg" src="%s"%s sizes="(max-width: 700px) 50vw, 100vw" alt="%s" width="%d" height="%d" fetchpriority="high" decoding="async">'
                % (esc(big[0]), (' srcset="%s"' % esc(srcset)) if srcset else '', esc(alt), big[1], big[2])), pre

    def lazy_img(v, alt, cls=''):
        if not v:
            return ''
        return '<img%s src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async">' % ((' class="%s"' % cls) if cls else '', esc(v[0]), esc(alt), v[1], v[2])

    def TX(L, ar, en=None):
        """data text for a visual extra (card snippet, chip, caption): the Arabic in AR; in EN the explicit English or the dictionary
        translation, else None (the extra is left out, so no Arabic text reaches an English page through the visual layer)"""
        if L != 'en':
            return ar
        if en:
            return en
        v = tr(ar) if ar else None
        return v if v and not AR_RX.search(v) else None

    def initial_of(name, L):
        n = re.sub(r'^(?:مصنع|مصانع|شركة|الشركة|شركه|مؤسسة|مورد|مجموعة)\s+', '', str(name or '').strip())
        if L == 'en' or not AR_RX.search(n):
            n = re.sub(r'^(?:the|el|al)[\s-]+', '', n, flags=re.I)
            m = re.search(r'[A-Za-z0-9]', n)
            return m.group(0).upper() if m else ''
        n = re.sub(r'^ال(?=..)', '', n)
        m = re.search(r'[ء-ي]', n)
        return m.group(0) if m else ''

    def stats_html(items):
        """stat cards: [(number, label, href)] — numbers are counted from the data by the caller (never typed in)"""
        out = []
        for num, lab, href in items:
            if num in (None, ''):
                continue
            inner = '<b class="num">%s</b><span>%s</span>' % (esc(num), esc(lab))
            out.append(('<a class="sx-stat" href="%s">%s</a>' % (esc(href), inner)) if href else '<div class="sx-stat">%s</div>' % inner)
        return '<div class="sx-stats">%s</div>' % ''.join(out) if out else ''

    def sec_head(title, more_href='', more_label='', sub='', hid=''):
        return '<div class="sx-sh"%s><h2>%s</h2>%s%s</div>' % ((' id="%s"' % esc(hid)) if hid else '', esc(title),
                                                             ('<a class="more" href="%s">%s</a>' % (esc(more_href), esc(more_label))) if more_href else '',
                                                             ('<p>%s</p>' % esc(sub)) if sub else '')

    def hero_acts(L, items):
        """[(label, href, kind)] kind: gold | glass | green"""
        return '<div class="sx-acts">%s</div>' % ''.join('<a class="btn btn-%s" href="%s"%s>%s</a>' % (k, esc(h), ' rel="nofollow"' if '/rfq/new/' in h else '', esc(t))
                                                         for t, h, k in items if h)

    def search_box(L, action, placeholder, govs=False, verified=False, button=None, hash_q=False):
        """GET form to an interactive list (/factories/search/ …): the page script hands the query over as the list expects it
        (sessionStorage «mig-q» / «mig-city», #q= and #verified on the directory) and keeps English visitors in English"""
        if not action:
            return ''
        f = ['<input type="search" name="q" placeholder="%s" aria-label="%s" enterkeyhint="search">' % (esc(placeholder), esc(placeholder))]
        if govs:
            opts = ''.join('<option value="%s">%s</option>' % (esc(g['ar']), esc(X(L, g['ar'], g['en'])))
                           for g in sorted(S['govs'], key=lambda g: X(L, g['ar'], g['en'])))
            f.append('<select name="city" aria-label="%s"><option value="">%s</option>%s</select>' % (X(L, 'المحافظة', 'Governorate'), X(L, 'كل المحافظات', 'All governorates'), opts))
        if verified:
            f.append('<label class="vchk"><input type="checkbox" name="verified" value="1"> %s</label>' % X(L, '✓ الموثّقة من فريق المنصة فقط', '✓ Verified by the platform team only'))
        if L == 'en':
            f.append('<input type="hidden" name="lang" value="en">')
        f.append('<button class="btn btn-green" type="submit">%s</button>' % esc(button or X(L, '🔍 ابحث', '🔍 Search')))
        return '<form class="sx-search" action="%s" method="get" role="search"%s>%s</form>' % (esc(action), ' data-hq="1"' if hash_q else '', ''.join(f))

    def sec_cover(slug):
        return VIS_SEC_COVER.get(slug or '') or 'img/m3.jpg'

    def sec_photo(slug):
        return VIS_SEC_IMG.get(slug or '') or 'img/m3.jpg'

    def export_photo(m):
        f = 'img/%s.jpg' % m.get('img') if re.fullmatch(r'[a-z0-9-]+', str(m.get('img') or '')) else ''
        return f if f and os.path.isfile(B + f) else VIS_HUB_IMG['exports']

    def cat_photo(cat):
        """a tender category's picture: the photo of its first factory sector (international tenders: a port)"""
        if cat.get('intl') or cat.get('slug') == 'international':
            return VIS_HUB_IMG['intl']
        hubs = cat.get('factory_hubs') or []
        return sec_photo(hubs[0]) if hubs else VIS_HUB_IMG['tenders']

    def gov_photo(code):
        return ((S.get('vis') or {}).get('gov_img') or {}).get(code or '') or ''

    VIS_ZONE_GENERIC = {'industrial_city': ['img/m3.jpg', 'img/e0.jpg', 'img/ind/machine-workshop.jpg', 'img/m0.jpg'],
                        'industrial_area': ['img/m3.jpg', 'img/ind/machine-workshop.jpg', 'img/e0.jpg', 'img/m0.jpg'],
                        'investment_zone': ['img/m3.jpg', 'img/e4.jpg'], 'free_zone': ['img/m3.jpg', 'img/e4.jpg'], 'port_zone': ['img/m3.jpg'], 'tech_park': ['img/e2.jpg', 'img/e3.jpg']}

    def zone_photo(z):
        """the zone's own photo or city photo; else its governorate's photo for the first zone of a governorate, and a generic
        illustrative picture (not of any named place) for the others, so a governorate's zone tiles do not all repeat one landmark"""
        zid = z.get('id') or ''
        p = ((S.get('vis') or {}).get('zone_img') or {}).get(zid) if zid in VIS_ZONE_OWN else VIS_ZONE_CITY.get(zid)
        if p and os.path.isfile(B + p):
            return p
        same = [x['id'] for x in S['zones'] if x['region_code'] == z.get('region_code') and x['id'] not in VIS_ZONE_OWN and x['id'] not in VIS_ZONE_CITY]
        g = gov_photo(z.get('region_code'))
        if g and os.path.isfile(B + g) and (not same or same[0] == zid):
            return g
        pool = VIS_ZONE_GENERIC.get(z.get('type')) or ['img/m3.jpg']
        return pool[(same.index(zid) if zid in same else 0) % len(pool)]

    def project_photo(p):
        """the interactive projects page's rule (data/indimg.js): a photo of the project type (wind, solar, port, road …), the two photos of
        a type taken in turn; the type is looked for in the name first, then in the sector («بطاقة 300 ألف طن» is a capacity, not energy);
        El Dabaa has its own photo; else the governorate photo of the record"""
        V = S.get('vis') or {}
        memo = V.setdefault('prj_photo', {})
        pid = p.get('id') or p.get('path')
        if pid in memo:
            return memo[pid]
        name = re.sub(r'(?<![ء-ي])بطاق[ةه](?![ء-ي])', ' ', str(p.get('name') or ''))
        k = ''
        for t in (name, str(p.get('sector') or '')):
            k = next((k for k, rx in V.get('prj_rules', []) if rx.search(t)), '')
            if k:
                break
        lst = (V.get('prj_img') or {}).get(k) or (V.get('prj_img') or {}).get('industry') or []
        lst = [x for x in lst if os.path.isfile(B + x)]
        if k == 'power' and 'الضبعة' in name and os.path.isfile(B + 'img/ind/dabaa-construction.jpg'):
            ph = 'img/ind/dabaa-construction.jpg'
        elif lst:
            n = V['prj_seen'][k] = V['prj_seen'].get(k, 0) + 1
            ph = lst[(n - 1) % len(lst)]
        else:
            ph = p.get('img') if p.get('img') and os.path.isfile(B + p['img']) else ''
        memo[pid] = ph
        return ph

    def prod_img(p):
        """a product's own photo, or None for the old site's grey «Made in Egypt» placeholder (shown as a styled tile instead)"""
        u = p.get('img_url')
        return u if u and not p.get('img_ph') else None

    def noimg(label):
        return '<span class="sx-noimg" aria-hidden="true">%s</span>' % esc(label or '🏭')

    def ar_noun(n, one, two, few, many):
        """the counted noun for a stat card label (the number itself is shown apart): 1 · 2 · 3–10 plural · 11+ singular"""
        k = int(n) % 100
        return one if n == 1 else two if n == 2 else few if 3 <= k <= 10 else many

    def round_robin(items, key, n):
        """n items taken one group after another (one sector, then the next …) so that a featured strip shows the range of the data"""
        groups, order = {}, []
        for it in items:
            k = key(it)
            if k not in groups:
                groups[k] = []
                order.append(k)
            groups[k].append(it)
        out = []
        while len(out) < n and any(groups[k] for k in order):
            for k in order:
                if groups[k] and len(out) < n:
                    out.append(groups[k].pop(0))
        return out

    def name_ok(L, ar, en=None):
        """a record name that can be shown in a featured strip of language L (EN: an English name exists)"""
        if L != 'en':
            return True
        v = T(L, ar, en)
        return bool(v) and not AR_RX.search(v)

    def visual_strips(L, products=None, videos=None, zones=None, prod_more=None, vid_title=None):
        """the photo strips shared by the hubs: products with their own photos, YouTube videos, industrial zones"""
        out = ''
        if zones:
            out += '<section class="sx-sec">%s%s</section>' % (sec_head(X(L, 'المدن والمناطق الصناعية', 'Industrial cities & zones'), lk(L, '/industrial-zones/') if (L == 'ar' or page_exists('/en/industrial-zones/')) else '/industrial-zones/',
                                                                        X(L, 'كل المناطق (%d) ←', 'All zones (%d) →') % len(S['zones'])), zone_tiles(L, zones))
        if products:
            out += '<section class="sx-sec">%s<div class="sx-prod"><ul class="plist">%s</ul></div></section>' % (
                sec_head(X(L, 'منتجات من مصانع الدليل', 'Products from directory companies'), prod_more or (lk(L, '/products/') if (L == 'ar' or page_exists('/en/products/')) else '/products/'),
                         X(L, 'كل المنتجات (%d) ←', 'All products (%d) →') % len(S['products_listed'])), ''.join(product_li(x, L) for x in products))
        if videos:
            vc = video_cards(L, videos)
            if vc:
                out += '<section class="sx-sec">%s%s</section>' % (sec_head(vid_title or X(L, 'مرئيات من الصناعة المصرية', 'Videos from Egyptian industry'), static_url('videos', L),
                                                                            X(L, 'كل المرئيات (%d) ←', 'All videos (%d) →') % len((S.get('vis') or {}).get('videos') or [])), vc)
        return out

    def featured_products(L, n, pool=None):
        lst = [p for p in (pool if pool is not None else S['products_listed']) if prod_img(p) and p.get('page') and name_ok(L, p['name'], p['name_en'])]
        return round_robin(lst, lambda p: id(p.get('maker')) if p.get('maker') else p['i'], n)

    # ---- cards (each keeps the anchor and text of the list item it replaces)
    def company_card(c, L):
        mk = (id(c), L, len(S['en_paths']))
        memo = S.setdefault('card_memo', {})
        if mk in memo:
            return memo[mk]
        memo[mk] = h_ = _company_card(c, L)
        return h_

    def _company_card(c, L):
        nm = T(L, c['name'], c.get('name_en'))
        meta = ' · '.join(x for x in [type_label(c, L), gov_name(c['gov'], L) or X(L, 'المحافظة غير محددة', 'Governorate not given')] if x)
        snip = ''
        if L == 'ar' and c['desc']:
            snip = '<p>%s</p>' % esc(first_words(c['desc'], 18))
        elif L == 'en':
            v = company_desc_en(c)
            if v:
                snip = '<p>%s</p>' % esc(first_words(v, 18))
        badge = (('<span class="pub">%s</span>' % X(L, PUB_AR, PUB_EN)) if is_pub(c) else
                 ('<span class="vf">%s</span>' % X(L, VER_AR, VER_EN)) if is_team(c) else '<span class="mem">%s</span>' % X(L, 'مدرجة في دليل المنصة', 'Listed in the directory'))
        sec = S['sec_by_slug'].get(c['sslug'] or '')
        sec_t = X(L, sec['t_ar'], sec['t_en']) if sec else ''
        cov_rel = sec_cover(c['sslug'])
        cov = vimg(cov_rel, 480, 200, 'cover', 60)
        logo = c.get('logo_img')
        if logo:
            lg = '<img src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async">' % (esc(logo[0]), esc(X(L, 'شعار ', 'Logo of ') + nm), logo[1], logo[2])
        else:
            lg = esc(initial_of(nm, L) or '🏭')
        pp = []
        for p in (c.get('prods') or []):
            im = prod_img(p)
            if im and len(pp) < 3:
                pp.append('<img src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async">' % (esc(im[0]), esc(T(L, p['name'], p['name_en'])), 40, 40))
        if not pp:
            for n in c['names']:
                v = TX(L, n)
                if v and len(pp) < 3:
                    pp.append('<span>%s</span>' % esc(cut(v, 34)))
        return ('<li class="sx-fc"><div class="cv">%s<span class="lg">%s</span></div><div class="b"><a href="%s"%s>%s</a><span class="m">%s</span>%s%s%s<div class="ft">%s</div></div></li>'
                % (lazy_img(cov, photo_alt(cov_rel, L, sec_t or X(L, 'الصناعة المصرية', 'Egyptian industry'))), lg,
                   esc(lk(L, c['path'])), '' if L == 'ar' or not AR_RX.search(nm) else ' lang="ar"', esc(nm), esc(meta),
                   ('<span class="sc">%s</span>' % esc(sec_t)) if sec_t else '', snip, ('<div class="pp">%s</div>' % ''.join(pp)) if pp else '', badge))

    def company_cards(members, L):
        return '<div class="sx-dir"><ul class="dir-list">%s</ul></div>' % ''.join(company_card(c, L) for c in members)

    def vmosaic(urls, w=400, h=250):
        """a 2×2 mosaic of the members' own product photos (crops written by crop_cell) for a sector tile"""
        key = ('mosaic', tuple(urls), w, h)
        V = S.setdefault('variants', {})
        if key in V:
            return V[key]
        V[key] = None
        try:
            from PIL import Image
        except Exception:
            return None
        cw, ch = w // 2, h // 2
        out = Image.new('RGB', (w, h), (255, 255, 255))
        for i, u in enumerate(urls[:4]):
            try:
                im = Image.open(S['OUT'] + u.lstrip('/')).convert('RGB')
            except Exception:
                return None
            im.thumbnail((cw - 8, ch - 8))
            out.paste(im, ((i % 2) * cw + (cw - im.size[0]) // 2, (i // 2) * ch + (ch - im.size[1]) // 2))
        buf = io.BytesIO()
        try:
            out.save(buf, 'WEBP', quality=70, method=4)
            ext = 'webp'
        except Exception:
            buf = io.BytesIO()
            out.save(buf, 'JPEG', quality=80, optimize=True)
            ext = 'jpg'
        data = buf.getvalue()
        name = sha(data, 14) + '.' + ext
        d = S['OUT'] + 'assets/img/v/'
        os.makedirs(d, exist_ok=True)
        if not os.path.exists(d + name):
            with open(d + name, 'wb') as f:
                f.write(data)
        V[key] = ('/assets/img/v/' + name, w, h)
        return V[key]

    def sec_tile_img(slug):
        """a sector tile's picture: 4 of its members' product photos when the sector has no photo of its own, else the sector photo"""
        if slug in VIS_SEC_MOSAIC:
            seen, ims = set(), []
            for p in S['products']:
                u = prod_img(p) if p.get('sslug') == slug else None
                if u and u[0] not in seen:
                    seen.add(u[0])
                    ims.append(u[0])
            if len(ims) >= 4:
                return ('mosaic', tuple(ims[:4]))
        return sec_photo(slug)

    def tile_li(href, photo, alt, inner, badge='', w=400, h=250):
        # the badge (governorate code, zone type) sits outside the link: the anchor text stays «name (count)» as in the former chip lists
        if isinstance(photo, tuple) and photo and photo[0] == 'mosaic':
            v = vmosaic(list(photo[1]), w, h)
        else:
            v = vimg(photo, w, h, 'cover', 62) if photo else None
        return '<li>%s<a href="%s">%s<span class="t">%s</span></a></li>' % (('<span class="bd">%s</span>' % esc(badge)) if badge else '', esc(href), lazy_img(v, alt), inner)

    def sector_tiles(L, hubs, count_key='n'):
        lis = []
        for s in hubs:
            nm = X(L, s['sec']['t_ar'], s['sec']['t_en'])
            ti = sec_tile_img(s['sec']['slug'])
            alt = (X(L, 'منتجات من قطاع ', 'Products from the ') + nm + X(L, '', ' sector')) if isinstance(ti, tuple) else photo_alt(ti, L, nm)
            lis.append(tile_li(lk(L, s['path']), ti, alt, '%s <small>(%d)</small>' % (esc(nm), s[count_key])))
        return '<ul class="sx-tiles">%s</ul>' % ''.join(lis) if lis else ''

    def gov_tiles(L, ghubs, counts=None):
        lis = []
        for g in ghubs:
            gn = X(L, g['g']['ar'], g['g']['en'])
            n = counts(g) if counts else g['n_members']
            href = lk(L, g['path']) if (L == 'ar' or g.get('en')) else g['path']
            lis.append(tile_li(href, gov_photo(g['g']['code']), photo_alt(gov_photo(g['g']['code']), L, gn), '%s <small>(%d)</small>' % (esc(gn), n), g['g']['code']))
        return '<ul class="sx-tiles">%s</ul>' % ''.join(lis) if lis else ''

    def zone_tiles(L, zones, big=False):
        lis = []
        for z in zones:
            nm = X(L, z['name_ar'], z.get('name_en') or z['name_ar'])
            n = S['zone_members'].get(z['id'], 0)
            sub = '%s%s' % (esc(gov_name(z['region_code'], L)), (' · ' + esc(X(L, '%s في الدليل' % ar_qty(n, N_EST_NOM), en_qty(n, 'directory company', 'directory companies')))) if n else '')
            zp = zone_photo(z)
            lis.append(tile_li(lk(L, z['path']), zp, photo_alt(zp, L, nm), '%s<small>%s</small>' % (esc(nm), sub), zone_type(z, L), 480 if big else 400, 300 if big else 250))
        return '<ul class="sx-tiles%s">%s</ul>' % (' lg' if big else '', ''.join(lis)) if lis else ''

    def product_li(x, L, maker=True):
        nm = T(L, x['name'], x['name_en'])
        im = prod_img(x)
        pic = ('<img src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async">' % (esc(im[0]), esc(nm), im[1], im[2])) if im else noimg(initial_of(nm, L) or '📦')
        mk = x.get('maker')
        sub = ''
        if maker and mk:
            mn = T(L, mk['name'], mk.get('name_en'))
            if L == 'ar' or not AR_RX.search(mn):
                sub = '<small>%s</small>' % esc(mn)
        return '<li><a href="%s">%s<b>%s</b></a>%s</li>' % (esc(('/en' if L == 'en' and x.get('en_ok') else '') + x['path']), pic, esc(nm), sub)

    def days_left_txt(n, L):
        if n is None:
            return ''
        if n < 0:
            return ''
        if n == 0:
            return X(L, 'آخر يوم للتقديم', 'Last day')
        return X(L, 'باقي %s' % ar_count(n, 'يوم واحد', 'يومان', 'أيام', 'يوماً'), '%d day%s left' % (n, '' if n == 1 else 's'))

    def tender_card(t, L):
        P = '/en' if L == 'en' and t.get('en_ok') else ''
        st = tender_badge(t, L)
        m = ' · '.join(x for x in [T(L, t['entity'], t.get('entity_en')) if t['entity'] else '', gov_name(t.get('gov'), L) or (X(L, t.get('country'), t.get('country_en') or t.get('country')) if t['src'] == 'intl' else ''),
                                   (X(L, 'آخر موعد ', 'Closes ') + fmt_date(t['deadline'], L)) if t.get('deadline') else ''] if x)
        nm = T(L, t['title'], t.get('title_en'))
        dl = ''
        if t['status'] in ('open', 'soon') and full_date(t.get('deadline')):
            dl = '<span class="sx-dl" data-dl="%s">%s</span>' % (full_date(t['deadline']), esc(days_left_txt(t.get('days_left'), L)))
        cat = S['cat_by_slug'].get(t.get('cat'))
        chips = []
        if cat:
            chips.append('<span class="chip chip-gray">%s</span>' % esc(X(L, cat['ar'], cat['en'])))
        if t.get('booklet') and str(t['booklet']).replace('.', '').isdigit():
            chips.append('<span class="chip chip-gold">%s</span>' % esc(X(L, 'الكراسة ', 'Documents ') + money_egp(t['booklet'], L)))
        return ('<li class="st-%s"><div class="tp">%s%s</div><a href="%s"%s>%s</a><span class="m">%s</span>%s</li>'
                % (t['status'], st, dl, esc(lk(L, t['path'])), '' if L == 'ar' or not AR_RX.search(nm) else ' lang="ar"', esc(nm), esc(m),
                   ('<div class="ft">%s</div>' % ''.join(chips)) if chips else ''))

    def tender_cards(lst, L):
        return '<div class="sx-tg"><ul class="tlist">%s</ul></div>' % ''.join(tender_card(t, L) for t in lst)

    def project_card(p, L):
        nm = T(L, p['name'])
        stage = S['stages'][p['stage']] if isinstance(p['stage'], int) and 0 <= p['stage'] < len(S['stages']) else ''
        ph = vimg(project_photo(p), 480, 270, 'cover', 60)
        loc = ' · '.join(x for x in [TX(L, p['loc']) if p.get('loc') else '', gov_name(p['gov'], L)] if x)
        rows = []
        for ar, en, v in (('المالك', 'Owner', p.get('owner')), ('المقاول', 'Contractor', p.get('contractor'))):
            tv = TX(L, v) if v else None
            if tv:
                rows.append('<dt>%s</dt><dd>%s</dd>' % (X(L, ar, en), esc(cut(tv, 70))))
        n_st = len(S['stages']) or 1
        bar = ('<span class="sx-bar" aria-hidden="true"><i style="width:%d%%"></i></span>' % round(100.0 * (p['stage'] + 1) / n_st)) if stage else ''
        stg = TX(L, stage) if stage else None
        sec = TX(L, p.get('sector')) if p.get('sector') else None
        return ('<li class="sx-pj"><div class="top">%s%s<a href="%s">%s</a><small>%s</small></div><div class="b"><div class="vr"><b>%s</b>%s</div>%s%s</div></li>'
                % (lazy_img(ph, photo_alt(project_photo(p), L, nm)), ('<span class="chip chip-gold">%s</span>' % esc(sec)) if sec else '', esc(('/en' if L == 'en' and p.get('en_ok') else '') + p['path']), esc(nm),
                   esc(loc), esc(money_m(p['value'], L)), ('<span class="chip chip-green">%s</span>' % esc(stg)) if stg else '', bar,
                   ('<dl>%s</dl>' % ''.join(rows)) if rows else ''))

    def news_card(n, L, big=False):
        title = T(L, n.get('title_ar'))
        f = n.get('image_file') or ''
        v = vimg(f, 640 if big else 480, 360 if big else 270, 'cover', 62) if f else None
        summ = TX(L, n.get('summary_ar') or '') if n.get('summary_ar') else None
        src = TX(L, n.get('source_name') or '') if n.get('source_name') else None
        m = ' · '.join(x for x in [fmt_date(n.get('date'), L), src or ''] if x)
        return ('<li class="sx-nc%s">%s<div class="b"><span class="m">%s</span><a href="%s"%s>%s</a>%s</div></li>'
                % (' big' if big else '', lazy_img(v, title) if v else noimg('📰'), esc(m), esc(('/en' if L == 'en' and n.get('en_ok') else '') + n['path']),
                   '' if L == 'ar' or not AR_RX.search(title) else ' lang="ar"', esc(title), ('<p>%s</p>' % esc(first_words(summ, 26 if big else 16))) if summ else ''))

    def fmt_dur(sec):
        try:
            s = int(sec)
        except Exception:
            return ''
        if s <= 0:
            return ''
        return ('%d:%02d:%02d' % (s // 3600, (s % 3600) // 60, s % 60)) if s >= 3600 else ('%d:%02d' % (s // 60, s % 60))

    def video_cards(L, vids):
        lis = []
        for v in vids:
            title = v.get('title_en') if L == 'en' else (v.get('title_ar') or v.get('title_original'))
            if not title or (L == 'en' and AR_RX.search(title)):
                continue
            th = vimg(str(v['thumb']).lstrip('/'), 480, 270, 'cover', 66)
            ch = str(v.get('channel') or '')
            if L == 'en' and AR_RX.search(ch):
                ch = ''
            cat = TX(L, v.get('category_ar') or '') if v.get('category_ar') else None
            m = ' · '.join(x for x in [ch, fmt_date(v.get('date'), L) if v.get('date') else ''] if x)
            du = fmt_dur(v.get('duration'))
            lis.append('<li class="sx-vc"><a class="th" href="https://www.youtube.com/watch?v=%s" target="_blank" rel="nofollow noopener" data-yt="%s" aria-label="%s">%s<span class="pl" aria-hidden="true"></span>%s</a>'
                       '<div class="b">%s<b>%s</b><small>%s</small></div></li>'
                       % (esc(v['id']), esc(v['id']), esc(X(L, 'تشغيل: ', 'Play: ') + title), lazy_img(th, title), ('<span class="du">%s</span>' % du) if du else '',
                          ('<span class="chip chip-gold">%s</span>' % esc(cat)) if cat else '', esc(title), esc(m)))
        return '<ul class="sx-vids">%s</ul>' % ''.join(lis) if lis else ''

    def pick_videos(n, prefer=None):
        V = (S.get('vis') or {}).get('videos') or []
        pref = [v for v in V if prefer and v.get('category_ar') in prefer]
        rest = [v for v in V if v not in pref]
        return (pref + rest)[:n]

    def event_card(e, L):
        name = X(L, e.get('name_ar'), e.get('name_en') or e.get('name_ar'))
        f = e.get('image_file') or ''
        v = vimg(f, 480, 270, 'contain', 70) if f and os.path.isfile(B + f) else None
        d = pdate(e.get('start_date'))
        badge = ('<span class="dt"><b>%d</b>%s</span>' % (d.day, X(L, AR_MONTHS[d.month - 1], EN_MONTHS[d.month - 1][:3]))) if d else ''
        city = TX(L, e.get('city') or '') if e.get('city') else None
        m = ' · '.join(x for x in [fmt_date(e.get('start_date'), L), city or ''] if x)
        return ('<li class="sx-ec"><div class="ph">%s%s</div><div class="b"><a href="%s"%s>%s</a><span class="m">%s</span></div></li>'
                % (lazy_img(v, name) if v else noimg('📅'), badge, esc(('/en' if L == 'en' and e.get('en_ok') else '') + e['path']),
                   '' if L == 'ar' or not AR_RX.search(name) else ' lang="ar"', esc(name), esc(m)))

    # ---- the governorate pages as madeinsaudigate region.html: governorate strip, five KPI cards, tabs over the sections (GOV_CSS / GOV_JS)
    def gov_chips(L, cur=None, page_n=1):
        """«كل المحافظات» + the 27 governorates (code + name) as plain links, the page's own one marked (aria-current) — the order of
        seo/governorates.json, as the strip of the app page /governorates/explore/; the strip scrolls inside itself"""
        lis = ['<li><a href="%s"%s>%s</a></li>' % (esc(lk(L, '/governorates/')), ' class="on" aria-current="page"' if cur is None else '', X(L, 'كل المحافظات', 'All governorates'))]
        for g in S['govs']:
            gh = S['hub_gov_by_code'].get(g['code'])
            if not gh:
                continue
            href = lk(L, gh['path']) if (L == 'ar' or gh.get('en')) else gh['path']
            on = (' class="on" aria-current="%s"' % ('page' if page_n == 1 else 'true')) if g['code'] == cur else ''
            lis.append('<li><a href="%s"%s><small>%s</small> %s</a></li>' % (esc(href), on, esc(g['code']), esc(X(L, g['ar'], g['en']))))
        return '<nav class="sx-rgbar" aria-label="%s"><div class="wrap"><ul>%s</ul></div></nav>' % (X(L, 'محافظات مصر', "Egypt's governorates"), ''.join(lis))

    def kn(n, one, two, few, many):
        """the counted noun under a KPI number (ar_noun; 0 takes the singular: «0 مشروع»)"""
        return one if n == 0 else ar_noun(n, one, two, few, many)

    def kpi_html(items):
        """the five KPI cards: [(number, label, href, tab)] — each a link to its section (#tenders …) that opens its tab;
        the numbers are the lengths of the lists the tabs show (counted by the caller, never typed in)"""
        return '<div class="sx-stats sx-k5">%s</div>' % ''.join('<a class="sx-stat" href="%s" data-tab="%s"><b class="num">%s</b><span>%s</span></a>' % (esc(h), esc(t), esc(num), esc(lab))
                                                               for num, lab, h, t in items)

    def tab_box(L, here, label, tabs):
        """tabs = [(id, label, panel_html, empty)]: every panel stays in the HTML (crawlable and readable without JS, the tab row then
        being a list of in-page links); GOV_JS makes them an ARIA tablist. The first panel with content is the default one."""
        default = next((t[0] for t in tabs if not t[3]), tabs[0][0])
        nav = ''.join('<a href="%s#%s" id="tab-%s" data-tab="%s">%s</a>' % (esc(here), t, t, t, esc(lab)) for t, lab, _h, _e in tabs)
        panels = ''.join('<section class="sx-tp" id="%s" data-panel%s%s>%s</section>' % (t, ' data-default' if t == default else '', ' data-empty' if e else '', h_)
                         for t, _l, h_, e in tabs)
        return '<div class="card2 sx-tabbox" data-sx-tabs><nav class="sx-tabs" aria-label="%s">%s</nav>%s</div>' % (esc(label), nav, panels)

    def empty_box(text, href='', label=''):
        return '<div class="sx-empty"><p>%s</p>%s</div>' % (esc(text), ('<a class="btn btn-green btn-sm" href="%s">%s</a>' % (esc(href), esc(label))) if href else '')

    def more_btns(items):
        """[(label, href)] → the centred buttons under a tab's list (region.html .rmore)"""
        b = ''.join('<a class="btn btn-line btn-sm" href="%s">%s</a>' % (esc(h), esc(t)) for t, h in items if h)
        return '<div class="sx-more">%s</div>' % b if b else ''

    def rfq_gov(r):
        g = str(r.get('gov') or '').strip()
        return g if g in S['gov_by_code'] else (S['gov_ar2code'].get(g) or (gov_of(g) if g else ''))

    def rfq_card(r, L):
        nm = rfq_title(r, L)
        sec = S['sec_by_slug'].get(norm_sector(r['sector']) or '')
        m = ' · '.join(x for x in [(X(L, 'بتاريخ ', 'Dated ') + fmt_date(r['date'], L)) if r.get('date') else '', X(L, sec['t_ar'], sec['t_en']) if sec else ''] if x)
        return ('<li class="st-rfq"><div class="tp"><span class="sx-st sx-st-rfq">%s</span></div><a href="%s"%s>%s</a><span class="m">%s</span></li>'
                % (X(L, 'طلب عرض سعر', 'Request for quotation'), esc(('/en' if L == 'en' and r.get('en_ok') else '') + r['path']),
                   '' if L == 'ar' or not AR_RX.search(nm) else ' lang="ar"', esc(nm), esc(m)))

    def gov_products(code, L):
        """the products of a governorate's directory companies (the maker's governorate): own photos first, taken one company after
        another so that the first row shows several companies; EN: the products with an English name only"""
        lst = [p for p in S['products'] if p.get('page') and (p.get('maker') or {}).get('gov') == code and name_ok(L, p['name'], p['name_en'])]
        ph = [p for p in lst if prod_img(p)]
        return round_robin(ph, lambda p: id(p['maker']), len(ph)) + sorted([p for p in lst if not prod_img(p)], key=lambda p: T(L, p['name'], p['name_en']))

    # ------------------------------------------------------------------ head, header, footer, page shell
    OG_DEFAULT = '/img/og-cover.jpg'

    BASE_FIX_HEAD = ('<base href="/">'
                     '<script>(function(){var H=history;["pushState","replaceState"].forEach(function(f){var o=H[f];if(!o)return;'
                     'H[f]=function(s,t,u){if(typeof u==="string"&&u.charAt(0)==="#")u=location.pathname+location.search+u;return o.call(H,s,t,u);};});})();</script>')
    BASE_FIX_TAIL = ('<script>document.addEventListener("click",function(e){var a=e.target.closest?e.target.closest(\'a[href^="#"]\'):null;'
                     'if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||a.target)return;e.preventDefault();var h=a.getAttribute("href");'
                     'if(h.length>1){location.hash=h;}else{try{history.replaceState(null,"",location.pathname+location.search);}catch(x){}window.scrollTo(0,0);}});</script>')


    def head_html(meta):
        """meta = {title, desc, canonical, robots, alt_en, alt_ar, og_type, og_image, jsonld_page, jsonld_crumbs, lang, keywords?, path?}"""
        L = meta.get('lang', 'ar')
        ov = S.get('overrides', {}).get(meta.get('path') or '', {}) if S.get('overrides') else {}
        title = ov.get('title') or meta['title']
        desc = ov.get('description') or meta.get('desc') or ''
        canonical = ov.get('canonical') or meta['canonical']
        robots = ov.get('robots') or meta.get('robots') or 'index,follow,max-image-preview:large'
        og_t = ov.get('og_title') or title
        og_d = ov.get('og_description') or desc
        og_img = ov.get('og_image') or meta.get('og_image') or OG_DEFAULT
        og_abs = og_img if og_img.startswith('http') else SITE + pct(og_img)
        kw = ov.get('keywords') or meta.get('keywords') or ''
        alt_en, alt_ar = meta.get('alt_en'), meta.get('alt_ar')
        h = ['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">']
        if meta.get('base', True):
            h.append(BASE_FIX_HEAD)
        h += ['<title>%s</title>' % esc(title), '<meta name="description" content="%s">' % esc(desc)]
        if kw:
            h.append('<meta name="keywords" content="%s">' % esc(kw))
        h.append('<meta name="robots" content="%s">' % esc(robots))
        h.append('<link rel="canonical" href="%s">' % esc(canonical))
        if alt_en and alt_ar:
            h.append('<link rel="alternate" hreflang="ar-EG" href="%s">' % esc(abs_url(alt_ar)))
            h.append('<link rel="alternate" hreflang="en" href="%s">' % esc(abs_url(alt_en)))
            h.append('<link rel="alternate" hreflang="x-default" href="%s">' % esc(abs_url(alt_ar)))
        h.append('<meta property="og:type" content="%s">' % esc(meta.get('og_type') or 'website'))
        h.append('<meta property="og:site_name" content="%s">' % X(L, 'منصة صنع في مصر', 'Made in Egypt Gate'))
        h.append('<meta property="og:locale" content="%s">' % ('en_US' if L == 'en' else 'ar_EG'))
        if alt_en and alt_ar:
            h.append('<meta property="og:locale:alternate" content="%s">' % ('ar_EG' if L == 'en' else 'en_US'))
        h.append('<meta property="og:title" content="%s">' % esc(og_t))
        h.append('<meta property="og:description" content="%s">' % esc(og_d))
        h.append('<meta property="og:url" content="%s">' % esc(canonical))
        h.append('<meta property="og:image" content="%s">' % esc(og_abs))
        if og_img == OG_DEFAULT:
            h.append('<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">')
        h.append('<meta name="twitter:card" content="summary_large_image">')
        h.append('<meta name="twitter:title" content="%s">' % esc(og_t))
        h.append('<meta name="twitter:description" content="%s">' % esc(og_d))
        h.append('<meta name="twitter:image" content="%s">' % esc(og_abs))
        # the installable app (PWA, emit_pwa): manifest in the page's language, theme colour, iOS home-screen tags, icons, data/pwa.js
        h.append(pwa_head(L))
        if S['cfg'].get('fonts') != 'self':
            h.append('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                     '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&amp;display=swap" media="print" onload="this.media=\'all\'">'
                     '<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&amp;display=swap"></noscript>')
        pre = meta.get('preload')
        if pre and pre[0]:
            # the hero photo is the page's largest element: fetched with the stylesheet, not after it
            h.append('<link rel="preload" as="image" href="%s"%s imagesizes="(max-width: 700px) 50vw, 100vw" fetchpriority="high">' % (esc(pre[0]), (' imagesrcset="%s"' % esc(pre[1])) if pre[1] else ''))
        if S.get('css_url'):
            h.append('<link rel="stylesheet" href="%s">' % S['css_url'])
        site_graph = meta.get('jsonld_site')
        if site_graph is None:
            site_graph = jsonld_site_graph(meta)
        h.append('<script type="application/ld+json" data-seo="site">%s</script>' % ld(site_graph))
        page_ld = meta.get('jsonld_page')
        if ov.get('jsonld'):
            try:
                page_ld = json.loads(ov['jsonld'])
            except Exception:
                pass
        if page_ld is not None:
            h.append('<script type="application/ld+json" data-seo="page">%s</script>' % ld(page_ld))
        if S.get('js_url'):
            h.append('<script src="%s" defer></script>' % S['js_url'])
        # «🛠️ المطوّر» → «المزايا»: the owner's feature switches (data/flags.js, ~3 KB, defer: before data/janna-welcome.js, which waits for
        # it); in <head>, so the /intel/ pages (migate-intel takes the site's head assets) get it too
        if S.get('flags_src') is None:
            _ff = B + 'data/flags.js'
            S['flags_src'] = ('/data/flags.js?v=%s' % hashlib.md5(open(_ff, 'rb').read()).hexdigest()[:8]) if os.path.exists(_ff) else ''
        if S['flags_src']:
            h.append('<script src="%s" defer></script>' % S['flags_src'])
        return '\n'.join(h)

    def jsonld_site_graph(meta):
        L = meta.get('lang', 'ar')
        url = meta['canonical']
        node = {"@type": meta.get('page_type') or 'WebPage', "@id": url + '#webpage', "url": url, "name": meta.get('h1') or meta['title'],
                "inLanguage": 'en' if L == 'en' else 'ar-EG', "isPartOf": {"@id": SITE + '/#web'}, "publisher": {"@id": SITE + '/#org'}}
        if meta.get('about_id'):
            node['about'] = {"@id": meta['about_id']}
        if meta.get('mentions'):
            node['mentions'] = [{"@id": x} for x in meta['mentions']]
        if meta.get('lastmod'):
            node['dateModified'] = meta['lastmod']
        graph = [node]
        if meta.get('jsonld_crumbs'):
            node['breadcrumb'] = {"@id": url + '#breadcrumb'}
            graph.append(meta['jsonld_crumbs'])
        return {"@context": "https://schema.org", "@graph": graph}

    def crumbs(items, L, url):
        """items = [(name, path)]; returns (visible html, BreadcrumbList)"""
        lis = []
        ld_items = []
        for n, (name, path) in enumerate(items):
            last = n == len(items) - 1
            if last:
                lis.append('<li aria-current="page">%s</li>' % esc(name))
            else:
                lis.append('<li><a href="%s">%s</a></li>' % (esc(path), esc(name)))
            ld_items.append({"@type": "ListItem", "position": n + 1, "name": name, "item": abs_url(path)})
        htmls = '<nav class="sx-crumbs" aria-label="%s"><ol>%s</ol></nav>' % (X(L, 'مسار التنقل', 'Breadcrumb'), ''.join(lis))
        return htmls, {"@type": "BreadcrumbList", "@id": url + '#breadcrumb', "itemListElement": ld_items}

    def home_crumb(L):
        return (X(L, 'الرئيسية', 'Home'), '/en/' if (L == 'en' and S.get('en_home')) else '/')

    # ------------------------------------------------------------------ the main menu: ONE definition for every page
    # Owner report 2026-11-19: the generated pages had a flat menu of their own (no «من نحن», media centre, videos, exhibitions, the
    # bourse or the legal centre in it), the app pages the full menu with its sub-menus. Both now render site.py NAV
    # [(key, name, href, [(name, href) …])] with the same markup (.dd / .menu: site.py SHARED_CSS, in the generated bundle too) and the
    # same clean URLs (seo_rewrite_links: rfqs.html → /rfq/, region.html#CAI → /governorates/cairo/ …); an English page shows the
    # dictionary's English (what data/i18n.js shows on the app pages) and links the /en/ twins where the build wrote them (else
    # keep_english() adds ?lang=en). Real <a href> links: without JS a sub-menu opens on hover / keyboard focus (CSS) and every title
    # link is the section's own page; the ☰ accordion on phones is SEO_JS (the same rules as site.py SHARED_JS).
    NAV_EN = {'🗺️ كل المحافظات (27 محافظة)': '🗺️ All governorates (27)'}   # only where the dictionary has no entry (tr() → None)
    _NAV = {}

    def nav_def():
        """site.py NAV (the app pages' header): from site.py's globals inside the site build, else read from site.py (standalone runs)"""
        v = HOST.get('NAV')
        if isinstance(v, (list, tuple)) and v:
            return v
        if 'def' not in _NAV:
            m = re.search(r'^NAV = \[\n.*?^\]\n', open(B + 'site.py', encoding='utf-8').read(), re.S | re.M)
            if not m:
                raise RuntimeError('seo_build: the main menu (NAV = [ … ]) is missing from site.py')
            g = {}
            exec(m.group(0), g)
            _NAV['def'] = g['NAV']
        return _NAV['def']

    # a generated page's section in the menu (site.py marks its own pages with the key of page(…, active)): the same keys
    NAV_ACTIVE = [('home', r'/$|/export/'), ('factories', r'/factories/'), ('market', r'/(?:products|industrial_products|offers)/'),
                  ('rfq', r'/(?:rfq|tenders|tender-item|awards)/'), ('projects', r'/projects/'), ('cities', r'/(?:governorates|industrial-zones|free-zones)/'),
                  ('media', r'/(?:news|events)/')]

    def nav_links(L, path):
        p = re.sub(r'^/en(?=/)', '', path or '/')
        act = next((k for k, rx in NAV_ACTIVE if re.match(rx, p)), '')
        ck = (L, act)
        cache = S.setdefault('nav_cache', {})
        if ck in cache:
            return cache[ck]

        def tx(s):
            return esc(s if L == 'ar' else (tr(s) or NAV_EN.get(s) or s))
        items = ''
        for k, name, href, sub in nav_def():
            cls = ' class="on"' if k == act else ''
            if sub:
                items += '<div class="dd"><a href="%s"%s>%s</a><div class="menu%s">%s</div></div>' % (
                    esc(href), cls, tx(name), ' wide' if len(sub) > 9 else '', ''.join('<a href="%s">%s</a>' % (esc(h), tx(n)) for n, h in sub))
            else:
                items += '<a href="%s"%s>%s</a>' % (esc(href), cls, tx(name))
        items = seo_rewrite_links(items, 'ar', mark_h1=False)
        # a link the maps do not cover stays a site-root link (/region.html#X: its hash shim), never relative to a page in a sub-directory
        items = re.sub(r'(\shref=")(?![/#]|[A-Za-z][A-Za-z0-9+.-]*:)', r'\1/', items)
        if L == 'en':
            def twin(m):
                base, hs, frag = _html.unescape(m.group(2)).partition('#')
                if base == '/':
                    en = home_crumb('en')[1]
                elif not base.startswith('/en/') and '?' not in base and page_exists('/en' + base):
                    en = '/en' + base
                else:
                    return m.group(0)
                return m.group(1) + esc(en + hs + frag) + m.group(3)
            items = EN_HREF_RX.sub(twin, items)
        cache[ck] = items
        return items

    def header_html(L, alt, path=''):
        P = '/en' if L == 'en' else ''
        links = nav_links(L, path)
        # «دخول» → the factory sign-in page (signin.part.py: /login/, /en/login/) with this page as ?next= (the visitor comes back here),
        # except from the home page (/, /en/): from there the factory goes on to its dashboard after the code, as on the Saudi page (the
        # same rule as data/mig-api.js loginUrl). A button in the bar — on phones (≤560px) a compact 👤 icon next to ☰, as the app
        # pages' header has (SEO_CSS) — and the last item of the ☰ menu as well
        home = bool(re.match(r'^/(?:en/?)?(?:index\.html)?$', path or '/'))
        login = ('/en/login/' if L == 'en' else '/login/') + ('?next=' + quote(path, safe='') if path and not home else '')
        links += '<a class="nav-in" href="%s" rel="nofollow">%s</a>' % (esc(login), X(L, 'دخول', 'Sign in'))
        lang = ''
        if alt:
            lang = ('<a class="btn btn-sm btn-line" href="%s" hreflang="%s" lang="%s" data-lang="%s">%s</a>'
                    % (esc(alt), 'ar' if L == 'en' else 'en', 'ar' if L == 'en' else 'en', 'ar' if L == 'en' else 'en', 'العربية' if L == 'en' else 'English'))
        rfq_new = url_for('rfq-new', lang=L) if S['page_exists'](url_for('rfq-new', lang=L)) else url_for('rfq-new')
        return ('<header class="site-hdr"><div class="wrap"><a class="brand" href="%s" aria-label="%s"><img src="/img/logo-site.png" alt="%s" width="53" height="50"></a>'
                '<button class="menu-btn2" id="menuBtn2" type="button" aria-label="%s" aria-expanded="false" aria-controls="siteNav">☰</button>'
                '<nav class="site-nav" id="siteNav" aria-label="%s">%s</nav><div class="hdr-acts"><a class="btn btn-sm btn-gold" href="%s" rel="nofollow">%s</a>'
                '<a class="btn btn-sm btn-green hdr-in" href="%s" rel="nofollow" data-mig-dash="1" aria-label="%s">%s</a>%s</div></div></header>'
                % (esc(home_crumb(L)[1]), X(L, 'منصة صنع في مصر', 'Made in Egypt Gate'), X(L, 'منصة صنع في مصر', 'Made in Egypt Gate'), X(L, 'القائمة', 'Menu'),
                   X(L, 'القائمة الرئيسية', 'Main menu'), links, esc(rfq_new), X(L, 'اطلب عرض سعر', 'Request a quote'), esc(login), X(L, 'دخول', 'Sign in'), X(L, 'دخول', 'Sign in'), lang))

    # ------------------------------------------------------------------ the platform footer (every page)
    # the platform's own accounts, in the order of the footer icons: (href, label AR, label EN, icon key). The icons and their brand
    # colours are site.py SHARED_CSS .soc-ic .s-<key> (CSS masks: drawn from the cached stylesheet, not repeated in every page)
    FTR_SOCIAL = [
        ('https://wa.me/201279188996', 'واتساب', 'WhatsApp', 'wa'),
        ('https://x.com/egy_business_eg', 'إكس (تويتر)', 'X (Twitter)', 'x'),
        ('https://www.instagram.com/mnstmsrllmnaqsat/', 'إنستغرام', 'Instagram', 'ig'),
        ('https://www.linkedin.com/in/%D9%85%D9%86%D8%B5%D8%A9-%D9%85%D8%B5%D8%B1-%D9%84%D9%84%D9%85%D9%86%D8%A7%D9%82%D8%B5%D8%A7%D8%AA-%D9%88%D8%A7%D9%84%D9%85%D9%88%D8%B1%D8%AF%D9%8A%D9%86-egyptbusinessgate-8a6346450/',
         'لينكدإن', 'LinkedIn', 'in'),
        ('https://www.youtube.com/@egyptbusinessgate', 'يوتيوب', 'YouTube', 'yt'),
        ('https://www.facebook.com/profile.php?id=61595683961104', 'فيسبوك', 'Facebook', 'fb'),
    ]
    # the eight market sections the footer listed before the sector hubs existed: only used when the build has no hub data
    FTR_SECTORS_FALLBACK = [('/market/#cat-food', 'الصناعات الغذائية والمشروبات', 'Food & Beverage Industries'), ('/factories/search/#q=نسيج', 'الغزل والنسيج والملابس الجاهزة', 'Textiles & Ready-made Garments'),
                            ('/market/#cat-build', 'مواد البناء والأسمنت والسيراميك', 'Building materials, cement and ceramics'), ('/market/#cat-petro', 'الصناعات الكيماوية والأسمدة والبتروكيماويات', 'Chemicals, Fertilizers and Petrochemicals Industries'),
                            ('/market/#cat-metal', 'الحديد والصلب والصناعات المعدنية', 'Iron, steel and metal industries'), ('/market/#cat-elec', 'الصناعات الهندسية والكهربائية', 'Engineering & Electrical Industries'),
                            ('/market/#cat-med', 'الأدوية والمستلزمات الطبية', 'Pharmaceuticals & Medical Supplies'), ('/market/#cat-furn', 'الأثاث والصناعات الخشبية', 'Furniture and Wood Industries')]
    # «شركاء المنصة»: on a computer the partners loop slowly (the row is repeated until it fills the strip twice; paused under the pointer
    # or the keyboard focus); on phones and with reduced motion the row scrolls by hand. Generated pages run it from SEO_JS (the cached
    # /assets/seo-*.js), site.py pages right after the strip.
    FTR_JS = ('(function(){try{var r=document.querySelector(".ftr-partners .fp-run"),t=r&&r.firstElementChild,m=window.matchMedia;'
              'if(!t||/\\bloop\\b/.test(r.className)||!m||m("(prefers-reduced-motion: reduce)").matches||!m("(hover: hover) and (min-width: 641px)").matches)return;'
              'r.classList.add("loop");var o=[].slice.call(t.children),w=t.offsetWidth,c=r.clientWidth,k=2,i;if(!w){r.classList.remove("loop");return;}while(k/2*w<c)k+=2;'
              'for(i=1;i<k;i++)o.forEach(function(a){var b=a.cloneNode(true);b.setAttribute("aria-hidden","true");b.setAttribute("tabindex","-1");t.appendChild(b);});'
              't.style.animationDuration=Math.round(k/2*w/45)+"s";r.classList.add("go");}catch(e){}})();\n')
    _FTR = {}

    def ftr_partners():
        """the real partners of the «شركاء المنصة» strip: site.py FTR_PARTNERS (a standalone run reads the literal list from site.py);
        a row whose logo file is missing is skipped"""
        if 'p' not in _FTR:
            v = HOST.get('FTR_PARTNERS')
            if v is None:
                try:
                    import ast
                    for n in ast.parse(open(B + 'site.py', encoding='utf-8').read()).body:
                        if isinstance(n, ast.Assign) and any(getattr(t, 'id', '') == 'FTR_PARTNERS' for t in n.targets):
                            v = ast.literal_eval(n.value)
                            break
                except Exception:
                    v = None
            _FTR['p'] = [r for r in (v or []) if len(r) >= 9 and os.path.exists(B + r[0].lstrip('/'))]
        return _FTR['p']

    def site_footer(L, app=False):
        """the platform footer, the same on every page (owner 2026-11-18: «the footer must have the structure of the Saudi footer»):
        «شركاء المنصة» strip (the real partners, «كن شريكاً ←»); four columns — the platform and its operator (logo card + one line),
        «المنصة» links, «القطاعات الصناعية» (the top 10 sector hubs), «تواصل معنا» + «تابعنا»; the two cards (official references, legal
        centre); «روابط سريعة» (top 10 governorate hubs + the platform guides, which keep the footer's internal links); the bottom bar.
        The two cards, «روابط سريعة» and the bottom bar sit in .ftr-end / .ftr-dock: the blocks that keep the bottom corners of the
        screen free for Janna and the floating buttons (site.py SHARED_CSS).
        app=True: a site.py page — always Arabic markup with Arabic clean URLs (data/i18n.js translates the page; site.py takes the English
        strings from site_footer('en', app=True), so both renders must keep the same nodes in the same order). Generated pages (footer_html)
        link the EN twin when it exists; shell() then adds lang=en to the links that stay Arabic."""
        en = L == 'en'
        cfg = S.get('cfg') or {}
        sp = cfg.get('static_paths', {})

        def stat(key, frag=''):              # a site.py page (about, legal …)
            return esc(sp.get(key, '/%s/' % key) + frag) if app else esc(static_url(key, L, frag))

        def hub(path):                       # a generated page (hubs, lists)
            if app or not en:
                return esc(path)
            p = lk(L, path)
            return esc(p if S['page_exists'](p) else path)

        def li(href, txt):
            return '<li><a href="%s">%s</a></li>' % (href, esc(txt))

        def T(ar, en):                       # a text in the page language, escaped
            return esc(X(L, ar, en))

        def mk(k, tk=''):                    # deploy 2 (P-S2): Control Center settings markers, site.py pages only (they load data/settings-live.js);
            if not app:                      # attributes only, so the AR/EN text-node pairing of site_footer(…, app=True) stays valid
                return ''
            return ' data-mig-setting="%s"' % k + (' data-mig-setting-text="%s"' % tk if tk else '')
        # «شركاء المنصة»: one card per partner (the loop: FTR_JS)
        cards = ''
        for logo, w, h, n_ar, n_en, kind, site, q, bg in ftr_partners():
            name = X(L, n_ar, n_en)
            tip = name + ' · ' + (X(L, 'شريك استراتيجي', 'Strategic partner') if kind == 'strat' else X(L, 'شريك أساسي', 'Core partner'))
            if site:
                href, ext = site, ' target="_blank" rel="sponsored noopener"'
            else:
                href, ext = (cfg.get('app_paths', {}).get('factories') or '/factories/search/') + '#q=' + quote(q), ''
            cards += ('<a class="fp-card" href="%s"%s title="%s"%s><img src="/%s" alt="%s" width="%d" height="%d" loading="lazy"></a>'
                      % (esc(href), ext, esc(tip), (' style="background:%s;border-color:%s"' % (bg, bg)) if re.match(r'^#[0-9A-Fa-f]{3,8}$', bg or '') else '',
                         esc(logo.lstrip('/')), esc(name), w, h))
        strip = ''
        if cards:
            # «كن شريكاً ←» picks the partner plan: [data-mig-buy] (hidden inside a store app while its buying is off, data/flags.js)
            strip = ('<section class="ftr-partners" aria-label="%s"><div class="wrap fp-head"><h3>%s</h3><a href="%s" data-mig-buy>%s</a></div>'
                     '<div class="fp-run"><div class="fp-track">%s</div></div>%s</section>'
                     % (T('شركاء المنصة', 'Platform Partners'), T('شركاء المنصة', 'Platform Partners'), stat('register', '#partner'), T('كن شريكاً ←', 'Become a partner →'),
                        cards, ('<script>%s</script>' % FTR_JS.strip()) if app else ''))
        # column 1: the platform and its operator
        c1 = ('<div><h4>%s</h4><p>%s</p><div class="aff2"><a href="https://eafid.org/" target="_blank" rel="noopener" title="%s"><img src="/img/eafid-logo.png" alt="%s" width="185" height="60" loading="lazy"></a>'
              '<span>%s<small>%s</small></span><span>%s</span></div></div>'
              % (T('منصة صنع في مصر', 'Made in Egypt Gate'),
                 T('المنصة الوطنية الموحدة B2B 🇪🇬 — منصة رقمية تربط المصانع والموردين في محافظات مصر الـ27 بالمشترين المحليين والدوليين، وتدعم التحول الرقمي للقطاع الصناعي في بيئة موثوقة وشفافة، دعماً لـ«رؤية مصر 2030» وتعميق التصنيع المحلي.',
                   'The unified national B2B platform 🇪🇬 — a digital platform that connects factories and suppliers across Egypt\'s 27 governorates with local and international buyers and supports the digital transformation of the industrial sector in a trusted, transparent environment, in support of “Egypt Vision 2030” and deeper local manufacturing.'),
                 T('الجمعية المصرية للتنمية الصناعية', 'Egypt Industrial Development Association'), T('شعار الجمعية المصرية للتنمية الصناعية', 'Egypt Industrial Development Association logo'),
                 T('المالك: الجمعية المصرية للتنمية الصناعية', 'Owner: Egypt Industrial Development Association'),
                 T('جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي).', 'A non-profit association registered under No. 6189 of 2017 (Ministry of Social Solidarity).'),
                 T('المشغّل: الحسيني جروب وشركاءه، استقبال الطلبات وتسجيل الشركاء وخدمة العملاء والتطوير', 'Operator: ElHouseni Group & Partners — receiving requests, partner registration, customer service and development')))
        # column 2: the platform
        c2 = ('<div><h4>%s</h4><ul>%s</ul></div>'
              % (T('المنصة', 'Platform'), li(stat('about'), X(L, 'عن المنصة', 'About the platform')) + li(stat('market'), X(L, 'السوق الإلكتروني', 'Online Marketplace'))
                 + li(hub('/factories/'), X(L, 'دليل المصانع', 'Factory directory')) + li(hub('/tenders/'), X(L, 'المناقصات', 'Tenders'))
                 + li(hub('/industrial-zones/'), X(L, 'المناطق الصناعية والحرة', 'Industrial and Free Zones')) + li(stat('intl'), X(L, 'المنصات الدولية', 'International Platforms'))
                 + li(hub('/app/'), X(L, 'التطبيق', 'App'))))   # the app download page (seo_app.part.py)
        # column 3: the top 10 sector hubs (site.py pages: one list for both languages, so the English strings pair with the Arabic ones)
        secs = [h for h in S.get('hub_sectors') or [] if h['indexable'] and (app or not en or h.get('en'))][:10]
        if secs:
            c3 = ''.join(li(hub(h['path']), X(L, h['sec']['t_ar'], h['sec']['t_en'])) for h in secs)
        else:
            c3 = ''.join(li(esc(u), X(L, a, e)) for u, a, e in FTR_SECTORS_FALLBACK)
        c3 = '<div><h4>%s</h4><ul>%s</ul></div>' % (T('القطاعات الصناعية', 'Industrial Sectors'), c3)
        # column 4: contact + social (the icon is the link's ::before, so its name is the aria-label)
        soc = ''.join('<a href="%s" target="_blank" rel="noopener" aria-label="%s" class="s-%s"></a>' % (esc(u), T(a, e), k) for u, a, e, k in FTR_SOCIAL)
        c4 = ('<div><h4>%s</h4><ul>%s<li><a href="mailto:info@madeinegyptgate.com">info@madeinegyptgate.com</a></li><li><a href="mailto:support@madeinegyptgate.com">support@madeinegyptgate.com</a></li>'
              '<li><a href="tel:+20238346757">%s <span dir="ltr">02 38346757</span></a></li><li><a href="https://wa.me/201279188996" target="_blank" rel="noopener">%s <span dir="ltr">01279188996</span></a></li>%s%s</ul>'
              '<div class="soc-ic"><b>%s</b><div>%s</div></div></div>'
              % (T('تواصل معنا', 'Contact us'),
                 '<li><a href="%s"%s>%s</a></li>' % (stat('contact'), mk('address_ar'), esc(X(L, 'الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية',
                                     'Giza – 6th of October City – District 11 – Culture and Science Area – Building 56 (3rd floor), Arab Republic of Egypt'))),
                 T('الخط الساخن:', 'Hotline:'), T('موبايل وواتساب:', 'Mobile & WhatsApp:'),
                 li(stat('legal'), X(L, '⚖️ المركز القانوني', '⚖️ Legal Center')), li(stat('useful-links'), X(L, '📚 المراجع الرسمية ومواقع تهمك', '📚 Official References & Useful Websites')),
                 T('تابعنا', 'Follow Us'), soc))
        # the two cards
        arrow = T('←', '→')
        refs = ('<div class="ftr-refs"><a href="%s" class="fr1"><span>📚</span><span><b>%s</b><small>%s</small></span><em>%s</em></a>'
                '<a href="%s"><span>⚖️</span><span><b>%s</b><small>%s</small></span><em>%s</em></a></div>'
                % (stat('useful-links'), T('المراجع الرسمية ومواقع تهمك', 'Official References & Useful Websites'),
                   T('الجهات الصناعية والرقابية في مصر وأهميتها لمصنعك', 'Industrial and regulatory bodies in Egypt and why they matter to your factory'), arrow,
                   stat('legal'), T('المركز القانوني', 'Legal Center'), T('الشروط والخصوصية والعضوية والاسترداد والشكاوى', 'Terms, privacy, membership, refunds and complaints'), arrow))
        # «روابط سريعة»: the governorate hubs and the platform guides (the links of the former «أهم المحافظات» / «أدلة المنصة» columns)
        govs = [g for g in S.get('hub_govs') or [] if g['indexable'] and (app or not en or g.get('en'))][:10]
        gov_li = ''.join(li(hub(g['path']), X(L, g['g']['ar'], g['g']['en'])) for g in govs)
        if gov_li:
            gov_li += li(hub('/governorates/'), X(L, 'كل المحافظات', 'All Governorates'))
        guides = [('/free-zones/', 'المناطق الحرة', 'Free zones'), ('/rfq/', 'طلب عرض سعر', 'Request a quote'), ('/products/', 'المنتجات', 'Products'), ('/awards/', 'الترسيات', 'Awards'),
                  ('/projects/', 'المشاريع', 'Projects'), ('/events/', 'المعارض والفعاليات', 'Exhibitions & Events'), ('/export/', 'أسواق التصدير', 'Export markets')]
        guide_li = ''.join(li(hub(p), X(L, a, e)) for p, a, e in guides) + li(stat('register'), X(L, 'سجّل منشأتك', 'Register Your Business')) + li(hub('/site-map/'), X(L, 'خريطة الموقع', 'Site map'))
        quick = ('<nav class="ftr-quick" aria-label="%s"><b>%s</b>%s<div class="fq-row"><span>%s</span><ul>%s</ul></div></nav>'
                 % (T('روابط سريعة', 'Quick links'), T('روابط سريعة', 'Quick links'),
                    ('<div class="fq-row"><span>%s</span><ul>%s</ul></div>' % (T('المحافظات', 'Governorates'), gov_li)) if gov_li else '',
                    T('أدلة المنصة', 'Platform guides'), guide_li))
        # bottom bar (the factory dashboard and the owner's admin panel — the admin entry the site already has, the Arabic legacy
        # /panel.html: hreflang="ar" keeps shell() from adding lang=en to it — are not for crawlers)
        year = (S.get('today') or datetime.date.today()).year
        note = '' if app else '<small class="fnote">%s</small>' % T('كل الأرقام في الصفحات محسوبة من بيانات المنصة وقت آخر تحديث.', 'All figures are computed from the platform data at the last update.')
        # inside the platform's own app only (html.mig-app, pwa_head APP_HEAD_JS; hidden everywhere else): «دخول فريق المنصة» — the app has
        # no address bar, so the team reaches its boards (/admin/, /seo-team/, /data-desk/ …) through the sign-in page's team mode
        team = '/en/login/?team=1' if (en and not app) else '/login/?team=1'
        bottom = ('<div class="bottom"><span>%s%s</span><span><a href="%s">%s</a> · <a href="%s">%s</a> · <a href="%s">%s</a> · <a href="%s" rel="nofollow">%s</a> · <a href="/panel.html" rel="nofollow" hreflang="ar">%s</a>'
                  '<span class="ftr-team" data-mig-app-only hidden> · <a href="%s" rel="nofollow">%s</a></span></span></div>'
                  % (T('جميع الحقوق محفوظة © %d لمنصة صنع في مصر' % year, 'All rights reserved © %d Made in Egypt Gate' % year), note,
                     stat('legal', '#privacy'), T('سياسة الخصوصية', 'Privacy Policy'), stat('legal', '#terms'), T('الشروط والأحكام', 'Terms & Conditions'),
                     stat('legal'), T('المركز القانوني', 'Legal Center'), stat('dashboard'), T('لوحة المصنع', 'Factory dashboard'), T('لوحة الإدارة', 'Admin dashboard'),
                     esc(team), T('دخول فريق المنصة', 'Platform team sign-in')))
        return ('<footer class="site-ftr%s">%s<div class="wrap ftr-main"><div class="cols">%s%s%s%s</div><div class="ftr-end">%s<div class="ftr-dock">%s%s</div></div></div></footer>'
                % (' ftr-app' if app else '', strip, c1, c2, c3, c4, refs, quick, bottom))

    def footer_html(L):
        return site_footer(L)

    def hub_hash_forward(meta, L):
        """a hub with an interactive twin (app_paths: /tenders/ → /tenders/search/ …) forwards item hashes it cannot show —
        /tenders.html#<id> (alert e-mails, follows saved before the clean URLs, old bookmarks) lands on /tenders/#<id>, and only
        the interactive list opens the item. In-page anchors of the hub (#main, #sectors …) stay where they are."""
        cfg = S.get('cfg') or {}
        sp, ap = cfg.get('static_paths', {}), cfg.get('app_paths', {})
        p = meta.get('path') or ''
        if L == 'en' and p.startswith('/en/'):
            p = p[3:]
        app = next((ap[k] for k in ap if sp.get(k) == p), None)
        if not app:
            return ''
        if L == 'en':
            app += '?lang=en'                  # the interactive list has no /en/ twin: it switches to English from the parameter
        return ('<script>(function(){var h=location.hash;if(h.length<2)return;var id="";try{id=decodeURIComponent(h.slice(1));}catch(e){id=h.slice(1);}'
                'if(!document.getElementById(id))location.replace(%s+h);})();</script>\n' % json.dumps(app))

    EN_A_RX = re.compile(r'<a\s[^>]*>')
    EN_HREF_RX = re.compile(r'(\shref=")(/(?![/\\])[^"]*)(")')
    EN_FILE_RX = re.compile(r'\.(?!html?$)[A-Za-z0-9]{1,12}$')

    def keep_english(frag):
        """English pages only (shell): an <a href> to a page of this site outside /en/ — an Arabic-only page: app_url() targets
        (/factories/search/ …), lk() fallbacks (/news/<id>/ from /en/news/, Arabic-only companies, tenders, offers …) and the
        other «no EN twin» fallbacks — gets lang=en, as static_url() does: the visitor stays in English (the app pages translate
        themselves from it, Janna and the forms answer in English, the edge serves /x/?lang=en with 200 and the canonical stays /x/).
        Only <body> markup passes through here: canonical, hreflang and JSON-LD are written by head_html(), and the sitemaps and
        /_seo/* from the manifest, never from this HTML. The language switch (data-lang / hreflang), /en/ URLs, files (csv,
        images …), external links and links that already carry lang= are left as they are."""
        def one(h):
            u = _html.unescape(h.group(2))
            rest, hs, fr = u.partition('#')
            path, _q, query = rest.partition('?')
            if re.match(r'/en(/|$)', path) or EN_FILE_RX.search(path.rsplit('/', 1)[-1]) or re.search(r'(^|&)lang=', query):
                return h.group(0)
            return h.group(1) + esc(path + '?' + (query + '&' if query else '') + 'lang=en' + hs + fr) + h.group(3)

        def tag(m):
            t = m.group(0)
            if ' data-lang="' in t or ' hreflang="' in t:
                return t
            return EN_HREF_RX.sub(one, t, count=1)
        return EN_A_RX.sub(tag, frag)

    def shell(meta, body, L):
        alt = meta.get('alt_en') if L == 'ar' else meta.get('alt_ar')
        ask = hub_hash_forward(meta, L)
        if meta.get('mig_ctx'):
            # JSON with "<" escaped: record titles are data, never markup
            ask += ('<script>window.MIG_CTX=%s;try{window.dispatchEvent(new CustomEvent("mig:ctx",{detail:window.MIG_CTX}));}catch(e){}</script>\n'
                    % json.dumps(meta['mig_ctx'], ensure_ascii=False).replace('<', '\\u003c'))
        ac = S['cfg'].get('assistant', {})
        if ac.get('enabled') and S.get('assistant_src'):
            # both languages: on an English page the loader (SEO_JS) starts the same assistants in English (MIGLANG = "en")
            ask += ('<button class="ask-btn" id="seoAsk" type="button" data-idle="%d">%s</button>'
                    % (int(ac.get('idle_desktop_ms') or 0), esc(ac.get('label_en' if L == 'en' else 'label_ar') or '')))
        # the standing cut-out Janna (data/janna-welcome.js) on every generated page; the script itself stays quiet on internal pages
        if S.get('jw_src') is None:
            _jf = B + 'data/janna-welcome.js'
            S['jw_src'] = ('/data/janna-welcome.js?v=%s' % hashlib.md5(open(_jf, 'rb').read()).hexdigest()[:8]) if os.path.exists(_jf) else ''
        if S['jw_src'] and os.environ.get('MIG_JW_SEO', '1') != '0':   # MIG_JW_SEO=0: keep the «اسأل جنة» pill only (until the SEO-page figure ships)
            ask += '<script src="%s" defer></script>' % S['jw_src']
        top, foot = header_html(L, alt, meta.get('path') or ''), footer_html(L)
        if L == 'en':
            top, body, foot = keep_english(top), keep_english(body), keep_english(foot)
        return ('<!doctype html>\n<html lang="%s" dir="%s">\n<head>\n%s\n</head>\n<body>\n<a class="skip" href="%s#main">%s</a>\n%s\n<main id="main">%s</main>\n%s\n%s</body>\n</html>\n'
                % ('en' if L == 'en' else 'ar', 'ltr' if L == 'en' else 'rtl', head_html(meta), esc(pct(meta.get('path') or '/')), X(L, 'تخطَّ إلى المحتوى', 'Skip to content'),
                   top, body, foot, ask))

    def hero(L, crumbs_html, h1, intro='', chips=None, extra='', logo=None, img=None, acts='', small=False, alt=None):
        """the page header: breadcrumb, the one H1 (data-seo="h1") and the intro (data-seo="intro"); with img (a project image) it is the
        app pages' photo hero: the photo behind a dark gradient, call-to-action buttons and the photo credit (Wikimedia Commons)"""
        ov = S['overrides'].get(S['cur_path'], {}) if S.get('overrides') else {}
        h1 = ov.get('h1') or h1
        intro = ov.get('intro') or intro
        chips_html = ('<div class="sx-chips">%s</div>' % ''.join('<span>%s</span>' % esc(c) for c in chips if c)) if chips else ''
        h1_html = '<h1 data-seo="h1">%s</h1>' % esc(h1)
        if logo:
            h1_html = '<div class="hrow"><img class="logo" src="%s" alt="%s" width="96" height="96">%s</div>' % (esc(logo), esc(X(L, 'شعار ', 'Logo of ') + h1), h1_html)
        S['cur_h1'] = h1
        S['hero_pre'] = None
        cls, bg, cred = 'sx-hero', '', ''
        if img:
            bg, pre = hero_bg(img, alt or h1)
            if bg:
                cls += ' ph' + (' sm' if small else '')
                S['hero_pre'] = pre
                cred = vis_credit(img, L)
        # «🔗 شارك الصفحة»: only inside the platform's own app (no address bar or share button there — app parity plan, share-and-copy-links)
        share = '<button type="button" class="sx-share" data-mig-share data-mig-app-only hidden>%s</button>' % X(L, '🔗 شارك الصفحة', '🔗 Share this page')
        return ('<div class="%s">%s<div class="wrap">%s%s%s%s%s%s%s</div>%s</div>'
                % (cls, bg, crumbs_html, h1_html, ('<p class="intro" data-seo="intro">%s</p>' % esc(intro)) if intro else '', chips_html, acts, share, extra, cred))

    def pager(L, base_path, n, pages):
        if pages <= 1:
            return ''
        out = []
        P = '/en' if L == 'en' else ''

        def u(k):
            return lk(L, base_path + ('page/%d/' % k if k > 1 else ''))
        if n > 1:
            out.append('<a href="%s" rel="prev">%s</a>' % (esc(u(n - 1)), X(L, '‹ السابق', '‹ Previous')))
        for k in range(1, pages + 1):
            if k == n:
                out.append('<span aria-current="page">%d</span>' % k)
            else:
                out.append('<a href="%s">%d</a>' % (esc(u(k)), k))
        if n < pages:
            out.append('<a href="%s" rel="next">%s</a>' % (esc(u(n + 1)), X(L, 'التالي ›', 'Next ›')))
        return '<nav class="pager" aria-label="%s">%s</nav>' % (X(L, 'صفحات القائمة', 'List pages'), ''.join(out))

    # ------------------------------------------------------------------ titles and descriptions
    SUFFIX = {'ar': ' | صنع في مصر', 'en': ' | Made in Egypt Gate'}

    def mk_title(cands, L, suffix=True, page=1):
        """first candidate that fits 65 characters (with the « | صنع في مصر» suffix when it still fits); page N gets «– صفحة N»"""
        pg = (X(L, ' – صفحة %d', ' – page %d') % page) if page > 1 else ''
        cands = [re.sub(r'\s+', ' ', c).strip() for c in cands if c]
        if L == 'ar' and any(AR_RX.search(c) for c in cands):
            # an Arabic page never takes an all-Latin title when an Arabic one exists (a product or maker named in English only:
            # «CNC Rotary Milling – CNC Metal & Plastics Machining» was the title of both the Arabic and the English page)
            cands = [c for c in cands if AR_RX.search(c)]
        for c in cands:
            # keyword-rich candidates first; the suffix is dropped when it would push the title past 65 characters (spec §1.5)
            if suffix and len(c + pg + SUFFIX[L]) <= 65:
                return c + pg + SUFFIX[L]
            if len(c + pg) <= 65:
                return c + pg
        c = cands[-1]
        return cut_ell(c, 64 - len(pg)) + pg

    ELL = '…'

    def cut_ell(s, n):
        """s within n characters: whole, or cut at a word boundary with «…» (no dangling preposition, no parenthesis left open)"""
        s = re.sub(r'\s+', ' ', str(s or '')).strip()
        if len(s) <= n:
            return s
        c = cut(s, max(1, n - 1))
        if c.count('(') > c.count(')'):
            c2 = c[:c.rfind('(')]
            prev = None
            while prev != c2:
                prev = c2
                c2 = STOP_TAIL.sub('', c2.rstrip(' ،,.-–:(')).rstrip(' ،,.-–:(')
            if len(c2) >= (n - 1) * 0.5:
                c = c2
        return c + ELL

    def page_title(subject, L, tails=(), prefixes=('',), cut_tail='', keep_suffix=True, limit=65, min_room=30, must=''):
        """<title> of a detail page (owner report 2026-11-19: tender / RFQ titles cut in the middle of the sentence): the whole subject
        with the most informative tail that still fits (with the « | صنع في مصر» suffix), else the whole subject alone, else the subject
        cut at a word boundary with «…» (+ cut_tail: what keeps two cut titles apart); keep_suffix=False lets the suffix go before the
        subject is cut. must: a part every form keeps right after the subject (what tells two pages with the same subject apart: a
        tender's reference number, a news item's date — dup_titles())"""
        suf = SUFFIX[L]
        subject = re.sub(r'\s+', ' ', str(subject or '')).strip()
        for pre in prefixes:
            for tail in list(tails) + ['']:
                if len(pre + subject + must + tail + suf) <= limit:
                    return pre + subject + must + tail + suf
        if not keep_suffix:
            for pre in prefixes:
                if len(pre + subject + must) <= limit:
                    return pre + subject + must
        s_ = suf if keep_suffix else ''
        for pre in prefixes:
            room = limit - len(pre + must + cut_tail + s_)
            if room >= min_room or pre == prefixes[-1]:
                return pre + cut_ell(subject, room) + must + cut_tail + s_
        return cut_ell(subject, limit)

    def dup_titles(kind, L, items, base):
        """the titles base(item, L) gives to more than one page of a kind (computed once per build and language)"""
        memo = S.setdefault('dup_titles', {})
        if (kind, L) not in memo:
            seen = {}
            for x in items:
                k = base(x, L)
                seen[k] = seen.get(k, 0) + 1
            memo[(kind, L)] = set(k for k, v in seen.items() if v > 1)
        return memo[(kind, L)]

    def mk_desc(parts, L, tail=None):
        if tail is None:
            tail = X(L, 'اطلب عرض سعر مجاناً.', 'Request a free quote.')
        out = ''
        for p in parts:
            p = re.sub(r'\s+', ' ', p or '').strip()
            if not p:
                continue
            cand = (out + ' ' + p).strip()
            room = 160 - len(tail) - 1 - len(out) - (1 if out else 0)
            if len(cand) + 1 + len(tail) <= 160:
                out = cand
            elif room >= 45:
                out = (out + ' ' + clip(p, room)).strip()
            elif not out:
                out = clip(p, 158 - len(tail))
        res = (out + ' ' + tail).strip() if tail else out
        if len(res) < 70:
            res = (res + ' ' + X(L, 'على منصة صنع في مصر، المنصة الوطنية B2B للصناعة المصرية.', 'On Made in Egypt Gate, the B2B platform of Egyptian industry.')).strip()
        return res[:170]

    def kw_for(cluster, L, **kv):
        c = S['kw_by_cluster'].get(cluster) or {}
        tpl = c.get('kw_en' if L == 'en' else 'kw_ar') or ''
        try:
            return tpl.format(**kv).strip()
        except Exception:
            return tpl

    # ------------------------------------------------------------------ JSON-LD builders (spec §1.7)
    def jsonld_company(c, url, L):
        o = {"@context": "https://schema.org", "@type": "Organization", "@id": url + '#org', "name": T(L, c['name'], c.get('name_en')), "url": url,
             "mainEntityOfPage": {"@id": url + '#webpage'}}
        d = c['desc'] if L == 'ar' else (company_desc_en(c) or '')
        if d:
            o['description'] = clip(d, 500)
        if c.get('logo_img'):
            o['logo'] = SITE + c['logo_img'][0]
        g = S['gov_by_code'].get(c['gov'])
        addr = {"@type": "PostalAddress", "addressCountry": "EG"}
        city = city_text(c, L)
        if city:
            addr['addressLocality'] = city
        if g:
            addr['addressRegion'] = X(L, g['ar'], g['en'])
        o['address'] = addr
        sec = S['sec_by_slug'].get(c['sslug'] or '')
        if sec:
            o['knowsAbout'] = X(L, sec['ar'], sec['en'])
        offers = []
        for p in (c.get('prods') or [])[:10]:
            offers.append({"@type": "Offer", "itemOffered": {"@type": "Product", "name": T(L, p['name'], p['name_en']), "url": abs_url(('/en' if L == 'en' and p.get('en_ok') else '') + p['path'])}})
        if not offers:
            for n in c['names'][:10]:
                offers.append({"@type": "Offer", "itemOffered": {"@type": "Product", "name": T(L, n)}})
        if offers:
            o['makesOffer'] = offers
        if is_team(c):
            # a platform client verified by hand by its team; imported directory listings (MIGOLDFAC) and researched rows are not
            o['memberOf'] = {"@id": SITE + '/#org'}
            o['description'] = X(L, VER_AR, VER_EN) + ('. ' + o['description'] if o.get('description') else '')
        if c['kind'] == 'public':
            same = [u for u in (c.get('website'),) if u]
            if same:
                o['sameAs'] = same
        return o

    def jsonld_product(p, url, L):
        # schema.org Product needs offers, review or aggregateRating for Google (Rich Results Test: invalid item otherwise) and the
        # directory has none of them (no prices, no reviews: spec §1.7 forbids inventing them). The page therefore describes the
        # product as a Thing typed Product via additionalType, and names the listing company as a separate Organization node.
        o = {"@type": "Thing", "@id": url + '#product', "additionalType": "https://schema.org/Product", "name": T(L, p['name'], p['name_en']), "url": url,
             "mainEntityOfPage": {"@id": url + '#webpage'}}
        d = product_desc(p, L)
        if d:
            o['description'] = d
        if p.get('img_url'):
            o['image'] = SITE + p['img_url'][0]
        graph = [o]
        mk = p['maker']
        if mk:
            murl = abs_url(('/en' if L == 'en' and mk.get('en_ok') else '') + mk['path'])
            graph.append({"@type": "Organization", "@id": murl + '#org', "name": T(L, mk['name'], mk.get('name_en')), "url": murl})
        return {"@context": "https://schema.org", "@graph": graph}

    def jsonld_tender(t, url, L):
        o = {"@context": "https://schema.org", "@type": "Demand", "@id": url + '#demand', "name": T(L, t['title'], t.get('title_en')), "url": url,
             "mainEntityOfPage": {"@id": url + '#webpage'}}
        o['description'] = tender_summary(t, L)
        if t['ref']:
            o['identifier'] = t['ref']
        if t.get('publish'):
            o['validFrom'] = t['publish']
        if t.get('deadline'):
            o['validThrough'] = t['deadline']
        g = S['gov_by_code'].get(t.get('gov') or '')
        if g:
            o['areaServed'] = {"@type": "AdministrativeArea", "name": X(L, g['ar'], g['en'])}
        elif t['src'] == 'intl' and (t.get('country') or t.get('country_en')):
            o['areaServed'] = {"@type": "Country", "name": X(L, t.get('country'), t.get('country_en') or t.get('country'))}
        cat = S['cat_by_slug'].get(t['cat'])
        if cat:
            # schema.org Demand has no "category"; the category belongs to what is demanded (itemOffered)
            o['itemOffered'] = {"@type": "Service", "name": T(L, t['title'], t.get('title_en')), "category": X(L, cat['ar'], cat['en'])}
        return o

    def jsonld_rfq(r, url, L):
        o = {"@context": "https://schema.org", "@type": "Demand", "@id": url + '#demand', "name": rfq_title(r, L), "url": url, "mainEntityOfPage": {"@id": url + '#webpage'},
             "description": clip(r['details'] if L == 'ar' else (r['details_en'] or ''), 500) or rfq_title(r, L), "identifier": r['no']}
        if r['date']:
            o['validFrom'] = r['date']
        if r['deadline'] and pdate(r['deadline']):
            o['validThrough'] = r['deadline']
        sec = S['sec_by_slug'].get(norm_sector(r['sector']) or '')
        if sec:
            o['itemOffered'] = {"@type": "Service", "name": rfq_title(r, L), "category": X(L, sec['ar'], sec['en'])}
        return o

    def news_own(n):
        """a story from the platform's own former WordPress site: its old URL now 301s to this page, so it is not an «original source»"""
        return 'madeinegyptgate.com' in urlparse(n.get('url') or '').netloc.lower()

    def news_legacy_path(n):
        if not news_own(n):
            return ''
        p = nfc(unquote(urlparse(n.get('url') or '').path or ''))
        if not p or p == '/':
            return ''
        return p if p.endswith('/') else p + '/'

    def jsonld_news(n, url, L, img):
        o = {"@context": "https://schema.org", "@type": "NewsArticle", "@id": url + '#article', "headline": cut(T(L, n.get('title_ar')), 110),
             "datePublished": n.get('date'), "dateModified": n.get('date'), "image": [SITE + pct(img)], "author": {"@id": SITE + '/#org'},
             "publisher": {"@id": SITE + '/#org'}, "inLanguage": 'en' if L == 'en' else 'ar-EG',
             "mainEntityOfPage": {"@id": url + '#webpage'}, "description": clip(T(L, n.get('summary_ar') or ''), 300)}
        if n.get('url') and not news_own(n):
            o['isBasedOn'] = n['url']
        return o

    def jsonld_event(e, url, L, img):
        o = {"@context": "https://schema.org", "@type": "Event", "@id": url + '#event', "name": X(L, e.get('name_ar'), e.get('name_en') or e.get('name_ar')),
             "startDate": e.get('start_date'), "endDate": e.get('end_date') or e.get('start_date'), "eventStatus": "https://schema.org/EventScheduled",
             "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode", "url": url,
             "location": {"@type": "Place", "name": T(L, e.get('venue') or e.get('city') or ''), "address": {"@type": "PostalAddress", "addressLocality": T(L, e.get('city') or ''), "addressCountry": "EG"}}}
        if e.get('about_ar'):
            o['description'] = clip(T(L, e['about_ar']), 400)
        if e.get('organizer'):
            o['organizer'] = {"@type": "Organization", "name": T(L, e['organizer'])}
        if e.get('url'):
            o['sameAs'] = e['url']
        if img:
            o['image'] = [SITE + pct(img)]
        return o

    def jsonld_place(z, url, L, items):
        g = S['gov_by_code'].get(z['region_code'])
        o = {"@type": "Place", "@id": url + '#place', "name": X(L, z['name_ar'], z.get('name_en') or z['name_ar']), "url": url}
        if not z.get('approx') and z.get('lat') is not None and z.get('lon') is not None:
            o['geo'] = {"@type": "GeoCoordinates", "latitude": z['lat'], "longitude": z['lon']}
        if g:
            o['containedInPlace'] = {"@type": "AdministrativeArea", "name": X(L, g['ar'], g['en']), "url": abs_url(('/en' if L == 'en' else '') + '/governorates/%s/' % g['slug'])}
        if z.get('website'):
            o['sameAs'] = z['website']
        graph = [o]
        if items:
            graph.append(jsonld_itemlist(items, url))
        return {"@context": "https://schema.org", "@graph": graph}

    def jsonld_itemlist(items, url, name=None):
        seen = set()
        el = []
        for nm, path in items:
            u = abs_url(path)
            if u in seen:
                continue
            seen.add(u)
            el.append({"@type": "ListItem", "position": len(el) + 1, "url": u, "name": nm})
            if len(el) >= 50:
                break
        o = {"@type": "ItemList", "@id": url + '#list', "numberOfItems": len(el), "itemListElement": el}
        if name:
            o['name'] = name
        return o

    def jsonld_collection(items, url, name, about=None):
        g = [jsonld_itemlist(items, url, name)]
        if about:
            g.insert(0, about)
        return {"@context": "https://schema.org", "@graph": g}

    REQUIRED = {'Organization': ['name', '@id'], 'Product': ['name', 'url'], 'Demand': ['name', 'url'], 'NewsArticle': ['headline', 'datePublished', 'image'],
                'Event': ['name', 'startDate', 'location'], 'Place': ['name'], 'ItemList': ['itemListElement'], 'Thing': ['name'], 'AdministrativeArea': ['name'],
                'BreadcrumbList': ['itemListElement'], 'WebPage': ['url', 'name'], 'CollectionPage': ['url', 'name']}

    def validate_jsonld(text):
        o = json.loads(text)
        nodes = o.get('@graph') if isinstance(o, dict) and '@graph' in o else [o]
        types = []
        for nd in nodes:
            t = nd.get('@type')
            types.append(t)
            for k in REQUIRED.get(t, []):
                if not nd.get(k):
                    raise ValueError('JSON-LD %s missing %s' % (t, k))
        return types

    # ------------------------------------------------------------------ per-type text helpers
    def sec_name(slug, L, form='ar'):
        s = S['sec_by_slug'].get(slug or '')
        if not s:
            return ''
        return X(L, s['t_ar'] if form == 't' else s['ar'], s['t_en'] if form == 't' else s['en'])

    def gov_name(code, L):
        g = S['gov_by_code'].get(code or '')
        return X(L, g['ar'], g['en']) if g else ''

    def city_text(c, L):
        loc = (c.get('loc') or '').strip()
        if not loc or loc == 'جمهورية مصر العربية':
            return ''
        first = loc.split('،')[0].strip()
        if first in S['gov_ar2code'] and len(loc.split('،')) == 1:
            return ''
        return T(L, first) if L == 'en' and tr(first) else (first if L == 'ar' else '')

    VER_AR, VER_EN = '✓ موثّق من فريق المنصة', '✓ Verified by the platform team'
    PUB_AR, PUB_EN = 'بيانات من مصادر عامة – غير مسجّل في المنصة', 'Public-source data – not registered on the platform'

    def is_team(c):
        """one of the 91 MIGFAC companies, verified by hand by the platform team (its clients)"""
        return bool(c.get('team'))

    def is_pub(c):
        """a researched public-source row that is NOT a MIGFAC company: not registered on the platform"""
        return c['kind'] == 'public' and not c.get('team')

    def kind_counts(m):
        """(member companies — every MIGOLDFAC listing, the number home and about show —, factories among them, companies
        verified by the platform team, how many of those are also members, public-source rows). A verified company that is also
        a member is counted in both and said so: «… (منها 6 أعضاء)»; the unique total is members + verified-only + public."""
        mem = [c for c in m if c['kind'] == 'member']
        return (len(mem), sum(1 for c in mem if c['type'] == 'مصنع'), sum(1 for c in m if is_team(c)),
                sum(1 for c in mem if is_team(c)), sum(1 for c in m if is_pub(c)))

    def ar_count(n, one, two, few, many):
        """Arabic number agreement: 1 · 2 · 3–10 plural · 11+ singular accusative/singular"""
        k = n % 100
        return one if n == 1 else two if n == 2 else '%s %s' % (fmt_n(n), few if 3 <= k <= 10 else many)

    # Arabic counted nouns (owner report 2026-11-19: «دليل 8 مصنع», «دليل 1 مصنع» in the governorate titles): the forms for
    # 1 · 2 · 3–10 (plural) · 11–99 (singular, accusative) · 0 and 100, 101, 102 … (singular) — ar_qty(8, N_FAC_GEN) = «8 مصانع»
    N_FAC_GEN = ('مصنع واحد', 'مصنعين', 'مصانع', 'مصنعاً', 'مصنع')
    N_FAC_NOM = ('مصنع واحد', 'مصنعان', 'مصانع', 'مصنعاً', 'مصنع')
    N_FACCO_NOM = ('منشأة واحدة', 'منشأتان', 'مصانع وشركات', 'مصنعاً وشركة', 'مصنع وشركة')
    N_EST_NOM = ('منشأة واحدة', 'منشأتان', 'منشآت', 'منشأة', 'منشأة')
    N_EST_ACC = ('منشأة واحدة', 'منشأتين', 'منشآت', 'منشأة', 'منشأة')
    N_SEC_GEN = ('قطاع واحد', 'قطاعين', 'قطاعات', 'قطاعاً', 'قطاع')
    N_TND_NOM = ('مناقصة واحدة', 'مناقصتان', 'مناقصات', 'مناقصة', 'مناقصة')
    N_TND_ACC = ('مناقصة واحدة', 'مناقصتين', 'مناقصات', 'مناقصة', 'مناقصة')
    N_OPEN_NOM = ('واحدة سارية', 'ساريتان', 'سارية', 'سارية', 'سارية')
    N_PRJ_ACC = ('مشروعاً واحداً', 'مشروعين', 'مشروعات', 'مشروعاً', 'مشروع')
    N_ZONE_NOM = ('منطقة صناعية أو حرة واحدة', 'منطقتان صناعيتان أو حرتان', 'مناطق صناعية وحرة', 'منطقة صناعية وحرة', 'منطقة صناعية وحرة')
    N_ZONE3_NOM = ('منطقة صناعية أو حرة أو تكنولوجية واحدة', 'منطقتان صناعيتان أو حرتان أو تكنولوجيتان', 'مناطق صناعية أو حرة أو تكنولوجية',
                   'منطقة صناعية أو حرة أو تكنولوجية', 'منطقة صناعية أو حرة أو تكنولوجية')

    N_SUP_NOM = ('شركة أو مورد واحد', 'شركتان أو موردان', 'شركات وموردين', 'شركة ومورداً', 'شركة ومورد')
    N_OPP_NOM = ('فرصة سارية واحدة', 'فرصتان ساريتان', 'فرص سارية', 'فرصة سارية', 'فرصة سارية')
    N_FZ_ACC = ('منطقة حرة عامة واحدة', 'منطقتين حرتين عامتين', 'مناطق حرة عامة', 'منطقة حرة عامة', 'منطقة حرة عامة')
    N_PLAN_NOM = ('منطقة واحدة مخطط لها', 'منطقتان مخطط لهما', 'مناطق مخطط لها', 'منطقة مخطط لها', 'منطقة مخطط لها')
    N_GOV_GEN = ('محافظة واحدة', 'محافظتين', 'محافظات', 'محافظة', 'محافظة')

    def fac_sup(L, n_fac, n_sup):
        """«3 مصانع و5 شركات وموردين» / «3 factories and 5 companies & suppliers» (zero parts left out)"""
        if L == 'ar':
            return ' و'.join(x for x in ((ar_qty(n_fac, N_FAC_NOM) if n_fac else ''), (ar_qty(n_sup, N_SUP_NOM) if n_sup else '')) if x)
        return ' and '.join(x for x in ((en_qty(n_fac, 'factory', 'factories') if n_fac else ''), (en_qty(n_sup, 'company & supplier', 'companies & suppliers') if n_sup else '')) if x)

    N_CLOSED_NOM = ('واحدة انتهى موعدها', 'اثنتان انتهى موعدهما', 'انتهى موعدها', 'انتهى موعدها', 'انتهى موعدها')
    N_UND_NOM = ('واحدة بلا موعد إغلاق معلن', 'اثنتان بلا موعد إغلاق معلن', 'بلا موعد إغلاق معلن', 'بلا موعد إغلاق معلن', 'بلا موعد إغلاق معلن')

    def ar_qty(n, forms):
        n = int(n)
        k = n % 100
        if n == 1:
            return forms[0]
        if n == 2:
            return forms[1]
        return '%s %s' % (fmt_n(n), forms[2] if 3 <= k <= 10 else forms[3] if 11 <= k <= 99 else forms[4])

    def en_qty(n, one, many):
        return '%s %s' % (fmt_n(n), one if int(n) == 1 else many)

    def ver_pub_tail(L, n_ver, n_ver_mem, n_pub):
        """«، و91 شركة موثّقة من فريق المنصة (منها 6 أعضاء)، و3 من مصادر عامة غير مسجّلة في المنصة» (non-zero parts only)"""
        parts = []
        if n_ver:
            inner = ''
            if n_ver_mem:
                inner = X(L, ' (منها %s)' % ar_count(n_ver_mem, 'عضو واحد', 'عضوان', 'أعضاء', 'عضواً'),
                          ' (%s of them %s)' % (fmt_n(n_ver_mem), 'a member' if n_ver_mem == 1 else 'members'))
            parts.append(X(L, '%s من فريق المنصة%s' % (ar_count(n_ver, 'شركة واحدة موثّقة', 'شركتان موثّقتان', 'شركات موثّقة', 'شركة موثّقة'), inner),
                           '%s %s verified by the platform team%s' % (fmt_n(n_ver), 'company' if n_ver == 1 else 'companies', inner)))
        if n_pub:
            parts.append(X(L, '%s من مصادر عامة غير مسجّلة في المنصة' % fmt_n(n_pub), '%s from public sources that are not registered on the platform' % fmt_n(n_pub)))
        if not parts:
            return ''
        return X(L, '، و' + '، و'.join(parts), ', plus ' + ' and '.join(parts))

    def type_label(c, L):
        if c['kind'] == 'public':
            return X(L, c['type'] or 'مصنع', {'مصنع': 'Factory', 'شركة': 'Company'}.get(c['type'], 'Factory'))
        return X(L, c['type'], {'مصنع': 'Factory', 'شركة ومورد': 'Company & supplier'}.get(c['type'], c['type']))

    def company_desc_en(c):
        """English description: dictionary entry of the original text (keyed by the raw description), then scrubbed like the Arabic
        (contacts, street address); '' when there is no Arabic text, None when it has no (clean) English twin"""
        if 'desc_en' in c:
            return c['desc_en']
        v = None
        if c['desc']:
            for src in (c.get('desc_raw'), (c['pfx'] + ' | ' + c['desc_raw']) if c.get('pfx') and c.get('desc_raw') else None, c['desc'],
                        (c['pfx'] + ' | ' + c['desc']) if c.get('pfx') else None):
                if src:
                    v = tr(src)
                    if v:
                        break
            v = scrub(v) if v else None
            v = v or None
        else:
            v = ''
        c['desc_en'] = v
        return v

    def product_desc(p, L):
        d = p['desc']
        if L == 'ar':
            return d
        m = re.match(r'^من إنتاج\s+(.+)$', d or '')
        if m:
            mk = p['maker']
            nm = (mk.get('name_en') if mk else None) or tr(m.group(1))
            return ('Made by %s' % nm) if nm else None
        if not d:
            return ''
        v = tr(p.get('desc_raw') or d) or tr(d)
        return (scrub(v) or None) if v else None

    def tender_status_label(t, L):
        # the same four honest labels as the data (MIGTEND) and the interactive lists: سارية / تنتهي قريباً / منتهية / غير محدد الموعد
        return {'open': X(L, 'سارية', 'Open'), 'soon': X(L, 'تنتهي قريباً', 'Closing soon'), 'closed': X(L, 'منتهية', 'Closed'),
                'undated': X(L, 'غير محدد الموعد', 'No deadline given')}[t['status']]

    # the procurement type of an international tender is the raw kind of REAL.tenders_intl («gov» / «pvt»): its label, never the code
    INTL_KIND = {'gov': ('مناقصة حكومية', 'Government tender'), 'pvt': ('مناقصة قطاع خاص', 'Private-sector tender')}

    def tender_kind(t, L):
        if t['src'] == 'intl':
            k = INTL_KIND.get((t.get('ptype') or '').strip().lower())
            return X(L, k[0], k[1]) if k else X(L, 'مناقصة', 'Tender')
        return T(L, t['ptype']) if t['ptype'] else X(L, 'مناقصة', 'Tender')

    def tender_summary(t, L):
        parts = [tender_kind(t, L)]
        ent = T(L, t['entity'], t.get('entity_en')) if t['entity'] else ''
        s = '%s%s: %s.' % (parts[0], (X(L, ' من ', ' by ') + ent) if ent else '', T(L, t['title'], t.get('title_en')))
        if t.get('deadline'):
            s += X(L, ' آخر موعد %s.', ' Closing date %s.') % fmt_date(t['deadline'], L)
        return s

    # the old site's RFQ titles end with the request date and number, sometimes glued to the last word
    # («…بأطوال مختلفة2-11-2026 -0137769», «…للقسم القيصري 3-11-2026 -0137770», «… – رقم الطلب: 0137789»): both are facts of the page, not of the title
    RFQ_TAIL_AR = re.compile(r'(?:\s*[–\-]?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{4}(?:\s*[–\-]?\s*(?:رقم الطلب\s*:?\s*)?\d{4,})?|\s*[–\-]\s*رقم الطلب\s*:?\s*\d+)\s*$')
    RFQ_TAIL_EN = re.compile(r'(?:\s*[–\-]?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{4}(?:\s*[–\-]?\s*(?:(?:request|ref(?:erence)?)\s*(?:no\.?|number)?\s*:?\s*)?\d{4,})?|\s*[–\-]\s*(?:request|ref(?:erence)?)\s*(?:no\.?|number)\s*:?\s*\d+)\s*$', re.I)

    def rfq_title(r, L):
        t = r['title']
        t = re.sub(r'\s*–\s*بتاريخ\s*[\d\-/]+.*$', '', t)
        t = re.sub(r'^(?:تقرير تحليل\s+)?طلب عرض (?:سعر|الأسعار)\s*[–\-:]\s*', '', t).strip()
        t = RFQ_TAIL_AR.sub('', t).rstrip(' –-:،,') or t
        if L == 'en':
            v = tr(t) or tr(r['title'])
            if v:
                v = re.sub(r'\s*[–\-]\s*(?:dated|on|date[d]?:?)\s.*$', '', v, flags=re.I)
                v = re.sub(r'^(?:analysis report\s*[:–-]?\s*)?(?:request for (?:a )?(?:price )?quotations?|rfq|price quotation request|quotation request)\s*[–\-:]\s*', '', v, flags=re.I).strip()
                v = RFQ_TAIL_EN.sub('', v).rstrip(' –-:,') or v
                return v[:1].upper() + v[1:]
            return t
        return t

    def money_egp(v, L):
        if v in (None, '', 0):
            return ''
        try:
            v = float(v)
        except Exception:
            return str(v)
        s = '{:,.0f}'.format(v)
        return X(L, '%s جنيه', 'EGP %s') % s

    # ------------------------------------------------------------------ list item helpers
    def company_li(c, L):
        P = '/en' if L == 'en' and c.get('en_ok') else ''
        meta = ' · '.join(x for x in [type_label(c, L), gov_name(c['gov'], L) or X(L, 'المحافظة غير محددة', 'Governorate not given')] if x)
        snip = ''
        if L == 'ar' and c['desc']:
            snip = '<p>%s</p>' % esc(first_words(c['desc'], 18))
        elif L == 'en':
            v = company_desc_en(c)
            if v:
                snip = '<p>%s</p>' % esc(first_words(v, 18))
        pub = (('<span class="pub">%s</span>' % X(L, PUB_AR, PUB_EN)) if is_pub(c) else
               ('<span class="vf">%s</span>' % X(L, VER_AR, VER_EN)) if is_team(c) else '')
        nm = T(L, c['name'], c.get('name_en'))
        return '<li><a href="%s"%s>%s</a><span class="m">%s</span>%s%s</li>' % (esc(lk(L, c['path'])), '' if L == 'ar' or not AR_RX.search(nm) else ' lang="ar"', esc(nm), esc(meta), snip, pub)

    def sort_companies(lst):
        # indexable profiles first; the companies verified by the platform team, then member listings, then public-source rows
        return sorted(lst, key=lambda c: (0 if c.get('index') else 1, 0 if is_team(c) else 1 if c['kind'] == 'member' else 2, -min(c['words'], 80), name_key(c['name'])))

    # ------------------------------------------------------------------ page registry
    def add_page(spec):
        """spec: {path, type, lang, render(L) -> (body_html, meta), index, why, rec_hash, real_date, cluster, ar (False = EN page only)}"""
        S['specs'].append(spec)
        if spec.get('ar', True):
            S['paths'].add(spec['path'])

    def page_exists(path):
        if path in S['paths'] or path in S['en_paths']:
            return True
        return os.path.exists(S['OUT'] + path.lstrip('/') + 'index.html')

    # ------------------------------------------------------------------ renderers (each returns (body_html, meta) for language L)
    def render_company(c, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + c['path'])
        sec = S['sec_by_slug'].get(c['sslug'] or '')
        sh = S['hub_sector_by_slug'].get(c['sslug'] or '')
        g = S['gov_by_code'].get(c['gov'])
        name = T(L, c['name'], c.get('name_en'))
        items = [home_crumb(L), (X(L, 'دليل المصانع', 'Factory directory'), lk(L, '/factories/'))]
        if sh:
            items.append((X(L, sec['t_ar'], sec['t_en']), lk(L, sh['path'])))
        items.append((name, lk(L, c['path'])))
        ch, crumb_ld = crumbs(items, L, url)
        city = city_text(c, L)
        place = ', '.join(x for x in [city, gov_name(c['gov'], L)] if x) if L == 'en' else '، '.join(x for x in [city, gov_name(c['gov'], L)] if x)
        desc_text = c['desc'] if L == 'ar' else (company_desc_en(c) or '')
        if is_team(c):
            status = X(L, VER_AR, VER_EN)
        elif is_pub(c):
            status = X(L, PUB_AR, PUB_EN)
        else:   # imported member listing (MIGOLDFAC): no verified badge, no public-source label
            status = X(L, 'مدرجة في دليل المنصة', 'Listed in the platform directory')
        intro = ''
        if sec:
            intro = X(L, '%s: %s في قطاع %s%s.', '%s: %s in the %s sector%s.') % (
                name, type_label(c, L), X(L, sec['ar'], sec['en']), (X(L, ' – ', ' – ') + place) if place else '')
        facts = [(X(L, 'النوع', 'Type'), esc(type_label(c, L)))]
        if sh:
            facts.append((X(L, 'القطاع', 'Sector'), '<a href="%s">%s</a>' % (esc(lk(L, sh['path'])), esc(X(L, sec['ar'], sec['en'])))))
        elif sec:
            facts.append((X(L, 'القطاع', 'Sector'), esc(X(L, sec['ar'], sec['en']))))
        if g:
            gh = S['hub_gov_by_code'].get(c['gov'])
            facts.append((X(L, 'المحافظة', 'Governorate'), '<a href="%s">%s</a>' % (esc(lk(L, gh['path'])), esc(X(L, g['ar'], g['en']))) if gh else esc(X(L, g['ar'], g['en']))))
        else:   # honest: the record only says «جمهورية مصر العربية» (or nothing) — never a guessed governorate
            facts.append((X(L, 'المحافظة', 'Governorate'), esc(X(L, 'مصر — المحافظة غير محددة', 'Egypt — governorate not specified'))))
        z = S['zone_by_id'].get(c.get('zone') or '')
        if z:
            facts.append((X(L, 'المدينة / المنطقة الصناعية', 'City / industrial zone'), '<a href="%s">%s</a>' % (esc(lk(L, z['path'])), esc(X(L, z['name_ar'], z.get('name_en') or z['name_ar'])))))
        elif city:
            facts.append((X(L, 'المدينة', 'City'), esc(city)))
        facts.append((X(L, 'حالة العضوية', 'Listing status'), esc(status)))
        if c['kind'] == 'member' and c['flags']:
            miss = [S['inc_bits'].get(str(b)) for b in (1, 2, 4, 8, 16, 32, 64, 128) if c['flags'] & b]
            miss = [m for m in miss if m]
            if miss:
                facts.append((X(L, 'بيانات غير مكتملة', 'Incomplete data'), esc(X(L, '، '.join(miss), ', '.join(T(L, m) for m in miss)))))
        if c['kind'] == 'public' and c.get('source'):
            facts.append((X(L, 'مصدر البيانات', 'Data source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(c['source']), esc(urlparse(c['source']).netloc.replace('www.', '') or c['source']))))
        if c['kind'] == 'public' and c.get('website'):
            facts.append((X(L, 'الموقع الرسمي', 'Official website'), '<a href="%s" rel="noopener" target="_blank">%s</a>' % (esc(c['website']), esc(urlparse(c['website']).netloc.replace('www.', '') or c['website']))))
        facts.append((X(L, 'آخر تحديث للبيانات', 'Data last updated'), esc(fmt_date(S['lastmod_of'].get(c['path']) or S['today'].isoformat(), L))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        # products
        prods = c.get('prods') or []
        p_html = ''
        if prods:
            # the company's own products with their photos (a product without a photo gets a styled tile, never the grey placeholder)
            p_html = '<ul class="plist">%s</ul>' % ''.join(product_li(p, L, maker=False) for p in prods)
        extra_names = [n for n in c['names'] if n not in {p['name'] for p in prods}]
        if extra_names:
            p_html += '<div class="links">%s</div>' % ''.join('<span class="chip chip-gray">%s</span>' % esc(T(L, n)) for n in extra_names[:24])
        # similar companies: same sector, same governorate first
        sim = S['sim_of'](c)
        sim_html = ''.join(company_card(s, L) for s in sim)
        sg = S['hub_sg_by_key'].get((c['sslug'], c['gov']))
        sg_link = ''
        if sg and sg['indexable'] and (L == 'ar' or sg.get('en')):
            sg_link = '<p><a href="%s">%s</a></p>' % (esc(lk(L, sg['path'])), esc(X(L, 'كل %s %s في %s (%d)', 'All %s %s in %s (%d)') % (
                X(L, sec['noun_ar'], sec['noun_en'].lower()), X(L, sec['t_ar'], sec['t_en']), gov_name(c['gov'], L), sg['n'])))
        rfq = rfq_link(c, L)
        if desc_text:
            about = '<p>%s</p>' % esc(desc_text)
        elif L == 'en' and c['kind'] == 'public' and c['desc']:
            about = ''   # a researched / verified company whose Arabic text has no English twin yet: facts only, never a false "no description"
        else:
            about = '<p class="muted">%s</p>' % X(L, 'لم تُضف المنشأة وصفاً لنشاطها بعد.', 'No business description has been added yet.')
        body_main = ('<div class="card2"><h2>%s</h2>%s</div>' % (X(L, 'عن المنشأة', 'About the company'), about)) if about else ''
        if is_team(c):
            body_main = '<p class="vtag">%s</p>' % X(L, VER_AR + ' – راجع فريق المنصة بيانات هذه الشركة يدوياً.', VER_EN + ' – the platform team checked this company\'s details by hand.') + body_main
        elif is_pub(c):
            body_main = '<p class="pubtag">%s</p>' % X(L, 'بيانات من مصادر عامة – غير مسجّل في المنصة. المعلومات أدناه منقولة من المصدر المذكور وليست ملفاً مسجّلاً من المنشأة.', 'Public-source data – not registered on the platform. The details below come from the cited source; this is not a profile registered by the company.') + body_main
        if p_html:
            body_main += '<div class="card2 sx-gal"><h2>%s</h2>%s</div>' % (X(L, 'المنتجات والخدمات', 'Products & services'), p_html)
        if sim_html:
            body_main += '<div class="card2 sx-dir"><h2>%s</h2><ul class="dir-list">%s</ul>%s</div>' % (X(L, 'منشآت مشابهة', 'Similar companies'), sim_html, sg_link)
        aside = ('<div class="card2"><h2>%s</h2>%s</div>%s' % (X(L, 'بيانات المنشأة', 'Company facts'), facts_html, rfq_box(L, rfq, c['kind'] == 'member')))
        # the profile header of the interactive pages: the sector photo (illustrative, never this company's own plant) behind the logo
        cov = sec_cover(c['sslug'])
        n_pr = len([p for p in prods if prod_img(p)])
        bits = [(type_label(c, L), X(L, 'النوع', 'Type')), (gov_name(c['gov'], L) or X(L, 'غير محددة', 'not given'), X(L, 'المحافظة', 'Governorate'))]
        if sec:
            bits.append((X(L, sec['t_ar'], sec['t_en']), X(L, 'القطاع', 'Sector')))
        if prods or c['names']:
            k_ = len(prods) or len(c['names'])
            bits.append((fmt_n(k_), X(L, ar_noun(k_, 'منتج', 'منتجان', 'منتجات', 'منتجاً') + (' بالصور' if n_pr else ''), 'products' + (' with photos' if n_pr else ''))))
        band = '<div class="sx-band">%s</div>' % ''.join('<div><b>%s</b><span>%s</span></div>' % (esc(v), esc(k)) for v, k in bits if v)
        acts = hero_acts(L, [(X(L, '📝 اطلب عرض سعر', '📝 Request a quote'), rfq, 'gold'),
                             ((X(L, 'كل %s %s' % (sec['noun_ar'], sec['t_ar']), 'All %s %s' % (sec['t_en'], sec['noun_en'].lower()))) if sec else '', lk(L, sh['path']) if (sh and sh['indexable'] and (L == 'ar' or sh.get('en'))) else '', 'glass')])
        logo = c.get('logo_img')
        body = hero(L, ch, name, intro, extra='', logo=logo[0] if logo else None, img=cov, alt=photo_alt(cov, L, X(L, sec['t_ar'], sec['t_en']) if sec else ''), acts=acts) + \
            '<div class="wrap sx-main">%s<div class="sx-grid"><div>%s</div><aside>%s</aside></div></div>' % (band, body_main, aside)
        loc_t = city or gov_name(c['gov'], L)
        sec_t = X(L, sec['t_ar'], sec['t_en']) if sec else ''
        extra = c.get('tx_' + L)
        if extra:
            cands = ['%s – %s' % (name, extra), '%s – %s' % (cut(name, 60 - len(extra)), extra)]
        else:
            cands = [X(L, '%s – %s في %s', '%s – %s in %s') % (name, sec_t, loc_t) if sec_t and loc_t else '', '%s – %s' % (name, sec_t) if sec_t else '', name]
        title = mk_title(cands, L)
        prod_names = [T(L, p['name'], p['name_en']) for p in prods[:3]] or [T(L, n) for n in c['names'][:3]]
        dparts = [X(L, '%s: %s %s%s.', '%s: %s %s%s.') % (name, type_label(c, L), X(L, 'في قطاع ' + sec['ar'], 'in ' + sec['en']) if sec else '', (X(L, ' في ', ' in ') + (loc_t or '')) if loc_t else '')]
        if prod_names:
            dparts.append(X(L, 'المنتجات: %s.', 'Products: %s.') % X(L, '، '.join(prod_names), ', '.join(prod_names)))
        if desc_text:
            dparts.append(clip(desc_text, 90))
        if is_pub(c):
            dparts.insert(1, X(L, 'بيانات من مصادر عامة.', 'Public-source data.'))
        # the verification statement goes into the fixed tail, so a long first sentence can never push it out of the description
        dtail = X(L, VER_AR + '. اطلب عرض سعر عبر المنصة.', VER_EN + '. Request a quote via the platform.') if is_team(c) else X(L, 'اطلب عرض سعر عبر المنصة.', 'Request a quote via the platform.')
        meta = {'title': title, 'desc': mk_desc(dparts, L, dtail), 'h1': name, 'og_type': 'website',
                'jsonld_page': jsonld_company(c, url, L), 'jsonld_crumbs': crumb_ld, 'page_type': 'WebPage', 'og_image': None,
                'en_fail': 'desc_untranslated' if (L == 'en' and c['desc'] and not desc_text and c['kind'] == 'member') else '',
                'keywords': ', '.join(x for x in [name, sec_t and X(L, '%s %s' % (sec['noun_ar'], sec_t), '%s %s' % (sec_t, sec['noun_en'])), gov_name(c['gov'], L)] if x),
                'kw': name, 'about_id': url + '#org'}
        if FPROF:   # FPROF hook: the rich profile layout replaces the body; title, meta, JSON-LD and the EN-gate decision stay those of this classic page
            body = FPROF['render'](c, L, body, meta)
        return body, meta

    def rfq_link(target, L, kind='company'):
        P = '/en' if L == 'en' else ''
        rn = url_for('rfq-new', lang=L) if page_exists(url_for('rfq-new', lang=L)) else url_for('rfq-new')
        if target is None:
            return rn
        name = target.get('name') or ''
        q = 'to=%s&t=%s&id=%s&n=%s' % (quote(P + target['path'], safe='/'), kind, quote(str(target.get('hid') or target.get('rid') or '')), quote(name))
        return rn + '?' + q

    def rfq_box(L, href, member=True, title=None):
        return ('<div class="cta"><h2 style="font-size:1.05rem">%s</h2><p>%s</p><a class="btn btn-green" href="%s" rel="nofollow">%s</a>'
                '<p class="note">%s</p></div>'
                % (title or X(L, 'اطلب عرض سعر', 'Request a quote'),
                   X(L, 'يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه.',
                     'Your request reaches the matching registered factories automatically; if no registered factory matches, the platform team follows it up personally.'),
                   esc(href), X(L, 'اطلب عرض سعر مجاناً', 'Request a free quote'),
                   X(L, 'لا نعرض أرقام هواتف أو بريد المنشآت؛ التواصل يتم عبر نموذج طلب عرض السعر فقط.', 'Company phone numbers and e-mails are not published; contact goes through the RFQ form only.')))

    def cta_box(L, title, text, href, label, rel=''):
        return ('<div class="cta"><h2 style="font-size:1.05rem">%s</h2><p>%s</p><a class="btn btn-green" href="%s"%s>%s</a></div>'
                % (esc(title), esc(text), esc(href), (' rel="%s"' % rel) if rel else '', esc(label)))

    def faq_html(L, qa):
        return ('<section class="card2"><h2>%s</h2><div class="faq">%s</div></section>'
                % (X(L, 'أسئلة شائعة', 'Frequently asked questions'), ''.join('<details><summary>%s</summary><p>%s</p></details>' % (esc(q), esc(a)) for q, a in qa)))

    def top_counts(items, key, n):
        cnt = {}
        for it in items:
            k = key(it)
            if k:
                cnt[k] = cnt.get(k, 0) + 1
        return sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[:n]

    def join_list(xs, L):
        xs = [x for x in xs if x]
        if not xs:
            return ''
        if L == 'en':
            return ', '.join(xs[:-1]) + (' and ' + xs[-1] if len(xs) > 1 else xs[0]) if len(xs) > 1 else xs[0]
        return '، '.join(xs[:-1]) + (' و' + xs[-1]) if len(xs) > 1 else xs[0]

    def render_listing(L, kind, rec, members, page_n, pages, base_path, h1, intro, title_cands, dparts, crumb_items, extra_top='', extra_bottom='', faq=None,
                       jsonld_about=None, kw='', cluster='', csv_link='', himg=None, halt=None, hacts='', after_hero='', list_into=None):
        """after_hero: markup between the hero and the main column (every page of the list); list_into(list_html): page 1 only, the
        main column before extra_bottom built around the company list (the governorate pages put it into a tab)"""
        P = '/en' if L == 'en' else ''
        url = abs_url(P + base_path + ('page/%d/' % page_n if page_n > 1 else ''))
        ch, crumb_ld = crumbs(crumb_items, L, url)
        size = S['cfg']['listing_page_size']
        chunk = members[(page_n - 1) * size: page_n * size]
        pg = pager(L, base_path, page_n, pages)
        head_note = (X(L, 'المنشآت %s–%s من %s', 'Companies %s–%s of %s') % (fmt_n((page_n - 1) * size + 1), fmt_n((page_n - 1) * size + len(chunk)), fmt_n(len(members)))) if members else ''
        # the same list as before (name link, type · governorate, snippet, label), as the directory's photo cards
        lst = ('<section class="sx-sec" id="list"><div class="sx-sh"><h2>%s</h2></div><p class="note">%s%s</p>%s%s</section>'
               % (X(L, 'قائمة المنشآت', 'Company list'), esc(head_note), (' · ' + csv_link) if csv_link else '', company_cards(chunk, L), pg)) if members else ''
        main = ((extra_top if page_n == 1 else '') + lst) if not (list_into and page_n == 1) else list_into(lst)
        body = (hero(L, ch, h1, intro if page_n == 1 else (X(L, 'صفحة %d من قائمة: ', 'Page %d of: ') % page_n) + h1, img=himg, alt=halt,
                     acts=hacts if page_n == 1 else '', small=page_n > 1) + after_hero
                + '<div class="wrap sx-main">%s%s%s</div>' % (main, extra_bottom if page_n == 1 else '', faq_html(L, faq) if (faq and page_n == 1) else ''))
        items = [(T(L, c['name'], c.get('name_en')), ('/en' if L == 'en' and c.get('en_ok') else '') + c['path']) for c in chunk]
        meta = {'title': mk_title(title_cands, L, page=page_n), 'desc': mk_desc(dparts if page_n == 1 else [(X(L, 'صفحة %d: ', 'Page %d: ') % page_n) + (dparts[0] if dparts else h1)] + dparts[1:], L),
                'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection(items, url, h1, jsonld_about), 'kw': kw, 'keywords': kw}
        return body, meta

    def sector_hub_data(sh):
        return sh['members']

    def render_sector_hub(sh, L, page_n=1):
        sec = sh['sec']
        P = '/en' if L == 'en' else ''
        m = sh['members']
        n = len(m)
        n_mem, n_fac, n_ver, n_ver_mem, n_pub = kind_counts(m)
        n_sup = n_mem - n_fac
        govs = top_counts(m, lambda c: c['gov'], 6)
        unk = sum(1 for c in m if not c['gov'])
        noun, t_ = X(L, sec['noun_ar'], sec['noun_en']), X(L, sec['t_ar'], sec['t_en'])
        h1 = X(L, '%s %s في مصر', '%s %s in Egypt') % ((noun, t_) if L == 'ar' else (t_, noun))
        gov_bits = [X(L, '%s (%d)', '%s (%d)') % (gov_name(g, L), k) for g, k in govs[:4]]
        prods = top_counts([nm for c in m for nm in (c['names'] or [])], lambda x: x, 6)
        prod_names = [T(L, p) for p, _ in prods]
        tcat = S['cat_for_sector'].get(sec['slug'])
        topen = sum(1 for t in S['tenders'] if t['cat'] == (tcat or {}).get('slug') and t['status'] in ('open', 'soon')) if tcat else 0
        ttot = sum(1 for t in S['tenders'] if t['cat'] == (tcat or {}).get('slug')) if tcat else 0
        zones = [z for z in S['zones'] if any(norm_sector(f) == sec['slug'] for f in (z.get('focus_sectors_ar') or []))][:6]
        if L == 'ar':
            fs_ = fac_sup(L, n_fac, n_sup)
            intro = 'يضم دليل منصة صنع في مصر %s في قطاع %s%s' % (ar_qty(n, N_EST_ACC), sec['ar'], (': %s من المنشآت الأعضاء في دليل المنصة' % fs_) if fs_ else '')
            intro += ver_pub_tail(L, n_ver, n_ver_mem, n_pub) + '.'
            if gov_bits:
                intro += ' تتركز المنشآت في %s' % join_list(gov_bits, L) + ((' بينما لم تُحدَّد المحافظة لـ%s.' % ar_qty(unk, N_EST_ACC)) if unk else '.')
            if prod_names:
                intro += ' ومن المنتجات المذكورة في ملفات المنشآت: %s.' % '، '.join(prod_names)
            if ttot:
                intro += ' وفي قسم المناقصات %s في فئة «%s»، %s.' % (ar_qty(ttot, N_TND_NOM), tcat['ar'], ('منها ' + ar_qty(topen, N_OPEN_NOM) + ' الآن') if topen else 'ولا توجد بينها مناقصة سارية الآن')
            intro += ' الأرقام محسوبة من بيانات الدليل عند آخر تحديث للصفحة.'
        else:
            fs_ = fac_sup(L, n_fac, n_sup)
            intro = 'The Made in Egypt Gate directory lists %s in the %s sector%s' % (en_qty(n, 'company', 'companies'), sec['en'], (': %s among its member companies' % fs_) if fs_ else '')
            intro += ver_pub_tail(L, n_ver, n_ver_mem, n_pub) + '.'
            if gov_bits:
                intro += ' Most are in %s' % join_list(gov_bits, L) + ((', while %s %s no governorate on file.' % (fmt_n(unk), 'has' if unk == 1 else 'have')) if unk else '.')
            if prods and all(tr(p) for p, _ in prods):
                intro += ' Products named in the profiles include %s.' % ', '.join(prod_names)
            if ttot:
                intro += ' The tenders section holds %s tenders in the «%s» category, %s of them open now.' % (fmt_n(ttot), tcat['en'], fmt_n(topen))
            intro += ' Figures are computed from the directory data at the last update.'
        # neighbour hubs and sector × governorate links (the same links as before, as governorate photo tiles)
        sg_tiles = []
        for g, k in top_counts(m, lambda c: c['gov'], 27):
            sg = S['hub_sg_by_key'].get((sec['slug'], g))
            href = ''
            if sg and sg['indexable'] and (L == 'ar' or sg.get('en')):
                href = lk(L, sg['path'])
            else:
                gh = S['hub_gov_by_code'].get(g)
                if gh and (L == 'ar' or gh.get('en')):
                    href = lk(L, gh['path'])
            if href:
                gp = gov_photo(g)
                sg_tiles.append(tile_li(href, gp, photo_alt(gp, L, gov_name(g, L)), '%s <small>(%d)</small>' % (esc(gov_name(g, L)), k), g))
        others = [s for s in S['hub_sectors'] if s['indexable'] and s['sec']['slug'] != sec['slug'] and (L == 'ar' or s.get('en'))][:12]
        app = app_url('factories')
        n_gov = len([g for g, k in top_counts(m, lambda c: c['gov'], 27)])
        th = S['hub_cat_by_slug'].get(tcat['slug']) if (tcat and ttot) else None
        th_ok = bool(th and (L == 'ar' or th.get('en')))
        top = stats_html([(fmt_n(n), X(L, ar_noun(n, 'منشأة', 'منشأتان', 'منشآت', 'منشأة') + ' في القطاع', 'companies in the sector'), app or '#list'),
                          (fmt_n(n_fac), X(L, ar_noun(n_fac, 'مصنع', 'مصنعان', 'مصانع', 'مصنعاً'), 'factories'), ''),
                          (str(n_gov), X(L, ar_noun(n_gov, 'محافظة', 'محافظتان', 'محافظات', 'محافظة') + ' فيها منشآت القطاع', 'governorates with companies of the sector'), '#governorates' if sg_tiles else ''),
                          ((fmt_n(topen), X(L, ar_noun(topen, 'مناقصة سارية', 'مناقصتان ساريتان', 'مناقصات سارية', 'مناقصة سارية') + ' في الفئة', 'open tenders in the category'), lk(L, th['path'])) if (th_ok and topen) else
                           (fmt_n(ttot), X(L, ar_noun(ttot, 'مناقصة', 'مناقصتان', 'مناقصات', 'مناقصة') + ' في فئة القطاع', 'tenders in the category'), lk(L, th['path'])) if th_ok else
                           (fmt_n(n_ver), X(L, ar_noun(n_ver, 'شركة موثّقة', 'شركتان موثّقتان', 'شركات موثّقة', 'شركة موثّقة'), 'verified companies'), '') if n_ver else
                           (fmt_n(n_sup), X(L, ar_noun(n_sup, 'شركة ومورد', 'شركتان وموردان', 'شركات وموردين', 'شركة ومورداً'), 'companies & suppliers'), ''))])
        top += search_box(L, app, X(L, 'ابحث في %s %s…' % (noun, t_), 'Search %s %s…' % (t_, noun.lower())), govs=True, hash_q=True)
        if sg_tiles:
            top += '<section class="sx-sec" id="governorates">%s<ul class="sx-tiles">%s</ul></section>' % (sec_head(X(L, 'حسب المحافظة', 'By governorate')), ''.join(sg_tiles))
        if th_ok:
            top += '<p class="banner-info"><a href="%s">%s</a></p>' % (esc(lk(L, th['path'])), esc(X(L, 'مناقصات %s (%d، منها %d سارية) ←', '%s tenders (%d, %d open) →') % (X(L, tcat['ar'], tcat['en']), ttot, topen)))
            op3 = [t for t in th['tenders'] if t['status'] in ('open', 'soon') and t.get('page') and (L == 'ar' or name_ok(L, t['title'], t.get('title_en')))][:3]
            if op3:
                top += tender_cards(op3, L)
        if zones:
            top += '<section class="sx-sec">%s%s</section>' % (sec_head(X(L, 'مناطق صناعية تستهدف القطاع', 'Industrial zones targeting this sector')), zone_tiles(L, zones))
        sp = featured_products(L, 8, [p for p in S['products_listed'] if p.get('sslug') == sec['slug']])
        if sp:
            top += visual_strips(L, products=sp)
        bottom = '<section class="sx-sec">%s%s%s</section>' % (
            sec_head(X(L, 'قطاعات أخرى', 'Other sectors')), sector_tiles(L, others),
            ('<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'بحث وفلترة تفاعلية في الدليل ←', 'Interactive directory search →'))) if app else '')
        gtxt = join_list([gov_name(g, L) for g, k in govs[:3]], L)
        faq = [(X(L, 'كم عدد %s %s في دليل المنصة؟', 'How many %s %s are listed?') % ((noun, t_) if L == 'ar' else (t_, noun.lower())),
                X(L, 'يضم الدليل %s في هذا القطاع (%s%s). الرقم محسوب من بيانات الدليل بتاريخ %s.' % (
                    ar_qty(n, N_EST_ACC), fac_sup(L, n_fac, n_sup), ver_pub_tail(L, n_ver, n_ver_mem, n_pub), fmt_date(S['today'], L)),
                  'The directory lists %s in this sector (%s%s). Counted from the directory data on %s.' % (
                    en_qty(n, 'company', 'companies'), fac_sup(L, n_fac, n_sup), ver_pub_tail(L, n_ver, n_ver_mem, n_pub), fmt_date(S['today'], L))))]
        if gtxt:
            faq.append((X(L, 'في أي المحافظات تتركز %s %s؟', 'Where are %s %s located?') % ((noun, t_) if L == 'ar' else (t_, noun.lower())),
                        X(L, 'أكثر المحافظات في الدليل: %s.', 'The top governorates in the directory are %s.') % join_list(gov_bits[:5], L)))
        faq.append((X(L, 'كيف أطلب عرض سعر من %s %s؟', 'How do I request a quote from %s %s?') % ((noun, t_) if L == 'ar' else (t_, noun.lower())),
                    X(L, 'أرسل طلب عرض سعر واحداً بالمنتج والكمية: يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه.',
                      'Send one request with the product and quantity: it reaches the matching registered factories automatically; if none matches, the platform team follows it up personally.')))
        if n_pub:
            faq.append((X(L, 'هل كل المنشآت في القائمة مسجّلة في المنصة؟', 'Are all listed companies registered on the platform?'),
                        X(L, 'لا. المنشآت الموسومة «بيانات من مصادر عامة» غير مسجّلة في المنصة، وبياناتها منقولة من مصادر منشورة مذكورة في صفحة كل منشأة.',
                          'No. Companies tagged «public-source data» are not registered on the platform; their details come from published sources cited on each page.')))
        crumb_items = [home_crumb(L), (X(L, 'دليل المصانع', 'Factory directory'), lk(L, '/factories/')), (X(L, sec['t_ar'], sec['t_en']), lk(L, sh['path']))]
        # «(4 مصانع وشركات)»، «(منشأتان)»، «(25 مصنعاً وشركة)» (ar_qty)
        title_c = [X(L, '%s %s في مصر (%s) – دليل %d' % (noun, t_, ar_qty(n, N_FACCO_NOM), S['today'].year),
                     '%s %s in Egypt (%s)' % (t_, noun, '1 Company' if n == 1 else '%s Factories & Suppliers' % fmt_n(n))),
                   X(L, '%s %s في مصر (%s)', '%s %s in Egypt (%s)') % ((noun, t_, fmt_n(n)) if L == 'ar' else (t_, noun, fmt_n(n))), h1]
        n_g = len([g for g, k in top_counts(m, lambda c: c['gov'], 27)])
        if L == 'ar':
            dparts = ['%s في قطاع %s%s.' % (ar_qty(n, N_EST_NOM), sec['ar'], ((' في محافظة واحدة هي %s' % gtxt) if n_g == 1 else (' في %s، أبرزها %s' % (ar_qty(n_g, N_GOV_GEN), gtxt))) if (n_g and gtxt) else '')]
        else:
            dparts = ['%s %s in %s, incl. %s.' % (fmt_n(n), sec['t_en'] + (' company' if n == 1 else ' companies'), en_qty(n_g, 'governorate', 'governorates'), gtxt) if (n_g and gtxt) else
                      '%s %s.' % (fmt_n(n), sec['t_en'] + (' company' if n == 1 else ' companies'))]
        if prod_names:
            dparts.append(X(L, 'منتجات: %s.', 'Products: %s.') % X(L, '، '.join(prod_names[:2]), ', '.join(prod_names[:2])))
        csv_link = ('<a href="%s" download>%s</a>' % (esc(sh['csv']), X(L, 'تحميل القائمة (CSV)', 'Download the list (CSV)'))) if sh.get('csv') else ''
        acts = hero_acts(L, [(X(L, '📝 اطلب عرض سعر من %s %s' % (noun, t_), '📝 Request a quote from %s %s' % (t_, noun.lower())), rfq_link(None, L), 'gold'),
                             (X(L, '🏭 سجّل منشأتك في القطاع', '🏭 List your company'), static_url('register', L, '#plans'), 'glass')])
        hp = sec_photo(sec['slug'])
        return render_listing(L, 'hub-sector', sh, sh['members'], page_n, sh['pages'], sh['path'], h1, intro, title_c, dparts, crumb_items, top, bottom, faq,
                              None, kw_for('B', L, noun=noun if L == 'ar' else noun.lower(), sector=t_ if L == 'ar' else t_.lower()), 'B', csv_link,
                              himg=hp, halt=photo_alt(hp, L, h1), hacts=acts)

    def render_sector_gov(sg, L, page_n=1):
        sec, g = sg['sec'], sg['g']
        P = '/en' if L == 'en' else ''
        m = sg['members']
        n = len(m)
        noun, t_ = X(L, sec['noun_ar'], sec['noun_en']), X(L, sec['t_ar'], sec['t_en'])
        gn = X(L, g['ar'], g['en'])
        h1 = X(L, '%s %s في %s', '%s %s in %s, Egypt') % ((noun, t_, gn) if L == 'ar' else (t_, noun, gn))
        n_mem, n_fac, n_ver, n_ver_mem, n_pub = kind_counts(m)
        sh = S['hub_sector_by_slug'][sec['slug']]
        share = round(100.0 * n / max(1, sh['n']))
        zones = [z for z in S['zones'] if z['region_code'] == g['code']][:8]
        cities = top_counts([c for c in m if c.get('zone')], lambda c: c['zone'], 5)
        prods = top_counts([nm for c in m for nm in (c['names'] or [])], lambda x: x, 5)
        if L == 'ar':
            intro = 'يضم الدليل %s في قطاع %s بمحافظة %s%s%s، أي نحو %d%% من منشآت القطاع في الدليل (%s).' % (
                ar_qty(n, N_EST_ACC), sec['ar'], g['ar'], ('، منها ' + ar_qty(n_fac, N_FAC_NOM)) if n_fac else '', ver_pub_tail(L, n_ver, n_ver_mem, n_pub), share, fmt_n(sh['n']))
            if cities:
                intro += ' مدن ومناطق مذكورة في عناوين المنشآت: %s.' % '، '.join('%s (%d)' % (S['zone_by_id'][z]['name_ar'], k) for z, k in cities)
            if prods:
                intro += ' من المنتجات المذكورة: %s.' % '، '.join(p for p, _ in prods)
            intro += ' أرسل طلب عرض سعر واحداً: يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه.'
        else:
            intro = 'The directory lists %s %s in %s%s%s – about %d%% of the sector in the directory (%s).' % (
                fmt_n(n), sec['en'] + (' company' if n == 1 else ' companies'), g['en'], (', %s of them %s' % (fmt_n(n_fac), 'a factory' if n_fac == 1 else 'factories')) if n_fac else '',
                ver_pub_tail(L, n_ver, n_ver_mem, n_pub), share, fmt_n(sh['n']))
            intro += ' Send one request for quotation: it reaches the matching registered factories automatically, and the platform team follows up when none matches.'
        app = app_url('factories')
        top = stats_html([(fmt_n(n), X(L, ar_noun(n, 'منشأة', 'منشأتان', 'منشآت', 'منشأة') + ' في %s' % g['ar'], 'companies in %s' % g['en']), app or '#list'),
                          (fmt_n(n_fac), X(L, ar_noun(n_fac, 'مصنع', 'مصنعان', 'مصانع', 'مصنعاً'), 'factories'), ''),
                          ('%d%%' % share, X(L, 'من منشآت القطاع في الدليل', 'of the sector in the directory'), lk(L, sh['path'])),
                          (str(len(zones)), X(L, ar_noun(len(zones), 'منطقة صناعية أو حرة', 'منطقتان صناعيتان أو حرتان', 'مناطق صناعية وحرة', 'منطقة صناعية وحرة'), 'industrial & free zones'), '#zones' if zones else '')])
        top += search_box(L, app, X(L, 'ابحث في %s %s في %s…' % (noun, t_, gn), 'Search %s %s in %s…' % (t_, noun.lower(), gn)), hash_q=True)
        if zones:
            top += '<section class="sx-sec" id="zones">%s%s</section>' % (sec_head(X(L, 'المناطق الصناعية والحرة في %s' % g['ar'], 'Industrial and free zones in %s' % g['en'])), zone_tiles(L, zones))
        gh = S['hub_gov_by_code'].get(g['code'])
        others = [x for x in S['hub_sgs'] if x['sec']['slug'] == sec['slug'] and x['g']['code'] != g['code'] and x['indexable'] and (L == 'ar' or x.get('en'))]
        bottom = '<section class="sx-sec">%s<div class="links">%s%s</div>%s</section>' % (
            sec_head(X(L, 'صفحات مرتبطة', 'Related pages')),
            '<a href="%s">%s</a>' % (esc(lk(L, sh['path'])), esc(X(L, 'كل %s %s في مصر', 'All %s %s in Egypt') % ((noun, t_) if L == 'ar' else (t_, noun.lower())))),
            ('<a href="%s">%s</a>' % (esc(lk(L, gh['path'])), esc(X(L, 'مصانع وشركات %s', 'Factories in %s') % gn))) if gh and (L == 'ar' or gh.get('en')) else '',
            ('<ul class="sx-tiles">%s</ul>' % ''.join(tile_li(lk(L, x['path']), gov_photo(x['g']['code']), photo_alt(gov_photo(x['g']['code']), L, X(L, x['g']['ar'], x['g']['en'])),
                                                             '%s <small>(%d)</small>' % (esc(X(L, x['g']['ar'], x['g']['en'])), x['n']), x['g']['code']) for x in others[:10])) if others else '')
        faq = [(X(L, 'كم عدد %s %s في %s؟', 'How many %s %s are in %s?') % ((noun, t_, gn) if L == 'ar' else (t_, noun.lower(), gn)),
                X(L, 'يضم دليل المنصة %s في هذا القطاع بالمحافظة، محسوبة من بيانات الدليل بتاريخ %s.' % (ar_qty(n, N_EST_ACC), fmt_date(S['today'], L)),
                  'The platform directory lists %s in this sector and governorate, counted on %s.' % (en_qty(n, 'company', 'companies'), fmt_date(S['today'], L))))]
        crumb_items = [home_crumb(L), (X(L, 'دليل المصانع', 'Factory directory'), lk(L, '/factories/')), (X(L, sec['t_ar'], sec['t_en']), lk(L, sh['path'])), (gn, lk(L, sg['path']))]
        title_c = [X(L, '%s %s في %s (%s)', '%s %s in %s, Egypt (%s)') % ((noun, t_, gn, fmt_n(n)) if L == 'ar' else (t_, noun, gn, fmt_n(n))),
                   X(L, '%s %s في %s', '%s %s in %s') % ((noun, t_, gn) if L == 'ar' else (t_, noun, gn))]
        dparts = [X(L, '%s في قطاع %s بمحافظة %s، مع المنتجات والنشاط.' % (ar_qty(n, N_EST_NOM), sec['ar'], g['ar']),
                    '%s %s in %s with products and activity.' % (fmt_n(n), sec['t_en'] + (' company' if n == 1 else ' companies'), gn)),
                  X(L, 'أرسل طلب عرض سعر واحداً يصل للمصانع المسجّلة المناسبة.', 'One request reaches the matching registered factories.')]
        acts = hero_acts(L, [(X(L, '📝 اطلب عرض سعر', '📝 Request a quote'), rfq_link(None, L), 'gold'),
                             (X(L, 'كل %s %s في مصر' % (noun, t_), 'All %s %s in Egypt' % (t_, noun.lower())), lk(L, sh['path']), 'glass')])
        hp = gov_photo(g['code']) or sec_photo(sec['slug'])
        return render_listing(L, 'hub-sector-gov', sg, m, page_n, sg['pages'], sg['path'], h1, intro, title_c, dparts, crumb_items, top, bottom, faq, None,
                              kw_for('D', L, noun=noun if L == 'ar' else noun.lower(), sector=t_ if L == 'ar' else t_.lower(), gov=gn), 'D',
                              himg=hp, halt=photo_alt(hp, L, gn), hacts=acts)

    def render_directory(L, page_n=1):
        P = '/en' if L == 'en' else ''
        m = S['dir_members']
        n = len(m)
        n_mem, n_fac, n_ver, n_ver_mem, n_pub = kind_counts(m)
        secs = [s for s in S['hub_sectors'] if s['n'] > 0]
        govs = [g for g in S['hub_govs'] if g['n_members'] > 0]
        h1 = X(L, 'دليل المصانع والشركات المصرية', 'Directory of Egyptian Manufacturers & Suppliers')
        if L == 'ar':
            intro = ('دليل منصة صنع في مصر: %s منشأة صناعية وتجارية في الدليل: %s منشأة عضو (%s مصنع و%s شركة ومورد)%s، موزعة على %d قطاعاً و%d محافظة. '
                     'تصفّح حسب القطاع أو المحافظة أو المنطقة الصناعية، أو أرسل طلب عرض سعر واحداً يصل تلقائياً للمصانع المسجّلة المناسبة.') % (
                fmt_n(n), fmt_n(n_mem), fmt_n(n_fac), fmt_n(n_mem - n_fac), ver_pub_tail(L, n_ver, n_ver_mem, n_pub), len(secs), len(govs))
        else:
            intro = ('The Made in Egypt Gate directory: %s industrial and trading companies – %s member companies (%s factories, %s companies & suppliers)%s – '
                     'across %d sectors and %d governorates. Browse by sector, governorate or industrial zone, or send one request for quotation.') % (
                fmt_n(n), fmt_n(n_mem), fmt_n(n_fac), fmt_n(n_mem - n_fac), ver_pub_tail(L, n_ver, n_ver_mem, n_pub), len(secs), len(govs))
        sec_hubs = [s for s in S['hub_sectors'] if s['indexable'] and (L == 'ar' or s.get('en'))]
        gov_hubs = [g for g in S['hub_govs'] if g['indexable'] and (L == 'ar' or g.get('en'))]
        app = app_url('factories')
        zones_href = lk(L, '/industrial-zones/') if (L == 'ar' or page_exists('/en/industrial-zones/')) else '/industrial-zones/'
        # page 1: stat cards, search bar, verified companies, sector and governorate photo tiles, zones, products and videos — then the list
        top = stats_html([(fmt_n(n), X(L, 'منشأة صناعية وتجارية في الدليل', 'industrial & trading companies in the directory'), app or '#list'),
                          (fmt_n(n_ver), X(L, ar_noun(n_ver, 'شركة موثّقة', 'شركتان موثّقتان', 'شركات موثّقة', 'شركة موثّقة') + ' من فريق المنصة', 'companies verified by the platform team'), (app + '#verified') if app else ''),
                          (str(len(secs)), X(L, ar_noun(len(secs), 'قطاع', 'قطاعان', 'قطاعات صناعية', 'قطاعاً صناعياً'), 'industrial sectors'), '#sectors'),
                          (str(len(govs)), X(L, ar_noun(len(govs), 'محافظة', 'محافظتان', 'محافظات', 'محافظة') + ' بمناطقها الصناعية والحرة', 'governorates with their industrial & free zones'),
                           lk(L, '/governorates/') if (L == 'ar' or page_exists('/en/governorates/')) else '/governorates/')])
        top += search_box(L, app, X(L, 'ابحث باسم المصنع أو المنتج أو التخصص…', 'Search by company, product or speciality…'), govs=True, verified=True, hash_q=True)
        first = set(id(c) for c in m[:S['cfg']['listing_page_size']])
        team = [c for c in m if is_team(c) and name_ok(L, c['name'], c.get('name_en'))]
        feat = round_robin([c for c in team if id(c) not in first] if len([c for c in team if id(c) not in first]) >= 8 else team, lambda c: c['sslug'], 8)
        if feat:
            top += '<section class="sx-sec">%s%s</section>' % (sec_head(X(L, 'شركات موثّقة من فريق المنصة', 'Companies verified by the platform team'), (app + '#verified') if app else '',
                                                                           X(L, 'كل الموثّقة (%d) ←', 'All verified (%d) →') % n_ver, X(L, 'راجع فريق المنصة بيانات هذه الشركات يدوياً.', "The platform team checked these companies' details by hand.")),
                                                                  company_cards(feat, L))
        top += '<section class="sx-sec" id="sectors">%s%s</section>' % (sec_head(X(L, 'تصفّح حسب القطاع', 'Browse by sector')), sector_tiles(L, sec_hubs))
        top += '<section class="sx-sec" id="governorates">%s%s<p><a href="%s">%s</a></p>%s</section>' % (
            sec_head(X(L, 'تصفّح حسب المحافظة', 'Browse by governorate')), gov_tiles(L, gov_hubs), esc(zones_href),
            X(L, 'المناطق والمدن الصناعية والمناطق الحرة ←', 'Industrial cities, zones and free zones →'), ('<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'بحث وفلترة تفاعلية ←', 'Interactive search →'))) if app else '')
        top += visual_strips(L, products=featured_products(L, 12), videos=pick_videos(4, {'مصانع وجولات'}),
                             zones=sorted(S['zones'], key=lambda z: (-S['zone_members'].get(z['id'], 0), z['id']))[:8])
        faq = [(X(L, 'كم عدد المصانع والشركات في دليل المنصة؟', 'How many companies are in the directory?'),
                X(L, 'يضم الدليل %s منشأة فريدة: %s منشأة عضو%s. الرقم محسوب من البيانات بتاريخ %s ولا يشمل أي أرقام تقديرية.',
                  'The directory holds %s unique companies: %s member companies%s. Counted from the data on %s; no estimated figures.') % (
                    fmt_n(n), fmt_n(n_mem), ver_pub_tail(L, n_ver, n_ver_mem, n_pub), fmt_date(S['today'], L))),
               (X(L, 'هل تنشر المنصة أرقام هواتف المصانع؟', 'Does the platform publish factory phone numbers?'),
                X(L, 'لا. لا نعرض أرقام هواتف أو بريد المنشآت؛ التواصل يتم عبر نموذج طلب عرض السعر، ويصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه.',
                  'No. Company phone numbers and e-mails are not published; contact goes through the request-for-quotation form, which reaches the matching registered factories, and the platform team follows up when none matches.'))]
        crumb_items = [home_crumb(L), (X(L, 'دليل المصانع', 'Factory directory'), lk(L, '/factories/'))]
        title_c = [X(L, 'دليل المصانع المصرية: %s حسب القطاع والمحافظة' % ar_qty(n, N_FACCO_NOM), 'Egyptian Manufacturers Directory: %s Factories by Sector & Governorate' % fmt_n(n)),
                   X(L, 'دليل المصانع المصرية (%s)' % ar_qty(n, N_EST_NOM), 'Egyptian Manufacturers Directory (%s)' % fmt_n(n))]
        dparts = [X(L, 'ابحث في %s مصرية في %s و%s.' % (ar_qty(n, N_FACCO_NOM), ar_qty(len(secs), N_SEC_GEN), ar_qty(len(govs), N_GOV_GEN)),
                    'Browse %s Egyptian factories and suppliers across %d sectors and %d governorates.' % (fmt_n(n), len(secs), len(govs)))]
        csv_link = ('<a href="%s" download>%s</a>' % (esc(S['dir_csv']), X(L, 'تحميل القائمة (CSV)', 'Download the list (CSV)'))) if S.get('dir_csv') else ''
        acts = hero_acts(L, [(X(L, '🏭 سجّل منشأتك بالدليل الآن', '🏭 List your company now'), static_url('register', L, '#plans'), 'gold'),
                             (X(L, '📝 أرسل طلب عرض سعر (RFQ)', '📝 Send a request for quotation'), rfq_link(None, L), 'glass')])
        return render_listing(L, 'hub-dir', None, m, page_n, S['dir_pages'], '/factories/', h1, intro, title_c, dparts, crumb_items, top, '', faq, None,
                              kw_for('A', L), 'A', csv_link, himg=VIS_HUB_IMG['dir'], halt=photo_alt(VIS_HUB_IMG['dir'], L), hacts=acts)

    def render_gov(gh, L, page_n=1):
        g = gh['g']
        P = '/en' if L == 'en' else ''
        m = gh['members']
        gn = X(L, g['ar'], g['en'])
        n = len(m)
        all_secs = top_counts(m, lambda c: c['sslug'], 999)
        n_secs = len(all_secs)                 # every sector present in the governorate (the lists below show the top 8)
        secs = all_secs[:8]
        zones = gh['zones']
        tend = gh['tenders']
        projs = gh['projects']
        evs = [e for e in S['events'] if e.get('region_code') == g['code']]
        h1 = X(L, 'مصانع ومناطق %s الصناعية', 'Factories & Industrial Zones in %s') % gn
        sec_bits = [X(L, '%s (%d)', '%s (%d)') % (sec_name(s, L), k) for s, k in secs[:4]]
        n_topen = sum(1 for t in tend if t['status'] in ('open', 'soon'))
        if L == 'ar':
            # every count with its Arabic number agreement (ar_qty): «8 منشآت»، «منشأة واحدة»، «في قطاعين»، «مناقصتان، منها واحدة سارية»
            intro = ('يضم دليل المنصة %s في محافظة %s' % (ar_qty(n, N_EST_ACC), g['ar'])) if n else ('لا يضم دليل المنصة حالياً منشآت في محافظة %s' % g['ar'])
            if sec_bits and n_secs == 1:
                intro += ' في قطاع واحد هو %s.' % sec_bits[0]
            elif sec_bits:
                intro += ' في %s، أبرزها %s.' % (ar_qty(n_secs, N_SEC_GEN), join_list(sec_bits, L))
            else:
                intro += '.'
            if zones:
                intro += ' وفي المحافظة %s في بيانات المنصة.' % ar_qty(len(zones), N_ZONE3_NOM)
            if tend:
                intro += ' وللمحافظة في قسم المناقصات %s، %s.' % (ar_qty(len(tend), N_TND_NOM), ('منها ' + ar_qty(n_topen, N_OPEN_NOM) + ' الآن') if n_topen else 'ولا توجد بينها مناقصة سارية الآن')
            if projs:
                intro += ' كما يرصد قسم المشاريع %s بالمحافظة من مصادر منشورة.' % ar_qty(len(projs), N_PRJ_ACC)
            prof = gh.get('profile')
            if prof:
                intro += ' ' + prof
        else:
            intro = 'The platform directory lists %s in %s' % (en_qty(n, 'company', 'companies'), g['en'])
            intro += ((' in one sector, %s.' % sec_bits[0]) if n_secs == 1 else (' across %s, mainly %s.' % (en_qty(n_secs, 'sector', 'sectors'), join_list(sec_bits, L)))) if sec_bits else '.'
            if zones:
                intro += ' The platform data holds %s in the governorate.' % en_qty(len(zones), 'industrial, free or technology zone', 'industrial, free or technology zones')
            if tend:
                intro += ' The tenders section lists %s linked to it, %s open.' % (en_qty(len(tend), 'tender', 'tenders'), fmt_n(n_topen) if n_topen else 'none')
            if projs:
                intro += ' The projects section tracks %s here from published sources.' % en_qty(len(projs), 'project', 'projects')
        sg_tiles = []
        for s, k in secs:
            sg = S['hub_sg_by_key'].get((s, g['code']))
            sh = S['hub_sector_by_slug'].get(s)
            href = lk(L, sg['path']) if (sg and sg['indexable'] and (L == 'ar' or sg.get('en'))) else (lk(L, sh['path']) if (sh and (L == 'ar' or sh.get('en'))) else '')
            if href:
                ti = sec_tile_img(s)
                nm = sec_name(s, L, 't')
                sg_tiles.append(tile_li(href, ti, (X(L, 'منتجات من قطاع ', 'Products from the ') + nm + X(L, '', ' sector')) if isinstance(ti, tuple) else photo_alt(ti, L, nm),
                                        '%s <small>(%d)</small>' % (esc(nm), k)))
        app = app_url('region')
        here = pct(P + gh['path'])      # in-page links carry the page's path: the pages set <base href="/">, so a bare «#x» would open /#x
        # madeinsaudigate region.html: five KPI cards over five tabs; each number is the length of the list its tab shows
        # (EN: the records with an English text, i.e. exactly the cards rendered below)
        tl = [t for t in tend if name_ok(L, t['title'], t.get('title_en'))]
        rl = [r for r in S['rfqs'] if r.get('page') and rfq_gov(r) == g['code'] and not (L == 'en' and AR_RX.search(rfq_title(r, L)))]
        pl = gov_products(g['code'], L)
        jl = [p for p in projs if name_ok(L, p['name'])]
        zl = [z for z in zones if L == 'ar' or (z.get('name_en') and not AR_RX.search(z['name_en']))]
        n_opp = len(tl) + len(rl)
        n_open = sum(1 for t in tl if t['status'] in ('open', 'soon'))
        if L == 'ar':
            opp_lab = (kn(n_opp, 'مناقصة أو طلب سعر', 'مناقصة أو طلب سعر', 'مناقصات وطلبات أسعار', 'مناقصة وطلب سعر') if rl else
                       kn(n_opp, 'مناقصة', 'مناقصتان', 'مناقصات', 'مناقصة'))
        else:
            opp_lab = ('tender' if n_opp == 1 else 'tenders') if not rl else ('tender or RFQ' if n_opp == 1 else 'tenders & RFQs')
        kpi = kpi_html([(fmt_n(n_opp), opp_lab, here + '#tenders', 'tenders'),
                        (fmt_n(len(pl)), X(L, kn(len(pl), 'منتج من مصانع المحافظة', 'منتجان من مصانع المحافظة', 'منتجات من مصانع المحافظة', 'منتجاً من مصانع المحافظة'),
                                           'product from local companies' if len(pl) == 1 else 'products from local companies'), here + '#products', 'products'),
                        (fmt_n(n), X(L, kn(n, 'منشأة في دليل المنصة', 'منشأتان في دليل المنصة', 'منشآت في دليل المنصة', 'منشأة في دليل المنصة'),
                                     'company in the directory' if n == 1 else 'companies in the directory'), here + '#companies', 'companies'),
                        (fmt_n(len(jl)), X(L, kn(len(jl), 'مشروع في المحافظة', 'مشروعان في المحافظة', 'مشروعات في المحافظة', 'مشروعاً في المحافظة'),
                                           'project' if len(jl) == 1 else 'projects'), here + '#projects', 'projects'),
                        (fmt_n(len(zl)), X(L, kn(len(zl), 'منطقة صناعية أو حرة', 'منطقتان صناعيتان أو حرتان', 'مناطق صناعية وحرة', 'منطقة صناعية وحرة'),
                                           'industrial or free zone' if len(zl) == 1 else 'industrial & free zones'), here + '#zones', 'zones')])
        # tab 1: tenders and RFQs linked to the governorate (every one: the KPI counts them all)
        lis = ''.join(tender_card(t, L) for t in tl) + ''.join(rfq_card(r, L) for r in rl)
        if lis:
            if L == 'ar':
                sub = '%s مرتبطة بمحافظة %s في بيانات المنصة%s.' % (join_list([ar_n(len(tl), 'مناقصة', 'مناقصات') if tl else '', ar_n(len(rl), 'طلب عرض سعر', 'طلبات عروض أسعار') if rl else ''], L),
                                                                   g['ar'], ('' if not n_open else '، وهي سارية' if n_open == len(tl) == 1 and not rl else
                                                                             '، كلها سارية' if n_open == len(tl) and not rl else '، منها %d سارية' % n_open))
            else:
                sub = '%s linked to %s in the platform data%s.' % (join_list([('%d tender%s' % (len(tl), '' if len(tl) == 1 else 's')) if tl else '', ('%d RFQ%s' % (len(rl), '' if len(rl) == 1 else 's')) if rl else ''], L),
                                                                  g['en'], ('' if not n_open else ', open' if n_open == len(tl) == 1 and not rl else
                                                                            ', all open' if n_open == len(tl) and not rl else ', %d open' % n_open))
            p_t = (sec_head(X(L, 'المناقصات وطلبات الأسعار في %s' % g['ar'], 'Tenders & RFQs in %s' % g['en']), sub=sub) + '<div class="sx-tg"><ul class="tlist">%s</ul></div>' % lis
                   + more_btns([(X(L, 'كل المناقصات ←', 'All tenders →'), lk(L, '/tenders/')), (X(L, 'طلبات عروض الأسعار ←', 'Requests for quotation →'), lk(L, '/rfq/'))]))
        else:
            p_t = (sec_head(X(L, 'المناقصات وطلبات الأسعار في %s' % g['ar'], 'Tenders & RFQs in %s' % g['en']))
                   + empty_box(X(L, 'لا توجد مناقصات أو طلبات أسعار منشورة مرتبطة بمحافظة %s حالياً.' % g['ar'], 'No tenders or RFQs linked to %s are published yet.' % g['en']),
                               lk(L, '/tenders/'), X(L, 'تصفّح كل المناقصات', 'Browse all tenders')))
        # tab 2: products of the governorate's directory companies
        if pl:
            p_p = (sec_head(X(L, 'منتجات من مصانع %s' % g['ar'], 'Products from companies in %s' % g['en']),
                            sub=X(L, '%s من منشآت %s المدرجة في دليل المنصة، لكل منتج صفحته.' % (ar_n(len(pl), 'منتج', 'منتجات', 'منتجاً'), g['ar']),
                                  '%d product%s from %s companies listed in the directory, each with its own page.' % (len(pl), '' if len(pl) == 1 else 's', g['en'])))
                   + '<div class="sx-prod"><ul class="plist">%s</ul></div>' % ''.join(product_li(x, L) for x in pl) + more_btns([(X(L, 'كل المنتجات ←', 'All products →'), lk(L, '/products/'))]))
        else:
            p_p = (sec_head(X(L, 'منتجات من مصانع %s' % g['ar'], 'Products from companies in %s' % g['en']))
                   + empty_box(X(L, 'لا توجد منتجات منشورة من منشآت %s في الدليل حالياً.' % g['ar'], 'No products from %s companies are listed yet.' % g['en']),
                               static_url('register', L), X(L, 'سجّل منشأتك وأضف منتجاتك', 'Register your company and list your products')))
        # tab 4: projects (published sources)
        if jl:
            p_j = (sec_head(X(L, 'المشاريع في %s' % g['ar'], 'Projects in %s' % g['en']),
                            sub=X(L, '%s بالمحافظة من مصادر منشورة.' % ar_n(len(jl), 'مشروع', 'مشروعات', 'مشروعاً'), '%d project%s in %s from published sources.' % (len(jl), '' if len(jl) == 1 else 's', g['en'])))
                   + '<ul class="sx-pjs">%s</ul>' % ''.join(project_card(p, L) for p in jl) + more_btns([(X(L, 'كل المشاريع ←', 'All projects →'), lk(L, '/projects/'))]))
        else:
            p_j = (sec_head(X(L, 'المشاريع في %s' % g['ar'], 'Projects in %s' % g['en']))
                   + empty_box(X(L, 'لا توجد مشاريع مرصودة في %s في بيانات المنصة حالياً.' % g['ar'], 'No projects in %s are tracked in the platform data yet.' % g['en']),
                               lk(L, '/projects/'), X(L, 'تصفّح كل المشاريع', 'Browse all projects')))
        # tab 5: industrial, free and technology zones
        if zl:
            p_z = (sec_head(X(L, 'المناطق الصناعية والحرة في %s' % g['ar'], 'Industrial & free zones in %s' % g['en']),
                            sub=X(L, '%s في بيانات المنصة، ولكل منطقة صفحتها.' % ar_n(len(zl), 'منطقة صناعية أو حرة', 'مناطق صناعية وحرة', 'منطقة صناعية وحرة'),
                                  '%d industrial, free or technology zone%s in the platform data, each with its own page.' % (len(zl), '' if len(zl) == 1 else 's')))
                   + zone_tiles(L, zl, big=True) + more_btns([(X(L, 'كل المناطق الصناعية ←', 'All industrial zones →'), lk(L, '/industrial-zones/'))]))
        else:
            p_z = (sec_head(X(L, 'المناطق الصناعية والحرة في %s' % g['ar'], 'Industrial & free zones in %s' % g['en']))
                   + empty_box(X(L, 'لا توجد مناطق صناعية أو حرة لمحافظة %s في بيانات المنصة حالياً.' % g['ar'], 'No industrial or free zone in %s is in the platform data yet.' % g['en']),
                               lk(L, '/industrial-zones/'), X(L, 'كل المناطق الصناعية والحرة', 'All industrial & free zones')))
        evh = ('<section class="sx-sec">%s<ul class="sx-evs">%s</ul></section>' % (sec_head(X(L, 'معارض وفعاليات', 'Exhibitions & events')), ''.join(event_card(e, L) for e in evs[:6]))) if evs else ''

        def list_into(lst):
            # tab 3: the search bar, the sector tiles and the paged company list (page 1; pages 2+ show the list alone)
            p_c = search_box(L, app_url('factories'), X(L, 'ابحث عن مصنع أو منتج في %s…' % g['ar'], 'Search a company or product in %s…' % g['en']), hash_q=True)
            if sg_tiles:
                p_c += '<section class="sx-sec" id="sectors">%s<ul class="sx-tiles">%s</ul></section>' % (sec_head(X(L, 'القطاعات في %s' % g['ar'], 'Sectors in %s' % g['en'])), ''.join(sg_tiles))
            p_c += lst or empty_box(X(L, 'لا توجد منشآت مدرجة في دليل المنصة لمحافظة %s حالياً.' % g['ar'], 'No company in %s is listed in the directory yet.' % g['en']),
                                    static_url('register', L), X(L, 'سجّل منشأتك', 'Register your company'))
            tabs = [('tenders', X(L, 'المناقصات وطلبات الأسعار', 'Tenders & RFQs'), p_t, not lis), ('products', X(L, 'المنتجات', 'Products'), p_p, not pl),
                    ('companies', X(L, 'المصانع والشركات', 'Factories & companies'), p_c, not m), ('projects', X(L, 'المشاريع', 'Projects'), p_j, not jl),
                    ('zones', X(L, 'المناطق الصناعية والحرة', 'Industrial & free zones'), p_z, not zl)]
            return kpi + tab_box(L, here, X(L, 'أقسام محافظة %s' % g['ar'], 'Sections of the %s page' % g['en']), tabs) + evh
        other = [x for x in S['hub_govs'] if x['g']['code'] != g['code'] and x['indexable'] and (L == 'ar' or x.get('en'))]
        bottom = '<section class="sx-sec">%s%s%s</section>' % (sec_head(X(L, 'محافظات أخرى', 'Other governorates')), gov_tiles(L, other),
                                                             ('<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'استكشاف تفاعلي للمحافظات ←', 'Interactive governorate explorer →'))) if app else '')
        crumb_items = [home_crumb(L), (X(L, 'المحافظات', 'Governorates'), lk(L, '/governorates/')), (gn, lk(L, gh['path']))]
        # «دليل 8 مصانع»، «دليل مصنع واحد»، «دليل مصنعين»، «دليل 25 مصنعاً» (ar_qty); no count in the title while the governorate has none
        title_c = ([X(L, 'مصانع وشركات %s: دليل %s والمناطق الصناعية' % (gn, ar_qty(n, N_FAC_GEN)), 'Factories in %s, Egypt: %s & Industrial Zones' % (gn, en_qty(n, 'Manufacturer', 'Manufacturers')))] if n else []) + \
                  [X(L, 'مصانع وشركات %s (%s)', 'Factories in %s, Egypt (%s)') % (gn, fmt_n(n)), h1]
        if L == 'ar':
            dparts = ['دليل مصانع %s: %s%s%s، ومناقصات ومشروعات المحافظة.' % (
                gn, ar_qty(n, N_EST_NOM) if n else 'لا توجد منشآت مدرجة بعد', (' في ' + ar_qty(n_secs, N_SEC_GEN)) if n_secs else '', ('، و' + ar_qty(len(zones), N_ZONE_NOM)) if zones else '')]
        else:
            dparts = ['Factories in %s: %s%s%s, tenders and projects.' % (
                gn, en_qty(n, 'company', 'companies'), (' in ' + en_qty(n_secs, 'sector', 'sectors')) if n_secs else '', (', ' + en_qty(len(zones), 'industrial or free zone', 'industrial and free zones')) if zones else '')]
        faq = [(X(L, 'كم عدد المصانع في %s؟' % g['ar'], 'How many factories are listed in %s?' % g['en']),
                X(L, 'يضم دليل المنصة %s في %s، محسوبة من بيانات الدليل بتاريخ %s. هذا عدد المنشآت المدرجة في المنصة وليس إجمالي مصانع المحافظة.' % (ar_qty(n, N_EST_ACC), gn, fmt_date(S['today'], L)),
                  'The platform directory lists %s in %s, counted on %s. This is the number listed on the platform, not the total number of factories in the governorate.' % (en_qty(n, 'company', 'companies'), gn, fmt_date(S['today'], L))))]
        if zones:
            faq.append((X(L, 'ما المناطق الصناعية في %s؟' % g['ar'], 'Which industrial zones are in %s?' % g['en']), join_list([X(L, z['name_ar'], z.get('name_en') or z['name_ar']) for z in zones[:6]], L) + '.'))
        about = {"@type": "AdministrativeArea", "@id": abs_url(lk(L, gh['path'])) + '#area', "name": gn, "containedInPlace": {"@type": "Country", "name": X(L, 'مصر', 'Egypt')}}
        # the hero as region.html#RUH: «أرسل طلب عرض في …» + «سجّل منشأتك» (all governorates: the strip right below the hero)
        acts = hero_acts(L, [(X(L, '📝 اطلب عرض سعر من مصانع %s' % g['ar'], '📝 Request a quote from %s factories' % g['en']), rfq_link(None, L), 'gold'),
                             (X(L, 'سجّل منشأتك', 'Register your company'), static_url('register', L), 'glass')])
        hp = gov_photo(g['code'])
        body, meta = render_listing(L, 'gov', gh, m, page_n, gh['pages'], gh['path'], h1, intro, title_c, dparts, crumb_items, '', bottom, faq, about,
                                    kw_for('C', L, gov=gn), 'C', himg=hp, halt=photo_alt(hp, L, gn), hacts=acts, after_hero=gov_chips(L, g['code'], page_n), list_into=list_into)
        meta['about_id'] = abs_url(lk(L, gh['path'])) + '#area'
        return body, meta

    def zone_type(z, L):
        return {'industrial_city': X(L, 'مدينة صناعية', 'Industrial city'), 'industrial_area': X(L, 'منطقة صناعية', 'Industrial zone'), 'free_zone': X(L, 'منطقة حرة عامة', 'Public free zone'),
                'tech_park': X(L, 'مجمع تكنولوجي', 'Technology park'), 'port_zone': X(L, 'ميناء ومنطقة لوجستية', 'Port zone'), 'investment_zone': X(L, 'منطقة استثمارية', 'Investment zone')}.get(z.get('type'), X(L, 'منطقة', 'Zone'))

    def render_zone(z, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + z['path'])
        g = S['gov_by_code'].get(z['region_code'])
        name = X(L, z['name_ar'], z.get('name_en') or z['name_ar'])
        gh = S['hub_gov_by_code'].get(z['region_code'])
        hub = ('/free-zones/' if z['type'] == 'free_zone' else '/industrial-zones/')
        items = [home_crumb(L), (X(L, 'المناطق الصناعية', 'Industrial zones'), lk(L, '/industrial-zones/'))]
        if z['type'] == 'free_zone':
            items.append((X(L, 'المناطق الحرة', 'Free zones'), lk(L, '/free-zones/')))
        items.append((name, lk(L, z['path'])))
        ch, crumb_ld = crumbs(items, L, url)
        mem = sort_companies([c for c in S['companies'] if c.get('zone') == z['id'] and c.get('page')])
        focus = [T(L, f) for f in (z.get('focus_sectors_ar') or [])]
        facts = [(X(L, 'النوع', 'Type'), esc(zone_type(z, L)))]
        if g:
            facts.append((X(L, 'المحافظة', 'Governorate'), ('<a href="%s">%s</a>' % (esc(lk(L, gh['path'])), esc(X(L, g['ar'], g['en'])))) if gh else esc(X(L, g['ar'], g['en']))))
        if z.get('city'):
            facts.append((X(L, 'المدينة / الموقع', 'City / location'), esc(T(L, z['city']))))
        if z.get('area_text') and (L == 'ar' or tr(z['area_text'])):
            facts.append((X(L, 'المساحة', 'Area'), esc(T(L, z['area_text']))))
        elif z.get('area_km2'):
            facts.append((X(L, 'المساحة', 'Area'), esc(X(L, 'نحو %s كم²', 'about %s km²') % z['area_km2'])))
        if z.get('operator_ar'):
            facts.append((X(L, 'جهة الإدارة', 'Operator'), esc(T(L, z['operator_ar']))))
        if z.get('status_ar') and (L == 'ar' or tr(z['status_ar'])):
            facts.append((X(L, 'الحالة', 'Status'), esc(T(L, z['status_ar']))))
        if z.get('lat') is not None and not z.get('approx'):
            facts.append((X(L, 'الإحداثيات', 'Coordinates'), '<a href="https://www.openstreetmap.org/?mlat=%s&amp;mlon=%s#map=13/%s/%s" rel="nofollow noopener" target="_blank" dir="ltr">%.4f, %.4f</a>' % (z['lat'], z['lon'], z['lat'], z['lon'], z['lat'], z['lon'])))
        elif z.get('approx'):
            facts.append((X(L, 'الإحداثيات', 'Coordinates'), esc(X(L, 'تقريبية (غير منشورة بدقة)', 'approximate (not published precisely)'))))
        if z.get('website'):
            facts.append((X(L, 'الموقع الرسمي', 'Official website'), '<a href="%s" rel="noopener" target="_blank">%s</a>' % (esc(z['website']), esc(urlparse(z['website']).netloc.replace('www.', '')))))
        if z.get('source_url'):
            facts.append((X(L, 'مصدر البيانات', 'Data source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(z['source_url']), esc(urlparse(z['source_url']).netloc.replace('www.', '')))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        tend = [t for t in S['tenders'] if t.get('gov') == z['region_code'] and t['src'] != 'intl' and t['status'] in ('open', 'soon', 'closed') and t.get('page')][:6]
        if L == 'ar':
            intro = '%s – %s في محافظة %s.' % (z['name_ar'], zone_type(z, L), g['ar'] if g else '')
            if focus:
                intro += ' القطاعات المستهدفة: %s.' % '، '.join(focus[:8])
            if z.get('area_text'):
                intro += ' المساحة: %s.' % z['area_text']
            intro += (' وفي دليل المنصة %s يذكر عنوانها أو وصفها %s.' % (ar_qty(len(mem), N_EST_NOM), z.get('city') or z['name_ar'])) if mem else ''
        else:
            intro = '%s – %s in %s governorate.' % (name, zone_type(z, L).lower(), g['en'] if g else '')
            if focus and all(tr(f) for f in (z.get('focus_sectors_ar') or [])):
                intro += ' Target sectors: %s.' % ', '.join(focus[:8])
            if mem:
                intro += ' The platform directory lists %s whose address or description mentions this location.' % en_qty(len(mem), 'company', 'companies')
        main = ''
        if focus and (L == 'ar' or all(tr(f) for f in (z.get('focus_sectors_ar') or []))):
            links = []
            for f in (z.get('focus_sectors_ar') or []):
                s = norm_sector(f)
                sh = S['hub_sector_by_slug'].get(s or '')
                if sh and sh['indexable'] and (L == 'ar' or sh.get('en')):
                    links.append('<a href="%s">%s</a>' % (esc(lk(L, sh['path'])), esc(T(L, f))))
                else:
                    links.append('<span class="chip chip-gray">%s</span>' % esc(T(L, f)))
            main += '<section class="card2"><h2>%s</h2><div class="links">%s</div></section>' % (X(L, 'القطاعات المستهدفة', 'Target sectors'), ''.join(links))
        if mem:
            main += '<section class="card2 sx-zm"><h2>%s</h2><p class="note">%s</p>%s</section>' % (
                X(L, 'منشآت في الدليل', 'Companies in the directory'), X(L, 'منشآت يذكر عنوانها أو وصفها هذا الموقع.', 'Companies whose address or description mentions this location.'),
                company_cards(mem[:50], L))
        elif gh and gh['n_members']:
            main += '<p class="banner-info"><a href="%s">%s</a></p>' % (esc(lk(L, gh['path']) if (L == 'ar' or gh.get('en')) else gh['path']), esc(X(L, 'منشآت محافظة %s في الدليل (%d) ←' % (g['ar'], gh['n_members']), 'Companies in %s governorate (%d) →' % (g['en'], gh['n_members']))))
        if tend:
            main += '<section class="card2"><h2>%s</h2>%s</section>' % (X(L, 'مناقصات في نفس المحافظة', 'Tenders in the same governorate'), tender_cards(tend, L))
        near = [x for x in S['zones'] if x['region_code'] == z['region_code'] and x['id'] != z['id']]
        if near:
            main += '<section class="card2"><h2>%s</h2>%s</section>' % (X(L, 'مناطق أخرى في المحافظة', 'Other zones in the governorate'), zone_tiles(L, near))
        zp = zone_photo(z)
        body = hero(L, ch, name, intro, img=zp, alt=photo_alt(zp, L, name), acts=hero_acts(L, [(X(L, '📝 اطلب عرض سعر من مصانع المنطقة', '📝 Request a quote from factories here'), rfq_link(None, L), 'gold'),
                                                                                              (X(L, 'كل المناطق الصناعية', 'All industrial zones'), lk(L, '/industrial-zones/') if (L == 'ar' or page_exists('/en/industrial-zones/')) else '/industrial-zones/', 'glass')])) + \
            '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2"><h2>%s</h2>%s</div>%s</aside></div></div>' % (
            main or '<p class="muted">%s</p>' % X(L, 'لا توجد منشآت مرتبطة بهذا الموقع في الدليل حالياً.', 'No directory companies are linked to this location yet.'),
            X(L, 'بيانات المنطقة', 'Zone facts'), facts_html, rfq_box(L, rfq_link(None, L)))
        short = z.get('city') or z['name_ar']
        city_unique = sum(1 for x in S['zones'] if x.get('city') == z.get('city') and x['type'] == z['type']) == 1
        if L == 'ar':
            cands = ['مصانع %s: دليل المنطقة الصناعية والمساحة والقطاعات' % short if (z['type'] == 'industrial_city' and city_unique) else '',
                     '%s: المساحة والقطاعات والمصانع' % z['name_ar'], z['name_ar']]
        else:
            cands = ['%s: Factories, Area & Sectors' % name, name]
        dparts = [X(L, '%s: %s في %s.', '%s: %s in %s.') % (name, zone_type(z, L), gov_name(z['region_code'], L))]
        if focus and (L == 'ar' or all(tr(f) for f in (z.get('focus_sectors_ar') or []))):
            dparts.append(X(L, 'القطاعات: %s.', 'Sectors: %s.') % X(L, '، '.join(focus[:3]), ', '.join(focus[:3])))
        if mem:
            dparts.append(X(L, '%s في الدليل.' % ar_qty(len(mem), N_EST_NOM), '%s in the directory.' % en_qty(len(mem), 'company', 'companies')))
        meta = {'title': mk_title(cands, L), 'desc': mk_desc(dparts, L), 'h1': name, 'og_type': 'website', 'page_type': 'WebPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_place(z, url, L, [(T(L, c['name'], c.get('name_en')), ('/en' if L == 'en' and c.get('en_ok') else '') + c['path']) for c in mem[:50]]),
                'kw': kw_for('E', L, zone=X(L, short, name)), 'keywords': kw_for('E', L, zone=X(L, short, name)), 'about_id': url + '#place'}
        return body, meta

    def render_zone_hub(L, free=False):
        P = '/en' if L == 'en' else ''
        path = '/free-zones/' if free else '/industrial-zones/'
        url = abs_url(P + path)
        zs = [z for z in S['zones'] if (z['type'] == 'free_zone') == free] if free else S['zones']
        by_type = {}
        for z in zs:
            by_type.setdefault(z['type'], []).append(z)
        govs = len(set(z['region_code'] for z in zs))
        items = [home_crumb(L), (X(L, 'المناطق الصناعية', 'Industrial zones'), lk(L, '/industrial-zones/'))]
        if free:
            items.append((X(L, 'المناطق الحرة', 'Free zones'), lk(L, path)))
        ch, crumb_ld = crumbs(items, L, url)
        if free:
            h1 = X(L, 'المناطق الحرة العامة في مصر', 'Public Free Zones in Egypt')
            # counts with their Arabic number agreement (ar_qty): «11 منطقة حرة عامة في 9 محافظات»، «منها 4 مناطق مخطط لها»
            intro = X(L, 'بيانات المنصة تضم %s في %s، منها القائمة والمخطط لها، مع الموقع والمساحة والقطاعات المستهدفة ومصدر كل معلومة.' % (ar_qty(len(zs), N_FZ_ACC), ar_qty(govs, N_GOV_GEN)),
                      'The platform data holds %s in %s, existing and planned, with location, area, target sectors and the source of each fact.' % (
                          en_qty(len(zs), 'public free zone', 'public free zones'), en_qty(govs, 'governorate', 'governorates')))
            planned = sum(1 for z in zs if 'planned' in z['id'])
            if planned:
                intro += X(L, ' منها %s (لم تبدأ التشغيل بعد وفق المصدر).' % ar_qty(planned, N_PLAN_NOM),
                           (' %s of them %s planned (not yet operating according to the source).' % (fmt_n(planned), 'is' if planned == 1 else 'are')))
        else:
            h1 = X(L, 'المناطق الصناعية والمناطق الحرة في مصر', 'Industrial Zones & Free Zones in Egypt')
            intro = X(L, 'دليل %d منطقة صناعية ومدينة جديدة ومنطقة حرة ومجمع تكنولوجي في %d محافظة: المساحة والقطاعات المستهدفة والموقع على الخريطة والمنشآت المرتبطة بكل منطقة في دليل المنصة.',
                      'A guide to %d industrial zones, new cities, free zones and technology parks in %d governorates: area, target sectors, map location and the directory companies linked to each zone.') % (len(zs), govs)
        order = ['industrial_city', 'industrial_area', 'investment_zone', 'free_zone', 'port_zone', 'tech_park']
        app = app_url('cities')
        n_co = sum(S['zone_members'].get(z['id'], 0) for z in zs)
        n_k = len(by_type.get('industrial_city') or []) if not free else sum(1 for z in zs if 'planned' in z['id'])
        secs = stats_html([(str(len(zs)), X(L, ar_noun(len(zs), 'منطقة', 'منطقتان', 'مناطق', 'منطقة') + (' حرة عامة' if free else ' صناعية وحرة وتكنولوجية'), 'public free zones' if free else 'industrial, free & technology zones'), app or ''),
                           (str(govs), X(L, ar_noun(govs, 'محافظة', 'محافظتان', 'محافظات', 'محافظة'), 'governorates'), lk(L, '/governorates/') if (L == 'ar' or page_exists('/en/governorates/')) else '/governorates/'),
                           (str(n_k), X(L, ar_noun(n_k, 'مدينة صناعية جديدة', 'مدينتان صناعيتان جديدتان', 'مدن صناعية جديدة', 'مدينة صناعية جديدة') if not free else
                                        ar_noun(n_k, 'منطقة مخطط لها', 'منطقتان مخطط لهما', 'مناطق مخطط لها', 'منطقة مخطط لها'), 'new industrial cities' if not free else 'planned zones'), ''),
                           (fmt_n(n_co), X(L, ar_noun(n_co, 'منشأة', 'منشأتان', 'منشآت', 'منشأة') + ' في الدليل مرتبطة بالمناطق', 'directory companies linked to the zones'), '')])
        for ty in order:
            lst = by_type.get(ty) or []
            if not lst:
                continue
            secs += '<section class="sx-sec">%s%s</section>' % (sec_head('%s (%d)' % (zone_type(lst[0], L), len(lst))), zone_tiles(L, lst, big=True))
        if not free:
            secs += '<p class="banner-info"><a href="%s">%s</a></p>' % (esc(lk(L, '/free-zones/')), X(L, 'المناطق الحرة العامة فقط ←', 'Public free zones only →'))
        if app:
            secs += '<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'عرض تفاعلي بالصور والخريطة ←', 'Interactive view with photos and map →'))
        hp = VIS_HUB_IMG['free-zones' if free else 'zones']
        body = hero(L, ch, h1, intro, img=hp, alt=photo_alt(hp, L, h1), acts=hero_acts(L, [(X(L, '🗺️ الخريطة التفاعلية', '🗺️ Interactive map'), static_url('map', L), 'gold'),
                                                                                           (X(L, '📝 اطلب عرض سعر', '📝 Request a quote'), rfq_link(None, L), 'glass')])) + '<div class="wrap sx-main">%s</div>' % secs
        cands = [X(L, 'المناطق الحرة في مصر: %d منطقة حرة عامة بالمحافظة والمساحة' % len(zs), 'Egypt Free Zones: %d Public Free Zones' % len(zs)) if free else
                 X(L, 'المناطق الصناعية في مصر %d: %d منطقة ومدينة صناعية وحرة' % (S['today'].year, len(zs)), 'Industrial Zones in Egypt: %d Industrial Cities, Free Zones & SCZone' % len(zs)), h1]
        meta = {'title': mk_title(cands, L), 'desc': mk_desc([intro], L, X(L, 'التفاصيل والمصادر على منصة صنع في مصر.', 'Details and sources on Made in Egypt Gate.')), 'h1': h1,
                'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(X(L, z['name_ar'], z.get('name_en') or z['name_ar']), lk(L, z['path'])) for z in zs], url, h1),
                'kw': kw_for('F', L), 'keywords': X(L, 'المناطق الحرة في مصر, المناطق الحرة العامة' if free else 'المناطق الصناعية في مصر, المناطق الحرة في مصر, المدن الصناعية', 'egypt free zones' if free else 'industrial zones in egypt, egypt free zones')}
        return body, meta

    def render_govs_hub(L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + '/governorates/')
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المحافظات', 'Governorates'), lk(L, '/governorates/'))], L, url)
        h1 = X(L, 'المصانع والمناطق الصناعية في محافظات مصر', 'Factories and Industrial Zones by Governorate')
        tot = sum(g['n_members'] for g in S['hub_govs'])
        intro = X(L, 'محافظات مصر الـ27 في بيانات المنصة: عدد المنشآت المدرجة في الدليل والمناطق الصناعية والمناقصات والمشروعات في كل محافظة. إجمالي المنشآت ذات المحافظة المعروفة: %s.',
                  "Egypt's 27 governorates in the platform data: listed companies, industrial zones, tenders and projects in each. Companies with a known governorate: %s.") % fmt_n(tot)
        rows = ''.join('<tr><td><a href="%s">%s</a></td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
            esc(lk(L, g['path']) if (L == 'ar' or g.get('en')) else g['path']), esc(X(L, g['g']['ar'], g['g']['en'])), fmt_n(g['n_members']), len(g['zones']), len(g['tenders'])) for g in S['hub_govs'])
        tbl = '<section class="card2"><table class="sx-tbl"><thead><tr><th>%s</th><th>%s</th><th>%s</th><th>%s</th></tr></thead><tbody>%s</tbody></table></section>' % (
            X(L, 'المحافظة', 'Governorate'), X(L, 'منشآت الدليل', 'Directory companies'), X(L, 'مناطق صناعية/حرة', 'Industrial/free zones'), X(L, 'مناقصات', 'Tenders'), rows)
        app = app_url('region')
        if app:
            tbl += '<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'استكشاف تفاعلي للمحافظات ←', 'Interactive governorate explorer →'))
        # the app's governorate cards (regions.part.py): photo, code, name, profile, counts — then the table above as the summary
        cards = []
        for g in S['hub_govs']:
            gp = gov_photo(g['g']['code'])
            prof = TX(L, g.get('profile') or '') if g.get('profile') else None
            n_o = sum(1 for t in g['tenders'] if t['status'] in ('open', 'soon'))
            ct = ''.join('<span><b>%s</b> %s</span>' % (fmt_n(k), esc(X(L, ar_noun(k, a1, a2, a3, a4), e))) for k, a1, a2, a3, a4, e in (
                (g['n_members'], 'منشأة', 'منشأتان', 'منشآت', 'منشأة', 'companies'), (len(g['zones']), 'منطقة صناعية', 'منطقتان صناعيتان', 'مناطق صناعية', 'منطقة صناعية', 'zones'),
                (n_o, 'مناقصة سارية', 'مناقصتان ساريتان', 'مناقصات سارية', 'مناقصة سارية', 'open tenders'), (len(g['projects']), 'مشروع', 'مشروعان', 'مشروعات', 'مشروعاً', 'projects')))
            href = lk(L, g['path']) if (L == 'ar' or g.get('en')) else g['path']
            cards.append('<li class="sx-gc"><div class="ph">%s<span class="code">%s</span></div><div class="b"><a href="%s">%s</a>%s<div class="ct">%s</div><div class="ft"></div></div></li>'
                         % (lazy_img(vimg(gp, 480, 270, 'cover', 62), photo_alt(gp, L, X(L, g['g']['ar'], g['g']['en']))), g['g']['code'], esc(href), esc(X(L, g['g']['ar'], g['g']['en'])),
                            ('<p>%s</p>' % esc(cut(prof, 150))) if prof else '', ct))
        n_z = len(S['zones'])
        n_t = sum(1 for t in S['tenders'] if t.get('gov') and t['status'] in ('open', 'soon'))
        # the in-page link carries the page's path: the pages set <base href="/">, so a bare «#govs» would open the home page
        top = stats_html([(str(len(S['hub_govs'])), X(L, 'محافظة مصرية', 'Egyptian governorates'), pct(P + '/governorates/') + '#govs'),
                          (fmt_n(tot), X(L, ar_noun(tot, 'منشأة', 'منشأتان', 'منشآت', 'منشأة') + ' بمحافظة معروفة', 'companies with a known governorate'), lk(L, '/factories/')),
                          (str(n_z), X(L, ar_noun(n_z, 'منطقة صناعية', 'منطقتان صناعيتان', 'مناطق صناعية وحرة', 'منطقة صناعية وحرة'), 'industrial & free zones'), lk(L, '/industrial-zones/') if (L == 'ar' or page_exists('/en/industrial-zones/')) else '/industrial-zones/'),
                          (str(n_t), X(L, ar_noun(n_t, 'مناقصة سارية', 'مناقصتان ساريتان', 'مناقصات سارية', 'مناقصة سارية') + ' في المحافظات', 'open tenders in the governorates'), lk(L, '/tenders/') if (L == 'ar' or page_exists('/en/tenders/')) else '/tenders/')])
        top += '<section class="sx-sec" id="govs">%s<ul class="sx-gcards">%s</ul></section>' % (sec_head(X(L, '%d محافظة · سوق صناعي واحد' % len(S['hub_govs']), '%d governorates · one industrial market' % len(S['hub_govs'])), app, X(L, 'الاستكشاف التفاعلي ←', 'Interactive explorer →') if app else '',
                                                                                                     X(L, 'تصفّح المنشآت والمناطق الصناعية والمناقصات والمشاريع في كل محافظة من محافظات مصر.', 'Browse the companies, industrial zones, tenders and projects of each Egyptian governorate.')), ''.join(cards))
        hp = VIS_HUB_IMG['govs']
        body = hero(L, ch, h1, intro, img=hp, alt=photo_alt(hp, L), acts=hero_acts(L, [(X(L, '🗺️ خريطة الفرص', '🗺️ Opportunity map'), static_url('map', L), 'gold'),
                                                                                    (X(L, 'المناطق الصناعية والحرة', 'Industrial & free zones'), lk(L, '/industrial-zones/') if (L == 'ar' or page_exists('/en/industrial-zones/')) else '/industrial-zones/', 'glass')])) + gov_chips(L) + '<div class="wrap sx-main">%s%s</div>' % (top, tbl)
        meta = {'title': mk_title([X(L, 'مصانع محافظات مصر: الدليل والمناطق الصناعية في 27 محافظة', 'Factories by Governorate in Egypt: 27 Governorates'), h1], L),
                'desc': mk_desc([intro], L), 'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(X(L, g['g']['ar'], g['g']['en']), lk(L, g['path'])) for g in S['hub_govs'] if g['indexable']], url, h1),
                'kw': kw_for('C', L, gov=X(L, 'مصر', 'egypt')), 'keywords': X(L, 'مصانع المحافظات, محافظات مصر, المناطق الصناعية', 'factories by governorate egypt')}
        return body, meta

    def render_product(p, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + p['path'])
        name = T(L, p['name'], p['name_en'])
        mk = p['maker']
        items = [home_crumb(L), (X(L, 'المنتجات', 'Products'), lk(L, '/products/')), (name, lk(L, p['path']))]
        ch, crumb_ld = crumbs(items, L, url)
        d = product_desc(p, L) or ''
        sh = S['hub_sector_by_slug'].get(p.get('sslug') or '')
        facts = []
        mie = p.get('mie')
        if mk:
            mp = ('/en' if L == 'en' and mk.get('en_ok') else '') + mk['path']
            lab = X(L, 'المصنع المنتج', 'Manufacturer') if mk['type'] == 'مصنع' else X(L, 'الشركة / المورد', 'Company / supplier')
            facts.append((lab, '<a href="%s">%s</a>' % (esc(mp), esc(T(L, mk['name'], mk.get('name_en'))))))
            if mk['gov']:
                facts.append((X(L, 'المحافظة', 'Governorate'), esc(gov_name(mk['gov'], L))))
        else:
            facts.append((X(L, 'الجهة المنتجة', 'Maker'), esc(X(L, 'غير محددة في البيانات', 'Not named in the data'))))
        if sh:
            facts.append((X(L, 'القطاع', 'Sector'), '<a href="%s">%s</a>' % (esc(lk(L, sh['path']) if (L == 'ar' or sh.get('en')) else sh['path']), esc(sec_name(sh['sec']['slug'], L)))))
        if mie:
            facts.append((X(L, 'بلد المنشأ', 'Country of origin'), X(L, 'مصر (منتج مصنع مصري مدرج في الدليل)', 'Egypt (made by an Egyptian factory in the directory)')))
        if p['flags']:
            miss = [S['inc_bits'].get(str(b)) for b in (16, 64, 128) if p['flags'] & b]
            miss = [m for m in miss if m]
            if miss:
                facts.append((X(L, 'بيانات غير مكتملة', 'Incomplete data'), esc(X(L, '، '.join(miss), ', '.join(T(L, m) for m in miss)))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        im = p.get('img_url')
        img = ('<img class="pimg" src="%s" alt="%s" width="%d" height="%d">' % (esc(im[0]), esc(name), im[1], im[2])) if im else ''
        rel = [x for x in (mk.get('prods') if mk else []) if x is not p][:8]
        if len(rel) < 8:
            rel += [x for x in S['products'] if x is not p and x not in rel and x.get('sslug') == p.get('sslug') and x.get('page')][:8 - len(rel)]
        rel_html = ''.join(product_li(x, L, maker=False) for x in rel)
        mkn = T(L, mk['name'], mk.get('name_en')) if mk else ''
        if mie:
            intro = X(L, '%s – منتج مصري من إنتاج %s.', '%s – made in Egypt by %s.') % (name, mkn)
        elif mk:
            intro = X(L, '%s – من منتجات %s (%s) في دليل المنصة.', '%s – listed by %s (%s) in the platform directory.') % (name, mkn, type_label(mk, L).lower() if L == 'en' else type_label(mk, L))
        else:
            intro = X(L, '%s – منتج مدرج في دليل المنصة دون جهة منتجة محددة في البيانات.', '%s – a product listed in the platform directory without a named maker.') % name
        main = '<div class="card2"><div class="hrow">%s<div style="min-width:0;flex:1"><h2>%s</h2><p>%s</p></div></div></div>' % (img, X(L, 'عن المنتج', 'About the product'), esc(d or X(L, 'لم يُضف وصف تفصيلي للمنتج بعد.', 'No detailed description yet.')))
        if rel_html:
            main += '<section class="card2 sx-gal"><h2>%s</h2><ul class="plist">%s</ul></section>' % (X(L, 'منتجات ذات صلة', 'Related products'), rel_html)
        hp = sec_cover(p.get('sslug'))
        body = hero(L, ch, name, intro, img=hp, alt=photo_alt(hp, L, sec_name(p.get('sslug'), L, 't') or name), small=True) + \
            '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2"><h2>%s</h2>%s</div>%s</aside></div></div>' % (
            main, X(L, 'بيانات المنتج', 'Product facts'), facts_html, rfq_box(L, rfq_link(mk, L) if mk else rfq_link(None, L)))
        if mie:
            cands = [X(L, '%s – صنع في مصر من %s | اطلب عرض سعر', '%s – Made in Egypt by %s | Request a Quote') % (name, mkn),
                     X(L, '%s – صنع في مصر من %s', '%s – Made in Egypt by %s') % (name, mkn),
                     X(L, '%s – صنع في مصر | اطلب عرض سعر', '%s – Made in Egypt | Request a Quote') % name]
        elif mk:
            cands = [X(L, '%s من %s | اطلب عرض سعر', '%s from %s | Request a Quote') % (name, mkn), X(L, '%s – %s', '%s – %s') % (name, mkn)]
        else:
            cands = []
        cands += [X(L, '%s | اطلب عرض سعر عبر منصة صنع في مصر', '%s | Request a Quote on Made in Egypt Gate') % name, X(L, '%s | اطلب عرض سعر', '%s | Request a Quote') % name, name]
        where = (X(L, ' (%s)', ' (%s)') % gov_name(mk['gov'], L)) if mk and mk['gov'] else ''
        if mie:
            d0 = X(L, '%s من إنتاج %s%s، مصنع مصري مدرج في الدليل.', '%s made by %s%s, an Egyptian factory in the directory.') % (name, mkn, where)
        elif mk:
            d0 = X(L, '%s من منتجات %s%s.', '%s listed by %s%s.') % (name, mkn, where)
        else:
            d0 = X(L, '%s في دليل منصة صنع في مصر.', '%s in the Made in Egypt Gate directory.') % name
        dparts = [d0, X(L, 'صورة المنتج وطلب عرض سعر مباشر.', 'Product photo and a direct quote request.') if im else X(L, 'طلب عرض سعر مباشر عبر المنصة.', 'A direct quote request via the platform.')]
        meta = {'title': mk_title(cands, L, suffix=False), 'desc': mk_desc(dparts, L), 'h1': name, 'og_type': 'website', 'page_type': 'ItemPage',
                'jsonld_page': jsonld_product(p, url, L), 'jsonld_crumbs': crumb_ld, 'kw': kw_for('K', L, product=name), 'keywords': kw_for('K', L, product=name),
                'about_id': url + '#product', 'mentions': [abs_url(('/en' if L == 'en' and mk.get('en_ok') else '') + mk['path']) + '#org'] if mk else [],
                'en_fail': 'desc_untranslated' if (L == 'en' and p['desc'] and not d) else ''}
        if PPROF.get('product_body'):   # PPROF hook: product-view body (seo_pprof.part.py); head, title, meta, canonical and JSON-LD stay as computed above
            body = PPROF['product_body'](p, L, locals()) or body
        return body, meta

    def render_products_hub(L, page_n=1):
        P = '/en' if L == 'en' else ''
        prods = S['products_listed']
        size = S['cfg']['listing_page_size']
        pages = max(1, (len(prods) + size - 1) // size)
        url = abs_url(P + '/products/' + ('page/%d/' % page_n if page_n > 1 else ''))
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المنتجات', 'Products'), lk(L, '/products/'))], L, url)
        chunk = prods[(page_n - 1) * size: page_n * size]
        makers = len(set(id(p['maker']) for p in prods if p['maker']))
        n_fac = sum(1 for p in prods if p['maker'] and p['maker']['type'] == 'مصنع')
        n_sup = sum(1 for p in prods if p['maker'] and p['maker']['type'] != 'مصنع')
        n_none = sum(1 for p in prods if not p['maker'])
        n_img = sum(1 for p in prods if p.get('img_url'))
        h1 = X(L, 'منتجات المصانع والشركات المصرية في الدليل', 'Products from Egyptian Factories & Suppliers')
        intro = X(L, 'يعرض الدليل %d منتجاً أضافتها %d منشأة: %d من مصانع، و%d من شركات وموردين، و%d بلا جهة منتجة محددة في البيانات. لكل منتج صفحة بطلب عرض سعر مباشر، مع صورة المنتج حين تتوفر (%d منتجاً).',
                  'The directory shows %d products added by %d companies: %d from factories, %d from companies & suppliers and %d without a named maker in the data. Each product has a page with a direct quote request, and a photo where one exists (%d products).') % (
            len(prods), makers, n_fac, n_sup, n_none, n_img)
        lis = ''.join(product_li(x, L) for x in chunk)
        secs = top_counts(prods, lambda x: x.get('sslug'), 12)
        tiles = []
        for s_, k in secs:
            sh_ = S['hub_sector_by_slug'].get(s_)
            if sh_ and sh_['indexable']:
                ti = sec_tile_img(s_)
                nm = sec_name(s_, L, 't')
                tiles.append(tile_li(lk(L, sh_['path']), ti, (X(L, 'منتجات من قطاع ', 'Products from the ') + nm + X(L, '', ' sector')) if isinstance(ti, tuple) else photo_alt(ti, L, nm),
                                     '%s <small>(%d)</small>' % (esc(nm), k)))
        mkt = (S['cfg'].get('static_paths') or {}).get('market') or '/market/'
        top = ''
        if page_n == 1:
            n_sec = len([1 for s_, k in secs if s_])
            top = stats_html([(fmt_n(len(prods)), X(L, ar_noun(len(prods), 'منتج', 'منتجان', 'منتجات', 'منتجاً') + ' في الدليل', 'products in the directory'), '#list'),
                              (fmt_n(makers), X(L, ar_noun(makers, 'منشأة', 'منشأتان', 'منشآت', 'منشأة') + ' أضافت منتجاتها', 'companies that listed products'), ''),
                              (fmt_n(n_fac), X(L, ar_noun(n_fac, 'منتج', 'منتجان', 'منتجات', 'منتجاً') + ' من مصانع', 'products from factories'), ''),
                              (str(n_sec), X(L, ar_noun(n_sec, 'قطاع', 'قطاعان', 'قطاعات', 'قطاعاً'), 'sectors'), '#sectors' if tiles else '')])
            top += search_box(L, mkt, X(L, 'ابحث في سوق صنع في مصر: حديد، كابلات، سيراميك، ألبان…', 'Search the Made in Egypt market: steel, cables, ceramics, dairy…'))
            if tiles:
                top += '<section class="sx-sec" id="sectors">%s<ul class="sx-tiles">%s</ul></section>' % (sec_head(X(L, 'حسب القطاع', 'By sector')), ''.join(tiles))
        hp = VIS_HUB_IMG['products']
        body = hero(L, ch, h1 if page_n == 1 else h1, intro if page_n == 1 else (X(L, 'صفحة %d', 'Page %d') % page_n), img=hp, alt=photo_alt(hp, L), small=page_n > 1,
                    acts=hero_acts(L, [(X(L, '🛒 تسوّق في سوق صنع في مصر', '🛒 Shop the Made in Egypt market'), static_url('market', L), 'gold'),
                                       (X(L, '📝 اطلب عرض سعر', '📝 Request a quote'), rfq_link(None, L), 'glass')]) if page_n == 1 else '') + \
            '<div class="wrap sx-main">%s<section class="sx-sec" id="list">%s<div class="sx-prod"><ul class="plist">%s</ul></div>%s</section></div>' % (
            top, sec_head(X(L, 'كل المنتجات', 'All products')) if page_n == 1 else '', lis, pager(L, '/products/', page_n, pages))
        meta = {'title': mk_title([X(L, 'منتجات المصانع والشركات المصرية (%d منتجاً)', 'Products from Egyptian Factories & Suppliers (%d)') % len(prods), h1], L, page=page_n),
                'desc': mk_desc([intro], L), 'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(T(L, x['name'], x['name_en']), ('/en' if L == 'en' and x.get('en_ok') else '') + x['path']) for x in chunk], url, h1),
                'kw': kw_for('K', L, product=X(L, 'منتجات', 'products')).replace('منتجات صنع في مصر', 'منتجات مصرية'), 'keywords': X(L, 'منتجات مصرية, صنع في مصر', 'made in egypt products')}
        return body, meta, pages

    def tender_badge(t, L):
        dl = full_date(t.get('deadline')) if t['status'] in ('open', 'soon') else None
        return '<span class="sx-st sx-st-%s"%s>%s</span>' % (t['status'], (' data-deadline="%s"' % dl) if dl else '', esc(tender_status_label(t, L)))

    def tender_li(t, L):
        P = '/en' if L == 'en' and t.get('en_ok') else ''
        st = tender_badge(t, L)
        m = ' · '.join(x for x in [T(L, t['entity'], t.get('entity_en')) if t['entity'] else '', gov_name(t.get('gov'), L) or (X(L, t.get('country'), t.get('country_en') or t.get('country')) if t['src'] == 'intl' else ''),
                                   (X(L, 'آخر موعد ', 'Closes ') + fmt_date(t['deadline'], L)) if t.get('deadline') else ''] if x)
        nm = T(L, t['title'], t.get('title_en'))
        return '<li><a href="%s"%s>%s</a> %s<span class="m">%s</span></li>' % (esc(lk(L, t['path'])), '' if L == 'ar' or not AR_RX.search(nm) else ' lang="ar"', esc(nm), st, esc(m))

    def tender_sort(lst):
        rank = {'soon': 0, 'open': 1, 'closed': 2, 'undated': 3}
        return sorted(lst, key=lambda t: (rank[t['status']], (t['days_left'] if t['status'] in ('open', 'soon') else -(t['days_left'] or -99999)) if t['days_left'] is not None else 99999, t['title']))

    def tender_title_parts(t, L):
        """the whole title first, with the richest tail that fits next to the site suffix (entity + closing date, the date, the date
        without its year, the entity), else the title alone, else the title cut at a word boundary with «…» (page_title)"""
        title = T(L, t['title'], t.get('title_en'))
        ent = T(L, t['entity'], t.get('entity_en')) if t['entity'] else ''
        tails = []
        if t.get('deadline') and pdate(t['deadline']):
            dl_full = fmt_date(t['deadline'], L)
            dl_ = X(L, ' | آخر موعد %s', ' | closes %s') % dl_full
            if ent:
                tails.append(' – ' + ent + dl_)
            tails += [dl_, X(L, ' | آخر موعد %s', ' | closes %s') % dl_full.rsplit(' ', 1)[0]]
        if ent:
            tails.append(' – ' + ent)
        kw = X(L, 'مناقصة ', 'Tender: ')
        pres = ('',) if (tails or title.startswith(kw.strip(' :'))) else (kw, '')
        return title, tails, pres

    def tender_title(t, L):
        """<title> of a tender page; two tenders with the same title (the old site has «عملية توريد أدوات كتابية» twice, as two tenders with
        their own reference numbers and no date or entity) keep their reference number in it: «… (TND-29986) | صنع في مصر», the site
        suffix going first when only that keeps the whole title, else the title cut at a word boundary as everywhere"""
        def base(x, L):
            a, b, c = tender_title_parts(x, L)
            return page_title(a, L, tails=b, prefixes=c)
        tt = base(t, L)
        if t.get('ref') and tt in dup_titles('tender', L, [x for x in S['tenders'] if x.get('page', True)], base):
            a, b, c = tender_title_parts(t, L)
            m = ' (%s)' % re.sub(r'\s+', ' ', str(t['ref'])).strip()
            whole = page_title(a, L, tails=b, prefixes=c, must=m, keep_suffix=False)
            return whole if a in whole else page_title(a, L, tails=b, prefixes=c, must=m)
        return tt

    def news_title(n, L):
        """<title> of a news page: the headline (past 65 characters cut at a word boundary with «…»); a headline that would read the same on
        two pages (owner report 2026-11-19: four weekly press reviews were all «أبرز ما تناولته الصحف الورقية والمواقع الإلكترونية عن
        وزارة») keeps the item's date in it"""
        def base(x, L):
            return page_title(T(L, x.get('title_ar')), L, keep_suffix=False)
        tt = base(n, L)
        if pdate(n.get('date') or '') and tt in dup_titles('news', L, S['news'], base):
            return page_title(T(L, n.get('title_ar')), L, keep_suffix=False, must=' | ' + fmt_date(n['date'], L))
        return tt

    def render_tender(t, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + t['path'])
        title = T(L, t['title'], t.get('title_en'))
        cat = S['cat_by_slug'].get(t['cat'])
        ch_ = S['hub_cat_by_slug'].get(t['cat'])
        items = [home_crumb(L), (X(L, 'المناقصات', 'Tenders'), lk(L, '/tenders/'))]
        if ch_ and ch_.get('page') and (L == 'ar' or ch_.get('en')):
            items.append((X(L, cat['ar'], cat['en']), lk(L, ch_['path'])))
        items.append((clip(title, 70), lk(L, t['path'])))
        ch, crumb_ld = crumbs(items, L, url)
        ent = T(L, t['entity'], t.get('entity_en')) if t['entity'] else ''
        facts = []
        if t['ref']:
            facts.append((X(L, 'رقم المناقصة', 'Reference'), '<span dir="ltr">%s</span>' % esc(t['ref'])))
        if t['ptype']:
            facts.append((X(L, 'نوع الطرح', 'Procurement type'), esc(T(L, t['ptype']) if t['src'] != 'intl' else {'gov': X(L, 'جهة حكومية', 'Government'), 'pvt': X(L, 'قطاع خاص', 'Private')}.get(t['ptype'], t['ptype']))))
        facts.append((X(L, 'الحالة', 'Status'), tender_badge(t, L)))
        if ent:
            eh = S['entity_by_name'].get(t['entity'])
            facts.append((X(L, 'الجهة', 'Issuing entity'), ('<a href="%s">%s</a>' % (esc(lk(L, eh['path'])), esc(ent))) if eh and eh['indexable'] and (L == 'ar' or eh.get('en')) else esc(ent)))
        else:
            facts.append((X(L, 'الجهة', 'Issuing entity'), esc(X(L, 'غير مذكورة في البيانات («جهة حكومية»)', 'Not named in the data'))))
        g = S['gov_by_code'].get(t.get('gov') or '')
        if g:
            gh = S['hub_gov_by_code'].get(g['code'])
            facts.append((X(L, 'المحافظة', 'Governorate'), ('<a href="%s">%s</a>' % (esc(lk(L, gh['path']) if (L == 'ar' or gh.get('en')) else gh['path']), esc(X(L, g['ar'], g['en'])))) if gh else esc(X(L, g['ar'], g['en']))))
        if t['src'] == 'intl':
            facts.append((X(L, 'الدولة', 'Country'), esc(X(L, t.get('country'), t.get('country_en') or t.get('country')) + ((' – ' + t['city']) if t.get('city') else ''))))
        elif t.get('city'):
            facts.append((X(L, 'المدينة', 'City'), esc(T(L, t['city']))))
        if cat:
            facts.append((X(L, 'الفئة', 'Category'), ('<a href="%s">%s</a>' % (esc(lk(L, ch_['path']) if (L == 'ar' or ch_.get('en')) else ch_['path']), esc(X(L, cat['ar'], cat['en'])))) if ch_ and ch_.get('page') else esc(X(L, cat['ar'], cat['en']))))
        if t.get('booklet'):
            facts.append((X(L, 'ثمن الكراسة', 'Tender document price'), esc(money_egp(t['booklet'], L) if str(t['booklet']).replace('.', '').isdigit() else T(L, str(t['booklet'])))))
        if t.get('bond'):
            facts.append((X(L, 'التأمين الابتدائي', 'Bid bond'), esc(money_egp(t['bond'], L) if str(t['bond']).replace('.', '').isdigit() else T(L, str(t['bond'])))))
        if t.get('value'):
            facts.append((X(L, 'القيمة التقديرية', 'Estimated value'), esc('{:,.0f} {}'.format(float(t['value']), t.get('currency') or ''))))
        if t.get('publish'):
            facts.append((X(L, 'تاريخ النشر', 'Published'), esc(fmt_date(t['publish'], L))))
        if t.get('deadline'):
            facts.append((X(L, 'آخر موعد للتقديم', 'Closing date'), esc(fmt_date(t['deadline'], L))))
        if t.get('source'):
            facts.append((X(L, 'المصدر الرسمي', 'Official source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(t['source']), esc(t.get('source_name') or urlparse(t['source']).netloc.replace('www.', '')))))
        if t.get('flags'):   # MIGTEND[12] (MIGINC bits 1 governorate, 4 closing date, 8 entity): say what the record does not have
            miss = [m for m in (S['inc_bits'].get(str(b)) for b in (1, 4, 8) if t['flags'] & b) if m]
            if miss:
                facts.append((X(L, 'بيانات غير مكتملة', 'Incomplete data'), esc(X(L, '، '.join(miss), ', '.join(T(L, m) for m in miss)))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        banner = ''
        if t['status'] == 'closed':
            banner = '<p class="banner-end">%s</p>' % X(L, 'انتهى موعد التقديم في %s.', 'The closing date passed on %s.') % fmt_date(t['deadline'], L)
        elif t['status'] in ('open', 'soon') and full_date(t.get('deadline')):
            # shown by the browser once the deadline has passed after this build (pages are rebuilt, but not every minute)
            banner = '<p class="banner-end" data-show-after="%s" hidden>%s</p>' % (full_date(t['deadline']), X(L, 'انتهى موعد التقديم في %s.', 'The closing date passed on %s.') % fmt_date(t['deadline'], L))
        elif t['status'] == 'undated':
            banner = '<p class="banner-info">%s</p>' % X(L, 'موعد الإغلاق غير معلن في البيانات المتاحة، والجهة غير مسمّاة. تحقق من المصدر الرسمي قبل التقديم.',
                                                         'No closing date and no named entity in the available data. Check the official source before bidding.')
        sim = [x for x in S['tenders_by_cat'].get(t['cat'], []) if x is not t and x['status'] in ('open', 'soon') and x.get('page')][:5]
        sim_html = ''
        if sim:
            sim_html = '<section class="card2"><h2>%s</h2>%s</section>' % (X(L, 'مناقصات مشابهة سارية', 'Similar open tenders'), tender_cards(sim, L))
        elif t['status'] != 'open':
            op = [x for x in tender_sort([x for x in S['tenders'] if x['status'] in ('open', 'soon') and x.get('page')])][:5]
            if op:
                sim_html = '<section class="card2"><h2>%s</h2>%s</section>' % (X(L, 'مناقصات سارية الآن', 'Tenders open now'), tender_cards(op, L))
        fac_links = ''
        if cat and cat.get('factory_hubs'):
            hubs = [S['hub_sector_by_slug'].get(s) for s in cat['factory_hubs']]
            hubs = [h for h in hubs if h and h['indexable'] and (L == 'ar' or h.get('en'))]
            if hubs:
                fac_links = '<section class="card2"><h2>%s</h2><div class="links">%s</div></section>' % (X(L, 'مصانع يمكنها التوريد', 'Factories that can supply'), ''.join(
                    '<a href="%s">%s <small>(%d)</small></a>' % (esc(lk(L, h['path'])), esc(sec_name(h['sec']['slug'], L, 't')), h['n']) for h in hubs))
        intro = tender_summary(t, L)
        hp = cat_photo(cat) if cat else VIS_HUB_IMG['tenders']
        body = hero(L, ch, title, intro, img=hp, alt=photo_alt(hp, L, X(L, cat['ar'], cat['en']) if cat else ''), small=True) + '<div class="wrap sx-main">%s<div class="sx-grid"><div><div class="card2"><h2>%s</h2>%s</div>%s%s</div><aside>%s</aside></div></div>' % (
            banner, X(L, 'بيانات المناقصة', 'Tender details'), facts_html, sim_html, fac_links,
            cta_box(L, X(L, 'تصلك المناقصات المناسبة لنشاطك', 'Get matching tenders for your business'),
                    X(L, 'سجّل منشأتك في المنصة لتصلك المناقصات وطلبات الشراء المطابقة لقطاعك ومحافظتك تلقائياً.', 'Register your company to receive tenders and purchase requests that match your sector and governorate automatically.'),
                    static_url('register', L, '#plans'), X(L, 'سجّل منشأتك', 'Register your company')))
        dparts = [tender_summary(t, L)]
        if t.get('booklet') and str(t['booklet']).replace('.', '').isdigit():
            dparts.append(X(L, 'ثمن الكراسة %s.', 'Document price %s.') % money_egp(t['booklet'], L))
        dparts.append(X(L, 'المصدر الرسمي.', 'Official source.') if t.get('source') else '')
        meta = {'title': tender_title(t, L), 'desc': mk_desc(dparts, L, X(L, 'التفاصيل على منصة صنع في مصر.', 'Details on Made in Egypt Gate.')), 'h1': title, 'og_type': 'website',
                'page_type': 'WebPage', 'jsonld_page': jsonld_tender(t, url, L), 'jsonld_crumbs': crumb_ld, 'kw': kw_for('G', L, cat=X(L, cat['ar'], cat['en'].lower()) if cat else ''),
                'keywords': ', '.join(x for x in [X(L, 'مناقصات', 'tenders'), X(L, cat['ar'], cat['en']) if cat else '', ent] if x), 'about_id': url + '#demand'}
        return body, meta

    def render_tenders_hub(L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + '/tenders/')
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المناقصات', 'Tenders'), lk(L, '/tenders/'))], L, url)
        loc = [t for t in S['tenders'] if t['src'] != 'intl']
        opn = tender_sort([t for t in loc if t['status'] in ('open', 'soon') and t.get('page')])
        intl_open = tender_sort([t for t in S['tenders'] if t['src'] == 'intl' and t['status'] in ('open', 'soon') and t.get('page')])
        recent = sorted([t for t in loc if t['status'] == 'closed' and t.get('index')], key=lambda t: t['deadline'], reverse=True)[:15]
        today = fmt_date(S['today'], L)
        newest = fmt_date(S['tenders_newest'], L) if S.get('tenders_newest') else ''
        h1 = X(L, 'المناقصات الحكومية في مصر – السارية حتى %s', 'Government Tenders in Egypt – Open as of %s') % today
        intro = X(L, 'في بيانات المنصة %s سارية حتى %s من الجهات الحكومية والهيئات وشركات قطاع الأعمال، مع آخر موعد وقيمة الكراسة والتأمين ورابط المصدر الرسمي. ويضم الأرشيف %s، منها %s بلا موعد إغلاق معلن في البيانات المتاحة.',
                  'The platform data holds %s open as of %s from government bodies, authorities and public companies, with closing date, document price, bid bond and the official source. The archive holds %s, %s of them without a published closing date.') % (
            X(L, ar_n(len(opn), 'مناقصة وممارسة', 'مناقصات وممارسات'), '%d tenders' % len(opn)), today, X(L, ar_n(len(loc), 'مناقصة', 'مناقصات'), '%s tenders' % fmt_n(len(loc))),
            fmt_n(sum(1 for t in loc if t['status'] == 'undated')))
        if newest:
            intro += X(L, ' أحدث مناقصة في البيانات منشورة بتاريخ %s.', ' The newest tender in the data was published on %s.') % newest
        cats = [h for h in S['hub_cats'] if h.get('page') and (L == 'ar' or h.get('en'))]
        cat_tiles = ''.join(tile_li(lk(L, h['path']), cat_photo(h['cat']), photo_alt(cat_photo(h['cat']), L, X(L, h['cat']['ar'], h['cat']['en'])),
                                    '%s <small>(%d%s)</small>' % (esc(X(L, h['cat']['ar'], h['cat']['en'])), h['n'], (X(L, '، %d سارية', ', %d open') % h['open']) if h['open'] else '')) for h in cats)
        ents = [e for e in S['hub_entities'] if e['indexable'] and (L == 'ar' or e.get('en'))]
        app = app_url('tenders')
        n_soon = sum(1 for t in opn if t['status'] == 'soon')
        main = stats_html([(str(len(opn)), X(L, ar_noun(len(opn), 'مناقصة سارية', 'مناقصتان ساريتان', 'مناقصات سارية', 'مناقصة سارية') + ' الآن', 'open now'), '#open'),
                           (str(n_soon), X(L, 'تنتهي خلال 7 أيام', 'closing within 7 days'), '#open'),
                           (str(len(intl_open)), X(L, ar_noun(len(intl_open), 'مناقصة دولية', 'مناقصتان دوليتان', 'مناقصات دولية', 'مناقصة دولية') + ' للمصدّرين', 'international tenders for exporters'), '#intl' if intl_open else ''),
                           (fmt_n(len(loc)), X(L, ar_noun(len(loc), 'مناقصة', 'مناقصتان', 'مناقصات', 'مناقصة') + ' في الأرشيف', 'tenders in the archive'), app or '')])
        main += search_box(L, app, X(L, 'ابحث في المناقصات: توريد، كابلات، أسمنت، صيانة…', 'Search tenders: supply, cables, cement, maintenance…'))
        main += '<p class="note">%s</p>' % X(L, 'حالة كل مناقصة محسوبة من آخر موعد للتقديم بتاريخ %s، وتتحدّث في المتصفح بعد انقضاء الموعد.', 'Each status is computed from the closing date as of %s and updates in the browser once the date has passed.') % today
        main += '<section class="sx-sec" id="open">%s%s</section>' % (sec_head('%s (%d)' % (X(L, 'سارية الآن', 'Open now'), len(opn)), app, X(L, 'بحث وفلترة تفاعلية ←', 'Interactive search →') if app else ''),
                                                                     tender_cards(opn, L) if opn else '<p class="muted">%s</p>' % X(L, 'لا توجد مناقصات محلية سارية في البيانات اليوم.', 'No local tenders are open in the data today.'))
        if intl_open:
            ih = S['hub_cat_by_slug'].get('international')
            main += '<section class="sx-sec" id="intl">%s%s%s</section>' % (sec_head('%s (%d)' % (X(L, 'مناقصات دولية سارية للمصدّرين', 'Open international tenders for exporters'), len(intl_open))), tender_cards(intl_open[:15], L),
                                                                           ('<p><a href="%s">%s</a></p>' % (esc(lk(L, ih['path'])), X(L, 'كل المناقصات الدولية ←', 'All international tenders →'))) if ih and ih.get('page') and (L == 'ar' or ih.get('en')) else '')
        main += '<section class="sx-sec">%s<ul class="sx-tiles lg">%s</ul></section>' % (sec_head(X(L, 'المناقصات حسب الفئة', 'Tenders by category')), cat_tiles)
        if ents:
            main += '<section class="card2"><h2>%s</h2><div class="links">%s</div></section>' % (X(L, 'جهات طارحة', 'Issuing entities'), ''.join('<a href="%s">%s <small>(%d)</small></a>' % (esc(lk(L, e['path'])), esc(X(L, e['name'], e['name_en'] or e['name'])), e['n']) for e in ents))
        if recent:
            main += '<section class="sx-sec">%s%s</section>' % (sec_head(X(L, 'انتهت مؤخراً', 'Recently closed')), tender_cards(recent, L))
        if app:
            main += '<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'بحث وفلترة تفاعلية في المناقصات ←', 'Interactive tender search →'))
        aw = '<p class="banner-info"><a href="%s">%s</a></p>' % (esc(lk(L, '/awards/') if (L == 'ar' or page_exists('/en/awards/')) else '/awards/'), X(L, 'ترسيات المناقصات والشركات الفائزة ←', 'Contract awards and winning companies →'))
        hp = VIS_HUB_IMG['tenders']
        body = hero(L, ch, h1, intro, img=hp, alt=photo_alt(hp, L), acts=hero_acts(L, [(X(L, '🔔 سجّل منشأتك لتصلك المناقصات', '🔔 Register to receive matching tenders'), static_url('register', L, '#plans'), 'gold'),
                                                                                    (X(L, '🔍 بحث تفاعلي', '🔍 Interactive search'), app, 'glass')])) + '<div class="wrap sx-main">%s%s</div>' % (main, aw)
        meta = {'title': mk_title([X(L, 'مناقصات مصر السارية %s: %s', 'Egypt Government Tenders Open as of %s: %d') % ((today, ar_n(len(opn), 'مناقصة', 'مناقصات')) if L == 'ar' else (today, len(opn))),
                                   X(L, 'مناقصات مصر السارية: %s', 'Egypt Government Tenders: %d Open') % (ar_n(len(opn), 'مناقصة', 'مناقصات') if L == 'ar' else len(opn))], L),
                'desc': mk_desc([X(L, '%s سارية حتى %s من الجهات الحكومية والهيئات وشركات قطاع الأعمال، مع آخر موعد والكراسة والتأمين ورابط المصدر.', '%d tenders open as of %s from government bodies and public companies, with closing date, documents and source.') % (
                    (ar_n(len(opn), 'مناقصة وممارسة', 'مناقصات وممارسات'), today) if L == 'ar' else (len(opn), today))], L,
                                (X(L, 'أحدث مناقصة في البيانات: %s.', 'Newest tender in the data: %s.') % newest) if newest else ''),
                'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(T(L, t['title'], t.get('title_en')), ('/en' if L == 'en' and t.get('en_ok') else '') + t['path']) for t in (opn + intl_open + recent)], url, h1),
                'kw': kw_for('G', L, cat=X(L, 'مصر اليوم', 'egypt')).replace('مناقصات مصر اليوم', 'مناقصات مصر اليوم'), 'keywords': X(L, 'مناقصات مصر اليوم, مناقصات مصر, مناقصات حكومية', 'egypt tenders, egypt government tenders')}
        return body, meta

    def render_tender_cat(h, L, page_n=1):
        P = '/en' if L == 'en' else ''
        cat = h['cat']
        lst = h['tenders']
        size = S['cfg']['listing_page_size']
        url = abs_url(P + h['path'] + ('page/%d/' % page_n if page_n > 1 else ''))
        cn = X(L, cat['ar'], cat['en'])
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المناقصات', 'Tenders'), lk(L, '/tenders/')), (cn, lk(L, h['path']))], L, url)
        chunk = lst[(page_n - 1) * size: page_n * size]
        h1 = X(L, 'مناقصات %s', '%s Tenders') % cn if not cat.get('intl') else cn
        n_open = h['open']
        n_closed = sum(1 for t in lst if t['status'] == 'closed')
        n_und = sum(1 for t in lst if t['status'] == 'undated')
        ents = top_counts([t for t in lst if t['entity']], lambda t: T(L, t['entity'], t.get('entity_en')), 5)
        if L == 'ar':
            st_ = [x for x in ((ar_qty(n_open, N_OPEN_NOM) if n_open else ''), (ar_qty(n_closed, N_CLOSED_NOM) if n_closed else ''),
                               ((ar_qty(n_und, N_UND_NOM) + ' في البيانات المتاحة') if n_und else '')) if x]
            intro = 'تضم المنصة %s في فئة «%s»%s.' % (ar_qty(len(lst), N_TND_ACC), cat['ar'], (': ' + '، و'.join(st_)) if st_ else '')
            if ents:
                intro += ' من الجهات الطارحة: %s.' % '، '.join('%s (%d)' % e for e in ents)
            if cat.get('intl'):
                intro += ' هذه مناقصات منشورة في أسواق خارج مصر، مفيدة للمصدّرين المصريين، ولكل منها رابط المصدر الرسمي.'
        else:
            st_ = [x for x in (('%s open' % fmt_n(n_open)) if n_open else '', ('%s closed' % fmt_n(n_closed)) if n_closed else '', ('%s without a published closing date' % fmt_n(n_und)) if n_und else '') if x]
            intro = 'The platform holds %s in the «%s» category%s.' % (en_qty(len(lst), 'tender', 'tenders'), cat['en'], (': ' + (', '.join(st_[:-1]) + ' and ' + st_[-1] if len(st_) > 1 else st_[0])) if st_ else '')
            if cat.get('intl'):
                intro += ' These are tenders published outside Egypt, useful for Egyptian exporters, each with its official source.'
        hubs = [S['hub_sector_by_slug'].get(s) for s in cat.get('factory_hubs', [])]
        hubs = [x for x in hubs if x and x['indexable'] and (L == 'ar' or x.get('en'))]
        top = ''
        if page_n == 1:
            app = app_url('tenders')
            top = stats_html([(fmt_n(len(lst)), X(L, ar_noun(len(lst), 'مناقصة', 'مناقصتان', 'مناقصات', 'مناقصة') + ' في الفئة', 'tenders in the category'), '#list'),
                              (fmt_n(n_open), X(L, ar_noun(n_open, 'سارية', 'ساريتان', 'سارية', 'سارية') + ' الآن', 'open now'), '#list'),
                              (fmt_n(n_closed), X(L, 'انتهى موعدها', 'closed'), ''), (fmt_n(n_und), X(L, 'بلا موعد إغلاق معلن', 'without a published closing date'), '')])
            top += search_box(L, app, X(L, 'ابحث في مناقصات %s…' % cat['ar'], 'Search %s tenders…' % cat['en']))
            if hubs:
                top += '<section class="sx-sec">%s%s</section>' % (sec_head(X(L, 'مصانع وشركات يمكنها التوريد', 'Factories and suppliers for this category')), sector_tiles(L, hubs))
        lst_html = '<section class="sx-sec" id="list">%s%s</section>' % (tender_cards(chunk, L), pager(L, h['path'], page_n, h['pages']))
        others = [x for x in S['hub_cats'] if x is not h and x.get('page') and x['indexable'] and (L == 'ar' or x.get('en'))]
        bottom = '<section class="sx-sec">%s<ul class="sx-tiles">%s</ul></section>' % (sec_head(X(L, 'فئات أخرى', 'Other categories')), ''.join(
            tile_li(lk(L, x['path']), cat_photo(x['cat']), photo_alt(cat_photo(x['cat']), L, X(L, x['cat']['ar'], x['cat']['en'])), '%s <small>(%d)</small>' % (esc(X(L, x['cat']['ar'], x['cat']['en'])), x['n'])) for x in others))
        hp = cat_photo(cat)
        body = hero(L, ch, h1, intro if page_n == 1 else (X(L, 'صفحة %d', 'Page %d') % page_n), img=hp, alt=photo_alt(hp, L, cn), small=page_n > 1,
                    acts=hero_acts(L, [(X(L, '🔔 سجّل منشأتك لتصلك مناقصات الفئة', '🔔 Register to receive these tenders'), static_url('register', L, '#plans'), 'gold')]) if page_n == 1 else '') + \
            '<div class="wrap sx-main">%s%s%s</div>' % (top, lst_html, bottom if page_n == 1 else '')
        # «8 مناقصات (3 سارية)»، «مناقصتان (واحدة سارية)»; no «(0 سارية)»
        cnt_ = X(L, ar_qty(len(lst), N_TND_NOM) + ((' (%s)' % ar_qty(n_open, N_OPEN_NOM)) if n_open else ''), fmt_n(len(lst)) + ((' (%d open)' % n_open) if n_open else ''))
        cands = [X(L, 'مناقصات %s في مصر: %s' % (cn, cnt_), '%s Tenders in Egypt: %s' % (cn, cnt_)) if not cat.get('intl') else
                 X(L, 'مناقصات دولية للمصدرين المصريين: %s' % cnt_, 'International Tenders for Egyptian Exporters: %s' % cnt_), h1]
        meta = {'title': mk_title(cands, L, page=page_n), 'desc': mk_desc([intro], L, X(L, 'مع رابط المصدر الرسمي لكل مناقصة.', 'Each with its official source.')), 'h1': h1, 'og_type': 'website',
                'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(T(L, t['title'], t.get('title_en')), ('/en' if L == 'en' and t.get('en_ok') else '') + t['path']) for t in chunk], url, h1),
                'kw': kw_for('G', L, cat=cn if L == 'ar' else cn.lower()), 'keywords': kw_for('G', L, cat=cn if L == 'ar' else cn.lower())}
        return body, meta

    def render_tender_entity(e, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + e['path'])
        nm = X(L, e['name'], e['name_en'] or e['name'])
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المناقصات', 'Tenders'), lk(L, '/tenders/')), (nm, lk(L, e['path']))], L, url)
        lst = tender_sort(e['tenders'])
        n_open = sum(1 for t in lst if t['status'] in ('open', 'soon'))
        h1 = X(L, 'مناقصات %s', 'Tenders of %s') % nm
        if len(lst) == 1:
            intro = X(L, 'تضم المنصة مناقصة واحدة طرحتها %s، %s، مع رابط مصدرها الرسمي.' % (nm, 'سارية الآن' if n_open else 'غير سارية الآن'),
                      'The platform holds one tender issued by %s, %s, with its official source.' % (nm, 'open now' if n_open else 'not open now'))
        else:
            intro = X(L, 'تضم المنصة %s طرحتها %s، %s، لكل منها رابط المصدر الرسمي.' % (ar_qty(len(lst), N_TND_ACC), nm, ('منها ' + ar_qty(n_open, N_OPEN_NOM) + ' الآن') if n_open else 'ولا توجد بينها مناقصة سارية الآن'),
                      'The platform holds %s issued by %s, %s, each with its official source.' % (en_qty(len(lst), 'tender', 'tenders'), nm, ('%d of them open' % n_open) if n_open else 'none of them open now'))
        hp = VIS_HUB_IMG['tenders']
        body = hero(L, ch, h1, intro, img=hp, alt=photo_alt(hp, L), small=True) + '<div class="wrap sx-main">%s<section class="sx-sec">%s</section></div>' % (
            stats_html([(str(len(lst)), X(L, ar_noun(len(lst), 'مناقصة', 'مناقصتان', 'مناقصات', 'مناقصة'), 'tenders'), ''), (str(n_open), X(L, 'سارية الآن', 'open now'), '')]), tender_cards(lst, L))
        cnt_ = X(L, ar_qty(len(lst), N_TND_NOM) + ((' (%s)' % ar_qty(n_open, N_OPEN_NOM)) if n_open else ''), fmt_n(len(lst)) + ((' (%d open)' % n_open) if n_open else ''))
        meta = {'title': mk_title([X(L, 'مناقصات %s: %s' % (nm, cnt_), '%s Tenders: %s' % (nm, cnt_)), h1], L), 'desc': mk_desc([intro], L, X(L, 'التفاصيل على منصة صنع في مصر.', 'Details on Made in Egypt Gate.')),
                'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(T(L, t['title'], t.get('title_en')), ('/en' if L == 'en' and t.get('en_ok') else '') + t['path']) for t in lst], url, h1,
                                                 {"@type": "Organization", "@id": url + '#entity', "name": nm}),
                'kw': X(L, 'مناقصات ' + e['name'], (e['name_en'] or e['name']) + ' tenders'), 'keywords': X(L, 'مناقصات ' + e['name'], (e['name_en'] or e['name']) + ' tenders')}
        return body, meta

    def render_rfq(r, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + r['path'])
        title = rfq_title(r, L)
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'طلبات عروض الأسعار', 'Requests for quotation'), lk(L, '/rfq/')), (clip(title, 70), lk(L, r['path']))], L, url)
        sec = S['sec_by_slug'].get(norm_sector(r['sector']) or '')
        sh = S['hub_sector_by_slug'].get(sec['slug']) if sec else None
        facts = [(X(L, 'رقم الطلب', 'Request no.'), '<span dir="ltr">%s</span>' % esc(r['no']))]
        if r['date']:
            facts.append((X(L, 'تاريخ الطلب', 'Date'), esc(fmt_date(r['date'], L))))
        if sec:
            facts.append((X(L, 'القطاع', 'Sector'), ('<a href="%s">%s</a>' % (esc(lk(L, sh['path']) if (L == 'ar' or sh.get('en')) else sh['path']), esc(X(L, sec['ar'], sec['en'])))) if sh and sh['indexable'] else esc(X(L, sec['ar'], sec['en']))))
        for k, ar, en in (('qty', 'الكمية', 'Quantity'), ('delivery', 'مكان التسليم', 'Delivery'), ('deadline', 'الموعد النهائي', 'Deadline')):
            if r.get(k):
                facts.append((X(L, ar, en), esc(T(L, r[k]))))
        if r['gov']:
            facts.append((X(L, 'المحافظة', 'Governorate'), esc(gov_name(r['gov'], L))))
        if r['flags']:
            miss = [S['inc_bits'].get(str(b)) for b in (1, 32) if r['flags'] & b]
            miss = [m for m in miss if m]
            if miss:
                facts.append((X(L, 'بيانات غير مكتملة', 'Incomplete data'), esc(X(L, '، '.join(miss), ', '.join(T(L, m) for m in miss)))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        details = r['details'] if L == 'ar' else (r['details_en'] or '')
        main = '<div class="card2"><h2>%s</h2><p>%s</p><p class="note">%s</p></div>' % (X(L, 'تفاصيل الطلب', 'Request details'), esc(details), X(L, 'بيانات المشتري وطرق التواصل معه لا تُنشر؛ تصل العروض عبر المنصة.', "The buyer's details are not published; offers go through the platform."))
        others = [x for x in S['rfqs'] if x is not r and x.get('page')][:5]
        if others:
            main += '<section class="card2"><h2>%s</h2><ul class="tlist">%s</ul></section>' % (X(L, 'طلبات أخرى', 'Other requests'), ''.join(
                '<li><a href="%s">%s</a><span class="m">%s</span></li>' % (esc(('/en' if L == 'en' and x.get('en_ok') else '') + x['path']), esc(rfq_title(x, L)), esc(fmt_date(x['date'], L))) for x in others))
        cta = ('<div class="cta"><h2 style="font-size:1.05rem">%s</h2><p>%s</p><a class="btn btn-green" href="%s">%s</a><a class="btn btn-line" href="%s" rel="nofollow">%s</a></div>'
               % (X(L, 'هل تورّد هذا المنتج؟', 'Do you supply this?'), X(L, 'المنشآت المسجّلة في المنصة تصلها طلبات الشراء المطابقة لنشاطها تلقائياً.', 'Registered companies receive matching purchase requests automatically.'),
                  esc(static_url('register', L, '#plans')), X(L, 'سجّل منشأتك', 'Register your company'), esc(rfq_link(None, L)), X(L, 'اطلب عرض سعر مماثل', 'Request a similar quote')))
        intro = X(L, 'طلب عرض سعر رقم %s بتاريخ %s%s.', 'Request for quotation no. %s dated %s%s.') % (r['no'], fmt_date(r['date'], L), (X(L, ' في قطاع ', ' in ') + X(L, sec['ar'], sec['en'])) if sec else '')
        hp = sec_cover(sec['slug']) if sec else VIS_HUB_IMG['rfq']
        body = hero(L, ch, title, intro, img=hp, alt=photo_alt(hp, L, X(L, sec['t_ar'], sec['t_en']) if sec else ''), small=True) + \
            '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2"><h2>%s</h2>%s</div>%s</aside></div></div>' % (main, X(L, 'بيانات الطلب', 'Request facts'), facts_html, cta)
        meta = {'title': page_title(title, L, prefixes=(X(L, 'طلب عرض سعر: ', 'RFQ: '), '')), 'desc': mk_desc([intro, clip(details, 100)], L), 'h1': title,
                'og_type': 'website', 'page_type': 'WebPage', 'jsonld_page': jsonld_rfq(r, url, L), 'jsonld_crumbs': crumb_ld, 'kw': kw_for('I', L, name=cut(title, 40)),
                'keywords': X(L, 'طلب عرض سعر, ', 'request for quotation, ') + (X(L, sec['ar'], sec['en']) if sec else ''), 'about_id': url + '#demand'}
        return body, meta

    def render_rfq_hub(L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + '/rfq/')
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'طلب عرض سعر', 'Request a quote'), lk(L, '/rfq/'))], L, url)
        h1 = X(L, 'طلب عرض سعر من المصانع المصرية', 'Request a Quote from Egyptian Manufacturers')
        n_dir = len(S['dir_members'])
        intro = X(L, 'أرسل طلباً واحداً بالمنتج والكمية والمواصفات ومكان التسليم: يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه. الخدمة مجانية للمشتري.',
                  'Send one request with the product, quantity, specifications and delivery place: it reaches the matching registered factories automatically; if no registered factory matches, the platform team follows it up personally. Free for buyers.')
        steps = X(L, '<ol class="sx-steps"><li>اكتب المنتج والكمية والمواصفات ومكان التسليم والموعد.</li><li>تتم مطابقة الطلب مع المصانع المسجّلة في نفس القطاع والمحافظة.</li><li>تصلك العروض عبر المنصة، ونبلغك بعدد المنشآت التي وصلها الطلب فعلاً.</li><li>لو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه.</li></ol>',
                  '<ol class="sx-steps"><li>Write the product, quantity, specifications, delivery place and date.</li><li>The request is matched with registered factories in the same sector and governorate.</li><li>Offers reach you through the platform, and you are told how many companies actually received the request.</li><li>If no registered factory matches, the platform team follows up personally.</li></ol>')
        lst = [r for r in S['rfqs'] if r.get('page')]
        lis = ''.join('<li><a href="%s">%s</a><span class="m">%s</span></li>' % (esc(('/en' if L == 'en' and r.get('en_ok') else '') + r['path']), esc(rfq_title(r, L)), esc(fmt_date(r['date'], L))) for r in lst)
        main = ('<div class="sx-grid"><div><section class="card2"><h2>%s</h2>%s</section>%s</div><aside>%s</aside></div>'
                % (X(L, 'كيف يعمل طلب عرض السعر؟', 'How does it work?'), steps,
                   ('<section class="card2"><h2>%s</h2><div class="sx-tg"><ul class="tlist">%s</ul></div></section>' % (X(L, 'أحدث طلبات الأسعار المنشورة', 'Latest published requests'), lis)) if lis else '',
                   rfq_box(L, rfq_link(None, L))))
        main = stats_html([(fmt_n(n_dir), X(L, ar_noun(n_dir, 'منشأة', 'منشأتان', 'منشآت', 'منشأة') + ' في الدليل', 'companies in the directory'), lk(L, '/factories/')),
                           (str(len([h for h in S['hub_sectors'] if h['n'] > 0])), X(L, 'قطاعاً صناعياً', 'industrial sectors'), ''),
                           (str(len(lst)), X(L, ar_noun(len(lst), 'طلب منشور', 'طلبان منشوران', 'طلبات منشورة', 'طلباً منشوراً'), 'published requests'), ''),
                           (X(L, 'مجاناً', 'Free'), X(L, 'للمشتري دائماً', 'for buyers, always'), '')]) + main
        faq = [(X(L, 'هل طلب عرض السعر مجاني؟', 'Is the request free?'), X(L, 'نعم، إرسال الطلب مجاني للمشتري.', 'Yes, sending a request is free for buyers.')),
               (X(L, 'لمن يصل طلبي؟', 'Who receives my request?'), X(L, 'يصل طلبك تلقائياً للمصانع المسجّلة المناسبة، ولو مفيش مصنع مسجّل مناسب، فريق المنصة يتابع طلبك بنفسه. لا نَعِد بعدد معيّن من العروض.',
                                                                         'It reaches the matching registered factories automatically; if none matches, the platform team follows it up personally. We do not promise a number of offers.')),
               (X(L, 'هل تُنشر بياناتي؟', 'Are my details published?'), X(L, 'لا تُنشر بيانات التواصل الخاصة بالمشتري في صفحات الطلبات.', "The buyer's contact details are never published on request pages."))]
        hp = VIS_HUB_IMG['rfq']
        body = hero(L, ch, h1, intro, img=hp, alt=photo_alt(hp, L), acts=hero_acts(L, [(X(L, '📝 أرسل طلب عرض سعر الآن', '📝 Send a request now'), rfq_link(None, L), 'gold'),
                                                                                    (X(L, '🏭 تصفّح دليل المصانع', '🏭 Browse the directory'), lk(L, '/factories/'), 'glass')])) + '<div class="wrap sx-main">%s%s</div>' % (main, faq_html(L, faq))
        meta = {'title': mk_title([X(L, 'اطلب عرض سعر من المصانع المصرية مجاناً', 'Request a Quote from Egyptian Manufacturers (Free RFQ)')], L),
                'desc': mk_desc([X(L, 'أرسل طلباً واحداً بالكمية والمواصفات؛ يصل للمصانع المسجّلة المناسبة، أو يتابعه فريقنا حتى نجد لك مصنعاً.', 'Send one request with quantity and specs; it reaches matching registered factories, or our team follows it up.')], L),
                'h1': h1, 'og_type': 'website', 'page_type': 'WebPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(rfq_title(r, L), ('/en' if L == 'en' and r.get('en_ok') else '') + r['path']) for r in lst], url, h1) if lst else None,
                'kw': kw_for('I', L, name='').strip(), 'keywords': X(L, 'طلب عرض سعر, طلب عرض سعر من شركة, RFQ مصر', 'rfq egypt, request for quotation egypt')}
        return body, meta

    def render_award(a, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + a['path'])
        title = T(L, a.get('title_ar'))
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'الترسيات', 'Contract awards'), lk(L, '/awards/')), (clip(title, 70), lk(L, a['path']))], L, url)
        vals = []
        for k, cur_ar, cur_en in (('value_egp_million', 'مليون جنيه', 'million EGP'), ('value_usd_million', 'مليون دولار', 'million USD'), ('value_eur_million', 'مليون يورو', 'million EUR')):
            if a.get(k):
                vals.append('%s %s' % ('{:,}'.format(a[k]), X(L, cur_ar, cur_en)))
        facts = [(X(L, 'الشركة الفائزة', 'Winner'), esc(T(L, a.get('winner_ar')))), (X(L, 'الجهة المالكة / المسندة', 'Awarding entity'), esc(T(L, a.get('awarding_entity_ar'))))]
        if vals:
            facts.append((X(L, 'قيمة العقد', 'Contract value'), esc(X(L, ' / '.join(vals), ' / '.join(vals)))))
        if a.get('region_code'):
            gh = S['hub_gov_by_code'].get(a['region_code'])
            facts.append((X(L, 'المحافظة', 'Governorate'), ('<a href="%s">%s</a>' % (esc(lk(L, gh['path']) if (L == 'ar' or gh.get('en')) else gh['path']), esc(gov_name(a['region_code'], L)))) if gh else esc(gov_name(a['region_code'], L))))
        if a.get('city'):
            facts.append((X(L, 'المدينة', 'City'), esc(T(L, a['city']))))
        if a.get('date'):
            facts.append((X(L, 'تاريخ الإعلان', 'Announced'), esc(fmt_date(a['date'], L))))
        if a.get('source_url'):
            facts.append((X(L, 'المصدر', 'Source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(a['source_url']), esc(urlparse(a['source_url']).netloc.replace('www.', '')))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        intro = X(L, 'ترسية %s على %s%s، بإسناد من %s.', 'Contract %s awarded to %s%s by %s.') % (title, T(L, a.get('winner_ar')), (X(L, ' بقيمة ', ' worth ') + vals[0]) if vals else '', T(L, a.get('awarding_entity_ar')))
        others = [x for x in S['awards'] if x is not a][:6]
        main = '<div class="card2"><h2>%s</h2>%s</div>' % (X(L, 'بيانات الترسية', 'Award details'), facts_html)
        main += '<section class="card2"><h2>%s</h2><div class="sx-aw"><ul class="tlist">%s</ul></div></section>' % (X(L, 'ترسيات أخرى', 'Other awards'), ''.join(
            '<li><a href="%s">%s</a><span class="m">%s</span></li>' % (esc(('/en' if L == 'en' and x.get('en_ok') else '') + x['path']), esc(T(L, x.get('title_ar'))), esc(T(L, x.get('winner_ar')))) for x in others))
        hp = VIS_HUB_IMG['awards']
        body = hero(L, ch, title, intro, img=hp, alt=photo_alt(hp, L), small=True) + '<div class="wrap sx-main">%s</div>' % main
        meta = {'title': mk_title([X(L, 'ترسية %s على %s', 'Award: %s to %s') % (cut(title, 40), T(L, a.get('winner_ar'))), X(L, 'ترسية: %s', 'Award: %s') % cut(title, 50)], L),
                'desc': mk_desc([intro], L, X(L, 'المصدر والتفاصيل على منصة صنع في مصر.', 'Source and details on Made in Egypt Gate.')), 'h1': title, 'og_type': 'website', 'page_type': 'WebPage',
                'jsonld_crumbs': crumb_ld, 'jsonld_page': {"@context": "https://schema.org", "@type": "Thing", "@id": url + '#award', "name": title, "description": intro, "url": url},
                'kw': kw_for('H', L, name=cut(title, 40)), 'keywords': X(L, 'ترسية, ', 'contract award, ') + T(L, a.get('winner_ar')), 'about_id': url + '#award'}
        return body, meta

    def render_simple_hub(L, kind, items_html, h1, intro, title_c, dparts, items_ld, cluster, kw, tail=None, path=None, img=None, alt=None, acts='', top=''):
        P = '/en' if L == 'en' else ''
        path = path or url_for(kind)
        url = abs_url(P + path)
        ch, crumb_ld = crumbs([home_crumb(L), (h1, lk(L, path))], L, url)
        body = hero(L, ch, h1, intro, img=img, alt=alt, acts=acts) + '<div class="wrap sx-main">%s%s</div>' % (top, items_html)
        meta = {'title': mk_title(title_c, L), 'desc': mk_desc(dparts, L, tail), 'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection(items_ld, url, h1) if items_ld else None, 'kw': kw, 'keywords': kw}
        return body, meta

    def render_awards_hub(L):
        P = '/en' if L == 'en' else ''
        A = S['awards']
        def aw_li(a):
            vals = [('%s %s' % ('{:,}'.format(a[k]), X(L, ca, ce))) for k, ca, ce in (('value_egp_million', 'مليون جنيه', 'million EGP'), ('value_usd_million', 'مليون دولار', 'million USD'), ('value_eur_million', 'مليون يورو', 'million EUR')) if a.get(k)]
            ent = TX(L, a.get('awarding_entity_ar') or '') if a.get('awarding_entity_ar') else None
            return ('<li><a href="%s">%s</a><span class="m">%s · %s</span>%s%s</li>'
                    % (esc(('/en' if L == 'en' and a.get('en_ok') else '') + a['path']), esc(T(L, a.get('title_ar'))), esc(T(L, a.get('winner_ar'))), esc(fmt_date(a.get('date'), L)),
                       ('<small class="muted">%s</small>' % esc(ent)) if ent else '', ('<span class="chip chip-gold">%s</span>' % esc(vals[0])) if vals else ''))
        lis = ''.join(aw_li(a) for a in A)
        app = app_url('winners')
        html = '<section class="sx-sec">%s<div class="sx-aw"><ul class="tlist">%s</ul></div>%s</section>' % (sec_head(X(L, 'الترسيات المعلنة', 'Published awards')), lis, ('<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'بحث تفاعلي في الترسيات ←', 'Interactive awards search →'))) if app else '')
        h1 = X(L, 'ترسيات المناقصات والشركات الفائزة في مصر', 'Contract Awards and Winning Companies in Egypt')
        n_val = sum(1 for a in A if any(a.get(k) for k in ('value_egp_million', 'value_usd_million', 'value_eur_million')))
        intro = X(L, 'نتائج ترسية معلنة لـ%d عقداً في مصر: من فاز بكل عقد ولدى أي جهة، مع رابط المصدر لكل ترسية. قيمة العقد معلنة في %d منها فقط.',
                  'Published contract awards for %d contracts in Egypt: who won each contract and from which entity, with the source of each award. The contract value is published for %d of them only.') % (len(A), n_val)
        n_w = len(set(a.get('winner_ar') for a in A if a.get('winner_ar')))
        n_e = len(set(a.get('awarding_entity_ar') for a in A if a.get('awarding_entity_ar')))
        top = stats_html([(str(len(A)), X(L, ar_noun(len(A), 'ترسية معلنة', 'ترسيتان معلنتان', 'ترسيات معلنة', 'ترسية معلنة'), 'published awards'), ''),
                          (str(n_val), X(L, 'بقيمة عقد معلنة', 'with a published contract value'), ''),
                          (str(n_w), X(L, ar_noun(n_w, 'شركة فائزة', 'شركتان فائزتان', 'شركات فائزة', 'شركة فائزة'), 'winning companies'), ''),
                          (str(n_e), X(L, ar_noun(n_e, 'جهة مسندة', 'جهتان مسندتان', 'جهات مسندة', 'جهة مسندة'), 'awarding entities'), '')])
        hp = VIS_HUB_IMG['awards']
        return render_simple_hub(L, 'awards', html, h1, intro, [X(L, 'ترسيات المناقصات في مصر: الشركات الفائزة والجهات المسندة', 'Contract Awards in Egypt: Winning Companies & Awarding Entities')], [intro],
                                 [(T(L, a.get('title_ar')), ('/en' if L == 'en' and a.get('en_ok') else '') + a['path']) for a in A], 'H', X(L, 'ترسيات المناقصات', 'contract awards egypt'),
                                 X(L, 'التفاصيل والمصادر على منصة صنع في مصر.', 'Details and sources on Made in Egypt Gate.'), img=hp, alt=photo_alt(hp, L), top=top,
                                 acts=hero_acts(L, [(X(L, '🔔 تابع المناقصات السارية', '🔔 See open tenders'), lk(L, '/tenders/') if (L == 'ar' or page_exists('/en/tenders/')) else '/tenders/', 'gold')]))

    def news_img(n):
        f = n.get('image_file') or ''
        return '/' + f if f and os.path.exists(B + f) else OG_DEFAULT

    def render_news(n, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + n['path'])
        title = T(L, n.get('title_ar'))
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'الأخبار', 'News'), lk(L, '/news/')), (clip(title, 70), lk(L, n['path']))], L, url)
        img = news_img(n)
        summ = T(L, n.get('summary_ar') or '')
        rel = n.get('related') or []
        rel_html = ''
        if rel:
            rel_html = '<section class="card2"><h2>%s</h2><div class="links">%s</div></section>' % (X(L, 'منشآت وقطاعات مذكورة في الخبر', 'Companies and sectors in this story'), ''.join(
                '<a href="%s">%s</a>' % (esc(('/en' if L == 'en' and x[2] else '') + x[1]), esc(x[0])) for x in rel))
        g = S['gov_by_code'].get(n.get('region_code') or '')
        own = news_own(n)
        if own:
            src = esc(X(L, 'أرشيف أخبار منصة صنع في مصر', "Made in Egypt Gate's news archive"))
        else:
            src = '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(n.get('url')), esc(n.get('source_name') or urlparse(n.get('url') or '').netloc))
        facts = [(X(L, 'التاريخ', 'Date'), esc(fmt_date(n.get('date'), L))), (X(L, 'المصدر', 'Source'), src)]
        if n.get('category_ar'):
            facts.append((X(L, 'التصنيف', 'Category'), esc(T(L, n['category_ar']))))
        if g:
            facts.append((X(L, 'المحافظة', 'Governorate'), esc(X(L, g['ar'], g['en']))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        if own:
            src_html = '<p class="note">%s</p>' % X(L, 'ملخص قصير من أرشيف أخبار المنصة (نُشر أصلاً على موقع المنصة السابق).', "A short summary from the platform's news archive (first published on the platform's previous website).")
        else:
            src_html = ('<p class="note">%s</p><a class="btn btn-line" href="%s" rel="nofollow noopener" target="_blank">%s</a>'
                        % (X(L, 'ملخص قصير من المنصة؛ النص الكامل في المصدر الأصلي.', 'A short summary by the platform; the full story is at the original source.'), esc(n.get('url')),
                           X(L, 'اقرأ الخبر في المصدر الأصلي ↗', 'Read the full story at the source ↗')))
        main = ('<div class="card2"><img src="%s" alt="%s" width="1200" height="900" loading="lazy" style="width:100%%;height:auto;border-radius:12px;aspect-ratio:4/3;object-fit:cover"><p>%s</p>%s</div>%s'
                % (esc(img), esc(title), esc(summ), src_html, rel_html))
        body = hero(L, ch, title, '') + '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2">%s</div></aside></div></div>' % (main, facts_html)
        meta = {'title': news_title(n, L), 'desc': mk_desc([summ], L, X(L, 'المصدر: %s.' % (n.get('source_name') or ''), 'Source: %s.' % (n.get('source_name') or ''))), 'h1': title, 'og_type': 'article',
                'og_image': img, 'page_type': 'WebPage', 'jsonld_page': jsonld_news(n, url, L, img), 'jsonld_crumbs': crumb_ld, 'kw': title, 'keywords': X(L, 'أخبار الصناعة المصرية', 'egypt industry news'),
                'about_id': url + '#article'}
        return body, meta

    def render_news_hub(L, page_n=1):
        P = '/en' if L == 'en' else ''
        N = S['news_sorted']
        size = S['cfg']['listing_page_size']
        pages = max(1, (len(N) + size - 1) // size)
        chunk = N[(page_n - 1) * size: page_n * size]
        url = abs_url(P + '/news/' + ('page/%d/' % page_n if page_n > 1 else ''))
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'الأخبار', 'News'), lk(L, '/news/'))], L, url)
        h1 = X(L, 'أخبار الصناعة المصرية', 'Egyptian Industry News')
        n_own = sum(1 for x in N if news_own(x))
        intro = X(L, 'أخبار الصناعة والاستثمار والتصدير في مصر: %d خبراً، منها %d من أرشيف أخبار المنصة و%d ملخصاً لأخبار منشورة مع رابط مصدرها الأصلي. آخر خبر بتاريخ %s.',
                  'Industry, investment and export news from Egypt: %d stories – %d from the platform\'s news archive and %d summaries of published stories with a link to the original source. The latest is dated %s.') % (
            len(N), n_own, len(N) - n_own, fmt_date(N[0].get('date') if N else '', L))
        # the same stories, dates and sources as before, as photo cards (the newest one large on page 1); then the videos
        lis = ''.join(news_card(n, L, big=(page_n == 1 and i == 0)) for i, n in enumerate(chunk))
        app = app_url('news')
        top = ''
        if page_n == 1:
            n_img = sum(1 for x in N if x.get('image_file'))
            top = stats_html([(fmt_n(len(N)), X(L, ar_noun(len(N), 'خبر', 'خبران', 'أخبار', 'خبراً'), 'stories'), '#list'),
                              (fmt_n(n_own), X(L, 'من أرشيف أخبار المنصة', "from the platform's news archive"), ''),
                              (fmt_n(len(N) - n_own), X(L, 'ملخصاً بمصدره الأصلي', 'summaries with their original source'), ''),
                              (fmt_n(len((S.get('vis') or {}).get('videos') or [])), X(L, 'فيديو في المرئيات', 'videos in the media centre'), static_url('videos', L))])
        html = '<section class="sx-sec" id="list">%s<ul class="sx-news">%s</ul>%s%s</section>' % (sec_head(X(L, 'أحدث الأخبار', 'Latest news')) if page_n == 1 else '', lis, pager(L, '/news/', page_n, pages),
                                                                                       ('<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'البوابة الإخبارية التفاعلية ←', 'Interactive news portal →'))) if app and page_n == 1 else '')
        if page_n == 1:
            html += visual_strips(L, videos=pick_videos(8), vid_title=X(L, 'المرئيات واللقاءات الصناعية', 'Industry videos & interviews'))
        hp = (N[0].get('image_file') if N and N[0].get('image_file') and os.path.isfile(B + N[0]['image_file']) else '') or VIS_HUB_IMG['events']
        body = hero(L, ch, h1, intro if page_n == 1 else (X(L, 'صفحة %d', 'Page %d') % page_n), img=hp, alt=(T(L, N[0].get('title_ar')) if N and hp == N[0].get('image_file') else photo_alt(hp, L)), small=page_n > 1,
                    acts=hero_acts(L, [(X(L, '🎬 المركز الإعلامي', '🎬 Media centre'), static_url('media-center', L), 'gold'), (X(L, '📅 المعارض والفعاليات', '📅 Exhibitions & events'), lk(L, '/events/') if (L == 'ar' or page_exists('/en/events/')) else '/events/', 'glass')]) if page_n == 1 else '') + \
            '<div class="wrap sx-main">%s%s</div>' % (top, html)
        meta = {'title': mk_title([X(L, 'أخبار الصناعة المصرية والاستثمار والتصدير', 'Egyptian Industry, Investment & Export News'), h1], L, page=page_n), 'desc': mk_desc([intro], L, ''),
                'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection([(T(L, n.get('title_ar')), ('/en' if L == 'en' and n.get('en_ok') else '') + n['path']) for n in chunk], url, h1), 'kw': X(L, 'أخبار الصناعة المصرية', 'egypt industry news'),
                'keywords': X(L, 'أخبار الصناعة, أخبار المصانع, الاستثمار الصناعي', 'egypt industry news')}
        return body, meta, pages

    def render_event(e, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + e['path'])
        name = X(L, e.get('name_ar'), e.get('name_en') or e.get('name_ar'))
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المعارض والفعاليات', 'Exhibitions & events'), lk(L, '/events/')), (name, lk(L, e['path']))], L, url)
        end = pdate(e.get('end_date') or e.get('start_date'))
        ended = bool(end and end < S['today'])
        img = ('/' + e['image_file']) if e.get('image_file') and os.path.exists(B + e['image_file']) else ''
        g = S['gov_by_code'].get(e.get('region_code') or '')
        facts = [(X(L, 'التاريخ', 'Dates'), esc('%s – %s' % (fmt_date(e.get('start_date'), L), fmt_date(e.get('end_date') or e.get('start_date'), L)))),
                 (X(L, 'المكان', 'Venue'), esc(T(L, e.get('venue') or ''))), (X(L, 'المدينة', 'City'), esc(T(L, e.get('city') or '')))]
        if g:
            gh = S['hub_gov_by_code'].get(g['code'])
            facts.append((X(L, 'المحافظة', 'Governorate'), ('<a href="%s">%s</a>' % (esc(lk(L, gh['path']) if (L == 'ar' or gh.get('en')) else gh['path']), esc(X(L, g['ar'], g['en'])))) if gh else esc(X(L, g['ar'], g['en']))))
        if e.get('organizer'):
            facts.append((X(L, 'المنظّم', 'Organizer'), esc(T(L, e['organizer']))))
        if e.get('sector_ar'):
            facts.append((X(L, 'القطاع', 'Sector'), esc(T(L, e['sector_ar']))))
        if ended or not end:
            facts.append((X(L, 'الحالة', 'Status'), esc(X(L, 'انتهى', 'Ended') if ended else X(L, 'قادم', 'Upcoming'))))
        else:
            facts.append((X(L, 'الحالة', 'Status'), '<span data-after="%s" data-after-text="%s">%s</span>' % (end.isoformat(), esc(X(L, 'انتهى', 'Ended')), esc(X(L, 'قادم', 'Upcoming')))))
        if e.get('url'):
            facts.append((X(L, 'الموقع الرسمي', 'Official website'), '<a href="%s" rel="noopener" target="_blank">%s</a>' % (esc(e['url']), esc(urlparse(e['url']).netloc.replace('www.', '')))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        about = T(L, e.get('about_ar') or '')
        agenda = [T(L, x) for x in (e.get('agenda_ar') or [])]
        main = '<div class="card2">%s<h2>%s</h2><p>%s</p>%s</div>' % (
            ('<img src="%s" alt="%s" width="1200" height="675" loading="lazy" style="width:100%%;height:auto;border-radius:12px;aspect-ratio:16/9;object-fit:cover">' % (esc(img), esc(name))) if img else '',
            X(L, 'عن الفعالية', 'About the event'), esc(about), ('<h2>%s</h2><ul>%s</ul>' % (X(L, 'الأجندة', 'Agenda'), ''.join('<li>%s</li>' % esc(x) for x in agenda))) if agenda else '')
        if ended:
            main = '<p class="banner-end">%s</p>' % X(L, 'انتهى – انتهت هذه الدورة في %s.', 'Ended – this edition ended on %s.') % fmt_date(end, L) + main
        up = [x for x in S['events_sorted'] if x is not e and (pdate(x.get('end_date') or x.get('start_date')) or S['today']) >= S['today']][:5]
        if up:
            main += '<section class="card2"><h2>%s</h2><ul class="tlist">%s</ul></section>' % (X(L, 'فعاليات قادمة', 'Upcoming events'), ''.join(
                '<li><a href="%s">%s</a><span class="m">%s</span></li>' % (esc(('/en' if L == 'en' and x.get('en_ok') else '') + x['path']), esc(X(L, x.get('name_ar'), x.get('name_en') or x.get('name_ar'))), esc(fmt_date(x.get('start_date'), L))) for x in up))
        intro = X(L, '%s: %s – %s في %s.', '%s: %s – %s, %s.') % (name, fmt_date(e.get('start_date'), L), fmt_date(e.get('end_date') or e.get('start_date'), L), T(L, e.get('venue') or e.get('city') or ''))
        body = hero(L, ch, name, intro) + '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2"><h2>%s</h2>%s</div></aside></div></div>' % (main, X(L, 'بيانات الفعالية', 'Event facts'), facts_html)
        meta = {'title': mk_title(['%s – %s' % (name, fmt_date(e.get('start_date'), L)), name], L), 'desc': mk_desc([intro, clip(about, 90)], L, X(L, 'التفاصيل والموقع الرسمي.', 'Details and official website.')),
                'h1': name, 'og_type': 'website', 'og_image': img or None, 'page_type': 'WebPage', 'jsonld_page': jsonld_event(e, url, L, img), 'jsonld_crumbs': crumb_ld,
                'kw': name, 'keywords': X(L, 'معارض مصر, ', 'egypt exhibitions, ') + name, 'about_id': url + '#event'}
        return body, meta

    def render_events_hub(L):
        E = S['events_sorted']
        up = [e for e in E if (pdate(e.get('end_date') or e.get('start_date')) or S['today']) >= S['today']]
        past = [e for e in E if e not in up]

        def li(e):
            return '<li><a href="%s">%s</a><span class="m">%s · %s</span></li>' % (esc(('/en' if L == 'en' and e.get('en_ok') else '') + e['path']), esc(X(L, e.get('name_ar'), e.get('name_en') or e.get('name_ar'))), esc(fmt_date(e.get('start_date'), L)), esc(T(L, e.get('city') or '')))
        app = app_url('events')
        html = '<section class="sx-sec">%s<ul class="sx-evs">%s</ul></section>' % (sec_head('%s (%d)' % (X(L, 'قادمة', 'Upcoming'), len(up)), app, X(L, 'الرزنامة التفاعلية ←', 'Interactive calendar →') if app else ''), ''.join(event_card(e, L) for e in up))
        if past:
            html += '<section class="sx-sec sx-past">%s<ul class="sx-evs">%s</ul></section>' % (sec_head('%s (%d)' % (X(L, 'انتهت', 'Ended'), len(past))), ''.join(event_card(e, L) for e in past))
        if app:
            html += '<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'الرزنامة التفاعلية ←', 'Interactive calendar →'))
        n_sec = len(set(e.get('sector_ar') for e in E if e.get('sector_ar')))
        nxt = up[0] if up else None
        top = stats_html([(str(len(E)), X(L, ar_noun(len(E), 'معرض وفعالية', 'معرضان وفعاليتان', 'معارض وفعاليات', 'معرضاً وفعالية'), 'exhibitions & events'), ''),
                          (str(len(up)), X(L, 'قادمة', 'upcoming'), ''),
                          (fmt_date(nxt.get('start_date'), L) if nxt else '', X(L, 'موعد أقرب معرض', 'next event'), ('/en' if L == 'en' and nxt.get('en_ok') else '') + nxt['path'] if nxt else ''),
                          (str(n_sec), X(L, ar_noun(n_sec, 'قطاع', 'قطاعان', 'قطاعات', 'قطاعاً'), 'sectors'), '')] + ([(str(len(past)), X(L, 'انتهت', 'ended'), '')] if past and len(up) < 3 else []))
        h1 = X(L, 'المعارض والفعاليات الصناعية في مصر', 'Industrial Exhibitions & Events in Egypt')
        intro = X(L, 'رزنامة %d معرضاً وفعالية صناعية في مصر: %d قادمة و%d انتهت، بالتواريخ والأماكن والمواقع الرسمية.', 'A calendar of %d industrial exhibitions and events in Egypt: %d upcoming and %d ended, with dates, venues and official websites.') % (len(E), len(up), len(past))
        hp = VIS_HUB_IMG['events']
        return render_simple_hub(L, 'events', html, h1, intro, [X(L, 'معارض مصر %d: رزنامة المعارض والفعاليات الصناعية', 'Egypt Exhibitions %d: Industrial Events Calendar') % S['today'].year], [intro],
                                 [(X(L, e.get('name_ar'), e.get('name_en') or e.get('name_ar')), ('/en' if L == 'en' and e.get('en_ok') else '') + e['path']) for e in E], 'M', X(L, 'معارض مصر, معارض صناعية في مصر', 'egypt exhibitions'),
                                 X(L, 'التفاصيل على منصة صنع في مصر.', 'Details on Made in Egypt Gate.'), img=hp, alt=photo_alt(hp, L, h1), top=top,
                                 acts=hero_acts(L, [(X(L, '🎬 المركز الإعلامي', '🎬 Media centre'), static_url('media-center', L), 'gold')]))

    def money_m(v, L):
        if v in (None, ''):
            return X(L, 'قيمة غير معلنة', 'Value not announced')
        try:
            v = float(v)
        except Exception:
            return str(v)
        if v >= 1000:
            return X(L, '%s مليار جنيه', 'EGP %s billion') % ('{:,.1f}'.format(v / 1000).rstrip('0').rstrip('.'))
        return X(L, '%s مليون جنيه', 'EGP %s million') % ('{:,.0f}'.format(v))

    def render_project(p, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + p['path'])
        name = T(L, p['name'])
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'المشاريع', 'Projects'), lk(L, '/projects/')), (clip(name, 70), lk(L, p['path']))], L, url)
        stage = S['stages'][p['stage']] if isinstance(p['stage'], int) and 0 <= p['stage'] < len(S['stages']) else ''
        gh = S['hub_gov_by_code'].get(p['gov'])
        facts = []
        if p['gov']:
            facts.append((X(L, 'المحافظة', 'Governorate'), ('<a href="%s">%s</a>' % (esc(lk(L, gh['path']) if (L == 'ar' or gh.get('en')) else gh['path']), esc(gov_name(p['gov'], L)))) if gh else esc(gov_name(p['gov'], L))))
        for lab_ar, lab_en, v in (('الموقع', 'Location', p['loc']), ('القطاع', 'Sector', p['sector']), ('المالك', 'Owner', p['owner']), ('المقاول الرئيسي', 'Main contractor', p['contractor']), ('الاستشاري', 'Consultant', p['consultant'])):
            if v:
                facts.append((X(L, lab_ar, lab_en), esc(T(L, v))))
        if stage:
            facts.append((X(L, 'المرحلة (حسب آخر خبر منشور)', 'Stage (per the latest published news)'), esc(T(L, stage))))
        facts.append((X(L, 'القيمة', 'Value'), esc(money_m(p['value'], L))))
        if p['start']:
            facts.append((X(L, 'البدء', 'Start'), esc(str(p['start']))))
        if p['end']:
            facts.append((X(L, 'الانتهاء المتوقع', 'Expected completion'), esc(str(p['end']))))
        if p['source']:
            facts.append((X(L, 'المصدر', 'Source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(p['source']), esc(urlparse(p['source']).netloc.replace('www.', '')))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        ups = ''.join('<li><span class="m">%s</span>%s</li>' % (esc(fmt_date(u[0], L)), esc(T(L, u[1]))) for u in p['updates'] if u and len(u) > 1)
        main = '<section class="card2"><h2>%s</h2><ul class="tlist">%s</ul></section>' % (X(L, 'آخر التحديثات المنشورة', 'Latest published updates'), ups) if ups else ''
        main += '<p class="note">%s</p>' % X(L, 'المنصة لا تنشر بنود توريد متوقعة أو غير مؤكدة للمشروع؛ المرجع هو المصدر الرسمي.', 'The platform does not publish expected or unconfirmed supply items; the reference is the official source.')
        sim = [x for x in S['projects'] if x is not p and (x['sector'] == p['sector'] or x['gov'] == p['gov'])][:5]
        if sim:
            main += '<section class="card2"><h2>%s</h2><ul class="sx-pjs">%s</ul></section>' % (X(L, 'مشاريع مشابهة', 'Similar projects'), ''.join(project_card(x, L) for x in sim))
        intro = X(L, '%s – %s%s. %s.', '%s – %s%s. %s.') % (name, T(L, p['sector']), (X(L, ' في ', ' in ') + gov_name(p['gov'], L)) if p['gov'] else '', money_m(p['value'], L))
        pph = project_photo(p)
        body = hero(L, ch, name, intro, img=pph, alt=photo_alt(pph, L, name), small=True) + '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2"><h2>%s</h2>%s</div>%s</aside></div></div>' % (
            main, X(L, 'بيانات المشروع', 'Project facts'), facts_html, rfq_box(L, rfq_link(None, L)))
        img = ('/' + p['img']) if p['img'] and os.path.exists(B + p['img']) else None
        meta = {'title': mk_title([name], L), 'desc': mk_desc([intro, X(L, 'المالك: %s.', 'Owner: %s.') % T(L, p['owner']) if p['owner'] else ''], L, X(L, 'المصدر والتحديثات على منصة صنع في مصر.', 'Source and updates on Made in Egypt Gate.')),
                'h1': name, 'og_type': 'website', 'og_image': img, 'page_type': 'WebPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': {"@context": "https://schema.org", "@type": "Thing", "@id": url + '#project', "name": name, "description": intro, "url": url},
                'kw': name, 'keywords': X(L, 'مشروعات مصر, ', 'egypt projects, ') + T(L, p['sector']), 'about_id': url + '#project'}
        return body, meta

    def render_projects_hub(L):
        Pj = S['projects']
        by_sec = top_counts(Pj, lambda p: p['sector'], 20)
        html = ''
        for sec, k in by_sec:
            html += '<section class="sx-sec">%s<ul class="sx-pjs">%s</ul></section>' % (sec_head('%s (%d)' % (T(L, sec), k)), ''.join(project_card(p, L) for p in Pj if p['sector'] == sec))
        app = app_url('projects')
        if app:
            html += '<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'بحث وفلترة تفاعلية في المشاريع ←', 'Interactive project search →'))
        h1 = X(L, 'مشاريع مصر الحكومية والخاصة', 'Government and Private Projects in Egypt')
        n_val = sum(1 for p in Pj if p['value'] not in (None, ''))
        n_ctr = sum(1 for p in Pj if p['contractor'] and not re.match(r'^\s*(?:لم يُ?علن|غير معلن|غير معروف|غير محدد|[-—–])\s*$', str(p['contractor'])))
        intro = X(L, '%d مشروعاً في مصر من مصادر منشورة، مع المالك والمرحلة حسب آخر خبر ورابط المصدر لكل مشروع. المقاول مذكور في %d منها، والقيمة معلنة في %d فقط.',
                  '%d projects in Egypt from published sources, with the owner, the stage per the latest news and the source of each project. The contractor is named for %d of them and the value is published for %d only.') % (len(Pj), n_ctr, n_val)
        tot_v = sum(float(p['value']) for p in Pj if p['value'] not in (None, '') and re.match(r'^[\d.]+$', str(p['value'])))
        top = stats_html([(str(len(Pj)), X(L, ar_noun(len(Pj), 'مشروع', 'مشروعان', 'مشروعات', 'مشروعاً') + ' من مصادر منشورة', 'projects from published sources'), app or ''),
                          (money_m(tot_v, L) if tot_v else '', X(L, 'القيمة المعلنة لـ%s' % ar_count(n_val, 'مشروع واحد', 'مشروعين', 'مشروعات', 'مشروعاً'), 'declared value of %d projects' % n_val), ''),
                          (str(len(by_sec)), X(L, ar_noun(len(by_sec), 'قطاع', 'قطاعان', 'قطاعات', 'قطاعاً'), 'sectors'), ''),
                          (str(n_ctr), X(L, 'مقاولها الرئيسي معلن', 'with a named main contractor'), '')])
        top += search_box(L, app, X(L, 'ابحث باسم المشروع أو المدينة أو المالك…', 'Search by project, city or owner…'))
        hp = VIS_HUB_IMG['projects']
        return render_simple_hub(L, 'projects', html, h1, intro, [X(L, 'مشروعات مصر %d: %d مشروعاً بالمالك والمرحلة والمصدر', 'Egypt Projects %d: %d Projects with Owner, Stage & Source') % (S['today'].year, len(Pj))], [intro],
                                 [(T(L, p['name']), ('/en' if L == 'en' and p.get('en_ok') else '') + p['path']) for p in Pj], 'M', X(L, 'مشروعات قومية في مصر', 'egypt projects'),
                                 X(L, 'المصادر على منصة صنع في مصر.', 'Sources on Made in Egypt Gate.'), img=hp, alt=photo_alt(hp, L), top=top,
                                 acts=hero_acts(L, [(X(L, '📝 اطلب عرض سعر لمواد مشروعك', '📝 Request a quote for project materials'), rfq_link(None, L), 'gold'),
                                                    (X(L, '🔍 تصفّح المشاريع تفاعلياً', '🔍 Browse projects interactively'), app, 'glass')]))

    def render_offer(o, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + o['path'])
        name = X(L, o.get('product_ar'), o.get('product_en') or o.get('product_ar'))
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'العروض', 'Offers'), lk(L, '/offers/')), (clip(name, 70), lk(L, o['path']))], L, url)
        facts = [(X(L, 'السعر', 'Price'), esc(X(L, '%s جنيه', 'EGP %s') % o.get('price_egp')))]
        if o.get('old_price_egp'):
            facts.append((X(L, 'السعر قبل الخصم', 'Before discount'), esc(X(L, '%s جنيه', 'EGP %s') % o.get('old_price_egp'))))
        facts.append((X(L, 'المتجر', 'Store'), esc(X(L, o.get('store_ar'), o.get('store_en') or o.get('store_ar')))))
        if o.get('cities_ar'):
            facts.append((X(L, 'المدن', 'Cities'), esc(X(L, '، '.join(o['cities_ar']), ', '.join(T(L, c) for c in o['cities_ar'])))))
        if o.get('valid_to'):
            facts.append((X(L, 'مدة العرض', 'Valid'), esc('%s – %s' % (fmt_date(o.get('valid_from'), L) if o.get('valid_from') else '…', fmt_date(o.get('valid_to'), L)))))
        else:
            facts.append((X(L, 'مدة العرض', 'Valid'), esc(X(L, 'غير مذكورة في نشرة المتجر؛ يُعرض العرض %d يوماً من تاريخ التحقق (حتى %s)', 'not stated in the store leaflet; listed for %d days after it was checked (until %s)')
                                                         % (int(S['cfg'].get('offer_default_days', 14)), fmt_date(o['end'], L)))))
        facts.append((X(L, 'الحالة', 'Status'), ('<span data-after="%s" data-after-text="%s">%s</span>' % (o['end'], esc(X(L, 'انتهى', 'Ended')), esc(X(L, 'ساري', 'Current'))))
                       if o['current'] else esc(X(L, 'انتهى', 'Ended'))))
        facts.append((X(L, 'صنع في مصر', 'Made in Egypt'), X(L, 'نعم', 'Yes') if o.get('made_in_egypt') else X(L, 'لا', 'No')))
        if o.get('source_url'):
            facts.append((X(L, 'المصدر', 'Source'), '<a href="%s" rel="nofollow noopener" target="_blank">%s</a>' % (esc(o['source_url']), esc(urlparse(o['source_url']).netloc.replace('www.', '')))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        img = ('/' + o['img']) if o.get('img') and os.path.exists(B + o['img']) else ''
        main = '<div class="card2">%s%s<p class="note">%s</p></div>' % (('<img class="pimg" src="%s" alt="%s" width="160" height="160">' % (esc(img), esc(name))) if img else '', facts_html,
                                                                     X(L, 'الأسعار من نشرة المتجر وقت التحقق (%s)؛ قد تتغير.', 'Prices from the store leaflet when checked (%s); they may change.') % fmt_date(o.get('source_checked'), L))
        body = hero(L, ch, name, '') + '<div class="wrap sx-main">%s</div>' % main
        meta = {'title': mk_title([X(L, '%s – عرض %s', '%s – %s offer') % (name, X(L, o.get('store_ar'), o.get('store_en') or o.get('store_ar'))), name], L),
                'desc': mk_desc([X(L, '%s بسعر %s جنيه في %s.', '%s at EGP %s at %s.') % (name, o.get('price_egp'), X(L, o.get('store_ar'), o.get('store_en') or o.get('store_ar')))], L, X(L, 'مدة العرض والمصدر.', 'Validity and source.')),
                'h1': name, 'og_type': 'website', 'og_image': img or None, 'page_type': 'WebPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': {"@context": "https://schema.org", "@type": "Product", "@id": url + '#product', "name": name, "url": url, "brand": {"@type": "Brand", "name": o.get('brand') or ''},
                                "offers": dict({"@type": "Offer", "price": o.get('price_egp'), "priceCurrency": "EGP", "seller": {"@type": "Organization", "name": X(L, o.get('store_ar'), o.get('store_en') or o.get('store_ar'))}},
                                               **({"priceValidUntil": o['valid_to']} if o.get('valid_to') else {}))},
                'kw': name, 'keywords': X(L, 'عروض, ', 'offers, ') + name}
        return body, meta

    def render_offers_hub(L):
        O = S['offers']
        cur = [o for o in O if o['current']]
        by_store = {}
        for o in cur:
            by_store.setdefault(X(L, o.get('store_ar'), o.get('store_en') or o.get('store_ar')), []).append(o)
        html = ''

        def of_li(o):
            nm = X(L, o.get('product_ar'), o.get('product_en') or o.get('product_ar'))
            f = o.get('img') or ''
            v = vimg(f, 400, 300, 'contain', 72) if f and os.path.isfile(B + f) else None
            disc = ''
            try:
                if o.get('old_price_egp') and float(o['old_price_egp']) > float(o.get('price_egp') or 0) > 0:
                    disc = '<span class="disc">-%d%%</span>' % round(100 * (1 - float(o['price_egp']) / float(o['old_price_egp'])))
            except Exception:
                disc = ''
            return ('<li data-valid-to="%s"><div class="ph">%s%s</div><a href="%s">%s</a><span class="m">%s<span class="sx-vt">%s</span></span>%s%s</li>' % (
                o['end'], lazy_img(v, nm) if v else noimg('🛒'), disc, esc(P_(L, o) + o['path']), esc(nm), esc(X(L, '%s جنيه', 'EGP %s') % o.get('price_egp')),
                esc((X(L, ' · حتى ', ' · until ') + fmt_date(o['valid_to'], L)) if o.get('valid_to') else X(L, ' · مدة غير مذكورة', ' · validity not stated')),
                ('<s>%s</s>' % esc(X(L, '%s جنيه', 'EGP %s') % o['old_price_egp'])) if disc else '',
                ('<small>%s</small>' % X(L, '🇪🇬 صنع في مصر', '🇪🇬 Made in Egypt')) if o.get('made_in_egypt') else ''))
        for st, lst in sorted(by_store.items(), key=lambda kv: -len(kv[1])):
            html += '<section class="sx-sec">%s<div class="sx-oc"><ul class="tlist">%s</ul></div></section>' % (sec_head('%s (%d)' % (st, len(lst))), ''.join(of_li(o) for o in lst))
        app = app_url('offers')
        if app:
            html += '<p><a href="%s">%s</a></p>' % (esc(app), X(L, 'كل العروض مع الفلترة ←', 'All offers with filters →'))
        made = sum(1 for o in cur if o.get('made_in_egypt'))
        chk = fmt_date(S['offers_checked'], L) if S.get('offers_checked') else ''
        no_end = sum(1 for o in cur if o['end_assumed'])
        h1 = X(L, 'عروض المنتجات المصرية في منافذ البيع', 'Offers on Egyptian Products in Stores')
        intro = X(L, '%d عرضاً في %d متجراً من نشرات المتاجر، منها %d على منتجات مصنوعة في مصر، بالسعر بالجنيه ورابط النشرة. %d منها لا تذكر نشرتها تاريخ انتهاء، فتُعرض %d يوماً من تاريخ التحقق فقط.',
                  '%d offers in %d stores from store leaflets, %d of them on products made in Egypt, with the price in EGP and the leaflet link. %d of them have no end date in the leaflet and are listed for %d days after they were checked only.') % (
            len(cur), len(by_store), made, no_end, int(S['cfg'].get('offer_default_days', 14)))
        if chk:
            intro += X(L, ' تاريخ التحقق من النشرات: %s.', ' Leaflets checked on %s.') % chk
        top = stats_html([(str(len(cur)), X(L, ar_noun(len(cur), 'عرض سارٍ', 'عرضان ساريان', 'عروض سارية', 'عرضاً سارياً'), 'current offers'), app or ''),
                          (str(len(by_store)), X(L, ar_noun(len(by_store), 'متجر', 'متجران', 'متاجر', 'متجراً'), 'stores'), ''),
                          (str(made), X(L, 'على منتجات مصنوعة في مصر', 'on products made in Egypt'), ''),
                          (chk or '', X(L, 'تاريخ التحقق من النشرات', 'leaflets checked on'), '')])
        hp = VIS_HUB_IMG['offers']
        return render_simple_hub(L, 'offers', html, h1, intro, [X(L, 'عروض المنتجات المصرية في منافذ البيع (%d عرضاً)', 'Offers on Egyptian Products in Stores (%d)') % len(cur)], [intro],
                                 [(X(L, o.get('product_ar'), o.get('product_en') or o.get('product_ar')), P_(L, o) + o['path']) for o in cur], 'M', X(L, 'عروض المنتجات المصرية', 'egyptian product offers'),
                                 (X(L, 'تاريخ التحقق: %s.', 'Checked on %s.') % chk) if chk else '', img=hp, alt=photo_alt(hp, L, h1), top=top,
                                 acts=hero_acts(L, [(X(L, '🛍️ منافذ البيع', '🛍️ Retail outlets'), static_url('outlets', L), 'gold'), (X(L, 'كل العروض مع الفلترة', 'All offers with filters'), app, 'glass')]))

    def P_(L, rec):
        return '/en' if L == 'en' and rec.get('en_ok') else ''

    def render_export(m, L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + m['path'])
        name = T(L, m['name'])
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'أسواق التصدير', 'Export markets'), lk(L, '/export/')), (name, lk(L, m['path']))], L, url)
        intl_key = {'gulf': 'gulf', 'africa': 'africa', 'asia': 'asia', 'europe': 'europe'}.get(m['key'])
        if intl_key:
            ops = tender_sort([t for t in S['tenders'] if t['src'] == 'intl' and t.get('market') == intl_key and t.get('page')])
        elif m['key'] == 'local':
            ops = tender_sort([t for t in S['tenders'] if t['src'] == 'real' and t['status'] in ('open', 'soon') and t.get('page')])
        else:
            ops = []
        n_open = sum(1 for t in ops if t['status'] in ('open', 'soon'))
        main = '<div class="card2"><h2>%s</h2><p>%s</p></div>' % (X(L, 'نظرة على السوق', 'Market overview'), esc(T(L, m['desc'])))
        facts = []
        if m.get('ship_time'):
            facts.append((X(L, 'زمن الشحن', 'Shipping time'), esc(T(L, m['ship_time']))))
        if m.get('scope'):
            facts.append((X(L, 'النطاق', 'Scope'), esc(T(L, m['scope']))))
        if m.get('cities'):
            facts.append((X(L, 'مدن وموانئ', 'Cities & ports'), esc(X(L, '، '.join(m['cities']), ', '.join(T(L, c) for c in m['cities'])))))
        facts_html = '<dl class="sx-facts">%s</dl>' % ''.join('<dt>%s</dt><dd>%s</dd>' % (k, v) for k, v in facts)
        if m.get('reqs'):
            main += '<section class="card2"><h2>%s</h2><ul>%s</ul></section>' % (X(L, 'متطلبات دخول السوق', 'Market entry requirements'), ''.join('<li>%s</li>' % esc(T(L, r)) for r in m['reqs']))
        if m.get('ship'):
            main += '<section class="card2"><h2>%s</h2><p>%s</p></section>' % (X(L, 'الشحن والتأمين والتمويل', 'Shipping, insurance & finance'), esc(T(L, m['ship'])))
        if ops:
            main += '<section class="card2"><h2>%s (%d)</h2>%s</section>' % (X(L, 'فرص ومناقصات منشورة في هذا السوق', 'Published opportunities in this market'), len(ops), tender_cards(ops[:15], L))
        others = [x for x in S['exports'] if x is not m]
        main += '<section class="card2"><h2>%s</h2><div class="links">%s</div></section>' % (X(L, 'أسواق أخرى', 'Other markets'), ''.join('<a href="%s">%s</a>' % (esc(P_(L, x) + x['path']), esc(T(L, x['name']))) for x in others))
        intro = clip(T(L, m['desc']), 300)
        if m['key'] == 'local':
            h1_ = X(L, 'السوق المحلي للمنتج المصري', 'The Local Egyptian Market')
        else:
            h1_ = X(L, 'التصدير إلى %s' % m['name'], 'Export to the %s' % re.sub(r'(?i)\s*market$', '', name).strip() + ' market' if name else 'Export market')
        body = hero(L, ch, h1_, intro, img=export_photo(m), alt=photo_alt(export_photo(m), L, name), small=True) + \
            '<div class="wrap sx-main"><div class="sx-grid"><div>%s</div><aside><div class="card2"><h2>%s</h2>%s</div>%s</aside></div></div>' % (
                main, X(L, 'بيانات السوق', 'Market facts'), facts_html, cta_box(L, X(L, 'ادخل هذا السوق', 'Enter this market'),
                    X(L, 'سجّل منشأتك لتصلك فرص ومناقصات هذا السوق المطابقة لنشاطك.', 'Register your company to receive the opportunities and tenders of this market that match your business.'),
                    static_url('register', L, '#plans'), X(L, 'سجّل منشأتك', 'Register your company')))
        h1 = S['cur_h1']
        if m['key'] == 'local':
            tc = [X(L, 'السوق المحلي للمنتج المصري: المتطلبات والفرص والمناقصات', 'Selling in Egypt: Local Market Requirements & Tenders'), h1]
        else:
            tc = [X(L, 'تصدير المنتجات المصرية إلى %s: المتطلبات والفرص' % m['name'], 'Import from Egypt to the %s: Requirements & Opportunities' % name), X(L, 'التصدير إلى %s' % m['name'], 'Export to the %s' % name), h1]
        meta = {'title': mk_title(tc, L),
                'desc': mk_desc([intro], L, X(L, 'المتطلبات والفرص على منصة صنع في مصر.', 'Requirements and opportunities on Made in Egypt Gate.')), 'h1': h1, 'og_type': 'website', 'page_type': 'WebPage',
                'jsonld_crumbs': crumb_ld, 'jsonld_page': {"@context": "https://schema.org", "@type": "Thing", "@id": url + '#market', "name": name, "description": intro, "url": url},
                'kw': kw_for('J', L, name=name), 'keywords': kw_for('J', L, name=name), 'about_id': url + '#market'}
        if n_open:
            # the market text cut at a word boundary («…»), then the count with its Arabic number agreement («8 فرص سارية»، «فرصتان ساريتان»)
            meta['desc'] = mk_desc([clip(intro, 90), X(L, '%s.' % ar_qty(n_open, N_OPP_NOM), '%s.' % en_qty(n_open, 'open opportunity', 'open opportunities'))], L,
                                   X(L, 'المتطلبات والفرص على منصة صنع في مصر.', 'Requirements and opportunities on Made in Egypt Gate.'))
        return body, meta

    def render_exports_hub(L):
        E = S['exports']
        html = '<section class="sx-sec">%s<ul class="sx-tiles lg">%s</ul></section>' % (sec_head(X(L, 'الأسواق', 'Markets')), ''.join(
            tile_li(P_(L, m) + m['path'], export_photo(m), photo_alt(export_photo(m), L, T(L, m['name'])), '%s<small>%s</small>' % (esc(T(L, m['name'])), esc(T(L, m.get('scope') or ''))))
            for m in E))
        h1 = X(L, 'أسواق التصدير للمنتجات المصرية', 'Export Markets for Egyptian Products')
        intro = X(L, '%d أسواق للمنتج المصري: متطلبات دخول كل سوق، والشحن، والفرص والمناقصات المنشورة فيه.', '%d markets for Egyptian products: entry requirements, shipping and the published opportunities in each.') % len(E)
        hp = VIS_HUB_IMG['exports']
        n_i = sum(1 for t in S['tenders'] if t['src'] == 'intl' and t['status'] in ('open', 'soon'))
        top = stats_html([(str(len(E)), X(L, ar_noun(len(E), 'سوق', 'سوقان', 'أسواق', 'سوقاً') + ' للمنتج المصري', 'markets for Egyptian products'), ''),
                          (str(n_i), X(L, 'مناقصة دولية سارية للمصدّرين', 'open international tenders for exporters'), lk(L, '/tenders/') if (L == 'ar' or page_exists('/en/tenders/')) else '/tenders/')])
        return render_simple_hub(L, 'exports', html, h1, intro, [X(L, 'تصدير المنتجات المصرية: %d أسواق والمتطلبات والفرص', 'Export from Egypt: %d Markets, Requirements & Opportunities') % len(E)], [intro],
                                 [(T(L, m['name']), P_(L, m) + m['path']) for m in E], 'J', X(L, 'تصدير المنتجات المصرية', 'import from egypt'),
                                 X(L, 'على منصة صنع في مصر.', 'On Made in Egypt Gate.'), img=hp, alt=photo_alt(hp, L), top=top,
                                 acts=hero_acts(L, [(X(L, '🏭 سجّل منشأتك للتصدير', '🏭 Register to export'), static_url('register', L, '#plans'), 'gold')]))

    def render_en_home(L):
        """/en/: the English entry page (the Arabic home "/" is site.py's page; both carry the hreflang pair)"""
        L = 'en'
        url = abs_url('/en/')
        ch, crumb_ld = crumbs([('Home', '/en/')], L, url)
        m = S['dir_members']
        n = len(m)
        n_mem, n_fac, n_ver, n_ver_mem, n_pub = kind_counts(m)
        secs = [x for x in S['hub_sectors'] if x['n'] > 0]
        govs = [g for g in S['hub_govs'] if g['n_members'] > 0]
        n_open = sum(1 for t in S['tenders'] if t['status'] in ('open', 'soon') and t['src'] != 'intl')
        n_open_i = sum(1 for t in S['tenders'] if t['status'] in ('open', 'soon') and t['src'] == 'intl')
        h1 = 'Made in Egypt Gate – Egyptian Manufacturers, Industrial Zones and Tenders'
        intro = ('Made in Egypt Gate is the B2B platform of Egyptian industry, owned by the Egyptian Association for Industrial Development, a non-profit registered under No. 6189 of 2017, and operated by ElHouseni Group & Partners. '
                 'Its directory lists %s companies – %s member companies (%s factories and %s companies & suppliers)%s – '
                 'across %d sectors and %d governorates. The platform data also covers %d industrial and free zones, %d products, and %d Egyptian and %d international '
                 'tenders open as of %s.') % (
            fmt_n(n), fmt_n(n_mem), fmt_n(n_fac), fmt_n(n_mem - n_fac), ver_pub_tail(L, n_ver, n_ver_mem, n_pub), len(secs), len(govs), len(S['zones']), len(S['products']), n_open, n_open_i, fmt_date(S['today'], L))
        sec_links = ''.join('<a href="%s">%s <small>(%d)</small></a>' % (esc('/en' + x['path']), esc(x['sec']['t_en']), x['n'])
                            for x in S['hub_sectors'] if x['indexable'] and x.get('en') and ('/en' + x['path']) in S['en_paths'])
        gov_links = ''.join('<a href="%s">%s <small>(%d)</small></a>' % (esc('/en' + g['path']), esc(g['g']['en']), g['n_members'])
                            for g in S['hub_govs'] if g['indexable'] and g.get('en') and ('/en' + g['path']) in S['en_paths'])
        sections = [('Factory directory', '/factories/'), ('Industrial zones', '/industrial-zones/'), ('Free zones', '/free-zones/'), ('Governorates', '/governorates/'),
                    ('Products', '/products/'), ('Tenders', '/tenders/'), ('Request a quote', '/rfq/'), ('Contract awards', '/awards/'), ('Exhibitions & events', '/events/'),
                    ('Projects', '/projects/'), ('Export markets', '/export/'), ('Site map', '/site-map/')]
        sec_html = ''.join('<a href="%s">%s</a>' % (esc('/en' + pth), esc(nm)) for nm, pth in sections if ('/en' + pth) in S['en_paths'])
        opn = [t for t in tender_sort([t for t in S['tenders'] if t['status'] in ('open', 'soon') and t.get('en_ok')])][:8]
        main = ('<section class="card2"><h2>Platform sections</h2><div class="links">%s</div></section>' % sec_html) if sec_html else ''
        sec_h = [x for x in S['hub_sectors'] if x['indexable'] and x.get('en') and ('/en' + x['path']) in S['en_paths']]
        gov_h = [g for g in S['hub_govs'] if g['indexable'] and g.get('en') and ('/en' + g['path']) in S['en_paths']]
        if sec_links:
            main += '<section class="sx-sec">%s%s</section>' % (sec_head('Factories by sector'), sector_tiles(L, sec_h))
        if gov_links:
            main += '<section class="sx-sec">%s%s</section>' % (sec_head('Factories by governorate'), gov_tiles(L, gov_h))
        if opn:
            main += '<section class="sx-sec">%s%s</section>' % (sec_head('Open tenders'), tender_cards(opn, L))
        main += ('<p class="banner-info"><a href="/" hreflang="ar" lang="ar" data-lang="ar">%s</a> – %s</p>'
                 % ('الصفحة الرئيسية بالعربية', 'the Arabic home page has the interactive search, the assistant and the member tools.'))
        stats = stats_html([(fmt_n(n), 'companies in the directory', '/en/factories/' if '/en/factories/' in S['en_paths'] else ''), (str(len(secs)), 'industrial sectors', ''),
                            (str(len(S['zones'])), 'industrial & free zones', '/en/industrial-zones/' if '/en/industrial-zones/' in S['en_paths'] else ''),
                            (str(n_open + n_open_i), 'tenders open today', '/en/tenders/' if '/en/tenders/' in S['en_paths'] else '')])
        hp = VIS_HUB_IMG['home']
        acts = hero_acts(L, [('🏭 Browse the factory directory', '/en/factories/' if '/en/factories/' in S['en_paths'] else '/factories/?lang=en', 'gold'), ('📝 Request a quote', rfq_link(None, L), 'glass')])
        body = hero(L, ch, h1, intro, img=hp, alt=photo_alt(hp, L), acts=acts) + '<div class="wrap sx-main">%s<div class="sx-grid"><div>%s</div><aside>%s</aside></div></div>' % (stats, main, rfq_box(L, rfq_link(None, L)))
        items = [(nm, '/en' + pth) for nm, pth in sections if ('/en' + pth) in S['en_paths']]
        meta = {'title': mk_title(['Made in Egypt Gate: Egyptian Manufacturers, Tenders & RFQs', 'Made in Egypt Gate'], L, suffix=False),
                'desc': mk_desc(['Directory of %s Egyptian factories and suppliers in %d sectors and %d governorates, with industrial zones, tenders and free requests for quotation.' % (fmt_n(n), len(secs), len(govs))], L, ''),
                'h1': h1, 'og_type': 'website', 'page_type': 'CollectionPage', 'jsonld_crumbs': crumb_ld,
                'jsonld_page': jsonld_collection(items, url, h1) if items else None, 'kw': 'egyptian manufacturers directory', 'keywords': 'made in egypt, egyptian manufacturers, egypt factories directory, egypt tenders'}
        return body, meta

    def render_sitemap_html(L):
        P = '/en' if L == 'en' else ''
        url = abs_url(P + '/site-map/')
        ch, crumb_ld = crumbs([home_crumb(L), (X(L, 'خريطة الموقع', 'Site map'), lk(L, '/site-map/'))], L, url)

        def ok(path):
            return L == 'ar' or page_exists('/en' + path)
        groups = [
            (X(L, 'دليل المصانع حسب القطاع', 'Factories by sector'), [(X(L, s['sec']['t_ar'], s['sec']['t_en']), s['path'], s['n']) for s in S['hub_sectors'] if s['indexable'] and ok(s['path'])]),
            (X(L, 'المحافظات', 'Governorates'), [(X(L, g['g']['ar'], g['g']['en']), g['path'], g['n_members']) for g in S['hub_govs'] if g['indexable'] and ok(g['path'])]),
            (X(L, 'قطاع × محافظة', 'Sector × governorate'), [(X(L, '%s – %s' % (x['sec']['t_ar'], x['g']['ar']), '%s – %s' % (x['sec']['t_en'], x['g']['en'])), x['path'], x['n']) for x in S['hub_sgs'] if x['indexable'] and ok(x['path'])]),
            (X(L, 'المناطق الصناعية والحرة', 'Industrial & free zones'), [(X(L, z['name_ar'], z.get('name_en') or z['name_ar']), z['path'], None) for z in S['zones'] if ok(z['path'])]),
            (X(L, 'فئات المناقصات', 'Tender categories'), [(X(L, h['cat']['ar'], h['cat']['en']), h['path'], h['n']) for h in S['hub_cats'] if h.get('page') and h['indexable'] and ok(h['path'])]),
            (X(L, 'أقسام أخرى', 'Other sections'), [(n, p, None) for n, p in [(X(L, 'المنتجات', 'Products'), '/products/'), (X(L, 'المناقصات', 'Tenders'), '/tenders/'), (X(L, 'طلب عرض سعر', 'Request a quote'), '/rfq/'),
                                                                                  (X(L, 'الترسيات', 'Awards'), '/awards/'), (X(L, 'الأخبار', 'News'), '/news/'), (X(L, 'الفعاليات', 'Events'), '/events/'),
                                                                                  (X(L, 'المشاريع', 'Projects'), '/projects/'), (X(L, 'العروض', 'Offers'), '/offers/'), (X(L, 'أسواق التصدير', 'Export markets'), '/export/'),
                                                                                  (X(L, 'المناطق الحرة', 'Free zones'), '/free-zones/')] if ok(p)]),
        ]
        html = ''.join('<section class="card2"><h2>%s</h2><div class="cols2">%s</div></section>' % (esc(t), ''.join('<a href="%s">%s%s</a>' % (esc(lk(L, p)), esc(n), (' (%d)' % k) if k else '') for n, p, k in lst)) for t, lst in groups if lst)
        h1 = X(L, 'خريطة الموقع', 'Site map')
        body = hero(L, ch, h1, X(L, 'كل أقسام وصفحات المنصة الرئيسية في مكان واحد.', 'All main sections and hub pages of the platform in one place.')) + '<div class="wrap sx-main">%s</div>' % html
        meta = {'title': mk_title([X(L, 'خريطة موقع منصة صنع في مصر', 'Made in Egypt Gate Site Map')], L, suffix=False), 'desc': mk_desc([X(L, 'خريطة موقع منصة صنع في مصر: أقسام دليل المصانع والقطاعات والمحافظات والمناطق الصناعية والمناقصات والمنتجات.', 'Site map of Made in Egypt Gate: factory directory sections, sectors, governorates, industrial zones, tenders and products.')], L, ''),
                'h1': h1, 'og_type': 'website', 'page_type': 'WebPage', 'jsonld_crumbs': crumb_ld, 'jsonld_page': None, 'kw': '', 'keywords': ''}
        return body, meta

    # ------------------------------------------------------------------ hub structures (counts computed from the data)
    def build_hubs():
        cfg = S['cfg']
        size = cfg['listing_page_size']
        comps = [c for c in S['companies']]
        for c in comps:
            ok, why = indexable('company', c)
            c['index'], c['why'] = ok, why
            c['page'] = True
        S['dir_members'] = sort_companies(comps)
        S['dir_pages'] = max(1, (len(comps) + size - 1) // size)
        # sector hubs
        hs = []
        for sec in S['sectors']:
            mem = sort_companies([c for c in comps if c['sslug'] == sec['slug']])
            ok, why = indexable('hub-sector', None, len(mem))
            hs.append({'sec': sec, 'members': mem, 'n': len(mem), 'path': '/factories/%s/' % sec['slug'], 'indexable': ok, 'why': why,
                       'pages': max(1, (len(mem) + size - 1) // size), 'csv': ''})
        hs.sort(key=lambda h: -h['n'])
        S['hub_sectors'] = hs
        S['hub_sector_by_slug'] = {h['sec']['slug']: h for h in hs}
        # sector × governorate
        sgs = []
        for h in hs:
            byg = {}
            for c in h['members']:
                if c['gov']:
                    byg.setdefault(c['gov'], []).append(c)
            for g, mem in byg.items():
                ok, why = indexable('hub-sector-gov', None, len(mem))
                gg = S['gov_by_code'][g]
                sgs.append({'sec': h['sec'], 'g': gg, 'members': mem, 'n': len(mem), 'path': '/factories/%s/%s/' % (h['sec']['slug'], gg['slug']), 'indexable': ok, 'why': why,
                            'pages': max(1, (len(mem) + size - 1) // size)})
        sgs.sort(key=lambda x: -x['n'])
        S['hub_sgs'] = sgs
        S['hub_sg_by_key'] = {(x['sec']['slug'], x['g']['code']): x for x in sgs}
        # governorates
        govh = []
        for g in S['govs']:
            mem = sort_companies([c for c in comps if c['gov'] == g['code']])
            zs = [z for z in S['zones'] if z['region_code'] == g['code']]
            td = tender_sort([t for t in S['tenders'] if t.get('gov') == g['code']])
            pj = [p for p in S['projects'] if p['gov'] == g['code']]
            items = len(mem) + len(zs) + len(td) + len(pj)
            ok, why = indexable('gov', None, items)
            prof = next((r[2] for r in S['D'].get('regions', []) if r[0] == g['code']), '')
            govh.append({'g': g, 'members': mem, 'n_members': len(mem), 'zones': zs, 'tenders': td, 'projects': pj, 'path': '/governorates/%s/' % g['slug'],
                         'indexable': ok, 'why': why, 'pages': max(1, (len(mem) + size - 1) // size), 'profile': prof})
        govh.sort(key=lambda x: (-x['n_members'], x['g']['code']))
        S['hub_govs'] = govh
        S['hub_gov_by_code'] = {x['g']['code']: x for x in govh}
        # zones: members per zone
        S['zone_members'] = {}
        for c in comps:
            if c.get('zone'):
                S['zone_members'][c['zone']] = S['zone_members'].get(c['zone'], 0) + 1
        # tenders: pages, categories, entities
        for t in S['tenders']:
            t['page'] = True
            t['index'], t['why'] = indexable('tender', t)
        S['tenders_by_cat'] = {}
        for t in tender_sort(S['tenders']):
            S['tenders_by_cat'].setdefault(t['cat'], []).append(t)
        hc = []
        for cat in S['cats']:
            lst = S['tenders_by_cat'].get(cat['slug'], [])
            ok, why = indexable('tender-cat', None, len(lst))
            hc.append({'cat': cat, 'tenders': lst, 'n': len(lst), 'open': sum(1 for t in lst if t['status'] in ('open', 'soon')), 'path': '/tenders/category/%s/' % cat['slug'],
                       'indexable': ok, 'why': why, 'page': len(lst) > 0, 'pages': max(1, (len(lst) + size - 1) // size)})
        hc.sort(key=lambda x: -x['n'])
        S['hub_cats'] = hc
        S['hub_cat_by_slug'] = {x['cat']['slug']: x for x in hc}
        ents = {}
        for t in S['tenders']:
            if t['entity'] and t['src'] != 'intl':
                ents.setdefault(t['entity'], []).append(t)
        he = []
        eslugs = set()
        for name, lst in ents.items():
            en = next((t['entity_en'] for t in lst if t.get('entity_en')), '') or (tr(name) or '')
            base = slug_ascii(en) or 'entity-%s' % sha(name, 6)
            slug, k = base, 2
            while slug in eslugs:
                slug = '%s-%d' % (base, k)
                k += 1
            eslugs.add(slug)
            ok, why = indexable('tender-entity', None, len(lst))
            he.append({'name': name, 'name_en': en, 'tenders': lst, 'n': len(lst), 'path': '/tenders/entity/%s/' % slug, 'indexable': ok, 'why': why})
        he.sort(key=lambda x: -x['n'])
        S['hub_entities'] = [e for e in he if e['indexable']]
        S['entity_by_name'] = {e['name']: e for e in S['hub_entities']}
        # every issuing entity with at least min_tender_entity_page tenders has its page (noindex,follow below min_tender_entity, and then
        # linked only from the agency cards through the entity.html#<id> map, never from the hubs or the tender pages); an entity with a
        # single tender is sent to that tender (compute_hash_maps)
        S['entity_pages'] = [e for e in he if e['indexable'] or e['n'] >= int(cfg.get('min_tender_entity_page', 2) or 99)]
        S['entity_page_by_name'] = {e['name']: e for e in S['entity_pages']}
        # products listed (all have pages)
        for p in S['products']:
            p['page'] = True
            p['index'], p['why'] = indexable('product', p)
        S['products_listed'] = sorted(S['products'], key=lambda p: (0 if p['img'] else 1, p['name']))
        # rfq / news / events / awards / projects / offers
        for r in S['rfqs']:
            r['page'] = True
            r['index'], r['why'] = True, 'rfq_public'
        for n in S['news']:
            n['index'], n['why'] = indexable('news', n)
        S['news_sorted'] = sorted(S['news'], key=lambda n: (n.get('date') or ''), reverse=True)
        S['events_sorted'] = sorted(S['events'], key=lambda e: (e.get('start_date') or ''))
        for o in S['offers']:
            o['index'], o['why'] = indexable('offer', o)
        # news ↔ companies / sectors named in the title (exact-name match only)
        names = sorted([(c['name'], c) for c in comps if len(c['name']) >= 7 and c.get('index')], key=lambda x: -len(x[0]))
        for n in S['news']:
            t = n.get('title_ar') or ''
            rel = []
            for nm, c in names:
                if nm in t:
                    rel.append((nm, c['path'], bool(c.get('en_ok'))))
                    if len(rel) >= 4:
                        break
            for sec in S['sectors']:
                if any(re.search(r'(?:^|\s|[وبلف])%s(?:$|\s|[،,.:])' % re.escape(k), t) for k in sec.get('news_kw') or []):
                    h = S['hub_sector_by_slug'].get(sec['slug'])
                    if h and h['indexable']:
                        rel.append((sec['t_ar'], h['path'], False))
            n['related'] = rel[:6]
        # similar companies (same sector, same governorate first)
        by_sec = {}
        for c in S['dir_members']:
            by_sec.setdefault(c['sslug'], []).append(c)

        def sim_of(c):
            lst = by_sec.get(c['sslug'], [])
            same = [x for x in lst if x is not c and x['gov'] == c['gov'] and c['gov'] and x.get('index')]
            rest = [x for x in lst if x is not c and x not in same[:6] and x.get('index')]
            return (same + rest)[:6]
        S['sim_of'] = sim_of
        # companies sharing a display name (branches, double listings) get a distinguishing title part: governorate → sector → city → slug word
        for L in ('ar', 'en'):
            groups = {}
            for c in comps:
                nm = c['name'] if L == 'ar' else (c.get('name_en') or tr(c['name']) or c['name'])
                groups.setdefault(nm, []).append(c)
            for nm, lst in groups.items():
                if len(lst) < 2:
                    continue
                for c in lst:
                    extra = ''
                    for f in (lambda x: gov_name(x['gov'], L), lambda x: sec_name(x['sslug'], L, 't'), lambda x: city_text(x, L)):
                        vals = [f(x) for x in lst]
                        if f(c) and vals.count(f(c)) == 1:
                            extra = f(c)
                            break
                    if not extra:
                        toks = [t for t in re.split(r'[-\s]+', c.get('legacy') or '') if t]
                        others = set(t for x in lst if x is not c for t in re.split(r'[-\s]+', x.get('legacy') or '') if t)
                        uniq = [t for t in toks if t not in others]
                        extra = ' '.join(uniq[-2:]) if uniq else (gov_name(c['gov'], L) or sec_name(c['sslug'], L, 't'))
                    c['tx_' + L] = extra

    # ------------------------------------------------------------------ page specs, rendering, EN gate, writing
    def lastmod_for(path, content_key, real_date=None):
        store = S['lastmod_store']
        h = sha(content_key, 12)
        prev = store.get(path)
        today = S['today'].isoformat()
        real_date = full_date(real_date)      # '2025-06' (month only) is not a lastmod; the content hash date is used instead
        if prev and prev.get('hash') == h and full_date(prev.get('lastmod')):
            lm = full_date(prev.get('lastmod'))
        elif prev:
            lm = today
        else:
            lm = (real_date if real_date and real_date <= today else None) or today
        if real_date and real_date <= today and real_date > lm:
            lm = real_date
        S['lastmod_new'][path] = {'hash': h, 'lastmod': lm}
        return lm

    def en_gate(title, h1, body):
        cfg = S['cfg']['en']
        if AR_RX.search(title or '') or AR_RX.search(h1 or ''):
            return False, 'title_or_h1_arabic'
        text = body
        nodes = [re.sub(r'\s+', ' ', _html.unescape(x)).strip() for x in re.findall(r'>([^<>]+)<', text)]
        nodes = [x for x in nodes if x and re.search(r'[A-Za-z؀-ۿ]', x)]
        if not nodes:
            return False, 'empty'
        ar_nodes = sum(1 for x in nodes if AR_RX.search(x))
        letters = ''.join(nodes)
        ar_chars = len(AR_RX.findall(letters))
        all_chars = len(re.findall(r'[A-Za-z؀-ۿ]', letters))
        ok_nodes = 1 - ar_nodes / len(nodes)
        ratio = ar_chars / max(1, all_chars)
        if ok_nodes < cfg['min_text_nodes_ratio']:
            return False, 'en_nodes_%.2f' % ok_nodes
        if ratio >= cfg['max_arabic_ratio']:
            return False, 'arabic_ratio_%.3f' % ratio
        return True, 'en_ok_%.2f' % ok_nodes

    def finalize_page(spec, L, body, meta):
        P = '/en' if L == 'en' else ''
        path = P + spec['path']
        canonical = abs_url(path)
        meta = dict(meta)
        meta.update({'lang': L, 'canonical': canonical, 'path': path, 'lastmod': spec.get('lastmod')})
        if S.get('hero_pre') and 'preload' not in meta:
            meta['preload'] = S['hero_pre']          # set by hero() during this page's render
        S['hero_pre'] = None
        idx = spec.get('index', True)
        meta['robots'] = 'index,follow,max-image-preview:large' if idx else 'noindex,follow'
        if spec.get('en_path') and spec.get('en_ok'):
            meta['alt_ar'] = spec['path']
            meta['alt_en'] = '/en' + spec['path']
        if meta.get('og_image') is None:
            meta.pop('og_image', None)
        ov = S['overrides'].get(path, {}) if S.get('overrides') else {}
        meta['mig_ctx'] = page_ctx(spec)
        html_ = shell(meta, body, L)
        return html_, meta, ov

    def page_ctx(spec):
        """window.MIG_CTX of a generated detail page — the same {type, id, title, url[, follow]} the hash template it replaces
        sets (company.part.py, oldlists.part.py, winner.part.py, city.part.py …), so Janna, follows and view beacons know the
        record on screen. Ids are the ones the platform's alerts use (worker/build-index.js)."""
        r, typ = spec.get('rec') or {}, spec.get('type')
        if typ in ('company', 'company-public', 'company-verified') and r.get('hid') not in (None, ''):
            return {'type': 'company', 'id': str(r['hid']), 'title': r.get('name') or '', 'url': 'company.html#' + str(r['hid'])}
        if typ == 'tender' and r.get('fid'):
            return {'type': 'tender', 'id': r['fid'], 'title': r.get('title') or '', 'url': 'tenders/search/#' + quote(r['fid'], safe='')}
        if typ == 'rfq' and r.get('no'):
            return {'type': 'rfq', 'id': r['no'], 'title': r.get('title') or '', 'url': 'rfq/search/#' + quote(r['no'], safe='')}
        if typ == 'zone' and r.get('id'):
            return {'type': 'city', 'id': r['id'], 'title': r.get('name_ar') or '', 'url': 'city.html#' + quote(r['id'], safe='')}
        if typ == 'event' and r.get('id'):
            return {'type': 'event', 'id': str(r['id']), 'title': r.get('name_ar') or r.get('title_ar') or r.get('name') or '', 'url': 'event.html#' + quote(str(r['id']), safe='')}
        if typ == 'offer' and r.get('id'):
            return {'type': 'offer', 'id': str(r['id']), 'title': r.get('product_ar') or r.get('title_ar') or '', 'url': 'offer.html#' + quote(str(r['id']), safe='')}
        if typ == 'project' and r.get('id'):
            return {'type': 'project', 'id': str(r['id']), 'title': r.get('name') or r.get('name_ar') or '', 'url': 'project.html#' + quote(str(r['id']), safe='')}
        if typ == 'news' and r.get('i') is not None:
            return {'type': 'news', 'id': str(r['i']), 'title': r.get('title_ar') or '', 'url': 'article.html#' + str(r['i']), 'follow': False}
        if typ == 'export' and r.get('key'):
            return {'type': 'market', 'id': r['key'], 'title': r.get('name') or r.get('name_ar') or r['key'], 'url': 'export-market.html#' + r['key'], 'follow': False}
        if typ == 'award' and r.get('i') is not None:
            nm = r.get('winner_ar') or r.get('company') or ''
            c = {'type': 'company', 'id': 'w%s' % r['i'], 'title': nm, 'url': 'winner.html#%s' % r['i']}
            if nm:
                c['follow'] = {'kind': 'search', 'id': nm}
            return c
        return None

    def write_page(path, html_):
        OUT = S['OUT']
        if path.endswith('/'):
            fp = OUT + nfc(path).lstrip('/') + 'index.html'
        else:
            fp = OUT + nfc(path).lstrip('/')
        os.makedirs(os.path.dirname(fp), exist_ok=True)
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(html_)
        S['bytes'] += len(html_.encode('utf-8'))
        S['files'] += 1
        S['written'].add(os.path.normpath(fp))
        return fp

    def manifest_row(spec, L, meta, body, html_, ov):
        P = '/en' if L == 'en' else ''
        path = P + spec['path']
        txt = body
        imgs = re.findall(r'<img\b[^>]*>', txt)
        ina = sum(1 for im in imgs if not re.search(r'\balt="[^"]+"', im))
        types = []
        for blk in re.findall(r'<script type="application/ld\+json" data-seo="(?:site|page)">([\s\S]*?)</script>', html_):
            try:
                types += [t for t in validate_jsonld(blk.replace('<\\/', '</')) if t]
            except Exception as e:
                raise RuntimeError('seo_build: invalid JSON-LD on %s: %s' % (path, e))
        robots = (ov.get('robots') or meta['robots'])
        row = {'p': path, 'l': L, 't': spec['type'], 'ti': ov.get('title') or meta['title'], 'd': ov.get('description') or meta['desc'], 'h1': ov.get('h1') or meta.get('h1') or '',
               'c': ov.get('canonical') or meta['canonical'], 'r': robots, 'w': words(txt), 'im': len(imgs), 'ina': ina, 's': sorted(set(types)),
               'a': (('/en' + spec['path']) if L == 'ar' else spec['path']) if (spec.get('en_ok')) else '', 'lm': spec.get('lastmod') or S['today'].isoformat(),
               'k': spec.get('cluster') or '', 'why': spec.get('why') or '', 'kw': meta.get('kw') or ''}
        MANIFEST.append(row)
        return row

    def plan_pages():
        """register every page spec; each spec renders AR (and EN when eligible)"""
        cfg = S['cfg']
        size = cfg['listing_page_size']

        def spec(path, typ, render, index=True, why='', key=None, real_date=None, cluster='', en=True, rec=None):
            add_page({'path': path, 'type': typ, 'render': render, 'index': index, 'why': why, 'key': key, 'real_date': real_date, 'cluster': cluster, 'en': en, 'rec': rec})
        # directory + pagination
        for n in range(1, S['dir_pages'] + 1):
            spec('/factories/' + ('page/%d/' % n if n > 1 else ''), 'hub-dir', (lambda L, n=n: render_directory(L, n)), True, 'directory', key=('dir', n, len(S['dir_members'])), cluster='A')
        for h in S['hub_sectors']:
            if h['n'] == 0:
                continue
            for n in range(1, h['pages'] + 1):
                spec(h['path'] + ('page/%d/' % n if n > 1 else ''), 'hub-sector', (lambda L, h=h, n=n: render_sector_hub(h, L, n)), h['indexable'], h['why'],
                     key=('sec', h['sec']['slug'], n, [c['path'] for c in h['members'][(n - 1) * size: n * size]], h['n']), cluster='B', rec=h)
        for x in S['hub_sgs']:
            for n in range(1, x['pages'] + 1):
                spec(x['path'] + ('page/%d/' % n if n > 1 else ''), 'hub-sector-gov', (lambda L, x=x, n=n: render_sector_gov(x, L, n)), x['indexable'], x['why'],
                     key=('sg', x['path'], n, [c['path'] for c in x['members'][(n - 1) * size: n * size]]), cluster='D', rec=x)
        for c in S['companies']:
            spec(c['path'], 'company' if c['kind'] == 'member' else ('company-verified' if is_team(c) else 'company-public'), (lambda L, c=c: render_company(c, L)), c['index'], c['why'],
                 key=('co', c['name'], c['desc'], c['sector'], c['gov'], c['loc'], c['type'], c['names'], c.get('zone'), [p['path'] for p in c.get('prods') or []], c.get('website')), cluster='L', rec=c)
        spec('/governorates/', 'hub-gov', render_govs_hub, True, 'hub', key=('govs', [(g['g']['code'], g['n_members']) for g in S['hub_govs']]), cluster='C')
        for g in S['hub_govs']:
            for n in range(1, g['pages'] + 1):
                spec(g['path'] + ('page/%d/' % n if n > 1 else ''), 'gov', (lambda L, g=g, n=n: render_gov(g, L, n)), g['indexable'], g['why'],
                     key=('gov', g['path'], n, g['n_members'], [c['path'] for c in g['members'][(n - 1) * size: n * size]], len(g['zones']), len(g['tenders']), len(g['projects'])), cluster='C', rec=g)
        spec('/industrial-zones/', 'hub-zones', (lambda L: render_zone_hub(L, False)), True, 'hub', key=('zones', [z['id'] for z in S['zones']], sorted(S['zone_members'].items())), cluster='F')
        spec('/free-zones/', 'hub-free-zones', (lambda L: render_zone_hub(L, True)), True, 'hub', key=('fz', [z['id'] for z in S['zones'] if z['type'] == 'free_zone']), cluster='F')
        for z in S['zones']:
            spec(z['path'], 'zone', (lambda L, z=z: render_zone(z, L)), True, 'zone_data', key=('zone', z, S['zone_members'].get(z['id'], 0)), cluster='E' if z['type'] in ('industrial_city', 'industrial_area', 'investment_zone') else 'F', rec=z)
        pp = max(1, (len(S['products_listed']) + size - 1) // size)
        for n in range(1, pp + 1):
            spec('/products/' + ('page/%d/' % n if n > 1 else ''), 'hub-products', (lambda L, n=n: render_products_hub(L, n)[:2]), True, 'hub', key=('prods', n, [p['path'] for p in S['products_listed'][(n - 1) * size: n * size]]), cluster='K')
        for p in S['products']:
            spec(p['path'], 'product', (lambda L, p=p: render_product(p, L)), p['index'], p['why'], key=('p', p['name'], p['desc'], p['img'], p['maker']['path'] if p['maker'] else ''), cluster='K', rec=p)
        spec('/tenders/', 'hub-tenders', render_tenders_hub, True, 'hub_daily', key=('tenders', S['today'].isoformat(), [(t['path'], t['status']) for t in S['tenders'] if t['status'] != 'undated']), cluster='G')
        for h in S['hub_cats']:
            if not h['page']:
                continue
            for n in range(1, h['pages'] + 1):
                spec(h['path'] + ('page/%d/' % n if n > 1 else ''), 'tender-cat', (lambda L, h=h, n=n: render_tender_cat(h, L, n)), h['indexable'], h['why'],
                     key=('tc', h['path'], n, [(t['path'], t['status']) for t in h['tenders'][(n - 1) * size: n * size]]), cluster='G', rec=h)
        for e in S['entity_pages']:
            spec(e['path'], 'tender-entity', (lambda L, e=e: render_tender_entity(e, L)), e['indexable'], e['why'], key=('te', e['path'], [(t['path'], t['status']) for t in e['tenders']]), cluster='G', rec=e)
        for t in S['tenders']:
            rd = t.get('publish') or None
            spec(t['path'], 'tender', (lambda L, t=t: render_tender(t, L)), t['index'], t['why'],
                 key=('t', t['title'], t['entity'], t['deadline'], t['status'], t['booklet'], t['bond'], t['source'], t['ref']), real_date=rd, cluster='G', rec=t)
        spec('/rfq/', 'hub-rfq', render_rfq_hub, True, 'hub', key=('rfq', [r['path'] for r in S['rfqs']]), cluster='I')
        for r in S['rfqs']:
            spec(r['path'], 'rfq', (lambda L, r=r: render_rfq(r, L)), r['index'], r['why'], key=('r', r['title'], r['details'], r['date']), real_date=r['date'] or None, cluster='I', rec=r)
        spec('/awards/', 'hub-awards', render_awards_hub, True, 'hub', key=('aw', [a['path'] for a in S['awards']]), cluster='H')
        for a in S['awards']:
            spec(a['path'], 'award', (lambda L, a=a: render_award(a, L)), True, 'award_sourced', key=('a', a), real_date=a.get('date'), cluster='H', rec=a)
        np_ = max(1, (len(S['news_sorted']) + size - 1) // size)
        for n in range(1, np_ + 1):
            spec('/news/' + ('page/%d/' % n if n > 1 else ''), 'hub-news', (lambda L, n=n: render_news_hub(L, n)[:2]), True, 'hub', key=('news', n, [x['path'] for x in S['news_sorted'][(n - 1) * size: n * size]]), cluster='M')
        for x in S['news']:
            spec(x['path'], 'news', (lambda L, x=x: render_news(x, L)), x['index'], x['why'], key=('n', x.get('title_ar'), x.get('summary_ar'), x.get('url')), real_date=x.get('date'), cluster='M', rec=x)
        spec('/events/', 'hub-events', render_events_hub, True, 'hub', key=('ev', S['today'].isoformat(), [e['path'] for e in S['events']]), cluster='M')
        for e in S['events']:
            spec(e['path'], 'event', (lambda L, e=e: render_event(e, L)), True, 'event', key=('e', e, (pdate(e.get('end_date') or e.get('start_date')) or S['today']) < S['today']), cluster='M', rec=e)
        spec('/projects/', 'hub-projects', render_projects_hub, True, 'hub', key=('pj', [p['path'] for p in S['projects']]), cluster='M')
        for p in S['projects']:
            last = max([u[0] for u in p['updates'] if u and u[0]] or [''])
            spec(p['path'], 'project', (lambda L, p=p: render_project(p, L)), True, 'project_sourced', key=('pj', {k: v for k, v in p.items() if k not in ('en_ok',)}), real_date=last or None, cluster='M', rec=p)
        spec('/offers/', 'hub-offers', render_offers_hub, True, 'hub', key=('of', S['today'].isoformat(), [o['path'] for o in S['offers']]), cluster='M')
        for o in S['offers']:
            spec(o['path'], 'offer', (lambda L, o=o: render_offer(o, L)), o['index'], o['why'], key=('o', o), real_date=o.get('source_checked'), cluster='M', rec=o, en=False)
        if S['exports']:
            spec('/export/', 'hub-export', render_exports_hub, True, 'hub', key=('ex', [m['key'] for m in S['exports']]), cluster='J')
            for m in S['exports']:
                spec(m['path'], 'export', (lambda L, m=m: render_export(m, L)), True, 'market', key=('ex', m), cluster='J', rec=m)
        spec('/site-map/', 'sitemap-html', render_sitemap_html, True, 'html_sitemap', key=('sm', len(S['specs'])), cluster='')
        if APPDL:   # APPDL hook: «تطبيق صنع في مصر» /app/ + /en/app/ (seo_app.part.py)
            spec(APPDL['path'], 'app-download', APPDL['render'], True, 'app_download', key=APPDL['key'](), cluster='')
        if cfg.get('en', {}).get('enabled') and cfg.get('en_home', True):
            # EN-only spec: the Arabic "/" is site.py's home page; lastmod keyed as /en/
            add_page({'path': '/', 'type': 'home', 'render': render_en_home, 'index': True, 'why': 'home_en', 'key': ('home-en', len(S['dir_members']), len(S['tenders']),
                      [t['path'] for t in S['tenders'] if t['status'] in ('open', 'soon')], S['today'].isoformat()), 'real_date': None, 'cluster': 'N', 'en': True, 'rec': None,
                      'ar': False, 'lm_key': '/en/'})
            S['en_home'] = True

    def render_all():
        cfg = S['cfg']
        en_cfg = cfg.get('en', {})
        stats = {'ar': 0, 'en': 0, 'en_fail': {}, 'by_type': {}, 'index': 0, 'noindex': 0}
        specs = S['specs']
        # pass 1: EN eligibility (rendered first so that AR pages know their twin)
        for sp in specs:
            lmk = sp.get('lm_key') or sp['path']
            sp['lastmod'] = lastmod_for(lmk, jdump(sp['key']) if not isinstance(sp['key'], str) else sp['key'], sp.get('real_date'))
            S['lastmod_of'][lmk] = sp['lastmod']
            sp['en_ok'] = False
            if not en_cfg.get('enabled') or not sp.get('en'):
                continue
            # the 91 verified + 3 public-source companies get their English page even when thin (noindex in both languages):
            # English visitors of the directory must never land on Arabic company pages
            if en_cfg.get('only_indexable') and not sp['index'] and sp['type'] not in ('company-verified', 'company-public'):
                continue
            sp['en_path'] = '/en' + sp['path']
        # rec-level EN flags let lists link to EN twins; decided by a dry EN render of the detail pages first
        detail_types = ('company', 'company-public', 'company-verified', 'product', 'tender', 'rfq', 'news', 'event', 'award', 'project', 'zone', 'export')
        order = [sp for sp in specs if sp['type'] in detail_types] + [sp for sp in specs if sp['type'] not in detail_types]
        S['en_bodies'] = {}
        for sp in order:
            if not sp.get('en_path'):
                continue
            S['cur_path'] = sp['en_path']
            try:
                body, meta = sp['render']('en')
            except Exception as e:
                raise RuntimeError('seo_build: EN render failed for %s: %s' % (sp['path'], e))
            ok, why = (False, meta['en_fail']) if meta.get('en_fail') else en_gate(meta['title'], meta.get('h1'), body)
            if ok:
                sp['en_ok'] = True
                S['en_paths'].add(sp['en_path'])
                if not sp.get('lm_key'):
                    S['lastmod_new'][sp['path']]['en'] = 1     # history: an EN twin was published (see emit_redirect_maps: en_gone)
                if sp.get('rec') is not None and isinstance(sp['rec'], dict):
                    sp['rec']['en_ok'] = True
                    if sp['type'] in ('hub-sector', 'hub-sector-gov', 'gov', 'tender-cat', 'tender-entity'):
                        sp['rec']['en'] = True
            else:
                k = sp['type'] + ':' + re.sub(r'_[\d.]+$', '', why)
                stats['en_fail'][k] = stats['en_fail'].get(k, 0) + 1
                if sp['type'] == 'home':
                    S['en_home'] = False
        # hubs whose EN twin failed must not be linked in EN lists
        for sp in specs:
            if sp['type'] in ('hub-sector', 'hub-sector-gov', 'gov', 'tender-cat', 'tender-entity') and sp.get('rec') is not None and not sp['path'].count('/page/'):
                sp['rec']['en'] = bool(sp.get('en_ok'))
        S['titles_used'] = {}
        # pass 2: final render + write (AR always, EN when the gate passed; EN rendered again so links reflect final twins)
        for sp in specs:
            langs = ('ar', 'en') if sp.get('en_ok') else ('ar',)
            if not sp.get('ar', True):
                langs = ('en',) if sp.get('en_ok') else ()
            for L in langs:
                path = ('/en' if L == 'en' else '') + sp['path']
                S['cur_path'] = path
                body, meta = sp['render'](L)
                if sp.get('index'):
                    tk = (L, meta['title'])
                    if tk in S['titles_used']:
                        core = meta['title'].replace(SUFFIX[L], '')
                        tok = '(%d)' % (S['titles_used'][tk] + 1)
                        if L == 'ar':
                            seg = [w for w in re.split(r'[-\s]+', sp['path'].strip('/').split('/')[-1]) if w and w not in core]
                            tok = ' '.join(seg[-2:]) if seg else tok
                        meta['title'] = cut(core, 61 - len(tok)) + ' – ' + tok
                        S['titles_used'][tk] += 1
                    else:
                        S['titles_used'][tk] = 1
                html_, meta, ov = finalize_page(sp, L, body, meta)
                if L == 'en':
                    ok, why = (False, meta['en_fail']) if meta.get('en_fail') else en_gate(meta['title'], meta.get('h1'), body)
                    if not ok:
                        raise RuntimeError('seo_build: EN gate flipped on final render for %s (%s)' % (path, why))
                write_page(path, html_)
                row = manifest_row(sp, L, meta, body, html_, ov)
                stats[L] += 1
                stats['by_type'][sp['type'] + ':' + L] = stats['by_type'].get(sp['type'] + ':' + L, 0) + 1
                if 'noindex' in row['r']:
                    stats['noindex'] += 1
                else:
                    stats['index'] += 1
        return stats

    # ------------------------------------------------------------------ emitters (spec §1.9–1.11)
    def emit_sitemaps(OUT):
        maxu = S['cfg']['sitemap_max_urls']
        groups = {}
        own = set()

        def grp(row):
            p = row['p'][3:] if row['l'] == 'en' else row['p']
            t = row['t']
            g = {'hub-dir': 'factories-hubs', 'hub-sector': 'factories-hubs', 'hub-sector-gov': 'factories-hubs', 'company': 'factories', 'company-public': 'factories', 'company-verified': 'factories',
                 'gov': 'governorates', 'hub-gov': 'governorates', 'zone': 'zones', 'hub-zones': 'zones', 'hub-free-zones': 'zones', 'product': 'products', 'hub-products': 'products',
                 'tender': 'tenders', 'hub-tenders': 'tenders', 'tender-cat': 'tenders', 'tender-entity': 'tenders', 'rfq': 'rfq', 'hub-rfq': 'rfq', 'award': 'awards', 'hub-awards': 'awards',
                 'news': 'news', 'hub-news': 'news', 'event': 'events', 'hub-events': 'events', 'project': 'projects', 'hub-projects': 'projects', 'export': 'export', 'hub-export': 'export',
                 'offer': 'pages', 'hub-offers': 'pages', 'sitemap-html': 'pages', 'static': 'pages', 'home': 'pages'}.get(t, 'pages')
            return ('en-' if row['l'] == 'en' else '') + g
        rows = [r for r in MANIFEST if 'noindex' not in r['r'] and r['c'] == abs_url(r['p'])]
        for r in rows:
            own.add(r['p'])
            groups.setdefault(grp(r), []).append(r)
        os.makedirs(OUT + 'sitemaps', exist_ok=True)
        for f in os.listdir(OUT + 'sitemaps'):
            if f.endswith('.xml'):
                os.remove(OUT + 'sitemaps/' + f)
        children = []
        total = 0
        for g in sorted(groups):
            lst = sorted(groups[g], key=lambda r: r['p'])
            chunks = [lst[i:i + maxu] for i in range(0, len(lst), maxu)] or [[]]
            for k, ch in enumerate(chunks):
                name = ('%s-%d.xml' % (g, k + 1)) if (g.endswith('factories') or len(chunks) > 1) else '%s.xml' % g
                body = ''.join('<url><loc>%s</loc><lastmod>%s</lastmod></url>\n' % (_html.escape(r['c']), r['lm']) for r in ch)
                open(OUT + 'sitemaps/' + name, 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '</urlset>\n')
                children.append((name, max([r['lm'] for r in ch] or [S['today'].isoformat()]), len(ch)))
                total += len(ch)
        idx = ''.join('<sitemap><loc>%s/sitemaps/%s</loc><lastmod>%s</lastmod></sitemap>\n' % (SITE, n, lm) for n, lm, c in children)
        open(OUT + 'sitemap.xml', 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + idx + '</sitemapindex>\n')
        return {'children': len(children), 'urls': total, 'files': {n: c for n, lm, c in children}}

    def emit_robots(OUT):
        # deploy 1: the owner's live admin (panel.html, login.html) is still answered by the old system on this domain
        live = ''.join('Disallow: /%s.html\n' % k for k in ((S.get('cfg') or {}).get('legacy_live_pages') or []) if re.match(r'^[\w-]+$', k))
        txt = ('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_seo/\nDisallow: /admin/\nDisallow: /seo-admin/\nDisallow: /seo-team/\nDisallow: /data-desk/\nDisallow: /inbox/\nDisallow: /dashboard/\n%s\nSitemap: %s/sitemap.xml\n' % (live, SITE))
        open(OUT + 'robots.txt', 'w', encoding='utf-8').write(txt)
        return txt

    def alt_slash(p):
        """the /x ↔ /x/ twin of a directory path (same rule as the edge's altSlash: none for '/' and for file names)"""
        if not p or p == '/':
            return None
        if p.endswith('/'):
            return p[:-1]
        return None if re.search(r'\.[A-Za-z0-9]{1,8}$', p.rsplit('/', 1)[-1]) else p + '/'

    def page_on_disk(path):
        if path in S['paths'] or path in S['en_paths']:
            return True
        if path.endswith('/'):
            return os.path.exists(S['OUT'] + nfc(path).lstrip('/') + 'index.html')
        return os.path.isfile(S['OUT'] + nfc(path).lstrip('/'))

    def emit_redirect_maps(OUT):
        cfg = S['cfg']
        exact = {}
        sp = cfg.get('static_paths', {})
        shim = cfg.get('shim_keys', {})
        keys = set(sp)
        hp = HOST.get('pages')
        if isinstance(hp, dict):
            keys |= set(hp.keys())
        flat_keep = set(cfg.get('flat_pages') or [])
        for k in sorted(keys):
            if k in shim or k in flat_keep or k == 'index':
                continue   # shims (written here) and site.py's own flat files (the janna.html kiosk) are served as they are
            to = sp.get(k, '/%s/' % k)
            if page_on_disk(to):
                exact['/%s.html' % k] = to
        # no "/factories" → "/factories/" rules: Pages 308s /x to /x/ by itself, and the edge's lookup() matches both forms, so such
        # a rule makes /factories/ look like a redirect to itself (the edge then refuses every rule whose target is that hub)
        exact.update({'/home': '/', '/en/home': '/en/', '/home.html': '/', '/index.html': '/', '/factory.html': '/factories/', '/manufacturers': '/factories/', '/manufacturers/': '/factories/',
                      '/tenders.html': '/tenders/', '/rfqs.html': '/rfq/', '/winners.html': '/awards/', '/cities.html': '/industrial-zones/'})
        for n in range(1, 301):
            exact['/media-center/%d' % n] = '/news/'
            exact['/media-center/%d/' % n] = '/news/'
        # merged duplicate member listings (data clean-up): old legacy URL → kept record (one hop)
        for old, new in (S['D'].get('fac_urlmap') or {}).items():
            o = '/factories/%s/' % legacy_slug(old)
            c = S['company_by_url'].get(nfc(unquote(new)))
            n = c['path'] if c else '/factories/%s/' % legacy_slug(new)
            if o != n:
                exact[o] = n
        for o, n in (cfg.get('redirect_extra') or {}).items():
            exact[nfc(o)] = nfc(n)
        if cfg.get('slug_mode') == 'hash':
            for c in S['companies']:
                if c.get('legacy_path') and c['legacy_path'] != c['path']:
                    exact[c['legacy_path']] = c['path']
        # the platform's own news posts on the former WordPress site (/<arabic-slug>/) → their summary page here
        for n in S['news']:
            lp = news_legacy_path(n)
            if lp and lp not in exact:
                exact[lp] = n['path']
        # English pages published by an earlier build that this build no longer makes (EN gate / indexability changed): one hop to the
        # Arabic twin instead of a 404 (history kept in seo/lastmod.json)
        for p in S.get('en_gone', []):
            ar = p[3:]
            if ar in S['paths']:
                exact[p] = ar
        # never redirect a page that exists (also not through its /x ↔ /x/ twin); collapse chains to one hop. Flat legacy files
        # (/about.html …) are redirected even when an old copy is still on disk (remove_stale_flat() deletes it); only the flat files this
        # build serves on purpose (shims, flat_pages such as the janna.html kiosk, 404/410) are exempt.
        served_flat = set('/%s.html' % k for k in list(shim) + list(flat_keep) + ['404', '410'])
        for k in list(exact):
            if k.endswith('.html'):
                if k in served_flat or exact[k] == k:
                    del exact[k]
                continue
            a = alt_slash(k)
            if page_on_disk(k) or (a and page_on_disk(a)) or exact[k] == k or (a and exact[k] == a):
                del exact[k]
        for k in list(exact):
            seen = {k}
            v = exact[k]
            while v in exact and v not in seen:
                seen.add(v)
                v = exact[v]
            exact[k] = v
            if v == k or v == alt_slash(k):
                del exact[k]
        gone404 = ["/factories/", "/industrial_products/", "/tender-item/", "/rfq/", "/news/", "/events/", "/awards/", "/projects/", "/offers/",
                   "/en/factories/", "/en/industrial_products/", "/en/tender-item/", "/en/rfq/", "/en/news/", "/en/events/", "/en/awards/", "/en/projects/", "/en/offers/"]
        R = {"exact": dict(sorted(exact.items())),
             "prefix": [["/tenders/page/", "/tenders/"], ["/ar/20", "/news/"], ["/category/", "/factories/"]],
             "gone_rx": ["^/(ar/)?wp-(json|content|admin|includes)(/|$)", "^/xmlrpc\\.php$", "^/(ar/)?feed/?$"],
             "gone_prefix_on_404": gone404,
             "_notes": "Built by seo_build.part.py. Shim pages (company.html, article.html, …) are not redirected: they map location.hash to the clean URL via /_seo/hash/<type>.json. "
                       "/media-center/N (legacy WordPress pagination) is listed exactly because the prefix «/media-center/» would also catch the static page /media-center/; "
                       "/tenders/page/N/ is safe as a prefix because tender pagination lives under /tenders/category/<cat>/page/N/. No key is a page or the /x ↔ /x/ twin of "
                       "a page, and no target is its own key's twin. gone_prefix_on_404: a 404 under these prefixes (records removed from the data) answers 410."}
        os.makedirs(OUT + '_seo', exist_ok=True)
        open(OUT + '_seo/redirects.json', 'w', encoding='utf-8').write(json.dumps(R, ensure_ascii=False, indent=0))
        # Pages _redirects: static fallback for when Functions are not deployed (Functions-served routes ignore it); ≤ 2,000 static rules
        lines = ['# generated by seo_build.part.py – same rules as /_seo/redirects.json (exact, 301); the middleware applies them when Functions run']
        for k, v in sorted(exact.items()):
            if len(lines) > 1900:
                break
            lines.append('%s %s 301' % (pct(k), pct(v)))
        lines += ['/tenders/page/* /tenders/ 301', '/category/* /factories/ 301']
        if APPDL and APPDL['redirect_rule']():
            # APPDL hook: /app/android.apk → the published APK, 302 (it follows every new version); the path skips the Functions
            # (emit_routes), so Pages applies this rule itself — it is not a 301 of the edge map
            lines.insert(1, APPDL['redirect_rule']())
        open(OUT + '_redirects', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
        S['redirects'] = R
        return R

    def emit_headers(OUT):
        # /data/* is never immutable: besides the ?v=<content hash> references in the pages, data/janna.js loads data files as
        # data/<x>.js?v=<janna.js version>, so a data file (offers, tenders …) can change under an unchanged URL (deploy review #8).
        # One hour, then a cheap ETag revalidation. Unversioned references in the HTML are still listed in the stats.
        bad = []
        for root, dirs, files in os.walk(OUT):
            if '/_seo' in root or '/sitemaps' in root or root.startswith(OUT + 'assets'):
                continue
            for f in files:
                if f.endswith('.html'):
                    try:
                        s = open(os.path.join(root, f), encoding='utf-8').read()
                    except Exception:
                        continue
                    for m in re.finditer(r'(?:src|href)="/?data/[\w.-]+\.js(?!\?v=)', s):
                        bad.append(os.path.join(root, f).replace(OUT, '/'))
                        break
            if len(bad) > 20:
                break
        data_cc = 'public, max-age=3600, must-revalidate'
        # security headers (SEC M5) for every file Pages serves without the Functions (data/, img/, media/ … see
        # emit_routes); pages that run through the Functions get the same values from functions/_lib/seo-edge.js
        # SECURITY_HEADERS. frame-ancestors 'self': Janna's live screen frames the site itself. No script-src (inline scripts,
        # the Anam widget from unpkg / jsdelivr). X-Frame-Options SAMEORIGIN = the zone's managed transform value.
        sec = ("/*\n  Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'\n  X-Frame-Options: SAMEORIGIN\n"
               "  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n")
        txt = sec + ('/data/*\n  Cache-Control: %s\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n'
               '/img/*\n  Cache-Control: public, max-age=2592000\n/_seo/*\n  X-Robots-Tag: noindex\n  Cache-Control: public, max-age=300\n/downloads/*\n  X-Robots-Tag: noindex\n'
               '/sitemaps/*\n  Cache-Control: public, max-age=3600\n/data/overlay.js\n  ! Cache-Control\n  Cache-Control: public, max-age=60\n') % data_cc
        # the installable app (emit_pwa): the service worker is always revalidated (a new deploy reaches every phone at its next visit)
        # and may control the whole site; the manifests are JSON of their own type. These paths skip the Functions (emit_routes), so
        # Pages applies these lines to them.
        txt += ('/sw.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: /\n'
                '/manifest.webmanifest\n  Content-Type: application/manifest+json; charset=utf-8\n  Cache-Control: public, max-age=3600\n'
                '/manifest.en.webmanifest\n  Content-Type: application/manifest+json; charset=utf-8\n  Cache-Control: public, max-age=3600\n')
        if APPDL:   # APPDL hook: the APKs (attachments, nosniff, a year: versioned names), latest.json, assetlinks.json (seo_app.part.py)
            txt += APPDL['headers']()
        open(OUT + '_headers', 'w', encoding='utf-8').write(txt)
        return {'data_immutable': False, 'data_cache': data_cc, 'unversioned_data_refs': bad[:20]}

    def emit_routes(OUT):
        R = {"version": 1, "include": ["/*"],
             "exclude": ["/data/*", "/img/*", "/media/*", "/fonts/*", "/assets/*", "/downloads/*", "/_seo/*", "/sitemaps/*", "/sitemap.xml", "/manifest.webmanifest",
                         "/manifest.en.webmanifest", "/sw.js", "/favicon.ico", "/apple-touch-icon.png"]}
        if APPDL:   # APPDL hook: /app/android.apk (its 302 is a _redirects rule) and /.well-known/assetlinks.json (_headers) are static
            R['exclude'] += [x for x in APPDL['routes_exclude'] if x not in R['exclude']]
        open(OUT + '_routes.json', 'w', encoding='utf-8').write(json.dumps(R, indent=1))
        return R

    ERR_TPL = ('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
               '<meta name="robots" content="noindex"><title>%(title)s – صنع في مصر</title>'
               '<meta name="theme-color" content="#8E0B20"><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="apple-touch-icon" sizes="180x180" href="/img/app/apple-touch-icon.png">'
               '<style>body{font:16px/1.8 Tahoma,"Segoe UI",sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#0F172A;background:#fff}a{color:#C8102E;font-weight:700}h1{line-height:1.4}</style></head>'
               '<body><main><h1>%(h1)s</h1><p>%(p)s</p><ul><li><a href="/factories/">دليل المصانع</a></li><li><a href="/tenders/">المناقصات</a></li>'
               '<li><a href="/rfq/">اطلب عرض سعر</a></li><li><a href="/site-map/">خريطة الموقع</a></li><li><a href="/">الصفحة الرئيسية</a></li></ul>'
               '<p lang="en" dir="ltr">%(en)s Try the <a href="/factories/">factory directory</a>, <a href="/tenders/">tenders</a> or the <a href="/">home page</a>.</p></main></body></html>\n')

    def emit_error_pages(OUT):
        open(OUT + '404.html', 'w', encoding='utf-8').write(ERR_TPL % {'title': 'الصفحة غير موجودة', 'h1': 'الصفحة غير موجودة', 'p': 'ربما نُقلت أو حُذفت من الموقع القديم. جرّب:', 'en': 'Page not found.'})
        open(OUT + '410.html', 'w', encoding='utf-8').write(ERR_TPL % {'title': 'هذه الصفحة لم تعد موجودة', 'h1': 'هذه الصفحة لم تعد موجودة', 'p': 'هذه الصفحة كانت في الموقع القديم وحُذفت نهائياً. جرّب:', 'en': 'This page no longer exists.'})
        os.makedirs(OUT + '_seo', exist_ok=True)
        for f in ('keywords.json', 'config.json', 'sectors.json', 'governorates.json', 'tender-cats.json'):
            if os.path.exists(B + 'seo/' + f):
                with open(B + 'seo/' + f, 'rb') as a, open(OUT + '_seo/' + f, 'wb') as b:
                    b.write(a.read())

    # ------------------------------------------------------------------ the installable app (PWA)
    # Android (Chrome «تثبيت») and iPhone («شارك ← أضف إلى الشاشة الرئيسية») install the live site as an app: /manifest.webmanifest (AR)
    # + /manifest.en.webmanifest (EN), the icons in img/app/ (tools/app_icons.py, committed), /sw.js (network first for pages, the
    # offline page /offline/ when the network fails, stale-while-revalidate for this site's static files; never the API, the private
    # pages, other sites or media streams), the tags in every <head> (pwa_head) and data/pwa.js (registration + install invitation).
    # seo/config.json "pwa" may add to the never-lists (never remove: PWA_DEF is the floor) and holds the kill switch "kill": true
    # (or MIG_PWA_KILL=1 at build time) → a sw.js that deletes the app's caches and unregisters itself, and pages that unregister it.
    PWA_DEF = {'kill': False, 'theme_color': '#8E0B20', 'background_color': '#FFFFFF',
               # downloads: the CSV lists and the Android APKs (seo_app.part.py) — a download goes to the network as it is, never through the worker
               'never': ['api', 'admin', 'login', 'dashboard', 'advisor', 'meeting', 'inbox', 'seo-admin', 'seo-team', 'data-desk', 'pay', 'panel', 'downloads'],
               'never_files': ['/data/overlay.js', '/app/android.apk'], 'cache_max': {'code': 80, 'img': 250}, 'max_bytes': 12 * 1048576}
    PWA_ICONS = ('icon-192.png', 'icon-512.png', 'maskable-192.png', 'maskable-512.png', 'monochrome-512.png', 'apple-touch-icon.png', 'favicon-32.png',
                 'favicon.ico', 'sc-factories.png', 'sc-tenders.png', 'sc-rfq.png', 'sc-janna.png')
    PWA_PRECACHE = ['/offline/', '/img/app/icon-192.png']

    def pwa_conf():
        # once per build phase (S is reset by _init): pwa_head() asks for it on every one of the ~7,500 pages
        key = (id(S.get('cfg')), os.environ.get('MIG_PWA_KILL'))
        if S.get('pwa_conf_key') != key:
            S['pwa_conf'], S['pwa_conf_key'] = _pwa_conf(), key
        return S['pwa_conf']

    def _pwa_conf():
        c = dict(PWA_DEF)
        own = (S.get('cfg') or {}).get('pwa') or {}
        for k in ('kill', 'theme_color', 'background_color', 'max_bytes'):
            if k in own:
                c[k] = own[k]
        c['kill'] = c['kill'] is True or os.environ.get('MIG_PWA_KILL') == '1'     # only a JSON true (a string "false" is no kill)
        for k in ('theme_color', 'background_color'):
            if not re.match(r'^#[0-9A-Fa-f]{6}$', str(c[k])):
                c[k] = PWA_DEF[k]
        if not isinstance(c['max_bytes'], int) or not 1048576 <= c['max_bytes'] <= 25 * 1048576:
            c['max_bytes'] = PWA_DEF['max_bytes']
        c['cache_max'] = dict(PWA_DEF['cache_max'])
        for k, v in (own.get('cache_max') or {}).items():
            if k in c['cache_max'] and isinstance(v, int) and 10 <= v <= 2000:
                c['cache_max'][k] = v
        c['never'] = sorted(set(PWA_DEF['never']) | set(x for x in (own.get('never') or []) if isinstance(x, str) and re.match(r'^[a-z0-9][a-z0-9-]{0,40}$', x)))
        files = set(PWA_DEF['never_files']) | set(x for x in (own.get('never_files') or []) if isinstance(x, str) and re.match(r'^/[\w./-]+$', x))
        # the old system's own files on this domain (deploy/legacy-live.txt: /data/auth.js, /data/me.js, /data/egadm.js …) are never stored
        lf = B + 'deploy/legacy-live.txt'
        if os.path.exists(lf):
            for line in open(lf, encoding='utf-8'):
                p = line.strip()
                if p.startswith('/') and not p.startswith('#') and not p.endswith('*') and re.match(r'^/[\w./-]+$', p):
                    files.add(p)
        c['never_files'] = sorted(files)
        return c

    def pwa_never_js(c):
        """the JS regex of the paths the worker never touches: /api/…, /admin/, /login/ … (also /en/x/, /x and /x.html)"""
        return '/^\\/(?:en\\/)?(?:%s)(?:[\\/.?#]|$)/' % '|'.join(c['never'])

    # The platform's own apps «صنع في مصر» (app/: a WebView of this site whose user agent ends «MIGApp/<v> (ios|android)»): <html> gets
    # «mig-app mig-app-ios|android» before the first paint (generated pages load data/flags.js deferred), and — while the owner keeps
    # buying off inside that app (data/flags.js keeps the server's last answer in localStorage "mig-flags-app") — «mig-off-app_buy_<p>»,
    # so the [data-mig-buy] parts (prices, «ادفع الآن», renew / upgrade) are hidden from the start. Browsers: nothing (no MIGApp mark).
    # The same rule as data/flags.js and worker/src/app-ua.js. ES5 (CLAUDE.md 2.1).
    APP_HEAD_JS = ('<style>html.mig-app [data-mig-app-only][hidden]{display:inline!important}'   # app-only bits ([data-mig-app-only])
                   # buying off inside that app: hidden from the first paint (data/flags.js carries the same rule for the live switch)
                   'html.mig-app-ios.mig-off-app_buy_ios [data-mig-buy],html.mig-app-android.mig-off-app_buy_android [data-mig-buy]{display:none!important}</style>'
                   r'<script>(function(){try{var u=navigator.userAgent||"",m=/\bMIGApp\/[^\s()]*\s*\((ios|android)\)/i.exec(u),p=m?m[1].toLowerCase():"";'
                   r'if(!m){if(!/\bMIGApp\b/.test(u))return;p=/iPhone|iPad|iPod/.test(u)?"ios":/Android/i.test(u)?"android":"";}'
                   r'var c=" mig-app"+(p?" mig-app-"+p:"");if(p){try{var o=JSON.parse(localStorage.getItem("mig-flags-app")||"null");'
                   r'if(o&&o["app_buy_"+p]===false)c+=" mig-off-app_buy_"+p;}catch(e){}}document.documentElement.className+=c;}catch(e){}})();</script>')

    def pwa_head(L):
        c = pwa_conf()
        if S.get('pwa_src') is None:
            f = B + 'data/pwa.js'
            S['pwa_src'] = ('/data/pwa.js?v=%s' % hashlib.md5(open(f, 'rb').read()).hexdigest()[:8]) if os.path.exists(f) else ''
        en = L == 'en'
        t = (APP_HEAD_JS + '<meta name="theme-color" content="%s"><link rel="manifest" href="/manifest%s.webmanifest">' % (c['theme_color'], '.en' if en else '')
             + '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">'
             + '<meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="%s">' % X(L, 'صنع في مصر', 'Made in Egypt')
             + '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" sizes="32x32" href="/img/app/favicon-32.png">'
             + '<link rel="icon" type="image/png" sizes="192x192" href="/img/app/icon-192.png"><link rel="apple-touch-icon" sizes="180x180" href="/img/app/apple-touch-icon.png">')
        if S['pwa_src']:
            apk = bool(APPDL) and APPDL['apk_info']().get('state') == 'ok'   # APPDL hook: data/pwa.js offers «أو نزّل تطبيق أندرويد» → /app/
            t += '<script src="%s" defer%s%s></script>' % (S['pwa_src'], ' data-pwa="off"' if c['kill'] else '', ' data-apk="1"' if apk else '')
        return t

    def pwa_link(u):
        """the shortcut / start URLs carry ?source=pwa (analytics can count the app's visits); the fragment stays last"""
        base, _, frag = u.partition('#')
        return base + ('&' if '?' in base else '?') + 'source=pwa' + ('#' + frag if frag else '')

    def pwa_manifest(L, c):
        en = L == 'en'

        def ico(n, size, purpose=None):
            d = {'src': '/img/app/' + n, 'sizes': size, 'type': 'image/png'}
            if purpose:
                d['purpose'] = purpose
            return d

        def hub(p):
            if not en:
                return p
            return ('/en' + p) if ('/en' + p) in S['en_paths'] else p + '?lang=en'
        # Janna's live call (data/janna-live.js, ?live=1) runs on the app pages: the Arabic home is one; the English home /en/ is a
        # generated page without her, so the English shortcut opens her on the contact page in English (it has no /en/ twin)
        janna = '/?live=1' if not en else static_url('contact', 'en') + ('&' if '?' in static_url('contact', 'en') else '?') + 'live=1'
        sc = [(X(L, 'دليل المصانع', 'Factory directory'), X(L, 'المصانع', 'Factories'),
               X(L, 'ابحث في دليل المصانع والموردين المصريين', 'Search the directory of Egyptian manufacturers and suppliers'), hub('/factories/'), 'sc-factories.png'),
              (X(L, 'المناقصات', 'Tenders'), X(L, 'المناقصات', 'Tenders'),
               X(L, 'مناقصات الجهات الحكومية والهيئات من مصادرها الرسمية', 'Tenders of government bodies and authorities from their official sources'), hub('/tenders/'), 'sc-tenders.png'),
              (X(L, 'اطلب عرض سعر', 'Request a quote'), X(L, 'عرض سعر', 'Get a quote'),
               X(L, 'أرسل طلب عرض سعر للمصانع المسجّلة على المنصة', 'Send a request for quotation to the factories registered on the platform'), static_url('contact', L, '#rfq-form'), 'sc-rfq.png'),
              (X(L, 'كلّم جنة', 'Talk to Janna'), X(L, 'جنة', 'Janna'),
               X(L, 'مكالمة فيديو مع جنة، مساعِدة المنصة بالذكاء الاصطناعي', 'A video call with Janna, the platform’s AI assistant'), janna, 'sc-janna.png')]
        return {'id': '/en/' if en else '/', 'name': X(L, 'منصة صنع في مصر', 'Made in Egypt Gate'), 'short_name': X(L, 'صنع في مصر', 'Made in Egypt'),
                'description': X(L, 'منصة صنع في مصر: المنصة الوطنية B2B لربط المصانع والموردين المصريين بالمشترين المحليين والدوليين — دليل المصانع والمنتجات والمناقصات وطلبات عروض الأسعار.',
                                 'Made in Egypt Gate: the B2B platform that connects Egyptian factories and suppliers with local and international buyers — the factory directory, products, tenders and requests for quotation.'),
                'lang': 'en' if en else 'ar', 'dir': 'ltr' if en else 'rtl', 'start_url': pwa_link('/en/' if en else '/'), 'scope': '/', 'display': 'standalone',
                'theme_color': c['theme_color'], 'background_color': c['background_color'], 'categories': ['business', 'productivity'],
                'icons': [ico('icon-192.png', '192x192', 'any'), ico('icon-512.png', '512x512', 'any'), ico('maskable-192.png', '192x192', 'maskable'),
                          ico('maskable-512.png', '512x512', 'maskable'), ico('monochrome-512.png', '512x512', 'monochrome')],
                'shortcuts': [{'name': n, 'short_name': s, 'description': d, 'url': pwa_link(u), 'icons': [ico(i, '96x96')]} for n, s, d, u, i in sc]}

    OFFLINE_TPL = r'''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex"><title>غير متصل – صنع في مصر</title><meta name="theme-color" content="__THEME__">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<style>html,body{margin:0;background:#F8FAFC;color:#0F172A}body{font:16px/1.8 Cairo,Tahoma,"Segoe UI",sans-serif;min-height:100vh;display:flex;flex-direction:column}
.bar{background:__THEME__;height:6px;padding-top:env(safe-area-inset-top,0px)}main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 16px;max-width:560px;margin:0 auto;box-sizing:border-box}
img{width:96px;height:96px;margin:0 0 12px}h1{font-size:1.45rem;line-height:1.5;margin:0 0 6px}p{margin:0 0 16px;color:#475569}
button{font:800 1rem Cairo,Tahoma,"Segoe UI",sans-serif;background:#C8102E;color:#fff;border:0;border-radius:999px;padding:12px 28px;min-height:48px;cursor:pointer}
button:focus-visible{outline:3px solid __THEME__;outline-offset:3px}.alt{font-size:.92rem;color:#64748B;border-top:1px solid #E2E8F0;padding-top:12px;margin:18px 0 0}
@media (prefers-color-scheme:dark){html,body{background:#120708;color:#F2E8E9}p{color:#A8989A}.alt{color:#A8989A;border-color:#35201F}}</style></head>
<body><div class="bar"></div><main><img src="/img/app/icon-192.png" alt="منصة صنع في مصر" width="96" height="96">
<h1 id="t">أنت غير متصل بالإنترنت</h1><p id="m">الصفحة دي محتاجة اتصال بالإنترنت. اتأكد من الشبكة وجرّب تاني — هتتفتح لوحدها أول ما الاتصال يرجع.</p>
<button type="button" id="retry">🔄 حاول مرة أخرى</button>
<p class="alt" id="alt" lang="en" dir="ltr">You are offline. This page needs an internet connection — check your network and try again; it opens by itself as soon as you are back online.</p></main>
<script>(function(){var b=document.getElementById("retry"),en=false;function go(){location.reload();}if(b)b.onclick=go;window.addEventListener("online",go);
try{en=/^\/en(\/|$)/.test(location.pathname)||/[?&]lang=en(&|$)/.test(location.search)||localStorage.getItem("mig-lang")==="en";}catch(e){}
if(!en)return;var d=document.documentElement,a=document.getElementById("alt");d.lang="en";d.dir="ltr";document.title="Offline – Made in Egypt Gate";
document.getElementById("t").textContent="You are offline";document.getElementById("m").textContent="This page needs an internet connection. Check your network and try again — it opens by itself as soon as you are back online.";
if(b)b.textContent="🔄 Try again";if(a){a.lang="ar";a.dir="rtl";a.textContent="أنت غير متصل بالإنترنت. الصفحة دي محتاجة اتصال بالإنترنت — اتأكد من الشبكة وجرّب تاني.";}})();</script>
</body></html>
'''

    SW_TPL = r'''/* /sw.js - the service worker of the installable app (PWA) of madeinegyptgate.com. GENERATED by seo_build.part.py emit_pwa() on every
   build: change the template there, never this file. ES5 (CLAUDE.md 2.1).
   - Pages (top-level navigations): the network first, always; only when the network fails, the offline page /offline/ (stored at
     install). HTML is never stored: every page a visitor sees is the live one.
   - This site's static files (/data/*.js|css|json with ?v=, the pictures under /img/ and /assets/, scripts, styles and fonts under
     /assets/ and /fonts/): stale-while-revalidate (the stored copy at once, a fresh one fetched behind it) in two capped caches,
     but only while the stored copy is fresh by its own headers (Date + max-age: /data/ one hour, as _headers says — data/janna.js
     loads data files under ITS version, so one URL can change at a deploy; /img/ 30 days; /assets/ /fonts/ a year). An older copy
     waits for the network and answers only when the network fails: a returning visitor never gets an earlier visit's data.
   - Never touched (the request goes to the network exactly as without this worker): other sites (Anam's SDK and its calls, analytics,
     Google Fonts), anything but GET, byte ranges and media (audio, video), frames (Janna's / Bassem's shared screen), the API and the
     private pages (NEVER), the Worker's live files and the old system's (NEVER_FILES), and every file a private page loads.
   - Versioned caches: a build with a new offline page or new rules installs a new worker, which deletes the old caches.
   - Kill switch: seo/config.json "pwa": {"kill": true} (or MIG_PWA_KILL=1 at build time) writes a worker that removes itself. */
(function () {
  "use strict";
  var V = __MIG_PWA_VER__, RT = __MIG_PWA_RT__, PRE = "mig-pwa-", CORE = PRE + "core-" + V, CODE = PRE + "code-" + RT, IMG = PRE + "img-" + RT;
  var KEEP = [CORE, CODE, IMG], OFFLINE = "/offline/", PRECACHE = __MIG_PWA_PRECACHE__;
  var MAX = { code: __MIG_PWA_MAX_CODE__, img: __MIG_PWA_MAX_IMG__ }, MAX_BYTES = __MIG_PWA_MAX_BYTES__;
  var NEVER = __MIG_PWA_NEVER__;
  var NEVER_FILES = __MIG_PWA_NEVER_FILES__;
  var IMG_RX = /\.(?:png|jpe?g|webp|gif|svg|avif|ico)$/i, CODE_RX = /\.(?:js|css|json|woff2?|ttf|otf)$/i;
  var own = Object.prototype.hasOwnProperty, ORIGIN = self.location.origin;
  function noop() { return null; }

  self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(CORE).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return fetch(new Request(u, { cache: "reload", credentials: "same-origin" })).then(function (r) {
          if (!r.ok) throw new Error("precache " + u + ": HTTP " + r.status);
          /* a redirected answer cannot answer a navigation: it is stored as a plain one */
          return c.put(u, r.redirected ? new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers }) : r);
        });
      }));
    }).then(function () { return self.skipWaiting(); }));
  });

  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf(PRE) === 0 && KEEP.indexOf(k) < 0; }).map(function (k) { return caches["delete"](k); }));
    }).then(function () { return self.clients.claim(); }));
  });

  function never(p) { return NEVER.test(p) || own.call(NEVER_FILES, p); }
  /* a file loaded by a private page (its referrer): left alone too */
  function fromPrivate(ref) {
    if (!ref) return false;
    try { var r = new URL(ref); return r.origin === ORIGIN && never(r.pathname); } catch (x) { return false; }
  }
  function kind(p, q) {
    if (p.indexOf("/data/") === 0) return CODE_RX.test(p) && /[?&]v=/.test(q) ? "code" : "";
    if (p.indexOf("/img/") === 0) return IMG_RX.test(p) ? "img" : "";
    if (p.indexOf("/assets/") === 0) return IMG_RX.test(p) ? "img" : (CODE_RX.test(p) ? "code" : "");
    if (p.indexOf("/fonts/") === 0) return CODE_RX.test(p) ? "code" : "";
    return "";
  }
  function storable(r) {
    if (!r || r.status !== 200 || r.type !== "basic") return false;
    var cc = r.headers.get("Cache-Control") || "", n = +(r.headers.get("Content-Length") || 0);
    return !/no-store|private/i.test(cc) && (r.headers.get("Vary") || "") !== "*" && !(n > MAX_BYTES);
  }
  /* the size cap: the oldest entries go first (Cache keys come in the order they were stored) */
  function trim(c, max) {
    return c.keys().then(function (ks) { var out = [], i; for (i = 0; i < ks.length - max; i++) out.push(c["delete"](ks[i])); return Promise.all(out); });
  }
  /* fresh by its own headers: the server's Date + Cache-Control max-age (no max-age or no Date: not fresh) */
  function fresh(r) {
    var m = /max-age=(\d+)/.exec(r.headers.get("Cache-Control") || ""), d = Date.parse(r.headers.get("Date") || "");
    return !!m && !isNaN(d) && new Date().getTime() - d < +m[1] * 1000;
  }
  function offline() {
    return caches.open(CORE).then(function (c) { return c.match(OFFLINE); }).then(function (r) { return r || Response.error(); }, function () { return Response.error(); });
  }
  function page(e, req) {
    e.respondWith(fetch(req).then(null, offline));
  }
  function swr(e, req, k) {
    var name = k === "img" ? IMG : CODE;
    var hit = caches.match(req).then(null, noop);
    var net = fetch(req).then(function (r) { var copy = null; try { if (storable(r)) copy = r.clone(); } catch (x) { copy = null; } return { r: r, copy: copy }; });
    e.waitUntil(net.then(function (o) {
      if (!o.copy) return null;
      return caches.open(name).then(function (c) { return c.put(req, o.copy).then(function () { return trim(c, MAX[k]); }); });
    }).then(null, noop));
    /* a fresh stored copy at once; else the network, and the stale copy only when the network fails */
    e.respondWith(hit.then(function (h) {
      if (h && fresh(h)) return h;
      return net.then(function (o) { return o.r; }, function (x) { if (h) return h; throw x; });
    }));
  }

  self.addEventListener("fetch", function (e) {
    var req = e.request, u, d, k;
    if (req.method !== "GET") return;
    try { u = new URL(req.url); } catch (x) { return; }
    if (u.origin !== ORIGIN || never(u.pathname)) return;
    if (req.headers.has("range")) return;
    d = req.destination || "";
    if (d === "audio" || d === "video" || d === "track" || d === "iframe" || d === "frame" || d === "embed" || d === "object") return;
    if (req.mode === "navigate") { if (d === "" || d === "document") page(e, req); return; }
    if (req.cache === "no-store" || req.cache === "reload" || req.cache === "no-cache" || req.cache === "only-if-cached") return;
    if (fromPrivate(req.referrer)) return;
    k = kind(u.pathname, u.search);
    if (k) swr(e, req, k);
  });
})();
'''

    SW_KILL_TPL = r'''/* /sw.js - KILL SWITCH of the installable app of madeinegyptgate.com (seo/config.json "pwa": {"kill": true}, or MIG_PWA_KILL=1 at build
   time; GENERATED by seo_build.part.py emit_pwa()). It takes over from the previous worker at once, deletes the app's caches
   (mig-pwa-*) and unregisters itself: the site then runs exactly as without a service worker. data/pwa.js registers nothing while
   the pages carry data-pwa="off". ES5. */
(function () {
  "use strict";
  var PRE = "mig-pwa-";
  self.addEventListener("install", function () { self.skipWaiting(); });
  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf(PRE) === 0; }).map(function (k) { return caches["delete"](k); }));
    }).then(function () { return self.registration.unregister(); }));
  });
})();
'''

    def pwa_hash(*parts):
        """a version without digits (a run of digits in a public file looks like a phone number to the privacy gate)"""
        h = hashlib.sha256()
        for p in parts:
            h.update(p if isinstance(p, bytes) else str(p).encode('utf-8'))
        return ''.join('ghijklmnop'[int(ch)] if ch.isdigit() else ch for ch in h.hexdigest()[:12])

    def emit_pwa(OUT):
        """the installable app's root files: /manifest.webmanifest, /manifest.en.webmanifest, /sw.js, /offline/, /favicon.ico,
        /apple-touch-icon.png (icons: img/app/, tools/app_icons.py). Problems (a missing icon, a shortcut without a page) stop the build."""
        c = pwa_conf()
        probs = []
        for n in PWA_ICONS:
            if not os.path.isfile(B + 'img/app/' + n):
                probs.append('pwa: img/app/%s is missing (run python3 tools/app_icons.py and commit img/app/)' % n)
        mans = {}
        for L in ('ar', 'en'):
            m = pwa_manifest(L, c)
            mans[L] = m
            with open(OUT + ('manifest.en.webmanifest' if L == 'en' else 'manifest.webmanifest'), 'w', encoding='utf-8') as f:
                f.write(json.dumps(m, ensure_ascii=False, indent=1) + '\n')
            for u in [m['start_url']] + [s['url'] for s in m['shortcuts']]:
                p = unquote(urlparse(u).path)
                if not page_on_disk(p):
                    probs.append('pwa: %s manifest links %s, which this build does not have' % (L, u))
        off = OFFLINE_TPL.replace('__THEME__', c['theme_color'])
        os.makedirs(OUT + 'offline', exist_ok=True)
        with open(OUT + 'offline/index.html', 'w', encoding='utf-8') as f:
            f.write(off)
        for n in ('favicon.ico', 'apple-touch-icon.png'):
            if os.path.isfile(B + 'img/app/' + n):
                with open(B + 'img/app/' + n, 'rb') as a, open(OUT + n, 'wb') as b:
                    b.write(a.read())
        # the version follows what the worker holds and does (template, rules, the precached files): an unchanged build leaves the
        # visitors' worker as it is, a changed one replaces it (and its caches) at their next visit
        pre = [off.encode('utf-8')]
        if os.path.isfile(B + 'img/app/icon-192.png'):
            pre.append(open(B + 'img/app/icon-192.png', 'rb').read())
        ver = pwa_hash(SW_TPL, json.dumps(c, sort_keys=True), json.dumps(PWA_PRECACHE), *pre)
        rt = pwa_hash(SW_TPL)[:6]
        if c['kill']:
            js = SW_KILL_TPL
        else:
            js = (SW_TPL.replace('__MIG_PWA_VER__', json.dumps(ver)).replace('__MIG_PWA_RT__', json.dumps(rt))
                  .replace('__MIG_PWA_PRECACHE__', json.dumps(PWA_PRECACHE)).replace('__MIG_PWA_MAX_CODE__', str(c['cache_max']['code']))
                  .replace('__MIG_PWA_MAX_IMG__', str(c['cache_max']['img'])).replace('__MIG_PWA_MAX_BYTES__', str(int(c['max_bytes'])))
                  .replace('__MIG_PWA_NEVER__', pwa_never_js(c)).replace('__MIG_PWA_NEVER_FILES__', json.dumps(dict((p, 1) for p in c['never_files']), sort_keys=True)))
        if '__MIG_PWA_' in js:
            probs.append('pwa: sw.js template placeholder left unfilled')
        with open(OUT + 'sw.js', 'w', encoding='utf-8') as f:
            f.write(js)
        S['pwa_problems'] = probs
        return {'version': ver, 'kill': c['kill'], 'never': c['never'], 'never_files': c['never_files'], 'precache': PWA_PRECACHE,
                'cache_max': c['cache_max'], 'start_url': {L: mans[L]['start_url'] for L in mans},
                'shortcuts': {L: [s['url'] for s in mans[L]['shortcuts']] for L in mans}, 'problems': probs}

    def emit_manifest(OUT):
        os.makedirs(OUT + '_seo', exist_ok=True)
        open(OUT + '_seo/pages.json', 'w', encoding='utf-8').write(json.dumps({'v': 1, 'built': S['built_at'], 'site': SITE, 'count': len(MANIFEST), 'rows': MANIFEST}, ensure_ascii=False, separators=(',', ':')))
        en_map = {k: v for k, v in sorted(((r['p'], r['a']) for r in MANIFEST if r['l'] == 'ar' and r['a']))}
        if S.get('en_home') and '/en/' in S['en_paths']:
            en_map['/'] = '/en/'
        # ?lang=en on a legacy URL (the old site's hreflang links are x.html?lang=en): one hop to the English twin of the redirect target,
        # or to the target itself when it has none (the middleware answers ?lang=en from this map before the exact redirects)
        for k, v in ((S.get('redirects') or {}).get('exact') or {}).items():
            if not k.startswith('/en/') and k not in en_map:
                en_map[k] = en_map.get(v) or v
        en_map = dict(sorted(en_map.items()))
        open(OUT + '_seo/en-paths.json', 'w', encoding='utf-8').write(json.dumps(en_map, ensure_ascii=False, separators=(',', ':')))
        # the Control Center overlay baked into this build (tools/dump-data.mjs out.overlay): the panel lists what still waits for a rebuild
        ovb = (S.get('D') or {}).get('overlay') or {}
        open(OUT + '_seo/overlay-baked.json', 'w', encoding='utf-8').write(json.dumps({'v': ovb.get('v'), 'at': ovb.get('at')} if ovb.get('v') else {'v': None}))
        return len(MANIFEST)

    SHIM_TPL = '''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="%(canon)s">
<style>html,body{background:#fff}body{font:15px/1.8 Cairo,Tahoma,"Segoe UI",sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;color:#334155}main{max-width:560px;padding:24px;text-align:center}main img{display:block;width:64px;height:64px;margin:0 auto 14px}.sp{width:32px;height:32px;margin:0 auto 10px;border-radius:50%%;border:3px solid #E2E8F0;border-top-color:#C8102E;animation:sp .8s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}.m{margin:0;color:#64748B;font-size:14px}a{color:#C8102E;font-weight:700}@media (prefers-reduced-motion:reduce){.sp{animation:none}}</style>
<script>(function(){var t=%(type)s,hub=%(hub)s,hubEn=%(hub_en)s,miss=%(miss)s,h="",EN=false,q=null;
/* the visitor's language: ?lang=en|ar, else the choice data/i18n.js remembers (localStorage mig-lang) → English twin (/en/…) when
   the build has one (/_seo/hash/<type>.en.json), else the Arabic page with ?lang=en so it switches to English itself */
try{q=/[?&]lang=(en|ar)(&|$)/.exec(location.search);EN=q?q[1]==="en":localStorage.getItem("mig-lang")==="en";}catch(e){EN=!!q&&q[1]==="en";}
try{h=decodeURIComponent((location.hash||"").slice(1));}catch(e){h=(location.hash||"").slice(1);}
/* an id with no static page goes to the type's in-app reader when it has one (article → the news page #read=<id>: «أخبار المشتريات» are never
   public pages, review M-2), else to the hub */
function go(p,en){var x="",u=(p&&p.charAt(0)==="/"&&p.charAt(1)!=="/")?p:"",i,f="";if(!u){if(miss&&h){u=miss;x="#read="+encodeURIComponent(h);}else u=EN?hubEn:hub;}if(EN&&!en&&u.indexOf("/en/")!==0){i=u.indexOf("#");if(i>-1){f=u.slice(i);u=u.slice(0,i);}u+=(u.indexOf("?")<0?"?":"&")+"lang=en"+f;}location.replace(u+x);}
if(!h){go(EN?hubEn:hub,EN&&hubEn.indexOf("/en/")===0);return;}
/* company.html#N: links from this site's pages use the current numbering; links from outside (shared before the 2026-11-18 data
   clean-up, or the old site's /factories/<slug> → company.html#N redirects) use the old one, kept as "o<N>" in the map */
var ext=true;try{ext=!document.referrer||new URL(document.referrer).host!==location.host;}catch(e){}
var k=[h,h.toLowerCase(),h.toUpperCase(),h.replace(/^reg-/i,"").toUpperCase()];
function pick(m){if(ext&&m["o"+h])return m["o"+h];for(var i=0;i<k.length;i++){if(m[k[i]])return m[k[i]];}return "";}
function ar(){fetch("/_seo/hash/"+t+".json",{credentials:"omit"}).then(function(r){return r.ok?r.json():{};}).then(function(m){go(pick(m),false);}).catch(function(){go(hub,false);});}
if(EN){fetch("/_seo/hash/"+t+".en.json",{credentials:"omit"}).then(function(r){return r.ok?r.json():{};}).then(function(m){var p=pick(m);if(p)go(p,true);else ar();}).catch(ar);}else ar();})();</script>
</head><body><main><img src="/img/logo-site.png" alt="" width="64" height="64"><div class="sp" aria-hidden="true"></div><p class="m">%(msg)s</p><p class="f" hidden><a href="%(hubrel)s">%(link)s</a></p></main><script>setTimeout(function(){var f=document.querySelector(".f");if(f)f.hidden=false;},4000);</script></body></html>
'''

    def compute_hash_maps():
        """old hash id → new path, per legacy template (company.html#N → /factories/<slug>/ …)"""
        cfg = S['cfg']
        maps = {k: {} for k in cfg.get('shim_keys', {})}
        for c in S['companies']:
            maps.setdefault('company', {})[c['hid']] = c['path']
            if c['kind'] == 'member' and len(S['D']['fac'][c['i']]) > 16 and S['D']['fac'][c['i']][16]:   # an added company: company.html#c-…
                maps['company'][S['D']['fac'][c['i']][16]] = c['path']
        for hid, c in S['facx_alias'].items():
            maps['company'][hid] = c['path']
        # numbering before the data clean-up (MIGOLDFAC_MAP[old] = new index): "o<old>" → page of the record it became
        by_i = {c['i']: c for c in S['companies'] if c['kind'] == 'member'}
        for old, new in enumerate(S['D'].get('fac_map') or []):
            if isinstance(new, int) and new in by_i:
                maps['company']['o%d' % old] = by_i[new]['path']
        for n in S['news']:
            maps.setdefault('article', {})[str(n['i'])] = n['path']
            if n.get('id'):                    # an added news item: article.html#n-…
                maps['article'][n['id']] = n['path']
        for e in S['events']:
            maps.setdefault('event', {})[e.get('id')] = e['path']
            # the events calendar (media2.part.py EV_JS), Janna on that page and older links number the events «ev<N>» = position in
            # REAL.events + 1 (a hidden event is a hole there, so the numbers of the others do not move); events added in the Control
            # Center keep their own «cc-ev-…» id
            if not str(e.get('id') or '').startswith('cc-ev-'):
                maps['event'].setdefault('ev%d' % (e['i'] + 1), e['path'])
        for o in S['offers']:
            maps.setdefault('offer', {})[o.get('id')] = o['path']
        for z in S['zones']:
            maps.setdefault('city', {})[z['id']] = z['path']
            maps['city'][z['name_ar']] = z['path']
            if z.get('city'):
                maps['city'].setdefault(z['city'], z['path'])
        for g in S['hub_govs']:
            maps.setdefault('region', {})[g['g']['code']] = g['path']
        for p in S['projects']:
            maps.setdefault('project', {})[p['id']] = p['path']
        for a in S['awards']:
            maps.setdefault('winner', {})[str(a['i'])] = a['path']
            if a.get('id'):                    # an added award: winner.html#a-…
                maps['winner'][a['id']] = a['path']
        for t in S['tenders']:
            for h in t.get('hid') or []:
                maps.setdefault('opportunity', {})[h] = t['path']
        for m in S['exports']:
            maps.setdefault('export-market', {})[m['key']] = m['path']
        maps.setdefault('entity', {}).update(entity_targets())
        return maps

    def reg_nn(t):
        """data/registry.js NN(): the name key it merges award winners / awarding entities on (ة/ه, ى/ي, أ/إ/آ → ا, spaces)"""
        t = re.sub('[ةه]', 'ه', str(t or ''))
        t = re.sub('[ىي]', 'ي', t)
        t = re.sub('[أإآ]', 'ا', t)
        return re.sub(r'\s+', ' ', t).strip()

    def entity_targets():
        """entity.html#<id> → the page of every REG record the site links to (data/registry.js: agencies aN = issuing entities of the
        published tenders, raN = awarding entities of REAL.awards; companies cN = the 91 companies verified by the platform team, rcN =
        award winners). Owner report 2026-11-19: 74 agency cards and winner rankings opened /tenders/. Order: the record's own page
        (the issuing entity's page /tenders/entity/<slug>/, the company's page /factories/<slug>/), else its only tender or award, else
        the interactive awards list filtered on its name (/awards/search/#q=<name>: registry.part.py reads #q=), else no key (the stub
        opens the section). The ids are positional (REAL.awards order) on the pages as here: both come from the same data at build time."""
        reg = S['D'].get('reg') or {}
        out = {}
        ents = S.get('entity_page_by_name') or S.get('entity_by_name') or {}
        ents_nn = {reg_nn(k): v for k, v in ents.items()}
        tend_nn, aw_ent, aw_win = {}, {}, {}
        for t in S['tenders']:
            if t['entity'] and t['src'] != 'intl' and t.get('page', True):
                tend_nn.setdefault(reg_nn(t['entity']), []).append(t)
        for a in S['awards']:
            if a.get('awarding_entity_ar'):
                aw_ent.setdefault(reg_nn(a['awarding_entity_ar']), []).append(a)
            if a.get('winner_ar'):
                aw_win.setdefault(reg_nn(a['winner_ar']), []).append(a)
        hp = HOST.get('pages')
        ap = (S['cfg'].get('app_paths') or {}).get('winners') or ''
        aw_list = ap if ap and ((isinstance(hp, dict) and 'winners' in hp) or os.path.exists(S['OUT'] + ap.lstrip('/') + 'index.html')) else ''

        def awards_of(name, lst):
            if len(lst) == 1:
                return lst[0]['path']
            if lst:
                return (aw_list + '#q=' + quote(name, safe='')) if aw_list else '/awards/'
            return ''
        for a in reg.get('agencies', []):
            if not a or not a[0] or not a[1]:
                continue
            k = reg_nn(a[1])
            e = ents.get(a[1]) or ents_nn.get(k)
            tl = tender_sort(tend_nn.get(k, []))
            p = e['path'] if e else (tl[0]['path'] if tl else '') or awards_of(a[1], aw_ent.get(k, []))
            if p:
                out[a[0]] = p
        byname = {c['name']: c for c in S['companies']}
        bykey = {}
        for x in S['companies']:
            bykey.setdefault(name_key(x['name']), x)
        same = S['D'].get('facx_same') or {}          # MIGFAC name → the researched spelling its MIGFACX row keeps (data/facx.js SAME)
        for c in reg.get('companies', []):
            if not c or not c[0] or not c[1]:
                continue
            m = byname.get(c[1]) or bykey.get(name_key(c[1])) or (byname.get(same[c[1]]) or bykey.get(name_key(same[c[1]])) if same.get(c[1]) else None)
            p = m['path'] if m else awards_of(c[1], aw_win.get(reg_nn(c[1]), []))
            if p:
                out[c[0]] = p
        return out

    def emit_hash_shims(OUT):
        cfg = S['cfg']
        maps = S.get('hash_maps') or compute_hash_maps()
        os.makedirs(OUT + '_seo/hash', exist_ok=True)
        n = 0
        for key, hub in cfg.get('shim_keys', {}).items():
            m = maps.get(key, {})
            open(OUT + '_seo/hash/%s.json' % key, 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, separators=(',', ':')))
            # English twins of the same keys (only where this build wrote the /en/ page): the shim sends English visitors there
            m_en = {k: '/en' + v for k, v in m.items() if isinstance(v, str) and ('/en' + v) in S['en_paths']}
            # a target with a fragment (the interactive list /awards/search/#q=…): its English twin when the build wrote one, else the same
            # page with ?lang=en before the fragment (an app page switches to English from the parameter; appended after the «#» it would be lost)
            for k, v in m.items():
                if k in m_en or not isinstance(v, str) or '#' not in v:
                    continue
                base, _, frag = v.partition('#')
                if ('/en' + base) in S['en_paths']:
                    m_en[k] = '/en' + v
                elif not base.startswith('/en/'):
                    m_en[k] = base + ('&' if '?' in base else '?') + 'lang=en#' + frag
            open(OUT + '_seo/hash/%s.en.json' % key, 'w', encoding='utf-8').write(json.dumps(m_en, ensure_ascii=False, separators=(',', ':')))
            hub_en = '/en' + hub if ('/en' + hub) in S['en_paths'] else hub
            # noindex,follow with a self canonical (a canonical to the hub would send the opposite signal: "index that one instead")
            # article.html#<id> of a news item with no public page («أخبار المشتريات»): the news page reads it in place (#read=<id>)
            miss = (cfg.get('app_paths') or {}).get('news', '') if key == 'article' else ''
            page_ = SHIM_TPL % {'title': 'جاري التحويل – منصة صنع في مصر', 'canon': esc(abs_url('/%s.html' % key)), 'type': json.dumps(key), 'hub': json.dumps(hub), 'hub_en': json.dumps(hub_en), 'hubrel': esc(hub), 'miss': json.dumps(miss),
                                'msg': 'ثواني… · One moment…', 'link': 'لو الصفحة مافتحتش، افتح القسم من هنا ←'}   # owner 2026-11-18: no error-looking screen while it jumps
            write_page('/%s.html' % key, page_)
            n += 1
        return {k: len(v) for k, v in maps.items()}

    RFQ_NEW_JS = '''(function(){var q=new URLSearchParams(location.search),to=q.get("to")||"",n=q.get("n")||"",t=q.get("t")||"company",id=q.get("id")||"";
if(to&&!(to.charAt(0)==="/"&&to.charAt(1)!=="/"))to="";
if(n){try{sessionStorage.setItem("mig-rfq-to",JSON.stringify({type:/^(company|factory|product|tender)$/.test(t)?t:"company",id:id.slice(0,120),name:n.slice(0,200),url:to}));}catch(e){}}
location.replace(%s);})();'''

    def emit_rfq_new(OUT):
        out = []
        for L in ('ar', 'en'):
            P = '/en' if L == 'en' else ''
            form = static_url('contact', L, '#rfq-form')
            path = P + '/rfq/new/'
            if L == 'en' and not S['cfg']['en'].get('enabled'):
                continue
            body = ('<!doctype html>\n<html lang="%s" dir="%s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>%s</title>'
                    '<meta name="robots" content="noindex,follow"><link rel="canonical" href="%s"><script>%s</script></head><body><main style="max-width:560px;margin:15vh auto;padding:16px;font:16px/1.8 Tahoma,sans-serif;text-align:center">'
                    '<h1>%s</h1><p>%s</p><p><a href="%s">%s</a></p></main></body></html>\n'
                    % (L, 'ltr' if L == 'en' else 'rtl', X(L, 'طلب عرض سعر – منصة صنع في مصر', 'Request a quote – Made in Egypt Gate'), esc(abs_url(path)), RFQ_NEW_JS % json.dumps(form),
                       X(L, 'طلب عرض سعر', 'Request a quote'), X(L, 'جاري فتح نموذج طلب عرض السعر…', 'Opening the request form…'), esc(form), X(L, 'افتح النموذج', 'Open the form')))
            write_page(path, body)
            S['paths'].add(path) if L == 'ar' else S['en_paths'].add(path)
            out.append(path)
        return out

    def emit_downloads(OUT):
        """«تحميل القائمة (CSV)»: name, sector, city, URL only (no contacts)"""
        os.makedirs(OUT + 'downloads', exist_ok=True)

        def cell(v):
            # public files opened in spreadsheets: a cell starting with = + - @ (or a tab / CR) must not run as a formula
            v = '' if v is None else str(v)
            return "'" + v if v[:1] in ('=', '+', '-', '@', '\t', '\r') else v

        def write_csv(name, members):
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(['الاسم', 'النوع', 'القطاع', 'المدينة / المحافظة', 'حالة الإدراج', 'الرابط'])
            for c in members:
                w.writerow([cell(x) for x in (c['name'], c['type'], c['sector'], '، '.join(x for x in [city_text(c, 'ar'), gov_name(c['gov'], 'ar')] if x),
                                              VER_AR if is_team(c) else 'مصادر عامة – غير مسجّل' if is_pub(c) else 'مدرجة في دليل المنصة', abs_url(c['path']))])
            open(OUT + 'downloads/' + name, 'w', encoding='utf-8-sig', newline='').write(buf.getvalue())
            S['csv_written'].add(name)
            return '/downloads/' + name
        S['dir_csv'] = write_csv('factories-egypt.csv', S['dir_members'])
        for h in S['hub_sectors']:
            if h['indexable']:
                h['csv'] = write_csv('factories-%s.csv' % h['sec']['slug'], h['members'])

    # ------------------------------------------------------------------ helpers for site.py static pages
    def seo_footer_block(lang='ar'):
        """crawlable footer links for site.py static pages (spec §1.8): top 10 sector hubs, top 10 governorates, zones, tenders, RFQ, site map.
        Needs seo_prepare() (or build_static_seo) first."""
        if not S.get('hub_sectors'):
            return ''
        L = lang
        sec = [h for h in S['hub_sectors'] if h['indexable']][:10]
        gov = [g for g in S['hub_govs'] if g['indexable']][:10]
        li = lambda href, txt: '<li><a href="%s">%s</a></li>' % (esc(href), esc(txt))
        return ('<div class="cols ftr-seo" style="margin-top:18px"><div><h4>%s</h4><ul>%s</ul></div><div><h4>%s</h4><ul>%s</ul></div><div><h4>%s</h4><ul>%s</ul></div></div>'
                % (X(L, 'أهم القطاعات', 'Top sectors'), ''.join(li(h['path'], X(L, h['sec']['t_ar'], h['sec']['t_en'])) for h in sec),
                   X(L, 'أهم المحافظات', 'Top governorates'), ''.join(li(g['path'], X(L, g['g']['ar'], g['g']['en'])) for g in gov),
                   X(L, 'أدلة المنصة', 'Platform guides'), li('/factories/', X(L, 'دليل المصانع', 'Factory directory')) + li('/industrial-zones/', X(L, 'المناطق الصناعية', 'Industrial zones'))
                   + li('/free-zones/', X(L, 'المناطق الحرة', 'Free zones')) + li('/tenders/', X(L, 'المناقصات', 'Tenders')) + li('/rfq/', X(L, 'طلب عرض سعر', 'Request a quote'))
                   + li('/products/', X(L, 'المنتجات', 'Products')) + li('/site-map/', X(L, 'خريطة الموقع', 'Site map'))))

    def seo_static_tail():
        """end-of-<body> snippet for site.py static pages written into sub-directories with <base href="/">: keeps «#fragment» links on the same page"""
        return BASE_FIX_TAIL

    def seo_static_head(key, title, lang='ar', h1=None, app=False, base=True):
        """<head> content (minus CSS/JS) for a site.py static page, from seo.part.py's SEO dict + this module's rules (spec §1.2, §1.7)"""
        cfg = S.get('cfg') or load_config()[0]
        sp = cfg.get('static_paths', {})
        path = sp.get(key, '/%s/' % key)
        P = '/en' if lang == 'en' else ''
        canon_key = cfg.get('canonical_static', {}).get(key)
        if app:
            # the interactive version of a page whose canonical is now a generated hub: noindex,follow with a self canonical
            # (noindex + a canonical to the indexable hub would be contradictory signals); the hub links to it
            path = cfg.get('app_paths', {}).get(key, path)
        canonical = abs_url(P + (sp.get(canon_key, '/%s/' % canon_key) if canon_key else path))
        SEO = HOST.get('SEO') or {}
        d = SEO.get(key) or (title, '', 'WebPage', [], 'weekly', '0.5')
        desc = d[0] if lang == 'ar' else (tr(d[0]) or 'Made in Egypt Gate – the B2B platform that connects Egyptian factories and suppliers with local and international buyers.')
        desc = mk_desc([desc], lang, '')   # 70–160 characters (spec A2)
        # gated pages (site.py GATES: the page sends a visitor without the plan to register.html#partner) are not indexable as they are
        gated = set(cfg.get('gated_static') or []) | set((HOST.get('GATES') or {}).keys())
        robots = 'noindex,follow' if (key in cfg.get('noindex_static', []) or app or canon_key or key in gated) else 'index,follow,max-image-preview:large'
        if key in gated and not app:
            PERSIST.setdefault('static_gated', {})[P + path] = key
        if key == 'home':
            title = X(lang, 'منصة صنع في مصر | دليل المصانع المصرية والمناقصات وطلبات الأسعار', 'Made in Egypt Gate | Egyptian Manufacturers Directory, Tenders & RFQs')
        crumbs_items = [(X(lang, 'الرئيسية', 'Home'), P + '/')]
        for n, u in (d[3] or []):
            k2 = u.split('.html')[0].split('#')[0]
            crumbs_items.append((n, P + sp.get(k2, '/%s/' % k2)))
        if key != 'home':
            crumbs_items.append((title.split(' – ')[0], P + path))
        _, crumb_ld = crumbs(crumbs_items, lang, canonical)
        org = dict(HOST.get('ORG') or {"@type": "Organization", "@id": SITE + '/#org', "name": "منصة صنع في مصر", "url": SITE + '/'})
        org['@id'] = SITE + '/#org'
        org['sameAs'] = [u for u in (org.get('sameAs') or []) if 'linkedin.com/in/' not in u]
        web = dict(HOST.get('WEBSITE') or {"@type": "WebSite", "url": SITE + '/', "name": "منصة صنع في مصر"})
        web.pop('potentialAction', None)
        web['@id'] = SITE + '/#web'
        web['publisher'] = {"@id": SITE + '/#org'}
        page_node = {"@type": d[2] if d[2] in ('AboutPage', 'ContactPage', 'CollectionPage', 'WebPage') else 'WebPage', "@id": canonical + '#webpage', "url": canonical, "name": h1 or title,
                     "inLanguage": 'en' if lang == 'en' else 'ar-EG', "isPartOf": {"@id": SITE + '/#web'}, "publisher": {"@id": SITE + '/#org'}, "breadcrumb": {"@id": canonical + '#breadcrumb'}}
        graph = ([org, web] if key in ('home', 'about') else []) + [page_node, crumb_ld]
        meta = {'title': title, 'desc': desc, 'canonical': canonical, 'robots': robots, 'lang': lang, 'og_type': 'website', 'keywords': d[1] if lang == 'ar' else '', 'base': False,
                'jsonld_site': {"@context": "https://schema.org", "@graph": graph}, 'jsonld_page': None, 'path': P + path}
        if key == 'home':
            # /en/ is generated by build_static_seo (later in the same build) whenever English is enabled
            en_twin = lang == 'ar' and bool(cfg.get('en', {}).get('enabled')) and cfg.get('en_home', True) is not False
        else:
            en_twin = (not app) and bool(S.get('OUT')) and os.path.exists(S['OUT'] + 'en' + path + 'index.html')
        if en_twin:
            meta['alt_ar'], meta['alt_en'] = path, '/en' + path
        save_css, save_js = S.get('css_url'), S.get('js_url')
        S['css_url'] = S['js_url'] = None
        S.setdefault('cfg', cfg)
        try:
            out = head_html(meta)
        finally:
            S['css_url'], S['js_url'] = save_css, save_js
        if base:
            # pages now live in sub-directories (/about/): relative URLs inside the page and inside data/*.js resolve from the site root
            out = out.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + BASE_FIX_HEAD, 1)
        return out

    LINK_RX = re.compile(r'''(\s(?:href|src|action|poster|data-href)=)(["'])([^"']*)\2''')

    def _mark_h1(html_):
        spans = [(m.start(), m.end()) for m in re.finditer(r'<script\b[\s\S]*?</script>', html_)]
        for m in re.finditer(r'<h1\b([^>]*)>', html_):
            if any(a <= m.start() < b for a, b in spans):
                continue
            if 'data-seo=' in m.group(1):
                return html_
            return html_[:m.start()] + '<h1 data-seo="h1"' + m.group(1) + '>' + html_[m.end():]
        return html_

    def seo_rewrite_links(html_, lang='ar', mark_h1=True):
        """rewrite a site.py page's internal links to the clean URLs: x.html → /x/, company.html#N → /factories/<slug>/, region.html#CAI → /governorates/cairo/, img/ → /img/ …"""
        cfg = S.get('cfg') or load_config()[0]
        sp = cfg.get('static_paths', {})
        gen = set(cfg.get('generated_keys', []))
        appp = cfg.get('app_paths', {})
        hmaps = S.get('hash_maps') or {}
        P = '/en' if lang == 'en' else ''

        def fix(u):
            if not u or u.startswith(('http:', 'https:', 'mailto:', 'tel:', 'javascript:', 'data:', '#', '//', '/')):
                return u
            if re.match(r'^(img|data|media|fonts|assets)/', u):
                return '/' + u
            m = re.match(r'^([\w-]+)\.html(?:\?[^#]*)?(?:#(.*))?$', u)
            if not m:
                return u
            k, frag = m.group(1), m.group(2) or ''
            if k == 'home' or k == 'index':
                return '/' + ('#' + frag if frag else '')
            if k in (cfg.get('legacy_live_pages') or []):
                return '/%s.html' % k + ('#' + frag if frag else '')   # deploy 1: served by the owner's live system, not by this build
            if k in cfg.get('shim_keys', {}):
                if frag and hmaps.get(k):
                    hm = hmaps[k]
                    try:
                        fk = unquote(frag)
                    except Exception:
                        fk = frag
                    for cand in (fk, fk.lower(), fk.upper()):
                        if cand in hm:
                            return hm[cand]
                if not frag:
                    return cfg['shim_keys'][k]
                return u
            if k in gen:
                if frag and k in appp:
                    return appp[k] + '#' + frag
                return sp.get(k, '/%s/' % k)
            if k == 'factory':
                return '/factories/'
            return sp.get(k, '/%s/' % k) + ('#' + frag if frag else '')
        out = LINK_RX.sub(lambda m: m.group(1) + m.group(2) + fix(m.group(3)) + m.group(2), html_)
        out = re.sub(r'url\((["\']?)(img|media)/', r'url(\1/\2/', out)
        out = _nofollow_private(out)
        out = _mark_h1(out) if mark_h1 else out
        return _thin_guard(out, cfg)

    NOFOLLOW_PREFIXES = ('/dashboard/', '/admin/', '/inbox/', '/seo-admin/', '/meeting/', '/login/', '/en/login/')

    def _nofollow_private(html_):
        """links to logged-in areas (disallowed in robots.txt) get rel="nofollow" (spec §1.8); markup inside <script> is left alone"""
        def tag(m):
            t = m.group(0)
            hm = re.search(r'\shref=(["\'])([^"\']*)\1', t)
            if not hm or not hm.group(2).startswith(NOFOLLOW_PREFIXES):
                return t
            rm = re.search(r'\srel=(["\'])([^"\']*)\1', t)
            if rm:
                if 'nofollow' in rm.group(2).split():
                    return t
                return t[:rm.start()] + ' rel=%s%s%s' % (rm.group(1), (rm.group(2) + ' nofollow').strip(), rm.group(1)) + t[rm.end():]
            return t[:-1] + ' rel="nofollow">'
        parts = re.split(r'(<script\b[\s\S]*?</script>)', html_)
        return ''.join(x if x.startswith('<script') else re.sub(r'<a\b[^>]*>', tag, x) for x in parts)

    def _static_quality(html_):
        """(h1 count, words of server-rendered main content) of a site.py page: <main> if the page has one, else <body> minus header/nav/footer"""
        b = html_.split('<body', 1)[-1]
        b = re.sub(r'<script\b[\s\S]*?</script>|<style\b[\s\S]*?</style>|<template\b[\s\S]*?</template>|<noscript\b[\s\S]*?</noscript>', ' ', b, flags=re.I)
        h1n = len(re.findall(r'<h1\b', b, re.I))
        m = re.search(r'<main\b[^>]*>([\s\S]*)</main>', b, re.I)
        if m:
            b = m.group(1)
        else:
            b = re.sub(r'<header\b[\s\S]*?</header>|<footer\b[\s\S]*?</footer>|<nav\b[\s\S]*?</nav>', ' ', b, flags=re.I)
        return h1n, words(b)

    def _thin_guard(html_, cfg):
        """an indexable site.py page whose server HTML has (almost) no content (rendered by JS only: /bourse/, /deal/, /suppliers/ …) is written as
        noindex,follow until its template renders content (spec A2/A3); the home page is never downgraded. Recorded for the build stats."""
        head = html_.split('</head>', 1)[0]
        rm = re.search(r'<meta name="robots" content="([^"]*)">', head)
        cm = re.search(r'<link rel="canonical" href="([^"]*)">', head)
        if not rm or 'noindex' in rm.group(1) or not cm:
            return html_
        path = nfc(unquote(urlparse(_html.unescape(cm.group(1))).path or '/'))
        h1n, w = _static_quality(html_)
        mw = int(cfg.get('static_min_words', 30) or 0)
        if path != '/' and w < mw:
            PERSIST.setdefault('static_thin', {})[path] = 'static_thin_%dw' % w + ('' if h1n else '_no_h1')
            return html_.replace(rm.group(0), '<meta name="robots" content="noindex,follow">', 1)
        if h1n != 1:
            PERSIST.setdefault('static_h1', {})[path] = h1n
        return html_

    def seo_abs_assets(text):
        """for JS inside site.py pages that build relative asset URLs ("img/x.jpg", 'data/y.js') — makes them root-absolute"""
        return re.sub(r'''(["'(])(img|data|media)/''', r'\1/\2/', text)

    GEN_DIRS = ('factories', 'industrial_products', 'tender-item', 'rfq', 'governorates', 'industrial-zones', 'free-zones', 'products', 'tenders', 'awards',
                'news', 'events', 'projects', 'offers', 'export', 'site-map', 'app', 'en')
    NOT_PAGES = ('_seo', 'sitemaps', 'assets', 'downloads', 'data', 'img', 'media', 'fonts', 'offline')   # offline/: the app's offline page (emit_pwa)

    def static_candidates(OUT):
        """index.html pages written by site.py: "/", every directory outside the generated trees, and the app pages inside them (app_paths)"""
        out = []
        if os.path.isfile(OUT + 'index.html'):
            out.append('/')
        for d in sorted(os.listdir(OUT)):
            fp = OUT + d
            if d in NOT_PAGES or d in GEN_DIRS or d.startswith('.') or not os.path.isdir(fp) or os.path.islink(fp):
                continue
            for root, dirs, files in os.walk(fp):
                dirs.sort()
                if 'index.html' in files:
                    out.append('/' + os.path.relpath(root, OUT).replace(os.sep, '/') + '/')
        for ap in sorted(set((S['cfg'].get('app_paths') or {}).values())):
            if os.path.isfile(OUT + ap.lstrip('/') + 'index.html'):
                out.append(ap)
        t0 = PERSIST.get('t_start')
        if t0:
            # integrated build (seo_prepare ran first): a page site.py did not write in this build is a leftover of an older build
            # (a removed page key …): not taken into the manifest / sitemap, listed in the stats (build into a clean OUT to drop it)
            keep = []
            for p in out:
                if os.path.getmtime(OUT + p.lstrip('/') + 'index.html') < t0 - 1:
                    S['stale_static'].append(nfc(p))
                else:
                    keep.append(p)
            out = keep
        return [nfc(p) for p in out]

    def scan_static_pages(OUT):
        """manifest rows + sitemap entries for the pages written by site.py, read from the files themselves. Generated trees are not scanned
        (a leftover page there is never taken for a site.py page: remove_stale_generated() deletes it)."""
        rows = 0
        for path in static_candidates(OUT):
            if path in S['paths'] or path in S['en_paths']:
                continue
            try:
                s = open(OUT + path.lstrip('/') + 'index.html', encoding='utf-8').read()
            except Exception:
                continue
            head = s.split('</head>')[0]

            def g(rx):
                m = re.search(rx, head, re.I | re.S)
                return _html.unescape(m.group(1)).strip() if m else ''
            title = g(r'<title>(.*?)</title>')
            robots = g(r'<meta name="robots" content="([^"]*)"') or 'index,follow'
            canon = g(r'<link rel="canonical" href="([^"]*)"')
            desc = g(r'<meta name="description" content="([^"]*)"')
            lang = 'en' if path.startswith('/en/') else 'ar'
            body = re.sub(r'<script\b[\s\S]*?</script>', ' ', s.split('<body', 1)[-1])
            h1s = re.findall(r'<h1\b[^>]*>([\s\S]*?)</h1>', body)
            imgs = re.findall(r'<img\b[^>]*>', body)
            types = []
            for blk in re.findall(r'<script type="application/ld\+json"[^>]*>([\s\S]*?)</script>', s):
                try:
                    o = json.loads(blk.replace('<\\/', '</'))
                    nodes = o.get('@graph', [o]) if isinstance(o, dict) else o
                    types += [n.get('@type') for n in nodes if isinstance(n, dict) and n.get('@type')]
                except Exception:
                    types.append('INVALID')
            alts = [unquote(a) for a in re.findall(r'<link rel="alternate" hreflang="(?:en|ar-EG)" href="https://madeinegyptgate\.com([^"]+)"', head)]
            alt = next((a for a in alts if a != path), '')
            prev = S['lastmod_store'].get(path)
            h = sha(re.sub(r'\s+', ' ', strip_tags(body))[:200000], 12)
            lm = full_date(prev.get('lastmod')) if prev and prev.get('hash') == h else None
            lm = lm or S['today'].isoformat()
            S['lastmod_new'][path] = {'hash': h, 'lastmod': lm}
            h1n, w = _static_quality(s)
            app_ps = set((S['cfg'].get('app_paths') or {}).values())
            why = ((PERSIST.get('static_thin') or {}).get(path) or ('static_gated_plan' if path in (PERSIST.get('static_gated') or {}) else '')
                   or ('static_app_page' if path in app_ps else '') or ('static_page' if h1n == 1 else 'static_page_h1_%d' % h1n))
            MANIFEST.append({'p': path, 'l': lang, 't': 'home' if path in ('/', '/en/') else 'static', 'ti': title, 'd': desc, 'h1': strip_tags(h1s[0]).strip() if len(h1s) == 1 else ('' if not h1s else 'MULTI'),
                             'c': canon, 'r': robots, 'w': w, 'im': len(imgs), 'ina': sum(1 for im in imgs if not re.search(r'\balt="[^"]+"', im)), 's': sorted(set(t for t in types if isinstance(t, str))),
                             'a': alt, 'lm': lm, 'k': 'N' if path in ('/', '/en/') else '', 'why': why, 'kw': ''})
            rows += 1
        return rows

    def remove_stale_flat(OUT):
        """top-level x.html files left by an earlier build whose page now has a clean URL (/x/) and a 301 (/x.html → /x/): Pages would keep serving
        the old file at /x (deploy review: 30 stale pages, 28 of them index,follow with a .html canonical). Shims and flat_pages stay."""
        cfg = S['cfg']
        keep = set(cfg.get('shim_keys', {})) | set(cfg.get('flat_pages') or []) | {'index', '404', '410'}
        ex = (S.get('redirects') or {}).get('exact', {})
        removed = []
        for f in sorted(os.listdir(OUT)):
            fp = OUT + f
            if not f.endswith('.html') or f[:-5] in keep or os.path.islink(fp) or not os.path.isfile(fp):
                continue
            if ('/' + f) in ex:
                os.remove(fp)
                removed.append(f)
        return removed

    def remove_stale_generated(OUT):
        """pages under the generated trees that this build did not write (a record removed from the data, an EN twin that no longer passes the
        gate …) are deleted, so they cannot come back as «static» pages or keep answering 200; site.py's app pages (app_paths) and anything
        written during this build stay. Unreferenced crop images and CSV lists are removed too."""
        keep_dirs = set(p.strip('/') for p in (S['cfg'].get('app_paths') or {}).values())
        t0 = (PERSIST.get('t_start') or S['t_build']) - 1
        written = S['written']
        removed = 0
        for top in GEN_DIRS:
            base = OUT + top
            if not os.path.isdir(base) or os.path.islink(base):
                continue
            for root, dirs, files in os.walk(base, topdown=False):
                rel = os.path.relpath(root, OUT).replace(os.sep, '/')
                if 'index.html' in files and rel not in keep_dirs:
                    fp = os.path.normpath(os.path.join(root, 'index.html'))
                    if fp not in written and not os.path.islink(fp) and os.path.getmtime(fp) < t0:
                        os.remove(fp)
                        removed += 1
                try:
                    if root != base and not os.listdir(root):
                        os.rmdir(root)
                except OSError:
                    pass
        used = set(os.path.basename(v[0]) for v in S['crops'].values() if v)
        if os.path.isdir(OUT + 'assets/img'):
            for f in os.listdir(OUT + 'assets/img'):
                if f.endswith('.jpg') and f not in used:
                    os.remove(OUT + 'assets/img/' + f)
        vused = set(os.path.basename(v[0]) for v in (S.get('variants') or {}).values() if v and v[0].startswith('/assets/img/v/'))
        if os.path.isdir(OUT + 'assets/img/v'):
            for f in os.listdir(OUT + 'assets/img/v'):
                if f.endswith(('.webp', '.jpg')) and f not in vused:
                    os.remove(OUT + 'assets/img/v/' + f)
        if os.path.isdir(OUT + 'downloads'):
            for f in os.listdir(OUT + 'downloads'):
                if f.endswith('.csv') and f not in S['csv_written']:
                    os.remove(OUT + 'downloads/' + f)
        return removed

    # ------------------------------------------------------------------ validation (sample + global checks)
    def _main_text(html_, lists=True):
        m = re.search(r'<main id="main">([\s\S]*?)</main>', html_)
        t = m.group(1) if m else html_.split('<body', 1)[-1]
        if not lists:   # other records' names and snippets (cut at different lengths in AR and EN) are checked on their own pages
            t = re.sub(r'<ul class="(?:dir-list|tlist|plist|sx-tiles(?: lg)?|sx-gcards|sx-pjs|sx-news|sx-vids|sx-evs)">[\s\S]*?</ul>', ' ', t)
        return _html.unescape(strip_tags(t))

    def validate(OUT, sample=400):
        problems = []
        rows = MANIFEST
        import random
        rnd = random.Random(7)
        gen = [r for r in rows if not r['why'].startswith('static_')]
        pick = gen if len(gen) <= sample else rnd.sample(gen, sample)
        for r in pick:
            fp = OUT + r['p'].lstrip('/') + 'index.html'
            s = open(fp, encoding='utf-8').read()
            head, _, body = s.partition('</head>')
            for name, rx, want in (('title', r'<title>', 1), ('description', r'<meta name="description"', 1), ('robots', r'<meta name="robots"', 1), ('canonical', r'<link rel="canonical"', 1)):
                n = len(re.findall(rx, head))
                if n != want:
                    problems.append('%s: %d %s' % (r['p'], n, name))
            if len(re.findall(r'<h1\b', body)) != 1 or 'data-seo="h1"' not in body:
                problems.append('%s: h1 count' % r['p'])
            if not s.startswith('<!doctype html>') or '<meta charset="utf-8">' not in head or 'name="viewport"' not in head:
                problems.append('%s: doctype/charset/viewport' % r['p'])
            if re.search(r'<body[\s\S]*<title>', s):
                problems.append('%s: title in body' % r['p'])
            c = re.search(r'<link rel="canonical" href="([^"]+)"', head).group(1)
            if _html.unescape(c) != abs_url(r['p']):
                problems.append('%s: canonical %s' % (r['p'], c))
            for blk in re.findall(r'<script type="application/ld\+json" data-seo="(?:site|page)">([\s\S]*?)</script>', s):
                try:
                    validate_jsonld(blk)
                except Exception as e:
                    problems.append('%s: JSON-LD %s' % (r['p'], e))
                if re.search(r'[<>]', blk):
                    problems.append('%s: unescaped < or > in JSON-LD' % r['p'])
            if re.search(r'26[\s,.]?(k|000|ألف)', strip_tags(s)):
                problems.append('%s: 26k claim' % r['p'])
            if 'VideoObject' in s:
                problems.append('%s: VideoObject' % r['p'])
        # privacy on EVERY generated page (spec §0/A3, honesty review): main text, meta description and JSON-LD; any phone format
        for r in gen:
            s = open(OUT + r['p'].lstrip('/') + 'index.html', encoding='utf-8').read()
            ld_txt = ' '.join(re.findall(r'<script type="application/ld\+json"[^>]*>([\s\S]*?)</script>', s))
            txt = _main_text(s) + ' ' + _html.unescape(r.get('d') or '') + ' ' + ld_txt
            if has_contact(txt) or re.search(r'"(?:telephone|email|faxNumber|streetAddress)"\s*:', ld_txt):
                problems.append('%s: contact data' % r['p'])
            if r['t'] in ('company', 'company-public', 'company-verified', 'rfq'):
                own = re.search(r'<h2>(?:عن المنشأة|About the company|تفاصيل الطلب|Request details)</h2><p>([^<]*)</p>', s)
                if own:
                    t_ = _html.unescape(own.group(1))
                    m_ = ADDR_RX.search(t_) or (LOC_RX.search(t_) and ADDR_NAME_RX.search(t_))
                    if m_:
                        problems.append('%s: street address «%s»' % (r['p'], m_.group(0)[:40]))
        for f in sorted(os.listdir(OUT + 'downloads')) if os.path.isdir(OUT + 'downloads') else []:
            if f.endswith('.csv'):
                t = open(OUT + 'downloads/' + f, encoding='utf-8-sig').read()
                if has_contact(t.replace(SITE, ' ')):
                    problems.append('/downloads/%s: contact data' % f)
                if re.search(r'(?:^|,)["]?[=+\-@]', t, re.M):
                    problems.append('/downloads/%s: formula-like cell' % f)
        # English pages: no country, city or currency that the Arabic page does not name (dictionary leftovers of the Saudi/UAE versions)
        man = {r['p']: r for r in rows}
        for r in rows:
            if r['l'] != 'en' or r['why'].startswith('static_') or not r['a']:
                continue
            en_t = _main_text(open(OUT + r['p'].lstrip('/') + 'index.html', encoding='utf-8').read(), lists=False)
            ar_fp = OUT + r['a'].lstrip('/') + 'index.html'
            ar_t = _main_text(open(ar_fp, encoding='utf-8').read(), lists=False) if os.path.exists(ar_fp) else ''
            for en_rx, ar_rx in FOREIGN_MARKERS:
                if en_rx.search(en_t) and not ar_rx.search(ar_t) and not en_rx.search(ar_t):
                    problems.append('%s: foreign marker %s not in the Arabic page' % (r['p'], en_rx.pattern))
                    break
        # global: every company page carries exactly its own label (owner decision 2026-11-18) — the 91 MIGFAC companies
        # «✓ موثّق من فريق المنصة» and never «مصادر عامة» (page tag, facts, meta description, JSON-LD); only the other researched rows
        # «بيانات من مصادر عامة – غير مسجّل في المنصة»; imported member listings neither. («منشآت مشابهة» may list another company
        # with its own label, so the checks look at this company's own tag, description and JSON-LD.)
        for c in S['companies']:
            s = open(OUT + c['path'].lstrip('/') + 'index.html', encoding='utf-8').read()
            head = s.split('</head>', 1)[0]
            own = re.sub(r'<h2>(?:منشآت مشابهة|Similar companies)</h2><ul class="dir-list">[\s\S]*?</ul>', '', s.split('<main', 1)[-1])
            if is_pub(c) and 'class="pubtag"' not in s:
                problems.append('%s: public-source label missing' % c['path'])
            if is_team(c):
                if 'class="vtag"' not in s or VER_AR not in head:
                    problems.append('%s: «%s» missing (page tag / meta description / JSON-LD)' % (c['path'], VER_AR))
                if 'مصادر عامة' in head or 'مصادر عامة' in own or 'غير مسجّل' in own:
                    problems.append('%s: a MIGFAC company (verified by the platform team) is labelled public-source / not registered' % c['path'])
            if c['kind'] == 'member' and not is_team(c) and (VER_AR in own or 'مصادر عامة' in own or 'class="vtag"' in s or 'class="pubtag"' in s):
                problems.append('%s: an imported member listing carries a verified / public-source label' % c['path'])
        dup_t = {}
        for r in rows:
            if 'noindex' not in r['r'] and not r['why'].startswith('static_'):
                dup_t.setdefault((r['l'], r['ti']), []).append(r['p'])
        dups = {k: v for k, v in dup_t.items() if len(v) > 1}
        # hreflang reciprocity ("/" is site.py's home: checked on the file when it exists)
        for r in rows:
            if r['a'] and not r['why'].startswith('static_'):
                tw = man.get(r['a'])
                if r['a'] == '/' and not tw:
                    if os.path.exists(OUT + 'index.html') and 'hreflang="en" href="%s/en/"' % SITE not in open(OUT + 'index.html', encoding='utf-8').read().split('</head>')[0]:
                        problems.append('/: no hreflang to /en/')
                    continue
                if not tw or tw['a'] != r['p']:
                    problems.append('%s: hreflang not reciprocal' % r['p'])
        if S['cfg'].get('en', {}).get('enabled') and S['cfg'].get('en_home', True) and '/en/' not in man:
            problems.append('/en/: English home not built')
        # sitemaps: full dates only (XSD), no noindex URL
        for f in os.listdir(OUT + 'sitemaps'):
            t = open(OUT + 'sitemaps/' + f, encoding='utf-8').read()
            bad = [x for x in re.findall(r'<lastmod>([^<]*)</lastmod>', t) if not full_date(x)]
            if bad:
                problems.append('/sitemaps/%s: lastmod %s' % (f, bad[0]))
        # redirect map: one hop, no key that is a page or the /x ↔ /x/ twin of a page or of its own target
        ex = (S.get('redirects') or {}).get('exact') or {}
        for k, v in ex.items():
            a = alt_slash(k)
            if v in ex or v == k or (a and (v == a or page_on_disk(a))) or (not k.endswith('.html') and page_on_disk(k)):
                problems.append('redirect %s → %s: loop/chain/shadow' % (k, v))
        return problems, dups

    # ------------------------------------------------------------------ orchestration
    def _init(OUT, today=None, dump=True):
        if not OUT.endswith('/'):
            OUT += '/'
        os.makedirs(OUT, exist_ok=True)
        del MANIFEST[:]
        S.clear()
        cfg, sec_cfg, gov_cfg, cats_cfg, kws = load_config()
        S.update({'OUT': OUT, 'cfg': cfg, 'sec_cfg': sec_cfg, 'sectors': sec_cfg['sectors'], 'govs': gov_cfg['governorates'], 'cats': cats_cfg['categories'],
                  'kw_by_cluster': {c['cluster']: c for c in kws.get('clusters', [])}, 'specs': [], 'paths': set(), 'en_paths': set(), 'bytes': 0, 'files': 0,
                  'crops': {}, 'lastmod_of': {}, 'lastmod_new': {}, 'overrides': {}, 'page_exists': page_exists, 'written': set(), 'csv_written': set(),
                  'warnings': [], 't_build': time.time(), 'stale_static': []})
        tday = today or cfg.get('today') or os.environ.get('MIG_SEO_TODAY')
        S['today'] = pdate(tday) if tday else datetime.date.today()
        S['built_at'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        S['cat_by_slug'] = {c['slug']: c for c in S['cats']}
        S['cat_by_sector'] = {}
        S['cat_for_sector'] = {}
        for c in S['cats']:
            for sname in c.get('sectors', []):
                S['cat_by_sector'][sname] = c['slug']
            for slug in c.get('factory_hubs', []):
                S['cat_for_sector'][slug] = c
        D = load_data(dump)
        S['D'] = D
        S['dict'] = dict(D.get('real_en') or {})
        S['dict'].update(D.get('i18n_en') or {})
        S['inc_bits'] = {str(k): v for k, v in (D.get('inc_bits') or {}).items()}
        S['lm_path'] = os.environ.get('MIG_SEO_LASTMOD') or (B + 'seo/lastmod.json')
        store = load_json(S['lm_path'], {}) or {}
        S['lastmod_store'] = store.get('pages', {}) if isinstance(store, dict) else {}
        ovf = load_json(B + 'build/seo-overrides.json', None)
        if ovf:
            ov = ovf.get('ov') if isinstance(ovf, dict) and 'ov' in ovf else ovf
            if isinstance(ov, list):
                ov = {r.get('path'): (r.get('fields') or r) for r in ov if r.get('path')}
            S['overrides'] = {}
            for k, v in (ov or {}).items():
                if not isinstance(v, dict):
                    continue
                v = dict(v)
                for f in ('title', 'description', 'og_title', 'og_description', 'h1', 'intro', 'keywords'):
                    if isinstance(v.get(f), str) and has_contact(v[f]):
                        v[f] = scrub(v[f])
                        S['warnings'].append('override_contact_scrubbed:%s:%s' % (k, f))
                if isinstance(v.get('jsonld'), str) and (has_contact(v['jsonld']) or re.search(r'"(?:telephone|email|faxNumber)"\s*:', v['jsonld'])):
                    v.pop('jsonld')
                    S['warnings'].append('override_jsonld_contact_dropped:%s' % k)
                S['overrides'][nfc(unquote(k))] = v
        build_model(D)
        return OUT

    def seo_prepare(OUT=None, today=None, dump=True):
        """model + hash maps only, no files: call before site.py writes its static pages so that seo_rewrite_links()
        can turn company.html#N, region.html#CAI, city.html#id … into the clean URLs."""
        PERSIST.clear()
        PERSIST['t_start'] = time.time()     # files under the generated trees written after this moment belong to this build (site.py's app pages)
        _init(OUT or (HOST.get('OUT') or B + 'site/'), today, dump)
        build_hubs()
        S['hash_maps'] = compute_hash_maps()
        S['prepared'] = True
        return {k: len(v) for k, v in S['hash_maps'].items()}

    def build_static_seo(OUT, today=None, dump=True, save_lastmod=True, validate_sample=400):
        """generate every data page (AR + gated EN), shims, sitemaps, robots, redirects, headers, routes, the manifest and the app (PWA) files into OUT"""
        t0 = time.time()
        OUT = _init(OUT, today, dump)
        cfg = S['cfg']
        S['app_pages_expected'] = isinstance(HOST.get('pages'), dict)
        try:
            import PIL  # noqa: F401  (product photos and company logos are cropped from the sprite sheets img/old/*.jpg)
        except ImportError:
            if os.environ.get('MIG_SEO_ALLOW_NO_PIL') != '1':
                raise RuntimeError('seo_build: Pillow is required (pip install pillow): without it the product photos and company logos are missing from '
                                   'about 1,300 pages. Set MIG_SEO_ALLOW_NO_PIL=1 to build without them on purpose.')
            S['warnings'].append('pillow_missing: product photos and company logos omitted')
        for d in ('data', 'img'):
            if os.path.islink(OUT + d) and not os.path.exists(OUT + d):
                S['warnings'].append('broken_symlink:%s' % d)
            elif not os.path.exists(OUT + d):
                S['warnings'].append('missing_in_out:%s (pages reference /%s/…)' % (d, d))
        emit_assets(OUT)
        load_visual()
        for p in S['products']:
            if p['img']:
                p['img_url'] = crop_cell('p', p['img'][0], p['img'][1])
        same_crop = {}
        for p in S['products']:
            if p.get('img_url'):
                same_crop[p['img_url'][0]] = same_crop.get(p['img_url'][0], 0) + 1
        for p in S['products']:
            if p.get('img_url'):
                # placeholder: the grey box (crop_cell) or one picture shared by 3+ different products
                p['img_ph'] = bool((S.get('crop_ph') or {}).get(('p', p['img'][0], p['img'][1]))) or same_crop.get(p['img_url'][0], 0) >= 3
        for c in S['companies']:
            if c.get('logo'):
                c['logo_img'] = crop_cell('l', c['logo'][0], c['logo'][1])
        build_hubs()
        emit_downloads(OUT)
        S['paths'].add('/rfq/new/')
        if cfg.get('en', {}).get('enabled'):
            S['en_paths'].add('/en/rfq/new/')
        plan_pages()
        # the hash maps already while rendering: the main menu (nav_links) turns region.html#CAI into /governorates/cairo/ with them, as
        # seo_rewrite_links() does on the app pages (recomputed after render_all, once the RFQ form pages exist)
        S['hash_maps'] = compute_hash_maps()
        n_specs = len(S['specs'])
        if n_specs * 2 > cfg.get('max_pages', 18000):
            print('seo_build: warning: up to %d pages planned (limit %d)' % (n_specs * 2, cfg.get('max_pages')))
        tm = {'setup': round(time.time() - t0, 1)}
        t1 = time.time()
        stats = render_all()
        tm['render'] = round(time.time() - t1, 1)
        t1 = time.time()
        emit_rfq_new(OUT)
        S['hash_maps'] = compute_hash_maps()
        shim_counts = emit_hash_shims(OUT)
        stale_pages = remove_stale_generated(OUT)       # before the redirect map: a leftover page must not hide a redirect
        S['en_gone'] = sorted('/en' + p for p, v in S['lastmod_store'].items()
                              if isinstance(v, dict) and v.get('en') and not p.startswith('/en/') and not (S['lastmod_new'].get(p) or {}).get('en'))
        R = emit_redirect_maps(OUT)
        stale_flat = remove_stale_flat(OUT)
        static_rows = scan_static_pages(OUT)
        sm = emit_sitemaps(OUT)
        emit_robots(OUT)
        hdr = emit_headers(OUT)
        emit_routes(OUT)
        emit_error_pages(OUT)
        pwa = emit_pwa(OUT)               # the installable app: manifests, /sw.js, /offline/, root icons
        app_dl = APPDL['emit'](OUT) if APPDL else None   # APPDL hook: /downloads/android/ (APKs + latest.json), /.well-known/assetlinks.json
        emit_manifest(OUT)
        if save_lastmod:
            pages = dict(S['lastmod_new'])
            tday = S['today'].isoformat()
            for pth, v in S['lastmod_store'].items():
                # keep the history of pages that are gone (≤ 400 days): EN twins that disappear are then redirected to the AR page
                if pth in pages or not isinstance(v, dict):
                    continue
                gone = full_date(v.get('gone')) or tday
                if (S['today'] - pdate(gone)).days <= 400:
                    pages[pth] = dict(v, gone=gone)
            lm_path = S['lm_path']
            store = {'_about': 'Persisted lastmod per path (seo_build.part.py): the date is kept while the content hash is unchanged; "en": an English twin was '
                               'published; "gone": first build without the page (kept 400 days for redirects).', 'pages': dict(sorted(pages.items()))}
            with open(lm_path + '.tmp', 'w', encoding='utf-8') as f:
                json.dump(store, f, ensure_ascii=False, indent=0)
            os.replace(lm_path + '.tmp', lm_path)
        tm['emit'] = round(time.time() - t1, 1)
        t1 = time.time()
        problems, dups = validate(OUT, validate_sample)
        problems += S.get('pwa_problems') or []
        problems += (app_dl or {}).get('problems') or []
        tm['validate'] = round(time.time() - t1, 1)
        total_files = 0
        total_bytes = 0
        for root, dirs, fs in os.walk(OUT, followlinks=False):
            for f in fs:
                fp = os.path.join(root, f)
                if not os.path.islink(fp):
                    total_files += 1
                    total_bytes += os.path.getsize(fp)
        out = {'pages_ar': stats['ar'], 'pages_en': stats['en'], 'indexable': stats['index'], 'noindex': stats['noindex'], 'static_rows': static_rows,
               'sitemap_urls': sm['urls'], 'sitemap_files': sm['files'], 'html_pages_written': S['files'], 'html_bytes': S['bytes'],
               'files_in_out_excl_symlinks': total_files, 'bytes_in_out_excl_symlinks': total_bytes,
               'redirects_exact': len(R['exact']), 'en_gone_redirects': sum(1 for p in S['en_gone'] if p in R['exact']), 'shim_maps': shim_counts, 'headers': hdr,
               'stale_removed': {'generated_pages': stale_pages, 'flat_html': stale_flat}, 'stale_static_not_scanned': S['stale_static'],
               'static_thin_noindex': dict(sorted((PERSIST.get('static_thin') or {}).items())), 'static_h1_not_1': dict(sorted((PERSIST.get('static_h1') or {}).items())),
               'en_fail': stats['en_fail'], 'by_type': stats['by_type'], 'warnings': S['warnings'][:50],
               'pwa': pwa, 'app': app_dl, 'problems': problems[:50], 'problem_count': len(problems), 'dup_titles': len(dups), 'dup_title_examples': list(dups.items())[:5],
               'seconds': round(time.time() - t0, 1), 'timing': tm, 'today': S['today'].isoformat()}
        S['stats'] = out
        PERSIST.pop('t_start', None)
        sp_ = os.environ.get('MIG_SEO_STATS') or (B + 'build/seo-stats.json')
        try:
            os.makedirs(os.path.dirname(sp_), exist_ok=True)
            with open(sp_, 'w', encoding='utf-8') as f:
                json.dump(out, f, ensure_ascii=False, indent=1)
        except OSError:
            pass
        return out

    def main(argv):
        import argparse
        ap = argparse.ArgumentParser(description='Build the static SEO pages into a directory.')
        ap.add_argument('out')
        ap.add_argument('--today')
        ap.add_argument('--no-dump', action='store_true')
        ap.add_argument('--no-lastmod-save', action='store_true')
        ap.add_argument('--link-assets', action='store_true', help='symlink data/, img/, media/ into OUT (like site.py) for local previews')
        a = ap.parse_args(argv)
        out = a.out if a.out.endswith('/') else a.out + '/'
        os.makedirs(out, exist_ok=True)
        if a.link_assets:
            for d in ('data', 'img', 'media'):
                if not os.path.exists(out + d) and os.path.exists(B + d):
                    os.symlink(B + d, out + d)
        st = build_static_seo(out, today=a.today, dump=not a.no_dump, save_lastmod=not a.no_lastmod_save)
        print(json.dumps(st, ensure_ascii=False, indent=1))
        return 0 if not st['problem_count'] else 1

    # PPROF hook: the product view (seo_pprof.part.py) — /industrial_products/<slug>/ body, its CSS/JS in the SEO bundle, /market/ quick-view data
    PPROF = {}
    if os.path.exists(B + 'seo_pprof.part.py'):
        _pp = {}
        exec(compile(open(B + 'seo_pprof.part.py', encoding='utf-8').read(), B + 'seo_pprof.part.py', 'exec'), _pp)
        PPROF = _pp['pprof_module'](locals())
        HOST['PPROF'] = PPROF   # site.py: pages['market'] = PPROF['market'](pages['market'])
    # FPROF hook: load seo_fprof.part.py (rich company profile) with explicit helper injection; no file or MIG_FPROF=0 → classic layout
    if os.path.exists(B + 'seo_fprof.part.py') and os.environ.get('MIG_FPROF') != '0':
        _fp_ns = {}
        exec(compile(open(B + 'seo_fprof.part.py', encoding='utf-8').read(), B + 'seo_fprof.part.py', 'exec'), _fp_ns)
        FPROF.update(_fp_ns['fprof_module'](dict(
            S=S, B=B, SITE=SITE, esc=esc, X=X, T=T, tr=tr, lk=lk, pct=pct, nfc=nfc, sha=sha, abs_url=abs_url, crumbs=crumbs, home_crumb=home_crumb,
            type_label=type_label, sec_name=sec_name, gov_name=gov_name, city_text=city_text, company_desc_en=company_desc_en, first_words=first_words,
            fmt_date=fmt_date, is_team=is_team, is_pub=is_pub, rfq_link=rfq_link, static_url=static_url, en_gate=en_gate,
            VER_AR=VER_AR, VER_EN=VER_EN, PUB_AR=PUB_AR, PUB_EN=PUB_EN, AR_RX=AR_RX, scrub=scrub)))
    # APPDL hook: «تطبيق صنع في مصر» — /app/ + /en/app/ (Android APK download, iPhone from Safari, QR code), /downloads/android/ (the APKs
    # of the repository + latest.json, tools/publish_apk.py), the 302 /app/android.apk, /.well-known/assetlinks.json (seo/config.json "app")
    if os.path.exists(B + 'seo_app.part.py'):
        _ad = {}
        exec(compile(open(B + 'seo_app.part.py', encoding='utf-8').read(), B + 'seo_app.part.py', 'exec'), _ad)
        APPDL.update(_ad['appdl_module'](locals()))

    return {'build_static_seo': build_static_seo, 'head_html': head_html, 'url_for': url_for, 'abs_url': abs_url, 'slug_ascii': slug_ascii, 'legacy_slug': legacy_slug,
            'norm_sector': norm_sector, 'gov_of': gov_of, 'indexable': indexable, 'load_data': load_data, 'write_page': write_page, 'MANIFEST': MANIFEST,
            'emit_sitemaps': emit_sitemaps, 'emit_robots': emit_robots, 'emit_redirect_maps': emit_redirect_maps, 'emit_headers': emit_headers,
            'emit_routes': emit_routes, 'emit_manifest': emit_manifest, 'emit_error_pages': emit_error_pages, 'emit_hash_shims': emit_hash_shims, 'crumbs': crumbs,
            'jsonld_company': jsonld_company, 'jsonld_product': jsonld_product, 'jsonld_tender': jsonld_tender, 'jsonld_rfq': jsonld_rfq, 'jsonld_news': jsonld_news,
            'jsonld_event': jsonld_event, 'jsonld_place': jsonld_place, 'jsonld_collection': jsonld_collection,
            'render_company': render_company, 'render_sector_hub': render_sector_hub, 'render_sector_gov': render_sector_gov, 'render_gov': render_gov, 'render_zone': render_zone,
            'render_product': render_product, 'render_tender': render_tender, 'render_tender_cat': render_tender_cat, 'render_rfq': render_rfq, 'render_award': render_award,
            'render_news': render_news, 'render_event': render_event, 'render_project': render_project, 'render_export': render_export, 'render_listing_page': render_listing,
            'seo_static_head': seo_static_head, 'seo_static_tail': seo_static_tail, 'seo_footer_block': seo_footer_block, 'site_footer': site_footer, 'seo_prepare': seo_prepare, 'compute_hash_maps': compute_hash_maps, 'seo_rewrite_links': seo_rewrite_links, 'seo_abs_assets': seo_abs_assets, 'SEO_STATE': S, 'seo_main': main,
            'seo_scrub': scrub, 'seo_has_contact': has_contact, 'seo_tr': (lambda s: tr(s)),
            'seo_base_head': BASE_FIX_HEAD}   # <base href="/"> + the history fix, for standalone pages in sub-directories (panel.part.py → /admin/)


SEO_API = _seo_build_module(globals())
for _seo_k, _seo_v in SEO_API.items():
    globals()[_seo_k] = _seo_v
del _seo_k, _seo_v

if __name__ == '__main__' and (globals().get('__file__') or '').endswith('seo_build.part.py'):
    import sys as _seo_sys
    _seo_sys.exit(SEO_API['seo_main'](_seo_sys.argv[1:]))
