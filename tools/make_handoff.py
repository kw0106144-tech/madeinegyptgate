# Build the developer hand-off package: public/ (deployable static front-end), source/ (generator), migration/ (clean data + redirect map)
import os, shutil, json, re, csv, glob, urllib.parse
B = '/home/user/madeinegyptgate/'
LIVE = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/live/'
OUT = B + 'handoff/'
if os.path.isdir(OUT): shutil.rmtree(OUT)
os.makedirs(OUT + 'public/data'); os.makedirs(OUT + 'source/tools'); os.makedirs(OUT + 'migration')
# ---- public
for f in os.listdir(B + 'site'):
    p = B + 'site/' + f
    if os.path.islink(p) or os.path.isdir(p): continue
    if f == 'index.html': continue
    shutil.copy(p, OUT + 'public/' + f)
shutil.copy(B + 'site/home.html', OUT + 'public/index.html')  # full HTML document for production
for f in os.listdir(B + 'data'):
    p = B + 'data/' + f
    if f.endswith('.js') and not os.path.islink(p): shutil.copy(p, OUT + 'public/data/' + f)
shutil.copytree(B + 'img', OUT + 'public/img', symlinks=False)
shutil.copytree(B + 'media', OUT + 'public/media', symlinks=False)
# ---- source
for f in glob.glob(B + '*.part.py') + glob.glob(B + '*.part.html') + [B + 'site.py']:
    shutil.copy(f, OUT + 'source/')
for f in glob.glob(B + 'tools/*.py'):
    if not f.endswith('make_handoff.py'): shutil.copy(f, OUT + 'source/tools/')
# ---- migration: clean JSON exports
def load(js, var):
    s = open(B + 'data/' + js, encoding='utf-8').read(); i = s.index('window.' + var + '=') + len('window.' + var + '=')
    return json.loads(s[i:].strip().rstrip(';'))
fac = [dict(zip(['name', 'sector', 'location', 'type', 'verified', 'logo_sheet', 'logo_cell', 'old_url'], x)) for x in load('oldfac.js', 'MIGOLDFAC')]
prod = [dict(zip(['name', 'description', 'category', 'image_sheet', 'image_cell', 'old_url'], x)) for x in load('oldprod.js', 'MIGOLDP')]
ten = [dict(zip(['ref', 'type', 'status', 'title', 'authority', 'address', 'activity', 'booklet_fee_sar', 'initial_guarantee', 'deadline', 'region', 'old_url'], x)) for x in load('oldtend.js', 'MIGTEND')]
rfq = [dict(zip(['request_no', 'date', 'title', 'details', 'delivery', 'quantity', 'deadline', 'region', 'old_url'], x)) for x in load('oldrfq.js', 'MIGRFQ')]
for n, d in [('factories', fac), ('products', prod), ('tenders', ten), ('rfqs', rfq)]:
    json.dump(d, open(OUT + 'migration/%s.json' % n, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# ---- redirect map from the old site's sitemaps
REG = [('RUH', 'الرياض|الخرج'), ('MAK', 'مكة|جدة|الطائف|رابغ'), ('MAD', 'المدينة|ينبع'), ('EAS', 'الدمام|الجبيل|الأحساء|الخبر|الشرقية'), ('QAS', 'القصيم|بريدة|عنيزة'), ('ASR', 'عسير|أبها|خميس'), ('TAB', 'تبوك'), ('HAI', 'حائل'), ('NBR', 'عرعر|الحدود'), ('JAZ', 'جازان'), ('NAJ', 'نجران'), ('BAH', 'الباحة'), ('JOU', 'الجوف|سكاكا')]
rows = []
for sm in sorted(glob.glob(LIVE + 'sm_*.xml')):
    for u in re.findall(r'<loc>([^<]+)</loc>', open(sm, encoding='utf-8').read()):
        path = urllib.parse.urlparse(u).path; dec = urllib.parse.unquote(path)
        seg = path.strip('/').split('/')
        typ = seg[0] if seg else ''
        if len(seg) == 1:
            tgt = {'factories': '/factories.html', 'industrial_products': '/market.html', 'tender-item': '/tenders.html', 'industrial-rfqs': '/rfqs.html'}.get(typ, '/')
        elif typ == 'factories': tgt = '/factories.html'
        elif typ == 'industrial_products': tgt = '/market.html'
        elif typ == 'tender-item': tgt = '/tenders.html'
        elif typ == 'industrial-rfqs': tgt = '/rfqs.html'
        elif typ == 'industrial_city':
            code = next((c for c, rx in REG if re.search(rx, dec)), '')
            tgt = '/region.html#' + code if code else '/cities.html'
        elif typ == 'industry_sector': tgt = '/factories.html'
        else: tgt = '/factories.html'
        rows.append([path, dec, typ, tgt])
with open(OUT + 'migration/redirects.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(['old_path', 'old_path_decoded', 'old_type', 'fallback_target_301']); w.writerows(rows)
# production: hide the package preview switcher
pj = OUT + 'public/data/plan.js'; t = open(pj, encoding='utf-8').read()
assert t.count('if (hidden) return;') == 1
open(pj, 'w', encoding='utf-8').write(t.replace('if (hidden) return;', 'return; /* production: preview switcher disabled */'))
shutil.copy(B + 'tools/DEVELOPER-GUIDE.md', OUT + 'DEVELOPER-GUIDE.md')
print('redirect rows', len(rows), 'factories', len(fac), 'products', len(prod), 'tenders', len(ten), 'rfqs', len(rfq))
