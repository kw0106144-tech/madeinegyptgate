# Build data/oldtend.js and data/oldrfq.js from the platform's current site export (tenders + RFQs), with region split; personal contacts removed.
import json, re, sys
L = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/live/'
CITY = [
 ('RUH', 'الرياض|الخرج|المجمعة|الدوادمي|الزلفي|وادي الدواسر|عفيف|شقراء|حوطة|الأفلاج|سدير|المزاحمية|القويعية|الدرعية|Riyadh'),
 ('MAK', 'مكة|جدة|الطائف|رابغ|القنفذة|الليث|Jeddah|Makkah|Mecca'),
 ('MAD', 'المدينة المنورة|ينبع|العلا|بدر|المدينه المنوره|Madinah|Yanbu'),
 ('EAS', 'الدمام|الخبر|الجبيل|الأحساء|الاحساء|الهفوف|القطيف|حفر الباطن|الظهران|رأس الخير|رأس تنورة|الخفجي|المنطقة الشرقية|Dammam|Jubail|Khobar|Dhahran'),
 ('QAS', 'القصيم|بريدة|عنيزة|الرس'),
 ('ASR', 'عسير|أبها|ابها|خميس مشيط|بيشة|النماص'),
 ('TAB', 'تبوك|نيوم|ضباء|الوجه|NEOM|Tabuk'),
 ('HAI', 'حائل'),
 ('NBR', 'الحدود الشمالية|عرعر|رفحاء|طريف|وعد الشمال'),
 ('JAZ', 'جازان|جيزان|صبيا|أبو عريش'),
 ('NAJ', 'نجران|شرورة'),
 ('BAH', 'الباحة|بلجرشي'),
 ('JOU', 'الجوف|سكاكا|القريات|دومة الجندل'),
]
def region(*texts):
    t = ' '.join(x or '' for x in texts)
    for c, rx in CITY:
        if re.search(rx, t): return c
    return ''
def clean(t):
    t = re.sub(r'[\w.+-]+@[\w-]+\.[\w.]+', '[البريد متاح للأعضاء]', t)
    t = re.sub(r'(\+?966|00966)?[\s-]?0?5\d[\s-]?\d{3}[\s-]?\d{4}', '[الجوال متاح للأعضاء]', t)
    t = re.sub(r'(\+?966|00966)[\s-]?1\d[\s-]?\d{3}[\s-]?\d{4}', '[الهاتف متاح للأعضاء]', t)
    t = re.sub(r'(اسم (المسؤول|الشخص|جهة الاتصال|المرسل)|الشخص المسؤول|المسؤول)\s*[:：]\s*[^.،\n]{2,40}', r'\1: [متاح للأعضاء]', t)
    return re.sub(r'\s+', ' ', t).strip()
MONTHS = {'يناير': 1, 'فبراير': 2, 'مارس': 3, 'أبريل': 4, 'ابريل': 4, 'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'أغسطس': 8, 'اغسطس': 8, 'سبتمبر': 9, 'أكتوبر': 10, 'اكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12}
def iso(s):
    m = re.search(r'(\d{1,2})\s+(\S+)\s+(\d{4})', s or '')
    if m and m.group(2) in MONTHS: return '%s-%02d-%02d' % (m.group(3), MONTHS[m.group(2)], int(m.group(1)))
    return ''
T = json.load(open(L + 'tenders_raw.json', encoding='utf-8'))
out = []
for t in T:
    m = t.get('meta') or {}
    out.append([t['ref'], t['type'], t['status'], re.sub(r'\s+', ' ', t['title']).strip(), (t['authority'] or '').strip().rstrip('.'), (t['address'] or '').strip(),
                m.get('النشاط / القطاع', '').strip(), m.get('قيمة كراسة الشروط', ''), m.get('التأمين الابتدائي', ''), iso(m.get('آخر موعد لتقديم العطاءات', '')), region(t['address'], t['authority'], t['title']), t['url']])
open('/home/user/madeinegyptgate/data/oldtend.js', 'w', encoding='utf-8').write('/* Government tenders published on the platform (from official open sources): ref,type,status,title,authority,address,sector,booklet EGP,bond %,deadline,region,url */\nwindow.MIGTEND=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
R = json.load(open(L + 'rfqs_raw.json', encoding='utf-8'))
ro = []
for r in R:
    title = re.sub(r'\s+', ' ', r['title']).strip()
    no = (re.search(r'رقم الطلب[:\s]*([0-9]+)', title) or [None, str(r['id'])])[1]
    t2 = re.sub(r'\s*–\s*بتاريخ.*$', '', title)
    t2 = re.sub(r'^طلب عرض سعر\s*[–-]\s*', '', t2)
    body = clean(r.get('content') or '')
    deliver = (re.search(r'مكان التسليم[:\s]*([^.]{2,80})', body) or [None, ''])[1].strip()
    qty = (re.search(r'الكمية\s*/\s*الوحدة[:\s]*([^.]{1,60})', body) or [None, ''])[1].strip()
    dl = (re.search(r'الموعد النهائي[:\s]*(\d{1,2}/\d{1,2}/\d{4})', body) or [None, ''])[1]
    date = r['date'][:10] if not r['date'].startswith('1970') else ''
    ro.append([no, date, t2, body[:600], deliver, qty, dl, region(deliver, t2), r['link']])
ro.sort(key=lambda x: x[1], reverse=True)
open('/home/user/madeinegyptgate/data/oldrfq.js', 'w', encoding='utf-8').write('/* RFQs received on the platform (contacts removed; available to members): no,date,title,details,delivery,qty,deadline,region,url */\nwindow.MIGRFQ=' + json.dumps(ro, ensure_ascii=False, separators=(',', ':')) + ';\n')
import collections
print(len(out), 'tenders', collections.Counter(o[10] or '-' for o in out).most_common(14))
print(len(ro), 'rfqs', collections.Counter(o[7] or '-' for o in ro).most_common(14))
