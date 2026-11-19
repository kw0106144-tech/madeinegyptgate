"""Build data/real.js, data/factories.js, data/zones.js and the real part of data/projects.js
from the researched JSON files (each row keeps its source URL).
Usage: python3 tools/gen_real.py <folder with *.json>"""
import json, sys, os, re
SRC = sys.argv[1]
B = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
def load(n):
    p = os.path.join(SRC, n + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []
REGN = {"RUH": "منطقة الرياض", "MAK": "منطقة مكة المكرمة", "MAD": "منطقة المدينة المنورة", "EAS": "المنطقة الشرقية", "ASR": "منطقة عسير", "TAB": "منطقة تبوك", "QAS": "منطقة القصيم", "JOU": "منطقة الجوف", "JAZ": "منطقة جازان", "NAJ": "منطقة نجران", "BAH": "منطقة الباحة", "NBR": "منطقة الحدود الشمالية", "HAI": "منطقة حائل"}
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))

# zones
zones = load('zones')
if zones:
    open(B + 'data/zones.js', 'w', encoding='utf-8').write('/* Saudi industrial cities & economic zones — researched list with sources (coordinates partly approximate). */\nwindow.MIGZONES=' + J(zones) + ';\n')

# factories
fac = load('factories')
open(B + 'data/factories.js', 'w', encoding='utf-8').write('/* Real Saudi manufacturers by region (company-level public info + source URL). */\nwindow.MIGFAC=' + J([{k: f.get(k, '') for k in ['name_ar', 'name_en', 'city', 'region_code', 'sector_ar', 'main_products_ar', 'website', 'source_url']} for f in fac]) + ';\n')

# news / events / market / awards / tenders → real.js
real = {'news': load('news'), 'events': load('events'), 'market': load('market'), 'awards': load('awards'), 'tenders': load('tenders'), 'tenders_intl': load('tenders_intl')}
open(B + 'data/real.js', 'w', encoding='utf-8').write('/* Researched public data (news, events, market closes, contract awards, tenders) — every item has its source URL. */\nwindow.REAL=' + J(real) + ';\n')

# projects → MIG.PROJECTS rows
STG = ["التخطيط", "التصميم", "طرح العقود", "الترسية", "التنفيذ", "التشطيبات", "مكتمل"]
PROG = [0, 5, 10, 15, 45, 85, 100]
SECT = ["سكني", "تجاري", "بنية تحتية", "صناعي", "صحي", "تعليمي", "ضيافة وسياحة", "طاقة ومياه"]
prj = load('projects')
rows = []
for i, p in enumerate(prj):
    st = STG.index(p['stage_ar']) if p.get('stage_ar') in STG else 4
    sec = p.get('sector_ar') if p.get('sector_ar') in SECT else 'بنية تحتية'
    mats = [[m, '—', '', 'مفتوح'] for m in (p.get('key_materials_ar') or [])][:5]
    note = p.get('summary_ar', '')
    rows.append(['r%03d' % (i + 1), p['name_ar'], REGN.get(p.get('region_code'), ''), p.get('city', ''), sec, st, p.get('value_sar_million'),
                 p.get('owner_ar', '') or '—', p.get('main_contractor_ar', '') or 'لم يُعلن', p.get('consultant_ar', '') or 'لم يُعلن',
                 str(p.get('start_year') or ''), str(p.get('expected_completion') or ''), PROG[st], mats,
                 [[p.get('source_date') or '', note]], p.get('source_url', '')])
if rows:
    s = open(B + 'data/projects.js', encoding='utf-8').read()
    s = re.sub(r'\nMIG\.PROJECTS_REAL = .*?;\n', '\n', s, flags=re.S)
    s = s.replace('\nMIG.LEADS = [', '\nMIG.PROJECTS_REAL = ' + J(rows) + ';\nMIG.LEADS = [', 1)
    open(B + 'data/projects.js', 'w', encoding='utf-8').write(s)
print('zones', len(zones), 'factories', len(fac), 'projects', len(rows), {k: len(v) for k, v in real.items()})
