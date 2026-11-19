# Builds data/egadm.js: simplified governorate boundaries of Egypt (geoBoundaries gbOpen EGY ADM1, CC BY 4.0 / ODbL from OpenStreetMap)
# used to draw internal governorate borders on the interactive map (data/samap.js).
import json, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else 'adm1.geojson'
OUT = '/home/user/madeinegyptgate/data/egadm.js'
CODE = {'Cairo': 'CAI', 'Giza': 'GIZ', 'Alexandria': 'ALX', 'Qalyubia': 'QLB', 'Al Sharqia': 'SHR', 'Dakahlia': 'DKH', 'Gharbiyya': 'GHR',
        'Monufia': 'MNF', 'Beheira': 'BHR', 'Kafr el-Sheikh': 'KFS', 'Damietta': 'DMT', 'Port Said': 'PTS', 'Ismailia': 'ISM', 'Suez': 'SUZ',
        'Faiyum': 'FYM', 'Beni Suef': 'BNS', 'Minya': 'MNY', 'Asyut': 'AST', 'Sohag': 'SHG', 'Qena': 'QNA', 'Luxor': 'LXR', 'Aswan': 'ASN',
        'Red Sea': 'BBA', 'New Valley': 'WAD', 'Matrouh': 'MTR', 'North Sinai': 'NSN', 'South Sinai': 'JSN'}

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = (dx * dx + dy * dy) ** .5
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / n if n else ((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2) ** .5
        if d > best: best, bi = d, i
    if best > eps:
        return rdp(pts[:bi + 1], eps)[:-1] + rdp(pts[bi:], eps)
    return [a, b]

d = json.load(open(SRC))
out = []
for f in d['features']:
    nm = f['properties']['shapeName'].replace(' Governorate', '').replace(' Governate', '')
    code = CODE.get(nm)
    if not code:
        raise SystemExit('unknown ' + nm)
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    rings = []
    for poly in polys:
        r = poly[0]
        xs = [p[0] for p in r]; ys = [p[1] for p in r]
        if (max(xs) - min(xs)) * (max(ys) - min(ys)) < 0.004: continue  # drop tiny islands
        s = rdp([[round(p[0], 3), round(p[1], 3)] for p in r], 0.012)
        if len(s) >= 4: rings.append([v for p in s for v in (round(p[0], 2), round(p[1], 2))])
    out.append([code, rings])
js = '/* Egypt governorate boundaries, simplified (geoBoundaries gbOpen EGY ADM1, from OpenStreetMap; ODbL). [code, [flat lon,lat rings]]. */\nwindow.EGADM=' + json.dumps(out, separators=(',', ':')) + ';\n'
open(OUT, 'w').write(js)
print(len(out), sum(len(r) for _, rs in out for r in rs) // 2, 'points', len(js), 'bytes')
