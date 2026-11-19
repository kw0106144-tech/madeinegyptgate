# Build EGYPT data files from the researched JSON (every item keeps its source URL):
# data/real.js (news, events, market, awards, tenders, tenders_intl), data/offers.js, data/projects.js (real projects + leads + news),
# data/registry.js (companies/agencies; real awards are prepended at runtime), and copies research images into img/.
import json, os, re, shutil, collections
S = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/eg/'
R = S + 'real/'
B = '/home/user/madeinegyptgate/'
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
def load(n, d=None):
    p = R + n + '.json'
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else (d if d is not None else [])
EMN = dict([('CAI','القاهرة'),('GIZ','الجيزة'),('ALX','الإسكندرية'),('QLB','القليوبية'),('SHR','الشرقية'),('DKH','الدقهلية'),('GHR','الغربية'),('MNF','المنوفية'),('BHR','البحيرة'),('KFS','كفر الشيخ'),('DMT','دمياط'),('PTS','بورسعيد'),('ISM','الإسماعيلية'),('SUZ','السويس'),('NSN','شمال سيناء'),('JSN','جنوب سيناء'),('FYM','الفيوم'),('BNS','بني سويف'),('MNY','المنيا'),('AST','أسيوط'),('SHG','سوهاج'),('QNA','قنا'),('LXR','الأقصر'),('ASN','أسوان'),('BBA','البحر الأحمر'),('WAD','الوادي الجديد'),('MTR','مطروح')])
REGN = {k: 'محافظة ' + v for k, v in EMN.items()}
# ---------- images ----------
for sub in ('news', 'events', 'offers', 'cities', 'gov', 'yt'):
    os.makedirs(B + 'img/' + sub, exist_ok=True)
    src = S + 'img/' + sub + '/'
    if os.path.isdir(src):
        for f in os.listdir(src):
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): shutil.copy(src + f, B + 'img/' + sub + '/' + f)
def img_if(path):
    return path if path and os.path.exists(B + path) else ''
# ---------- real.js ----------
news = load('news')
for i, n in enumerate(news):
    n['image_file'] = img_if('img/news/n%d.jpg' % i) or img_if(('img/news/' + os.path.basename(n['image_file'])) if n.get('image_file') else '')
# old platform news (2026 only, industry only), English from tr/misc0.json; images -> img/onews/<id>.jpg
import glob as _g, urllib.request as _u
_NT = {}
for _f in _g.glob(S + 'tr/*.json'): _NT.update(json.load(open(_f, encoding='utf-8')))
_NEN = {}
_P = json.load(open(S + 'live/news.json', encoding='utf-8')) if os.path.exists(S + 'live/news.json') else []
os.makedirs(B + 'img/onews', exist_ok=True)
# clean summary for an old-site post: full text without links, hashtags and markdown, without the leading copy of the title,
# cut at a sentence end (or a word boundary + «…») within 320 characters; a post with no text beyond its title gets the title itself
def _ntit(t):
    t = re.sub(r'[\u064B-\u0652\u0640]', '', t or ''); t = re.sub('[أإآ]', 'ا', t)
    return re.sub(r'[^\w]+', '', t.replace('ة', 'ه').replace('ى', 'ي'))
def _clean(t):
    t = re.sub(r'#\S+', '', re.sub(r'https?://\S+', '', t or '')).replace('*', '')
    t = re.sub(r'\s*\[…\]\s*$', '', t.strip())
    return re.sub(r'\s+', ' ', t).strip(' -–—:،,')
def _drop_title(body, title):
    nt, acc = _ntit(title), ''
    if not nt: return body
    for i, ch in enumerate(body):
        acc += _ntit(ch)
        if acc == nt: return body[i + 1:].lstrip(' .:،,!؟?-–—“”"●•').strip()
        if not nt.startswith(acc): return body
    return ''
# a remainder that continues the headline mid-sentence (the old site's title is a shortened headline) is read with the title in front
_FRAG = re.compile(r'^(ذات الصلة|ويشهد|وذلك|واستعراض|بما |بين |في مجالات)')
def _summary(n):
    body = _drop_title(_clean(n.get('content')) or _clean(n.get('excerpt')), n['title']).lstrip(' .:،,!؟?-–—“”"●•').strip()
    if _FRAG.match(body): body = _clean(n['title']).strip(' !') + ' ' + body
    if len(body) < 25: return _clean(n['title']).rstrip('.') + '.'
    if len(body) <= 320: return body
    cut = body[:320]; m = max(cut.rfind('. '), cut.rfind('؛ '))
    return cut[:m + 1] if m >= 140 else cut.rsplit(' ', 1)[0].rstrip(' ،,.:؛-–') + '…'
for _n in _P:
    if _n['date'] < '2026-01-01': continue
    _t = _NT.get('news:' + str(_n['id']), {})
    if _t.get('is_industry_news') is False: continue
    _img = 'img/onews/%d.jpg' % _n['id']
    if _n.get('img') and not os.path.exists(B + _img):
        try: open(B + _img, 'wb').write(_u.urlopen(_u.Request(_n['img'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read())
        except Exception: pass
    _ex = _summary(_n)
    news.append({'title_ar': _n['title'], 'summary_ar': _ex, 'source_name': 'منصة صنع في مصر', 'date': _n['date'][:10], 'category_ar': _t.get('category_ar') or 'صناعة',
                 'region_code': None, 'url': _n['url'], 'image_file': img_if(_img)})
    if _t.get('title_en'): _NEN[_n['title']] = _t['title_en']
    if _t.get('excerpt_en') and _ex != _n['title']: _NEN[_ex] = _t['excerpt_en']
news.sort(key=lambda n: n.get('date') or '', reverse=True)
# the old site re-posts the same story (weekly reels, repeated announcements): one card per normalised title, the newest one
# (an older copy replaces it only when it has an image and the newest has none); the order is kept
# the same story re-posted under another title is caught by its summary text (first 150 letters)
_seen, _dd = {}, []
for n in news:
    ks = [_ntit(n['title_ar'])] + ([_ntit(n['summary_ar'])[:150]] if len(_ntit(n['summary_ar'])) >= 60 else [])
    j = next((_seen[k] for k in ks if k in _seen), None)
    if j is not None:
        if not _dd[j]['image_file'] and n['image_file']: _dd[j] = n
        continue
    for k in ks: _seen[k] = len(_dd)
    _dd.append(n)
news = _dd
json.dump({k: v for k, v in _NEN.items() if k and v}, open(B + 'data/i18n-news.json', 'w', encoding='utf-8'), ensure_ascii=False)
events = load('events')
for e in events:
    f = e.get('image_file') or ''
    e['image_file'] = img_if('img/events/' + os.path.basename(f)) if f else ''
market = load('market')
awards = load('awards')
for a in awards: a['value_sar_million'] = a.get('value_egp_million'); a['value_aed_million'] = a.get('value_egp_million')   # pages read value_*; amounts are EGP
tenders = load('tenders')
for t in tenders: t.setdefault('estimated_value_sar', t.get('bid_bond_egp'))
seen, T2 = set(), []
for t in tenders:
    k = (t.get('ref') or '') + '|' + (t.get('title_ar') or '')
    if k in seen: continue
    seen.add(k); T2.append(t)
tenders = sorted(T2, key=lambda t: t.get('closing_date') or '', reverse=True)
# international tenders (export markets) are country-neutral: reuse the Saudi research list
intl = []
sp = '/home/user/madeinsaudigate/data/real.js'
if os.path.exists(sp):
    s = open(sp, encoding='utf-8').read(); intl = json.loads(s[s.index('=') + 1:].strip().rstrip(';')).get('tenders_intl', [])
real = {'news': news, 'events': events, 'market': market, 'awards': awards, 'tenders': tenders, 'tenders_intl': intl}
_NUM = re.compile(r'[0-9٠-٩][0-9٠-٩,.:%/\-]*')
_SEN = {_NUM.sub('{n}', re.sub(r'\s+', ' ', n['summary_ar']).strip()): _NEN[n['summary_ar']] for n in news if n['source_name'] == 'منصة صنع في مصر' and _NEN.get(n['summary_ar'])}
open(B + 'data/real.js', 'w', encoding='utf-8').write('/* Researched public Egyptian data (news, events, EGX closes, contract awards, tenders) — every item has its source URL. Amounts in EGP. */\nwindow.REAL=' + J(real) + ';\n'
    + '/* English for the old-site news summaries (Arabic key with numbers as {n}; the English keeps its own numbers), added to the English dictionary */\n'
    + 'window.REAL_EN=' + J(_SEN) + ';\n(function () { var D = window.MIGLANG === "en" && window.I18N_EN; if (!D) return; for (var k in REAL_EN) if (D[k] == null) D[k] = REAL_EN[k]; })();\n')
# merge official tenders into the tenders page list (MIGTEND), newest/open first, with English originals for i18n
_ot = open(B + 'data/oldtend.js', encoding='utf-8').read()
_rows = json.loads(_ot.split('=', 1)[1].strip().rstrip(';'))
_rows = [r for r in _rows if not str(r[0]).startswith('OFF:')]
_EN2 = {}
def _st(d):
    if not d: return 'سارية'
    if d < '2026-11-17': return 'منتهية'
    return 'تنتهي قريباً' if d <= '2026-11-24' else 'سارية'
_new = []
_SERV = re.compile(r'(repair|maintenance|servicing|consultan|training|cleaning|catering|canteen|insurance|audit|study|hiring|rental|lease|event|manpower|subscription|renewal|software|license|licence|security services|guard|pest|landscap|facility management|survey|recruit|outsourc|travel|ticket)|(خدمات|صيانة|استشار|تدريب|تنظيف|إيجار|تأجير|مقاصف|تأمين|تدقيق|دراسة|اشتراك|تجديد|برمجيات|رخص|حراسة|مكافحة|تنسيق حدائق|إدارة المرافق|مسح|توظيف)', re.I)
_GOODS = re.compile(r'(supply|purchase|procure|manufactur|fabricat|توريد|شراء|تصنيع)', re.I)
def _industrial(t):
    tx = (t.get('title_en') or '') + ' ' + (t.get('title_ar') or '')
    return not (_SERV.search(tx) and not _GOODS.search(tx))
tenders = [t for t in tenders if _industrial(t)]
for t in tenders:
    if not t.get('title_ar'): continue
    rc = t.get('region_code') or ''
    _new.append(['OFF:' + (t.get('ref') or ''), 'مناقصة', _st(t.get('closing_date')), t['title_ar'], t.get('entity_ar') or 'جهة حكومية', EMN.get(rc, ''), t.get('sector_ar') or 'المواد والمنتجات الصناعية', '', '', t.get('closing_date') or '', rc, t.get('source_url') or ''])
    if t.get('title_en'): _EN2[t['title_ar']] = t['title_en']
    if t.get('entity_en') and t.get('entity_ar'): _EN2[t['entity_ar']] = t['entity_en']
_all = _new + _rows
_all.sort(key=lambda r: ({'سارية': 0, 'تنتهي قريباً': 0}.get(r[2], 1), '' if not r[9] else ''.join(chr(255 - ord(c)) for c in r[9])))
open(B + 'data/oldtend.js', 'w', encoding='utf-8').write(_ot.split('=', 1)[0] + '=' + J(_all) + ';\n')
json.dump(_EN2, open(B + 'data/i18n-real.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('tenders page list', len(_all), 'official', len(_new))
# ---------- offers.js ----------
offers = load('offers')
for _x in ('offers_fashion', 'offers_build', 'offers_tech'): offers += load(_x)
_seen = set(); offers = [o for o in offers if not (o['id'] in _seen or _seen.add(o['id']))]
for o in offers:
    f = 'img/offers/' + o['id'] + '.jpg'
    o['img'] = f if os.path.exists(B + f) else ''
    for k in ('price_sar', 'price_aed'): o[k] = o.get('price_egp')
    for k in ('old_price_sar', 'old_price_aed'): o[k] = o.get('old_price_egp')
    o['saudi_made'] = o['made_in_uae'] = o.get('made_in_egypt')
offers = [o for o in offers if o.get('price_egp')]
open(B + 'data/offers.js', 'w', encoding='utf-8').write('/* Current retail offers in Egyptian stores (public offer pages/leaflets; checked 2026-11-17). Prices in EGP. */\nwindow.MIGOFFERS=' + J(offers) + ';\n')
# ---------- projects.js ----------
STG = ["التخطيط", "التصميم", "طرح العقود", "الترسية", "التنفيذ", "التشطيبات", "مكتمل"]
STGMAP = {'مخطط': 0, 'تخطيط': 0, 'تصميم': 1, 'ترسية': 3, 'تنفيذ': 4, 'قيد التنفيذ': 4, 'مكتمل': 6}
PROG = [0, 5, 10, 15, 45, 85, 100]
SECT = ["سكني", "تجاري", "بنية تحتية", "صناعي", "صحي", "تعليمي", "ضيافة وسياحة", "طاقة ومياه"]
# research sector labels -> site sectors: factories/industrial complexes, energy & water plants, tourism/culture, mixed-use/offices, housing; transport/ports stay infrastructure
def sector(a):
    if a in SECT: return a
    for keys, x in ((('صناعات', 'صناعة'), 'صناعي'), (('طاقة', 'مياه', 'كهرباء'), 'طاقة ومياه'), (('كيماويات', 'حديد وصلب', 'أسمدة', 'تكرير', 'غزل', 'ملابس', 'أجهزة', 'سبائك', 'مجمعات صناعية'), 'صناعي'),
                    (('سياحة', 'ضيافة', 'ثقافة'), 'ضيافة وسياحة'), (('متعدد', 'مبان', 'عمراني'), 'تجاري'), (('عقاري', 'سكني'), 'سكني')):
        if any(k in a for k in keys): return x
    return 'بنية تحتية'
prj = load('projects')
rows = []
for i, p in enumerate(prj):
    sa = p.get('stage_ar') or ''
    st = STG.index(sa) if sa in STG else next((v for k, v in STGMAP.items() if k in sa), 4)
    sec = sector(p.get('sector_ar') or '')
    val = p.get('value_egp_million')
    mats = [[m, '—', '', 'مفتوح'] for m in (p.get('key_materials_ar') or [])][:5]
    rows.append(['r%03d' % (i + 1), p['name_ar'], REGN.get(p.get('region_code'), 'جمهورية مصر العربية'), p.get('city', ''), sec, st, val,
                 p.get('owner_ar') or '—', p.get('main_contractor_ar') or 'لم يُعلن', p.get('consultant_ar') or 'لم يُعلن',
                 str(p.get('start_year') or ''), str(p.get('expected_completion') or ''), PROG[st], mats,
                 [[p.get('source_date') or '', p.get('summary_ar', '')]], p.get('source_url', ''),
                 ('img/prj/r%03d.jpg' % (i + 1)) if os.path.exists(B + 'img/prj/r%03d.jpg' % (i + 1)) else ('img/gov/gv-%s.jpg' % p.get('region_code') if p.get('region_code') and os.path.exists(B + 'img/gov/gv-%s.jpg' % p.get('region_code')) else 'img/m1.jpg')])
# leads: material supply requests derived from real projects' key materials (quantities not published -> «حسب جدول الكميات»)
leads, k = [], 201
for r in rows:
    if r[5] >= 6: continue
    for m in r[13][:2]:
        typ = 'contractor' if r[8] != 'لم يُعلن' else 'consultant' if r[9] != 'لم يُعلن' else 'owner'   # consultant leads only where a consultant is announced
        who = r[8] if typ == 'contractor' else r[9] if typ == 'consultant' else r[7]
        leads.append(['L%d' % k, typ, who, r[0], m[0], 'حسب جدول الكميات', '', r[2], 30, 'غير معلنة', 'بند توريد متوقع للمشروع وفق المرحلة المعلنة؛ تُطلب الكميات من المقاول أو الاستشاري.'])
        k += 1
    if len(leads) >= 40: break
# consultant leads: every open project whose consultant is announced (the consultant writes the material specifications)
for r in rows:
    if r[5] >= 6 or r[9] == 'لم يُعلن' or any(l[3] == r[0] and l[1] == 'consultant' for l in leads): continue
    for m in r[13][:2]:
        leads.append(['L%d' % k, 'consultant', r[9], r[0], m[0], 'حسب جدول الكميات', '', r[2], 30, 'غير معلنة', 'بند توريد متوقع للمشروع وفق المرحلة المعلنة؛ تُطلب الكميات من المقاول أو الاستشاري.'])
        k += 1
s = open(B + 'data/projects.js', encoding='utf-8').read()
s = re.sub(r'MIG\.REGIONS = \[.*?\];', 'MIG.REGIONS = ' + J([REGN[c] for c in EMN]) + ';', s, count=1, flags=re.S)
s = re.sub(r'\nMIG\.PROJECTS = \[.*?\n\];', '\nMIG.PROJECTS = [];', s, count=1, flags=re.S)
s = re.sub(r'\nMIG\.PROJECTS_REAL = .*?;\n', '\nMIG.PROJECTS_REAL = ' + J(rows) + ';\n', s, count=1, flags=re.S)
s = '\n'.join(('MIG.LEADS = ' + J(leads) + ';') if ln.startswith('MIG.LEADS = ') else ln for ln in s.split('\n'))
s = re.sub(r'\nMIG\.NEWS = \[.*?\n\];', '\nMIG.NEWS = [];', s, count=1, flags=re.S)
s = s.replace('if (MIG.PROJECTS_REAL && MIG.PROJECTS_REAL.length) {\n  MIG.LEADS.forEach', 'if (MIG.PROJECTS_REAL && MIG.PROJECTS_REAL.length) {\n  if (0) MIG.LEADS.forEach')
open(B + 'data/projects.js', 'w', encoding='utf-8').write(s)
# ---------- registry.js ----------
FAC = load('factories')
comp = [['c%d' % (i + 1), f['name_ar'], 'تصنيع وتوريد', EMN.get(f.get('region_code'), ''), '—', '، '.join((f.get('main_products_ar') or [])[:3]), f.get('source_url', '')] for i, f in enumerate(FAC)]
ag = collections.Counter()
for t in tenders:
    if t.get('entity_ar'): ag[(t['entity_ar'], t.get('region_code') or '')] += 1
try:
    ot = json.loads(open(B + 'data/oldtend.js', encoding='utf-8').read().split('=', 1)[1].strip().rstrip(';'))
    for t in ot: ag[(t[4], t[10] or '')] += 1
except Exception: pass
# one record per entity (its most frequent governorate); no placeholder names
AGN = collections.Counter(); AGR = {}
for (n, c), k in ag.most_common():
    n = (n or '').strip()
    if not n or n in ('جهة حكومية', 'جهة غير معلنة'): continue
    AGN[n] += k; AGR.setdefault(n, c)
# agency record: [id, name, sector, governorate (bare name, as MIGREG.name gives it), type, role]; sector and type from the name
# (the same rules as REG.agSector / REG.agType in data/registry.js, which classify the award-derived records at runtime)
AG_SECTOR = [(r'مستشف|طبي|الطبية|الدواء|صح[ةه]', 'صحة'), (r'مياه|صرف صحي|الصرف الصحي', 'مياه وصرف صحي'), (r'كهرباء|طاق[ةه]', 'كهرباء وطاقة'),
             (r'بترول|غاز', 'بترول وغاز'), (r'طيران|ميناء|مطار|سكك|سك[ةه] حديد|أنفاق|موانئ|نقل', 'نقل وطيران'), (r'جامع[ةه]|مدارس|مدرس[ةه]|تعليم', 'تعليم'),
             (r'^محافظ[ةه]|مجلس مدين[ةه]', 'إدارة محلية'), (r'مطاحن|سكر|أسمد[ةه]|صناع|تصنيع|طروق|ورق|موبكو', 'صناعة'),
             (r'منطق[ةه] الاقتصادي[ةه]|استثمار', 'مناطق اقتصادية'), (r'إعلام|الإعلامي', 'إعلام'), (r'مجلس الوزراء|وزار[ةه]', 'حكومة مركزية'),
             (r'تطوير|العمراني|الديار|^مدن ', 'تطوير عمراني'), (r'بنك', 'بنوك')]
AG_TYPE = [(r'^محافظ[ةه]', 'محافظة'), (r'مستشف', 'مستشفى'), (r'^(ال)?مركز.*طبي', 'مركز طبي'), (r'جامع[ةه]', 'جامعة'), (r'^(ال)?هيئ[ةه]', 'هيئة'),
           (r'^(ال)?مركز', 'مركز حكومي'), (r'شرك[ةه]|القابض[ةه]|موبكو', 'شركة حكومية')]
def ag_class(n, rules, other):
    return next((v for k, v in rules if re.search(k, n)), other)
agencies = [['a%d' % (i + 1), n, ag_class(n, AG_SECTOR, 'أخرى'), EMN.get(AGR[n], 'جمهورية مصر العربية'), ag_class(n, AG_TYPE, 'جهة حكومية'), 'جهة طارحة'] for i, (n, _) in enumerate(AGN.most_common(60))]
r = open(B + 'data/registry.js', encoding='utf-8').read()
head = '/* Contractors/suppliers, purchasing entities and contract awards — Egypt. Companies: real Egyptian manufacturers (sourced); agencies: entities with published tenders on the platform; awards: researched official awards (prepended at runtime). */\nwindow.REG = {\n companies: ' + J(comp) + ',\n agencies: ' + J(agencies) + ',\n awards: []\n};\n'
tail = r[r.index('REG.c = function'):]

open(B + 'data/registry.js', 'w', encoding='utf-8').write(head + tail)
print('news', len(news), sum(1 for n in news if n['image_file']), 'events', len(events), sum(1 for e in events if e['image_file']), 'market', len(market), 'awards', len(awards),
      'tenders', len(tenders), 'intl', len(intl), 'offers', len(offers), sum(1 for o in offers if o['img']), 'projects', len(rows), 'leads', len(leads), 'companies', len(comp), 'agencies', len(agencies))

# ---------- zones.js / factories.js / videos.js ----------
zones = load('zones')
if zones: open(B + 'data/zones.js', 'w', encoding='utf-8').write('/* Egyptian industrial zones, new industrial cities, free zones and SCZone (public sources). */\nwindow.MIGZONES=' + J(zones) + ';\n')
fac = load('factories')
if fac: open(B + 'data/factories.js', 'w', encoding='utf-8').write('/* Real Egyptian manufacturers by governorate (public company information + source URL). */\nwindow.MIGFAC=' + J([{k: f.get(k, '') for k in ['name_ar', 'name_en', 'city', 'region_code', 'sector_ar', 'main_products_ar', 'website', 'source_url']} for f in fac]) + ';\n')
vids = load('videos')
for v in vids: v['thumb'] = 'img/yt/%s.jpg' % v['id']
vids = [v for v in vids if os.path.exists(B + v['thumb'])]
vids.sort(key=lambda v: v.get('date') or '0000', reverse=True)
open(B + 'data/videos.js', 'w', encoding='utf-8').write('/* Real YouTube videos about Egyptian industry & economy (official and news channels; verified via oEmbed). */\nwindow.MIGVIDS=' + J(vids) + ';\n')
govs = load('governorates')
print('zones', len(zones), 'factories', len(fac), 'videos', len(vids), 'gov imgs', sum(1 for g in govs if os.path.exists(B + 'img/gov/gv-%s.jpg' % g.get('code'))))
