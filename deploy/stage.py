#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Stage the built site for a Cloudflare Pages direct upload, then check it.

    python3 deploy/stage.py stage --site build/site-fresh --out build/pages-stage [--seo-stats build/seo-stats.json]
    python3 deploy/stage.py check --out build/pages-stage
    python3 deploy/stage.py emulate --out build/pages-stage --to build/pages-prod-emu
    python3 deploy/stage.py contacts [--html] FILE …
    python3 deploy/stage.py refs [--path /x/] FILE
    python3 deploy/stage.py apk FILE.apk …

stage    Copies <site> into <out>/site:
           - every symlink is resolved into real files (site/data, site/img, site/media point into the repository);
             symlink loops such as data/data -> ../data are skipped; a symlink that leaves the repository is refused and
             a broken symlink is an ERROR (the pages would ship without their scripts or images),
           - junk, build-only and retired demo files are dropped (deploy/stage-exclude.txt, hidden files except .well-known),
           - a file whose URL the build redirects (exact sources in _seo/redirects.json) is dropped with a warning.
         Copies functions/ (without tests) to <out>/functions and the Pages config to <out>/wrangler.toml, then runs the checks.
check    Runs the checks on an existing stage:
           Pages limits (files, 25 MiB per file, _routes.json / _headers / _redirects), path names, required files,
           the Pages config (previews must not get the production KV / D1), robots.txt, sitemaps (every URL → a staged,
           indexable, self-canonical page), a clean build (no files left over from an older build: x.html next to
           x/index.html, pages older than the build, pages outside the build manifest), every local reference (scripts,
           styles, images, links, canonical/hreflang, JSON-LD and og: URLs on madeinegyptgate.com) resolves, every
           _redirects rule is also in _seo/redirects.json (production skips _redirects for requests the Functions serve),
           the generator's own validation (build/seo-stats.json problem_count = 0) and the owner's honesty rules: no 26k /
           26,808 claim, no phone numbers (mobile, landline, hotline, any spacing) or e-mails outside the platform's own in
           generated pages, JSON-LD, sitemaps, the manifest or the CSV downloads, public-source factories labelled, no
           VideoObject, no pages built from sample leads. The installable app (check_pwa): both manifests valid, their icons
           present at the sizes they declare, start_url and shortcuts on staged pages, and /sw.js never handling the API, the
           private pages, the old system's paths or the APK downloads (or it is the kill switch, a warning). The Android app on
           the site (check_app): .apk files only in downloads/android/, latest.json naming a staged file of the same size and
           SHA-256 (25 MiB at most), every APK signed by a certificate that /.well-known/assetlinks.json lists (no debug key),
           assetlinks.json naming com.madeinegyptgate.app, the 302 /app/android.apk → the published file in _redirects (none
           without an APK), and that path outside the Functions.
emulate  Hard-links a stage into a copy whose _redirects keeps only the rules that production applies (requests the
         Functions do not serve), for `wrangler pages dev` tests that behave like production.
contacts Prints the phone numbers / e-mails a file contains (same detector as the gate; used by smoke-test.sh).
refs     Prints the local scripts, styles and images an HTML page loads (used by smoke-test.sh).
apk      Prints the signing certificates (SHA-256, as apksigner prints them) of APK files, «debug» for the Android debug key
         (used by tools/publish_apk.py; no Android SDK needed).

Writes <out>/STAGE-REPORT.json. Exit status: 0 = no errors (warnings allowed), 1 = errors, 2 = usage problem.
Standard library only (Python >= 3.8); runs on Linux, macOS and WSL.
"""
import argparse
import calendar
import concurrent.futures
import fnmatch
import hashlib
import html
import json
import os
import re
import shutil
import struct
import sys
import time
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from urllib.parse import quote, unquote, urljoin, urlsplit

SITE_HOST = "madeinegyptgate.com"
SITE_ORIGIN = "https://" + SITE_HOST
SELF_HOSTS = {SITE_HOST, "www." + SITE_HOST}
PLATFORM_ORG_ID = SITE_ORIGIN + "/#org"
PROD_KV_ID = "b321fb348f3447179c99b4380952e5ac"
PROD_D1_ID = "f86e00bb-9739-4985-a149-3dddb45b2b42"
MAX_FILE_BYTES = 25 * 1024 * 1024          # Pages: 25 MiB per asset
WARN_FILE_BYTES = 10 * 1024 * 1024
DEFAULT_MAX_FILES = 20000                  # Pages free plan: 20,000 files per deployment
SITEMAP_MAX_URLS = 10000                   # SEO-SPEC 1.9 (protocol limit is 50,000)
STALE_MARGIN_S = 15 * 60                   # a page older than the build start by more than this is a leftover
STAGE_MARKER = ".migate-stage"
# Files wrangler never uploads as assets (wrangler-dist validate(): IGNORE_LIST); the 4 config files go up separately.
WRANGLER_TOP_IGNORE = {"_worker.js", "_redirects", "_headers", "_routes.json"}
REQUIRED_SITE_FILES = ["index.html", "404.html", "410.html", "robots.txt", "sitemap.xml", "_routes.json", "_headers",
                       "_redirects", "_seo/redirects.json", "_seo/pages.json", "_seo/en-paths.json", "en/index.html",
                       # the installable app (seo_build.part.py emit_pwa; check_pwa below)
                       "manifest.webmanifest", "manifest.en.webmanifest", "sw.js", "offline/index.html"]
SECRET_LIKE = [".env", ".env.*", ".dev.vars", "*.pem", "*.p12", "*.pfx", "id_rsa*", "id_ed25519*", "id_ecdsa*",
               "credentials*.json", "service-account*.json", "*.sqlite", "*.sqlite3", "*.db"]
SEARCH_BOT_RX = re.compile(r"^(\*|googlebot.*|google-extended|bingbot|msnbot.*|adidxbot|yandex.*|duckduckbot|applebot|"
                           r"baiduspider.*|slurp|petalbot|seznambot|naver.*|yeti)$", re.I)
SECRET_VAR_RX = re.compile(r"(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|(^|_)KEY$|API_?KEY)", re.I)

# ------------------------------------------------------------------------------------------------ contact data detector
# Same rules as functions/_lib/seo-privacy.js (the edge refuses these in admin overrides) and the generator's scrub():
# Egyptian mobiles and landlines in any spacing (spaces, dashes, dots, slashes, brackets, +20 / 0020), numbers right
# after a phone word (هاتف، تليفاكس، الخط الساخن، phone, fax, hotline …), tel: / wa.me links, e-mails incl. «x [at] y [dot] com».
# Allowed: the platform's own published numbers / domain and obvious form placeholders; deploy/privacy-allow.txt adds
# reviewed false positives (one literal per line).
PLATFORM_PHONE_KEYS = {"1279188996",        # 01279188996 / +20 127 918 8996 — platform WhatsApp (footer, contact page)
                       "238346757",         # +20 2 3834 6757 — platform landline (Organization JSON-LD, contact page)
                       "1012345678"}        # 01012345678 — example number used as an input placeholder
ALLOWED_EMAIL_DOMAINS = {SITE_HOST, "example.com", "example.org", "example.net",
                         "company.com", "buyer.com", "company.com.eg"}   # platform addresses + form placeholders
FILE_EXT_TLDS = {"png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "ico", "css", "js", "mjs", "json", "woff",
                 "woff2", "ttf", "mp4", "webm", "pdf", "html", "xml", "txt"}
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_SEP = r"[\s\-./() ‎‏‪-‮]*"
_D = r"(?:" + _SEP + r"\d)"
MOBILE_RX = re.compile(r"(?<![\d+])(?:(?:\+|00)" + _SEP + r"20" + _SEP + r"0?|0)" + _SEP + r"1[0125]" + _D + r"{8}(?!\d)"
                       r"|(?<![\d+])201[0125]\d{8}(?!\d)")
LAND_RX = re.compile(r"(?<![\d+])(?:(?:\+|00)" + _SEP + r"20" + _SEP + r"\(?0?|\(?0)(?:2\)?" + _D + r"{8}|3\)?" + _D + r"{7}|"
                     r"(?:4[0-8]|5[05-7]|6[2-9]|8[2468]|9[2-7])\)?" + _D + r"{7})(?!\d)")
_AR = "ء-ي"
LABEL_RX = re.compile(r"(?:(?<![" + _AR + r"])(?:و|ف|ب|ل|لل|ال|وال|بال)?(?:الخط الساخن|خط ساخن|رقم الهاتف|رقم التليفون|تليفاكس|"
                      r"تلفاكس|تليفون|تلفون|هاتف|هواتف|فاكس|موبايل|محمول|جوال|واتساب|واتس اب|واتس|اتصل|اتصال|الخط المختصر|"
                      r"رقم مختصر)(?![" + _AR + r"])|\b(?:hot\s?line|telephone|tel|phone|mobile|cell|fax|whats\s?app|"
                      r"call(?:\s+us)?)\b)\s*[:：\-–]?\s*((?:\+|00)?\d" + _D + r"{4,})", re.I)
LINK_RX = re.compile(r"wa\.me/\+?\d{6,}|whatsapp\.com/send/?\?phone=\+?\d{6,}|\b(?:tel|sms|callto):\+?[\d\s\-.()]{5,}", re.I)
OBF_EMAIL_RX = re.compile(r"[a-z0-9._%+-]+\s*(?:＠|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*([a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|"
                          r"\[\s*dot\s*\]|\{\s*dot\s*\})\s*[a-z0-9-]+)+)", re.I)
EMAIL_LOCAL_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+-")
EMAIL_DOMAIN_RX = re.compile(r"((?:[A-Za-z0-9-]{1,63}\.)+([A-Za-z]{2,24}))(?![A-Za-z0-9-])")
DIGITRUN_RX = re.compile(r"\d[\d\s\-./() ‎‏‪-‮]{3,}\d")
URL_IN_TEXT_RX = re.compile(r"(?:https?://|www\.)[^\s\"'<>]+", re.I)     # file names / ids inside URLs are not phone numbers
HASH_IN_TEXT_RX = re.compile(r"(?<![0-9A-Za-z])[0-9A-Fa-f]{64}(?![0-9A-Za-z])")   # a SHA-256 (the APK's, /app/ and latest.json)
STRICT_MOBILE_RX = re.compile(r"(?<![\d+])(?:\+?20|0)?1[0125]\d{8}(?!\d)")
ALLOW = {"keys": set(), "literals": set()}     # deploy/privacy-allow.txt
HERE = os.path.dirname(os.path.abspath(__file__))
LEGACY_LIVE_FILE = os.path.join(HERE, "legacy-live.txt")
LEGACY_LIVE_REF = os.path.join(os.path.dirname(HERE), "docs", "janna", "legacy-live")


def load_legacy_live(path=None):
    """deploy/legacy-live.txt → [(path, is_prefix)]: DEPLOY 1 paths that the owner's old system (Worker mis-egypt →
    Hostinger) keeps answering on madeinegyptgate.com after the cutover (panel.html, login.html, api/index.php …)"""
    out = []
    try:
        with open(path or LEGACY_LIVE_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.split("#", 1)[0].strip()
                if line.startswith("/"):
                    out.append((line.rstrip("*"), line.endswith("*")))
    except OSError:
        pass
    return out


def legacy_live_hit(p, rules):
    return any((p.startswith(x) if pre else p == x) for x, pre in rules)


def phone_key(v):
    """national significant number: no +, 00, country code 20 or trunk 0"""
    d = re.sub(r"\D", "", str(v).translate(ARABIC_DIGITS))
    if d.startswith("00"):
        d = d[2:]
    if re.match(r"^20\d{9,10}$", d):
        d = d[2:]
    return d.lstrip("0")


def _allowed_phone(v):
    k = phone_key(v)
    return k in PLATFORM_PHONE_KEYS or k in ALLOW["keys"] or v.strip() in ALLOW["literals"]


def _allowed_email(dom, value):
    return dom in ALLOWED_EMAIL_DOMAINS or dom.endswith("." + SITE_HOST) or value.strip().lower() in ALLOW["literals"]


def emails_in(t):
    """e-mail addresses (linear scan around '@', also on multi-MB data files) and «x [at] y [dot] com» spellings"""
    found = []
    i = t.find("@")
    while i != -1:
        j = i
        while j > 0 and i - j < 64 and t[j - 1] in EMAIL_LOCAL_CHARS:
            j -= 1
        m = EMAIL_DOMAIN_RX.match(t, i + 1) if j < i else None
        if m:
            dom, tld = m.group(1).lower(), m.group(2).lower()
            if not (tld in FILE_EXT_TLDS or _allowed_email(dom, t[j:m.end()])):
                found.append(t[j:m.end()])
        i = t.find("@", i + 1)
    if "＠" in t or (("at" in t or "AT" in t) and re.search(r"[(\[{]\s*at\s*[)\]}]", t, re.I)):
        for m in OBF_EMAIL_RX.finditer(t):
            dom = re.sub(r"[(\[{]dot[)\]}]", ".", re.sub(r"\s+", "", m.group(1).lower()))
            if not _allowed_email(dom, m.group(0)):
                found.append(m.group(0))
    return found


def contacts(text):
    """non-allowed phone numbers, WhatsApp/tel links and e-mails in a text"""
    t = text.translate(ARABIC_DIGITS)
    found = [m.group(0) for m in LINK_RX.finditer(t) if not _allowed_phone(m.group(0))]
    found += emails_in(t)
    if DIGITRUN_RX.search(t):
        u = URL_IN_TEXT_RX.sub(" ", t) if ("http" in t or "www." in t) else t
        # the digit runs inside a hex digest are not phone numbers (about 1 SHA-256 in 250 holds a landline-like run)
        u = HASH_IN_TEXT_RX.sub(" ", u) if len(u) >= 64 else u
        for rx in (MOBILE_RX, LAND_RX):
            found += [m.group(0).strip() for m in rx.finditer(u) if not _allowed_phone(m.group(0))]
        found += [m.group(0).strip() for m in LABEL_RX.finditer(u) if not _allowed_phone(m.group(1))]
    return found


BLOCK_RX = re.compile(r"<(script|style|svg|template|noscript)\b([^>]*)>(.*?)</\1\s*>", re.S | re.I)
TAG_RX = re.compile(r"<[^>]*>")
TEXT_ATTR_RX = re.compile(r"\b(content|title|alt|placeholder|aria-label|value|data-copy|label)\s*=\s*(\"[^\"]*\"|'[^']*')", re.I)
HREF_ANY_RX = re.compile(r"\bhref\s*=\s*(\"[^\"]*\"|'[^']*')", re.I)


def html_contacts(doc):
    """contacts in a page's visible text, text-bearing attributes and links; inline scripts get the strict check
    (unseparated mobiles and e-mails: script code is full of number runs); JSON-LD is checked separately"""
    out, scripts = [], []

    def keep(m):
        if m.group(1).lower() == "script" and "ld+json" not in m.group(2).lower():
            scripts.append(m.group(3))
        return " "
    body = BLOCK_RX.sub(keep, doc)
    for m in TEXT_ATTR_RX.finditer(body):
        out += contacts(html.unescape(m.group(2)[1:-1]))
    for m in HREF_ANY_RX.finditer(body):
        v = html.unescape(m.group(1)[1:-1]).strip()
        low = v[:7].lower()
        if low.startswith(("tel:", "sms:")) or "wa.me/" in v or "whatsapp.com/send" in v:
            # judge only the number, not a prefilled ?text= message (its %-escapes are digits too)
            nm = re.search(r"(?:wa\.me/|[?&]phone=)\+?(\d{6,})", v) if ("wa.me/" in v or "whatsapp.com/send" in v) else None
            num = nm.group(1) if nm else v.split("?", 1)[0]
            if not _allowed_phone(num):
                out.append(v)
        elif low == "mailto:":
            out += emails_in(v[7:])
    out += contacts(html.unescape(TAG_RX.sub(" ", body)))
    for s in scripts:
        t = s.translate(ARABIC_DIGITS)
        out += [m.group(0) for m in STRICT_MOBILE_RX.finditer(t) if not _allowed_phone(m.group(0))]
        out += emails_in(t)
    return out


def load_privacy_allow(path):
    if not path or not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            s = line.split("#", 1)[0].strip() if not line.lstrip().startswith("#") else ""
            if not s:
                continue
            ALLOW["literals"].add(s.lower() if "@" in s else s)
            if re.fullmatch(r"[+\d\s\-./()]{6,}", s):
                ALLOW["keys"].add(phone_key(s))


# ----------------------------------------------------------------------------------------------------- the 26k claim
# The removed «26,808 / 26k» claim. STRICT matches the figure itself anywhere; BROAD is SEO-SPEC A3
# (/26[\s,.]?(k|000|ألف)/) with a digit guard so years such as 2026 never match.
_CLAIM_STRICT_AT = re.compile(r"26(?:\s?[,.٬]?\s?808(?!\d)|\s?(?P<k>[kK])\+?(?!\w))")
_CLAIM_STRICT_AR = re.compile(r"٢٦[٬,.]?٨٠٨")
_CLAIM_BROAD_AT = re.compile(r"26[\s,.٬]?(?:000|ألف|[kK](?![A-Za-z0-9]))")
JSONLD_RX = re.compile(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script\s*>', re.S | re.I)
CANON_RX = re.compile(r'<link\b[^>]*\brel=["\']canonical["\'][^>]*>', re.I)
ROBOTS_RX = re.compile(r'<meta\b[^>]*\bname=["\']robots["\'][^>]*>', re.I)
HREF_RX = re.compile(r'\bhref=["\']([^"\']*)["\']', re.I)
CONTENT_RX = re.compile(r'\bcontent=["\']([^"\']*)["\']', re.I)
PUBLIC_SOURCE_LABEL = "بيانات من مصادر عامة"
VERIFIED_LABEL = "موثّق من فريق المنصة"     # the 91 MIGFAC companies, verified by hand by the platform team (owner decision 2026-11-18)
VERIFIED_LABEL_EN = "Verified by the platform team"
META_DESC_RX = re.compile(r'<meta\s+name="description"\s+content="([^"]*)"', re.I)

# ------------------------------------------------------------------------------------------------ local references
REF_TAG_RX = re.compile(r"<(script|link|img|source|a|iframe|video|audio|embed|track)\b([^>]*)>", re.I)
REF_ATTR_RX = re.compile(r"\b(src|href|poster|srcset)\s*=\s*(\"([^\"]*)\"|'([^']*)')", re.I)
REL_RX = re.compile(r"\brel\s*=\s*[\"']([^\"']*)[\"']", re.I)
BASE_RX = re.compile(r"<base\b[^>]*\bhref\s*=\s*[\"']([^\"']*)[\"']", re.I)
META_SELF_URL_RX = re.compile(r"<meta\b[^>]*\bcontent\s*=\s*[\"'](https?://(?:www\.)?madeinegyptgate\.com/[^\"']*)[\"']", re.I)
BLOCK_CONTENT_RX = re.compile(r"(<(script|style|template|textarea)\b[^>]*>)(.*?)(</\2\s*>)", re.S | re.I)
SKIP_SCHEMES = ("#", "mailto:", "tel:", "javascript:", "data:", "blob:", "sms:", "whatsapp:", "about:", "callto:")
LD_URL_KEYS = {"url", "@id", "isBasedOn", "sameAs", "image", "logo", "item", "contentUrl", "thumbnailUrl", "mainEntityOfPage"}


class Report:
    def __init__(self):
        self.errors, self.warnings, self.notes, self.stats = [], [], [], {}

    def error(self, code, msg, examples=None):
        self.errors.append({"code": code, "msg": msg, "examples": (examples or [])[:10]})

    def warn(self, code, msg, examples=None):
        self.warnings.append({"code": code, "msg": msg, "examples": (examples or [])[:10]})

    def note(self, msg):
        self.notes.append(msg)


def nfc(s):
    return unicodedata.normalize("NFC", s)


def human(n):
    for unit in ("B", "KiB", "MiB", "GiB"):
        if n < 1024 or unit == "GiB":
            return ("%.1f %s" % (n, unit)) if unit != "B" else ("%d B" % n)
        n /= 1024.0


def inside(path, roots):
    for r in roots:
        if path == r or path.startswith(r.rstrip(os.sep) + os.sep):
            return True
    return False


def load_patterns(path):
    pats = []
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    pats.append(line)
    return pats


def matches(rel, name, patterns):
    for p in patterns:
        if "/" in p:
            if fnmatch.fnmatchcase(rel, p.strip("/")):
                return p
        elif fnmatch.fnmatchcase(name, p):
            return p
    return None


def path_problem(rel):
    for seg in rel.split("/"):
        if not seg:
            return "empty path segment"
        if seg != seg.strip() or seg.endswith("."):
            return "leading/trailing space or trailing dot in %r" % seg
        if any(ord(c) < 32 or ord(c) == 127 for c in seg):
            return "control character"
        for c in "#?%\\":
            if c in seg:
                return "character %r (breaks the URL of the file)" % c
        try:
            if not unicodedata.is_normalized("NFC", seg):
                return "not NFC-normalised (the edge layer and the sitemaps use NFC)"
        except AttributeError:          # Python < 3.8
            if nfc(seg) != seg:
                return "not NFC-normalised (the edge layer and the sitemaps use NFC)"
    return None


def load_json_file(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def load_redirect_maps(site):
    r = load_json_file(os.path.join(site, "_seo", "redirects.json"), {}) or {}
    exact = {nfc(unquote(k)): v for k, v in (r.get("exact") or {}).items()}
    prefixes = [(nfc(unquote(p[0])), p[1]) for p in (r.get("prefix") or []) if isinstance(p, (list, tuple)) and len(p) >= 2]
    gone_rx = [x for x in (r.get("gone_rx") or []) if isinstance(x, str)]
    return exact, prefixes, gone_rx


def stale_url(rel, exact):
    """URL under which this file would be served, if the build redirects that URL away (stale leftover)."""
    if rel == "index.html":
        return None
    url = "/" + rel[: -len("index.html")] if rel.endswith("/index.html") else "/" + rel
    url = nfc(url)
    to = exact.get(url)
    if to and nfc(unquote(str(to).split("#")[0])) != url:
        return url
    return None


def manifest_built(site):
    """build start (epoch seconds) from _seo/pages.json {"built": "…Z"}"""
    m = load_json_file(os.path.join(site, "_seo", "pages.json"), None)
    b = m.get("built") if isinstance(m, dict) else None
    try:
        return calendar.timegm(time.strptime(b, "%Y-%m-%dT%H:%M:%SZ")), b
    except Exception:
        return None, None


# ----------------------------------------------------------------------------------------------------------------- stage
def walk_site(site, allowed_roots, patterns, rep):
    """Yield (rel, real_file, via_symlink) for every file to publish. Symlinks are followed (loop-safe, repository only)."""
    skipped = {"hidden": [], "pattern": [], "secret": [], "loop": [], "broken": [], "outside": [], "special": []}
    root_real = os.path.realpath(site)
    stack = [(site, "", frozenset([root_real]), False)]
    links = []
    while stack:
        d, rel_dir, ancestors, linked = stack.pop()
        try:
            entries = sorted(os.scandir(d), key=lambda e: e.name)
        except OSError as e:
            rep.error("read_dir", "cannot read directory %s: %s" % (d, e))
            continue
        for e in entries:
            name, rel = e.name, rel_dir + e.name
            if name.startswith(".") and name != ".well-known":
                skipped["hidden"].append(rel)
                continue
            if matches(rel, name, SECRET_LIKE):
                skipped["secret"].append(rel)
                continue
            pat = matches(rel, name, patterns)
            if pat:
                skipped["pattern"].append("%s  (%s)" % (rel, pat))
                continue
            p = e.path
            if e.is_symlink():
                target = os.path.realpath(p)
                if not os.path.exists(target):
                    skipped["broken"].append("%s -> %s" % (rel, os.readlink(p)))
                    continue
                if not inside(target, allowed_roots):
                    skipped["outside"].append("%s -> %s" % (rel, target))
                    continue
                if os.path.isdir(target):
                    if target in ancestors:
                        skipped["loop"].append("%s -> %s" % (rel, os.readlink(p)))
                        continue
                    links.append("%s/ -> %s" % (rel, target))
                    stack.append((target, rel + "/", ancestors | {target}, True))
                elif os.path.isfile(target):
                    links.append("%s -> %s" % (rel, target))
                    yield rel, target, True
                else:
                    skipped["special"].append(rel)
            elif e.is_dir(follow_symlinks=False):
                real = os.path.realpath(p)
                if real in ancestors:
                    skipped["loop"].append(rel)
                    continue
                stack.append((p, rel + "/", ancestors | {real}, linked))
            elif e.is_file(follow_symlinks=False):
                yield rel, p, linked
            else:
                skipped["special"].append(rel)
    rep.stats["symlinks_resolved"] = links
    rep.stats["skipped"] = {k: v for k, v in skipped.items() if v}
    hidden_secrets = [x for x in skipped["hidden"] if matches(x, x.rsplit("/", 1)[-1], SECRET_LIKE)]
    if hidden_secrets:
        rep.warn("hidden_secret_file", "hidden files that look like secrets sit in the build output (not uploaded; "
                 "remove them from the web root)", hidden_secrets)
    if skipped["secret"]:
        rep.error("secret_like_file", "files that look like secrets/keys/databases are in the build output; they were NOT "
                  "copied, but remove them from the site dir and find out how they got there", skipped["secret"])
    if skipped["outside"]:
        rep.error("symlink_outside", "symlinks pointing outside the repository were refused (they could publish private "
                  "files)", skipped["outside"])
    if skipped["broken"]:
        rep.error("symlink_broken", "broken symlinks in the build output: the pages would ship without these files "
                  "(site.py links data/, img/ and media/ by absolute path — rebuild after moving the repository: "
                  "deploy/deploy.sh build)", skipped["broken"])
    if skipped["loop"]:
        rep.note("symlink loops skipped: " + ", ".join(skipped["loop"]))


def safe_reset_dir(path, keep=(".wrangler",)):
    if os.path.lexists(path) and not os.path.isdir(path):
        raise SystemExit("stage.py: %s exists and is not a directory" % path)
    if os.path.isdir(path):
        entries = [n for n in os.listdir(path)]
        if entries and not os.path.exists(os.path.join(path, STAGE_MARKER)):
            raise SystemExit("stage.py: refusing to wipe %s: it is not empty and has no %s marker (not a stage dir?)"
                             % (path, STAGE_MARKER))
        for n in entries:
            if n in keep:               # keep wrangler's local cache between runs
                continue
            q = os.path.join(path, n)
            if os.path.isdir(q) and not os.path.islink(q):
                shutil.rmtree(q)
            else:
                os.unlink(q)
    os.makedirs(path, exist_ok=True)


def copy_functions(src, dst, rep):
    if not os.path.isfile(os.path.join(src, "_middleware.js")):
        rep.error("functions_missing", "functions/_middleware.js not found in %s — without the Functions the edge "
                  "redirects, 410s and SEO overrides do not run" % src)
        return 0
    n = 0
    skip_dirs = {"_tests", "node_modules", ".wrangler", "test", "tests"}
    for d, dirs, files in os.walk(src):
        dirs[:] = sorted(x for x in dirs if x not in skip_dirs and not x.startswith("."))
        for fn in sorted(files):
            if fn.startswith(".") or fn.endswith((".test.mjs", ".test.js", ".md")) or fn in ("package-lock.json",):
                continue
            s = os.path.join(d, fn)
            t = os.path.join(dst, os.path.relpath(s, src))
            os.makedirs(os.path.dirname(t), exist_ok=True)
            shutil.copy2(s, t)
            n += 1
    return n


def write_pages_config(template, dst, rep):
    if not os.path.isfile(template):
        rep.error("pages_config_missing", "Pages config template %s not found" % template)
        return
    with open(template, encoding="utf-8") as f:
        text = f.read()
    head = ("# GENERATED by deploy/stage.py from deploy/wrangler-pages.toml at %s — edit the template, not this copy.\n"
            % time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    with open(dst, "w", encoding="utf-8") as f:
        f.write(head + text)


def cmd_stage(a):
    rep = Report()
    site = os.path.abspath(a.site)
    out = os.path.abspath(a.out)
    repo = os.path.abspath(a.repo)
    if not os.path.isdir(site):
        raise SystemExit("stage.py: site dir %s not found — build first: deploy/deploy.sh build" % site)
    if inside(out, [os.path.realpath(site)]) or inside(os.path.realpath(site), [out]):
        raise SystemExit("stage.py: the stage dir must not be inside the site dir (or the other way round)")
    t0 = time.time()
    safe_reset_dir(out)
    with open(os.path.join(out, STAGE_MARKER), "w", encoding="utf-8") as f:
        json.dump({"site": site, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f)
    dst_site = os.path.join(out, "site")
    os.makedirs(dst_site, exist_ok=True)
    allowed = [os.path.realpath(site), os.path.realpath(repo)] + [os.path.realpath(x) for x in (a.allow_root or [])]
    patterns = load_patterns(a.exclude_file)
    exact, _, _ = load_redirect_maps(site)
    stale, copied, total, linked_tops, src_rels = [], 0, 0, set(), set()
    for rel, src, linked in walk_site(site, allowed, patterns, rep):
        src_rels.add(nfc(rel))
        su = stale_url(rel, exact)
        if su:
            stale.append("%s  (build redirects %s → %s)" % (rel, su, exact.get(su)))
            continue
        dst = os.path.join(dst_site, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        if linked:
            linked_tops.add(rel.split("/", 1)[0])
        copied += 1
        total += os.path.getsize(dst)
    twins = sorted(r for r in src_rels if "/" not in r and r.endswith(".html") and (r[:-5] + "/index.html") in src_rels)
    if twins:
        rep.error("stale_flat_pages", "%d old x.html file(s) next to the new x/index.html page in %s: a dirty build "
                  "output (an older build's pages are still there). Build into an empty directory: deploy/deploy.sh build"
                  % (len(twins), site), twins)
    if stale:
        rep.warn("stale_files_dropped", "%d file(s) whose URL the build redirects were not staged (the edge redirects "
                 "them before the file is served). Build into an empty directory (deploy/deploy.sh build) to make this "
                 "go away." % len(stale), stale)
    rep.stats["stale_dropped"] = stale
    rep.stats["copied_files"] = copied
    rep.stats["copied_bytes"] = total
    rep.stats["linked_dirs"] = sorted(linked_tops)
    nfun = copy_functions(os.path.abspath(a.functions), os.path.join(out, "functions"), rep) if not a.no_functions else 0
    rep.stats["functions_files"] = nfun
    write_pages_config(os.path.abspath(a.config), os.path.join(out, "wrangler.toml"), rep)
    rep.stats["stage_seconds"] = round(time.time() - t0, 1)
    rep.stats["source_site"] = site
    with open(os.path.join(out, STAGE_MARKER), "w", encoding="utf-8") as f:
        json.dump({"site": site, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "linked_dirs": sorted(linked_tops)}, f)
    return run_checks(out, a, rep)


# ----------------------------------------------------------------------------------------------------------------- checks
def routes_rules(site):
    r = load_json_file(os.path.join(site, "_routes.json"), {}) or {}
    return r.get("include") or [], r.get("exclude") or []


def route_match(path, rule):
    """Pages _routes.json rule: exact path, or a prefix ending in '*'"""
    if rule.endswith("*"):
        return path.startswith(rule[:-1])
    return path == rule


def served_by_functions(path, inc, exc):
    if any(route_match(path, r) for r in exc):
        return False
    return any(route_match(path, r) for r in inc)


def check_routes(site, rep):
    p = os.path.join(site, "_routes.json")
    if not os.path.isfile(p):
        return
    try:
        with open(p, encoding="utf-8") as f:
            r = json.load(f)
    except Exception as e:
        rep.error("routes_json", "_routes.json is not valid JSON: %s" % e)
        return
    inc, exc = r.get("include") or [], r.get("exclude") or []
    if r.get("version") != 1:
        rep.error("routes_json", "_routes.json: version must be 1")
    if not inc:
        rep.error("routes_json", "_routes.json: include must list at least one rule")
    rules = inc + exc
    if len(rules) > 100:
        rep.error("routes_json", "_routes.json: %d rules (Pages allows 100 include+exclude)" % len(rules))
    bad = [x for x in rules if not isinstance(x, str) or not x.startswith("/") or len(x) > 100]
    if bad:
        rep.error("routes_json", "_routes.json: rules must start with / and be ≤ 100 characters", bad)
    if any(x in ("/api/*", "/api/seo/*", "/api/seo*") for x in exc):
        rep.error("routes_api_excluded", "_routes.json excludes /api/* — exclude wins over include, so /api/seo/* (the "
                  "SEO admin API, a Pages Function) would never run. The Worker's own /api routes on the zone take "
                  "precedence anyway; remove \"/api/*\" from exclude")
    if not any(x in ("/*", "/") for x in inc):
        rep.warn("routes_include", "_routes.json does not include /* — HTML pages may bypass the SEO middleware")
    rep.stats["routes_rules"] = len(rules)


def check_headers(site, rep):
    p = os.path.join(site, "_headers")
    if not os.path.isfile(p):
        return
    rules, bad, cur, by_rule = 0, [], None, {}
    with open(p, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            s = line.rstrip("\n")
            if not s.strip() or s.lstrip().startswith("#"):
                continue
            if s[0] in " \t":
                if s.strip().startswith("!"):
                    # Pages "detach a header" syntax: `! Name` removes a header that a broader rule added (deploy 2 P-B3:
                    # /data/overlay.js drops the /data/* Cache-Control and sets max-age=60)
                    if not re.match(r"^![ \t]*[A-Za-z0-9-]+[ \t]*$", s.strip()):
                        bad.append("line %d: %s" % (i, s.strip()))
                    elif cur is not None:
                        by_rule.setdefault(cur, {}).pop(s.strip()[1:].strip().lower(), None)
                elif ":" not in s:
                    bad.append("line %d: %s" % (i, s.strip()))
                elif len(s) > 2000:
                    bad.append("line %d: longer than 2,000 characters" % i)
                elif cur is not None:
                    k, v = s.strip().split(":", 1)
                    by_rule.setdefault(cur, {})[k.strip().lower()] = v.strip()
            else:
                rules += 1
                cur = s.strip()
    if rules > 100:
        rep.error("headers_rules", "_headers has %d rules (Pages allows 100)" % rules)
    if bad:
        rep.error("headers_syntax", "_headers: malformed header lines", bad)
    rep.stats["headers_rules"] = rules
    # SEC M5: files served without the Functions (data/, img/ …) need the same security headers the middleware sets
    allr = by_rule.get("/*", {})
    want = {"content-security-policy": "frame-ancestors 'self'", "x-content-type-options": "nosniff",
            "referrer-policy": "strict-origin-when-cross-origin"}
    miss = [k for k, v in want.items() if v not in allr.get(k, "")]
    if miss:
        rep.error("security_headers", "_headers has no /* rule with the security headers (%s) — static files would be "
                  "served without them (seo_build.part.py emit_headers)" % ", ".join(miss))
    elif "frame-ancestors 'none'" in allr.get("content-security-policy", "") or "deny" in allr.get("x-frame-options", "").lower():
        rep.error("security_headers", "_headers forbids all framing, but Janna's live screen frames the site itself "
                  "(use frame-ancestors 'self' / X-Frame-Options SAMEORIGIN)")


def parse_redirects_file(site):
    p = os.path.join(site, "_redirects")
    rules, bad = [], []
    if not os.path.isfile(p):
        return rules, bad
    with open(p, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            parts = s.split()
            if len(parts) not in (2, 3) or (len(parts) == 3 and parts[2] not in ("200", "301", "302", "303", "307", "308")):
                bad.append("line %d: %s" % (i, s[:120]))
                continue
            if len(s) > 1000:
                bad.append("line %d: longer than 1,000 characters" % i)
            dyn = "*" in parts[0] or bool(re.search(r"/:[A-Za-z]", parts[0]))
            rules.append((parts[0], parts[1], parts[2] if len(parts) == 3 else "302", dyn, i))
    return rules, bad


def check_redirects(site, rep):
    rules, bad = parse_redirects_file(site)
    static = sum(1 for r in rules if not r[3])
    dynamic = len(rules) - static
    if static > 2000 or dynamic > 100:
        rep.error("redirects_limit", "_redirects has %d static + %d dynamic rules (Pages: ≤ 2,000 static, ≤ 100 "
                  "dynamic) — Pages would reject the deployment" % (static, dynamic))
    if bad:
        rep.error("redirects_syntax", "_redirects: malformed lines", bad)
    rep.stats["redirects_rules"] = {"static": static, "dynamic": dynamic}
    # Production: Pages does not apply _redirects to requests the Functions serve (docs: Pages › Redirects › Functions),
    # while `wrangler pages dev` does (behind ctx.next()) — so a rule that exists only in _redirects works locally and
    # 404s live. Every Function-routed rule must also be in _seo/redirects.json, which the middleware applies.
    exact, prefixes, _ = load_redirect_maps(site)
    inc, exc = routes_rules(site)
    only_file = []
    for src, to, code, dyn, line in rules:
        s = nfc(unquote(src))
        if not served_by_functions(s if not dyn else s.split("*")[0], inc, exc):
            continue
        if dyn:
            pre = s.split("*")[0].split("/:")[0]
            if not any(pre == p or pre.startswith(p) or p.startswith(pre) for p, _ in prefixes):
                only_file.append("line %d: %s → %s (no matching prefix rule)" % (line, src, to))
            continue
        tgt = exact.get(s)
        if tgt is None or nfc(unquote(str(tgt))) != nfc(unquote(to)):
            only_file.append("line %d: %s → %s (redirects.json: %s)" % (line, src, to, tgt))
    if only_file:
        rep.error("redirect_not_in_edge_map", "%d _redirects rule(s) for paths the Functions serve are missing from "
                  "_seo/redirects.json (or differ): in production Pages does not apply _redirects to those requests, so "
                  "they would answer 404 — the generator must write both maps from the same rules" % len(only_file), only_file)


def check_robots(site, rep):
    p = os.path.join(site, "robots.txt")
    if not os.path.isfile(p):
        return
    with open(p, encoding="utf-8") as f:
        text = f.read()
    lines = [l.strip() for l in text.splitlines()]
    if not any(l.lower() == ("sitemap: %s/sitemap.xml" % SITE_ORIGIN).lower() for l in lines):
        rep.error("robots_sitemap", "robots.txt has no 'Sitemap: %s/sitemap.xml' line" % SITE_ORIGIN)
    rules = [l for l in lines if re.match(r"(?i)^(allow|disallow)\s*:", l)]
    hashed = [l for l in rules if "#" in l]
    if hashed:
        rep.error("robots_hash", "robots.txt rules contain '#' (a comment start: the rule is cut there)", hashed)
    agents, blocked = [], []
    in_rules = False
    for l in lines:
        m = re.match(r"(?i)^user-agent\s*:\s*(.*)$", l)
        if m:
            if in_rules:
                agents, in_rules = [], False
            agents.append(m.group(1).strip())
            continue
        m = re.match(r"(?i)^disallow\s*:\s*(\S*)\s*$", l)
        if m:
            in_rules = True
            v = m.group(1)
            if v == "/" or re.fullmatch(r"/?\*+\$?", v or "x"):       # same rule as the edge's disallowsAll()
                blocked += agents
        elif re.match(r"(?i)^(allow|crawl-delay|sitemap)\s*:", l):
            in_rules = True
    search = sorted({x for x in blocked if SEARCH_BOT_RX.match(x)})
    others = sorted(set(blocked) - set(search))
    if search:
        rep.error("robots_block_all", "robots.txt shuts search engines out of the whole site: " + ", ".join(search))
    if others:
        rep.warn("robots_block_bots", "robots.txt shuts these crawlers out of the whole site (fine if intended, e.g. AI "
                 "crawlers): " + ", ".join(others))
    if not any(re.match(r"(?i)^disallow\s*:\s*/api/?\s*$", l) for l in rules):
        rep.warn("robots_api", "robots.txt does not disallow /api/")


# ------------------------------------------------------------------------------------------- the installable app (PWA)
# seo_build.part.py emit_pwa writes /manifest.webmanifest (AR), /manifest.en.webmanifest (EN), /sw.js and /offline/. The
# worker must never handle the API, the private pages or the old system's paths: every sample below must match its NEVER
# rule, and the Worker's live overlay + the old system's /data/ files must be in NEVER_FILES (else an ERROR).
PWA_NEVER_SAMPLES = ["/api/janna/session", "/api/seo/health", "/api/index.php", "/admin/", "/admin.html", "/login/", "/en/login/",
                     "/login.html", "/panel.html", "/dashboard/", "/advisor/", "/meeting/", "/inbox/", "/seo-admin/",
                     "/seo-team/", "/data-desk/", "/pay/"]
PWA_PUBLIC_SAMPLES = ["/", "/en/", "/factories/", "/tenders/", "/contact/", "/offline/", "/payments/", "/advisory/"]


def png_size(path):
    try:
        with open(path, "rb") as f:
            head = f.read(24)
    except OSError:
        return None
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def headers_by_rule(site):
    out, cur = {}, None
    p = os.path.join(site, "_headers")
    if not os.path.isfile(p):
        return out
    with open(p, encoding="utf-8") as f:
        for line in f:
            s = line.rstrip("\n")
            if not s.strip() or s.lstrip().startswith("#"):
                continue
            if s[0] in " \t":
                if cur is not None and ":" in s and not s.strip().startswith("!"):
                    k, v = s.strip().split(":", 1)
                    out.setdefault(cur, {})[k.strip().lower()] = v.strip()
            else:
                cur = s.strip()
    return out


def check_pwa(site, rep):
    errs, warns, stats = [], [], {}

    def staged_page(path):
        f = file_for_path(site, path)
        return os.path.isfile(f) or (not path.endswith("/") and os.path.isfile(file_for_path(site, path + "/")))

    for name in ("manifest.webmanifest", "manifest.en.webmanifest"):
        p = os.path.join(site, name)
        if not os.path.isfile(p):
            continue                                  # required_missing already says so
        m = load_json_file(p)
        if not isinstance(m, dict):
            errs.append("%s is not valid JSON" % name)
            continue
        for k in ("name", "short_name", "start_url", "scope", "display", "icons", "lang", "dir"):
            if not m.get(k):
                errs.append("%s: no %s" % (name, k))
        if m.get("display") not in ("standalone", "fullscreen", "minimal-ui"):
            errs.append("%s: display %r (the app opens as a browser tab)" % (name, m.get("display")))
        scope = url_path(urljoin(SITE_ORIGIN + "/", m.get("scope") or "/"))
        start = urlsplit(urljoin(SITE_ORIGIN + "/", m.get("start_url") or ""))
        if start.netloc.lower() not in SELF_HOSTS or not url_path(start.geturl()).startswith(scope):
            errs.append("%s: start_url %s is not on this site inside the scope %s" % (name, m.get("start_url"), scope))
        elif not staged_page(url_path(start.geturl())):
            errs.append("%s: start_url %s has no page in this upload" % (name, m.get("start_url")))
        sizes, maskable, n_icons = set(), False, 0
        for ic in (m.get("icons") or []) + [x for sc in (m.get("shortcuts") or []) for x in (sc.get("icons") or [])]:
            src = ic.get("src") or ""
            f = file_for_path(site, url_path(urljoin(SITE_ORIGIN + "/", src)))
            if not os.path.isfile(f):
                errs.append("%s: icon %s is not in the upload (tools/app_icons.py → img/app/)" % (name, src))
                continue
            n_icons += 1
            wh = png_size(f) if (ic.get("type") == "image/png" or f.endswith(".png")) else None
            if wh and ic.get("sizes") and ic.get("sizes") != "%dx%d" % wh:
                errs.append("%s: icon %s says %s but is %dx%d" % (name, src, ic.get("sizes"), wh[0], wh[1]))
            purposes = (ic.get("purpose") or "any").split()
            if wh and "any" in purposes:
                sizes.add(wh)
            maskable = maskable or "maskable" in purposes
        if not {(192, 192), (512, 512)} <= sizes:
            errs.append("%s: Android needs icons of 192x192 and 512x512 (purpose any)" % name)
        if not maskable:
            warns.append("%s: no maskable icon (Android puts the round logo on a white disc)" % name)
        for sc in m.get("shortcuts") or []:
            u = urlsplit(urljoin(SITE_ORIGIN + "/", sc.get("url") or ""))
            if u.netloc.lower() not in SELF_HOSTS or not staged_page(url_path(u.geturl())):
                errs.append("%s: shortcut %r → %s has no page in this upload" % (name, sc.get("name"), sc.get("url")))
        stats[name] = {"lang": m.get("lang"), "start_url": m.get("start_url"), "icons": n_icons, "shortcuts": len(m.get("shortcuts") or [])}
    sw = os.path.join(site, "sw.js")
    if os.path.isfile(sw):
        t = read_text(sw)
        if 'addEventListener("fetch"' not in t:
            stats["sw"] = "kill switch"
            if "registration.unregister()" in t:
                rep.warn("pwa_kill", "sw.js is the KILL SWITCH (seo/config.json \"pwa\": {\"kill\": true} or MIG_PWA_KILL=1): every "
                         "installed copy deletes its caches and unregisters its service worker at the next visit")
            else:
                errs.append("sw.js has no fetch handler and does not unregister itself")
        else:
            m = re.search(r"var NEVER = /(.+?)/;", t)
            rx = None
            if not m:
                errs.append("sw.js: no NEVER rule (the paths it must never handle)")
            else:
                try:
                    rx = re.compile(m.group(1).replace("\\/", "/"))
                except re.error as e:
                    rx = None
                    errs.append("sw.js: NEVER rule does not compile (%s)" % e)
                if rx:
                    handled = [p for p in PWA_NEVER_SAMPLES if not rx.search(p)]
                    if handled:
                        errs.append("sw.js would handle the API / private pages / the old system's paths: " + ", ".join(handled))
                    over = [p for p in PWA_PUBLIC_SAMPLES if rx.search(p)]
                    if over:
                        warns.append("sw.js leaves public pages alone (NEVER is broader than the private pages): " + ", ".join(over))
            m = re.search(r"var NEVER_FILES = (\{.*?\});", t)
            nf = {}
            try:
                nf = json.loads(m.group(1)) if m else {}
            except ValueError:
                errs.append("sw.js: NEVER_FILES is not valid JSON")
            want = ["/data/overlay.js"] + [x for x, pre in load_legacy_live(None) if x.startswith("/data/") and not pre]
            miss = [x for x in want if x not in nf]
            if miss:
                errs.append("sw.js would store files that must always come live (the Worker's overlay, the old system): " + ", ".join(miss))
            # the Android APK downloads (seo_app.part.py): the file and its stable link go to the network as they are
            apk = [x for x in ("/" + APK_DIR + "madeinegyptgate-1.0.0-1.apk", "/" + APK_DIR + "latest.json", APK_STABLE)
                   if not ((rx and rx.search(x)) or x in nf)]
            if apk and rx is not None:          # (no NEVER rule at all: reported above)
                errs.append("sw.js would handle the Android APK downloads (seo_build.part.py PWA_DEF never / never_files): " + ", ".join(apk))
            # the precache list itself (a mention of /offline/ in a comment is not enough): /offline/ in it, every entry staged
            # (one missing file and the worker never installs)
            m = re.search(r"PRECACHE = (\[.*?\]);", t)
            try:
                pre = json.loads(m.group(1)) if m else []
            except ValueError:
                pre = []
            if "/offline/" not in pre or 'OFFLINE = "/offline/"' not in t:
                errs.append("sw.js does not precache the offline page /offline/")
            miss = [u for u in pre if not (isinstance(u, str) and staged_page(u))]
            if miss:
                errs.append("sw.js precaches files this upload does not have (the worker would never install): " + ", ".join(map(str, miss)))
            stats["sw"] = "active"
    hb = headers_by_rule(site)
    if os.path.isfile(sw):
        h = hb.get("/sw.js", {})
        if not re.search(r"no-cache|max-age=0", h.get("cache-control", "")):
            warns.append("_headers: /sw.js has no 'Cache-Control: no-cache' (a new worker could wait in caches)")
        if h.get("service-worker-allowed") != "/":
            warns.append("_headers: /sw.js has no 'Service-Worker-Allowed: /'")
    for name in ("manifest.webmanifest", "manifest.en.webmanifest"):
        if os.path.isfile(os.path.join(site, name)) and "application/manifest+json" not in hb.get("/" + name, {}).get("content-type", ""):
            warns.append("_headers: /%s is not served as application/manifest+json" % name)
    inc, exc = routes_rules(site)
    via_fn = [p for p in ("/sw.js", "/manifest.webmanifest", "/manifest.en.webmanifest") if os.path.isfile(os.path.join(site, p[1:])) and served_by_functions(p, inc, exc)]
    if via_fn:
        warns.append("_routes.json sends %s through the Functions, where Pages does not apply _headers" % ", ".join(via_fn))
    rep.stats["pwa"] = stats
    if errs:
        rep.error("pwa", "the installable app (seo_build.part.py emit_pwa: manifests, icons, /sw.js)", errs)
    if warns:
        rep.warn("pwa_review", "the installable app: worth a look", warns)


# ------------------------------------------------------------------------------- the Android app on the site (seo_app.part.py)
# /downloads/android/: madeinegyptgate-<versionName>-<versionCode>.apk + latest.json (tools/publish_apk.py), the 302
# /app/android.apk → the published file (_redirects: the path skips the Functions, so Pages applies the rule itself) and
# /.well-known/assetlinks.json (Android App Links: the package and the SHA-256 of the signing certificates, seo/config.json "app").
APK_DIR = "downloads/android/"
APK_NAME_RX = re.compile(r"^madeinegyptgate-([0-9][0-9A-Za-z._-]{0,39})-([1-9][0-9]{0,9})\.apk$")
APK_STABLE = "/app/android.apk"
APK_TYPE = "application/vnd.android.package-archive"
APP_PACKAGE = "com.madeinegyptgate.app"
CERT_FP_RX = re.compile(r"^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$")
APK_SIG_MAGIC = b"APK Sig Block 42"
APK_SIG_SCHEMES = {0x7109871a: "v2", 0xf05368c0: "v3", 0x1b93ad61: "v3.1"}


def _lp(buf, off, end):
    """one uint32-length-prefixed field of an APK signing block: (value, offset after it)"""
    if off + 4 > end:
        raise ValueError("truncated length prefix")
    n = struct.unpack_from("<I", buf, off)[0]
    if off + 4 + n > end:
        raise ValueError("length %d past the end" % n)
    return buf[off + 4:off + 4 + n], off + 4 + n


def apk_signers(path):
    """The certificates that sign an APK, read from its APK Signature Scheme v2 / v3 block (the scheme every APK with minSdk 24+
    carries; no Android SDK needed). Returns {"certs": [«AA:BB:…» SHA-256 of each signer's certificate, as apksigner and keytool
    print it], "schemes": ["v2", …], "debug": True when a certificate is the Android debug key (CN=Android Debug),
    "problem": text or None}. Nothing is verified cryptographically here: Android does that at install, apksigner before
    publishing (tools/publish_apk.py --sdk)."""
    out = {"certs": [], "schemes": [], "debug": False, "problem": None}
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            if f.read(4) != b"PK\x03\x04":
                out["problem"] = "not a ZIP / APK file"
                return out
            tail_len = min(size, 22 + 65535)
            f.seek(size - tail_len)
            tail = f.read(tail_len)
            eocd = -1
            i = tail.rfind(b"PK\x05\x06")
            while i >= 0:
                if i + 22 <= len(tail) and i + 22 + struct.unpack_from("<H", tail, i + 20)[0] == len(tail):
                    eocd = i
                    break
                i = tail.rfind(b"PK\x05\x06", 0, i)
            if eocd < 0:
                out["problem"] = "no ZIP end-of-central-directory record"
                return out
            cd_off = struct.unpack_from("<I", tail, eocd + 16)[0]
            if cd_off < 32 or cd_off > size:
                out["problem"] = "no APK signing block (unsigned, or signed with the old JAR scheme only)"
                return out
            f.seek(cd_off - 24)
            foot = f.read(24)
            if foot[8:] != APK_SIG_MAGIC:
                out["problem"] = "no APK signing block (unsigned, or signed with the old JAR scheme only): sign it with apksigner"
                return out
            blk = struct.unpack_from("<Q", foot, 0)[0]
            if blk < 24 or blk + 8 > cd_off or blk > 64 * 1024 * 1024:
                out["problem"] = "APK signing block of an impossible size"
                return out
            f.seek(cd_off - blk - 8)
            buf = f.read(blk + 8)
        if struct.unpack_from("<Q", buf, 0)[0] != blk:
            out["problem"] = "APK signing block sizes disagree"
            return out
        pos, end, certs = 8, len(buf) - 24, []
        while pos + 12 <= end:
            ln = struct.unpack_from("<Q", buf, pos)[0]
            if ln < 4 or pos + 8 + ln > end:
                raise ValueError("pair of length %d past the end" % ln)
            pid = struct.unpack_from("<I", buf, pos + 8)[0]
            if pid in APK_SIG_SCHEMES:
                out["schemes"].append(APK_SIG_SCHEMES[pid])
                vstart, vend = pos + 12, pos + 8 + ln
                signers, _ = _lp(buf, vstart, vend)
                so = 0
                while so < len(signers):
                    signer, so = _lp(signers, so, len(signers))
                    signed, _ = _lp(signer, 0, len(signer))
                    _digests, o = _lp(signed, 0, len(signed))
                    chain, _ = _lp(signed, o, len(signed))
                    if chain:
                        der, _ = _lp(chain, 0, len(chain))           # the signer's own certificate comes first
                        fp = ":".join("%02X" % b for b in hashlib.sha256(der).digest())
                        if fp not in certs:
                            certs.append(fp)
                        if b"Android Debug" in der:
                            out["debug"] = True
            pos += 8 + ln
        out["certs"] = certs
        if not out["schemes"]:
            out["problem"] = "the signing block has no v2 / v3 signature: sign it with apksigner"
        elif not certs:
            out["problem"] = "the signing block names no certificate"
    except (OSError, ValueError, struct.error) as e:
        out["problem"] = "unreadable APK signing block (%s)" % e
    return out


def apk_problems(path):
    """the file is an Android package: a ZIP with AndroidManifest.xml and classes*.dex"""
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
    except (OSError, zipfile.BadZipFile) as e:
        return ["not a ZIP / APK file (%s)" % e]
    out = []
    if "AndroidManifest.xml" not in names:
        out.append("no AndroidManifest.xml")
    if not any(re.match(r"^classes\d*\.dex$", n) for n in names):
        out.append("no classes.dex")
    return out


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _rule_rx(pattern):
    """a _headers / _redirects URL pattern of Pages: one * splat, :placeholders (one path segment)"""
    parts = re.split(r"(\*|:[A-Za-z]\w*)", pattern)
    return re.compile("^" + "".join(".*" if x == "*" else "[^/]+" if x.startswith(":") else re.escape(x) for x in parts) + "$")


def effective_headers(site, path):
    """the _headers values Pages sends with a static file (a path the Functions do not serve), merged as the asset server merges
    them: the matching rules in file order, a rule's «! Name» first, then its own lines; a header a second rule sets again is
    appended («a, b»). Lower-case names."""
    out, setmap, cur = {}, set(), None
    p = os.path.join(site, "_headers")
    if not os.path.isfile(p):
        return out
    rules = []
    with open(p, encoding="utf-8") as f:
        for line in f:
            s = line.rstrip("\n")
            if not s.strip() or s.lstrip().startswith("#"):
                continue
            if s[0] not in " \t":
                cur = {"rx": _rule_rx(s.strip()), "set": [], "unset": []}
                rules.append(cur)
            elif cur is not None:
                t = s.strip()
                if t.startswith("!"):
                    cur["unset"].append(t[1:].strip().lower())
                elif ":" in t:
                    k, v = t.split(":", 1)
                    cur["set"].append((k.strip().lower(), v.strip()))
    for r in rules:
        if not r["rx"].match(path):
            continue
        for k in r["unset"]:
            out.pop(k, None)
        for k, v in r["set"]:
            if k in setmap and k in out:
                out[k] = out[k] + ", " + v
            else:
                out[k] = v
                setmap.add(k)
    return out


def check_app(site, rep):
    errs, warns, stats = [], [], {}
    inc, exc = routes_rules(site)
    rules, _ = parse_redirects_file(site)
    apk_rules = [r for r in rules if nfc(unquote(r[0])) == APK_STABLE]
    # every .apk of the upload: only the published channel downloads/android/<name>
    apks = []
    for d, dirs, files in os.walk(site):
        dirs.sort()
        for fn in sorted(files):
            if fn.lower().endswith(".apk"):
                apks.append(os.path.relpath(os.path.join(d, fn), site).replace(os.sep, "/"))
    outside = [r for r in apks if not r.startswith(APK_DIR) or "/" in r[len(APK_DIR):]]
    if outside:
        errs.append("APK files outside %s (only the channel of tools/publish_apk.py is published): %s" % (APK_DIR, ", ".join(outside)))
    chan = [r for r in apks if r not in outside]
    badname = [r for r in chan if not APK_NAME_RX.match(r[len(APK_DIR):])]
    if badname:
        errs.append("APK files not named madeinegyptgate-<versionName>-<versionCode>.apk (tools/publish_apk.py): " + ", ".join(badname))
    # assetlinks.json: the app's package and the certificates that may sign it
    fps, al_path = [], os.path.join(site, ".well-known", "assetlinks.json")
    if os.path.isfile(al_path):
        al = load_json_file(al_path)
        mine = [x for x in (al if isinstance(al, list) else []) if isinstance(x, dict) and isinstance(x.get("target"), dict)
                and x["target"].get("namespace") == "android_app" and x["target"].get("package_name") == APP_PACKAGE]
        if not isinstance(al, list):
            errs.append(".well-known/assetlinks.json is not a JSON list of statements")
        elif not mine:
            errs.append(".well-known/assetlinks.json has no android_app statement for %s" % APP_PACKAGE)
        for x in mine:
            if "delegate_permission/common.handle_all_urls" not in (x.get("relation") or []):
                errs.append(".well-known/assetlinks.json: the %s statement lacks delegate_permission/common.handle_all_urls" % APP_PACKAGE)
            for fp in x["target"].get("sha256_cert_fingerprints") or []:
                if isinstance(fp, str) and CERT_FP_RX.match(fp):
                    fps.append(fp)
                else:
                    errs.append(".well-known/assetlinks.json: %r is not a certificate SHA-256 «AA:BB:…»" % (fp,))
        if mine and not fps:
            errs.append(".well-known/assetlinks.json lists no certificate SHA-256 for %s" % APP_PACKAGE)
        h = effective_headers(site, "/.well-known/assetlinks.json")
        if "application/json" not in h.get("content-type", "application/json"):
            warns.append("_headers: /.well-known/assetlinks.json is sent as %r (Android wants application/json)" % h.get("content-type"))
        if served_by_functions("/.well-known/assetlinks.json", inc, exc):
            warns.append("_routes.json sends /.well-known/assetlinks.json through the Functions (exclude /.well-known/*)")
        stats["assetlinks"] = {"package": APP_PACKAGE if mine else None, "certs": len(fps)}
    elif chan:
        warns.append("no /.well-known/assetlinks.json: links to the site open in the browser instead of the app (seo/config.json \"app\")")
    # latest.json → the published APK
    lj_path = os.path.join(site, APK_DIR, "latest.json")
    pub = None
    if os.path.isfile(lj_path):
        lj = load_json_file(lj_path)
        if not isinstance(lj, dict):
            errs.append("%slatest.json is not a JSON object" % APK_DIR)
        else:
            f, v, c = lj.get("file"), lj.get("version"), lj.get("code")
            if not isinstance(f, str) or not APK_NAME_RX.match(f):
                errs.append("%slatest.json names %r, not madeinegyptgate-<versionName>-<versionCode>.apk" % (APK_DIR, f))
            elif f != "madeinegyptgate-%s-%s.apk" % (v, c):
                errs.append("%slatest.json: file %s does not match version %r / code %r" % (APK_DIR, f, v, c))
            elif not os.path.isfile(os.path.join(site, APK_DIR, f)):
                errs.append("%slatest.json names %s, which is not in the upload" % (APK_DIR, f))
            else:
                pub = f
                fp_ = os.path.join(site, APK_DIR, f)
                size = os.path.getsize(fp_)
                if lj.get("bytes") != size:
                    errs.append("%slatest.json says %r bytes, %s has %d" % (APK_DIR, lj.get("bytes"), f, size))
                if size > MAX_FILE_BYTES:
                    errs.append("%s%s is %s: Cloudflare Pages takes 25 MiB per file at most" % (APK_DIR, f, human(size)))
                if lj.get("sha256") != file_sha256(fp_):
                    errs.append("%slatest.json SHA-256 does not match %s (the page shows that SHA-256 to the visitors)" % (APK_DIR, f))
                stats["published"] = {"file": f, "version": v, "code": c, "bytes": size, "min_sdk": lj.get("min_sdk")}
            if not isinstance(lj.get("min_sdk"), int) or isinstance(lj.get("min_sdk"), bool):
                errs.append("%slatest.json: min_sdk %r is not an Android API level" % (APK_DIR, lj.get("min_sdk")))
            if lj.get("package") not in (None, APP_PACKAGE):
                errs.append("%slatest.json: package %r is not %s" % (APK_DIR, lj.get("package"), APP_PACKAGE))
    elif chan:
        errs.append("%s has APK files but no latest.json (tools/publish_apk.py writes both)" % APK_DIR)
    # each APK of the channel: an Android package signed by a certificate assetlinks.json lists — never the debug key
    signed = {}
    for r in chan:
        fpath = os.path.join(site, *r.split("/"))
        bad = apk_problems(fpath)
        if bad:
            errs.append("%s: %s" % (r, "; ".join(bad)))
            continue
        sg = apk_signers(fpath)
        signed[r] = {"certs": sg["certs"], "schemes": sg["schemes"], "debug": sg["debug"]}
        if sg["problem"]:
            errs.append("%s: %s" % (r, sg["problem"]))
        elif sg["debug"]:
            errs.append("%s is signed with the Android DEBUG key: never publish a debug build (tools/publish_apk.py refuses one)" % r)
        elif not fps:
            errs.append("%s: no /.well-known/assetlinks.json certificate to check its signer against" % r)
        else:
            other = [x for x in sg["certs"] if x not in fps]
            if other:
                errs.append("%s is signed by %s, a certificate /.well-known/assetlinks.json does not list (seo/config.json app."
                            "android_cert_sha256: the release key)" % (r, ", ".join(other)))
    stats["apks"] = signed
    # the stable link: 302 /app/android.apk → the published file, applied by Pages itself (outside the Functions)
    if pub:
        want = "/" + APK_DIR + pub
        if len(apk_rules) != 1 or nfc(unquote(apk_rules[0][1])) != want:
            errs.append("_redirects must send %s to %s (302) once: %s" % (APK_STABLE, want, [r[:3] for r in apk_rules] or "no rule"))
        elif apk_rules[0][2] not in ("302", "307"):
            warns.append("_redirects: %s → %s is a %s (a 302 follows each new version; browsers keep a 301)" % (APK_STABLE, want, apk_rules[0][2]))
        if served_by_functions(APK_STABLE, inc, exc):
            errs.append("_routes.json sends %s through the Functions, where Pages does not apply _redirects (exclude it)" % APK_STABLE)
        h = effective_headers(site, want)
        if APK_TYPE not in h.get("content-type", ""):
            warns.append("_headers: %s is sent as %r (expected %s)" % (want, h.get("content-type"), APK_TYPE))
        if "attachment" not in h.get("content-disposition", ""):
            warns.append("_headers: %s has no Content-Disposition: attachment" % want)
        if h.get("x-content-type-options", "").replace(" ", "").lower() != "nosniff":
            warns.append("_headers: %s: X-Content-Type-Options %r (expected exactly nosniff)" % (want, h.get("x-content-type-options")))
        if served_by_functions(want, inc, exc):
            warns.append("_routes.json sends %s through the Functions, where Pages does not apply _headers" % want)
        stats["redirect"] = "%s → %s %s" % (APK_STABLE, apk_rules[0][1], apk_rules[0][2]) if apk_rules else None
    elif apk_rules:
        errs.append("_redirects sends %s to %s, but no APK is published in this upload (latest.json)" % (APK_STABLE, apk_rules[0][1]))
    rep.stats["app"] = stats
    if errs:
        rep.error("app", "the Android app on the site (seo_app.part.py: downloads/android/, /app/android.apk, assetlinks.json)", errs)
    if warns:
        rep.warn("app_review", "the Android app on the site: worth a look", warns)


def read_text(path, limit=None):
    with open(path, "rb") as f:
        b = f.read() if limit is None else f.read(limit)
    return b.decode("utf-8", errors="replace")


def find_claim(text, broad=False):
    """(start, end) of the removed 26k / 26,808 claim, or None. broad=True is the SEO-SPEC A3 pattern."""
    rx = _CLAIM_BROAD_AT if broad else _CLAIM_STRICT_AT
    i = text.find("26")
    while i != -1:
        prev = text[i - 1] if i else " "
        if not (prev.isdigit() or prev in ".,٫٬"):
            m = rx.match(text, i)
            if m and (broad or not m.group("k") or not (prev.isalnum() or prev == "_")):
                return (i, m.end())
        i = text.find("26", i + 1)
    if not broad:
        m = _CLAIM_STRICT_AR.search(text)
        if m:
            return (m.start(), m.end())
    return None


def snippet(text, span, pad=30):
    return text[max(0, span[0] - pad): span[1] + pad].replace("\n", " ")


def jsonld_problems(obj, in_platform=False, out=None, path="$"):
    """Contacts outside the platform's own Organization node, and VideoObject."""
    out = [] if out is None else out
    if isinstance(obj, dict):
        here = in_platform or obj.get("@id") == PLATFORM_ORG_ID
        t = obj.get("@type")
        types = t if isinstance(t, list) else [t]
        if "VideoObject" in types:
            out.append("VideoObject at %s" % path)
        if not here:
            for k in ("telephone", "email", "faxNumber"):
                if k in obj:
                    out.append("%s on %s at %s" % (k, obj.get("@id") or t, path))
        for k, v in obj.items():
            jsonld_problems(v, here, out, path + "." + k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            jsonld_problems(v, in_platform, out, "%s[%d]" % (path, i))
    elif isinstance(obj, str) and not in_platform:
        c = contacts(obj)
        if c:
            out.append("contact %s at %s" % (", ".join(c[:3]), path))
    return out


def jsonld_self_urls(obj, out=None, key=""):
    """madeinegyptgate.com URLs inside JSON-LD url/@id/isBasedOn/sameAs/image/item … values"""
    out = [] if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            jsonld_self_urls(v, out, k)
    elif isinstance(obj, list):
        for v in obj:
            jsonld_self_urls(v, out, key)
    elif isinstance(obj, str) and key in LD_URL_KEYS and obj.startswith(("https://madeinegyptgate.com/",
                                                                        "https://www.madeinegyptgate.com/")):
        out.append((key, obj))
    return out


def url_path(loc):
    u = urlsplit(loc)
    return nfc(unquote(u.path))


def file_for_path(site, path):
    rel = path.lstrip("/")
    if path.endswith("/"):
        rel += "index.html"
    return os.path.join(site, *rel.split("/")) if rel else os.path.join(site, "index.html")


def rel_for_path(path):
    rel = path.lstrip("/")
    return (rel + "index.html") if (path.endswith("/") or not rel) else rel


# --------------------------------------------------------------------------------------- per-page scan (process pool)
_W = {}


def _init_worker(ctx):
    _W.clear()
    _W.update(ctx)
    _W["gone_rx_c"] = [re.compile(x) for x in ctx.get("gone_rx", [])]
    _W["cache"] = {}
    ALLOW["keys"], ALLOW["literals"] = set(ctx.get("allow_keys", ())), set(ctx.get("allow_literals", ()))


def ref_status(p):
    """how production answers a local path: ok | slash (Pages 308 to the /x/ page) | redirect | gone | missing"""
    c = _W["cache"]
    if p in c:
        return c[p]
    files, exact = _W["files"], _W["exact"]
    if p == "/api" or p.startswith("/api/"):
        st = "ok"                                       # Worker routes and the /api/seo Function
    elif legacy_live_hit(p, _W.get("legacy_live") or ()):
        st = "ok"                                       # deploy 1: served by the owner's live system (deploy/legacy-live.txt)
    else:
        rel = rel_for_path(p)
        if rel in files:
            st = "ok"
        elif not p.endswith("/") and (p.lstrip("/") + "/index.html") in files:
            st = "slash"
        elif not p.endswith("/") and (p.lstrip("/") + ".html") in files:
            st = "ok"
        elif p in exact or (p.rstrip("/") if p.endswith("/") else p + "/") in exact:
            st = "redirect"
        elif p in (_W.get("static_redirects") or {}):
            # a _redirects rule that Pages applies itself (a path the Functions do not serve: 302 /app/android.apk …)
            st = "redirect" if rel_for_path(_W["static_redirects"][p]) in files else "missing"
        elif any(p.startswith(pre) for pre, _ in _W["prefixes"]):
            st = "redirect"
        elif any(rx.search(p) for rx in _W["gone_rx_c"]):
            st = "gone"
        else:
            st = "missing"
    c[p] = st
    return st


def _local_path(u, base_url):
    u = html.unescape(u).strip()
    if not u or u.startswith(SKIP_SCHEMES) or "{" in u or "${" in u or ("'" in u and "+" in u) or "\\" in u:
        return None
    try:
        a = urljoin(base_url, u)
        sp = urlsplit(a)
    except ValueError:
        return None
    if sp.scheme not in ("http", "https") or sp.netloc.lower() not in SELF_HOSTS:
        return None
    return nfc(unquote(sp.path or "/"))


def scan_page(item):
    rel, path = item
    text = read_text(path)
    r = {"rel": rel}
    head = text.split("</head>", 1)[0] if "</head>" in text else text[:20000]
    m = CANON_RX.search(head)
    canon = HREF_RX.search(m.group(0)).group(1) if m and HREF_RX.search(m.group(0)) else None
    m = ROBOTS_RX.search(head)
    robots = CONTENT_RX.search(m.group(0)).group(1).lower() if m and CONTENT_RX.search(m.group(0)) else ""
    r["canon"], r["robots"] = canon, robots
    span = find_claim(text) or find_claim(text, broad=True)
    if span:
        r["claim"] = "%s: …%s…" % (rel, snippet(text, span))
    if "claude:viewport-fit-sides" in head:
        r["overlay"] = True
    ld_bad, ld_hits, ld_urls = [], [], []
    for block in JSONLD_RX.findall(text):
        try:
            obj = json.loads(block)
        except Exception as e:
            ld_bad.append("%s: %s" % (rel, str(e)[:80]))
            continue
        flat = json.dumps(obj, ensure_ascii=False) if "\\u" in block else block
        if ("VideoObject" in flat or '"telephone"' in flat or '"email"' in flat or '"faxNumber"' in flat
                or contacts(flat)):
            probs = jsonld_problems(obj)
            if probs:
                ld_hits.append("%s: %s" % (rel, "; ".join(probs[:3])))
        ld_urls += jsonld_self_urls(obj)
    r["ld_bad"], r["ld_hits"] = ld_bad, ld_hits
    c = html_contacts(text)
    if c:
        r["contacts"] = "%s: %s" % (rel, ", ".join(sorted(set(c))[:4]))
    # local references
    page_url = SITE_ORIGIN + "/" + (rel[: -len("index.html")] if rel.endswith("index.html") else rel)
    m = BASE_RX.search(head)
    base = urljoin(page_url, html.unescape(m.group(1))) if m else page_url
    scan = BLOCK_CONTENT_RX.sub(lambda x: x.group(1) + x.group(4), text)
    assets, links, heads, via = set(), set(), set(), set()
    for tag, attrs in REF_TAG_RX.findall(scan):
        tag = tag.lower()
        relv = ""
        if tag == "link":
            mm = REL_RX.search(attrs)
            relv = mm.group(1).lower() if mm else ""
            if any(x in relv for x in ("preconnect", "dns-prefetch")):
                continue
        for name, _, v1, v2 in REF_ATTR_RX.findall(attrs):
            v = v1 or v2
            vals = [x.strip().split(" ")[0] for x in v.split(",")] if name.lower() == "srcset" else [v]
            for u in vals:
                p = _local_path(u, base)
                if p is None:
                    continue
                if tag == "a":
                    links.add(p)
                elif tag == "link" and ("canonical" in relv or "alternate" in relv):
                    heads.add(p)
                else:
                    assets.add(p)
    for u in META_SELF_URL_RX.findall(head):
        p = _local_path(u, base)
        if p:
            heads.add(p)
    bad_assets, bad_links, bad_heads, bad_ld = [], [], [], []
    for p in assets:
        st = ref_status(p)
        if st not in ("ok",):
            bad_assets.append((p, st))
    for p in links:
        st = ref_status(p)
        if st in ("missing", "gone"):
            bad_links.append((p, st))
        elif st in ("redirect", "slash"):
            via.add(p)
    for p in heads:
        st = ref_status(p)
        if st != "ok":
            bad_heads.append((p, st))
    for key, u in ld_urls:
        p = _local_path(u, base)
        if p is None:
            continue
        st = ref_status(p)
        if st in ("missing", "gone"):
            bad_ld.append(("%s %s" % (key, u), st))
        elif st == "redirect":
            via.add(p)
    r["bad_assets"], r["bad_links"], r["bad_heads"], r["bad_ld"], r["via"] = bad_assets, bad_links, bad_heads, bad_ld, sorted(via)
    return r


def scan_pages(html_files, ctx, jobs):
    if jobs > 1 and len(html_files) > 200:
        try:
            with concurrent.futures.ProcessPoolExecutor(max_workers=jobs, initializer=_init_worker, initargs=(ctx,)) as ex:
                return list(ex.map(scan_page, html_files, chunksize=64))
        except Exception as e:      # no /dev/shm, a sandbox without fork … (a real bug re-raises in the sequential run)
            sys.stderr.write("stage.py: parallel scan unavailable (%s), scanning sequentially\n" % e)
    _init_worker(ctx)
    return [scan_page(x) for x in html_files]


# ------------------------------------------------------------------------------------------------------------- run_checks
def run_checks(out, a, rep):
    site = os.path.join(out, "site")
    if not os.path.isdir(site):
        rep.error("no_stage", "%s has no site/ — run: deploy/stage.py stage" % out)
        return finish(out, rep)
    max_files = int(a.max_files or DEFAULT_MAX_FILES)
    load_privacy_allow(getattr(a, "privacy_allow", None))
    marker = load_json_file(os.path.join(out, STAGE_MARKER), {}) or {}
    linked_dirs = set(marker.get("linked_dirs") or rep.stats.get("linked_dirs") or [])

    # --- inventory: limits and file names ----------------------------------------------------------------------------
    count, total, big, bad_names, by_ext, longest = 0, 0, [], [], {}, (0, "")
    html_files, all_files, built_files = [], set(), []
    for d, dirs, files in os.walk(site):
        dirs.sort()
        for fn in sorted(files):
            p = os.path.join(d, fn)
            rel = os.path.relpath(p, site).replace(os.sep, "/")
            size = os.path.getsize(p)
            all_files.add(nfc(rel))
            if rel in WRANGLER_TOP_IGNORE:
                continue
            count += 1
            total += size
            ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
            by_ext[ext] = by_ext.get(ext, 0) + 1
            if size > MAX_FILE_BYTES:
                rep.error("file_too_big", "%s is %s (Pages limit 25 MiB per file)" % (rel, human(size)))
            elif size > WARN_FILE_BYTES:
                big.append("%s (%s)" % (rel, human(size)))
            prob = path_problem(rel)
            if prob:
                bad_names.append("%s: %s" % (rel, prob))
            enc = len(quote(rel))
            if enc > longest[0]:
                longest = (enc, rel)
            if ext == "html":
                html_files.append((rel, p))
            if rel.split("/", 1)[0] not in linked_dirs and (ext in ("html", "xml") or rel in ("_seo/pages.json", "_seo/redirects.json")):
                built_files.append((rel, p))
    rep.stats.update({"files": count, "bytes": total, "size": human(total), "max_files": max_files,
                      "by_ext": dict(sorted(by_ext.items(), key=lambda kv: -kv[1])[:12])})
    rep.stats["longest_url_path"] = {"bytes": longest[0], "path": longest[1]}
    if longest[0] > 1500:
        rep.warn("long_paths", "a file path is %d bytes once percent-encoded (%s); some tools cut URLs near 2,000" % longest)
    if count > max_files:
        rep.error("too_many_files", "%d files to upload; this plan allows %d per deployment" % (count, max_files))
    elif count > 0.9 * max_files:
        rep.warn("files_near_limit", "%d files — within 10%% of the %d-file limit" % (count, max_files))
    if big:
        rep.warn("big_files", "files over 10 MiB (allowed, but slow on mobile)", big)
    if bad_names:
        rep.error("bad_file_names", "file names that do not map to clean URLs", bad_names)
    if count == 0:
        rep.error("empty", "nothing to upload")

    # --- required files -------------------------------------------------------------------------------------------------
    missing = [f for f in REQUIRED_SITE_FILES if not os.path.isfile(os.path.join(site, f))]
    if missing:
        rep.error("required_missing", "required build files are missing (is this the new SEO build? deploy/deploy.sh "
                  "build after the integration): " + ", ".join(missing) +
                  ("; without 404.html Pages answers every unknown URL with the home page and status 200"
                   if "404.html" in missing else "") +
                  ("; without en/index.html /?lang=en cannot answer 301 /en/ (SEO-SPEC A7)" if "en/index.html" in missing else ""))
    for d in ("data", "img"):
        if not os.path.isdir(os.path.join(site, d)) or not os.listdir(os.path.join(site, d)):
            rep.error("assets_missing", "%s/ is missing or empty in the stage: every page loads scripts / images from /%s/"
                      % (d, d))
    if not a.no_functions and not os.path.isfile(os.path.join(out, "functions", "_middleware.js")):
        rep.error("functions_missing", "%s/functions/_middleware.js missing" % out)
    if not os.path.isfile(os.path.join(out, "wrangler.toml")):
        rep.error("pages_config_missing", "%s/wrangler.toml missing" % out)
    else:
        check_pages_config(os.path.join(out, "wrangler.toml"), rep)

    check_routes(site, rep)
    check_headers(site, rep)
    check_redirects(site, rep)
    check_robots(site, rep)
    check_pwa(site, rep)
    check_app(site, rep)

    # --- the build manifest: which pages this build wrote ---------------------------------------------------------------
    man = load_json_file(os.path.join(site, "_seo", "pages.json"), {}) or {}
    rows = man.get("rows", []) if isinstance(man, dict) else (man if isinstance(man, list) else [])
    cfg = load_json_file(os.path.join(site, "_seo", "config.json"), {}) or {}
    manifest_rels = {}
    for r in rows:
        if isinstance(r, dict) and r.get("p"):
            manifest_rels[nfc(rel_for_path(nfc(unquote(r["p"]))))] = r
    static_rels = {k for k, r in manifest_rels.items() if r.get("t") in ("static", "home") and r.get("l", "ar") == "ar"}
    static_rels.add("index.html")
    hash_dir = os.path.join(site, "_seo", "hash")
    shim_rels = {n[:-5] + ".html" for n in (os.listdir(hash_dir) if os.path.isdir(hash_dir) else []) if n.endswith(".json")}
    flat_rels = {(k + ".html") for k in (cfg.get("flat_pages") or [])} | {"404.html", "410.html"}

    # --- HTML pages: head facts, honesty, privacy, references (parallel) -------------------------------------------------
    exact, prefixes, gone_rx = load_redirect_maps(site)
    legacy = load_legacy_live(getattr(a, "legacy_live", None))
    rep.stats["legacy_live_paths"] = ["%s%s" % (x, "*" if pre else "") for x, pre in legacy]
    # deploy 1: on madeinegyptgate.com these paths are answered by the owner's old system (mis-egypt → Hostinger), never
    # by Pages. A staged page there would be unreachable on the domain (and shadow nothing): refuse pages, and say so
    # when a staged script differs from the old system's copy (visitors of the domain get the old system's file).
    shadow_err, shadow_warn = [], []
    for rel in sorted(all_files):
        p = "/" + rel
        if not legacy_live_hit(p, legacy):
            continue
        if rel.endswith(".html"):
            shadow_err.append(rel)
            continue
        ref = os.path.join(LEGACY_LIVE_REF, rel.rsplit("/", 1)[-1])
        try:
            with open(os.path.join(site, rel), "rb") as f1, open(ref, "rb") as f2:
                same = f1.read() == f2.read()
        except OSError:
            same = None
        if same is not True:
            shadow_warn.append("%s (%s)" % (rel, "differs from the old system's copy" if same is False else
                                            "old system's copy not in docs/janna/legacy-live/ to compare"))
    if shadow_err:
        rep.error("legacy_live_pages", "deploy 1 keeps these pages on the owner's live system (deploy/legacy-live.txt): "
                  "the upload must not carry its own copy (stage-exclude.txt drops panel.html / login.html)", shadow_err)
    if shadow_warn:
        rep.warn("legacy_live_shadowed", "on madeinegyptgate.com these files are served by the old system (Worker "
                 "mis-egypt, deploy/legacy-live.txt), not by this upload", shadow_warn)
    inc_r, exc_r = routes_rules(site)
    static_redirects = {}
    for src_, to_, code_, dyn_, line_ in parse_redirects_file(site)[0]:
        s_ = nfc(unquote(src_))
        if not dyn_ and to_.startswith("/") and not served_by_functions(s_, inc_r, exc_r):
            static_redirects[s_] = nfc(unquote(to_.split("#")[0].split("?")[0]))
    ctx = {"files": frozenset(all_files), "exact": exact, "prefixes": prefixes, "gone_rx": gone_rx,
           "allow_keys": sorted(ALLOW["keys"]), "allow_literals": sorted(ALLOW["literals"]), "legacy_live": legacy,
           "static_redirects": static_redirects}
    t0 = time.time()
    results = scan_pages(html_files, ctx, max(1, int(getattr(a, "jobs", 0) or min(4, os.cpu_count() or 1))))
    rep.stats["page_scan_seconds"] = round(time.time() - t0, 1)
    page_info = {}
    claim_hits, contact_err, contact_warn, ld_bad, ld_hits, overlay = [], [], [], [], [], []
    miss_assets, broken_links, bad_heads, bad_ld, via = {}, {}, [], [], {}
    for r in results:
        rel = r["rel"]
        page_info[rel] = (r["canon"], r["robots"])
        if r.get("claim"):
            claim_hits.append(r["claim"])
        if r.get("overlay"):
            overlay.append(rel)
        ld_bad += r["ld_bad"]
        ld_hits += r["ld_hits"]
        if r.get("contacts"):
            # site.py's own pages may show the platform's contacts and public hotlines (review); everything the
            # generator wrote (directory, tenders, news, hubs, shims, 404/410) must have none
            (contact_warn if (rel in static_rels or rel in flat_rels - {"404.html", "410.html"}) else contact_err).append(r["contacts"])
        for p, st in r["bad_assets"]:
            miss_assets.setdefault(p, [0, rel, st])[0] += 1
        for p, st in r["bad_links"]:
            broken_links.setdefault(p, [0, rel, st])[0] += 1
        bad_heads += ["%s: %s (%s)" % (rel, p, st) for p, st in r["bad_heads"]]
        bad_ld += ["%s: %s (%s)" % (rel, p, st) for p, st in r["bad_ld"]]
        for p in r["via"]:
            via.setdefault(p, [0, rel])[0] += 1
    rep.stats["html_pages"] = len(html_files)
    if claim_hits:
        rep.error("claim_26k", "the removed 26k / 26,808 claim is still on %d page(s) (SEO-SPEC A3: counts are computed "
                  "from data)" % len(claim_hits), claim_hits)
    if contact_err:
        rep.error("privacy_pages", "phone numbers or e-mails on %d generated page(s) (owner rule: contact only through "
                  "the RFQ form; reviewed false positives go into deploy/privacy-allow.txt)" % len(contact_err), contact_err)
    if contact_warn:
        rep.warn("privacy_static_pages", "phone- or e-mail-like strings on %d site.py page(s) that are not the platform's "
                 "own (review: public hotlines are fine, a company's number is not)" % len(contact_warn), contact_warn)
    if ld_bad:
        rep.error("jsonld_parse", "JSON-LD blocks that do not parse on %d page(s)" % len(ld_bad), ld_bad)
    if ld_hits:
        rep.error("jsonld_privacy", "%d JSON-LD block(s) with contacts outside the platform's own Organization, or a "
                  "VideoObject (SEO-SPEC 0 and 1.7)" % len(ld_hits), ld_hits)
    if overlay:
        rep.warn("viewport_meta", "claude:viewport-fit-sides meta still present (SEO-SPEC 1.2)", overlay)

    def top(d):
        return ["%s ×%d (%s, e.g. in %s)" % (p, v[0], v[2], v[1]) for p, v in sorted(d.items(), key=lambda kv: -kv[1][0])]
    if miss_assets:
        rep.error("missing_assets", "%d script / style / image path(s) referenced by pages are not in the upload "
                  "(broken data/ or img/ link? Pillow missing at build time?)" % len(miss_assets), top(miss_assets))
    if broken_links:
        rep.error("broken_links", "%d link target(s) on madeinegyptgate.com answer 404/410 (no page, no redirect)"
                  % len(broken_links), top(broken_links))
    if bad_heads:
        rep.error("head_links", "canonical / hreflang / og: URLs that are not a page of this build (they must point at "
                  "the final URL, not at a redirect)", bad_heads)
    if bad_ld:
        rep.error("jsonld_links", "JSON-LD url / isBasedOn / item … values on madeinegyptgate.com that answer 404/410",
                  bad_ld)
    rep.stats["links_via_redirect"] = {"targets": len(via), "refs": sum(v[0] for v in via.values()),
                                       "examples": ["%s ×%d (e.g. in %s)" % (p, v[0], v[1]) for p, v in
                                                    sorted(via.items(), key=lambda kv: -kv[1][0])[:10]]}
    if via:
        rep.note("%d static link target(s) answer through a redirect (301/308): %s" % (
            len(via), ", ".join(p for p, _ in sorted(via.items(), key=lambda kv: -kv[1][0])[:5])))

    # --- a clean build: nothing left over from an older one -------------------------------------------------------------
    check_clean_build(site, rows, manifest_rels, html_files, page_info, shim_rels, flat_rels, cfg, built_files, rep)

    # --- sitemaps ------------------------------------------------------------------------------------------------------
    check_sitemaps(site, page_info, rep)

    # --- other text artefacts: sitemaps, manifest, downloads, data ------------------------------------------------------
    text_hits_err, text_hits_warn = [], []
    for d, dirs, files in os.walk(site):
        for fn in files:
            rel = os.path.relpath(os.path.join(d, fn), site).replace(os.sep, "/")
            ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
            if ext not in ("xml", "json", "csv", "webmanifest", "txt", "js"):
                continue
            text = read_text(os.path.join(d, fn))
            strict = rel.startswith(("sitemaps/", "_seo/", "downloads/", ".well-known/")) or rel in ("sitemap.xml", "manifest.webmanifest",
                                                                                     "manifest.en.webmanifest", "sw.js", "robots.txt")
            span = find_claim(text)                       # the figure itself: an error in every file
            if span:
                text_hits_err.append("%s: claim …%s…" % (rel, snippet(text, span, 25)))
            else:
                span = find_claim(text, broad=True)       # SEO-SPEC A3 pattern: error in SEO files, review elsewhere
                if span:
                    (text_hits_err if strict else text_hits_warn).append(
                        "%s: claim-like …%s…" % (rel, snippet(text, span, 25)))
            c = contacts(text)
            if c:
                (text_hits_err if strict else text_hits_warn).append("%s: %d contact(s), e.g. %s" % (
                    rel, len(c), " | ".join(sorted(set(c))[:3])))
    if text_hits_err:
        rep.error("privacy_or_claim_files", "phone numbers / e-mails / the 26k claim in sitemaps, the SEO manifest or "
                  "the CSV downloads", text_hits_err)
    if text_hits_warn:
        rep.warn("data_files_review", "public data/script files with phone-, e-mail- or claim-like strings (every file "
                 "under /data/ is downloadable; the data owners should remove company contacts and dead entries)",
                 text_hits_warn)

    # --- manifest-based honesty checks ----------------------------------------------------------------------------------
    check_manifest(site, rows, rep)

    # --- the generator's own validation ---------------------------------------------------------------------------------
    check_seo_stats(site, getattr(a, "seo_stats", None), rep)

    # --- freshness --------------------------------------------------------------------------------------------------------
    built, built_s = manifest_built(site)
    if built:
        age_h = (time.time() - built) / 3600.0
        rep.stats["build_built"] = built_s
        rep.stats["build_age_hours"] = round(age_h, 1)
        if age_h > 26:
            rep.warn("old_build", "the build is %.0f hours old: tender and offer statuses and the date on the tenders hub "
                     "are computed on the build day — rebuild (deploy/deploy.sh build) before deploying" % age_h)
    return finish(out, rep)


def check_clean_build(site, rows, manifest_rels, html_files, page_info, shim_rels, flat_rels, cfg, built_files, rep):
    """Leftovers of an older build in the output (deploy-scale review: stale x.html served next to /x/, pages of removed
    records kept and re-listed). The cure is always the same: build into an empty directory (deploy/deploy.sh build)."""
    rels = {nfc(r) for r, _ in html_files}
    twins = sorted(r for r in rels if "/" not in r and r.endswith(".html") and (r[:-5] + "/index.html") in rels)
    if twins:
        rep.error("stale_flat_pages", "%d old x.html file(s) next to the new x/index.html page: the old page would be "
                  "served (and indexed) at /x.html — build into an empty directory" % len(twins), twins)
    built, built_s = manifest_built(site)
    if built:
        old = sorted(((built - os.path.getmtime(p)), rel) for rel, p in built_files if os.path.getmtime(p) < built - STALE_MARGIN_S)
        if old:
            rep.error("stale_build_files", "%d page/sitemap/manifest file(s) are older than this build (%s) — leftovers of "
                      "an earlier build that the build did not rewrite (removed records, renamed pages)" % (len(old), built_s),
                      ["%s (%.1f h older)" % (rel, age / 3600.0) for age, rel in old[-10:]])
    elif rows:
        rep.warn("manifest_built", "_seo/pages.json has no 'built' time: leftover pages cannot be detected by age")
    unlisted_idx, unlisted = [], 0
    for rel in sorted(rels):
        if rel in manifest_rels or rel in shim_rels or rel in flat_rels or rel == "index.html":
            continue
        unlisted += 1
        canon, robots = page_info.get(rel, (None, ""))
        if "noindex" not in robots:
            unlisted_idx.append(rel)
    rep.stats["html_not_in_manifest"] = unlisted
    if unlisted_idx:
        rep.error("unlisted_pages", "%d indexable page(s) are not in this build's manifest (_seo/pages.json): leftovers "
                  "of an earlier build, crawlable but in no sitemap" % len(unlisted_idx), unlisted_idx)
    # static rows inside the generated trees: only site.py's app pages (config app_paths) may live there
    gen_tops = {r["p"].strip("/").split("/")[0] for r in rows if isinstance(r, dict) and r.get("p")
                and r.get("t") not in ("static", "home") and r["p"].strip("/")}
    gen_tops.discard("en")
    apps = {nfc(v) for v in (cfg.get("app_paths") or {}).values()} if isinstance(cfg.get("app_paths"), dict) else set()
    bad = [r["p"] for r in rows if isinstance(r, dict) and r.get("t") == "static" and r.get("p", "/").strip("/")
           and r["p"].strip("/").split("/")[0] in gen_tops and nfc(r["p"]) not in apps]
    if bad:
        rep.error("static_rows_in_generated_trees", "manifest rows of type 'static' inside the generated trees (pages of "
                  "records no longer in the data, picked up from an old build)", bad)


def check_pages_config(path, rep):
    try:
        import tomllib                     # Python 3.11+
    except ImportError:
        tomllib = None
    if tomllib is None:
        text = read_text(path)
        if not re.search(r"^\[env\.preview\]", text, re.M) and not re.search(r"^\[env\.preview\.", text, re.M):
            rep.error("preview_isolation", "wrangler.toml has no [env.preview] section: preview deployments would get the "
                      "production SEO KV and D1 bindings")
        rep.note("tomllib not available (Python < 3.11): wrangler.toml checked line by line; wrangler validates the rest")
        return
    try:
        with open(path, "rb") as f:
            c = tomllib.load(f)
    except Exception as e:
        rep.error("pages_config", "wrangler.toml does not parse: %s" % e)
        return
    if c.get("pages_build_output_dir", "").strip("./") != "site":
        rep.error("pages_config", "wrangler.toml: pages_build_output_dir must be ./site")
    if "main" in c:
        rep.error("pages_config", "wrangler.toml must not have 'main' (that makes it a Worker config)")
    kv = [x for x in c.get("kv_namespaces", []) if x.get("binding") == "SEO_KV"]
    if not kv or not kv[0].get("id"):
        rep.error("pages_config", "wrangler.toml: KV binding SEO_KV with an id is required")
    secretish = []
    for scope, vars_ in [("vars", c.get("vars") or {})] + [("env.%s.vars" % e, (v or {}).get("vars") or {})
                                                           for e, v in (c.get("env") or {}).items()]:
        secretish += ["%s.%s" % (scope, k) for k in vars_ if SECRET_VAR_RX.search(k)]
    if secretish:
        rep.error("pages_config_secrets", "secret-looking names in [vars] (vars are stored in plain text and shown in the "
                  "dashboard; use deploy/deploy.sh secrets --set NAME)", secretish)
    pv = (c.get("env") or {}).get("preview")
    if pv is None:
        rep.error("preview_isolation", "wrangler.toml has no [env.preview]: preview deployments (unreviewed branches, "
                  "public *.pages.dev URLs) would get the production SEO KV and D1 — add the [env.preview] block of "
                  "deploy/wrangler-pages.toml")
    else:
        pkv = [x.get("id") for x in pv.get("kv_namespaces", []) or []]
        pd1 = [x.get("database_id") for x in pv.get("d1_databases", []) or []]
        if PROD_KV_ID in pkv or (kv and kv[0].get("id") in pkv):
            rep.error("preview_isolation", "[env.preview] binds the PRODUCTION SEO KV: a preview could overwrite the live "
                      "SEO bundle")
        if PROD_D1_ID in pd1:
            rep.error("preview_isolation", "[env.preview] binds the PRODUCTION D1 database (members, sessions)")
        if str((pv.get("vars") or {}).get("SEO_PREVIEW_WRITES", "")) == "1" and not pkv:
            rep.warn("preview_writes", "SEO_PREVIEW_WRITES = 1 without a preview KV: the preview API has nothing to write to")
    rep.stats["pages_config"] = {"name": c.get("name"), "kv": [x.get("binding") for x in c.get("kv_namespaces", [])],
                                 "d1": [x.get("binding") for x in c.get("d1_databases", [])],
                                 "vars": sorted((c.get("vars") or {}).keys()),
                                 "preview": None if pv is None else {
                                     "kv": [x.get("binding") for x in pv.get("kv_namespaces", []) or []],
                                     "d1": [x.get("binding") for x in pv.get("d1_databases", []) or []],
                                     "vars": sorted((pv.get("vars") or {}).keys())}}


def check_sitemaps(site, page_info, rep):
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    idx = os.path.join(site, "sitemap.xml")
    if not os.path.isfile(idx):
        return
    try:
        root = ET.parse(idx).getroot()
    except ET.ParseError as e:
        rep.error("sitemap_xml", "sitemap.xml is not valid XML: %s" % e)
        return
    if root.tag != ns + "sitemapindex":
        rep.error("sitemap_index", "sitemap.xml must be a <sitemapindex> (SEO-SPEC 1.9), found <%s>" % root.tag.replace(ns, ""))
        return
    seen, total, children = set(), 0, 0
    missing_child, bad_loc, no_file, noindex, not_self, dups, bad_lastmod = [], [], [], [], [], [], []
    lm_rx = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$")
    for sm in root.findall(ns + "sitemap"):
        loc = (sm.findtext(ns + "loc") or "").strip()
        if not loc.startswith(SITE_ORIGIN + "/"):
            bad_loc.append(loc)
            continue
        cpath = file_for_path(site, url_path(loc))
        if not os.path.isfile(cpath):
            missing_child.append(loc)
            continue
        children += 1
        if os.path.getsize(cpath) > 50 * 1024 * 1024:
            rep.error("sitemap_size", "%s is larger than 50 MB" % loc)
        try:
            croot = ET.parse(cpath).getroot()
        except ET.ParseError as e:
            rep.error("sitemap_xml", "%s is not valid XML: %s" % (loc, e))
            continue
        urls = croot.findall(ns + "url")
        if len(urls) > SITEMAP_MAX_URLS:
            rep.error("sitemap_too_long", "%s has %d URLs (limit %d)" % (loc, len(urls), SITEMAP_MAX_URLS))
        for u in urls:
            l = (u.findtext(ns + "loc") or "").strip()
            lm = (u.findtext(ns + "lastmod") or "").strip()
            total += 1
            if lm and not lm_rx.match(lm):
                bad_lastmod.append("%s <lastmod>%s</lastmod>" % (l, lm))
            if not l.startswith(SITE_ORIGIN + "/") or "#" in l or "?" in l:
                bad_loc.append(l)
                continue
            key = url_path(l)
            if key in seen:
                dups.append(l)
                continue
            seen.add(key)
            f = file_for_path(site, key)
            rel = os.path.relpath(f, site).replace(os.sep, "/")
            if not os.path.isfile(f):
                no_file.append(l)
                continue
            info = page_info.get(rel)
            if info:
                canon, robots = info
                if "noindex" in robots:
                    noindex.append(l)
                if canon is None or url_path(canon) != key or not canon.startswith(SITE_ORIGIN + "/"):
                    not_self.append("%s (canonical %s)" % (l, canon))
    rep.stats["sitemap"] = {"children": children, "urls": total, "unique": len(seen)}
    if missing_child:
        rep.error("sitemap_child_missing", "child sitemaps listed in sitemap.xml but not in the build", missing_child)
    if bad_loc:
        rep.error("sitemap_loc", "sitemap <loc> values must be absolute %s/ URLs without # or ?" % SITE_ORIGIN, bad_loc)
    if dups:
        rep.error("sitemap_duplicates", "%d URLs listed twice" % len(dups), dups)
    if no_file:
        rep.error("sitemap_404", "%d sitemap URLs have no page in the build (they would answer 404/410)" % len(no_file), no_file)
    if noindex:
        rep.error("sitemap_noindex", "%d sitemap URLs are noindex pages" % len(noindex), noindex)
    if not_self:
        rep.error("sitemap_canonical", "%d sitemap URLs are not self-canonical" % len(not_self), not_self)
    if bad_lastmod:
        rep.error("sitemap_lastmod", "%d <lastmod> values are not W3C dates (YYYY-MM-DD[Thh:mm…]) — the sitemap XSD "
                  "rejects them" % len(bad_lastmod), bad_lastmod)


def check_manifest(site, rows, rep):
    p = os.path.join(site, "_seo", "pages.json")
    if not os.path.isfile(p):
        return
    if not rows and load_json_file(p, None) is None:
        rep.error("manifest_json", "_seo/pages.json is not valid JSON")
        return
    rep.stats["manifest_rows"] = len(rows)
    missing_label, missing_file, sample, bad_verified, bad_member = [], [], [], [], []
    for r in rows:
        path, t, lang = r.get("p") or "", (r.get("t") or ""), r.get("l") or "ar"
        if re.search(r"(^|-)(lead|leads|sample)($|-)", t):
            sample.append("%s (%s)" % (path, t))
        f = file_for_path(site, nfc(unquote(path)))
        if not os.path.isfile(f):
            missing_file.append(path)
            continue
        if t == "company-public" and lang == "ar":
            if PUBLIC_SOURCE_LABEL not in read_text(f):
                missing_label.append(path)
        elif t == "company-verified":
            # its own tag, meta description and JSON-LD say «✓ موثّق من فريق المنصة» (English page: "✓ Verified by the platform
            # team"); never public-source / not registered
            txt = read_text(f)
            head = txt.split("</head>", 1)[0]
            md = META_DESC_RX.search(head)
            badge = VERIFIED_LABEL if lang == "ar" else VERIFIED_LABEL_EN
            if (badge not in txt or badge not in (md.group(1) if md else "") or 'class="pubtag"' in txt
                    or "مصادر عامة" in (md.group(1) if md else "") or "Public-source data" in (md.group(1) if md else "")):
                bad_verified.append(path)
        elif t == "company-public" and lang == "en":
            if "Public-source data" not in read_text(f):
                missing_label.append(path)
        elif t == "company":
            txt = read_text(f)
            if 'class="pubtag"' in txt:
                bad_member.append(path)
    if missing_file:
        rep.error("manifest_missing_pages", "%d manifest rows have no page in the build" % len(missing_file), missing_file)
    if missing_label:
        rep.error("public_source_label", "public-source factory pages without «%s – غير مسجّل في المنصة»" % PUBLIC_SOURCE_LABEL,
                  missing_label)
    if bad_verified:
        rep.error("verified_label", "pages of the companies verified by the platform team (data/factories.js) without «✓ %s», or "
                  "labelled public-source" % VERIFIED_LABEL, bad_verified)
    if bad_member:
        rep.error("member_label", "imported member listings labelled public-source", bad_member)
    if sample:
        rep.error("sample_pages", "pages generated from sample/unverified data (MIG.LEADS etc.)", sample)


def check_seo_stats(site, path, rep):
    """build/seo-stats.json: the generator validates every page it wrote (problem_count) — refuse when it found problems"""
    if not path:
        return
    if not os.path.isfile(path):
        rep.warn("seo_stats_missing", "%s not found: the generator's own validation result is not checked" % path)
        return
    st = load_json_file(path, None)
    if not isinstance(st, dict):
        rep.error("seo_stats", "%s is not valid JSON" % path)
        return
    built, built_s = manifest_built(site)
    mt = os.path.getmtime(path)
    if built and not (built - 120 <= mt <= built + 3600):
        rep.warn("seo_stats_other_build", "%s was written at %s, not by this build (%s): its result is not used" % (
            path, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mt)), built_s))
        return
    rep.stats["seo_stats"] = {k: st.get(k) for k in ("pages_ar", "pages_en", "indexable", "sitemap_urls", "problem_count",
                                                     "redirects_exact", "seconds", "today")}
    if st.get("problem_count"):
        rep.error("generator_problems", "the generator's validation found %s problem(s) in this build (%s)" % (
            st.get("problem_count"), path), [str(x) for x in (st.get("problems") or [])])
    if st.get("warnings"):
        rep.warn("generator_warnings", "generator warnings (%s)" % path, [str(x) for x in st.get("warnings")])


def finish(out, rep):
    status = "error" if rep.errors else ("warning" if rep.warnings else "ok")
    data = {"status": status, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "stats": rep.stats,
            "errors": rep.errors, "warnings": rep.warnings, "notes": rep.notes}
    try:
        with open(os.path.join(out, "STAGE-REPORT.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
    except OSError:
        pass
    s = rep.stats
    print("stage: %s" % out)
    if "copied_files" in s:
        print("  copied %d files (%s) from %s in %ss; functions: %s files" % (
            s["copied_files"], human(s["copied_bytes"]), s.get("source_site"), s.get("stage_seconds"), s.get("functions_files")))
        for l in s.get("symlinks_resolved", [])[:6]:
            print("  symlink resolved: %s" % l)
        for k, v in sorted(s.get("skipped", {}).items()):
            print("  skipped %-8s %d  e.g. %s" % (k, len(v), "; ".join(v[:3])))
    if "files" in s:
        print("  upload: %d files, %s (limit %d files, 25 MiB each)" % (s["files"], s["size"], s["max_files"]))
    if "sitemap" in s:
        print("  sitemaps: %(children)d children, %(urls)d URLs" % s["sitemap"])
    if "html_pages" in s:
        print("  html pages: %d (scanned in %ss); manifest rows: %s; _redirects: %s; _routes rules: %s; _headers rules: %s" % (
            s["html_pages"], s.get("page_scan_seconds"), s.get("manifest_rows"), s.get("redirects_rules"),
            s.get("routes_rules"), s.get("headers_rules")))
    if "build_built" in s:
        print("  build: %s (%s h ago)%s" % (s["build_built"], s.get("build_age_hours"),
                                           ("; generator problems: %s" % s["seo_stats"].get("problem_count")) if s.get("seo_stats") else ""))
    for n in rep.notes:
        print("  note: %s" % n)
    for w in rep.warnings:
        print("  WARN  [%s] %s" % (w["code"], w["msg"]))
        for e in w["examples"][:5]:
            print("          - %s" % e)
    for e in rep.errors:
        print("  ERROR [%s] %s" % (e["code"], e["msg"]))
        for x in e["examples"][:5]:
            print("          - %s" % x)
    print("  result: %s (%d error(s), %d warning(s)) — report: %s" % (
        status.upper(), len(rep.errors), len(rep.warnings), os.path.join(out, "STAGE-REPORT.json")))
    return 1 if rep.errors else 0


# --------------------------------------------------------------------------------------------------- emulate / contacts
def cmd_emulate(a):
    """<to> = hard-linked copy of the stage whose _redirects only keeps rules production applies (paths the Functions
    do not serve). `wrangler pages dev` applies _redirects behind ctx.next(), production does not (Pages docs:
    Redirects › Functions): without this, a redirect that only exists in _redirects passes locally and 404s live."""
    src, dst = os.path.abspath(a.out), os.path.abspath(a.to)
    if not os.path.isdir(os.path.join(src, "site")) or not os.path.exists(os.path.join(src, STAGE_MARKER)):
        raise SystemExit("stage.py emulate: %s is not a stage dir" % src)
    safe_reset_dir(dst, keep=(".wrangler",))
    linked = copied = 0
    for d, dirs, files in os.walk(src):
        rd = os.path.relpath(d, src)
        dirs[:] = [x for x in dirs if not (rd == "." and x in (".wrangler", ".functions-build"))]
        for fn in files:
            s = os.path.join(d, fn)
            t = os.path.normpath(os.path.join(dst, rd, fn))
            os.makedirs(os.path.dirname(t), exist_ok=True)
            if rd == "site" and fn == "_redirects":
                continue
            try:
                os.link(s, t)
                linked += 1
            except OSError:
                shutil.copy2(s, t)
                copied += 1
    site = os.path.join(src, "site")
    rules, _ = parse_redirects_file(site)
    inc, exc = routes_rules(site)
    kept = [r for r in rules if not served_by_functions(nfc(unquote(r[0])).split("*")[0], inc, exc)]
    with open(os.path.join(dst, "site", "_redirects"), "w", encoding="utf-8") as f:
        f.write("# production emulation (deploy/stage.py emulate): only rules for paths the Functions do not serve\n")
        for r in kept:
            f.write("%s %s %s\n" % (r[0], r[1], r[2]))
    with open(os.path.join(dst, STAGE_MARKER), "w", encoding="utf-8") as f:
        json.dump({"emulation_of": src, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f)
    print("emulate: %s → %s (%d hard links, %d copies); _redirects: %d of %d rules kept (the rest are the edge's job)" % (
        src, dst, linked, copied, len(kept), len(rules)))
    return 0


def cmd_refs(a):
    """local scripts / styles / images a page loads (path?query, percent-encoded), for smoke-test.sh's live check"""
    text = read_text(a.file)
    head = text.split("</head>", 1)[0] if "</head>" in text else text[:20000]
    page_url = SITE_ORIGIN + (a.path if a.path.startswith("/") else "/" + a.path)
    m = BASE_RX.search(head)
    base = urljoin(page_url, html.unescape(m.group(1))) if m else page_url
    scan = BLOCK_CONTENT_RX.sub(lambda x: x.group(1) + x.group(4), text)
    seen = []
    for tag, attrs in REF_TAG_RX.findall(scan):
        tag = tag.lower()
        if tag == "a":
            continue
        if tag == "link":
            mm = REL_RX.search(attrs)
            relv = mm.group(1).lower() if mm else ""
            if any(x in relv for x in ("preconnect", "dns-prefetch", "canonical", "alternate")):
                continue
        for name, _, v1, v2 in REF_ATTR_RX.findall(attrs):
            v = v1 or v2
            for u in ([x.strip().split(" ")[0] for x in v.split(",")] if name.lower() == "srcset" else [v]):
                if _local_path(u, base) is None:
                    continue
                sp = urlsplit(urljoin(base, html.unescape(u).strip()))
                q = quote(sp.path, safe="/%:@!$&'()*+,;=-._~") + ("?" + sp.query if sp.query else "")
                if q not in seen:
                    seen.append(q)
    for q in seen[: a.limit]:
        print(q)
    return 0


def cmd_contacts(a):
    load_privacy_allow(a.privacy_allow)
    rc = 0
    for f in a.files:
        text = read_text(f) if f != "-" else sys.stdin.read()
        found = html_contacts(text) if a.html else contacts(text)
        for c in sorted(set(found)):
            print(c)
            rc = 3
    return 0 if not a.exit_code else rc


def cmd_apk(a):
    rc = 0
    for f in a.files:
        sg = apk_signers(f)
        bad = apk_problems(f) if os.path.isfile(f) else ["no such file"]
        if bad or sg["problem"]:
            print("%s: %s" % (f, "; ".join(bad + ([sg["problem"]] if sg["problem"] else []))))
            rc = 1
            continue
        print("%s: %s signer %s%s" % (f, ",".join(sg["schemes"]), " ".join(sg["certs"]), "  DEBUG KEY" if sg["debug"] else ""))
    return rc


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd")
    for name in ("stage", "check"):
        p = sub.add_parser(name)
        p.add_argument("--out", default=os.path.join(repo, "build", "pages-stage"), help="stage directory")
        p.add_argument("--max-files", default=os.environ.get("PAGES_MAX_FILES", DEFAULT_MAX_FILES), type=int)
        p.add_argument("--no-functions", action="store_true", help="deploy without Pages Functions (not recommended)")
        p.add_argument("--seo-stats", default=os.environ.get("MIG_SEO_STATS") or os.path.join(repo, "build", "seo-stats.json"),
                       help="the generator's validation result of this build (build/seo-stats.json)")
        p.add_argument("--privacy-allow", default=os.path.join(here, "privacy-allow.txt"))
        p.add_argument("--jobs", type=int, default=0, help="parallel page scan (default: up to 4 processes)")
        p.add_argument("--legacy-live", default=LEGACY_LIVE_FILE,
                       help="deploy 1: paths the owner's old system keeps serving on the domain (deploy/legacy-live.txt)")
        if name == "stage":
            p.add_argument("--site", default=os.path.join(repo, "build", "site-fresh"),
                           help="build output (default: <repo>/build/site-fresh, written by deploy/deploy.sh build)")
            p.add_argument("--repo", default=repo, help="repository root (symlinks may only point inside it)")
            p.add_argument("--functions", default=os.path.join(repo, "functions"))
            p.add_argument("--config", default=os.path.join(here, "wrangler-pages.toml"))
            p.add_argument("--exclude-file", default=os.path.join(here, "stage-exclude.txt"))
            p.add_argument("--allow-root", action="append", help="extra directory symlinks may point into")
    p = sub.add_parser("emulate")
    p.add_argument("--out", default=os.path.join(repo, "build", "pages-stage"), help="stage directory")
    p.add_argument("--to", default=os.path.join(repo, "build", "pages-prod-emu"))
    p = sub.add_parser("refs")
    p.add_argument("--path", default="/", help="URL path of the page (to resolve relative references)")
    p.add_argument("--limit", type=int, default=40)
    p.add_argument("file")
    p = sub.add_parser("apk")
    p.add_argument("files", nargs="+")
    p = sub.add_parser("contacts")
    p.add_argument("--html", action="store_true", help="the files are HTML pages (visible text, attributes, links)")
    p.add_argument("--exit-code", action="store_true", help="exit 3 when something was found")
    p.add_argument("--privacy-allow", default=os.path.join(here, "privacy-allow.txt"))
    p.add_argument("files", nargs="+")
    a = ap.parse_args(argv)
    if a.cmd == "stage":
        return cmd_stage(a)
    if a.cmd == "check":
        return run_checks(os.path.abspath(a.out), a, Report())
    if a.cmd == "emulate":
        return cmd_emulate(a)
    if a.cmd == "contacts":
        return cmd_contacts(a)
    if a.cmd == "refs":
        return cmd_refs(a)
    if a.cmd == "apk":
        return cmd_apk(a)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
