# Build data/oldprod.js: products listed on the platform's current site (name, short description, category, image sprite sheet/cell, url)
import json, re, sys
L = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/live/'
P = json.load(open(L + 'products_raw.json', encoding='utf-8'))
POS = json.load(open(L + 'products_pos.json'))
RULES = [
 ('glass', r'زجاج|glass'),
 ('med', r'طبي|دواء|أدوية|wheelchair|medical|pharma|syringe|كمام|surgical|hospital'),
 ('furn', r'أثاث|furniture|chair|desk|كرسي|طاولة|sofa|كنب|خزان[ةه] ملابس|cabinet'),
 ('plastic', r'بلاستيك|PVC|PPR|HDPE|UPVC|polypropylene|polyethylene|جلب[ةه]|نقاص|قسام|كوع|شد وصل|socket|elbow|\btee\b|reducer|pipe|مواسير|ماسور|تغليف|packag|film|عبو[ةا]|كيس|أكياس|bag|bottle|tape|شريط'),
 ('elec', r'كابل|cable|LED|إضاء|انار|إنار|lighting|light|fan coil|duct|مجاري الهواء|HVAC|تكييف|مكيف|air condition|chiller|solar|شمسي|panel|switch|سخان|heater|transformer|محول|كهرب|electric|motor|pump|مضخ'),
 ('metal', r'steel|حديد|ألمنيوم|الومنيوم|aluminum|aluminium|rebar|metal|معدن|نحاس|copper|صاج|sheet|beam|wire|سلك|أسلاك|bolt|مسامير'),
 ('petro', r'chemical|كيماو|adipate|thinner|lacquer|solvent|resin|polymer|بوليمر|راتنج|مذيب|اسفلت|asphalt|lubricant|زيوت محركات|grease|plasticizer|DOP|DOA|paint|دهان|طلاء|coating|adhesive|لاصق|epoxy'),
 ('food', r'زيت|جبن|جبن[ةه]|أرز|رز|عصير|تمر|تمور|حليب|ألبان|مياه|ماء|food|juice|كاتشب|مكسرات|قهو[ةه]|شاي|سكر|دقيق|بهارات|توابل|عسل|مربى|معكرون|خبز|لحوم|دجاج|ورق عنب|صلص[ةه]|خل|بسكويت|شوكولات|حلويات|snack|dates|honey|water'),
 ('build', r'plaster|جبس|gypsum|cement|أسمنت|اسمنت|بلوك|block|headwall|wall|tile|بلاط|سيراميك|ceramic|رخام|granite|marble|عزل|insulat|خرسان|concrete|طوب|brick|بناء|construction|roof|سقف|door|باب|window|نافذ'),
]
SKIP = {'العلامات التجارية', 'عالم الكمبيوتر والألعاب', 'Solar Solutions', 'منتجاتنا', 'المنتجات', 'Products'}
def cat(t):
    for c, rx in RULES:
        if re.search(rx, t, re.I): return c
    return 'other'
out = []
for i, p in enumerate(P):
    n = re.sub(r'\s+', ' ', p.get('name') or '').strip()
    if len(n) < 4 or n in SKIP: continue
    d = re.sub(r'\s+', ' ', p.get('desc') or '').strip()
    if d == n: d = ''
    pos = POS.get(str(i))
    out.append([n, d[:220], cat(n + ' ' + d), pos[0] if pos else -1, pos[1] if pos else -1, p['url']])
import collections
print(len(out), collections.Counter(o[2] for o in out).most_common(), sum(1 for o in out if o[3] >= 0), 'with images')
open('/home/user/madeinegyptgate/data/oldprod.js', 'w', encoding='utf-8').write('/* Products listed by members on the platform (name, description, category, image sheet, image cell, url). */\nwindow.MIGOLDP=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
