"""«التحديث اليومي»: merge researched news, procurement / award news, project news, events and videos into
data/real.js, data/projects.js, data/videos.js and the English dictionary data/i18n-en.js — Made in Egypt Gate.
Every input item must be real and verified (see tools/daily_media/PLAYBOOK.md); this script only validates, de-duplicates
and writes. Usage (repo root): python3 -I tools/daily_media/merge.py . <dir with new-*.json>"""
import json, re, sys, os, datetime, urllib.request
REPO, M = sys.argv[1], sys.argv[2]
TODAY = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).strftime('%Y-%m-%d')  # Cairo date
EGYPT_AR = re.compile(r'مصر|المصري|مصري')
EGYPT_EN = re.compile(r'egypt|misr(?![a-z])|masr', re.I)
GOV = dict(re.findall(r'\["([A-Z]{3})", "([^"]+)"', open(REPO + '/data/regions.js', encoding='utf-8').read()))
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

# ---- news
NEWS_CATS = set(n['category_ar'] for n in R['news']) | {'مشتريات'}
seen_url = set(n['url'] for n in R['news'])
seen_title = set(clean(n['title_ar']) for n in R['news'])
for n in read('new-news.json'):
    ta, sa, te, se = clean(n.get('title_ar')), clean(n.get('summary_ar')), clean(n.get('title_en')), clean(n.get('summary_en'))
    url, date = clean(n.get('url')), clean(n.get('date'))
    why = None
    if not (ta and sa and te and se and url.startswith('http') and re.match(r'^\d{4}-\d{2}-\d{2}$', date)): why = 'missing field'
    elif date > TODAY: why = 'future date'
    elif url in seen_url or ta in seen_title: why = 'duplicate'
    elif n.get('category_ar') not in NEWS_CATS: why = 'category ' + str(n.get('category_ar'))
    elif not safe(ta, sa): why = 'contact in text'
    elif n.get('region_code') and n['region_code'] not in GOV: why = 'region'
    if why: drop.append(('news', ta[:60], why)); continue
    seen_url.add(url); seen_title.add(ta)
    R['news'].append({'title_ar': ta, 'summary_ar': sa, 'source_name': clean(n.get('source_name')), 'date': date,
                      'category_ar': n['category_ar'], 'region_code': n.get('region_code') or None, 'url': url,
                      'image_file': '', 'image_url': clean(n.get('image_source_url'))})
    tr(ta, te); tr(sa, se); added['news'] += 1
R['news'].sort(key=lambda n: n['date'], reverse=True)
tr('مشتريات', 'Procurement')

# ---- procurement: contract awards (winners page)
REGS = tuple(GOV)
seen_aw = set(a.get('source_url') for a in R['awards']) | set(clean(a['title_ar']) for a in R['awards'])
for a in read('new-awards.json'):
    t, w, ent, url, date = clean(a.get('title_ar')), clean(a.get('winner_ar')), clean(a.get('awarding_entity_ar')), clean(a.get('source_url')), clean(a.get('date'))
    why = None
    if not (t and w and ent and url.startswith('http') and re.match(r'^\d{4}-\d{2}-\d{2}$', date)): why = 'missing field'
    elif date > TODAY: why = 'future date'
    elif url in seen_aw or t in seen_aw: why = 'duplicate'
    elif a.get('region_code') not in REGS: why = 'region'
    if why: drop.append(('award', t[:60], why)); continue
    seen_aw.add(url); seen_aw.add(t)
    num = lambda x: float(x) if isinstance(x, (int, float)) and x > 0 else None
    R['awards'].insert(0, {'title_ar': t, 'winner_ar': w, 'awarding_entity_ar': ent, 'value_egp_million': num(a.get('value_egp_million')),
                           'value_usd_million': num(a.get('value_usd_million')), 'region_code': a['region_code'],
                           'city': clean(a.get('city')), 'date': date, 'source_url': url})
    tr(t, a.get('title_en')); tr(w, a.get('winner_en')); tr(ent, a.get('awarding_entity_en')); added['awards'] += 1

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
    if not (name and url.startswith('http') and re.match(r'^\d{4}-\d{2}-\d{2}$', date) and upd): why = 'missing field'
    elif date > TODAY: why = 'future date'
    elif url in seen_p or name in seen_p: why = 'duplicate'
    elif p.get('region_code') not in REGS: why = 'region'
    elif p.get('sector_ar') not in SECT: why = 'sector ' + str(p.get('sector_ar'))
    elif not isinstance(p.get('stage'), int) or not 0 <= p['stage'] <= 6: why = 'stage'
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
