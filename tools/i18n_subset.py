# -*- coding: utf-8 -*-
"""English first paint (bug sweep 2026-11-19, group 17): the parts of the English dictionary each app page needs.

data/i18n.js turns an app page into English with window.I18N_EN, the Arabic -> English dictionary data/i18n-en.js
(7.8 MB, about 2 MB compressed). Loading all of it before the page could paint kept every English app page blank for
13-17 s on a phone on a slow network. site.py page() hands each app page to page_part() below, which writes two files
under /assets/i18n/ (content-hashed, cached for good) and names the first in the page (window.MIGI18N_SUB):

  part 1  /assets/i18n/<page>.<hash>.js   what the page's own markup asks for (its head and body as written, read the
          way data/i18n.js reads them) and the translation pairs that the scripts running before the markup add
          (a pair is only added when the dictionary lacks it, so the dictionary's entry must be there first)
  part 2  /assets/i18n/<page>-2.<hash>.js every other entry the page and its scripts can ask for

data/i18n.js loads part 1 before the markup, translates the markup when the parser reaches the end of it (the HOOK
script site.py page() puts there), shows the page, and loads part 2 before the page's own scripts run. Which entries a
page "can ask for": every text the page holds — its markup, inline scripts and each data/*.js it loads (plus
data/facx.js, whose company names janna.js reads from the dictionary itself) — is cut into atoms, the pieces between
tags and quotes; a dictionary key is kept when its Arabic words are atoms (or the pieces of atoms between the places
where tr() and the scripts cut texts) one after the other — how the scripts glue labels, names and numbers together —
or the first words of one (numbers, Latin words and signs in between are free).

The parts decide how fast a page paints, never what it says: en_bloom() writes the Bloom filter of every dictionary
key (/assets/i18n/en.<hash>.bloom, named in part 1). data/i18n.js checks each lookup the parts miss against it and, when
the full dictionary may have that entry, loads the full dictionary (data/i18n-en.js, unchanged) and translates every
text that missed again from its Arabic original. The rules below (spaces, numbers as {n}) follow data/i18n.js tr().

python3 tools/i18n_subset.py <built site dir> [page key ...]   sizes of the parts of a built site (writes nothing)
"""
import hashlib
import html as _html
import json
import math
import os
import re
import struct

# ------------------------------------------------------------------------------------------- the dictionary's rules
JS_WS = '\t\n\x0b\x0c\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
WS_RX = re.compile('[' + JS_WS + ']+')                            # JS /\s+/
NUM_RX = re.compile(r'[0-9\u0660-\u0669][0-9\u0660-\u0669,.:%/\-]*')    # data/i18n.js NUM: numbers become {n}
AR_RX = re.compile(r'[\u0600-\u06FF]')                             # data/i18n.js AR: a text is looked up only when it has one
# an Arabic word: letters, marks and tatweel (not the Arabic comma / semicolon / question mark, digits or per-cent signs)
WORD_RX = re.compile(r'[\u0610-\u061A\u061C\u0620-\u065F\u0670-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FF]+')
CUT_RX = re.compile(r'[<>"\'`]|\$\{|\}')                            # atoms: the pieces between tags, quotes and template ${...}
JS_ESC_RX = re.compile(r'\\(u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])')
# where a text is cut into pieces: where tr() cuts a text it cannot find whole («، », « · », « – », « — », « | », «: »)
# and where the scripts cut their data before showing a part of it (« - », « / »: an address after the shop's name ...)
SEP_RX = re.compile(r'\u060c | \u00b7 | \u2013 | \u2014 | \| |: | - | / ')
TRUNC = 3              # the scripts also show the first words of a name (market.part.html: a product's first 3 words)
# texts no source holds but the browser writes itself (toLocaleDateString("ar-EG") is not routed through the English
# Intl.DateTimeFormat that data/i18n.js installs): whole atoms of every page
ICU_ATOMS = ('يناير', 'فبراير', 'مارس', 'أبريل', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
             'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة',
             'ذو الحجة', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'ص', 'م', 'هـ', 'ج.م.', 'جنيه مصري')
# janna.js reads company names straight from window.I18N_EN (facAll: D0[name]) after loading data/facx.js on demand
ON_DEMAND = {'data/janna.js': ('data/facx.js',)}
# the shared scripts site.py page() loads before every page's markup: they hold data the page's scripts show later, so
# only their translation pairs go into part 1
SHARED_TOP = ('data/i18n.js', 'data/mig-overlay.js', 'data/overlay.js', 'data/plan.js', 'data/plans-live.js', 'data/mig-api.js',
              'data/mig-forms.js', 'data/regions.js', 'data/real.js', 'data/factories.js')
BLOOM_P = 1e-6         # false-positive rate of the Bloom filter: a needless full download per missed lookup (a search of the
                       # factories directory alone checks ~6,600 keys: 2e-4 fetched the whole dictionary on most searches; ~99 KB)
PART_DIR = 'assets/i18n/'
HOOK = '<script>window.MIGI18N_MORE&&MIGI18N_MORE()</script>'      # site.py page(): right after the page's markup


def words(s):
    return tuple(WORD_RX.findall(s))


def key_of(s):
    """data/i18n.js tr(): the key of a text (spaces collapsed, trimmed, numbers -> {n})"""
    return NUM_RX.sub('{n}', WS_RX.sub(' ', s).strip(JS_WS))


def load_dict(path):
    src = open(path, encoding='utf-8').read()
    i = src.index('window.I18N_EN=') + len('window.I18N_EN=')
    d, _ = json.JSONDecoder().raw_decode(src, i)
    return d


# ------------------------------------------------------------------------------------------- atoms
def _unescape_js(s):
    def f(m):
        x = m.group(1)
        if x[0] == 'u' and len(x) > 1:
            try:
                return chr(int(x[2:-1] if x[1] == '{' else x[1:], 16))
            except ValueError:
                return ' '
        if x[0] == 'x' and len(x) == 3:
            return chr(int(x[1:], 16))
        if x in 'nrtvfb0':
            return ' '
        return x
    return JS_ESC_RX.sub(f, s)


def atoms_of_text(text):
    """every piece of a source (markup or script) between tags, quotes and template ${...} that has Arabic words, as the
    Arabic words of its pieces between the places where it can be cut (a tuple of tuples of words)"""
    out = set()
    for seg in CUT_RX.split(_unescape_js(text)):
        if not AR_RX.search(seg):
            continue
        t = WS_RX.sub(' ', _html.unescape(seg))
        a = tuple(words(x) for x in SEP_RX.split(t))
        if any(a):
            out.add(a)
    return out


MAPKEY_RX = re.compile(r'"((?:[^"\\\n]|\\.)*[\u0600-\u06FF](?:[^"\\\n]|\\.)*)"\s*:|\'((?:[^\'\\\n]|\\.)*[\u0600-\u06FF](?:[^\'\\\n]|\\.)*)\'\s*:')


def pair_keys(text):
    """the keys of the Arabic -> English pairs a script adds to the dictionary (Arabic object keys: {"عربي": "English"})"""
    out = set()
    for m in MAPKEY_RX.finditer(text):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        out.add(key_of(_unescape_js(s)))
    return out


def _j(t):
    return '\x01'.join(t)


class Atoms(object):
    """the atoms of the sources of one page. A key is needed when its Arabic words are runs of pieces of atoms one after
    the other, or the first words of a piece"""

    def __init__(self, atoms=()):
        self.runs = set()         # pieces i..j of one atom (its words, joined)
        self.trunc = set()        # the first 1..TRUNC words of a piece
        self.vocab = set()
        self.seen = set()
        for a in atoms:
            self.add(a)

    def add(self, a):
        if a in self.seen:
            return
        self.seen.add(a)
        n = len(a)
        for p in a:
            self.vocab.update(p)
            for i in range(1, min(TRUNC, len(p) - 1) + 1):
                self.trunc.add(_j(p[:i]))
        for i in range(n):
            acc = []
            for k in range(i, n):
                acc.extend(a[k])
                if acc:
                    self.runs.add(_j(acc))

    def needed(self, t):
        """a text of this page can ask for the key with the Arabic words t"""
        if _j(t) in self.trunc:
            return True
        n = len(t)
        reach = [False] * (n + 1)
        reach[0] = True
        for i in range(n):
            if not reach[i]:
                continue
            for j in range(n, i, -1):
                if not reach[j] and _j(t[i:j]) in self.runs:
                    if j == n:
                        return True
                    reach[j] = True
        return False


_FILE_CACHE = {}


DOM_RX = re.compile(r'\bdocument\b|innerHTML|textContent|insertAdjacent|createElement')


def _file(path):
    """(text, atoms, pair keys, touches the page) of a data file, read once per build (the shared scripts are on every page)"""
    try:
        st = os.stat(path)
    except OSError:
        return '', frozenset(), frozenset(), False
    k = (path, st.st_mtime, st.st_size)
    v = _FILE_CACHE.get(k)
    if v is None:
        t = open(path, encoding='utf-8', errors='replace').read()
        v = _FILE_CACHE[k] = (t, frozenset(atoms_of_text(t)), frozenset(pair_keys(t)), bool(DOM_RX.search(t)))
    return v


SCRIPT_RX = re.compile(r'<script\b[^>]*\bsrc="/?(data/[\w./-]+?\.js)(?:\?[^"]*)?"', re.I)
INLINE_RX = re.compile(r'<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', re.I)
NOSCRIPT_RX = re.compile(r'<script\b[\s\S]*?</script>|<style\b[\s\S]*?</style>', re.I)


def page_sources(html_, root):
    """the data/*.js files a page loads (its script tags, then what they load on demand)"""
    seen = []
    for s in SCRIPT_RX.findall(html_):
        if s not in seen:
            seen.append(s)
    for s in list(seen):
        for x in ON_DEMAND.get(s, ()):
            if x not in seen:
                seen.append(x)
    return [s for s in seen if os.path.exists(root + s)]


# ------------------------------------------------------------------------------------------- the dictionary
class Dictionary(object):
    def __init__(self, path):
        self.path = path
        self.hash = hashlib.md5(open(path, 'rb').read()).hexdigest()[:8]
        self.d = load_dict(path)
        self.keys = []                 # (key, words, word set) of every key a text can be looked up with
        for k in self.d:
            if AR_RX.search(k):
                w = words(k)
                self.keys.append((k, w, frozenset(w)))

    def part(self, atoms):
        """the keys the texts of these atoms can ask for"""
        out = set()
        V = atoms.vocab
        for k, w, ws in self.keys:
            if not w:                  # Arabic signs only («؟», «،»): kept, they cost nothing
                out.add(k)
            elif ws <= V and atoms.needed(w):
                out.add(k)
        return out


_DICT = {}


def dictionary(path):
    try:
        st = os.stat(path)
    except OSError:
        return None
    k = (path, st.st_mtime, st.st_size)
    if k not in _DICT:
        _DICT.clear()
        _DICT[k] = Dictionary(path)
    return _DICT[k]


def _atoms(texts, files, root):
    a = Atoms()
    for t in texts:
        for x in atoms_of_text(t):
            a.add(x)
    for s in files:
        for x in _file(root + s)[1]:
            a.add(x)
    for x in ICU_ATOMS:
        a.add((words(x),))
    return a


MAP_RX = re.compile(r'\bvar A\s*=\s*(?=\{)')


def page_pairs(text):
    """the Arabic -> English pairs an inline script of the page adds when the dictionary lacks them (site.py EN_JS and the
    page parts' own lists: «var A = {...}; for (var k in A) if (!(k in D)) D[k] = A[k]»)"""
    out = {}
    for m in MAP_RX.finditer(text):
        try:
            A, _ = json.JSONDecoder().raw_decode(text, m.end())
        except ValueError:
            continue
        if isinstance(A, dict):
            for k, v in A.items():
                if isinstance(k, str) and isinstance(v, str) and AR_RX.search(k):
                    out.setdefault(k, v)
    return out


def parts(D, html_, root):
    """(part 1, part 2) of a page: {key: English}"""
    srcs = page_sources(html_, root)
    every = D.part(_atoms([html_], srcs, root))
    cut = html_.find(HOOK)
    if cut < 0:                        # no hook: one part
        return dict((k, D.d[k]) for k in every), {}
    before, after = html_[:cut], html_[cut:]
    top = page_sources(before, root)
    # a script the page loads before the end of its markup (pay.js, team-seo.js …) may already show something: whole; a data file
    # there (oldfac.js, zones.js … never touch the page) only holds data its scripts show later: its pairs only, like SHARED_TOP
    own = [s for s in top if s not in SHARED_TOP and _file(root + s)[3]]
    mark = _atoms([NOSCRIPT_RX.sub(' ', before)], own, root)
    first = D.part(mark)
    # the pairs the scripts before the markup add: the dictionary's entry must be there before them (they only fill gaps)
    pairs = set()
    for s in top:
        pairs |= _file(root + s)[2]
    for t in INLINE_RX.findall(before):
        pairs |= pair_keys(t)
    first |= set(k for k in pairs if k in D.d)
    p1 = dict((k, D.d[k]) for k in first)
    # the page's own pairs the markup needs (site.py EN_JS …: they run after the markup, the markup is translated before):
    # the same English those scripts would add — unless a script before the markup adds that key too (its value comes first)
    for t in INLINE_RX.findall(after):
        for k, v in page_pairs(t).items():
            if k not in D.d and k not in pairs and k not in p1:
                w = words(k)
                if w and set(w) <= mark.vocab and mark.needed(w):
                    p1[k] = v
    return p1, dict((k, D.d[k]) for k in every if k not in p1)


def part_js(pairs, head, tail=';\n'):
    body = json.dumps(dict(sorted(pairs.items())), ensure_ascii=False, separators=(',', ':'))
    return ('/* English dictionary: part of what this page can show (tools/i18n_subset.py; all of it: data/i18n-en.js) */\n'
            + head + body + tail)


# ------------------------------------------------------------------------------------------- the Bloom filter
def _fnv(s):
    h = 2166136261
    for (c,) in struct.iter_unpack('<H', s.encode('utf-16-le')):
        h = ((h ^ c) * 16777619) & 0xFFFFFFFF
    return h


def _mix(h):
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h | 1


def bloom_bits(keys, p=BLOOM_P):
    """m bits, k hashes (FNV-1a over UTF-16 code units, murmur3's finaliser, double hashing — data/i18n.js inFull())"""
    n = max(1, len(keys))
    m = int(math.ceil(-n * math.log(p) / (math.log(2) ** 2) / 8.0)) * 8
    k = max(1, int(round(m / float(n) * math.log(2))))
    bits = bytearray(m // 8)
    for s in keys:
        h1 = _fnv(s)
        h2 = _mix(h1)
        for i in range(k):
            x = (h1 + i * h2) % m
            bits[x >> 3] |= 1 << (x & 7)
    return m, k, bytes(bits)


_BLOOM = {}


def _write(out_dir, name, data, stale_rx):
    d = out_dir + PART_DIR
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if f != name and re.match(stale_rx, f):
            os.remove(d + f)
    with open(d + name, 'wb') as fh:
        fh.write(data)
    return '/' + PART_DIR + name


def en_bloom(D, out_dir):
    """the Bloom filter of every key of the full dictionary, written once per build: {"u": url, "m": bits, "k": hashes}"""
    if D.hash not in _BLOOM:
        m, k, bits = bloom_bits([x[0] for x in D.keys])
        u = _write(out_dir, 'en.%s.bloom' % hashlib.md5(bits).hexdigest()[:10], bits, r'en\.[0-9a-f]{10}\.bloom$')
        _BLOOM[D.hash] = {'u': u, 'm': m, 'k': k}
    return _BLOOM[D.hash]


def _h(b):
    return hashlib.md5(b).hexdigest()[:10]


# ------------------------------------------------------------------------------------------- site.py page()
MIGPAGE_RX = r'<script>window\.MIGPAGE="%s";</script>'
STATS = {}


def page_part(html_, key, root, out_dir):
    """site.py page(): write this page's parts of the dictionary and name part 1 in the page (window.MIGI18N_SUB, in its
    MIGPAGE script). The page comes back unchanged when it has no MIGPAGE script or there is no dictionary (data/i18n.js
    then loads the full one, as before)"""
    D = dictionary(root + 'data/i18n-en.js')
    tag = re.search(MIGPAGE_RX % re.escape(key or ''), html_)
    if D is None or not tag or not re.match(r'^[\w-]+$', key or ''):
        return html_
    p1, p2 = parts(D, html_, root)
    more = ''
    if p2:
        b2 = part_js(p2, 'window.MIGI18N_ADD&&MIGI18N_ADD(', ');\n').encode('utf-8')
        more = _write(out_dir, '%s-2.%s.js' % (key, _h(b2)), b2, re.escape(key) + r'-2\.[0-9a-f]{10}\.js$')
    head = 'window.MIGI18N_BLOOM=%s;window.MIGI18N_MORE_SRC=%s;window.I18N_EN=' % (
        json.dumps(en_bloom(D, out_dir), separators=(',', ':')), json.dumps(more))
    b1 = part_js(p1, head).encode('utf-8')
    u1 = _write(out_dir, '%s.%s.js' % (key, _h(b1)), b1, re.escape(key) + r'\.[0-9a-f]{10}\.js$')
    STATS[key] = (len(p1), len(b1), len(p2))
    return html_.replace(tag.group(0), '<script>window.MIGPAGE="%s";window.MIGI18N_SUB="%s";</script>' % (key, u1), 1)


if __name__ == '__main__':
    import sys
    import time
    import zlib
    site = sys.argv[1].rstrip('/') + '/'
    D = dictionary(site + 'data/i18n-en.js')
    rows = []
    for dp, dn, fn in os.walk(site):
        rel = os.path.relpath(dp, site)
        if rel.split(os.sep)[0] in ('en', '_seo', 'assets'):
            continue
        for f in fn:
            if f.endswith('.html'):
                h = open(os.path.join(dp, f), encoding='utf-8').read()
                m = re.search(r'<script>window\.MIGPAGE="([\w-]+)";', h)
                if m and (len(sys.argv) < 3 or m.group(1) in sys.argv[2:]):
                    t0 = time.time()
                    p1, p2 = parts(D, h, site)
                    j1 = part_js(p1, '').encode('utf-8')
                    j2 = part_js(p2, '').encode('utf-8')
                    rows.append((m.group(1), len(p1), len(j1), len(zlib.compress(j1, 6)), len(p2), len(j2), len(zlib.compress(j2, 6)), time.time() - t0))
    for r in sorted(rows):
        print('%-18s part 1: %5d keys %8d B (gzip %6d)   part 2: %5d keys %8d B (gzip %6d)   %.1fs' % r)
    print('dictionary %s: %d keys' % (D.hash, len(D.d)))
