# Build the old madeinegyptgate.com data for the UAE platform (Arabic display + English originals for the English version)
# Outputs: data/oldfac.js (MIGOLDFAC), data/oldprod.js (MIGOLDP), data/oldtend.js (MIGTEND), data/oldrfq.js (MIGRFQ), data/oldsup.js (MIGSUP), data/i18n-old.json (ar->en pairs)
import json, re, os, collections
S = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/uae/'
B = '/home/user/madeinegyptgate/'
TODAY = '2026-11-16'
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
def load(p, d=None):
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else d
def merged(prefix):
    out = {}
    for f in sorted(os.listdir(S + 'tr')):
        if f.startswith('out_' + prefix) and f.endswith('.json'): out.update(load(S + 'tr/' + f, {}))
    return out
EMN = {'AUH': 'أبوظبي', 'DXB': 'دبي', 'SHJ': 'الشارقة', 'AJM': 'عجمان', 'UAQ': 'أم القيوين', 'RAK': 'رأس الخيمة', 'FUJ': 'الفجيرة'}
EN = {}   # Arabic display text -> English original (for i18n)
def pair(ar, en):
    if ar and en and ar != en: EN[ar.strip()] = en.strip()
NON_UAE = re.compile(r'federal bank|vera italiana|alessa|arasco|saudi arabian amiantit|amiantit', re.I)
# ---------- factories ----------
F = load(S + 'live/factories_raw.json', []); FT = merged('fac'); FP = load(S + 'live/factories_pos.json', {})
fac = []
for i, r in enumerate(F):
    t = FT.get(str(r['id']))
    if not t or NON_UAE.search(r['title']): continue
    if re.search(r'bank|insurance|banking|مصرف|بنك|تأمين', (t.get('sector_en', '') + t.get('sector_ar', '') + r['title']), re.I) and not t.get('is_factory', True): continue
    em = t.get('emirate', '') if t.get('emirate', '') in EMN else ''
    loc = (t.get('city_ar') or '').strip()
    if em and EMN[em] not in loc: loc = (loc + '، ' if loc else '') + EMN[em]
    loc = loc or 'جمهورية مصر العربية'
    p = FP.get(str(i))
    fac.append([t['name_ar'], t.get('sector_ar') or 'منتجات صناعية', loc, 'مصنع' if t.get('is_factory', True) else 'شركة ومورد', 0,
                p[0] if p else -1, p[1] if p else -1, r['url'], t.get('desc_ar', ''), t.get('products_ar', [])[:4], em])
    pair(t['name_ar'], t.get('name_en') or r['title']); pair(t.get('desc_ar', ''), t.get('desc_en', '')); pair(t.get('sector_ar', ''), t.get('sector_en', ''))
open(B + 'data/oldfac.js', 'w', encoding='utf-8').write("/* Member factories & suppliers from the platform's current site, translated to Arabic: name, sector, location, type, verified, logo sheet, logo cell, url, description, products, emirate. */\nwindow.MIGOLDFAC=" + J(fac) + ';\n')
# ---------- products ----------
P = load(S + 'live/products_raw.json', []); PT = merged('prod'); PP = load(S + 'live/products_pos.json', {})
prod = []
for i, r in enumerate(P):
    t = PT.get(str(r['id']))
    if not t: continue
    p = PP.get(str(i))
    prod.append([t['name_ar'], t.get('desc_ar', ''), t.get('cat') or 'other', p[0] if p else -1, p[1] if p else -1, r['url']])
    pair(t['name_ar'], t.get('name_en') or r['title']); pair(t.get('desc_ar', ''), t.get('desc_en', ''))
open(B + 'data/oldprod.js', 'w', encoding='utf-8').write("/* Products listed by members on the platform (Arabic name, description, category, image sheet, image cell, url). */\nwindow.MIGOLDP=" + J(prod) + ';\n')
# ---------- supporting entities ----------
SU = load(S + 'live/supporting-facilitie_raw.json', []); ST = merged('sup')
sup = []
for r in SU:
    t = ST.get(str(r['id']))
    if not t: continue
    sup.append([t['name_ar'], t.get('type_ar', ''), t.get('desc_ar', ''), r.get('img', ''), r['url']])
    pair(t['name_ar'], t.get('name_en') or r['title']); pair(t.get('desc_ar', ''), t.get('desc_en', '')); pair(t.get('type_ar', ''), '')
open(B + 'data/oldsup.js', 'w', encoding='utf-8').write("/* Supporting entities (banks, holdings, service providers) listed on the platform. */\nwindow.MIGSUP=" + J(sup) + ';\n')
# ---------- tenders & RFQs (2026, industrial only) ----------
C = load(S + 'live/tenders_clean.json', []); IDS = set(load(S + 'live/ind2026_ids.json', []))
TT = merged('ten'); RT = merged('rfq'); PU = load(S + 'tr/out_pur0.json', {})
SECT = [('Medical|Pharma|med\\b', 'المستلزمات الطبية والأدوية', 'Medical & pharmaceutical'), ('Electric|Cable|Power', 'الكهرباء والكابلات', 'Electrical & cables'), ('Electronic|Automation', 'الإلكترونيات والأتمتة', 'Electronics & automation'),
        ('Automotive', 'السيارات وقطع الغيار', 'Automotive & spare parts'), ('Oil|Gas|Petro|Chemical', 'النفط والغاز والكيماويات', 'Oil, gas & chemicals'), ('Metal|Alumin|Steel', 'المعادن والألمنيوم', 'Metals & aluminium'),
        ('Safety', 'معدات السلامة', 'Safety equipment'), ('Glass', 'الزجاج', 'Glass'), ('Textile', 'المنسوجات', 'Textiles'), ('Furniture|wood', 'الأثاث والأخشاب', 'Furniture & wood'), ('Air Cond|steam', 'التكييف والتبريد', 'HVAC'),
        ('Plastic|Paper', 'البلاستيك والورق', 'Plastics & paper'), ('water', 'المياه ومعالجتها', 'Water'), ('Construction|Heavy|Mining', 'مواد البناء والصناعات الثقيلة', 'Construction & heavy industry'),
        ('Machinery|Equipment', 'الآلات والمعدات', 'Machinery & equipment'), ('Material|Product|Light', 'المواد والمنتجات الصناعية', 'Industrial materials & products')]
def sector(cats):
    s = ' '.join(c for c in cats if c != 'RFQs')
    for rx, a, e in SECT:
        if re.search(rx, s, re.I): return a, e
    return 'المواد والمنتجات الصناعية', 'Industrial materials & products'
for rx, a, e in SECT: pair(a, e)
def status(dl):
    if not dl: return 'منتهية'
    if dl < TODAY: return 'منتهية'
    d = (int(dl[:4]) - 2026) * 365 + (int(dl[5:7]) - 11) * 30 + (int(dl[8:10]) - 16)
    return 'تنتهي قريباً' if d <= 7 else 'سارية'
tend, rfq = [], []
for o in C:
    if o['id'] not in IDS: continue
    sa, se = sector(o['cats'])
    if o['kind'] == 'tender':
        t = TT.get(str(o['id']))
        if not t: continue
        pn = re.sub(r'\s+', ' ', o.get('purchaser') or '').strip()
        pu = PU.get(pn, {})
        ent = pu.get('name_ar') or ('جهة حكومية' if not pn else pn)
        em = o.get('emirate') or pu.get('emirate') or ''
        typ = 'تعديل على مناقصة' if (o.get('notice') or '').lower().startswith('corr') or o['title'].lower().startswith('corrigendum') else ('طلب عروض أسعار' if re.search(r'quotation|rfq|request for', o['title'], re.I) else 'مناقصة')
        tend.append([o.get('ref') or '', typ, status(o.get('deadline')), t['title_ar'], ent, EMN.get(em, ''), sa, '', '', o.get('deadline') or '', em, o.get('purchaser_url') or o['url']])
        pair(t['title_ar'], o['title']); pair(ent, pn.title() if pn.isupper() else pn)
    else:
        t = RT.get(str(o['id']))
        if not t: continue
        em = o.get('emirate') or ''
        rfq.append([o.get('ref') or str(o['id']), o['date'], t['title_ar'], t.get('desc_ar', ''), t.get('delivery_ar', ''), t.get('qty_ar', ''), o.get('deadline') or '', em, o['url'], sa])
        pair(t['title_ar'], o['title']); pair(t.get('desc_ar', ''), o.get('desc', ''))
for a, e in [('تعديل على مناقصة', 'Corrigendum'), ('طلب عروض أسعار', 'Request for quotation'), ('مناقصة', 'Tender'), ('سارية', 'Open'), ('تنتهي قريباً', 'Closing soon'), ('منتهية', 'Closed'), ('جهة حكومية', 'Government entity')]: pair(a, e)
tend.sort(key=lambda x: x[9] or '', reverse=True); rfq.sort(key=lambda x: x[1] or '', reverse=True)
open(B + 'data/oldtend.js', 'w', encoding='utf-8').write("/* 2026 industrial tenders published on the platform (official purchaser sources): ref,type,status,title,entity,emirate name,sector,booklet,bond,deadline,emirate code,source url */\nwindow.MIGTEND=" + J(tend) + ';\n')
open(B + 'data/oldrfq.js', 'w', encoding='utf-8').write("/* 2026 industrial RFQs received on the platform (contacts removed): no,date,title,details,delivery,qty,deadline,emirate code,url,sector */\nwindow.MIGRFQ=" + J(rfq) + ';\n')
json.dump(EN, open(B + 'data/i18n-old.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('factories', len(fac), 'products', len(prod), 'supporting', len(sup), 'tenders', len(tend), collections.Counter(t[2] for t in tend), 'rfqs', len(rfq), 'en pairs', len(EN))
print('tenders by emirate', collections.Counter(t[10] or '-' for t in tend).most_common())
