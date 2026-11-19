# Step 1 of the UAE conversion: global identity replacements across source files (idempotent-ish; run once on a fresh copy)
import os, re, glob
B = '/home/user/madeinuaegate/'
FILES = [f for f in glob.glob(B + '*.py') + glob.glob(B + '*.html') + glob.glob(B + 'data/*.js') + glob.glob(B + 'tools/*.py') + glob.glob(B + 'tools/*.md')
         if not f.endswith(('world.js', 'rebrand_uae.py', 'i18n-en.js'))]
OP_AR = 'مجمع التعامل الإلكتروني'
OP_ADDR = 'مكتب رقم 103، الطابق الأول، طريق أم هرير، مبنى المخاوي، عود ميثاء، دبي، الإمارات العربية المتحدة · ص.ب 80744'
PAIRS = [
 ('/home/user/madeinsaudigate', '/home/user/madeinuaegate'),
 ('info@madeinsaudigate.com', 'info@madeinuaegate.ae'), ('madeinsaudigate.com', 'madeinuaegate.ae'),
 ('+966 54438 9926', '00971569855558'), ('00966 54438 9926', '00971569855558'), ('+966544389926', '00971569855558'), ('966544389926', '971569855558'), ('00966544389926', '00971569855558'),
 ('مبنى 2164، شارع صالح الحريري الأفندي، حي العوالي، الرياض 14924', OP_ADDR), ('مبنى 2164، شارع صالح الحريري الأفندي، حي العوالي، الرياض', OP_ADDR), ('مبنى 2164، شارع صالح الحريري الأفندي، حي العوالي', 'مكتب 103، مبنى المخاوي، عود ميثاء'),
 ('شركة اتحاد الخليج الشاملة', OP_AR), ('مؤسسة اتحاد الخليج الشاملة', OP_AR), ('Gulf Union Comprehensive Company', 'ETender Gate Portal LLC'),
 ('منصة صنع في السعودية', 'منصة صنع في الإمارات'), ('لمنصة صنع في السعودية', 'لمنصة صنع في الإمارات'), ('صنع في السعودية', 'صنع في الإمارات'),
 ('Made in Saudi Gate', 'Made in UAE Gate'), ('Made in Saudi', 'Made in UAE'), ('MADE IN SAUDI', 'MADE IN UAE'),
 ('المملكة العربية السعودية', 'دولة الإمارات العربية المتحدة'),
 ('ضريبة القيمة المضافة 15%', 'ضريبة القيمة المضافة 5%'), ('VAT 15%', 'VAT 5%'), ('(fee() * 1.15)', '(fee() * 1.05)'), ('v = f * .15', 'v = f * .05'),
 (' ر.س', ' د.إ'), ('ر.س', 'د.إ'), ('ريال سعودي', 'درهم إماراتي'), ('ريالاً', 'درهماً'), ('ريال', 'درهم'), ('"SAR"', '"AED"'), ("'SAR'", "'AED'"), ('SAR ', 'AED '), (' SAR', ' AED'),
 ('sanad.jpg', 'sultan.png'), ('«سند»', '«سلطان»'), ('سند · مساعدك الذكي', 'سلطان · مساعدك الذكي'), ('أنا سند،', 'أنا سلطان،'), ('المساعد الذكي سند', 'المساعد الذكي سلطان'),
 ('7051473424', 'يُضاف من الرخصة التجارية'), ('314192111100003', 'يُضاف من شهادة التسجيل الضريبي'), ('3141921111', '—'), ('100251149779398', '—'),
]
COLORS = [
 ('#0E7A42', '#00843D'), ('#0e7a42', '#00843D'), ('#0B4D2B', '#005A2B'), ('#0b4d2b', '#005A2B'), ('#062E19', '#003D1D'), ('#12723F', '#00843D'), ('#1E9157', '#169A50'),
 ('#C5A059', '#D2172A'), ('#c5a059', '#D2172A'), ('#A38141', '#A30F1F'), ('#FBF5E8', '#FDECEE'), ('#EBDDBE', '#F5C6CC'), ('#D8B566', '#E23A4B'), ('#C9A24B', '#D2172A'), ('#8A6A2F', '#A30F1F'),
 ('#D8B46E', '#FF6B78'), ('#2A2316', '#2A1214'), ('rgba(197,160,89', 'rgba(210,23,42'), ('rgba(197, 160, 89', 'rgba(210, 23, 42'),
]
n_total = 0
for f in FILES:
    s = open(f, encoding='utf-8').read(); o = s
    for a, b in PAIRS + COLORS: s = s.replace(a, b)
    # text on the (now red) accent buttons must be white
    s = s.replace('background: var(--gold); color: #1A1204', 'background: var(--gold); color: #fff').replace('color: #1A1204', 'color: #fff')
    if s != o:
        open(f, 'w', encoding='utf-8').write(s); n_total += 1
print('files changed', n_total)
# flag: Saudi -> UAE
p = B + 'site.py'; s = open(p, encoding='utf-8').read()
s = re.sub(r"FLAG_SA = '<svg.*?</svg>'", "FLAG_SA = '<svg class=\"flg\" viewBox=\"0 0 60 30\" aria-hidden=\"true\"><rect width=\"60\" height=\"10\" fill=\"#00732F\"/><rect y=\"10\" width=\"60\" height=\"10\" fill=\"#fff\"/><rect y=\"20\" width=\"60\" height=\"10\" fill=\"#000\"/><rect width=\"16\" height=\"30\" fill=\"#FF0000\"/></svg>'", s, count=1, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
print('flag ok' if 'fill="#00732F"' in s else 'FLAG NOT REPLACED')
