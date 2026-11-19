#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""deploy/ci/ci-overlay.py — the published Control Center overlay, reduced to DATA before any CI build runs it.

    python3 deploy/ci/ci-overlay.py --url https://madeinegyptgate.com/data/overlay.js --out <work>/overlay.js

The site build (tools/dump-data.mjs) and Janna's index (worker/build-index.js, build-items.js) execute the overlay file with
Node's vm module, which is not a sandbox. CI therefore never executes the downloaded file: it reads it (one GET, cache-busted),
checks it is the Worker's own output (header X-Overlay-V; first line exactly `window.MIGOVL_DATA=<JSON>;` or
`window.MIGOVL_DATA=null;`, as worker/src/content.js writes it), parses the JSON strictly, and writes a NEW file
`window.MIGOVL_DATA=<the same JSON, re-serialised>;` — data only, the same values the pages get, no code from the network.
Anything after the data line (the Worker writes a /* comment */ there) is dropped.

Refused (exit 1, the reason on stdout): no answer / not 200 / not JavaScript / no X-Overlay-V (the static fallback of the
Pages site answered: the owner's published edits are not available) / larger than 1 MiB / not UTF-8 / a first line that is
not exactly the data assignment / JSON that does not parse (NaN and Infinity included) or is not an object.
Exit 0: --out written; the last line of stdout is `overlay v=<v> at=<at> bytes=<n>`. Exit 2: usage.
Standard library only (Python >= 3.8). Read-only: one GET, nothing else is contacted.
"""
import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

UA = "migate-ci/1.0 (overlay pull; read-only)"
MAX_BYTES = 1024 * 1024                     # the Worker refuses more than 512 KiB (content.js OVERLAY_LIMIT)
LINE_RX = re.compile(r"^window\.MIGOVL_DATA=(null|\{.*\});$", re.S)
REST_RX = re.compile(r"^\s*(/\*(?:(?!\*/).)*\*/\s*)*$", re.S)


def _no_constants(name):
    raise ValueError("%s is not JSON" % name)


def fetch(url, timeout, tries=3):
    """→ (status, headers lower-case, body bytes, final url) — never raises for HTTP errors"""
    last = "no answer"
    for i in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/javascript, */*",
                                                   "Accept-Encoding": "identity", "Cache-Control": "no-cache"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(MAX_BYTES + 1), r.geturl()
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, b"", url
            last = "HTTP %d" % e.code
        except Exception as e:  # network, TLS, timeout
            last = "%s: %s" % (type(e).__name__, e)
        time.sleep(2 * (i + 1))
    return 0, {}, last.encode("utf-8", "replace"), url


def sanitize(status, headers, body):
    """→ (canonical file text, data or None, notes) ; raises ValueError(reason) when the download is not usable"""
    notes = []
    if status != 200:
        raise ValueError(("HTTP %s" % status) if status else body.decode("utf-8", "replace")[:200])
    if "javascript" not in headers.get("content-type", "").lower():
        raise ValueError("content-type %r is not JavaScript" % headers.get("content-type", ""))
    if not headers.get("x-overlay-v"):
        raise ValueError("no X-Overlay-V header: the static fallback of the Pages site answered, not the Worker "
                         "(route /data/overlay.js*)")
    if len(body) > MAX_BYTES:
        raise ValueError("larger than %d bytes" % MAX_BYTES)
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("not UTF-8")
    first, _, rest = text.partition("\n")
    m = LINE_RX.match(first)
    if not m:
        raise ValueError("the first line is not the data assignment window.MIGOVL_DATA=<JSON>; (starts %r)" % first[:60])
    if m.group(1) == "null":
        data = None
    else:
        try:
            data = json.loads(m.group(1), parse_constant=_no_constants)
        except ValueError as e:
            raise ValueError("the overlay data is not valid JSON (%s)" % str(e)[:160])
        if not isinstance(data, dict):
            raise ValueError("the overlay data is not a JSON object")
    if not REST_RX.match(rest):
        notes.append("%d byte(s) after the data line were dropped (never run): %r" % (len(rest.encode("utf-8")), rest[:80]))
    if data is not None and str(data.get("v", "")) != str(headers.get("x-overlay-v", "")).strip():
        notes.append("X-Overlay-V %s differs from the file's v %s" % (headers.get("x-overlay-v"), data.get("v")))
    payload = "null" if data is None else json.dumps(data, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
    return "window.MIGOVL_DATA=%s;\n" % payload, data, notes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--url", required=True, help="the overlay URL (https://…/data/overlay.js; http://127.0.0.1 for tests)")
    ap.add_argument("--out", required=True, help="where to write the data-only overlay")
    ap.add_argument("--timeout", type=float, default=20)
    a = ap.parse_args(argv)
    u = urlsplit(a.url)
    if not ((u.scheme == "https" and u.netloc) or (u.scheme == "http" and u.hostname in ("127.0.0.1", "localhost"))):
        print("ci-overlay: --url must be an https:// URL")
        return 2
    url = a.url + ("&" if u.query else "?") + "ci=%d" % int(time.time())   # past the edge cache (max-age=60)
    status, headers, body, final = fetch(url, a.timeout)
    if urlsplit(final).netloc != u.netloc:
        print("ci-overlay: NOT usable: redirected to another host (%s)" % urlsplit(final).netloc)
        return 1
    try:
        text, data, notes = sanitize(status, headers, body)
    except ValueError as e:
        print("ci-overlay: NOT usable: %s" % e)
        return 1
    for n in notes:
        print("ci-overlay: note: %s" % n)
    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".overlay-", suffix=".js", dir=os.path.dirname(out))
    with os.fdopen(fd, "w", encoding="ascii", newline="\n") as f:
        f.write(text)
    os.replace(tmp, out)
    v = (data or {}).get("v", 0) if data is not None else 0
    at = (data or {}).get("at", "") if data is not None else ""
    print("overlay v=%s at=%s bytes=%d" % (v, at or "-", len(text)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
