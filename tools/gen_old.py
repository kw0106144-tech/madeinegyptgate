# Build data/oldfac.js from the platform's current (old) site export: member factories + logos (sprite sheets in img/old)
import json, re, sys
L = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/live/'
F = json.load(open(L + 'factories_raw.json', encoding='utf-8'))
POS = json.load(open(L + 'factories_pos.json'))
SEC = [
 ('Electrical Cables', 'الكهرباء والكابلات'), ('Electrical & Power', 'الكهرباء والكابلات'), ('Food', 'الصناعات الغذائية'), ('Agricultural', 'الصناعات الغذائية'),
 ('Chemical', 'البتروكيماويات والكيماويات'), ('Detergents', 'البتروكيماويات والكيماويات'), ('HVAC', 'التكييف والتهوية'), ('Electronics', 'الإلكترونيات'),
 ('Furniture', 'الأثاث'), ('Plastic', 'البلاستيك والتغليف'), ('Lighting', 'الإنارة'), ('Metal', 'المعادن والألمنيوم'), ('Steel', 'الحديد والصلب'),
 ('Gypsum', 'مواد البناء'), ('Construction', 'مواد البناء'), ('CONSTRUCTIONS', 'مواد البناء'), ('Ceramic', 'مواد البناء'), ('Manufacture of Materials', 'مواد البناء'),
 ('Paper', 'الورق والطباعة'), ('Printing', 'الورق والطباعة'), ('Stationery', 'الورق والطباعة'), ('Machinery', 'الآلات والمعدات'), ('Automation', 'الآلات والمعدات'),
 ('Valves', 'الأنابيب والصمامات'), ('Pipes', 'الأنابيب والصمامات'), ('Pharmaceutical', 'الأدوية'), ('Cosmetics', 'مستحضرات التجميل'), ('Apparel', 'الملابس والنسيج'),
 ('Wood', 'الأخشاب'), ('Oil Gas', 'النفط والغاز'), ('Glass', 'الزجاج'), ('Automotive', 'قطع غيار السيارات'), ('Water Treatment', 'معالجة المياه'),
 ('Recycling', 'إعادة التدوير'), ('Waste', 'إعادة التدوير'), ('Heavy Industries', 'الصناعات الثقيلة'), ('Light Industries', 'الصناعات الخفيفة'),
]
SKIP = ('Insurance', 'Banking')
def sector(s):
    if re.search('[؀-ۿ]', s): return 'الصناعات الغذائية' if 'وجبات' in s or 'تمور' in s else ('البلاستيك والتغليف' if 'بلاستيك' in s else ('الزجاج' if 'زجاج' in s else ('النفط والغاز' if 'النفط' in s else ('الأجهزة الكهربائية' if 'سخانات' in s else 'منتجات صناعية'))))
    for k, v in SEC:
        if k in s: return v
    return 'منتجات صناعية'
out = []
for i, f in enumerate(F):
    info = f.get('info') or ['']
    cat = info[0] if info else ''
    if any(x in cat for x in SKIP): continue
    name = re.sub(r'\s+', ' ', f['name']).strip()
    if not name: continue
    sec = sector(cat)
    p = POS.get(str(i))
    out.append([name, sec, f['location'].strip() or 'جمهورية مصر العربية', 'مصنع' if 'مصنع' in f['entity'] else 'شركة ومورد', 1 if 'معتمد' in f['entity'] else 0, p[0] if p else -1, p[1] if p else -1, f['url']])
open('/home/user/madeinegyptgate/data/oldfac.js', 'w', encoding='utf-8').write('/* Member factories & suppliers imported from the platform\'s current site (name, sector, location, type, verified, logo sheet, logo cell, url). */\nwindow.MIGOLDFAC=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), 'factories;', sum(1 for o in out if o[5] >= 0), 'with logos')
