#!/usr/bin/env python3
"""python3 apply_prompt.py live.txt prompt-changes.json > new.txt
live.txt = brain.systemPrompt exactly as anam_persona_get returns it today (saved by the person applying). Every `current` line must occur
exactly once and every `after` anchor exactly once after the replacements; otherwise nothing is printed and the exit code is 1."""
import json, sys, hashlib
live = open(sys.argv[1], encoding="utf-8").read()
ch = json.load(open(sys.argv[2], encoding="utf-8"))
s, bad = live, []
for r in ch["replace"]:
    n = s.count(r["current"])
    if n != 1: bad.append("replace: %d× %r" % (n, r["current"][:60])); continue
    s = s.replace(r["current"], r["new"])
for a in ch["add"]:
    n = s.count(a["after"])
    if n != 1: bad.append("add after: %d× %r" % (n, a["after"][:60])); continue
    if a["text"] in s: bad.append("already there: %r" % a["text"][:60]); continue
    s = s.replace(a["after"], a["after"] + "\n" + a["text"])
if bad:
    sys.stderr.write("NOT APPLIED — the live prompt is not the one these changes were made for:\n  " + "\n  ".join(bad) + "\n"); sys.exit(1)
sys.stderr.write("ok: %d replaced, %d added; live sha256 %s → new sha256 %s (%d → %d chars)\n" % (len(ch["replace"]), len(ch["add"]), hashlib.sha256(live.encode()).hexdigest()[:16], hashlib.sha256(s.encode()).hexdigest()[:16], len(live), len(s)))
sys.stdout.write(s)
