#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""deploy/ci/ci-post-stage.py — the three stage-level patches the manual deploys applied by hand, applied by CI.

    python3 deploy/ci/ci-post-stage.py --stage <stage dir> [--live https://madeinegyptgate.com] [--no-live]

Run it after `deploy/stage.py stage` passed (STAGE-REPORT.json: 0 errors) and before `wrangler pages deploy`.
It changes <stage>/site only (never the repository, never the build dir) and only READS the live site (GET).
Running it twice is harmless: every patch first checks whether it is still needed.

  1 carry-redirects   deploy/ci/carry-redirects.txt holds live 301 rules a fresh build no longer writes
                      (/en/industrial_products/<slug>/ → /industrial_products/<slug>/). A rule is appended to
                      <stage>/site/_redirects only when the new stage has NO page at its source, HAS the page at its
                      target, and the build's _redirects has no rule for that source yet. The Pages limits
                      (2,000 static / 100 dynamic rules) are checked afterwards.
  2 janna-link-fix    janna.html (Janna's kiosk page) gets
                      <script src="/data/link-fix.js?v=<md5[:8] of data/link-fix.js>" defer></script>
                      right before </body> — where the live page has it — when the build does not load link-fix.js.
  3 live-seo-bundles  the SEO bundles (/assets/seo-<hash>.css|.js) that the LIVE pages reference are fetched read-only
                      from the live site into <stage>/site/assets/ when the new stage lacks them, so pages that browsers
                      and caches still hold keep their styles and scripts after the deploy. The download carries a
                      ?ci=<time> query so it gets the copy the live deployment serves, not one of the edge-cached copies.

Writes <stage>/CI-POST-STAGE.json (outside site/, so it is never uploaded).
Exit status: 0 = done (warnings allowed), 1 = a patch could not be applied safely — do NOT deploy, 2 = usage problem.
Standard library only (Python >= 3.8).
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from urllib.parse import unquote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DEFAULT_LIVE = os.environ.get("MIG_LIVE_URL") or "https://madeinegyptgate.com"
# live pages whose HTML names the SEO bundles (every generated page links the same two; a few page types for safety)
DEFAULT_SAMPLES = ["/factories/", "/en/", "/governorates/cairo/", "/tenders/", "/en/factories/", "/factories/search/"]
UA = "migate-ci/1.0 (post-stage check; read-only)"
STAGE_MARKER = ".migate-stage"
CODES = ("200", "301", "302", "303", "307", "308")
PAGES_STATIC_MAX, PAGES_DYNAMIC_MAX = 2000, 100       # Cloudflare Pages _redirects limits
MAX_FILE_BYTES = 25 * 1024 * 1024                     # Pages: 25 MiB per asset
BUNDLE_RX = re.compile(r"/assets/(seo-[0-9a-f]{10}\.(?:css|js))(?=[\"'?#\s>)])")
BUNDLE_NAME_RX = re.compile(r"^seo-([0-9a-f]{10})\.(css|js)$")
LINKFIX_RX = re.compile(r"""<script\b[^>]*\bsrc\s*=\s*["'][^"']*\blink-fix\.js""", re.I)
BODY_END_RX = re.compile(rb"</body\s*>", re.I)


def nfc(s):
    return unicodedata.normalize("NFC", s)


class Report:
    def __init__(self):
        self.errors, self.warnings, self.patches = [], [], {}

    def error(self, msg):
        self.errors.append(msg)
        print("  ERROR %s" % msg)

    def warn(self, msg):
        self.warnings.append(msg)
        print("  WARN  %s" % msg)


def ok(msg):
    print("  OK    %s" % msg)


# ------------------------------------------------------------------------------------------------------ stage helpers
def page_file(site, url_path, strict):
    """the staged file that answers url_path, or None. strict: only the canonical form (/x/ → x/index.html)."""
    p = nfc(unquote(url_path.split("#", 1)[0].split("?", 1)[0]))
    if not p.startswith("/") or "\\" in p or any(seg in (".", "..") for seg in p.split("/")):
        return None
    rel = p.lstrip("/")
    if p.endswith("/"):
        cands = [os.path.join(site, rel, "index.html")]
        if not strict and rel:
            cands.append(os.path.join(site, rel.rstrip("/") + ".html"))
    else:
        cands = [os.path.join(site, rel + ".html"), os.path.join(site, rel, "index.html")]
        if not strict:
            cands.insert(0, os.path.join(site, rel))
    for c in cands:
        if os.path.isfile(c):
            return c
    return None


def parse_rules(lines):
    """Pages _redirects lines → (rules, bad); rule = (source, target, code, dynamic, line number)"""
    rules, bad = [], []
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        parts = s.split()
        if len(parts) not in (2, 3) or (len(parts) == 3 and parts[2] not in CODES) or len(s) > 1000:
            bad.append("line %d: %s" % (i, s[:160]))
            continue
        dyn = "*" in parts[0] or bool(re.search(r"/:[A-Za-z]", parts[0]))
        rules.append((parts[0], parts[1], parts[2] if len(parts) == 3 else "302", dyn, i))
    return rules, bad


def local_path_ok(p):
    return (p.startswith("/") and not p.startswith("//") and "://" not in p and "*" not in p and ":" not in p
            and not re.search(r"[\s\x00-\x1f\x7f]", p))


# ------------------------------------------------------------------------------------------------------ patch 1
def patch_redirects(site, carry_file, rep):
    info = {"file": os.path.relpath(carry_file, REPO) if carry_file.startswith(REPO) else carry_file,
            "listed": 0, "added": 0, "already_in_build": 0, "page_exists": 0, "target_missing": 0, "examples": {}}
    rep.patches["carry_redirects"] = info
    print("==> patch 1: carry live redirects (%s)" % info["file"])
    if not os.path.isfile(carry_file):
        rep.error("%s not found" % carry_file)
        return
    with open(carry_file, encoding="utf-8") as f:
        carry_lines = f.read().splitlines()
    carry, bad = parse_rules(carry_lines)
    for src, to, code, dyn, n in carry:
        if dyn or code != "301" or not local_path_ok(src) or not local_path_ok(to) or src == to:
            bad.append("line %d: %s %s %s (only static 301 rules between two local paths are carried)" % (n, src, to, code))
    if bad:
        rep.error("%s has %d malformed line(s) — fix the file; nothing was changed: %s" % (info["file"], len(bad), "; ".join(bad[:5])))
        return
    info["listed"] = len(carry)
    path = os.path.join(site, "_redirects")
    if not os.path.isfile(path):
        rep.error("the stage has no site/_redirects (the build always writes one) — stage.py should have refused it")
        return
    with open(path, encoding="utf-8") as f:
        text = f.read()
    rules, bad_build = parse_rules(text.splitlines())
    if bad_build:
        rep.error("the build's _redirects has malformed lines: %s" % "; ".join(bad_build[:5]))
        return
    have = {nfc(unquote(r[0])) for r in rules}
    add = []
    for src, to, code, _dyn, n in carry:
        key = nfc(unquote(src))
        if key in have:
            info["already_in_build"] += 1
            continue
        if page_file(site, src, strict=False):
            info["page_exists"] += 1
            info["examples"].setdefault("page_exists", []).append(nfc(unquote(src)))
            continue
        if not page_file(site, to, strict=True):
            info["target_missing"] += 1
            info["examples"].setdefault("target_missing", []).append(nfc(unquote(to)))
            continue
        have.add(key)
        add.append("%s %s %s" % (src, to, code))
    for k in ("page_exists", "target_missing"):
        if k in info["examples"]:
            info["examples"][k] = info["examples"][k][:5]
    if info["target_missing"]:
        rep.warn("%d carried rule(s) skipped: their target page is not in this build (a redirect would lead to a 404), "
                 "e.g. %s" % (info["target_missing"], info["examples"]["target_missing"][0]))
    if info["page_exists"]:
        ok("%d carried rule(s) not needed: the build has the English page again" % info["page_exists"])
    static = sum(1 for r in rules if not r[3]) + len(add)
    dynamic = sum(1 for r in rules if r[3])
    info["static_rules_after"], info["dynamic_rules_after"] = static, dynamic
    if static > PAGES_STATIC_MAX or dynamic > PAGES_DYNAMIC_MAX:
        rep.error("_redirects would have %d static + %d dynamic rules (Pages: <= %d / <= %d) — nothing was changed"
                  % (static, dynamic, PAGES_STATIC_MAX, PAGES_DYNAMIC_MAX))
        return
    if add:
        # no comment line: the result is then line-for-line what the live deployment has (the report names the source file)
        block = ("" if text.endswith("\n") or not text else "\n") + "\n".join(add) + "\n"
        tmp = path + ".ci-tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(text + block)
        with open(tmp, encoding="utf-8") as f:              # re-read what will be uploaded
            again, bad_again = parse_rules(f.read().splitlines())
        if bad_again or len(again) != len(rules) + len(add):
            os.unlink(tmp)
            rep.error("the patched _redirects did not parse back as expected — nothing was changed")
            return
        os.replace(tmp, path)
    info["added"] = len(add)
    ok("%d of %d carried rule(s) appended to _redirects (%d already in the build); now %d static + %d dynamic rules"
       % (len(add), len(carry), info["already_in_build"], static, dynamic))


# ------------------------------------------------------------------------------------------------------ patch 2
def patch_janna(site, rep):
    info = {"page": "janna.html", "status": ""}
    rep.patches["janna_link_fix"] = info
    print("==> patch 2: janna.html loads /data/link-fix.js")
    page = os.path.join(site, "janna.html")
    js = os.path.join(site, "data", "link-fix.js")
    if not os.path.isfile(page):
        info["status"] = "skipped: no janna.html in this build"
        rep.warn("janna.html is not in this build — nothing to patch")
        return
    if not os.path.isfile(js):
        info["status"] = "skipped: no data/link-fix.js in this build"
        rep.warn("data/link-fix.js is not in this build — janna.html is left as built")
        return
    with open(js, "rb") as f:
        ver = hashlib.md5(f.read()).hexdigest()[:8]
    src_js = os.path.join(REPO, "data", "link-fix.js")
    if os.path.isfile(src_js):
        with open(src_js, "rb") as f:
            if hashlib.md5(f.read()).hexdigest()[:8] != ver:
                rep.warn("the staged data/link-fix.js differs from the repository's — the staged (deployed) copy is versioned")
    with open(page, "rb") as f:
        raw = f.read()
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError:
        info["status"] = "error: not UTF-8"
        rep.error("janna.html is not UTF-8 — left unchanged")
        return
    if LINKFIX_RX.search(html):
        info["status"] = "already loads link-fix.js"
        ok("janna.html already loads link-fix.js — nothing to do")
        return
    ends = list(BODY_END_RX.finditer(raw))
    if not ends:
        info["status"] = "skipped: no </body>"
        rep.warn("janna.html has no </body> — the link-fix script was NOT added (check the page by hand)")
        return
    tag = '<script src="/data/link-fix.js?v=%s" defer></script>' % ver
    at = ends[-1].start()
    new = raw[:at] + tag.encode("utf-8") + raw[at:]
    tmp = page + ".ci-tmp"
    with open(tmp, "wb") as f:
        f.write(new)
    st = os.stat(page)
    os.chmod(tmp, st.st_mode & 0o777)
    os.replace(tmp, page)
    info.update(status="added", tag=tag)
    ok("janna.html: %s added before </body>" % tag)


# ------------------------------------------------------------------------------------------------------ patch 3
def http_get(url, timeout, tries=3):
    """→ (status, headers dict lower-case, body bytes); never raises for HTTP errors"""
    last = None
    for i in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity", "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(MAX_FILE_BYTES + 1)
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, b""
            last = "HTTP %d" % e.code
        except Exception as e:  # network, TLS, timeout
            last = "%s: %s" % (type(e).__name__, e)
        time.sleep(2 * (i + 1))
    return 0, {}, (last or "no answer").encode("utf-8", "replace")


def check_bundle(name, status, headers, body):
    """→ None when the download is the bundle, else the reason"""
    ext = name.rsplit(".", 1)[1]
    ctype = headers.get("content-type", "").lower()
    if status != 200:
        return "HTTP %s" % status
    if not body:
        return "empty body"
    if len(body) > MAX_FILE_BYTES:
        return "larger than 25 MiB"
    if ext == "css" and "text/css" not in ctype:
        return "content-type %r, expected text/css" % ctype
    if ext == "js" and "javascript" not in ctype:
        return "content-type %r, expected JavaScript" % ctype
    head = body.lstrip(b"\xef\xbb\xbf \t\r\n")[:64].lower()
    if head.startswith(b"<"):
        return "an HTML page, not the bundle"
    try:
        body.decode("utf-8")
    except UnicodeDecodeError:
        return "not UTF-8 text"
    if ext == "css" and b"{" not in body:
        return "does not look like CSS"
    return None


def node_check(path):
    """syntax check of a downloaded script (node --check parses, never runs it); None = OK or node unavailable"""
    node = shutil.which("node")
    if not node:
        return None
    try:
        r = subprocess.run([node, "--check", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    except Exception as e:
        return "node --check could not run: %s" % e
    return None if r.returncode == 0 else ("not valid JavaScript: %s" % r.stderr.decode("utf-8", "replace").strip()[:200])


def patch_bundles(site, live, samples, timeout, strict, max_files, staged_files, rep):
    info = {"live": live, "pages_read": [], "pages_failed": [], "referenced": [], "already_in_stage": [], "added": [],
            "failed": []}
    rep.patches["live_seo_bundles"] = info
    print("==> patch 3: keep the SEO bundles the live pages reference (%s)" % live)
    problem = rep.error if strict else rep.warn
    names = set()
    unreachable = 0
    for p in samples:
        if unreachable >= 2:                               # the live site does not answer at all: stop asking
            info["pages_failed"].append("%s (not tried: the live site does not answer)" % p)
            continue
        st, hd, body = http_get(live.rstrip("/") + p, timeout)
        unreachable = unreachable + 1 if st == 0 else 0
        if st == 200 and "html" in hd.get("content-type", "").lower():
            info["pages_read"].append(p)
            names.update(BUNDLE_RX.findall(body.decode("utf-8", "replace")))
        else:
            reason = ("HTTP %s" % st) if st else body.decode("utf-8", "replace")[:160]
            if st == 403 and ("cf-mitigated" in hd or "challenge" in hd.get("cf-mitigated", "")):
                reason = "403 Cloudflare challenge"
            info["pages_failed"].append("%s (%s)" % (p, reason))
    # the intel Worker's baked fallback shell (worker-intel/src/shell.js, used only when it cannot read the live shell) names the
    # bundles of the build it was made from: keep those too, so the fallback never points at a file this deploy dropped.
    # Best effort: a name the live site no longer has is a warning, never a stop.
    shell_only = set()
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                               "worker-intel", "src", "shell.js"), encoding="utf-8") as fh:
            shell_only = set(BUNDLE_RX.findall(fh.read().replace('\\"', '"'))) - names
    except OSError:
        pass
    names |= shell_only
    info["intel_fallback"] = sorted(shell_only)
    names = sorted(n for n in names if BUNDLE_NAME_RX.match(n))
    info["referenced"] = names
    if not info["pages_read"]:
        problem("could not read any live page (%s) — the live SEO bundles were NOT kept: pages cached before this deploy "
                "may load without their styles until they are reloaded" % "; ".join(info["pages_failed"][:3]))
        return
    if info["pages_failed"]:
        rep.warn("live pages not read: %s" % "; ".join(info["pages_failed"]))
    if not names:
        rep.warn("the live pages (%s) reference no /assets/seo-*.css|js bundle — nothing to keep" % ", ".join(info["pages_read"]))
        return
    adir = os.path.join(site, "assets")
    for n in names:
        if os.path.isfile(os.path.join(adir, n)):
            info["already_in_stage"].append(n)
    todo = [n for n in names if n not in info["already_in_stage"]]
    if staged_files is not None and staged_files + len(todo) > max_files:
        rep.error("keeping %d live bundle(s) would exceed %d files per deployment" % (len(todo), max_files))
        return
    # the download bypasses the zone's edge cache (a query string is part of its cache key; Pages ignores it for static files):
    # the cached copies of an immutable /assets/ name differ between Cloudflare locations when an earlier deploy changed the
    # content under the same name, and only the copy the live deployment serves itself belongs in the new one
    buster = "?ci=%d" % int(time.time())
    info["fetched_with"] = buster
    for n in todo:
        st, hd, body = http_get(live.rstrip("/") + "/assets/" + n + buster, timeout)
        why = check_bundle(n, st, hd, body if st else b"")
        tmp = None
        if not why:
            os.makedirs(adir, exist_ok=True)
            fd, tmp = tempfile.mkstemp(prefix=".ci-", suffix="." + n.rsplit(".", 1)[1], dir=adir)
            with os.fdopen(fd, "wb") as f:
                f.write(body)
            if n.endswith(".js"):
                why = node_check(tmp)
        if why:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
            info["failed"].append("%s (%s)" % (n, why))
            (rep.warn if n in shell_only else problem)("live bundle /assets/%s NOT kept: %s" % (n, why))
            continue
        os.chmod(tmp, 0o644)
        os.replace(tmp, os.path.join(adir, n))
        m = BUNDLE_NAME_RX.match(n)
        info["added"].append({"name": n, "bytes": len(body),
                              "content_hash_matches_name": hashlib.sha1(body).hexdigest()[:10] == m.group(1)})
    ok("live pages reference %s; already in this build: %s; kept from the live site: %s" % (
        ", ".join(names), ", ".join(info["already_in_stage"]) or "none",
        ", ".join(a["name"] for a in info["added"]) or "none"))


# ------------------------------------------------------------------------------------------------------ main
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--stage", required=True, help="the stage dir written by deploy/stage.py stage")
    ap.add_argument("--carry", default=os.path.join(HERE, "carry-redirects.txt"))
    ap.add_argument("--live", default=DEFAULT_LIVE, help="the live site to read the SEO bundles from (GET only)")
    ap.add_argument("--no-live", action="store_true", help="skip patch 3 (offline runs)")
    ap.add_argument("--sample", action="append", help="live page path to read (repeatable; default: %s)" % " ".join(DEFAULT_SAMPLES))
    ap.add_argument("--strict-live", action="store_true", help="a live page or bundle that cannot be read is an error")
    ap.add_argument("--timeout", type=float, default=20)
    ap.add_argument("--max-files", type=int, default=int(os.environ.get("PAGES_MAX_FILES") or 20000))
    a = ap.parse_args(argv)

    stage = os.path.abspath(a.stage)
    site = os.path.join(stage, "site")
    if not os.path.isfile(os.path.join(stage, STAGE_MARKER)) or not os.path.isdir(site):
        print("ci-post-stage: %s is not a stage dir (no %s or site/) — run deploy/stage.py stage first" % (stage, STAGE_MARKER))
        return 2
    u = urlsplit(a.live)
    local_test = u.scheme == "http" and u.hostname in ("127.0.0.1", "localhost")
    if not a.no_live and not ((u.scheme == "https" and u.netloc) or local_test):
        print("ci-post-stage: --live must be an https:// URL")
        return 2
    rep = Report()
    staged_files = None
    try:
        with open(os.path.join(stage, "STAGE-REPORT.json"), encoding="utf-8") as f:
            sr = json.load(f)
        if sr.get("errors"):
            print("ci-post-stage: STAGE-REPORT.json has %d error(s) — this stage must not be deployed; not patching" % len(sr["errors"]))
            return 1
        staged_files = (sr.get("stats") or {}).get("files")
    except (OSError, ValueError) as e:
        print("ci-post-stage: cannot read %s/STAGE-REPORT.json (%s) — run deploy/stage.py stage first" % (stage, e))
        return 1

    print("ci-post-stage: %s" % stage)
    patch_redirects(site, os.path.abspath(a.carry), rep)
    patch_janna(site, rep)
    if a.no_live:
        rep.patches["live_seo_bundles"] = {"skipped": "--no-live"}
        rep.warn("patch 3 skipped (--no-live): the live SEO bundles were not kept")
    else:
        patch_bundles(site, a.live, a.sample or DEFAULT_SAMPLES, a.timeout, a.strict_live, a.max_files, staged_files, rep)

    status = "error" if rep.errors else ("warning" if rep.warnings else "ok")
    out = {"status": status, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "stage": stage,
           "patches": rep.patches, "errors": rep.errors, "warnings": rep.warnings}
    with open(os.path.join(stage, "CI-POST-STAGE.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("ci-post-stage: %s (%d error(s), %d warning(s)) — report: %s" % (
        status.upper(), len(rep.errors), len(rep.warnings), os.path.join(stage, "CI-POST-STAGE.json")))
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
