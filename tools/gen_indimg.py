# Builds data/indimg.js from img/ind/map.json (industrial photos per zone + per project type, Wikimedia Commons, see credits).
# - MIGIND.zone(id): photo for an industrial city/zone page
# - project photos: overrides MIG.PROJECTS[i][16] by project type (wind, solar, water, port, rail …) so cards show the kind of project.
import json, os
B = '/home/user/madeinegyptgate/'
m = json.load(open(B + 'img/ind/map.json'))
zones = {k: v for k, v in m.get('zones', {}).items() if os.path.exists(B + v)}
prj = {}
for k, v in m.get('projects', {}).items():
    arr = v if isinstance(v, list) else [v]
    arr = [x for x in arr if os.path.exists(B + x)]
    if arr: prj[k] = arr
RULES = [
    ('wind', 'رياح'), ('solar', 'شمسي'), ('rail', 'قطار|مترو|مونوريل|ترام|سكك|سكة'), ('airport', 'مطار'), ('tunnel', 'نفق'),
    ('port', 'ميناء|موانئ|رصيف|حاويات|مرسى'), ('water', 'تحلية|مياه|صرف|معالجة'), ('petro', 'بتروكيماو|تكرير|بولي|أمونيا|أسمدة|كلور|غاز|ميثانول|إيثيلين'),
    ('cement', 'أسمنت|اسمنت'), ('mining', 'منجم|تعدين|فوسفات|ذهب'), ('power', 'نووي|كهرباء|توليد|محول|طاقة'), ('road', 'طريق|كوبري|محور|جسر'),
    ('agri', 'زراع|صوامع|ري |استصلاح'), ('industry', 'مجمع|مصنع|مصهر|صناعي|صناعية|ألومنيوم|صلب|حديد'), ('housing', 'سكني|مساكن|فندق|حي |العاصمة|أبراج|برج|متعدد|مدينة|منتجع|متحف'),
]
RULES = [r for r in RULES if r[0] in prj]
js = ('/* Industrial photos (Wikimedia Commons; credits in img/ind/map.json). */\n(function () {\n'
      'var Z = ' + json.dumps(zones, ensure_ascii=False) + ', P = ' + json.dumps(prj, ensure_ascii=False) + ', R = ' + json.dumps(RULES, ensure_ascii=False) + ';\n'
      'function type(t) { for (var i = 0; i < R.length; i++) if (new RegExp(R[i][1]).test(t)) return R[i][0]; return P.industry ? "industry" : (P.housing ? "housing" : ""); }\n'
      'var seen = {};\n'
      'function prjImg(p, i) { var k = type((p[1] || "") + " " + (p[4] || "")); var a = P[k]; if (!a) return ""; var n = seen[k] = (seen[k] || 0) + 1; return a[(n - 1) % a.length]; }\n'
      'window.MIGIND = { zone: function (id) { return Z[id] || ""; }, type: type, prj: prjImg, zones: Z, projects: P };\n'
      'if (window.MIG && MIG.PROJECTS) MIG.PROJECTS.forEach(function (p, i) { var x = prjImg(p, i); if (x) p[16] = x; });\n'
      '})();\n')
open(B + 'data/indimg.js', 'w').write(js)
print('zones', len(zones), 'project types', {k: len(v) for k, v in prj.items()})
