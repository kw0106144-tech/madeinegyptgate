#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Real-media index for the factory profile pages: seo/company-media.json

    python3 tools/company_media.py                    # model from the generator (re-dumps data/*.js with node when needed)
    python3 tools/company_media.py --data build/data.json [--check] [--report]
    python3 tools/test_company_media.py               # unit tests (COMPANY_MEDIA_FULL=1 adds a rebuild from the model)

How the site uses it (integration, 2026-11-18): the generator REGENERATES the index on every build. seo_fprof.part.py (the
rich company profile) calls, at its first company page, on the generator's own model (no second model, ≈1 s):
    company_media.build_index(S, root=B, tr=tr, write=True)
which rewrites seo/company-media.json and refreshes img/fprof/ (unchanged inputs → byte-identical files, nothing rewritten).
Commit both whenever they change (they change only with the data or with the tables below): the JSON is the reviewable
record of every attached photo / video / fact, and img/fprof/ is served from the tree like the rest of /img/.
Running this script by hand is for review only (--check verifies every reference, --report lists every extracted fact;
≈5 s when img/fprof/ is in place, ≈17 s from nothing). MIG_FPROF_MEDIA=<file> makes the generator read a file instead,
MIG_FPROF_MEDIA_REBUILD=0 makes it read the committed seo/company-media.json without regenerating it. Readers outside the
generator:   M = company_media.load_index(B).get(c['path']) or company_media.EMPTY

Pure Python 3 + Pillow, deterministic (no clock, no network, sorted inputs), offline. The company model (paths, zones,
governorates, linked products …) is the generator's own: seo_build.part.py is exec'd read-only and seo_prepare() runs
into a throw-away directory, so every key below is exactly the generator's c['path'] for the Arabic page.
Derivatives go to img/fprof/{logo,prod,photo,ctx}/ (WebP; names carry a hash of the source and the settings, so /img/*'s
30-day cache never serves a stale picture); files no entry references any more are removed.

Contract (one entry per company page, keyed by c['path']; keys starting with "_" are metadata):
  logo:     {src, w, h, from} | null                    from: "logo-sheet" (img/old/lg*.jpg) | "product-listing"
  photos:   [{src, w, h, sm, cap_ar, cap_en, credit, origin}]   photos OF the company's own plant (never another company's)
  videos:   [{yt, title_ar, title_en, thumb, thumb_w, thumb_h, channel, date, duration}]   only videos about THIS company
  products: [{key, name_ar, name_en, img, cat_ar, cat_en, href, from}]  from: "listing" | "offer" | "name"; img only when a
            real photo of that product exists (no logos, placeholders or photos shared by several listings)
  context:  [{src, w, h, sm, cap_ar, cap_en, kind, credit}]   never the company's own; the caption says what the photo
            shows and that it is not the company. kind: zone (its industrial city/zone, or the city named in its location),
            gov (its governorate), sector (a generic illustration: no credit, the stock source was not recorded)
  facts:    {key: {label_ar, label_en, value_ar, value_en, source, source_url?, href?}}   only facts stated in the data
            (value_en null = no faithful English rendering; show the fact on Arabic pages only)

Honesty rules this file enforces (owner spec, factory-profile task): no invented numbers, photos, videos or certificates; a
photo is tied to a company only when its source names that company (Wikimedia Commons description, checked 2026-11-18); a
video only when its title is about that company (explicit table, no word matching); place photos are captioned with what
they really show (the zone map of img/ind/map.json is illustrative for most zones, so it is NOT used); no person names,
phones or e-mails (facts come from the generator's scrubbed descriptions and never quote free text).
"""
import argparse
import contextlib
import hashlib
import io
import json
import os
import re
import shutil
import sys
import tempfile

SCHEMA = 1
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.dirname(HERE) + '/'
OUT_JSON = 'seo/company-media.json'
IMG_DIR = 'img/fprof/'
PHOTO_WIDTHS = (1280, 640)
PHOTO_MAX_BYTES = 180 * 1024
WEBP_Q_PHOTO = 80
WEBP_Q_SMALL = 90
WEBP_M_PHOTO = 4      # libwebp effort for photos (6 = ~4 % smaller, 3× slower on a cold run)
WEBP_M_SMALL = 6

# ---------------------------------------------------------------------------------------------------------------------------
# Curated, verified tables. Every row says where the evidence is; the unit test checks that each row still resolves.
# ---------------------------------------------------------------------------------------------------------------------------

# Wikimedia Commons metadata (author / licence / page), checked through the Commons API on 2026-11-18.
COMMONS = {
    'img/ind/sadat-ezz-steel.jpg': ('Faris knight', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Ezz_Steel-Sadat_City.jpg', '2009'),
    'img/ind/borg-farag-allah-1.jpg': ('Abdelrhman 1990', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Farag_Allah_factory_1.jpg', '2021'),
    'img/ind/borg-farag-allah-2.jpg': ('Abdelrhman 1990', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Farag_Allah_factory_2.jpg', '2022'),
    'img/ind/mog-factory.jpg': ('MOGFORDEVELOPEDINDUSTRIES', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:MOG_For_Developed_Industries.jpg', '2018'),
    'img/ind/armant-sugar-plant.jpg': ('Rémih', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Sugar_plant_Egypt.JPG', '2009'),
    'img/ind/sokhna-industrial-zone.jpg': ('Abdelrhman 1990', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Ain_Sokhna_Industrial_Zone.jpg', '2026'),
    'img/ind/smart-village.jpg': ('Smart Village', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Smartvillagelandscape.JPG', ''),
    'img/ind/borg-tech-park.jpg': ('Abdelrhman 1990', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:New_Borg_El_Arab_Technology_Park.jpg', '2019'),
    # img/cities/*: matched to their Commons originals by image comparison (mean abs. difference < 3 on 32×24 greyscale)
    'img/cities/10th-of-ramadan.jpg': ('كريم رائد', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:%D9%85%D8%AF%D8%AE%D9%84_%D9%85%D8%AF%D9%8A%D9%86%D8%A9_%D8%A7%D9%84%D8%B9%D8%A7%D8%B4%D8%B1_%D9%85%D9%86_%D8%B1%D9%85%D8%B6%D8%A7%D9%86.jpg', '2025'),
    'img/cities/6th-of-october.jpg': ('Mujaddara', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:6th_of_October_City,_Giza_Governorate,_Egypt_-_panoramio.jpg', ''),
    'img/cities/mahalla-el-kubra.jpg': ('Faris knight', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:El_Mahalla_El_Kobra_gate.JPG', '2014'),
    'img/cities/kafr-el-dawwar.jpg': ('Faris knight', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Kafr_El-Dawar.JPG', '2011'),
}

# Photos of a company's OWN plant. 'who' = (data set, exact name as in data/facx.js or data/oldfac.js).
OWN_PHOTOS = [
    {'file': 'img/ind/sadat-ezz-steel.jpg', 'who': [('facx', 'حديد عز - مصنع مدينة السادات'), ('facx', 'حديد عز')],
     'cap_ar': 'جانب من مصنع حديد عز بمدينة السادات (صورة عامة من ويكيميديا كومنز، 2009)',
     'cap_en': 'Part of the Ezz Steel plant in Sadat City (public photo from Wikimedia Commons, 2009)',
     'evidence': 'Commons description: «جانب من مصنع عز للحديد والصلب بمدينة السادات - مصر.»'},
    {'file': 'img/ind/borg-farag-allah-1.jpg', 'who': [('facx', 'فرج الله للصناعات الغذائية')],
     'cap_ar': 'مصنع فرج الله للصناعات الغذائية بمدينة برج العرب الجديدة (صورة عامة من ويكيميديا كومنز، 2021)',
     'cap_en': 'The Faragalla Food Industries factory in New Borg El Arab (public photo from Wikimedia Commons, 2021)',
     'evidence': 'Commons description: «مصنع فرج الله للصناعات الغذائية بمدينة برج العرب الجديدة»'},
    {'file': 'img/ind/borg-farag-allah-2.jpg', 'who': [('facx', 'فرج الله للصناعات الغذائية')],
     'cap_ar': 'مصنع فرج الله بمدينة برج العرب الجديدة (صورة عامة من ويكيميديا كومنز، 2022)',
     'cap_en': 'The Faragalla factory in New Borg El Arab (public photo from Wikimedia Commons, 2022)',
     'evidence': 'Commons description: «مصنع فرج الله بمدينة برج العرب الجديدة.»'},
    {'file': 'img/ind/mog-factory.jpg', 'who': [('fac', 'شركة موج للصناعات المتطورة')],
     'cap_ar': 'مبنى مصنع موج للصناعات المتطورة (ويكيميديا كومنز، 2018)',
     'cap_en': 'The MOG for Developed Industries factory building (Wikimedia Commons, 2018)',
     'evidence': 'Commons file «MOG For Developed Industries.jpg» (sign «MOG – موج للصناعات المتطورة» in the photo)'},
    {'file': 'img/ind/armant-sugar-plant.jpg', 'who': [('facx', 'مصنع سكر أرمنت - الشركة المصرية للسكر والصناعات التكاملية')],
     'cap_ar': 'مصنع السكر قرب أرمنت (صورة عامة من ويكيميديا كومنز، 2009)',
     'cap_en': 'The sugar plant near Armant (public photo from Wikimedia Commons, 2009)',
     'evidence': 'Commons description: «Sugar plant near Armant, Egypt» (category Sugar refineries in Egypt)'},
]

# Videos explicitly about one company (data/videos.js has no company field: the title names the company).
VIDEOS = [
    {'yt': 'j_SYtfP5rkY', 'who': [('facx', 'مصر للغزل والنسيج (غزل المحلة)')],
     'evidence': 'title «100 عام من الحكاية.. جولة خاصة داخل قلعة المحلة للغزل والنسيج»'},
    {'yt': '6bgxdEAjeNI', 'who': [('facx', 'النصر لصناعة السيارات')],
     'evidence': 'title «من داخل مصنع النصر للسيارات.. SN Automotive تكشف عن أول سيارة كهربائية مجمعة محليًا»'},
]

# Zone / city photos that really show that zone or city (zone id = seo/config.json zone_match id).
ZONE_PHOTOS = {
    'ic-10th-of-ramadan': ('img/cities/10th-of-ramadan.jpg', 'صورة من مدينة العاشر من رمضان: مدخل المدينة', 'Photo from 10th of Ramadan City: the city entrance'),
    'ic-6th-of-october': ('img/cities/6th-of-october.jpg', 'صورة من مدينة السادس من أكتوبر', 'Photo from 6th of October City'),
    'ic-new-borg-el-arab': ('img/ind/borg-tech-park.jpg', 'صورة من مدينة برج العرب الجديدة: مبنى الجهاز القومي لتنظيم الاتصالات بمجمع التكنولوجيا',
                            'Photo from New Borg El Arab: the NTRA building at the Technology Park'),
    'sczone-sokhna-iz': ('img/ind/sokhna-industrial-zone.jpg', 'صورة من المنطقة الصناعية بالعين السخنة', 'Photo from the Ain Sokhna Industrial Zone'),
    'teda-egypt-sokhna': ('img/ind/sokhna-industrial-zone.jpg', 'صورة من المنطقة الصناعية بالعين السخنة', 'Photo from the Ain Sokhna Industrial Zone'),
    'tp-smart-village': ('img/ind/smart-village.jpg', 'صورة من القرية الذكية', 'Photo from Smart Village'),
}
# a city named in the company's location field (not a zone of seo/config.json)
CITY_PHOTOS = [
    (r'المحل[ةه] الكبر[ىي]', 'img/cities/mahalla-el-kubra.jpg', 'صورة من مدينة المحلة الكبرى: بوابة المدينة على طريق طنطا', 'Photo from El Mahalla El Kubra: the city gate on the Tanta road'),
    (r'كفر الدو(?:ّ)?ار', 'img/cities/kafr-el-dawwar.jpg', 'صورة من مدينة كفر الدوار: المدخل الغربي للمدينة', 'Photo from Kafr El Dawwar: the western entrance of the city'),
]
# governorate photos (img/gov/gv-<code>.jpg, data/regions.js): what each one shows + Commons credit (checked 2026-11-18)
GOV_PHOTOS = {
    'CAI': ('قلعة صلاح الدين ومسجد محمد علي', 'the Citadel of Saladin and the Muhammad Ali Mosque', 'Ahmed Al.Badawy', 'CC BY-SA 2.0', 'Flickr_-_HuTect_ShOts_-_Citadel_of_Salah_El.Din_and_Masjid_Muhammad_Ali_%D9%82%D9%84%D8%B9%D8%A9_%D8%B5%D9%84%D8%A7%D8%AD_%D8%A7%D9%84%D8%AF%D9%8A%D9%86_%D8%A7%D9%84%D8%A3%D9%8A%D9%88%D8%A8%D9%8A_%D9%88%D9%85%D8%B3%D8%AC%D8%AF_%D9%85%D8%AD%D9%85%D8%AF_%D8%B9%D9%84%D9%8A_-_Cairo_-_Egypt_-_17_04_2010_(4).jpg'),
    'GIZ': ('أهرامات الجيزة', 'the Giza pyramids', 'Ricardo Liberato', 'CC BY-SA 2.0', 'All_Gizah_Pyramids.jpg'),
    'ALX': ('قلعة قايتباي', 'the Citadel of Qaitbay', 'Ziad osman', 'CC BY-SA 4.0', 'Citadel_of_Qaitbay_alexandria1.jpg'),
    'QLB': ('القناطر الخيرية', 'Al-Qanatir al-Khayriyah', 'Mohamedwardany', 'CC BY-SA 4.0', '%D8%A7%D9%84%D9%86%D9%82%D9%84_%D9%88%D8%A7%D9%84%D8%B5%D9%8A%D8%AF_%D9%81%D9%8A_%D8%A7%D9%84%D9%82%D9%86%D8%A7%D8%B7%D8%B1_%D8%A7%D9%84%D8%AE%D9%8A%D8%B1%D9%8A%D8%A9.jpg'),
    'SHR': ('مسجد الفتح بالزقازيق', 'Al-Fath Mosque in Zagazig', 'Ameer Attia', 'CC BY 3.0', '%D9%85%D8%B3%D8%AC%D8%AF_%D8%A7%D9%84%D9%81%D8%AA%D8%AD_-_panoramio.jpg'),
    'DKH': ('كوبري القطار على النيل في المنصورة', 'the railway bridge over the Nile at El Mansoura', 'Ahmed Al.Badawy', 'CC BY-SA 2.0', 'Flickr_-_HuTect_ShOts_-_Train_Bridge_with_Nile_River_-_El.Mansoura_-_Egypt_-_04_04_2010.jpg'),
    'GHR': ('مسجد السيد البدوي في طنطا', 'the El-Sayed el-Badawy Mosque in Tanta', 'Ashashyou', 'CC BY-SA 3.0', 'El-Sayed_el-Badawy_Mosque_-_Tanta_-_Egypt2.JPG'),
    'MNF': ('قرية الكتامية بمركز الباجور', 'El-Kotamiya village, El Bagour', 'Faris knight', 'CC BY-SA 4.0', 'El-Kotamiya-2.jpg'),
    'BHR': ('منزل الأمصيلي في رشيد', 'the Amasyali House in Rashid (Rosetta)', 'Wael Mostafa', 'CC BY-SA 4.0', 'Rashid_For_Wiki-24.jpg'),
    'KFS': ('صيادون في بحيرة البرلس', 'fishermen on Lake Burullus', 'Myousry6666', 'CC BY-SA 4.0', 'Fishers_and_small_island_in_Lake_Burullus_-_Egypt.jpg'),
    'DMT': ('مدينة دمياط ونهر النيل', 'Damietta city and the Nile', 'Tarekheikal', 'CC BY-SA 4.0', 'Damietta_City_and_the_Nile.jpg'),
    'PTS': ('مبنى هيئة قناة السويس في بورسعيد', 'the Suez Canal Authority building in Port Said', 'Vyacheslav Argenberg', 'CC BY 4.0', 'Port_Said,_Egypt,_Suez_Canal_Authority.jpg'),
    'ISM': ('كوبري قناة السويس عند القنطرة', 'the Suez Canal Bridge at El Qantara', 'Godot13', 'CC BY-SA 4.0', 'Suez_Canal_Bridge_(2008)_10.jpg'),
    # SUZ: img/gov/gv-SUZ.jpg is «Suez Canal Entrance.jpg», taken at Port Said (Commons coordinates 31.26 N 32.31 E): not used
    'NSN': ('قرية على بحيرة البردويل', 'a village on Lake Bardawil', 'Mmelouk', 'CC BY-SA 4.0', 'Sina_Bardawil_village.jpg'),
    'JSN': ('دير سانت كاترين', "Saint Catherine's Monastery", 'Berthold Werner', 'CC BY-SA 3.0', 'Katharinenkloster_Sinai_BW_2.jpg'),
    'FYM': ('شلالات وادي الريان', 'the waterfalls of Wadi El Rayan', 'Ibrahim El-Mezayen', 'CC BY-SA 4.0', 'Waterfalls_of_Wadi_El_Rayan,_Fayoum,_Egypt.jpg'),
    'BNS': ('هرم ميدوم', 'the Meidum pyramid', 'Kurohito', 'CC BY-SA 3.0', 'Meidoum03.jpg'),
    'MNY': ('نهر النيل في المنيا', 'the Nile at Minya', 'أحمد سبع الليل', 'CC BY-SA 4.0', '%D8%A7%D9%84%D9%86%D9%8A%D9%84_%D9%81%D9%89_%D8%A7%D9%84%D9%85%D9%86%D9%8A%D8%A7_02.jpg'),
    'AST': ('كوبري الخزان على قناطر أسيوط', 'the El-Khazan bridge on the Asyut Barrage', 'Hypatia Foundation', 'CC BY 3.0', 'El-Khazan_Bridge_%D9%83%D9%88%D8%A8%D8%B1%D9%8A_%D8%A7%D9%84%D8%AE%D8%B2%D8%A7%D9%86_-_panoramio.jpg'),
    'SHG': ('معبد سيتي الأول في أبيدوس', 'the Temple of Seti I at Abydos', 'Merlin UK', 'CC BY-SA 3.0', 'Temple_of_Seti_I_at_Abydos_-_panoramio_(3).jpg'),
    'QNA': ('معبد حتحور في دندرة', 'the Temple of Hathor at Dendera', 'Hamerani', 'CC BY-SA 4.0', 'Temple_of_Hathor_at_Dendera_(2).jpg'),
    'LXR': ('معبد الأقصر', 'Luxor Temple', 'Diego Delso', 'CC BY-SA 4.0', 'Templo_de_Luxor,_Luxor,_Egipto,_2022-04-01,_DD_02.jpg'),
    'ASN': ('معبد فيلة', 'the Temple of Philae', 'Diego Delso', 'CC BY-SA 4.0', 'File,_Asu%C3%A1n,_Egipto,_2022-04-01,_DD_97.jpg'),
    'BBA': ('الجونة على ساحل البحر الأحمر', 'El Gouna on the Red Sea coast', 'Marc Ryckaert', 'CC BY 3.0', 'El_Gouna_R14.jpg'),
    'WAD': ('الصحراء البيضاء', 'the White Desert', 'Vyacheslav Argenberg', 'CC BY 4.0', 'White_Desert,_Karst_rock_formations_2,_Egypt.jpg'),
    'MTR': ('مرسى مطروح', 'Marsa Matruh', 'Mujaddara', 'CC BY-SA 3.0', 'Marsa_Matruh,_Qism_Moursy_Matrouh,_Matrouh_Governorate,_Egypt_-_panoramio_(7).jpg'),
}
# sector illustrations: generic stock photos already used site-wide (source not recorded), only where the picture fits the
# sector and shows no brand. Rejected: cat-metal (rebar stamped «KSA»), cat-ac / cat-lugs (foreign brands), cat-heater (a foreign
# maker's spec sheet), cat-cable (thumbnail-sized), m0 / e0 / e3 / e4 (people), m1 (office towers).
SECTOR_PHOTOS = {
    'food': 'img/m2.jpg', 'electrical': 'img/m4.jpg', 'pharma': 'img/e1.jpg', 'medical-equipment': 'img/e1.jpg', 'chemicals': 'img/e1.jpg',
    'home-appliances': 'img/e2.jpg', 'it-office': 'img/e2.jpg', 'transport-shipping': 'img/m3.jpg', 'general-supplies': 'img/m3.jpg',
    'packaging': 'img/m3.jpg', 'glass-ceramics': 'img/cat-glass.jpg', 'plastics': 'img/cat-plastic2.jpg', 'building-materials': 'img/cat-build.jpg',
}

# retail offers (data/offers.js): brand field → the company that makes the brand (exact names, nothing guessed)
OFFER_BRANDS = {
    'Juhayna': ('facx', 'جهينة للصناعات الغذائية'), 'Domty': ('facx', 'الصناعات الغذائية العربية (دومتي)'),
    'Halwani Bros': ('facx', 'حلواني إخوان مصر'), 'Bisco Misr': ('facx', 'بسكو مصر'), 'Fresh (فريش)': ('facx', 'فريش للأجهزة الكهربائية'),
    'Cleopatra Ceramics': ('facx', 'سيراميكا كليوباترا'), 'Lecico': ('facx', 'ليسيكو مصر'), 'Koki': ('facx', 'القاهرة لتصنيع الدواجن (كوكي)'),
    'Unionaire (يونيون إير)': ('facx', 'يونيون إير'), 'Kiriazi (كريازي)': ('facx', 'كريازي للأجهزة الكهربائية'),
    'El Rashidi El Mizan': ('facx', 'الرشيدي الميزان'),
}
# Egyptian Exchange listings (data/real.js market rows): ticker → company rows (exact names)
EGX = {
    'SWDY': [('facx', 'السويدي إليكتريك')], 'ABUK': [('facx', 'أبو قير للأسمدة والصناعات الكيماوية')], 'MFPC': [('facx', 'مصر لإنتاج الأسمدة (موبكو)')],
    'SKPC': [('facx', 'سيدي كرير للبتروكيماويات (سيدبك)'), ('fac', 'شركة سدي كرير للبتروكيماويات (سيد بك)')], 'ARCC': [('facx', 'الشركة العربية للأسمنت')],
    'JUFO': [('facx', 'جهينة للصناعات الغذائية')], 'EFID': [('facx', 'إيديتا للصناعات الغذائية')], 'ORWE': [('facx', 'النساجون الشرقيون')],
    'EGAL': [('facx', 'مصر للألومنيوم')], 'MCQE': [('facx', 'مصر للأسمنت - قنا')], 'LCSW': [('facx', 'ليسيكو مصر')],
    'SUGR': [('facx', 'شركة الدلتا للسكر')], 'AMOC': [('facx', 'الإسكندرية للزيوت المعدنية (أموك)')], 'SCEM': [('facx', 'أسمنت سيناء')],
}
# extracted facts found wrong in review: (company path, fact key or '*' for every description fact)
DENY_FACTS = {
    # the description is about the French principal STIF (founded 1984, exports to 70 countries, plant in western France),
    # not about the Egyptian listing that carries it
    ('/factories/المصريه-للنظم-الهندسيه/', '*'),
}
# «منتجات <company>» listing pictures that are NOT the company's own logo (checked by eye, 2026-11-18, all 41 listing logos):
# the parent group's logo, which must not be shown as «شعار <company>» nor go into the company's Organization JSON-LD
DENY_LISTING_LOGOS = {
    '/factories/شركة-النصر-لصناعة-المواسير-الصلب-ولوا/',      # listing #67: «Metallurgical Industries Holding» (the state holding)
    '/factories/مصنع-هاي-تك-لوك-للصناعات-الدقيقة/',           # listing #59: «AHRAM Security Group»
    '/factories/الشركة-العربية-للصناعة-والتجارة-ويما/',        # listing #105: «YAZ Zahranco Group»
}

# ---------------------------------------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------------------------------------
AR_RX = re.compile('[؀-ۿ]')


def sha(b, n=12):
    return hashlib.sha1(b if isinstance(b, bytes) else str(b).encode('utf-8')).hexdigest()[:n]


def latin(s):
    return (s or '').translate(str.maketrans('٠١٢٣٤٥٦٧٨٩٬', '0123456789,'))


def credit_of(rel):
    c = COMMONS.get(rel)
    if not c:
        return None
    return {'author': c[0], 'license': c[1], 'url': c[2]}


class Media(object):
    """image derivatives under img/fprof/ (content- and parameter-addressed names: an existing file is reused as is)"""

    def __init__(self, root):
        from PIL import Image  # noqa: F401  (Pillow is required)
        self.root = root
        self.used = set()
        self.sheets = {}
        self.src_hash = {}

    def _write(self, rel, data):
        fp = self.root + rel
        if not os.path.exists(fp):
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            with open(fp + '.tmp', 'wb') as f:
                f.write(data)
            os.replace(fp + '.tmp', fp)
        self.used.add(rel)

    def exists(self, rel):
        return bool(rel) and os.path.isfile(self.root + rel.lstrip('/'))

    def file_hash(self, rel):
        if rel not in self.src_hash:
            with open(self.root + rel, 'rb') as f:
                self.src_hash[rel] = sha(f.read(), 16)
        return self.src_hash[rel]

    @staticmethod
    def _webp(im, q, method=WEBP_M_SMALL):
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=q, method=method)
        return buf.getvalue()

    def sheet(self, kind, n):
        from PIL import Image
        rel = 'img/old/%s%d.jpg' % ('pr' if kind == 'p' else 'lg', n)
        if rel not in self.sheets:
            if not os.path.exists(self.root + rel):
                self.sheets[rel] = None
            else:
                with Image.open(self.root + rel) as im:
                    self.sheets[rel] = im.convert('RGB')
        return rel, self.sheets[rel]

    def cell(self, kind, n, c):
        """one cell of a 10×10 sprite sheet (same geometry as the generator's crop_cell and company.part.py)"""
        rel, im = self.sheet(kind, n)
        if im is None:
            return rel, None
        w, h = im.size
        cw, ch = w // 10, h // 10
        c = int(c)
        if c < 0 or c > 99:
            return rel, None
        return rel, im.crop(((c % 10) * cw, (c // 10) * ch, (c % 10 + 1) * cw, (c // 10 + 1) * ch))

    def crop_out(self, sub, kind, n, c, im):
        """a sprite cell as WebP under img/fprof/<sub>/; returns {src, w, h}"""
        rel_sheet = 'img/old/%s%d.jpg' % ('pr' if kind == 'p' else 'lg', n)
        name = '%s.webp' % sha('%s|%s|%d|q%d|m%d' % (self.file_hash(rel_sheet), kind, int(c), WEBP_Q_SMALL, WEBP_M_SMALL), 14)
        rel = IMG_DIR + sub + '/' + name
        if not os.path.exists(self.root + rel):
            self._write(rel, self._webp(im, WEBP_Q_SMALL))
        else:
            self.used.add(rel)
        return {'src': '/' + rel, 'w': im.size[0], 'h': im.size[1]}

    def photo(self, rel_src, sub):
        """≤1280 px wide WebP (≤180 KB) + ≤640 px phone size; never upscaled. {src, w, h, sm}"""
        from PIL import Image, ImageOps
        h0 = self.file_hash(rel_src)
        stem = re.sub(r'[^a-z0-9-]+', '-', os.path.splitext(os.path.basename(rel_src))[0].lower()).strip('-')[:40]
        out = []
        im = None
        for w in PHOTO_WIDTHS:
            key = sha('%s|%d|q%d|m%d|max%d' % (h0, w, WEBP_Q_PHOTO, WEBP_M_PHOTO, PHOTO_MAX_BYTES), 8)
            # the file name carries the target width; the real size is read back from the file
            rel = '%s%s/%s-%d-%s.webp' % (IMG_DIR, sub, stem, w, key)
            if not os.path.exists(self.root + rel):
                if im is None:
                    with Image.open(self.root + rel_src) as raw:
                        im = ImageOps.exif_transpose(raw).convert('RGB')
                tw = min(w, im.size[0])
                while True:
                    r = im if tw == im.size[0] else im.resize((tw, max(1, round(im.size[1] * tw / im.size[0]))), Image.LANCZOS)
                    q = WEBP_Q_PHOTO
                    data = self._webp(r, q, WEBP_M_PHOTO)
                    while len(data) > PHOTO_MAX_BYTES and q > 62:
                        q -= 6
                        data = self._webp(r, q, WEBP_M_PHOTO)
                    if len(data) <= PHOTO_MAX_BYTES or tw <= 480:
                        break
                    tw = int(tw * 0.85)   # a very detailed photo: a little narrower rather than blotchy
                self._write(rel, data)
            else:
                self.used.add(rel)
            with Image.open(self.root + rel) as chk:
                size = chk.size
            out.append({'src': '/' + rel, 'w': size[0], 'h': size[1]})
        big, sm = out[0], out[-1]
        res = dict(big)
        if sm['w'] < big['w']:
            res['sm'] = sm
        return res

    def original(self, rel):
        from PIL import Image
        with Image.open(self.root + rel) as im:
            return {'src': '/' + rel, 'w': im.size[0], 'h': im.size[1]}

    def prune(self):
        """remove derivatives of earlier runs that nothing references any more"""
        base = self.root + IMG_DIR
        removed = 0
        if not os.path.isdir(base):
            return 0
        for sub in sorted(os.listdir(base)):
            d = base + sub
            if not os.path.isdir(d):
                continue
            for f in sorted(os.listdir(d)):
                rel = IMG_DIR + sub + '/' + f
                if f.endswith('.webp') and rel not in self.used:
                    os.remove(d + '/' + f)
                    removed += 1
        return removed


def img_stats(im):
    from PIL import ImageStat
    st = ImageStat.Stat(im)
    return sum(st.mean) / 3.0, sum(st.stddev) / 3.0


def img_sig(im):
    from PIL import Image
    return im.convert('L').resize((24, 24), Image.BILINEAR)


def img_mad(a, b):
    from PIL import ImageChops, ImageStat
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


def ink(im):
    """share of the pixels that differ from the dominant background grey level (±18): ~0 for an empty or dot-only cell"""
    h = im.convert('L').histogram()
    bg = max(range(256), key=lambda v: h[v])
    return 1.0 - sum(h[max(0, bg - 18):min(256, bg + 19)]) / float(sum(h) or 1)


def flatness(im):
    """share of the pixels in the 6 most used colours (64-colour quantisation): ~1 for flat logos, ~0.3 for photos"""
    from PIL import Image
    q = im.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    h = sorted(q.histogram(), reverse=True)
    return sum(h[:6]) / float(sum(h) or 1)


# ---------------------------------------------------------------------------------------------------------------------------
# facts: only what a description states, in a small set of unambiguous sentence patterns
# ---------------------------------------------------------------------------------------------------------------------------
YEAR = r'(1[89]\d\d|20[0-2]\d)(?![\d])'
MONTHS = 'يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر'
FOUNDED_AR = re.compile(r'(?:تأسست|تأسس|تاسست|تاسس|أسست|أُسست|تم تأسيسها|تم تأسيسه|تأسيسها|تأسيسه)'
                        r'((?:\s+[^\s\d.،,؛:]+){0,4}?)\s+(?:(?:في|فى|منذ)\s+)?(?:(?:عام|سنة|العام)\s+|(?:' + MONTHS + r')\s+)?' + YEAR)
FOUNDED_EN = re.compile(r'\b(?:established|founded|incorporated)\s+(?:back\s+)?(?:in\s+)?' + YEAR + r'|\bsince its (?:foundation|establishment|inception)\s+(?:back\s+)?in\s+' + YEAR, re.I)
SINCE_AR = re.compile(r'منذ\s+(?:عام\s+|سنة\s+)?' + YEAR)
SINCE_EN = re.compile(r'\b(?:in business|operating|active|working|experience)\s+since\s+' + YEAR, re.I)
STARTED_AR = re.compile(r'بدأت\s+(?:الشركة\s+|المؤسسة\s+|المجموعة\s+)?(?:نشاطها|أعمالها|عملها)(?:\s+[^\s\d.،,؛]+){0,3}?\s+(?:في\s+)?(?:عام|سنة)\s+' + YEAR)
SINCE_GOOD = re.compile(r'تعمل|يعمل|نعمل|خبرة|بخبرة|السوق|نشاط|في مجال|في مصر|صناعة|تصنيع|تمارس|نصمم|نقدم')
SINCE_BAD = re.compile(r'ارتباط|وكيل|توكيل|شهادة|حاصل|عضو|جائزة|شراكة|علامة|أصبحت|انضمت|تابعة|التابعة|ترخيص|تصريح|رقم')
REL_OTHER = re.compile(r'(?:مجموعة|منظومة|المجموعة|ضمن|تحت|العالمية|الأم|القابضة)[^.]{0,60}$')
REL_BEFORE = re.compile(r'(?:التي|الذي)(?:\s+[^\s.،,]+){0,3}\s*$')
EMP_AR = re.compile(r'(?:تضم|يعمل بها|يعمل به|يعمل لديها|يعمل لديه|يبلغ عدد العاملين(?:\s+(?:بها|فيها|بالشركة))?|عدد العاملين(?:\s+(?:بها|فيها))?|عدد الموظفين)\s+'
                    r'(أكثر من|ما يزيد على|ما يزيد عن|ما يزيد علي|نحو|حوالي|حوالى)?\s*([\d٠-٩][\d٠-٩,٬.]*)\s+(موظف|موظفًا|موظفاً|موظفا|عامل|عاملًا|عاملاً|عاملا)')
EMP_EN = re.compile(r'\b(?:employ(?:s|ing)?|workforce of|staff of)\s+(over than|over|more than|about|around|approximately|nearly)?\s*([\d,]+)\s+(employees|workers|staff|people)', re.I)
CAP_AR = re.compile(r'(?:الطاقة|طاقتها|طاقته|طاقة)\s+(?:الإنتاجية|الانتاجية|إنتاجية|انتاجية)'
                    r'((?:\s+(?:السنوية|اليومية|الشهرية|المعلنة|القصوى|الحالية|للشركة|للمصنع|لشركة\s+[^\s\d.،]+(?:\s+[^\s\d.،]+)?))*)'
                    r'((?:\s+(?:إلى|الى|لتتجاوز|تتجاوز|لتصل|تصل|تبلغ|بلغت|قدرها|نحو|حوالي|حوالى|أكثر|من))*)'
                    r'\s+([\d٠-٩][\d٠-٩,٬.]*)\s*(مليون|ألف|الف)?\s*(طن متري|طن|علبة|قطعة|متر مربع|متر مكعب|لتر|وحدة|كرتونة)'
                    r'(?:\s+(سنويًا|سنوياً|سنويا|شهريًا|شهرياً|شهريا|يوميًا|يومياً|يوميا))?')
AREA_AR = re.compile(r'(?:مصنع|مصنعًا|مصنعاً|المصنع|مصنعها|مصنعه)([^.،]{0,30}?)(?:على مساحة|بمساحة|يمتد على مساحة|تبلغ مساحته|مساحته|مساحتها)\s+(?:تبلغ\s+|نحو\s+|حوالي\s+)?'
                     r'([\d٠-٩][\d٠-٩,٬.]*)\s*(ألف|الف)?\s*(متر مربع|فدان|فدانًا|فداناً)'
                     r'|(?:على مساحة|بمساحة)\s+([\d٠-٩][\d٠-٩,٬.]*)\s*(ألف|الف)?\s*(متر مربع|فدان)،?\s+(?:شُيّد|شيد|شُيد|أقيم|أُقيم)\s+(?:ال)?مصنع')
EXP_N_AR = re.compile(r'(?:تصدير|تصدر|يصدر|نصدر|تُصدّر|يُصدّر|تصدّر|يصدّر|بتصدير)\s+(?:منتجاتها\s+|منتجاته\s+|منتجاتنا\s+|إنتاجها\s+)?(?:إلى|الى|لـ|ل)\s*'
                      r'(أكثر من|ما يزيد عن|ما يزيد على|نحو|حوالي)?\s*(\d+)\s*(دولة|دول|بلدًا|بلدا|بلد)')
EXP_N_EN = re.compile(r'\bexport(?:s|ing)?\s+(?:its\s+|our\s+)?(?:products\s+)?to\s+(over|more than|about)?\s*(\d+)\s+countries', re.I)
EXP_M_AR = re.compile(r'(?:تصدير|تصدر|يصدر|نصدر|تُصدّر|يُصدّر|تصدّر|يصدّر|بتصدير)\s+(?:الفائض\s+|منتجاتها\s+|منتجاته\s+|منتجاتنا\s+)?(?:إلى|الى|لـ|ل)\s*([^.\-–]{3,90})')
MARKETS = [  # (regex on the captured text, Arabic label, English label)
    (r'بعض الدول العربية', 'بعض الدول العربية', 'some Arab countries'), (r'(?<!بعض )الدول العربية|البلاد العربية|العالم العربي', 'الدول العربية', 'Arab countries'),
    (r'دول الخليج|الخليج العربي', 'دول الخليج', 'the Gulf countries'), (r'البحر (?:الأبيض )?المتوسط', 'البحر الأبيض المتوسط', 'the Mediterranean'),
    (r'الشرق الأوسط|الشرق الاوسط', 'الشرق الأوسط', 'the Middle East'), (r'[أاإ]فريقيا|الدول الأفريقية|الدول الافريقية', 'أفريقيا', 'Africa'),
    (r'[أا]وروبا|الدول الأوروبية|الدول الاوروبية', 'أوروبا', 'Europe'), (r'[آا]سيا', 'آسيا', 'Asia'),
    (r'[أا]مريكا|الولايات المتحدة', 'أمريكا', 'America'),
]
PRESENCE_AR = re.compile(r'(?:حضور|تواجد|وجود|انتشار)(?:\s+[^\s\d.،]+){0,2}?\s+في\s+(أكثر من\s+|نحو\s+)?(\d+)\s+(دولة|بلدًا|بلدا|بلد)')
PRESENCE_EN = re.compile(r'\bpresence in\s+(over\s+|more than\s+)?(\d+)\s+countries', re.I)
CERT_CUE = re.compile(r'حاصل[ةه]? على|حصلت على|نحمل|تحمل|يحمل|حائز[ةه]?|شهاد[ةه]|شهادات|certified|certification|certificates?|acquired|obtained', re.I)
CERT_DEALER = re.compile(r'وكيل|موزع|توكيل|distributor|dealer|agent', re.I)
CERT_RX = re.compile(r'(?<![A-Za-z])(?:ISO|الأيزو|الايزو|أيزو|ايزو|إيزو|الإيزو)\s*[-:]?\s*(\d{4,5})|(?<![A-Za-z])(HACCP|BRC|FSSC\s*22000|GMP|IATF\s*16949|OHSAS\s*18001)(?![A-Za-z])')
GROUP_AR = re.compile(r'(?:ضمن|إحدى شركات|احدى شركات|التابعة ل|تابعة ل|جزء من|جزءًا من|جزءا من)\s*(?:مجموعة|لمجموعة)\s+([^\s.،,؛:()…]+(?:\s+[^\s.،,؛:()…]+){0,3})')
GROUP_STOP = re.compile(r'^(?:و\S{3,}|التي|الذي|وهي|وهو|في|من|على|عام|منذ|مع|إلى|الى|حيث|بما|كما)$')

Q_AR = {'أكثر من': 'أكثر من', 'ما يزيد على': 'أكثر من', 'ما يزيد عن': 'أكثر من', 'ما يزيد علي': 'أكثر من', 'نحو': 'نحو', 'حوالي': 'نحو', 'حوالى': 'نحو'}
Q_EN = {'أكثر من': 'More than', 'نحو': 'About', 'حتى': 'Up to'}
UNIT_EN = {'طن متري': 'metric tonnes', 'طن': 'tonnes', 'علبة': 'cans', 'قطعة': 'pieces', 'متر مربع': 'm²', 'متر مكعب': 'm³', 'لتر': 'litres',
           'وحدة': 'units', 'كرتونة': 'cartons', 'فدان': 'feddans', 'فدانًا': 'feddans', 'فداناً': 'feddans', 'موظف': 'employees', 'عامل': 'workers'}
MULT_EN = {'ألف': 'thousand', 'الف': 'thousand', 'مليون': 'million'}
PERIOD = {'سنو': ('سنوياً', 'per year'), 'شهر': ('شهرياً', 'per month'), 'يوم': ('يومياً', 'per day')}


def _num_en(s):
    s = latin(s).strip(',.')
    if re.fullmatch(r'\d+', s) and len(s) >= 4:
        return '{:,}'.format(int(s))
    return s


def _sentence_before(text, i, n=90):
    seg = text[max(0, i - n):i]
    k = max(seg.rfind('.'), seg.rfind('…'), seg.rfind('\n'))
    return seg[k + 1:] if k >= 0 else seg


def extract_facts(text, name=''):
    """facts stated in one description: {key: (value_ar, value_en)}; keys: founded, since, employees, capacity, area,
    export_reach, export_markets, presence, certificates, group. name = the company's own name (self-references are skipped)"""
    t = re.sub(r'[ \t ]+', ' ', text or '')
    out = {}
    if not t.strip():
        return out
    # founded
    for m in FOUNDED_AR.finditer(t):
        mid = (m.group(1) or '').strip()
        if re.search(r'على يد|(?:^|\s)(?:الأم|القابضة)(?:\s|$)', mid):
            continue   # a founder's name, or the parent company's founding
        # «… ضمن مجموعة X، التي (يعود تاريخ) تأسيسها …»: the founding of another entity (a group, a system)
        before = t[max(0, m.start() - 30):m.start()]
        if REL_BEFORE.search(before) and REL_OTHER.search(_sentence_before(t, m.start(), 90)):
            continue
        # «تأسست مجموعة <name> …»: a named group, not this company (unless the company is that group)
        g = re.match(r'(?:مجموعة|شركة\s+مجموعة)\s+(\S+)', mid)
        if g and not (re.search(r'مجموعة|جروب|group', name or '', re.I) and g.group(1) in (name or '')):
            continue
        out['founded'] = (m.group(2), m.group(2))
        break
    if 'founded' not in out:
        m = FOUNDED_EN.search(t)
        if m:
            y = m.group(1) or m.group(2)
            out['founded'] = (y, y)
    # active since (only when no founding year is stated)
    if 'founded' not in out:
        for m in SINCE_AR.finditer(t):
            pre = _sentence_before(t, m.start(), 90)
            post = t[m.end():m.end() + 40]
            if SINCE_BAD.search(pre) or re.match(r'\s*[،,]?\s*(?:أصبحت|انضمت)', post):
                continue
            if SINCE_GOOD.search(pre) or re.match(r'\s*[،,]?\s*(?:و?نحن\s+)?(?:نصمم|نعمل|نقدم|تعمل|تقدم)', post):
                out['since'] = (m.group(1), m.group(1))
                break
        if 'since' not in out:
            for m in STARTED_AR.finditer(t):
                if REL_BEFORE.search(t[max(0, m.start() - 30):m.start()]) and REL_OTHER.search(_sentence_before(t, m.start(), 90)):
                    continue
                if 'المجموعة' in m.group(0)[:20] and not re.search(r'مجموعة|جروب|group', name or '', re.I):
                    continue   # «بدأت المجموعة نشاطها …»: the group's start, not this company's
                out['since'] = (m.group(1), m.group(1))
                break
        if 'since' not in out:
            m = SINCE_EN.search(t)
            if m:
                out['since'] = (m.group(1), m.group(1))
    # employees
    m = EMP_AR.search(t)
    if m:
        q = Q_AR.get(m.group(1) or '', '')
        unit = 'موظف' if m.group(3).startswith('موظف') else 'عامل'
        num = latin(m.group(2)).strip(',.')
        out['employees'] = ((q + ' ' if q else '') + num + ' ' + unit, ((Q_EN[q] + ' ') if q else '') + _num_en(num) + ' ' + UNIT_EN[unit])
    else:
        m = EMP_EN.search(t)
        if m:
            qe = (m.group(1) or '').lower()
            q = 'أكثر من' if qe in ('over', 'over than', 'more than') else 'نحو' if qe in ('about', 'around', 'approximately', 'nearly') else ''
            num = m.group(2).strip(',.')
            unit_ar = 'موظف' if m.group(3).lower() in ('employees', 'staff', 'people') else 'عامل'
            out['employees'] = ((q + ' ' if q else '') + num + ' ' + unit_ar, ((Q_EN[q] + ' ') if q else '') + _num_en(num) + ' ' + m.group(3).lower())
    # production capacity
    m = CAP_AR.search(t)
    if m:
        adj, conn = m.group(1) or '', m.group(2) or ''
        q = ('أكثر من' if re.search(r'تتجاوز|أكثر', conn) else 'نحو' if re.search(r'نحو|حوالي|حوالى', conn)
             else 'حتى' if re.search(r'إلى|الى|تصل', conn) else '')
        num, mult, unit, per = latin(m.group(3)).strip(',.'), m.group(4) or '', m.group(5), m.group(6) or ''
        pk = next((k for k in PERIOD if k in per), None) or next((k for k in PERIOD if k in adj), None)
        p_ar, p_en = PERIOD[pk] if pk else ('', '')
        v_ar = ' '.join(x for x in [q, num, mult, unit, p_ar] if x)
        v_en = ' '.join(x for x in [Q_EN.get(q, ''), _num_en(num), MULT_EN.get(mult, ''), UNIT_EN[unit], p_en] if x)
        out['capacity'] = (v_ar, v_en[0].upper() + v_en[1:])
    # factory area
    for m in AREA_AR.finditer(t):
        if m.group(2):
            between, num, mult, unit = m.group(1) or '', m.group(2), m.group(3) or '', m.group(4)
        else:
            between, num, mult, unit = '', m.group(5), m.group(6) or '', m.group(7)
        ctx = _sentence_before(t, m.start(), 40) + between
        if re.search(r'الثاني|الثانية|الثالث|الجديد|صالة|معرض|فرع|مخزن|مستودع', ctx):
            continue
        num = latin(num).strip(',.')
        u = 'فدان' if unit.startswith('فدان') else 'متر مربع'
        out['area'] = (' '.join(x for x in [num, mult, u] if x), ' '.join(x for x in [_num_en(num), MULT_EN.get(mult, ''), UNIT_EN[u]] if x))
        break
    # exports: number of countries, named markets
    m = EXP_N_AR.search(t)
    if m:
        q = Q_AR.get(m.group(1) or '', '')
        out['export_reach'] = ('إلى ' + (q + ' ' if q else '') + m.group(2) + ' دولة', 'To ' + ((Q_EN[q].lower() + ' ') if q else '') + m.group(2) + ' countries')
    else:
        m = EXP_N_EN.search(t)
        if m:
            q = 'أكثر من' if (m.group(1) or '').lower() in ('over', 'more than') else 'نحو' if (m.group(1) or '').lower() == 'about' else ''
            out['export_reach'] = ('إلى ' + (q + ' ' if q else '') + m.group(2) + ' دولة', 'To ' + ((Q_EN[q].lower() + ' ') if q else '') + m.group(2) + ' countries')
    for m in EXP_M_AR.finditer(t):
        seg = m.group(1)
        seg = re.split(r'[،,؛:]\s*(?!و)', seg)[0]
        found = []
        for rx, a, e in MARKETS:
            if re.search(rx, seg) and (a, e) not in found:
                found.append((a, e))
        if found:
            out['export_markets'] = ('، '.join(a for a, e in found), ', '.join(e for a, e in found))
            break
    # international presence
    m = PRESENCE_AR.search(t)
    if m:
        q = 'أكثر من' if m.group(1) and 'أكثر' in m.group(1) else 'نحو' if m.group(1) else ''
        out['presence'] = ('حضور في ' + (q + ' ' if q else '') + m.group(2) + ' دولة', 'Present in ' + ((Q_EN[q].lower() + ' ') if q else '') + m.group(2) + ' countries')
    else:
        m = PRESENCE_EN.search(t)
        if m:
            q = 'أكثر من' if m.group(1) else ''
            out['presence'] = ('حضور في ' + (q + ' ' if q else '') + m.group(2) + ' دولة', 'Present in ' + ('more than ' if q else '') + m.group(2) + ' countries')
    # certificates named in a sentence that says the company holds them
    certs = []
    for sent in re.split(r'(?<=[.!؟?…])\s+|\n', t):
        if not CERT_CUE.search(sent) or CERT_DEALER.search(sent):
            continue
        for m in CERT_RX.finditer(sent):
            c = ('ISO ' + m.group(1)) if m.group(1) else re.sub(r'\s+', ' ', m.group(2)).upper()
            if c not in certs:
                certs.append(c)
    if certs:
        out['certificates'] = ('، '.join(certs), ', '.join(certs))
    # parent group
    m = GROUP_AR.search(t)
    if m:
        toks = []
        for tok in m.group(1).split():
            if GROUP_STOP.match(tok):
                break
            toks.append(tok)
        while toks and re.match(r'^(?:المتخصصة|المتخصص|الرائدة|المصرية|المصري)$', toks[-1]):
            toks.pop()
        if toks and toks[0] == 'شركات':
            toks = toks[1:]
        gname = ' '.join(toks).strip(' -–')
        first = re.sub(r'^ال', '', toks[0]) if toks else ''
        if gname and len(gname) >= 3 and not (first and first in re.sub(r'(^|\s)ال', ' ', name or '')):
            lat = re.findall(r'[A-Za-z][A-Za-z0-9&.\- ]+', gname)
            out['group'] = (gname, None if AR_RX.search(gname) and not lat else (lat[0].strip() if lat else gname))
    return out


FACT_LABELS = {
    'founded': ('سنة التأسيس', 'Founded'), 'since': ('تعمل منذ', 'Active since'), 'employees': ('عدد العاملين', 'Employees'),
    'capacity': ('الطاقة الإنتاجية', 'Production capacity'), 'area': ('مساحة المصنع', 'Factory area'),
    'export_reach': ('التصدير', 'Exports'), 'export_markets': ('أسواق التصدير', 'Export markets'), 'presence': ('الانتشار الدولي', 'International presence'),
    'certificates': ('الشهادات', 'Certificates'), 'group': ('ضمن مجموعة', 'Part of'), 'listed': ('مدرجة في البورصة المصرية', 'Listed on the Egyptian Exchange'),
}


# ---------------------------------------------------------------------------------------------------------------------------
# model (the generator's own) and index
# ---------------------------------------------------------------------------------------------------------------------------
def load_state(root=DEFAULT_ROOT, data=None):
    """exec seo_build.part.py read-only and run seo_prepare() into a temporary directory → (SEO_STATE, tr)"""
    root = root if root.endswith('/') else root + '/'
    path = root + 'seo_build.part.py'
    ns = {'__name__': 'seo_build_for_company_media', '__file__': path, 'B': root}
    with open(path, encoding='utf-8') as f:
        code = compile(f.read(), path, 'exec')
    old = os.environ.get('MIG_SEO_DATA')
    if data:
        os.environ['MIG_SEO_DATA'] = os.path.abspath(data)
    tmp = tempfile.mkdtemp(prefix='company-media-')
    try:
        with contextlib.redirect_stdout(sys.stderr):
            exec(code, ns)
            ns['SEO_API']['seo_prepare'](tmp + '/', None, not data)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if data:
            if old is None:
                os.environ.pop('MIG_SEO_DATA', None)
            else:
                os.environ['MIG_SEO_DATA'] = old
    return ns['SEO_API']['SEO_STATE'], ns['SEO_API']['seo_tr']


class Resolver(object):
    """(data set, exact name) → the company page that shows it (a researched row merged into a member resolves to the member)"""

    def __init__(self, S):
        self.by_member = {}
        self.by_public = {}
        for c in S['companies']:
            (self.by_member if c['kind'] == 'member' else self.by_public).setdefault(c['name'], c)
        self.facx_names = {}
        for i, x in enumerate(S['D'].get('facx') or []):
            self.facx_names.setdefault(re.sub(r'\s+', ' ', x[0]).strip(), i)
        self.alias = S.get('facx_alias') or {}
        self.missing = []

    def get(self, who):
        kind, name = who
        name = re.sub(r'\s+', ' ', name).strip()
        c = None
        if kind == 'fac':
            c = self.by_member.get(name)
        else:
            c = self.by_public.get(name)
            if c is None and name in self.facx_names:
                c = self.alias.get('x%d' % self.facx_names[name])
        if c is None:
            self.missing.append('%s:%s' % who)
        return c


def _product_image_rules(S, M):
    """which listed-product photos are real product photos: not blank, not the grey «Made in Egypt» placeholder, not one
    picture shared by several listings, not a «منتجات <company>» catch-all listing (those show the company logo)"""
    cells = {}
    for p in S['products']:
        if p.get('img'):
            rel, im = M.cell('p', p['img'][0], p['img'][1])
            if im is not None:
                cells[p['i']] = im
    stats = {i: img_stats(im) for i, im in cells.items()}
    sigs = {i: img_sig(im) for i, im in cells.items()}
    shared = set()
    ids = sorted(cells)
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            i, j = ids[a], ids[b]
            if abs(stats[i][0] - stats[j][0]) < 2 and abs(stats[i][1] - stats[j][1]) < 2 and img_mad(sigs[i], sigs[j]) < 2.0:
                shared.add(i)
                shared.add(j)
    blank = set(i for i, s in stats.items() if s[1] < 4)
    return cells, shared, blank


GENERIC_RX = re.compile(r'^\W*منتجات\s')


def _is_generic(p, maker):
    n = re.sub(r'\s+', ' ', p['name']).strip()
    if GENERIC_RX.match(n):
        return True
    return bool(maker) and re.sub(r'^(شركة|الشركة|مصنع)\s+', '', n) == re.sub(r'^(شركة|الشركة|مصنع)\s+', '', maker['name'])


def build_index(S, root=DEFAULT_ROOT, tr=None, write=True, out_json=None):
    """the media index for every company of the generator's model S (SEO_STATE after build_model)"""
    root = root if root.endswith('/') else root + '/'
    tr = tr or (lambda s: None)
    D = S['D']
    M = Media(root)
    R = Resolver(S)
    warnings = []

    def tr_en(s):
        if not s:
            return None
        if not AR_RX.search(s):
            return s
        try:
            v = tr(s)
        except Exception:
            v = None
        return v if v and not AR_RX.search(v) else None

    sec_by_slug = S['sec_by_slug']
    gov_by_code = S['gov_by_code']
    cps = (S.get('cfg') or {}).get('product_category_sector') or {}

    # --- per-company attachments from the curated tables
    photos_for, videos_for, offers_for, listed_for = {}, {}, {}, {}
    for row in OWN_PHOTOS:
        if not M.exists(row['file']):
            warnings.append('own_photo_missing:%s' % row['file'])
            continue
        ph = M.photo(row['file'], 'photo')
        entry = dict(ph, cap_ar=row['cap_ar'], cap_en=row['cap_en'], credit=credit_of(row['file']), origin='commons')
        for who in row['who']:
            c = R.get(who)
            if c is not None:
                photos_for.setdefault(c['path'], []).append(entry)
    vids = {v.get('id'): v for v in (D.get('videos') or [])}
    if not vids:   # data/videos.js is not part of the generator's dump: read it directly
        vids = {v.get('id'): v for v in read_js_array(root + 'data/videos.js', 'MIGVIDS')}
    for row in VIDEOS:
        v = vids.get(row['yt'])
        if not v:
            warnings.append('video_missing:%s' % row['yt'])
            continue
        thumb = '/' + v['thumb'] if v.get('thumb') and M.exists(v['thumb']) else None
        entry = {'yt': row['yt'], 'title_ar': v.get('title_ar') or '', 'title_en': v.get('title_en') or None, 'thumb': thumb}
        if thumb:
            o = M.original(v['thumb'])
            entry['thumb_w'], entry['thumb_h'] = o['w'], o['h']
        for k in ('channel', 'date', 'duration'):
            if v.get(k):
                entry[k] = v[k]
        for who in row['who']:
            c = R.get(who)
            if c is not None:
                videos_for.setdefault(c['path'], []).append(entry)
    for o in S.get('offers') or []:
        who = OFFER_BRANDS.get(o.get('brand') or '')
        if not who or not o.get('made_in_egypt'):
            continue
        c = R.get(who)
        if c is None:
            continue
        img = None
        if o.get('img') and M.exists(o['img']):
            img = M.original(o['img'])
        offers_for.setdefault(c['path'], []).append({
            'key': 'o:' + str(o.get('id')), 'name_ar': o.get('product_ar') or '', 'name_en': o.get('product_en') or None, 'img': img,
            'cat_ar': o.get('category_ar') or None, 'cat_en': o.get('category_en') or None, 'href': o['path'], 'from': 'offer'})
    market = {m.get('symbol'): m for m in ((D.get('real') or {}).get('market') or []) if m.get('type') == 'stock'}
    for sym, whos in sorted(EGX.items()):
        m = market.get(sym)
        if not m:
            warnings.append('egx_symbol_missing:%s' % sym)
            continue
        for who in whos:
            c = R.get(who)
            if c is not None:
                listed_for[c['path']] = {'label_ar': FACT_LABELS['listed'][0], 'label_en': FACT_LABELS['listed'][1],
                                         'value_ar': 'رمز السهم: %s' % sym, 'value_en': 'Ticker: %s' % sym,
                                         'source': 'data/real.js (market, %s)' % (m.get('as_of_date') or ''), 'source_url': m.get('source_url') or None}

    # --- shared context photos (one derivative per file)
    ctx_cache = {}

    def ctx_photo(rel, kind, cap_ar, cap_en, credit):
        k = (rel, cap_ar)
        if k not in ctx_cache:
            if not M.exists(rel):
                warnings.append('context_missing:%s' % rel)
                ctx_cache[k] = None
            else:
                base = M.photo(rel, 'ctx') if kind != 'sector' else M.original(rel)
                e = dict(base, cap_ar=cap_ar, cap_en=cap_en, kind=kind)
                if credit:
                    e['credit'] = credit
                ctx_cache[k] = e
        return ctx_cache[k]

    NOT_AR, NOT_EN = ' — ليست صورة المنشأة', ' — not a photo of this company'
    zone_ctx = {}
    for zid, (rel, ca, ce) in ZONE_PHOTOS.items():
        zone_ctx[zid] = (rel, ca + NOT_AR, ce + NOT_EN)
    gov_ctx = {}
    for code, (subj_ar, subj_en, author, lic, title) in GOV_PHOTOS.items():
        g = gov_by_code.get(code)
        if not g:
            continue
        gov_ctx[code] = ('img/gov/gv-%s.jpg' % code, 'صورة من محافظة %s: %s%s' % (g['ar'], subj_ar, NOT_AR),
                         'Photo from %s Governorate: %s%s' % (g['en'], subj_en, NOT_EN),
                         {'author': author, 'license': lic, 'url': 'https://commons.wikimedia.org/wiki/File:' + title})

    # --- listed products: which photos are real
    cells, shared, blank = _product_image_rules(S, M)

    # --- logos from «منتجات <company>» listings for members without a logo-sheet cell
    listing_logo = {}
    for p in S['products']:
        mk = p.get('maker')
        if not mk or mk.get('logo') or not p.get('img') or not _is_generic(p, mk):
            continue
        i = p['i']
        if i not in cells or i in shared or i in blank or flatness(cells[i]) < 0.45 or ink(cells[i]) < 0.01:
            continue
        if mk['path'] not in listing_logo and mk['path'] not in DENY_LISTING_LOGOS:
            listing_logo[mk['path']] = (p, cells[i])

    index = {}
    cov = {'companies': 0, 'with_logo': 0, 'with_own_photos': 0, 'with_product_images': 0, 'with_videos': 0, 'with_zone_photo': 0,
           'with_gov_photo': 0, 'with_sector_photo': 0, 'with_facts': 0, 'products': 0, 'product_images': 0, 'facts': 0,
           'logo_from_sheet': 0, 'logo_from_listing': 0}
    fact_counts = {}
    for c in S['companies']:
        path = c['path']
        e = {'logo': None, 'photos': [], 'videos': [], 'products': [], 'context': [], 'facts': {}}
        # logo
        if c.get('logo'):
            rel, im = M.cell('l', c['logo'][0], c['logo'][1])
            if im is not None and img_stats(im)[1] >= 4:
                e['logo'] = dict(M.crop_out('logo', 'l', c['logo'][0], c['logo'][1], im), **{'from': 'logo-sheet'})
                cov['logo_from_sheet'] += 1
        if e['logo'] is None and path in listing_logo:
            p, im = listing_logo[path]
            e['logo'] = dict(M.crop_out('logo', 'p', p['img'][0], p['img'][1], im), **{'from': 'product-listing'})
            cov['logo_from_listing'] += 1
        e['photos'] = list(photos_for.get(path, []))
        e['videos'] = list(videos_for.get(path, []))
        # products: listed products (linked to this company by the listing's own maker URL), then the names on the record, then retail offers
        seen = set()
        for p in c.get('prods') or []:
            img = None
            i = p['i']
            if i in cells and i not in shared and i not in blank and not _is_generic(p, c):
                img = M.crop_out('prod', 'p', p['img'][0], p['img'][1], cells[i])
            sl = cps.get(p.get('cat') or '')
            sec = sec_by_slug.get(sl or '')
            e['products'].append({'key': 'p%d' % i, 'name_ar': p['name'], 'name_en': p.get('name_en') or tr_en(p['name']), 'img': img,
                                  'cat_ar': sec['t_ar'] if sec else None, 'cat_en': sec['t_en'] if sec else None, 'href': p['path'], 'from': 'listing'})
            seen.add(re.sub(r'\s+', ' ', p['name']).strip())
        for k, n in enumerate(c.get('names') or []):
            n2 = re.sub(r'\s+', ' ', n or '').strip()
            if not n2 or n2 in seen:
                continue
            seen.add(n2)
            e['products'].append({'key': 'n%d' % k, 'name_ar': n2, 'name_en': tr_en(n2), 'img': None, 'cat_ar': None, 'cat_en': None, 'href': None, 'from': 'name'})
        e['products'].extend(offers_for.get(path, []))
        # context photos (never the company's own)
        z = c.get('zone') or ''
        zc = zone_ctx.get(z)
        if not zc:
            for rx, rel, ca, ce in CITY_PHOTOS:
                if re.search(rx, c.get('loc') or ''):
                    zc = (rel, ca + NOT_AR, ce + NOT_EN)
                    break
        if zc:
            x = ctx_photo(zc[0], 'zone', zc[1], zc[2], credit_of(zc[0]))
            if x:
                e['context'].append(x)
        gc = gov_ctx.get(c.get('gov') or '')
        if gc:
            x = ctx_photo(gc[0], 'gov', gc[1], gc[2], gc[3])
            if x:
                e['context'].append(x)
        sec = sec_by_slug.get(c.get('sslug') or '')
        if sec and c.get('sslug') in SECTOR_PHOTOS:
            x = ctx_photo(SECTOR_PHOTOS[c['sslug']], 'sector', 'صورة توضيحية لقطاع %s — ليست صورة المنشأة أو منتجاتها' % sec['ar'],
                          'Illustrative photo for the %s sector — not a photo of this company or its products' % sec['en'], None)
            if x:
                e['context'].append(x)
        # facts
        src = 'data/oldfacd.js (description)' if c['kind'] == 'member' else 'data/facx.js (description)'
        for k, (va, ve) in extract_facts(c.get('desc') or '', c['name']).items():
            if (path, k) in DENY_FACTS or (path, '*') in DENY_FACTS:
                continue
            f = {'label_ar': FACT_LABELS[k][0], 'label_en': FACT_LABELS[k][1], 'value_ar': va, 'value_en': ve, 'source': src}
            if c['kind'] == 'public' and c.get('source'):
                f['source_url'] = c['source']
            if k == 'group':
                g = R.by_public.get(va) or R.by_member.get(va)
                if g is not None and g['path'] != path:
                    f['href'] = g['path']
                if ve is None:
                    f['value_en'] = tr_en(va)
            e['facts'][k] = f
        if path in listed_for:
            e['facts']['listed'] = listed_for[path]
        index[path] = e
        # coverage
        cov['companies'] += 1
        cov['with_logo'] += bool(e['logo'])
        cov['with_own_photos'] += bool(e['photos'])
        cov['with_videos'] += bool(e['videos'])
        cov['with_product_images'] += any(p['img'] for p in e['products'])
        cov['products'] += len(e['products'])
        cov['product_images'] += sum(1 for p in e['products'] if p['img'])
        kinds = [x['kind'] for x in e['context']]
        cov['with_zone_photo'] += 'zone' in kinds
        cov['with_gov_photo'] += 'gov' in kinds
        cov['with_sector_photo'] += 'sector' in kinds
        cov['with_facts'] += bool(e['facts'])
        cov['facts'] += len(e['facts'])
        for k in e['facts']:
            fact_counts[k] = fact_counts.get(k, 0) + 1
    warnings += ['curated_target_missing:%s' % m for m in R.missing]
    added = 0
    for rel in M.used:
        added += os.path.getsize(root + rel)
    meta = {'schema': SCHEMA, 'generator': 'tools/company_media.py', 'coverage': cov, 'facts_by_key': dict(sorted(fact_counts.items())),
            'derivatives': {'files': len(M.used), 'bytes': added}, 'warnings': sorted(set(warnings)),
            'notes': 'Keys are the generator\'s c["path"] (Arabic page). Context photos are never the company\'s own; captions say what they show.'}
    out = {'_meta': meta}
    out.update(index)
    if write:
        # (how many stale files were removed depends on the previous run, so it is reported, not stored)
        STATS['pruned'] = M.prune()
        dst = root + (out_json or OUT_JSON)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst + '.tmp', 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
            f.write('\n')
        os.replace(dst + '.tmp', dst)
    return out


EMPTY = {'logo': None, 'photos': [], 'videos': [], 'products': [], 'context': [], 'facts': {}}
STATS = {}
_LOADED = {}


def load_index(root=DEFAULT_ROOT, path=None):
    """the committed index ({} when it has not been built); cached per file and modification time"""
    root = root if root.endswith('/') else root + '/'
    fp = path or (root + OUT_JSON)
    try:
        mt = os.path.getmtime(fp)
    except OSError:
        return {}
    if _LOADED.get(fp, (None,))[0] != mt:
        with open(fp, encoding='utf-8') as f:
            _LOADED[fp] = (mt, json.load(f))
    return _LOADED[fp][1]


def read_js_array(path, var):
    """window.<VAR>=[…]; from a data/*.js file (plain JSON array literal)"""
    try:
        with open(path, encoding='utf-8') as f:
            t = f.read()
    except OSError:
        return []
    m = re.search(r'window\.' + re.escape(var) + r'\s*=\s*(\[.*\])\s*;?\s*$', t, re.S)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except ValueError:
        return []


def check_index(idx, root=DEFAULT_ROOT):
    """every src exists and has the stated size; captions on every non-own photo; facts have both labels; returns problems"""
    from PIL import Image
    root = root if root.endswith('/') else root + '/'
    probs = []
    sizes = {}

    def chk(o, where):
        if not o:
            return
        for x in [o] + ([o['sm']] if o.get('sm') else []):
            src = x.get('src') or ''
            if not src.startswith('/img/') or '//' in src[1:]:
                probs.append('bad_src:%s:%s' % (where, src))
                continue
            fp = root + src[1:]
            if src not in sizes:
                try:
                    with Image.open(fp) as im:
                        sizes[src] = im.size
                except Exception:
                    sizes[src] = None
            if sizes[src] is None:
                probs.append('missing:%s:%s' % (where, src))
            elif tuple(sizes[src]) != (x.get('w'), x.get('h')):
                probs.append('size:%s:%s' % (where, src))
            elif x.get('w', 0) > 1280:
                probs.append('too_wide:%s:%s' % (where, src))
    for path, e in idx.items():
        if path.startswith('_'):
            continue
        chk(e.get('logo'), path)
        for p in e.get('photos') or []:
            chk(p, path)
            if not p.get('cap_ar') or not p.get('cap_en'):
                probs.append('photo_caption:%s' % path)
        for p in e.get('products') or []:
            chk(p.get('img'), path)
        for x in e.get('context') or []:
            chk(x, path)
            if x.get('kind') not in ('zone', 'gov', 'sector') or 'ليست' not in x.get('cap_ar', '') or 'not ' not in x.get('cap_en', ''):
                probs.append('context_caption:%s' % path)
        for v in e.get('videos') or []:
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}', v.get('yt') or ''):
                probs.append('video_id:%s' % path)
            if v.get('thumb') and not os.path.isfile(root + v['thumb'][1:]):
                probs.append('video_thumb:%s' % path)
        for k, f in (e.get('facts') or {}).items():
            if not f.get('label_ar') or not f.get('label_en') or not f.get('value_ar') or not f.get('source'):
                probs.append('fact:%s:%s' % (path, k))
            if re.search(r'\+?\d[\d\s-]{8,}\d|@', f.get('value_ar') or ''):
                probs.append('fact_contact:%s:%s' % (path, k))
    for src, sz in sizes.items():
        if sz and os.path.getsize(root + src[1:]) > PHOTO_MAX_BYTES:
            probs.append('too_heavy:%s' % src)
    return probs


def main(argv=None):
    ap = argparse.ArgumentParser(description='Build seo/company-media.json (real media per company page) and img/fprof/ derivatives.')
    ap.add_argument('--root', default=DEFAULT_ROOT, help='project root (default: the parent of tools/)')
    ap.add_argument('--data', help='generator data dump (tools/dump-data.mjs output); default: the generator decides (build/data.json, re-dumped when stale)')
    ap.add_argument('--out', default=OUT_JSON, help='output path relative to the root (default %(default)s)')
    ap.add_argument('--check', action='store_true', help='also verify every image reference')
    ap.add_argument('--report', action='store_true', help='print every extracted fact (for review)')
    a = ap.parse_args(argv)
    root = a.root if a.root.endswith('/') else a.root + '/'
    S, tr = load_state(root, a.data)
    idx = build_index(S, root, tr, True, a.out)
    meta = idx['_meta']
    print(json.dumps({'out': a.out, 'coverage': meta['coverage'], 'facts_by_key': meta['facts_by_key'], 'derivatives': meta['derivatives'],
                      'stale_removed': STATS.get('pruned', 0), 'warnings': meta['warnings']}, ensure_ascii=False, indent=1))
    rc = 1 if meta['warnings'] else 0
    if a.report:
        for path, e in idx.items():
            if not path.startswith('_') and e['facts']:
                for k, f in e['facts'].items():
                    print('%s\t%s\t%s\t%s' % (path, k, f['value_ar'], f['value_en']))
    if a.check:
        probs = check_index(idx, root)
        print('check: %d problem(s)' % len(probs) + ''.join('\n  ' + p for p in probs[:40]))
        rc = rc or (1 if probs else 0)
    return rc


if __name__ == '__main__':
    sys.exit(main())
