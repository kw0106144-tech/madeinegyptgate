# Build the old madeinegyptgate.com data for the Egypt platform: data/oldfac.js, oldprod.js, oldtend.js, oldrfq.js, oldsup.js + sprites img/old/lgN.jpg, prN.jpg
# Optional enrichment (English, sector, industrial flag) from scratchpad/eg/tr/*.json -> data/i18n-old.json
import json, os, re, hashlib, html, urllib.parse
from PIL import Image
S = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/eg/'
B = '/home/user/madeinegyptgate/'
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
def load(p, d=None): return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else d
TR = {}
for f in sorted(os.listdir(S + 'tr')) if os.path.exists(S + 'tr') else []:
    if f.endswith('.json'): TR.update(load(S + 'tr/' + f, {}))
EN = {}
def pair(a, e):
    if a and e and a != e: EN[a.strip()] = e.strip()
GOV = [("CAI","القاهرة"),("GIZ","الجيزة"),("ALX","الإسكندرية"),("QLB","القليوبية"),("SHR","الشرقية"),("DKH","الدقهلية"),("GHR","الغربية"),("MNF","المنوفية"),("BHR","البحيرة"),("KFS","كفر الشيخ"),("DMT","دمياط"),("PTS","بورسعيد"),("ISM","الإسماعيلية"),("SUZ","السويس"),("NSN","شمال سيناء"),("JSN","جنوب سيناء"),("FYM","الفيوم"),("BNS","بني سويف"),("MNY","المنيا"),("AST","أسيوط"),("SHG","سوهاج"),("QNA","قنا"),("LXR","الأقصر"),("ASN","أسوان"),("BBA","البحر الأحمر"),("WAD","الوادي الجديد"),("MTR","مطروح")]
GN = dict(GOV)
ALIAS = {'الاسكندرية':'ALX','الاسماعيلية':'ISM','البحر الاحمر':'BBA','الاقصر':'LXR','اسوان':'ASN','اسيوط':'AST','السادس من أكتوبر':'GIZ','العاشر من رمضان':'SHR','السادات':'MNF','العبور':'QLB','بدر الصناعيه':'CAI','الروبيكي':'CAI','الظاهر - القاهرة':'CAI','طنطا':'GHR','الدلتا':'GHR','مرسى مطروح':'MTR','غيار':''}
def gcode(loc):
    loc = (loc or '').strip()
    for c, n in GOV:
        if n == loc or n.replace('أ', 'ا').replace('إ', 'ا') == loc.replace('أ', 'ا').replace('إ', 'ا'): return c
    return ALIAS.get(loc, '')
def sheet(paths, cell, prefix, bg='white'):
    """paths: list of local files (or None). returns {index: (sheet, cell)}"""
    out = {}; k = 0; sh = None; n = 0
    for i, p in enumerate(paths):
        if not p or not os.path.exists(p): continue
        try: im = Image.open(p).convert('RGBA')
        except Exception: continue
        if n % 100 == 0:
            if sh: sh.convert('RGB').save(B + 'img/old/%s%d.jpg' % (prefix, k - 1), quality=82)
            sh = Image.new('RGBA', (cell * 10, cell * 10), bg); k += 1
        c = n % 100; im.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        tile = Image.new('RGBA', (cell, cell), bg); tile.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2), im)
        sh.paste(tile, ((c % 10) * cell, (c // 10) * cell)); out[i] = (k - 1, c); n += 1
    if sh: sh.convert('RGB').save(B + 'img/old/%s%d.jpg' % (prefix, k - 1), quality=82)
    return out
# ---------- factories ----------
F = load(S + 'live/factories_top.json', [])
lp = [S + 'dl/lg/' + hashlib.md5(f['logo'].encode()).hexdigest() + '.img' if f['logo'] and 'unsplash' not in f['logo'] else None for f in F]
LG = sheet(lp, 96, 'lg')
P = load(S + 'live/products.json', [])
pp = [S + 'dl/pr/' + hashlib.md5(p['img'].encode()).hexdigest() + '.img' for p in P]
PR = sheet(pp, 160, 'pr')
fidx = {f['url']: i for i, f in enumerate(F)}
prods_by = {}
for p in P: prods_by.setdefault(p['fac_url'], []).append(p['name'])
fac = []
for i, f in enumerate(F):
    t = TR.get('fac:' + f['url'], {})
    sec = f['sector'] if f['sector'] and f['sector'] != 'قطاع صناعي معتمد' and '#VALUE' not in f['sector'] else (t.get('sector_ar') or 'منتجات صناعية')
    code = gcode(f['loc'])
    loc = GN.get(code, '') if code else 'جمهورية مصر العربية'
    if f['loc'] in ('السادس من أكتوبر', 'العاشر من رمضان', 'السادات', 'العبور', 'بدر الصناعيه', 'الروبيكي'): loc = f['loc'].replace('الصناعيه', 'الصناعية') + '، ' + GN[code]
    typ = 'مصنع' if 'مصنع' in f['type'] else 'شركة ومورد'
    lg = LG.get(i, (-1, -1))
    desc = re.sub(r'\s+', ' ', f['desc'] or '').strip()
    if len(desc) > 420: desc = desc[:420].rsplit(' ', 1)[0] + '…'
    fac.append([f['name'], sec, loc, typ, 0, lg[0], lg[1], urllib.parse.unquote(f['url']), desc, prods_by.get(f['url'], [])[:6], code])
    pair(f['name'], t.get('name_en')); pair(desc, t.get('desc_en')); pair(sec, t.get('sector_en'))
open(B + 'data/oldfac.js', 'w', encoding='utf-8').write("/* Member factories & companies from the platform's current site (top 3,000 by completeness): name, sector, location, type, verified, logo sheet, logo cell, url, description, products, governorate. */\nwindow.MIGOLDFAC=" + J(fac) + ';\n')
# ---------- products ----------
CATK = [('غذائ|أغذية|حاصلات|زراع|بذور|توابل|بهارات|ألبان|مشروب', 'food'), ('بناء|إنشاء|انشاء|رخام|جرانيت|سيراميك|أسمنت|اسمنت|طوب|أرضيات', 'build'), ('بلاستيك|تغليف|ورق|كرتون|طباعة', 'plastic'),
        ('كهرب|كابل|إضاءة|اضاءة|إلكترون|تكييف|تبريد', 'elec'), ('زجاج', 'glass'), ('معدن|حديد|صلب|ألومنيوم|الومنيوم|هندسي|ماكينات|معدات', 'metal'), ('كيمي|كيماو|بترو|دهان|أسمدة|اسمدة', 'petro'),
        ('دواء|أدوية|ادوية|طبي|طبية', 'med'), ('أثاث|اثاث|خشب', 'furn'), ('تجميل|منظفات', 'cosm')]
def cat(s):
    for rx, c in CATK:
        if re.search(rx, s or ''): return c
    return 'other'
prod = []; p2f = []
for i, p in enumerate(P):
    t = TR.get('prod:' + p['url'], {})
    fi = fidx.get(p['fac_url'])
    fsec = F[fi]['sector'] if fi is not None else ''
    c = t.get('cat') or cat(fsec + ' ' + p['name'])
    sp = PR.get(i, (-1, -1))
    desc = ('من إنتاج ' + p['fac']) if p['fac'] else ''
    prod.append([p['name'], desc, c, sp[0], sp[1], urllib.parse.unquote(p['url'])]); p2f.append(urllib.parse.unquote(p['fac_url']))
    pair(p['name'], t.get('name_en'))
open(B + 'data/oldprod.js', 'w', encoding='utf-8').write("/* Products listed by members on the platform (name, description, category, image sheet, image cell, url). */\nwindow.MIGOLDP=" + J(prod) + ";\n/* factory page (old site url) of each product, same order as MIGOLDP */\nwindow.MIGP2F=" + J(p2f) + ';\n')
# ---------- tenders (2026 industrial) ----------
T = load(S + 'live/tenders_raw.json', [])
tend = []
for r in T:
    t = TR.get('ten:' + r['url'], {})
    if t and t.get('industrial') is False: continue
    m = re.search(r'العودة لقائمة المناقصات الحكومية\s+(\S+)\s+(ممارسة عامة|مناقصة عامة|مناقصة محدودة|ممارسة محدودة|مزايدة عامة|اتفاق مباشر|مناقصة|ممارسة|طلب عرض أسعار)?', r['text'])
    ref = m.group(1) if m else ''
    typ = (m.group(2) if m and m.group(2) else 'مناقصة')
    title = r['h1'] or (t.get('title_ar') or '')
    if not title: continue
    tend.append([ref, typ, 'سارية', title, t.get('entity_ar') or 'جهة حكومية', '', t.get('sector_ar') or 'المواد والمنتجات الصناعية', '', '', '', '', r['url']])
    pair(title, t.get('title_en')); pair(t.get('sector_ar'), t.get('sector_en'))
for a, e in [('ممارسة عامة', 'Public practice (limited bidding)'), ('مناقصة عامة', 'Public tender'), ('مناقصة محدودة', 'Limited tender'), ('مزايدة عامة', 'Public auction'), ('مناقصة', 'Tender'), ('سارية', 'Open'), ('جهة حكومية', 'Government entity')]: pair(a, e)
open(B + 'data/oldtend.js', 'w', encoding='utf-8').write("/* 2026 tenders published on the platform (ref,type,status,title,entity,governorate name,sector,booklet,bond,deadline,governorate code,source url) */\nwindow.MIGTEND=" + J(tend) + ';\n')
# ---------- RFQs ----------
R = load(S + 'live/rfq.json', [])
rfq = []
for r in R:
    t = TR.get('rfq:' + r['url'], {})
    m = re.search(r'(RFQ-\d{4}-\d+)', r['title'])
    rfq.append([m.group(1) if m else str(r['id']), r['date'][:10], r['title'], r.get('content', '')[:300], '', '', '', '', r['url'], t.get('sector_ar') or 'المواد والمنتجات الصناعية'])
    pair(r['title'], t.get('title_en'))
open(B + 'data/oldrfq.js', 'w', encoding='utf-8').write("/* RFQs received on the platform (contacts removed): no,date,title,details,delivery,qty,deadline,governorate code,url,sector */\nwindow.MIGRFQ=" + J(rfq) + ';\n')
open(B + 'data/oldsup.js', 'w', encoding='utf-8').write("/* Supporting entities listed on the platform. */\nwindow.MIGSUP=[];\n")
json.dump(EN, open(B + 'data/i18n-old.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('factories', len(fac), 'logos', len(LG), 'products', len(prod), 'pimgs', len(PR), 'tenders', len(tend), 'rfqs', len(rfq), 'en pairs', len(EN))
