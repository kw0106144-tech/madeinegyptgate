#!/usr/bin/env python3
"""Build the new systemPrompts of Janna AR, Janna EN and Bassem for the «calls» round (any language + barge-in + speak-first) on the
exact LIVE texts in anam/live/, from the pairs in anam/calls/inputs/pairs.json. Read-only towards Anam: nothing is sent anywhere.
Writes only into anam/calls/ (the *.new.md prompts, their variants, *.diff, SHA256SUMS, build-summary.json).

usage (from the repository root): python3 -I anam/calls/build.py [--trims none|all|<id,id,...>]
       this round: python3 -I anam/calls/build.py --trims B5,B6c,B7a,B4,B9,B7c   then   python3 -I anam/calls/make_updates.py
needs: python3 -m pip install tiktoken   (o200k token counts, the unit the plans use)

Every edit: its find must occur exactly once in the live text AND exactly once in the text it is applied to; afterwards its replace must
be in the result exactly once and the find must survive only where the replace itself carries it. Any failure stops with exit 1.
"""
import difflib, hashlib, json, os, subprocess, sys

import tiktoken

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # the repository
OUT = os.path.join(ROOT, "anam", "calls")
ENC = tiktoken.get_encoding("o200k_base")

# persona -> (live copy in the repository, its sha256, the updatedAt it was live with when read on 2026-11-20). If a persona's
# updatedAt changed since, refresh its anam/live/ file from what is really live (README there; for Bassem see anam/calls/README.md)
# and put the new sha256 and updatedAt here before building.
LIVE = {
    "janna-ar": ("anam/live/janna-ar.systemPrompt.md", "e27aaddaf72dc9eb7db291b3c36e2e24c588721966aab09442491c7a404f19ab", "2026-11-19T20:06:09.022Z"),
    "janna-en": ("anam/live/janna-en.systemPrompt.md", "ec6f60564cae740043b7853145bc40ac067e2fc2288aecadb059c4fffa100a5a", "2026-11-19T20:07:36.925Z"),
    "bassem": ("anam/live/bassem.systemPrompt.md", "85c27cbe0bf80d96b0213a47e12046248fb845bc209be45dde664f6cde329032", "2026-11-19T22:36:03.393Z"),
}
T6_LIVE = "anam/calls/inputs/bassem_save_profile.description.txt"  # the tool's live description, read 2026-11-20 (updatedAt 2026-11-19T15:02:22.378Z)
NOTIFY = "anam/bassem-notify/prompt-changes.json"  # the «ابعتلي» prompt changes (main, NOT APPLIED): must still apply on top


def die(msg):
    sys.stderr.write("STOP: " + msg + "\n")
    sys.exit(1)


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def toks(s):
    return len(ENC.encode(s))


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8", newline="") as f:
        return f.read()


def save(rel, text):
    with open(os.path.join(ROOT, rel), "w", encoding="utf-8", newline="") as f:
        f.write(text)


P = json.loads(load("anam/calls/inputs/pairs.json"))
EDITS = {p: [(e["id"], e["what"], e["find"], e["replace"]) for e in P["edits"][p]] for p in ("janna-ar", "janna-en", "bassem")}
TRIMS = P["trims_offered"]
PROTECTED = P["protected_headings"]
for f in P["review_fixes"]:  # the review corrections are inside the pairs (exported that way): each must be there
    e = [x for x in EDITS[f["persona"]] if x[0] == f["edit"]]
    if len(e) != 1 or f["to"] not in e[0][3] or f["from"] in e[0][3].replace(f["to"], ""):
        die("review fix %s (%s) is not in pairs.json" % (f["finding"], f["edit"]))


def apply(name, text, edits, live):
    report = []
    for eid, what, f, r in edits:  # pre-check on the untouched live text
        if live.count(f) != 1:
            die("%s %s: find occurs %d× in the LIVE text" % (name, eid, live.count(f)))
    for eid, what, f, r in edits:
        n = text.count(f)
        if n != 1:
            die("%s %s: find occurs %d× at application time" % (name, eid, n))
        text = text.replace(f, r, 1)
        report.append({"id": eid, "what": what, "find_chars": len(f), "replace_chars": len(r), "find_count_live": 1, "find_count_at_apply": 1})
    for eid, what, f, r in edits:  # post-checks
        if r and text.count(r) != 1:
            die("%s %s: replace text occurs %d× in the result" % (name, eid, text.count(r)))
        if text.count(f) != r.count(f):
            die("%s %s: find survives %d× (replace carries it %d×)" % (name, eid, text.count(f), r.count(f)))
    return text, report


def udiff(a, b, name):
    return "".join(difflib.unified_diff(a.splitlines(True), b.splitlines(True), fromfile="live/%s.systemPrompt" % name,
                                        tofile="new/%s.systemPrompt" % name, n=1))


def notify_changes():
    if os.path.exists(os.path.join(ROOT, NOTIFY)):
        return json.loads(load(NOTIFY))
    return json.loads(subprocess.check_output(["git", "-C", ROOT, "show", "main:" + NOTIFY]).decode())  # a branch made before its merge


def main():
    trims_arg = "none"
    if "--trims" in sys.argv:
        trims_arg = sys.argv[sys.argv.index("--trims") + 1]
    chosen = [] if trims_arg == "none" else (TRIMS if trims_arg == "all" else trims_arg.split(","))
    for k in chosen:
        if k not in TRIMS:
            die("unknown trim " + k)
    summary = {"built_from": {}, "personas": {}, "trims_offered": {k: P["trims"][k]["what"] for k in TRIMS}, "trims_applied": chosen,
               "review_fixes": P["review_fixes"]}
    results, sums = {}, []
    for name in ("janna-ar", "janna-en", "bassem"):
        path, want_sha, upd = LIVE[name]
        live = load(path)
        if sha(live) != want_sha:
            die("%s: %s sha256 %s != %s (refresh it from what is live, then LIVE in build.py)" % (name, path, sha(live), want_sha))
        summary["built_from"][name] = {"file": path, "sha256": want_sha, "chars": len(live), "tokens_o200k": toks(live), "updatedAt": upd}
        new, rep = apply(name, live, EDITS[name], live)
        info = {"edits": rep}
        if name == "bassem" and chosen:
            tr = [("SPEED6-" + k, "SPEED change 6 optional trim " + k + ": " + P["trims"][k]["what"], P["trims"][k]["find"], P["trims"][k]["replace"])
                  for k in chosen]
            for tid, _, f, _ in tr:
                for h in PROTECTED:  # a trim never starts or removes a protected heading
                    if h in f:
                        die("trim touches protected heading " + h)
                pos = new.index(f)  # ...and never sits inside a protected section (the heading above it decides)
                head = [l for l in new[:pos].split("\n") if l.startswith("# ")][-1]
                if any(head.startswith(h) for h in PROTECTED):
                    die("%s sits in protected section %s" % (tid, head))
                info.setdefault("trim_sections", {})[tid] = head
            nocuts = new
            new, rep2 = apply(name + "+trims", new, tr, live)
            info["trims"] = rep2
        if name.startswith("janna"):  # the owner's choice: the same build without PROMPT-4
            alt, _ = apply(name + "-noP4", live, [e for e in EDITS[name] if e[0] != "BARGE-P4"], live)
            rel = "anam/calls/%s.no-prompt4.new.md" % name
            info["variant_without_PROMPT_4"] = {"file": rel, "sha256": sha(alt), "chars": len(alt), "tokens_o200k": toks(alt)}
            save(rel, alt)
            sums.append((sha(alt), rel))
        if name == "bassem" and chosen:  # the same build without the cuts, for comparison / the owner's choice
            rel = "anam/calls/bassem.nocuts.new.md"
            save(rel, nocuts)
            info["variant_without_cuts"] = {"file": rel, "sha256": sha(nocuts), "chars": len(nocuts), "tokens_o200k": toks(nocuts)}
            sums.append((sha(nocuts), rel))
        if "\r" in new or new.count("\n\n\n"):
            die(name + ": stray CR or triple newline")
        if new.endswith("\n") != live.endswith("\n"):
            die(name + ": final newline changed")
        results[name] = new
        rel = "anam/calls/%s.new.md" % name
        info.update({"file": rel, "sha256": sha(new), "chars": len(new), "tokens_o200k": toks(new),
                     "delta_chars": len(new) - len(live), "delta_tokens": toks(new) - toks(live)})
        summary["personas"][name] = info
        save(rel, new)
        save("anam/calls/%s.diff" % name, udiff(live, new, name))
        sums.append((sha(new), rel))
    # the merged «ابعتلي» change set (anam/bassem-notify, NOT APPLIED) must still apply on top of the new Bassem text
    pc = notify_changes()
    s = results["bassem"]
    for r in pc["replace"]:
        if s.count(r["current"]) != 1:
            die("bassem-notify replace no longer applies once: %r" % r["current"][:60])
        s = s.replace(r["current"], r["new"], 1)
    summary["bassem_notify_on_top"] = {"applies": True, "replaced": len(pc["replace"]), "chars": len(s), "tokens_o200k": toks(s), "sha256": sha(s)}
    b7 = P["trims"]["B7b"]  # the one further cut that keeps every safety line (never B8: it drops «وماتقولهوش كنصيحة»)
    if s.count(b7["find"]) != 1:
        die("B7b no longer applies once on top of bassem + notify")
    s7 = s.replace(b7["find"], b7["replace"], 1)
    summary["bassem_notify_on_top"]["with_B7b"] = {"chars": len(s7), "tokens_o200k": toks(s7)}
    t6 = load(T6_LIVE)
    for pr in P["t6"]:
        if t6.count(pr["find"]) != 1:
            die("T6 find occurs %d× in the live tool description" % t6.count(pr["find"]))
        t6 = t6.replace(pr["find"], pr["replace"], 1)
    if len(t6) > 1024:
        die("T6 description over 1024 chars")
    summary["T6"] = {"new_description": t6, "chars": len(t6)}
    save("anam/calls/build-summary.json", json.dumps(summary, ensure_ascii=False, indent=1) + "\n")
    save("anam/calls/SHA256SUMS", "".join("%s  %s\n" % (h, os.path.basename(r)) for h, r in sorted(sums, key=lambda x: x[1])))
    for name in ("janna-ar", "janna-en", "bassem"):
        p = summary["personas"][name]
        print("%-9s %6d → %6d chars, %5d → %5d tokens (o200k), sha256 %s" % (
            name, summary["built_from"][name]["chars"], p["chars"], summary["built_from"][name]["tokens_o200k"], p["tokens_o200k"], p["sha256"]))
        for e in p["edits"] + p.get("trims", []):
            print("   ok  %-12s %s" % (e["id"], e["what"]))
        if "variant_without_PROMPT_4" in p:
            v = p["variant_without_PROMPT_4"]
            print("   variant without PROMPT-4: %d chars, %d tokens, sha256 %s" % (v["chars"], v["tokens_o200k"], v["sha256"]))
        if "variant_without_cuts" in p:
            v = p["variant_without_cuts"]
            print("   variant without the cuts: %d chars, %d tokens, sha256 %s" % (v["chars"], v["tokens_o200k"], v["sha256"]))
    b = summary["bassem_notify_on_top"]
    print("bassem + anam/bassem-notify (3 replaces) on top: %d chars, %d tokens; + B7b: %d tokens" % (b["chars"], b["tokens_o200k"], b["with_B7b"]["tokens_o200k"]))
    print("T6 description: %d chars (limit 1024)" % summary["T6"]["chars"])


if __name__ == "__main__":
    main()
