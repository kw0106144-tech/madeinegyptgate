# Step 1 of the Egypt conversion: global identity replacements across source files (run once on a fresh copy of the UAE platform)
import os, re, glob
B = '/home/user/madeinegyptgate/'
FILES = [f for f in glob.glob(B + '*.py') + glob.glob(B + '*.html') + glob.glob(B + '*.md') + glob.glob(B + 'data/*.js') + glob.glob(B + 'data/*.json') + glob.glob(B + 'tools/*.py') + glob.glob(B + 'tools/*.md')
         if not f.endswith(('world.js', 'rebrand_eg.py', 'rebrand_uae.py'))]
OP = 'الجمعية المصرية للتنمية الصناعية'
OP_EN = 'Egyptian Society for Industrial Development'
ADDR = 'الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)'
PAIRS = [
 ('/home/user/madeinuaegate', '/home/user/madeinegyptgate'),
 ('info@madeinuaegate.ae', 'info@madeinegyptgate.com'), ('madeinuaegate.ae', 'madeinegyptgate.com'),
 ('مجمع للتعامل الإلكتروني ايتندر جيت شركة الشخص الواحد ذ.م.م', OP), ('مجمع للتعامل الإلكتروني ايتندر جيت', OP), ('مجمع التعامل الإلكتروني', OP),
 ('ETENDER GATE PORTAL CO. L.L.C', OP_EN), ('ETender Gate Portal LLC', OP_EN),
 ('الطابق الأول، مكتب رقم 103-09، مبنى المخاوي، طريق أم هرير، عود ميثاء، دبي، الإمارات العربية المتحدة', ADDR + '، جمهورية مصر العربية'),
 ('الطابق الأول، مكتب رقم 103-09، مبنى المخاوي، طريق أم هرير، عود ميثاء، دبي', ADDR),
 ('+971 4 398 4283', '02 38346757'), ('+97143984283', '+20238346757'),
 ('00971569855558', '01279188996'), ('971569855558', '201279188996'), ('+971569855558', '+201279188996'),
 ('منصة صنع في الإمارات', 'منصة صنع في مصر'), ('لمنصة صنع في الإمارات', 'لمنصة صنع في مصر'), ('صنع في الإمارات', 'صنع في مصر'),
 ('Made in UAE Gate', 'Made in Egypt Gate'), ('Made in UAE', 'Made in Egypt'), ('MADE IN UAE', 'MADE IN EGYPT'), ('made in UAE', 'made in Egypt'),
 ('دولة الإمارات العربية المتحدة', 'جمهورية مصر العربية'), ('الإمارات العربية المتحدة', 'جمهورية مصر العربية'),
 ('ضريبة القيمة المضافة 5%', 'ضريبة القيمة المضافة 14%'), ('VAT 5%', 'VAT 14%'), ('(fee() * 1.05)', '(fee() * 1.14)'), ('v = f * .05', 'v = f * .14'), ('* 0.05', '* 0.14'), ('* .05', '* .14'), ('5% VAT', '14% VAT'),
 (' د.إ', ' ج.م'), ('د.إ', 'ج.م'), ('درهم إماراتي', 'جنيه مصري'), ('درهماً', 'جنيهاً'), ('دراهم', 'جنيهات'), ('درهم', 'جنيه'), ('"AED"', '"EGP"'), ("'AED'", "'EGP'"), ('AED ', 'EGP '), (' AED', ' EGP'), ('ar-AE', 'ar-EG'), ('en-AE', 'en-EG'), ('ar_AE', 'ar_EG'),
 ('sultan.png', 'hassan.png'), ('«سلطان»', '«حسن»'), ('سلطان · مساعدك الذكي', 'حسن · مساعدك الذكي'), ('أنا سلطان،', 'أنا حسن،'), ('المساعد الذكي سلطان', 'المساعد الذكي حسن'), ('سلطان', 'حسن'),
 ('1145196', '—'), ('1895967', '—'), ('104120863600003', '—'),
]
COLORS = [
 ('#00843D', '#C8102E'), ('#00843d', '#C8102E'), ('#005A2B', '#8E0B20'), ('#003D1D', '#4A0510'), ('#0A5C31', '#6E0A18'), ('#169A50', '#E0283F'), ('#2FA968', '#F0566A'),
 ('#EEF9F2', '#FDEEEF'), ('#E6F0EA', '#F6E4E6'), ('#E3F6EA', '#FBE7E9'), ('#04190E', '#1A0306'), ('#07120C', '#120708'), ('#0E1C14', '#1C0E10'), ('#13261B', '#261316'), ('#1F3528', '#35201F'), ('#E7EFEA', '#F2E8E9'), ('#94A89C', '#A8989A'), ('#0B3D22', '#3D0B12'), ('#10291B', '#2B1013'),
 ('#D2172A', '#C09300'), ('#A30F1F', '#8C6A00'), ('#FDECEE', '#FBF4DE'), ('#F5C6CC', '#EADBA8'), ('#E23A4B', '#D6AC2A'), ('#FF6B78', '#E8C766'), ('#2A1214', '#2A2208'),
 ('rgba(210,23,42', 'rgba(192,147,0'), ('rgba(210, 23, 42', 'rgba(192, 147, 0'), ('rgba(0,132,61', 'rgba(200,16,46'), ('rgba(0, 132, 61', 'rgba(200, 16, 46'), ('rgba(14,122,66', 'rgba(200,16,46'), ('rgba(11,77,43', 'rgba(142,11,32'),
]
n = 0
for f in FILES:
    s = open(f, encoding='utf-8').read(); o = s
    for a, b in PAIRS + COLORS: s = s.replace(a, b)
    # gold accent buttons need dark text
    s = s.replace('background: var(--gold); color: #fff', 'background: var(--gold); color: #1A1204')
    if s != o: open(f, 'w', encoding='utf-8').write(s); n += 1
print('files changed', n)
