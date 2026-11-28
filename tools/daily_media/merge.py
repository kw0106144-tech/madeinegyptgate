"""«التحديث اليومي»: merge researched news, procurement / award news, project news, events and videos into
data/real.js, data/projects.js, data/videos.js and the English dictionary data/i18n-en.js — Made in Egypt Gate.
With market.json it also updates the last closes of REAL.market (EGX stocks and indices).
Every input item must be real and verified (see tools/daily_media/PLAYBOOK.md); this script only validates, de-duplicates
and writes. Usage (repo root): python3 -I tools/daily_media/merge.py . <dir with new-*.json and / or market.json>"""
import json, re, sys, os, datetime, urllib.request
REPO, M = sys.argv[1], sys.argv[2]
TODAY = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).strftime('%Y-%m-%d')  # Cairo date
EGYPT_AR = re.compile(r'مصر|المصري|مصري')
EGYPT_EN = re.compile(r'egypt|misr(?![a-z])|masr', re.I)
GOV = dict(re.findall(r'\["([A-Z]{3})", "([\u0600-\u06FF][^"]*)"', open(REPO + '/data/regions.js', encoding='utf-8').read()))  # [code, Arabic name] (not the code lists)
AR = re.compile(r'[\u0600-\u06FF]')
PHONE = re.compile(r'(\+?\d[\d \-]{8,}\d)')
MAIL = re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+')

TAILS = {}
def load_js(path, var):
    """line 1 = comment, line 2 = window.VAR=<JSON>; — any later lines (data/real.js: REAL_EN) are kept as they are"""
    s = open(path, encoding='utf-8').read()
    head, rest = s.split('\n', 1)
    line, _, tail = rest.partition('\n')
    pre = 'window.%s=' % var
    assert line.startswith(pre), path
    TAILS[path] = tail
    return head, json.loads(line[len(pre):].rstrip().rstrip(';'))

def dump_js(path, head, var, obj):
    tail = TAILS.get(path, '')
    open(path, 'w', encoding='utf-8').write(head + '\n' + 'window.%s=' % var + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ';\n' + tail)

def read(name):
    p = os.path.join(M, name)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []

def clean(t):
    return re.sub(r'\s+', ' ', (t or '')).strip()

def safe(*texts):
    for t in texts:
        if MAIL.search(t or ''):
            return False
    return True

dhead, D = load_js(REPO + '/data/i18n-en.js', 'I18N_EN')
rhead, R = load_js(REPO + '/data/real.js', 'REAL')
vhead, V = load_js(REPO + '/data/videos.js', 'MIGVIDS')
added = {'news': 0, 'awards': 0, 'projects': 0, 'events': 0, 'videos': 0, 'dict': 0}
drop = []
MISS = []
REGS = tuple(GOV)

NUM = re.compile(r'[0-9\u0660-\u0669][0-9\u0660-\u0669,.:%/\-]*')
def tr(ar, en):
    ar, en = clean(ar), clean(en)
    if not (ar and en and AR.search(ar)) or AR.search(en): return
    if EGYPT_AR.search(ar) and not EGYPT_EN.search(en):
        drop.append(('dict', ar[:60], 'English must say Egypt / Egyptian')); return
    na, ne = NUM.findall(ar), NUM.findall(en)
    if na:  # the browser looks numbers up as {n}, in order
        if na != ne:  # the English keeps its own numbers as written
            k = NUM.sub('{n}', ar)
            if k not in D: D[k] = en; added['dict'] += 1
            return
        ar, en = NUM.sub('{n}', ar), NUM.sub('{n}', en)
    if ar not in D:
        D[ar] = en; added['dict'] += 1

CUR, CUR_CODE, AWARD_KEY = 'estimated_value_egp', 'EGP', 'value_egp_million'
# the award page shows EGP / USD / EUR millions; any other currency stays as value_million + currency
AWARD_EXTRA = lambda v, vm, cur, a: dict([('value_usd_million', vm if cur == 'USD' else money(a.get('value_usd_million')))] + ([('value_eur_million', vm)] if cur == 'EUR' else []))
KIND_STORE = {'gov': 'gov', 'semi-gov': 'public-company', 'private': 'private'}
COUNTRY_EN = 'Egypt'
GCC = ('United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman')
def EN_RULE(t):
    """the generator's English rule: an Arabic text that says مصر / مصري has an English twin that says Egypt / Egyptian"""
    for k in ('title', 'summary', 'entity', 'winner', 'awarding_entity', 'name', 'update'):
        ar, en = clean(t.get(k + '_ar')), clean(t.get(k + '_en'))
        if ar and en and EGYPT_AR.search(ar) and not EGYPT_EN.search(en): return '%s_en must say Egypt / Egyptian (the Arabic says مصر)' % k
    return None
# ---- procurement (owner 2026-11-28): every day, tenders (government / semi-government), RFQs and procurement requests (public and
# private) and contract awards (public and private), for three markets: local (this country), Gulf (the other GCC countries) and
# international (Africa, Asia, Europe). PLAYBOOK «Procurement». One rule set for every item:
#   - required fields (below), dates YYYY-MM-DD, the source page https (an official or reputable page opened on the day of the update);
#   - publish date not in the future; a tender / RFQ still open (closing date today or later) and closing after it was published;
#   - no duplicate: the same reference number + entity, the same title + entity, or the same notice / source page;
#   - no e-mail, phone number or person's name / contact line in any text;
#   - no «status» field: the pages derive open / closing soon / closed from closing_date, so a status is never stored as text.
DAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')
HTTPS = re.compile(r'^https://[^\s/]+\.[^\s/]+')
PHONE2 = re.compile(r'(?:\+|00)\d[\d \-]{7,}\d|(?<![\w/.\-])0\d{8,10}(?![\w/.\-])')
PERSON_AR = re.compile(r'(?:^|[\s(،,:؛])(?:(?:الأستاذ|الأستاذة|المهندس|المهندسة|الدكتور|الدكتورة|السيد/|السيدة/)\s+|د\.\s*|م/\s*)[ء-ي]{2,}|للتواصل|للاستفسار|ضابط الاتصال|مسؤول الاتصال|مسئول الاتصال|الشخص المسؤول')
PERSON_EN = re.compile(r'\b(?:Mr|Mrs|Ms|Miss|Dr|Eng)\.?\s+[A-Z][a-z]+|\bcontact person\b|\battn\b|\battention:', re.I)
KINDS = ('gov', 'semi-gov', 'private')            # who buys: a government body, a government-owned / semi-government company, a private company
CATS = ('tender', 'rfq')                         # a tender (open / limited / practice) or a request for quotation / procurement request
INTL_MARKETS = ('gulf', 'africa', 'asia', 'europe')   # the markets the pages and plans know (Arab countries go to their continent)
CURRENCY = re.compile(r'^[A-Z]{3}$')

def bad_text(*texts):
    for t in texts:
        t = clean(t) if isinstance(t, str) else ''
        if MAIL.search(t): return 'e-mail in text'
        if PHONE2.search(t): return 'phone number in text'
        if PERSON_AR.search(t) or PERSON_EN.search(t): return "a person's name or contact line in text"
    return None

def dk(*parts):
    return '|'.join(re.sub(r'[\sـ]+', ' ', clean(p if isinstance(p, str) else '')).lower() for p in parts)

def money(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 else None

def proc_common(t, closing=True):
    """the checks every tender / RFQ / award shares; returns the reason to drop it, or None"""
    if not isinstance(t, dict): return 'not an object'
    if 'status' in t: return 'status is never an input (the pages derive it from closing_date)'
    if t.get('kind') not in KINDS: return 'kind %r (gov|semi-gov|private)' % (t.get('kind'),)
    if not HTTPS.match(clean(t.get('source_url'))): return 'source_url is not https'
    if t.get('detail_url') and not HTTPS.match(clean(t['detail_url'])): return 'detail_url is not https'
    if not (clean(t.get('title_ar')) and AR.search(clean(t.get('title_ar'))) and clean(t.get('title_en')) and not AR.search(clean(t.get('title_en')))): return 'title_ar / title_en'
    if not (clean(t.get('sector_ar')) and clean(t.get('sector_en'))): return 'sector_ar / sector_en'
    if closing:
        pd, cd = clean(t.get('publish_date')), clean(t.get('closing_date'))
        if not (DAY.match(pd) and DAY.match(cd)): return 'publish_date / closing_date not YYYY-MM-DD'
        if pd > TODAY: return 'publish_date %s is in the future (today %s)' % (pd, TODAY)
        if cd <= TODAY: return 'closing_date %s is not after today (%s): the pages count it as closed' % (cd, TODAY)
        if cd < pd: return 'closing_date before publish_date'
        if t.get('category') not in CATS: return 'category %r (tender|rfq)' % (t.get('category'),)
        if not clean(t.get('ref')): return 'ref (the notice number) is missing'
        if not clean(t.get('procurement_type')) and t.get('category') == 'rfq': return 'procurement_type (as published) is missing'
    v = t.get('estimated_value', t.get('value_million'))
    if v is not None and money(v) is None: return 'value is not a positive number'
    if money(v) is not None and not CURRENCY.match(clean(t.get('currency'))): return 'currency (ISO code, e.g. %s, USD) is missing' % CUR_CODE
    why = EN_RULE(t)
    if why: return why
    return bad_text(t.get('title_ar'), t.get('title_en'), t.get('title_original'), t.get('entity_ar'), t.get('entity_en'), t.get('winner_ar'),
                    t.get('winner_en'), t.get('awarding_entity_ar'), t.get('awarding_entity_en'), t.get('city'), t.get('summary_ar'), t.get('summary_en'))

def market_of(t):
    """local / gulf / africa / asia / europe, with the country checked against the market"""
    mk = t.get('market') or 'local'
    if mk == 'local':
        if t.get('region_code') not in REGS + (None, ''): return mk, 'region_code %r' % (t.get('region_code'),)
        return mk, None
    if mk not in INTL_MARKETS: return mk, 'market %r (local|%s)' % (mk, '|'.join(INTL_MARKETS))
    ce = clean(t.get('country_en'))
    if not (clean(t.get('country_ar')) and ce): return mk, 'country_ar / country_en'
    if ce.lower() == COUNTRY_EN.lower(): return mk, 'this country is market «local», not %s' % mk
    if mk == 'gulf' and ce not in GCC: return mk, '%s is not a GCC country (market gulf)' % ce
    if mk != 'gulf' and ce in GCC: return mk, '%s is a GCC country: market gulf' % ce
    if t.get('region_code'): return mk, 'region_code is for local items only'
    return mk, None

# ---- news (industry news; «مشتريات» = procurement news and requests, public and private; «مشروعات» = project news of the Gulf and
# abroad — projects of this country go to new-projects.json). Optional market (local|gulf|africa|asia|europe) + country_ar / country_en.
NEWS_CATS = set(n['category_ar'] for n in R['news']) | {'مشتريات', 'مشروعات'}
seen_url = set(n['url'] for n in R['news'])
seen_title = set(clean(n['title_ar']) for n in R['news'])
for n in read('new-news.json'):
    ta, sa, te, se = clean(n.get('title_ar')), clean(n.get('summary_ar')), clean(n.get('title_en')), clean(n.get('summary_en'))
    url, date = clean(n.get('url')), clean(n.get('date'))
    mk, mwhy = market_of(n) if n.get('market') not in (None, '', 'local') else ('local', None)
    why = None
    if not (ta and sa and te and se and HTTPS.match(url) and DAY.match(date)): why = 'missing field (or the url is not https)'
    elif date > TODAY: why = 'future date'
    elif url in seen_url or ta in seen_title: why = 'duplicate'
    elif n.get('category_ar') not in NEWS_CATS: why = 'category ' + str(n.get('category_ar'))
    elif n.get('category_ar') == 'مشروعات' and mk == 'local': why = 'a local project goes into new-projects.json'
    elif mwhy: why = mwhy
    elif 'status' in n: why = 'status is never an input'
    elif not safe(ta, sa) or PHONE2.search(ta + ' ' + sa): why = 'contact in text'
    elif EN_RULE({'title_ar': ta, 'title_en': te, 'summary_ar': sa, 'summary_en': se}): why = EN_RULE({'title_ar': ta, 'title_en': te, 'summary_ar': sa, 'summary_en': se})
    elif n.get('region_code') and n['region_code'] not in GOV: why = 'region'
    if why: drop.append(('news', ta[:60], why)); continue
    seen_url.add(url); seen_title.add(ta)
    item = {'title_ar': ta, 'summary_ar': sa, 'source_name': clean(n.get('source_name')), 'date': date,
            'category_ar': n['category_ar'], 'region_code': n.get('region_code') or None, 'url': url,
            'image_file': '', 'image_url': clean(n.get('image_source_url'))}
    if mk != 'local':
        item.update({'market': mk, 'country_ar': clean(n['country_ar']), 'country_en': clean(n['country_en']), 'region_code': None})
        tr(n['country_ar'], n['country_en'])
    R['news'].append(item)
    tr(ta, te); tr(sa, se); added['news'] += 1
    if n['category_ar'] == 'مشروعات': tr('مشروعات', 'Projects')
R['news'].sort(key=lambda n: n['date'], reverse=True)
tr('مشتريات', 'Procurement')

# ---- project news: new projects (data/projects.js MIG.PROJECTS_REAL)
PJ = REPO + '/data/projects.js'
pj_lines = open(PJ, encoding='utf-8').read().split('\n')
PJI = [i for i, l in enumerate(pj_lines) if l.startswith('MIG.PROJECTS_REAL = ')][0]
P = json.loads(pj_lines[PJI][len('MIG.PROJECTS_REAL = '):].rstrip().rstrip(';'))
REGNAME = dict((k, 'محافظة ' + v) for k, v in GOV.items())
SECT = ["سكني", "تجاري", "بنية تحتية", "صناعي", "صحي", "تعليمي", "ضيافة وسياحة", "طاقة ومرافق"]
for l in pj_lines:
    if l.startswith('MIG.SECTORS = '): SECT = json.loads(l[len('MIG.SECTORS = '):].rstrip().rstrip(';'))
seen_p = set(p[15] for p in P) | set(clean(p[1]) for p in P)
nxt = max(int(p[0][1:]) for p in P) + 1
for p in read('new-projects.json'):
    name, url, date, upd = clean(p.get('name_ar')), clean(p.get('source_url')), clean(p.get('update_date')), clean(p.get('update_ar'))
    why = None
    if not (name and HTTPS.match(url) and re.match(r'^\d{4}-\d{2}-\d{2}$', date) and upd): why = 'missing field (or the source is not https)'
    elif date > TODAY: why = 'future date'
    elif url in seen_p or name in seen_p: why = 'duplicate'
    elif p.get('region_code') not in REGS: why = 'region'
    elif p.get('sector_ar') not in SECT: why = 'sector ' + str(p.get('sector_ar'))
    elif not isinstance(p.get('stage'), int) or not 0 <= p['stage'] <= 6: why = 'stage'
    elif bad_text(name, upd, p.get('name_en'), p.get('update_en')): why = bad_text(name, upd, p.get('name_en'), p.get('update_en'))
    elif EN_RULE(p): why = EN_RULE(p)
    if why: drop.append(('project', name[:60], why)); continue
    seen_p.add(url); seen_p.add(name)
    v = p.get('value_egp_million'); v = v if isinstance(v, (int, float)) and v > 0 else None
    na = 'لم يُعلن'
    pid = 'r%03d' % nxt; nxt += 1
    P.append([pid, name, REGNAME[p['region_code']], clean(p.get('city')), p['sector_ar'], p['stage'], v, clean(p.get('owner_ar')) or na,
              clean(p.get('contractor_ar')) or na, clean(p.get('consultant_ar')) or na, clean(p.get('start')), clean(p.get('end')), 0, [],
              [[date, upd]], url, 'img/gov/gv-%s.jpg' % p['region_code']])
    tr(name, p.get('name_en')); tr(upd, p.get('update_en')); tr(p.get('city'), p.get('city_en'))
    for k in ('owner', 'contractor', 'consultant'): tr(p.get(k + '_ar'), p.get(k + '_en'))
    added['projects'] += 1
pj_lines[PJI] = 'MIG.PROJECTS_REAL = ' + json.dumps(P, ensure_ascii=False, separators=(',', ':')) + ';'

# ---- events (appended: event ids are positional)
seen_ev = set((e['name_en'] or '').lower() for e in R['events']) | set(e['id'] for e in R['events'])
for e in sorted(read('new-events.json'), key=lambda e: e.get('start_date', '')):
    sd, ed = clean(e.get('start_date')), clean(e.get('end_date')) or clean(e.get('start_date'))
    why = None
    if not (e.get('name_ar') and e.get('name_en') and re.match(r'^\d{4}-\d{2}-\d{2}$', sd) and clean(e.get('url')).startswith('http')): why = 'missing field'
    elif sd <= TODAY: why = 'past/today'
    elif ed < sd: why = 'end before start'
    elif e['id'] in seen_ev or e['name_en'].lower() in seen_ev: why = 'duplicate'
    elif e.get('region_code') not in GOV: why = 'region'
    elif not safe(e.get('about_ar', ''), e.get('about_en', '')): why = 'contact in text'
    if why: drop.append(('event', e.get('name_en', '')[:60], why)); continue
    seen_ev.add(e['id']); seen_ev.add(e['name_en'].lower())
    ag_ar = [clean(a) for a in (e.get('agenda_ar') or []) if clean(a)]
    ag_en = [clean(a) for a in (e.get('agenda_en') or []) if clean(a)]
    R['events'].append({'id': e['id'], 'name_ar': clean(e['name_ar']), 'name_en': clean(e['name_en']), 'start_date': sd, 'end_date': ed,
                        'city': clean(e.get('city')), 'region_code': e['region_code'], 'venue': clean(e.get('venue')),
                        'organizer': clean(e.get('organizer')), 'sector_ar': clean(e.get('sector_ar')), 'url': clean(e['url']),
                        'about_ar': clean(e.get('about_ar')), 'agenda_ar': ag_ar, 'agenda_generic': False,
                        'source_url': clean(e.get('source_url')) or clean(e['url']), 'image_file': '', 'notes': None})
    tr(e['name_ar'], e['name_en']); tr(e.get('city'), e.get('city_en')); tr(e.get('venue'), e.get('venue_en'))
    tr(e.get('sector_ar'), e.get('sector_en')); tr(e.get('about_ar'), e.get('about_en'))
    for a, b in zip(ag_ar, ag_en): tr(a, b)
    added['events'] += 1

# ---- videos
VCATS = set(v['category_ar'] for v in V)
seen_v = set(v['id'] for v in V)
new_v = []
for v in read('new-videos.json'):
    vid = clean(v.get('id'))
    why = None
    if not re.match(r'^[A-Za-z0-9_-]{11}$', vid) or not v.get('title_ar') or not v.get('title_en'): why = 'missing field'
    elif vid in seen_v: why = 'duplicate'
    elif v.get('category_ar') not in VCATS: why = 'category ' + str(v.get('category_ar'))
    if why: drop.append(('video', vid, why)); continue
    seen_v.add(vid)
    new_v.append({'id': vid, 'url': 'https://www.youtube.com/watch?v=' + vid, 'title_original': clean(v.get('title_original')),
                  'title_ar': clean(v['title_ar']), 'title_en': clean(v['title_en']), 'channel': clean(v.get('channel')),
                  'date': clean(v.get('date')), 'duration': clean(v.get('duration')), 'category_ar': v['category_ar'],
                  'governorate': v.get('governorate') or '', 'thumb': 'img/yt/%s.jpg' % vid, 'lang': v.get('lang') or 'ar',
                  'verified_oembed': True, 'source_url': 'https://www.youtube.com/watch?v=' + vid})
    tr(v['title_ar'], v['title_en']); added['videos'] += 1
V = sorted(V + new_v, key=lambda v: v.get('date') or '', reverse=True)

# -- tenders, RFQs and procurement requests of Egypt: a row of data/oldtend.js MIGTEND (the tenders list, /tenders/, the governorate
# pages, Janna) and its record in REAL.tenders (English title and entity, dates, the source page) — the generator joins them by title.
TL = open(REPO + '/data/oldtend.js', encoding='utf-8').read().split('\n')
TLI = [i for i, l in enumerate(TL) if l.startswith('window.MIGTEND=')][0]
MT = json.loads(TL[TLI][len('window.MIGTEND='):].rstrip().rstrip(';'))
SECTORS = dict((a, e) for a, e in json.loads(re.search(r'window\.MIGSECTORS = (\[.*?\]);', open(REPO + '/data/regions.js', encoding='utf-8').read()).group(1)))
KIND_LOCAL = {'gov': 'gov', 'semi-gov': 'public-company', 'private': 'private'}   # the pages' labels: government / public-sector company / request
seen_t = set()
for x in MT:
    if x: seen_t.update([dk(re.sub(r'^OFF:', '', x[0] or ''), x[4]), dk(x[3], x[4])])
for t in R['tenders']:
    if t:
        seen_t.update([dk(t.get('ref'), t.get('entity_ar')), dk(t.get('title_ar'), t.get('entity_ar'))])
        if t.get('detail_url'): seen_t.add(clean(t['detail_url']))
nxt_t = max([int(m.group(1)) for m in (re.search(r'(\d+)$', str((t or {}).get('id') or '')) for t in R['tenders']) if m] + [0]) + 1
new_mt = []
for t in read('new-tenders.json'):
    if isinstance(t, dict) and t.get('sector_ar') in SECTORS and not t.get('sector_en'): t = dict(t, sector_en=SECTORS[t['sector_ar']])
    why = proc_common(t)
    if not why:
        mk, why = market_of(dict(t, market='local'))
    ent = clean(t.get('entity_ar')) if isinstance(t, dict) else ''
    if not why and not (ent and clean(t.get('entity_en'))): why = 'entity_ar / entity_en'
    elif not why and t.get('region_code') not in GOV: why = 'region_code (a governorate code of data/regions.js)'
    elif not why and t.get('sector_ar') not in SECTORS: why = 'sector_ar must be one of MIGSECTORS (data/regions.js): ' + str(t.get('sector_ar'))
    elif not why and not (clean(t.get('procurement_type')) and AR.search(clean(t['procurement_type'])) and clean(t.get('procurement_type_en'))): why = 'procurement_type (Arabic, as published) / procurement_type_en'
    elif not why and (dk(t.get('ref'), ent) in seen_t or dk(t.get('title_ar'), ent) in seen_t or (t.get('detail_url') and clean(t['detail_url']) in seen_t)): why = 'duplicate'
    if why: drop.append(('tender', clean(t.get('title_ar') if isinstance(t, dict) else '')[:60], why)); continue
    seen_t.update([dk(t.get('ref'), ent), dk(t.get('title_ar'), ent)]); t.get('detail_url') and seen_t.add(clean(t['detail_url']))
    ta, cd, src = clean(t['title_ar']), clean(t['closing_date']), clean(t.get('detail_url')) or clean(t['source_url'])
    soon = (datetime.date.fromisoformat(cd) - datetime.date.fromisoformat(TODAY)).days <= 7
    # field 2 is what every page recomputes from the deadline (field 9) on each visit; the merge writes the same rule, never a typed status
    row = [clean(t['ref']), clean(t['procurement_type']), 'تنتهي قريباً' if soon else 'سارية', ta, ent, GOV[t['region_code']], t['sector_ar'],
           '', '', cd, t['region_code'], src, 0, '']
    if clean(t.get('description_ar')): row += [clean(t['description_ar']), '']
    new_mt.append(row)
    rec = {'id': 'eg-tnd-%03d' % nxt_t, 'ref': clean(t['ref']), 'kind': KIND_LOCAL[t['kind']], 'title_ar': ta, 'title_en': clean(t['title_en']), 'entity_ar': ent,
           'entity_en': clean(t['entity_en']), 'region_code': t['region_code'], 'city': clean(t.get('city')), 'sector_ar': t['sector_ar'],
           'publish_date': clean(t['publish_date']), 'closing_date': cd, 'procurement_type': clean(t['procurement_type']),
           'bid_bond_egp': money(t.get('bid_bond_egp')), 'booklet_price_egp': money(t.get('booklet_price_egp')), 'source_url': clean(t['source_url']),
           'detail_url': clean(t.get('detail_url')), 'via': clean(t.get('via')), 'category': t['category']}
    if money(t.get('estimated_value')) is not None: rec.update({'estimated_value': money(t['estimated_value']), 'currency': clean(t['currency'])})
    nxt_t += 1
    R['tenders'].append(rec)   # appended: an opportunity's id comes from its record's id, its position never matters
    tr(ta, t['title_en']); tr(ent, t['entity_en']); tr(t.get('city'), t.get('city_en')); tr(t['procurement_type'], t['procurement_type_en'])
    if clean(t.get('description_ar')): tr(t['description_ar'], t.get('description_en'))
    for k in ('tenders' if t['category'] == 'tender' else 'rfqs', 'local'):
        added[k] = added.get(k, 0) + 1
if new_mt:
    TL[TLI] = 'window.MIGTEND=' + json.dumps(new_mt[::-1] + MT, ensure_ascii=False, separators=(',', ':')) + ';'   # newest first, as the list shows them
    open(REPO + '/data/oldtend.js', 'w', encoding='utf-8').write('\n'.join(TL))

# -- Gulf and international tenders / RFQs (REAL.tenders_intl; appended: their page ids «in<n>» are positional)
KIND_INTL = {'gov': 'gov', 'semi-gov': 'gov', 'private': 'pvt'}   # the labels the pages know for a tender abroad
seen_ti = set()
for t in R.get('tenders_intl', []):
    if t: seen_ti.update([dk(t.get('ref'), t.get('entity_ar')), dk(t.get('title_ar'), t.get('entity_ar')), clean(t.get('source_url'))])
for t in read('new-tenders-intl.json'):
    why = proc_common(t)
    mk = None
    if not why:
        mk, why = market_of(t)
        if not why and mk == 'local': why = 'a tender in Egypt goes into new-tenders.json'
    ent = clean(t.get('entity_ar')) if isinstance(t, dict) else ''
    if not why and not (ent and clean(t.get('entity_en'))): why = 'entity_ar / entity_en'
    if not why and (dk(t.get('ref'), ent) in seen_ti or dk(t.get('title_ar'), ent) in seen_ti or clean(t.get('source_url')) in seen_ti): why = 'duplicate'
    if why: drop.append(('tender-intl', clean(t.get('title_ar') if isinstance(t, dict) else '')[:60], why)); continue
    seen_ti.update([dk(t.get('ref'), ent), dk(t.get('title_ar'), ent), clean(t['source_url'])])
    v = money(t.get('estimated_value'))
    R.setdefault('tenders_intl', []).append({'ref': clean(t['ref']), 'market': mk, 'country_ar': clean(t['country_ar']), 'country_en': clean(t['country_en']),
        'city': clean(t.get('city')), 'kind': KIND_INTL[t['kind']], 'title_ar': clean(t['title_ar']), 'title_en': clean(t['title_en']), 'entity_ar': ent,
        'entity_en': clean(t['entity_en']), 'sector_ar': clean(t['sector_ar']), 'publish_date': clean(t['publish_date']), 'closing_date': clean(t['closing_date']),
        'estimated_value': v, 'currency': clean(t.get('currency')) if v else None, 'source_name': clean(t.get('source_name')), 'source_url': clean(t['source_url']),
        'procurement_type': clean(t.get('procurement_type')), 'category': t['category']})
    tr(t['title_ar'], t['title_en']); tr(ent, t['entity_en']); tr(t['sector_ar'], t['sector_en']); tr(t['country_ar'], t['country_en']); tr(t.get('city'), t.get('city_en'))
    for k in ('tenders' if t['category'] == 'tender' else 'rfqs', 'gulf' if mk == 'gulf' else 'intl'):
        added[k] = added.get(k, 0) + 1

# -- contract awards, public and private, local / Gulf / international (REAL.awards, newest first)
seen_aw = set()
for a in R['awards']:
    if a:
        seen_aw.update([clean(a.get('source_url')), dk(a.get('title_ar')), dk(a.get('title_ar'), a.get('awarding_entity_ar'))])
        if a.get('ref'): seen_aw.add(dk(a['ref'], a.get('awarding_entity_ar')))
for a in read('new-awards.json'):
    why = proc_common(a, closing=False)
    mk = None
    if not why:
        mk, why = market_of(a)
    t, w, ent, url, date = [clean(a.get(k)) if isinstance(a, dict) else '' for k in ('title_ar', 'winner_ar', 'awarding_entity_ar', 'source_url', 'date')]
    if not why and not (w and clean(a.get('winner_en')) and ent and clean(a.get('awarding_entity_en'))): why = 'winner_ar/en and awarding_entity_ar/en (an award names its winner)'
    elif not why and not DAY.match(date): why = 'date (the day the award was published) not YYYY-MM-DD'
    elif not why and date > TODAY: why = 'future date'
    elif not why and mk == 'local' and a.get('region_code') not in REGS: why = 'region_code (one of %s)' % ' '.join(REGS)
    elif not why and (url in seen_aw or dk(t) in seen_aw or dk(t, ent) in seen_aw or (a.get('ref') and dk(a['ref'], ent) in seen_aw)): why = 'duplicate'
    if why: drop.append(('award', t[:60], why)); continue
    seen_aw.update([url, dk(t), dk(t, ent)]); a.get('ref') and seen_aw.add(dk(a['ref'], ent))
    vm, cur = money(a.get('value_million')), clean(a.get('currency'))
    v = vm if cur == CUR_CODE else money(a.get(AWARD_KEY))
    row = {'title_ar': t, 'winner_ar': w, 'awarding_entity_ar': ent, AWARD_KEY: v, 'region_code': a.get('region_code') if mk == 'local' else None,
           'city': clean(a.get('city')), 'date': date, 'source_url': url}
    row.update(AWARD_EXTRA(v, vm, cur, a))
    row.update({'market': mk, 'kind': KIND_STORE[a['kind']], 'ref': clean(a.get('ref')), 'sector_ar': clean(a['sector_ar'])})
    if vm is not None: row.update({'value_million': vm, 'currency': cur})
    if mk != 'local': row.update({'country_ar': clean(a['country_ar']), 'country_en': clean(a['country_en'])})
    R['awards'].insert(0, row)
    tr(t, a['title_en']); tr(w, a['winner_en']); tr(ent, a['awarding_entity_en']); tr(a['sector_ar'], a['sector_en']); tr(a.get('city'), a.get('city_en'))
    if mk != 'local': tr(a['country_ar'], a['country_en'])
    for k in ('awards', 'local' if mk == 'local' else 'gulf' if mk == 'gulf' else 'intl'):
        added[k] = added.get(k, 0) + 1

# ---- market closes (REAL.market): market.json = [{symbol, close, change_pct, as_of_date, source_url}], read from each row's
# source page on the day of the update (PLAYBOOK «Market prices»). Only rows that exist are updated (never added or removed);
# names, units and every other field stay. Optional per item: cross_check_url (https or null; a row's old cross-check is
# cleared otherwise, because it checked the old reading), and change_basis / note (required when the row has them).
MDAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')
def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float('inf')
mrep, mseen = [], set()
MROWS = dict((m.get('symbol'), m) for m in R.get('market', []))
for q in read('market.json'):
    q = q if isinstance(q, dict) else {}
    sym = clean(q.get('symbol')) if isinstance(q.get('symbol'), str) else ''
    c, p, d, u = q.get('close'), q.get('change_pct'), clean(str(q.get('as_of_date') or '')), clean(str(q.get('source_url') or ''))
    row = MROWS.get(sym)
    why = None
    if not row: why = 'unknown symbol'
    elif sym in mseen: why = 'symbol twice in market.json'
    elif not (num(c) and c > 0): why = 'close %r is not a positive number' % (c,)
    elif not (num(p) and -30 <= p <= 30): why = 'change_pct %r is not a number between -30 and 30' % (p,)
    elif not MDAY.match(d): why = 'as_of_date %r is not YYYY-MM-DD' % d
    elif d > TODAY: why = 'as_of_date %s is in the future (today %s)' % (d, TODAY)
    elif d < (row.get('as_of_date') or ''): why = 'as_of_date %s is older than the stored %s' % (d, row.get('as_of_date'))
    elif not re.match(r'^https://[^\s/]+\.[^\s/]+', u): why = 'source_url is not https'
    elif q.get('cross_check_url') is not None and not re.match(r'^https://[^\s/]+\.[^\s/]+', clean(str(q.get('cross_check_url')))): why = 'cross_check_url is not https'
    else:
        for k in ('change_basis', 'note'):
            if k in row and row[k] and not clean(str(q.get(k) or '')): why = 'the row has %s: give the new one for this reading' % k
            elif q.get(k) is not None and not safe(str(q.get(k))): why = 'contact in %s' % k
    if why: drop.append(('market', sym or '?', why)); mrep.append('DROP  %-14s %s' % (sym or '?', why)); continue
    mseen.add(sym)
    old = (row.get('close'), row.get('change_pct'), row.get('as_of_date'))
    row['close'], row['change_pct'], row['as_of_date'], row['source_url'] = c, p, d, u
    if q.get('cross_check_url') is not None: row['cross_check_url'] = clean(q['cross_check_url'])
    elif row.get('cross_check_url'): row['cross_check_url'] = None
    for k in ('change_basis', 'note'):
        if q.get(k) is not None and clean(str(q[k])): row[k] = clean(str(q[k]))
    added['market'] = added.get('market', 0) + 1
    mrep.append('OK    %-14s %s %s%% (%s)  ->  %s %s%% (%s)  %s' % (sym, old[0], old[1], old[2], c, p, d, u))
if mrep:
    for m in R.get('market', []):
        if m.get('symbol') not in mseen: mrep.append('SAME  %-14s %s %s%% (%s)  not updated' % (m.get('symbol'), m.get('close'), m.get('change_pct'), m.get('as_of_date')))
    rep = 'Market update %s (today %s): %d of %d rows updated\n' % (REPO, TODAY, len(mseen), len(R.get('market', []))) + '\n'.join(mrep) + '\n'
    open(os.path.join(M, 'market-report.txt'), 'w', encoding='utf-8').write(rep)
    print(rep, end='')

dump_js(REPO + '/data/real.js', rhead, 'REAL', R)
open(PJ, 'w', encoding='utf-8').write('\n'.join(pj_lines))
dump_js(REPO + '/data/videos.js', vhead, 'MIGVIDS', V)
dump_js(REPO + '/data/i18n-en.js', dhead, 'I18N_EN', D)
for v in new_v:  # the video's picture, from YouTube
    f = os.path.join(REPO, v['thumb'])
    if not os.path.exists(f):
        try:
            with urllib.request.urlopen('https://i.ytimg.com/vi/%s/hqdefault.jpg' % v['id'], timeout=20) as r: open(f, 'wb').write(r.read())
        except Exception as e: drop.append(('thumb', v['id'], str(e)[:60]))
print(added)
for d in drop: print('DROP', *d)
