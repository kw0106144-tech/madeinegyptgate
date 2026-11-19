# Renames the assistant persona «حسن» (Hassan, male) to «جنة» (Janna, female) in the bot texts and the English dictionaries.
# Only persona phrases are touched (never company names such as «حسن علام»).
import json, re
B = '/home/user/madeinegyptgate/'
AR = [
    ('أنت «حسن»، المساعد الذكي', 'أنتِ «جنة»، المساعدة الذكية'),
    ('شاب مصري ودود', 'شابة مصرية ودودة'),
    ('حسن · مساعدك الذكي', 'جنة · مساعدتك الذكية'),
    ('افتح المساعد الذكي حسن', 'افتح المساعدة الذكية جنة'),
    ('المساعد الذكي حسن', 'المساعدة الذكية جنة'),
    ('والمساعد الذكي «حسن»', 'والمساعدة الذكية «جنة»'),
    ('أنا «حسن» مساعدك الذكي', 'أنا «جنة» مساعدتك الذكية'),
    ('أنا «حسن»، مساعدك الذكي', 'أنا «جنة»، مساعدتك الذكية'),
    ('أنا حسن، مساعدك الذكي', 'أنا جنة، مساعدتك الذكية'),
    ('حسن يكتب…', 'جنة بتكتب…'),
    ('حسن مساعد ذكاء اصطناعي وقد يخطئ', 'جنة مساعدة ذكاء اصطناعي وقد تخطئ'),
    ('مع المساعد «حسن»', 'مع المساعدة «جنة»'),
    ('مساعد ذكاء اصطناعي · متصل الآن', 'مساعدة ذكاء اصطناعي · متصلة الآن'),
    ('«حسن»', '«جنة»'),
]
EN = [('Hassan', 'Janna'), (' he ', ' she '), (' his ', ' her '), ('He ', 'She ')]
def ar(s):
    for a, b in AR: s = s.replace(a, b)
    return s
def en(s):
    s = s.replace('Hassan', 'Janna')
    return s
# bot.js / about.part.py (Arabic source)
for f in ['data/bot.js', 'about.part.py']:
    t = open(B + f, encoding='utf-8').read(); t2 = ar(t)
    if f == 'data/bot.js': t2 = t2.replace('"Hello, I chatted with the assistant Hassan', '"Hello, I chatted with the assistant Janna').replace('young Egyptian character', 'young Egyptian woman character')
    open(B + f, 'w', encoding='utf-8').write(t2); print(f, t != t2)
# dictionaries: add new keys for renamed Arabic, rename Hassan in values
def fix_dict(path, var):
    s = open(B + path, encoding='utf-8').read()
    i = s.index('window.' + var + '=') + len('window.' + var + '=')
    j = s.index(';\n', i)
    D = json.loads(s[i:j]); n = 0
    for k, v in list(D.items()):
        k2 = ar(k)
        v2 = en(v) if isinstance(v, str) else v
        if k2 != k or v2 != v:
            D[k2] = v2; n += 1
    s = s[:i] + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + s[j:]
    open(B + path, 'w', encoding='utf-8').write(s); print(path, n)
fix_dict('data/bot-en.js', 'MIGBOT_EN')
fix_dict('data/i18n-en.js', 'I18N_EN')
