#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Unit tests for tools/company_media.py (stdlib unittest; Pillow needed for the index checks).

    python3 tools/test_company_media.py            # fact extraction + the committed seo/company-media.json
    COMPANY_MEDIA_FULL=1 python3 tools/test_company_media.py   # also rebuild the index in memory from the generator model
"""
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE) + '/'
sys.path.insert(0, HERE)
import company_media as cm  # noqa: E402


class Facts(unittest.TestCase):
    def f(self, text, name=''):
        return cm.extract_facts(text, name)

    def test_founded(self):
        self.assertEqual(self.f('شركة مصرية تأسست عام 1996 في مدينة العاشر من رمضان.')['founded'], ('1996', '1996'))
        self.assertEqual(self.f('تأسست الشركة في أبريل عام 1947 بمنطقة الهرم.')['founded'][0], '1947')
        self.assertEqual(self.f('Frozena Company was Established in 2006 with a clear vision.')['founded'][0], '2006')
        self.assertEqual(self.f('Since its foundation back in 1964, the group has grown.')['founded'][0], '1964')

    def test_founded_of_another_entity_is_skipped(self):
        self.assertNotIn('founded', self.f('وتعمل الشركة ضمن مجموعة مؤمن للاستثمارات، التي يعود تاريخ تأسيسها إلى عام 1989، بينما بدأت الشركة.'))
        self.assertNotIn('founded', self.f('وتعمل الشركة ضمن مجموعة سيبيلكو العالمية، التي تأسست عام 1872 وتقدم حلولاً.'))
        self.assertNotIn('founded', self.f('تأسست مجموعة مصر الحجاز عام 1982 لتلبية الاحتياجات.', 'مصر الحجاز لوصلات المواسير'))
        self.assertNotIn('founded', self.f('تأسست على يد المهندس فلان عام 1990.'))
        self.assertNotIn('founded', self.f('تأسست الشركة الأم عام 1960 في ميلانو.'))

    def test_since(self):
        self.assertEqual(self.f('وتعمل الشركة في السوق المصري منذ عام 1995. كما تخدم العمليات.')['since'][0], '1995')
        self.assertEqual(self.f('We have been in business since 1994 and we depend on quality.')['since'][0], '1994')
        self.assertEqual(self.f('بدأت الشركة نشاطها عام 1992، واكتسبت خبرة طويلة.')['since'][0], '1992')
        self.assertNotIn('since', self.f('وتشير البيانات إلى ارتباطها بعلامة Tsurumi Pump اليابانية منذ عام 1987.'))
        self.assertNotIn('since', self.f('التابعة لمجموعة حمزة. بدأت المجموعة نشاطها عام 1949 ثم توسعت.', 'حمزة لصناعة مواسير الصرف'))

    def test_numbers_are_quoted_not_derived(self):
        f = self.f('تبلغ الطاقة الإنتاجية المعلنة للشركة نحو 12,000 طن سنويًا، مع خبرة.')
        self.assertEqual(f['capacity'], ('نحو 12,000 طن سنوياً', 'About 12,000 tonnes per year'))
        f = self.f('مما أدى إلى زيادة الطاقة الإنتاجية لتتجاوز 3200 طن شهريًا.')
        self.assertEqual(f['capacity'][1], 'More than 3,200 tonnes per month')
        f = self.f('تضم أكثر من 21,000 موظف، وحققت إيرادات.')
        self.assertEqual(f['employees'], ('أكثر من 21,000 موظف', 'More than 21,000 employees'))
        self.assertNotIn('area', self.f('افتتاح مصنعها الثاني في مدينة العبور على مساحة 30 ألف متر مربع.'))
        self.assertEqual(self.f('تمتلك الشركة مصنعًا يمتد على مساحة 32 ألف متر مربع، ويضم خطوطاً.')['area'][0], '32 ألف متر مربع')

    def test_certificates_and_markets(self):
        f = self.f('نعمل وفقا للمعايير الدولية ونحمل شهادات مرموقة مثل ISO 9001 وISO 14001 وISO 45001. تكمن قوتنا.')
        self.assertEqual(f['certificates'][1], 'ISO 9001, ISO 14001, ISO 45001')
        self.assertNotIn('certificates', self.f('موزع معتمد لمضخات حاصلة على شهادة ISO 9001.'))
        self.assertNotIn('certificates', self.f('نعمل وفق معايير ISO 9001.'))
        f = self.f('لتغطية الاحتياجات المحلية وتصدير الفائض إلى الدول العربية والبحر الأبيض المتوسط والشرق الأوسط…')
        self.assertEqual(f['export_markets'][1], 'Arab countries, the Mediterranean, the Middle East')
        self.assertEqual(self.f('تقوم الشركة بتصدير منتجاتها لبعض الدول العربية')['export_markets'][1], 'some Arab countries')

    def test_group(self):
        self.assertEqual(self.f('كابلات القوى ضمن مجموعة السويدي إليكتريك.')['group'][0], 'السويدي إليكتريك')
        self.assertEqual(self.f('إحدى شركات مجموعة النجار المتخصصة في الإنتاج الزراعي.')['group'][0], 'النجار')
        self.assertNotIn('group', self.f('وتعمل الشركة ضمن مجموعة بعلبكي للصناعات الكيميائية.', 'بعلبكي إيجيبت'))

    def test_no_contacts_or_names_in_values(self):
        f = self.f('تأسست الشركة عام 2002 على يد المهندس عدلي الدهيبي، هاتف 01012345678، بريد info@x.com')
        for va, ve in f.values():
            self.assertNotRegex(va, r'\d{8,}|@|الدهيبي')


class CuratedTables(unittest.TestCase):
    def test_files_exist(self):
        for row in cm.OWN_PHOTOS:
            self.assertTrue(os.path.isfile(ROOT + row['file']), row['file'])
            self.assertIn(row['file'], cm.COMMONS, 'own photos need their Commons credit')
        for zid, (rel, a, e) in cm.ZONE_PHOTOS.items():
            self.assertTrue(os.path.isfile(ROOT + rel), rel)
        for rx, rel, a, e in cm.CITY_PHOTOS:
            self.assertTrue(os.path.isfile(ROOT + rel), rel)
        for code in cm.GOV_PHOTOS:
            self.assertTrue(os.path.isfile(ROOT + 'img/gov/gv-%s.jpg' % code), code)
        self.assertNotIn('SUZ', cm.GOV_PHOTOS, 'gv-SUZ.jpg shows Port Said')
        for slug, rel in cm.SECTOR_PHOTOS.items():
            self.assertTrue(os.path.isfile(ROOT + rel), rel)
            self.assertNotIn(os.path.basename(rel), ('cat-metal.jpg', 'cat-ac.jpg', 'cat-lugs.jpg', 'cat-heater.jpg'))
        for row in cm.VIDEOS:
            self.assertRegex(row['yt'], r'^[A-Za-z0-9_-]{11}$')
            self.assertTrue(os.path.isfile(ROOT + 'img/yt/%s.jpg' % row['yt']))


class CommittedIndex(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        p = ROOT + cm.OUT_JSON
        cls.idx = None
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                cls.idx = json.load(f)

    def setUp(self):
        if self.idx is None:
            self.skipTest('seo/company-media.json not built yet')

    def test_meta_and_contract(self):
        meta = self.idx['_meta']
        self.assertEqual(meta['schema'], cm.SCHEMA)
        self.assertEqual(meta['warnings'], [])
        n = 0
        for path, e in self.idx.items():
            if path.startswith('_'):
                continue
            n += 1
            self.assertTrue(path.startswith('/factories/') and path.endswith('/'), path)
            self.assertEqual(sorted(e), ['context', 'facts', 'logo', 'photos', 'products', 'videos'], path)
            for x in e['context']:
                self.assertIn(x['kind'], ('zone', 'gov', 'sector'))
            for p in e['products']:
                self.assertTrue({'key', 'name_ar', 'name_en', 'img', 'cat_ar', 'cat_en', 'href'} <= set(p), path)
        self.assertEqual(n, meta['coverage']['companies'])

    def test_every_reference_is_a_local_file_with_its_size(self):
        self.assertEqual(cm.check_index(self.idx, ROOT), [])

    def test_attachments_only_where_curated(self):
        own = sum(len(r['who']) for r in cm.OWN_PHOTOS)        # one photo entry per (photo, company) row of the table
        got = sum(1 for p, e in self.idx.items() if not p.startswith('_') for x in e['photos'])
        self.assertEqual(got, own)
        vids = sum(len(e['videos']) for p, e in self.idx.items() if not p.startswith('_'))
        self.assertEqual(vids, sum(len(r['who']) for r in cm.VIDEOS))
        self.assertEqual(self.idx['/factories/egytech-cables/']['photos'], [])

    def test_egytech(self):
        e = self.idx['/factories/egytech-cables/']
        self.assertIsNone(e['logo'])
        self.assertEqual([x['kind'] for x in e['context']], ['zone', 'gov', 'sector'])
        self.assertEqual(e['facts']['group']['href'], '/factories/elsewedy-electric/')

    def test_group_logos_from_listings_are_not_company_logos(self):
        for path in cm.DENY_LISTING_LOGOS:
            self.assertIn(path, self.idx, path)
            self.assertIsNone(self.idx[path]['logo'], path)
        self.assertEqual(self.idx['_meta']['coverage']['logo_from_listing'],
                         sum(1 for p, e in self.idx.items() if not p.startswith('_') and e['logo'] and e['logo']['from'] == 'product-listing'))

    def test_total_size(self):
        self.assertLessEqual(self.idx['_meta']['derivatives']['bytes'], 40 * 1024 * 1024)


@unittest.skipUnless(os.environ.get('COMPANY_MEDIA_FULL'), 'set COMPANY_MEDIA_FULL=1 to rebuild from the generator model')
class FullRebuild(unittest.TestCase):
    def test_every_company_has_an_entry_and_the_build_is_deterministic(self):
        data = os.environ.get('MIG_SEO_DATA') or (ROOT + 'build/data.json')
        S, tr = cm.load_state(ROOT, data if os.path.exists(data) else None)
        a = cm.build_index(S, ROOT, tr, write=False)
        b = cm.build_index(S, ROOT, tr, write=False)
        self.assertEqual(json.dumps(a, ensure_ascii=False, sort_keys=True), json.dumps(b, ensure_ascii=False, sort_keys=True))
        self.assertEqual(set(k for k in a if not k.startswith('_')), set(c['path'] for c in S['companies']))


if __name__ == '__main__':
    unittest.main(verbosity=1)
