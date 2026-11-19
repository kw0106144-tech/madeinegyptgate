# Build UAE data files from the researched JSON (every item keeps its source URL):
# data/real.js (news, events, market, awards, tenders, tenders_intl), data/offers.js, data/projects.js (real projects + leads + news),
# data/registry.js (companies/agencies; real awards are prepended at runtime), and copies research images into img/.
import json, os, re, shutil, collections
S = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/uae/'
R = S + 'real/'
B = '/home/user/madeinegyptgate/'
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
def load(n, d=None):
    p = R + n + '.json'
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else (d if d is not None else [])
EMN = {'AUH': 'أبوظبي', 'DXB': 'دبي', 'SHJ': 'الشارقة', 'AJM': 'عجمان', 'UAQ': 'أم القيوين', 'RAK': 'رأس الخيمة', 'FUJ': 'الفجيرة'}
REGN = {k: 'إمارة ' + v for k, v in EMN.items()}
# ---------- images ----------
for sub in ('news', 'events', 'offers', 'cities'):
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
# old platform news (2026 only), translated; image files saved to img/onews/<id>.jpg
import glob as _g
_NT = {}
for _f in _g.glob(S + 'tr/out_news*.json'): _NT.update(json.load(open(_f, encoding='utf-8')))
_NEN = {}
_P = json.load(open(S + 'live/posts_raw.json', encoding='utf-8')) if os.path.exists(S + 'live/posts_raw.json') else []
for _n in _P:
    if _n['date'] < '2026-01-01': continue
    _t = _NT.get(str(_n['id']))
    if not _t: continue
    news.append({'title_ar': _t['title_ar'], 'summary_ar': _t.get('summary_ar', ''), 'source_name': 'منصة صنع في مصر', 'date': _n['date'], 'category_ar': _t.get('category') or 'اقتصاد',
                 'region_code': _t.get('emirate') or None, 'url': _n['url'], 'image_file': img_if('img/onews/%d.jpg' % _n['id'])})
    _NEN[_t['title_ar']] = _n['title']; _NEN[_t.get('summary_ar', '')] = _t.get('summary_en', '')
news.sort(key=lambda n: n.get('date') or '', reverse=True)
json.dump({k: v for k, v in _NEN.items() if k and v}, open(B + 'data/i18n-news.json', 'w', encoding='utf-8'), ensure_ascii=False)
events = load('events')
for e in events:
    f = e.get('image_file') or ''
    e['image_file'] = img_if('img/events/' + os.path.basename(f)) if f else ''
market = load('market')
awards = load('awards')
for a in awards: a['value_sar_million'] = a.get('value_aed_million')   # pages read value_*; amounts are EGP
tenders = load('tenders')
for t in tenders: t.setdefault('estimated_value_sar', t.get('estimated_value_aed'))
# extra 2026 industrial tenders per emirate (if collected)
for f in ('tenders_auh', 'tenders_dxb', 'tenders_shj_ajm', 'tenders_north', 'tenders_fed'):
    for t in load(f):
        t.setdefault('estimated_value_sar', t.get('estimated_value_aed')); tenders.append(t)
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
open(B + 'data/real.js', 'w', encoding='utf-8').write('/* Researched public UAE data (news, events, ADX/DFM closes, contract awards, tenders) — every item has its source URL. Amounts in EGP. */\nwindow.REAL=' + J(real) + ';\n')
# merge official tenders into the tenders page list (MIGTEND), newest/open first, with English originals for i18n
_ot = open(B + 'data/oldtend.js', encoding='utf-8').read()
_rows = json.loads(_ot.split('=', 1)[1].strip().rstrip(';'))
_rows = [r for r in _rows if not str(r[0]).startswith('OFF:')]
_EN2 = {}
def _st(d):
    if not d: return 'سارية'
    if d < '2026-11-16': return 'منتهية'
    return 'تنتهي قريباً' if d <= '2026-11-23' else 'سارية'
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
for o in offers:
    f = 'img/offers/' + o['id'] + '.jpg'
    o['img'] = f if os.path.exists(B + f) else ''
    o.setdefault('price_sar', o.get('price_aed')); o.setdefault('old_price_sar', o.get('old_price_aed')); o.setdefault('saudi_made', o.get('made_in_uae'))
offers = [o for o in offers if o.get('price_aed')]
open(B + 'data/offers.js', 'w', encoding='utf-8').write('/* Current retail offers in UAE stores (public offer pages/leaflets; checked 2026-11-16). Prices in EGP. */\nwindow.MIGOFFERS=' + J(offers) + ';\n')
# ---------- projects.js ----------
STG = ["التخطيط", "التصميم", "طرح العقود", "الترسية", "التنفيذ", "التشطيبات", "مكتمل"]
STGMAP = {'مخطط': 0, 'تخطيط': 0, 'تصميم': 1, 'ترسية': 3, 'تنفيذ': 4, 'قيد التنفيذ': 4, 'مكتمل': 6}
PROG = [0, 5, 10, 15, 45, 85, 100]
SECT = ["سكني", "تجاري", "بنية تحتية", "صناعي", "صحي", "تعليمي", "ضيافة وسياحة", "طاقة ومياه"]
prj = load('projects')
rows = []
for i, p in enumerate(prj):
    sa = p.get('stage_ar') or ''
    st = STG.index(sa) if sa in STG else next((v for k, v in STGMAP.items() if k in sa), 4)
    sec = p.get('sector_ar') if p.get('sector_ar') in SECT else next((x for x in SECT if x in (p.get('sector_ar') or '')), 'بنية تحتية')
    val = p.get('value_aed_million')
    mats = [[m, '—', '', 'مفتوح'] for m in (p.get('key_materials_ar') or [])][:5]
    rows.append(['r%03d' % (i + 1), p['name_ar'], REGN.get(p.get('region_code'), 'الإمارات'), p.get('city', ''), sec, st, val,
                 p.get('owner_ar') or '—', p.get('main_contractor_ar') or 'لم يُعلن', p.get('consultant_ar') or 'لم يُعلن',
                 str(p.get('start_year') or ''), str(p.get('expected_completion') or ''), PROG[st], mats,
                 [[p.get('source_date') or '', p.get('summary_ar', '')]], p.get('source_url', ''),
                 ('img/prj/r%03d.jpg' % (i + 1)) if os.path.exists(B + 'img/prj/r%03d.jpg' % (i + 1)) else ('img/rg-%s.jpg' % p.get('region_code') if p.get('region_code') else 'img/m1.jpg')])
# leads: material supply requests derived from real projects' key materials (quantities not published -> «حسب جدول الكميات»)
leads, k = [], 201
for r in rows:
    if r[5] >= 6: continue
    for m in r[13][:2]:
        typ = 'contractor' if r[8] != 'لم يُعلن' else 'consultant'
        who = r[8] if r[8] != 'لم يُعلن' else (r[9] if r[9] != 'لم يُعلن' else r[7])
        leads.append(['L%d' % k, typ, who, r[0], m[0], 'حسب جدول الكميات', '', r[2], 30, 'غير معلنة', 'بند توريد متوقع للمشروع وفق المرحلة المعلنة؛ تُطلب الكميات من المقاول أو الاستشاري.'])
        k += 1
    if len(leads) >= 40: break
s = open(B + 'data/projects.js', encoding='utf-8').read()
s = re.sub(r'MIG\.REGIONS = \[.*?\];', 'MIG.REGIONS = ' + J([REGN[c] for c in EMN]) + ';', s, count=1, flags=re.S)
s = re.sub(r'\nMIG\.PROJECTS = \[.*?\n\];', '\nMIG.PROJECTS = [];', s, count=1, flags=re.S)
s = re.sub(r'\nMIG\.PROJECTS_REAL = .*?;\n', '\nMIG.PROJECTS_REAL = ' + J(rows) + ';\n', s, count=1, flags=re.S)
s = re.sub(r'\nMIG\.LEADS = \[.*?\n\];', '\nMIG.LEADS = ' + J(leads) + ';', s, count=1, flags=re.S)
s = re.sub(r'\nMIG\.NEWS = \[.*?\n\];', '\nMIG.NEWS = [];', s, count=1, flags=re.S)
s = s.replace('if (MIG.PROJECTS_REAL && MIG.PROJECTS_REAL.length) {\n  MIG.LEADS.forEach', 'if (MIG.PROJECTS_REAL && MIG.PROJECTS_REAL.length) {\n  if (0) MIG.LEADS.forEach')
open(B + 'data/projects.js', 'w', encoding='utf-8').write(s)
# ---------- registry.js ----------
FAC = load('factories')
comp = [['c%d' % (i + 1), f['name_ar'], 'تصنيع وتوريد', REGN.get(f.get('region_code'), ''), '—', '، '.join((f.get('main_products_ar') or [])[:3]), f.get('source_url', '')] for i, f in enumerate(FAC)]
ag = collections.Counter()
for t in tenders:
    if t.get('entity_ar'): ag[(t['entity_ar'], t.get('region_code') or '')] += 1
try:
    ot = json.loads(open(B + 'data/oldtend.js', encoding='utf-8').read().split('=', 1)[1].strip().rstrip(';'))
    for t in ot: ag[(t[4], t[10] or '')] += 1
except Exception: pass
agencies = [['a%d' % (i + 1), n, 'جهة طارحة', REGN.get(c, 'الإمارات'), 'جهة'] for i, ((n, c), _) in enumerate(ag.most_common(60))]
r = open(B + 'data/registry.js', encoding='utf-8').read()
head = '/* Contractors/suppliers, purchasing entities and contract awards — UAE. Companies: real UAE manufacturers (sourced); agencies: entities with published tenders on the platform; awards: researched official awards (prepended at runtime). */\nwindow.REG = {\n companies: ' + J(comp) + ',\n agencies: ' + J(agencies) + ',\n awards: []\n};\n'
tail = r[r.index('REG.c = function'):]
tail = tail.replace('(a.value_sar_million || 0) * 1e6', '(a.value_aed_million || a.value_sar_million || 0) * 1e6')
open(B + 'data/registry.js', 'w', encoding='utf-8').write(head + tail)
print('news', len(news), sum(1 for n in news if n['image_file']), 'events', len(events), sum(1 for e in events if e['image_file']), 'market', len(market), 'awards', len(awards),
      'tenders', len(tenders), 'intl', len(intl), 'offers', len(offers), sum(1 for o in offers if o['img']), 'projects', len(rows), 'leads', len(leads), 'companies', len(comp), 'agencies', len(agencies))
