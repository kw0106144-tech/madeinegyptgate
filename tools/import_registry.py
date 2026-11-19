# -*- coding: utf-8 -*-
"""Import Excel/CSV exports (Tenders Alerts / BNC / any source) into data/registry.js and data/projects.js.

Usage:  python3 tools/import_registry.py <file1.xlsx> [file2.csv ...]
Each sheet is classified by its column headers (Arabic or English) as: awards, tenders, agencies, projects, or leads.
Personal contact columns (phone / email / mobile / contact person) are dropped and never published.
"""
import sys, json, re, hashlib
import pandas as pd

B = '/home/user/madeinegyptgate/'
ALIASES = {
    'ref': ['reference', 'ref', 'reference number', 'الرقم المرجعي', 'رقم المنافسة', 'رقم المرجع', 'tender number'],
    'title': ['name', 'title', 'tender name', 'project name', 'اسم المنافسة', 'المنافسة', 'العنوان', 'اسم المشروع', 'المشروع'],
    'agency': ['agency', 'issuing agency', 'owner', 'client', 'الجهة', 'الجهة الحكومية', 'المالك', 'الجهة الطارحة'],
    'winner': ['winner', 'awarded to', 'company', 'supplier', 'الشركة الفائزة', 'الفائز', 'المورد', 'الشركة'],
    'value': ['value', 'amount', 'awarded value', 'contract value', 'budget', 'القيمة', 'قيمة الترسية', 'قيمة العقد', 'الميزانية'],
    'date': ['date', 'award date', 'submission date', 'تاريخ الترسية', 'التاريخ', 'تاريخ التقديم'],
    'deadline': ['deadline', 'closing date', 'last offer date', 'آخر موعد', 'تاريخ الإغلاق', 'آخر موعد لتقديم العروض'],
    'sector': ['sector', 'activity', 'agency sector', 'category', 'القطاع', 'النشاط', 'قطاع الجهة'],
    'region': ['region', 'city', 'location', 'المنطقة', 'المدينة', 'الموقع'],
    'cost': ['cost', 'booklet price', 'tender cost', 'قيمة الكراسة', 'سعر الكراسة'],
    'bidders': ['bidders', 'number of bidders', 'المتقدمون', 'عدد المتقدمين'],
    'stage': ['stage', 'status', 'المرحلة', 'الحالة'],
    'contractor': ['contractor', 'main contractor', 'المقاول', 'المقاول الرئيسي'],
    'consultant': ['consultant', 'الاستشاري'],
    'material': ['material', 'product', 'requirement', 'المادة', 'المنتج', 'المطلوب'],
    'qty': ['quantity', 'qty', 'الكمية'],
}
PII = re.compile(r'(phone|mobile|email|e-mail|contact|tel|whatsapp|جوال|هاتف|بريد|ايميل|إيميل|مسؤول التواصل|رقم التواصل)', re.I)

def norm(h): return re.sub(r'\s+', ' ', str(h)).strip().lower()
def mapcols(cols):
    m = {}
    for c in cols:
        n = norm(c)
        if PII.search(n): continue
        for k, al in ALIASES.items():
            if k not in m and any(n == a or a in n for a in al): m[k] = c; break
    return m
def kind(m):
    if 'winner' in m and ('value' in m or 'title' in m): return 'awards'
    if 'material' in m: return 'leads'
    if 'stage' in m and ('contractor' in m or 'consultant' in m or 'value' in m): return 'projects'
    if 'deadline' in m or 'cost' in m: return 'tenders'
    if 'agency' in m and len(m) <= 4: return 'agencies'
    return 'tenders' if 'title' in m else None
def sid(prefix, s): return prefix + hashlib.md5(s.encode()).hexdigest()[:6]
def num(v):
    try: return float(re.sub(r'[^\d.]', '', str(v)) or 0)
    except Exception: return 0
def d(v):
    try: return pd.to_datetime(v).strftime('%Y-%m-%d')
    except Exception: return str(v)[:10]

companies, agencies, awards, tenders = {}, {}, [], []
for f in sys.argv[1:]:
    sheets = pd.read_excel(f, sheet_name=None) if f.lower().endswith(('xlsx', 'xls')) else {'csv': pd.read_csv(f)}
    for name, df in sheets.items():
        m = mapcols(df.columns); k = kind(m)
        print(f'{f} [{name}] -> {k}: {m}')
        if not k: continue
        g = lambda r, key, dflt='': (r[m[key]] if key in m and pd.notna(r[m[key]]) else dflt)
        for _, r in df.iterrows():
            ag = str(g(r, 'agency', 'جهة غير محددة')).strip()
            aid = sid('a', ag); agencies.setdefault(aid, [aid, ag, str(g(r, 'sector', '—')), str(g(r, 'region', '—')), 'جهة'])
            if k == 'awards':
                w = str(g(r, 'winner')).strip()
                if not w: continue
                cid = sid('c', w); companies.setdefault(cid, [cid, w, str(g(r, 'sector', '—')), str(g(r, 'region', '—')), '—', str(g(r, 'sector', ''))])
                awards.append([str(g(r, 'ref', '')), str(g(r, 'title', '')), aid, cid, num(g(r, 'value', 0)), d(g(r, 'date', '')), str(g(r, 'sector', '—')), int(num(g(r, 'bidders', 0)))])
            elif k == 'tenders':
                tenders.append([str(g(r, 'ref', '')), str(g(r, 'title', '')), ag, str(g(r, 'sector', '—')), str(g(r, 'region', '—')), d(g(r, 'deadline', '')), str(g(r, 'cost', ''))])

if awards or agencies:
    reg = open(B + 'data/registry.js').read()
    tail = reg[reg.index('REG.c = function'):]
    body = 'window.REG = ' + json.dumps({'companies': list(companies.values()), 'agencies': list(agencies.values()), 'awards': awards}, ensure_ascii=False) + ';\n'
    open(B + 'data/registry.js', 'w').write('/* Imported ' + ', '.join(sys.argv[1:]) + ' */\n' + body + tail)
if tenders:
    open(B + 'data/tenders.js', 'w').write('window.TENDERS = ' + json.dumps(tenders, ensure_ascii=False) + ';\n')
print('companies', len(companies), 'agencies', len(agencies), 'awards', len(awards), 'tenders', len(tenders))
