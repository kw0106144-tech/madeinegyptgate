#!/usr/bin/env python3
"""Usefulness patch for the three Anam personas (Janna AR, Janna EN, Bassem), final version after the honesty, conversation and
exactness reviews: builds the new system prompts from the live records and proves that nothing else changed.

    python3 -I apply_patch.py [--live DIR] [--out DIR] [--expr DIR] [--selftest] [--no-sync-check]

--live      folder with the live records <key>.systemPrompt.md (default: the repository's anam/live, byte-identical to Anam on
            2026-11-20 at 09:30:5x UTC). Pass a folder with a FRESH read when anything else was applied first (for example the
            expressions round): every `old` must still occur exactly once there.
--out       where janna-ar.new.md, janna-en.new.md, bassem.new.md, the .diff files and plan.json go (default: this folder).
--expr      the expressions round's design folder (replacements.json + its three .new.md). Its spans are protected wherever they are
            found, in their old OR their new state (default: ../../expr/design next to this folder, if it exists).
--selftest  (1) replaces every emotion-tag span with a stand-in and applies again; (2) composes with the REAL expressions round in
            both orders (this patch on its outputs, and its replacements on this patch's outputs, then its own script with --base)
            and checks that both orders give byte-identical texts.
--no-sync-check  skip the Node run of the Worker's anchored price sync (worker/src/acc-plans.js rewritePrompt) on old vs new.

It stops with an error unless:
  1. every `old` of replacements.json occurs EXACTLY once in its record (overlapping occurrences counted);
  2. no two replacements overlap, and none touches a protected span: the emotion-tag spans (Janna AR «# تاجات المشاعر…» → end,
     Janna EN «# EMOTION TAGS…» → end, renamed headings included, each falling back to «# STYLE CUES» → end; Bassem's tags bullet of
     «# قواعد الكلام» with its indented sub-bullets, and «# STYLE CUES» → end) and every span of the expressions round's
     replacements.json (AR-G/C/S, EN-G/C/S, BA-G/C/S), found in their old or new state;
  3. the written file, read back, is the record with exactly those spans replaced: the text around them is byte-identical, every
     difflib hunk lies inside a replacement, every protected span is byte-identical in the new text;
  4. content: no square bracket in any new text (the expressions round allows only cue tags in brackets), no character outside the
     BMP added or removed, the final newline kept, the anchored facts blocks (price sync) byte-identical, and the protected strings
     (owner and legal lines, registration number, prices, VAT, contacts, directory counts) with the same counts;
  5. the janna_lookup update (tool-update.json) equals the saved read (tool-29fd5087.read.json) except the three added properties
     and the documented governorate description, with expectedUpdatedAt = the read's updatedAt and a description of ≤ 1,024 characters;
     the rollback equals the read.
Nothing is sent anywhere: this script only reads and writes local files (and runs the Worker's own price-sync code locally).
"""
import argparse, difflib, hashlib, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = "/home/user/madeinegyptgate-git"
KEYS = ("janna-ar", "janna-en", "bassem")
PERSONA = {"janna-ar": "5f06d835-22cc-4460-b412-84cefa9e565b", "janna-en": "e5101653-65b4-44a6-85e5-ec2e78f82685", "bassem": "19ef9078-5252-42a4-bbdf-9a3c4a38a4be"}
SYNC_KIND = {"janna-ar": "janna_ar", "janna-en": "janna_en", "bassem": "bassem"}
# anam_persona_list read during this finalisation (2026-11-20 ~11:20 UTC): unchanged since the design-time reads, which showed both
# Jannas whole and identical to anam/live and Bassem's trim total 26,460 UTF-16 units.
READ_UPDATED_AT = {"janna-ar": "2026-11-20T09:30:52.047Z", "janna-en": "2026-11-20T09:30:55.090Z", "bassem": "2026-11-20T09:30:58.146Z"}
LIVE_SHA = {"janna-ar": "34453d59217ecdc297b3cc8dfb38ee376220f5f44285293c5bc321198eb327f1",
            "janna-en": "f2cbd0c36fc8891da136099cd92bae98d5370fca8014ff651e85fd482d6da680",
            "bassem": "fadcad2a6fec3f8cd6f165e40dcfe0425a7c5e3b46cedcf10e722c9a4f802b15"}
FACTS_HEAD = {"janna-ar": "# حقائق الباقات والدفع", "janna-en": "# PLANS & PAYMENT", "bassem": "# حقائق"}
# strings whose number of occurrences must not change (owner / legal / registration / prices / VAT / contacts / directory facts)
PROTECTED = {
    "janna-ar": ["الجمعية المصرية للتنمية الصناعية", "6189 لسنة 2017", "ستة آلاف ومية تسعة وتمانين", "وزارة التضامن الاجتماعي",
                 "أربعة آلاف", "عشرة آلاف", "خمسة وعشرين ألف", "خمسين ألف", "مية ألف", "14%", "info@madeinegyptgate.com",
                 "01279188996", "02 38346757", "3,000", "1,380", "1,546", "91 مصنع", "26 ألف", "قانون 182 لسنة 2018", "etenders.gov.eg"],
    "janna-en": ["Egypt Industrial Development Association", "6189 of 2017", "Ministry of Social Solidarity", "four thousand",
                 "ten thousand", "twenty-five thousand", "fifty thousand", "one hundred thousand", "14% VAT", "info@madeinegyptgate.com",
                 "01279188996", "02 38346757", "3,000", "1,380", "1,546", "91 factories", "26,000", "Law 182 of 2018", "etenders.gov.eg"],
    "bassem": ["الجمعية المصرية للتنمية الصناعية", "6189 لسنة 2017", "ستة آلاف ومية تسعة وتمانين", "أربعة آلاف", "عشرة آلاف",
               "خمسة وعشرين ألف", "خمسين ألف", "مية ألف", "14%", "support@madeinegyptgate.com", "01279188996", "3,000", "1,380",
               "1,546", "91 مصنع", "26 ألف"],
}
# tool update: what may differ from the read
TOOL_ADDED = ["page", "limit", "market"]
TOOL_CHANGED = ["governorate.description"]
BRACKET = re.compile(r"\[[^\]\n]*\]")


def sha(t): return hashlib.sha256(t.encode("utf-8")).hexdigest()
def u16(t): return len(t.encode("utf-16-le")) // 2
def line_of(t, i): return t.count("\n", 0, i) + 1
def read(p): return open(p, encoding="utf-8", newline="").read()
def write(p, t):
    with open(p, "w", encoding="utf-8", newline="") as f: f.write(t)


def occurrences(text, s):
    n, i = 0, text.find(s)
    while i >= 0: n += 1; i = text.find(s, i + 1)
    return n


def tag_spans(key, t):
    """[start, end) of the emotion-tag spans by headings (robust to the expressions round's renamed headings)."""
    def tail(*heads):
        for h in heads:
            for form in ("\n" + h + "\n", "\n" + h + " ("):
                i = t.find(form)
                if i >= 0: return (i + 1, len(t))
        raise SystemExit("%s: no emotion-tag heading (%s) found" % (key, " / ".join(heads)))
    if key == "janna-ar": return [tail("# تاجات المشاعر", "# STYLE CUES")]
    if key == "janna-en": return [tail("# EMOTION TAGS", "# STYLE CUES")]
    spans = []
    a = t.find("\n# قواعد الكلام\n")
    if a < 0: raise SystemExit("bassem: no «# قواعد الكلام» section")
    b = t.find("\n# ", a + 1)
    pos, cur = a + 1, None
    for ln in t[a + 1:b].split("\n"):
        if ln.startswith("- ") and ("STYLE CUES" in ln or "تاجات" in ln or "التاجات" in ln):
            cur = [pos, pos + len(ln)]; spans.append(cur)
        elif cur is not None and ln.startswith("  - "):
            cur[1] = pos + len(ln)          # the cue guide's indented sub-bullets belong to it
        else:
            cur = None
        pos += len(ln) + 1
    if not spans: raise SystemExit("bassem: no tags bullet in «# قواعد الكلام»")
    return [tuple(s) for s in spans] + [tail("# STYLE CUES")]


def expr_spans(key, t, expr):
    """the expressions round's own spans, in their old or their new state; [] when no --expr"""
    out = []
    for r in (expr or {}).get(key, []):
        no, nn = occurrences(t, r["old"]), occurrences(t, r["new"]) if r["new"] else 0
        if no == 1: s = t.index(r["old"]); out.append((s, s + len(r["old"]), r["id"] + " (old)"))
        elif nn == 1: s = t.index(r["new"]); out.append((s, s + len(r["new"]), r["id"] + " (new)"))
        else: raise SystemExit("%s: the expressions round's span %s is in neither its old nor its new state (old ×%d, new ×%d)" % (key, r["id"], no, nn))
    return out


def protected_spans(key, t, expr):
    return [(s, e, "tags") for s, e in tag_spans(key, t)] + expr_spans(key, t, expr)


def apply(key, text, reps, expr):
    spans = []
    for r in reps:
        n = occurrences(text, r["old"])
        if n != 1: raise SystemExit("%s %s: `old` occurs %d times (must be exactly once)" % (key, r["id"], n))
        s = text.index(r["old"]); spans.append((s, s + len(r["old"]), r))
    spans.sort(key=lambda x: x[0])
    for (s1, e1, r1), (s2, e2, r2) in zip(spans, spans[1:]):
        if s2 < e1: raise SystemExit("%s: %s and %s overlap" % (key, r1["id"], r2["id"]))
    prot = protected_spans(key, text, expr)
    for s, e, r in spans:
        for ps, pe, what in prot:
            if s < pe and ps < e:
                raise SystemExit("%s %s overlaps a protected span (%s, lines %d-%d)" % (key, r["id"], what, line_of(text, ps), line_of(text, pe)))
    out, pos = [], 0
    for s, e, r in spans:
        out.append(text[pos:s]); out.append(r["new"]); pos = e
    out.append(text[pos:])
    return "".join(out), spans, prot


def section(t, head):
    i = t.find("\n" + head + "\n")
    if i < 0: return None
    j = t.find("\n# ", i + 1)
    return t[i + 1: j + 1 if j >= 0 else len(t)]


def verify(key, old, new, spans, prot):
    """the new text, read back from disk, is the record with exactly these spans replaced and nothing else"""
    pos_o, pos_n = 0, 0
    for s, e, r in spans:
        seg = old[pos_o:s]
        if new[pos_n:pos_n + len(seg)] != seg: raise SystemExit("%s: text before %s differs" % (key, r["id"]))
        pos_n += len(seg)
        if new[pos_n:pos_n + len(r["new"])] != r["new"]: raise SystemExit("%s: %s not found at its place" % (key, r["id"]))
        pos_n += len(r["new"]); pos_o = e
    if new[pos_n:] != old[pos_o:]: raise SystemExit("%s: text after the last replacement differs" % key)
    ol, nl = old.split("\n"), new.split("\n")
    span_lines = [(line_of(old, s), line_of(old, max(s, e - 1))) for s, e, r in spans]
    hunks = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ol, nl, autojunk=False).get_opcodes():
        if tag == "equal": continue
        lo, hi = i1 + 1, max(i1 + 1, i2)
        ok = any(a <= lo and hi <= b + 1 for a, b in span_lines)
        hunks.append({"op": tag, "old_lines": [i1 + 1, i2], "new_lines": [j1 + 1, j2], "inside_a_replacement": ok})
        if not ok: raise SystemExit("%s: a diff hunk (old lines %d-%d) is outside every replacement" % (key, i1 + 1, i2))
    for ps, pe, what in prot:
        if occurrences(new, old[ps:pe]) != 1: raise SystemExit("%s: protected span %s (lines %d-%d) changed" % (key, what, line_of(old, ps), line_of(old, pe)))
    # content
    c = {}
    for s, e, r in spans:
        if "[" in r["new"] or "]" in r["new"]: raise SystemExit("%s %s: square bracket in the new text" % (key, r["id"]))
    if sorted(BRACKET.findall(new)) != sorted(BRACKET.findall(old)): raise SystemExit("%s: the bracket tokens changed" % key)
    c["no_new_brackets"] = True
    if u16(new) - len(new) != u16(old) - len(old): raise SystemExit("%s: a character outside the BMP was added or removed" % key)
    c["astral_characters"] = u16(new) - len(new)
    if old.endswith("\n") != new.endswith("\n"): raise SystemExit("%s: the final newline changed" % key)
    c["final_newline_kept"] = True
    so, sn = section(old, FACTS_HEAD[key]), section(new, FACTS_HEAD[key])
    if so is None or so != sn: raise SystemExit("%s: the anchored facts block «%s» changed or is missing" % (key, FACTS_HEAD[key]))
    c["facts_block_identical"] = FACTS_HEAD[key]
    counts = {}
    for p in PROTECTED[key]:
        a, b = old.count(p), new.count(p)
        if a != b: raise SystemExit("%s: protected string %r: %d → %d occurrences" % (key, p, a, b))
        counts[p] = a
    c["protected_string_counts"] = counts
    return hunks, c


def sync_check(key, old_path, new_path, expr_dir):
    script = os.path.normpath(os.path.join(expr_dir or "", "..", "work", "check_sync.mjs")) if expr_dir else ""
    node = shutil.which("node")
    if not node or not script or not os.path.exists(script): return {"skipped": "node or check_sync.mjs missing"}
    cmd = [node, "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
           "--import", os.path.join(REPO, "worker", "test", "json-loader.mjs"), script, SYNC_KIND[key], old_path, new_path]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    try: r = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: return {"ok": False, "error": (p.stderr or p.stdout)[-400:]}
    if not r.get("ok"): raise SystemExit("%s: the Worker's price sync places its block differently in the new text: %s" % (key, json.dumps(r)))
    return r


def run(live, out, reps_all, expr, expr_dir, write_files=True, quiet=False, do_sync=True):
    plan = {}
    for key in KEYS:
        rec = os.path.join(live, key + ".systemPrompt.md")
        old = read(rec)
        new, spans, prot = apply(key, old, reps_all[key], expr)
        path = os.path.join(out, key + ".new.md")
        if write_files:
            write(path, new)
            new = read(path)
            d = difflib.unified_diff(old.split("\n"), new.split("\n"), "live/%s.systemPrompt.md" % key, "new/%s.new.md" % key, lineterm="", n=0)
            write(os.path.join(out, key + ".diff"), "\n".join(d) + "\n")
        hunks, content = verify(key, old, new, spans, prot)
        sync = sync_check(key, rec, path, expr_dir) if (do_sync and write_files) else {"skipped": "--no-sync-check"}
        net = len(new) - len(old)
        plan[key] = {
            "persona_id": PERSONA[key], "record": rec, "record_is_the_known_live_text": sha(old) == LIVE_SHA[key],
            "updatedAt_read": READ_UPDATED_AT[key],
            "old": {"sha256": sha(old), "code_points": len(old), "utf16_units": u16(old), "utf8_bytes": len(old.encode("utf-8"))},
            "new": {"sha256": sha(new), "code_points": len(new), "utf16_units": u16(new), "utf8_bytes": len(new.encode("utf-8")), "file": path},
            "net_growth_code_points": net, "net_growth_utf16_units": u16(new) - u16(old),
            "replacement_count": len(reps_all[key]),
            "replacements": [{"id": r["id"], "why": r["why"], "old_lines": [line_of(old, s), line_of(old, max(s, e - 1))],
                              "old_code_points": len(r["old"]), "new_code_points": len(r["new"]), "delta": len(r["new"]) - len(r["old"])} for s, e, r in spans],
            "protected_spans_old_lines": [{"what": w, "lines": [line_of(old, ps), line_of(old, pe)]} for ps, pe, w in prot],
            "protected_spans_untouched": True, "only_replaced_spans_differ": True, "diff_hunks": hunks,
            "content_checks": content, "price_sync": sync,
        }
        if not quiet:
            print("%-8s %2d replacements  %d → %d code points (%+d), %d → %d UTF-16 units  sha256 %s  %d hunks inside replacements; "
                  "protected spans untouched; price sync %s"
                  % (key, len(reps_all[key]), len(old), len(new), net, u16(old), u16(new), sha(new)[:16], len(hunks), sync.get("ok", sync.get("skipped"))))
    return plan


def apply_expr(text, reps, key):
    for r in reps:
        if occurrences(text, r["old"]) != 1: raise SystemExit("reverse order: %s %s old occurs %d times in this patch's output" % (key, r["id"], occurrences(text, r["old"])))
        text = text.replace(r["old"], r["new"], 1)
    return text


def selftest(live, reps_all, expr, expr_dir, out):
    res = {}
    # (1) stand-ins for the tag spans
    tmp = os.path.join(out, "selftest", "standin"); os.makedirs(tmp, exist_ok=True)
    for key in KEYS:
        t = read(os.path.join(live, key + ".systemPrompt.md"))
        for i, (ts, te) in enumerate(sorted(tag_spans(key, t), reverse=True)):
            mark = ("- التاجات: «EXPRESSIONS-ROUND-MARKER-%d»" % i) if key == "bassem" and t[ts:te].startswith("- ") else ("# STYLE CUES\nEXPRESSIONS-ROUND-MARKER-%d\n" % i)
            t = t[:ts] + mark + t[te:]
        write(os.path.join(tmp, key + ".systemPrompt.md"), t)
    run(tmp, tmp, reps_all, None, None, write_files=True, quiet=True, do_sync=False)
    for key in KEYS:
        if "EXPRESSIONS-ROUND-MARKER-0" not in read(os.path.join(tmp, key + ".new.md")): raise SystemExit("selftest: %s lost the stand-in tag span" % key)
    res["standin"] = "ok: the patch applies on stand-in tag spans and keeps them (%s)" % tmp
    # (2) the real expressions round, both orders. Its texts are built here from ITS replacements.json applied to the same records
    #     (its .new.md files can lag behind its replacements.json while that round is being revised)
    if not expr:
        res["expressions_round"] = "skipped: no --expr replacements.json"
        return res
    fwd = os.path.join(out, "selftest", "expr-first"); os.makedirs(fwd, exist_ok=True)
    for key in KEYS:
        write(os.path.join(fwd, key + ".systemPrompt.md"), apply_expr(read(os.path.join(live, key + ".systemPrompt.md")), expr[key], key))
    run(fwd, fwd, reps_all, expr, expr_dir, write_files=True, quiet=True, do_sync=False)
    rev = os.path.join(out, "selftest", "patch-first"); os.makedirs(rev, exist_ok=True)
    combined = {}
    for key in KEYS:
        both = apply_expr(read(os.path.join(out, key + ".new.md")), expr[key], key)
        write(os.path.join(rev, key + ".new.md"), both)
        a = read(os.path.join(fwd, key + ".new.md"))
        if a != both: raise SystemExit("selftest: %s differs between the two orders" % key)
        combined[key] = {"sha256": sha(a), "code_points": len(a), "utf16_units": u16(a)}
    res["expressions_round"] = "ok: both orders give byte-identical texts (%s, %s)" % (fwd, rev)
    res["combined_with_expressions_round"] = combined
    res["expressions_round_replacements"] = {"file": os.path.join(expr_dir, "replacements.json"), "sha256": sha(read(os.path.join(expr_dir, "replacements.json")))}
    # the expressions round's own script (its content checks) on this patch's outputs, compared with the same script on the records
    script = os.path.join(expr_dir, "apply_patch.py")
    if os.path.exists(script):
        def their(bases, tag):
            eo = os.path.join(out, "selftest", tag); os.makedirs(eo, exist_ok=True)
            cmd = [sys.executable, "-I", script, "--out", eo, "--no-sync-check"] + sum([["--base", "%s=%s" % (k, bases[k])] for k in KEYS], [])
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            return p.returncode, (p.stderr or p.stdout).strip()[-600:], eo
        rc0, msg0, _ = their({k: os.path.join(live, k + ".systemPrompt.md") for k in KEYS}, "expr-script-on-records")
        rc1, msg1, eo = their({k: os.path.join(out, k + ".new.md") for k in KEYS}, "expr-script-on-patch")
        if rc0 != 0:
            res["expr_script_on_patch"] = "not conclusive: its own script fails on the plain records too (that round is being revised): " + msg0
        elif rc1 != 0:
            raise SystemExit("selftest: the expressions round's own script refuses this patch's outputs:\n" + msg1)
        else:
            same = all(read(os.path.join(eo, k + ".new.md")) == read(os.path.join(fwd, k + ".new.md")) for k in KEYS)
            if not same: raise SystemExit("selftest: the expressions round's own script gives other texts than both orders here")
            res["expr_script_on_patch"] = "ok: its content checks pass on this patch's outputs and give the same texts (%s)" % eo
    return res


def tool_check(plan_dir):
    tu, tr, rd = (os.path.join(HERE, f) for f in ("tool-update.json", "tool-rollback.json", "tool-29fd5087.read.json"))
    if not (os.path.exists(tu) and os.path.exists(rd)): return {"skipped": "tool-update.json or tool-29fd5087.read.json missing"}
    t, r = json.load(open(tu, encoding="utf-8")), json.load(open(rd, encoding="utf-8"))
    errs = []
    for k in ("id", "name", "disableInterruptions"):
        if t.get(k) != r.get(k): errs.append("%s differs" % k)
    if t.get("expectedUpdatedAt") != r.get("updatedAt"): errs.append("expectedUpdatedAt is not the read's updatedAt")
    if len(t["description"]) > 1024: errs.append("description has %d characters (max 1024)" % len(t["description"]))
    tc, rc = t["config"], r["config"]
    for k in ("url", "method", "awaitResponse"):
        if tc.get(k) != rc.get(k): errs.append("config.%s differs" % k)
    if set(tc) - {"url", "method", "awaitResponse", "parameters"} or "headers" in rc: errs.append("unexpected config keys")
    tp, rp = tc["parameters"], rc["parameters"]
    if tp.get("type") != rp.get("type") or tp.get("required") != rp.get("required"): errs.append("parameters.type/required differ")
    props_t, props_r = tp["properties"], rp["properties"]
    if sorted(set(props_t) - set(props_r)) != sorted(TOOL_ADDED): errs.append("added properties are %s" % sorted(set(props_t) - set(props_r)))
    if set(props_r) - set(props_t): errs.append("a property was dropped")
    for name, pr in props_r.items():
        pt = props_t.get(name, {})
        for k in set(pr) | set(pt):
            if pr.get(k) != pt.get(k) and "%s.%s" % (name, k) not in TOOL_CHANGED: errs.append("%s.%s differs from the read" % (name, k))
    # the added properties = Bassem's copy (anam/tools.create.json) in type / bounds / enum, the market enum = the Worker's MARKETS
    try:
        idx = open(os.path.join(REPO, "worker", "src", "index.js"), encoding="utf-8").read()
        markets = json.loads(re.search(r"export const MARKETS = (\[[^\]]*\]);", idx).group(1).replace("'", '"'))
        if props_t["market"]["enum"] != markets: errs.append("market enum differs from the Worker's MARKETS %s" % markets)
    except Exception as e: errs.append("could not read MARKETS: %s" % e)
    try:
        create = json.load(open(os.path.join(REPO, "anam", "tools.create.json"), encoding="utf-8"))
        def find(o):
            if isinstance(o, dict):
                if o.get("name") == "janna_lookup": return o
                for v in o.values():
                    x = find(v)
                    if x: return x
            if isinstance(o, list):
                for v in o:
                    x = find(v)
                    if x: return x
        b = find(create)
        bp = b and json.dumps(b, ensure_ascii=False)
        bprops = (b.get("config") or b.get("parameters") or b).get("parameters", b.get("parameters", {})).get("properties", {}) if b else {}
        for name in TOOL_ADDED:
            src = bprops.get(name, {})
            for k in ("type", "minimum", "maximum", "enum"):
                if src.get(k) != props_t[name].get(k): errs.append("%s.%s differs from Bassem's copy in anam/tools.create.json" % (name, k))
    except Exception as e: errs.append("could not compare with anam/tools.create.json: %s" % e)
    rb = json.load(open(tr, encoding="utf-8")) if os.path.exists(tr) else None
    if not rb or rb.get("description") != r["description"] or rb.get("config") != rc: errs.append("the rollback is not the read")
    if errs: raise SystemExit("tool-update.json: " + "; ".join(errs))
    return {"file": tu, "tool": t["id"], "expectedUpdatedAt": t["expectedUpdatedAt"], "description_chars": len(t["description"]),
            "description_max": 1024, "properties": list(props_t), "added": TOOL_ADDED, "changed": TOOL_CHANGED,
            "masked_values_sent_back_unchanged": "section.enum (7 × ••••): anam_tool_update keeps the stored values (factories, suppliers, products, tenders, rfqs, offers, cities)",
            "equals_read_except_added_and_changed": True, "rollback_file": tr, "rollback_equals_read": True}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", default=os.path.join(REPO, "anam", "live"))
    ap.add_argument("--out", default=HERE)
    ap.add_argument("--replacements", default=os.path.join(HERE, "replacements.json"))
    ap.add_argument("--expr", default=os.path.normpath(os.path.join(HERE, "..", "..", "expr", "design")))
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--no-sync-check", action="store_true")
    a = ap.parse_args()
    reps_all = json.load(open(a.replacements, encoding="utf-8"))
    expr_file = os.path.join(a.expr, "replacements.json") if a.expr else ""
    expr = json.load(open(expr_file, encoding="utf-8")) if expr_file and os.path.exists(expr_file) else None
    if not expr: print("note: no expressions-round replacements.json at %s: tag spans protected by headings only" % a.expr)
    plan = run(a.live, a.out, reps_all, expr, a.expr if expr else None, do_sync=not a.no_sync_check)
    if a.selftest:
        st = selftest(a.live, reps_all, expr, a.expr if expr else None, a.out)
        for k, v in st.items(): print("selftest", k + ":", v if isinstance(v, str) else json.dumps(v))
        plan["selftest"] = st
    plan["tool_update_29fd5087"] = tool_check(a.out)
    print("tool-update.json:", "ok" if plan["tool_update_29fd5087"].get("equals_read_except_added_and_changed") else plan["tool_update_29fd5087"])
    plan["apply_note"] = ("Numbers above are this patch alone on top of the records in `record`. The expressions round replaces only its own "
                          "spans (protected here in their old or new state); run this script with --live <folder holding the texts after "
                          "that round> to build the combined texts (selftest: both orders give the same bytes), then write each persona with "
                          "systemPrompt only and expectedUpdatedAt = the updatedAt read just before. Bassem's prompt is trimmed in API reads: "
                          "check the trim total (UTF-16 units) and the visible start instead of a sha256. Apply the janna_lookup update first.")
    json.dump(plan, open(os.path.join(a.out, "plan.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", os.path.join(a.out, "plan.json"))


if __name__ == "__main__":
    main()
