#!/usr/bin/env python3
"""Facial-expression round («تعابير وشها عايزه تتظبط مع سياق الكلام», 2026-11-20), final version after the three reviews: build the
three new live prompts from the anam/live records with the exact replacements of replacements.json, prove that nothing else changed,
and write plan.json. dynamicDirectorNotes is NOT sent in this round (review anam, blocker): the writes carry systemPrompt and
directorNotes only.

Read-only for the repository and for Anam: it reads anam/live/*.systemPrompt.md and writes only next to this script.

    python3 -I apply_patch.py                       # the records must have the live sha256 of 2026-11-20 (table EXPECTED)
    python3 -I apply_patch.py --base janna-ar=/path/current.txt
                                                    # rebuild on a text that is live by then (e.g. after the Worker's price sync);
                                                    # every old string must still occur exactly once in it
    python3 -I apply_patch.py --no-sync-check       # skip the Node run of the Worker's price-sync code

Outputs: <persona>.new.md (the full new prompt, byte for byte what to send), diffs/<persona>.diff (unified diff, by line), plan.json.
"""
import argparse, difflib, hashlib, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = "/home/user/madeinegyptgate-git"
LIVE = os.path.join(REPO, "anam", "live")
SYNC = os.path.join(HERE, "..", "work", "check_sync.mjs")

EXPECTED = {
    "janna-ar": {"name": "Janna AR", "id": "5f06d835-22cc-4460-b412-84cefa9e565b", "sync_kind": "janna_ar",
                 "sha256": "34453d59217ecdc297b3cc8dfb38ee376220f5f44285293c5bc321198eb327f1",
                 "updatedAt": "2026-11-20T09:30:52.047Z",
                 "directorNotes_live": {"presetStyle": "warm", "expressivity": 0.7}, "dynamicDirectorNotes_live": True,
                 "heading_changes": {"# تاجات المشاعر": "# تاجات المشاعر (وشّك بيمشي مع كلامك)"}, "order": 1},
    "janna-en": {"name": "Janna EN", "id": "e5101653-65b4-44a6-85e5-ec2e78f82685", "sync_kind": "janna_en",
                 "sha256": "f2cbd0c36fc8891da136099cd92bae98d5370fca8014ff651e85fd482d6da680",
                 "updatedAt": "2026-11-20T09:30:55.090Z",
                 "directorNotes_live": {"presetStyle": "warm", "expressivity": 0.7}, "dynamicDirectorNotes_live": True,
                 "heading_changes": {"# EMOTION TAGS": "# EMOTION TAGS (your face follows your words)"}, "order": 2},
    "bassem":   {"name": "Bassem", "id": "19ef9078-5252-42a4-bbdf-9a3c4a38a4be", "sync_kind": "bassem",
                 "sha256": "fadcad2a6fec3f8cd6f165e40dcfe0425a7c5e3b46cedcf10e722c9a4f802b15",
                 "updatedAt": "2026-11-20T09:30:58.146Z",
                 "directorNotes_live": {"presetStyle": "warm", "expressivity": 0.55}, "dynamicDirectorNotes_live": True,
                 "heading_changes": {}, "order": 2},
}
# What this round sends (reasons in rationale.md). dynamicDirectorNotes is not sent: it stays as it is live (true on all three).
DIRECTOR_NEW = {"presetStyle": "warm", "expressivity": 0.5}
FALLBACK = {"presetStyle": "warm", "expressivity": 0.4}     # step 2 of the fallback (rationale.md section 4); step 1 is a prompt edit

ALLOWED = ["[warm]", "[happy]", "[curious]", "[supportive]", "[concerned]"]
BANNED = ["[sad]", "[angry]", "[distressed]", "[playful]", "[surprised]", "[laughter]", "[neutral]",
          "[smile]", "[laugh]", "[support]", "[gentle]", "[thought]"]
ALLOWED_LINE = "You may use only these cue tags: " + ", ".join(ALLOWED) + "."
OVERRIDE_START = "These rules, together with the "
OVERRIDE_END = ("replace any other cue list or cue instructions, including any other # STYLE CUES section: start every reply with a tag, "
                "never use [laughter], and never write \"um\" or «اممم», runs of exclamation marks, or laughter such as haha, hehe or ههه.")
FRAMES = ("Blocks the platform adds after this section are framed by lines in square brackets; those frames are not cue tags: never "
          "copy them or write anything like them.")
EXAMPLES = {"janna-ar": 4, "janna-en": 5, "bassem": 4}      # quoted example utterances in STYLE CUES (one per line, each starts with "[)
BRACKET = re.compile(r"\[[^\]\n]*\]")


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def u16(s):
    return len(s.encode("utf-16-le")) // 2


def metrics(s):
    return {"sha256": sha(s), "code_points": len(s), "utf16_units": u16(s), "lines": s.count("\n"),
            "ends_with_newline": s.endswith("\n")}


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def headings(s):
    return [l for l in s.split("\n") if l.startswith("# ")]


def line_span(text, start, end):
    """0-based line numbers [first, last] covered by text[start:end] (end exclusive; an end right after a newline stays on its line)."""
    first = text.count("\n", 0, start)
    last = text.count("\n", 0, max(start, end - 1))
    if end == len(text) and text.endswith("\n"):
        last = text.count("\n")          # a span that runs to EOF also owns the empty element after the final newline
    return first, last


def apply(base, reps):
    spans = []
    for r in reps:
        n = base.count(r["old"])
        if n != 1:
            raise SystemExit("%s: its old string occurs %d times (must be exactly once)" % (r["id"], n))
        i = base.index(r["old"])
        spans.append((i, i + len(r["old"]), r))
    spans.sort(key=lambda t: t[0])
    for (a0, a1, ra), (b0, b1, rb) in zip(spans, spans[1:]):
        if b0 < a1:
            raise SystemExit("%s and %s overlap" % (ra["id"], rb["id"]))
    out, pos, new_spans = [], 0, []
    for s0, s1, r in spans:
        out.append(base[pos:s0])
        start_new = sum(len(x) for x in out)
        out.append(r["new"])
        new_spans.append((start_new, start_new + len(r["new"]), r))
        pos = s1
    out.append(base[pos:])
    return "".join(out), spans, new_spans


def verify_only_spans(base, new, spans, new_spans):
    """Independent proof that only the replaced spans differ: (1) the frames (text outside the spans) are identical; (2) a line diff
    changes only lines that the spans touch; (3) each new string occurs exactly once in the new text."""
    report = {}
    frame_old, frame_new, pos = [], [], 0
    for s0, s1, _ in spans:
        frame_old.append(base[pos:s0]); pos = s1
    frame_old.append(base[pos:])
    pos = 0
    for r in [t[2] for t in spans]:
        n = new.count(r["new"])
        if n != 1:
            raise SystemExit("%s: its new string occurs %d times in the result (cannot prove the frame)" % (r["id"], n))
    for s0, s1, _ in new_spans:
        frame_new.append(new[pos:s0]); pos = s1
    frame_new.append(new[pos:])
    if frame_old != frame_new:
        raise SystemExit("the text outside the replaced spans differs")
    report["frames_identical"] = True
    report["frame_segments"] = len(frame_old)
    old_lines, new_lines = base.split("\n"), new.split("\n")
    old_ok, new_ok = set(), set()
    for s0, s1, _ in spans:
        a, b = line_span(base, s0, s1); old_ok.update(range(a, b + 1))
    for s0, s1, _ in new_spans:
        a, b = line_span(new, s0, s1); new_ok.update(range(a, b + 1))
    bad = []
    sm = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    changed_old, changed_new = 0, 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        changed_old += i2 - i1; changed_new += j2 - j1
        if any(i not in old_ok for i in range(i1, i2)) or any(j not in new_ok for j in range(j1, j2)):
            bad.append((tag, i1 + 1, i2, j1 + 1, j2))
    if bad:
        raise SystemExit("the line diff changes lines outside the replaced spans: %r" % bad)
    report["line_diff_only_in_spans"] = True
    report["lines_changed_old"] = changed_old
    report["lines_changed_new"] = changed_new
    return report


def content_checks(name, base, new):
    c = {}
    toks = BRACKET.findall(new)
    odd = sorted(set(t for t in toks if t not in ALLOWED + BANNED + ["[]"]))
    if odd:
        raise SystemExit("%s: bracketed text that is not a cue tag: %r" % (name, odd))
    c["bracket_tokens_only_tags"] = True
    c["placeholders_removed"] = sorted(set(t for t in BRACKET.findall(base) if t not in ALLOWED + BANNED + ["[]"]) - set(toks))
    if new.count(ALLOWED_LINE) != 1:
        raise SystemExit("%s: the allowed-tags line is missing or repeated" % name)
    c["allowed_list"] = ALLOWED
    # [neutral] and the banned tags may appear only in the ban sentence, never in a list of allowed tags or an example
    cues = new[new.index("\n# STYLE CUES\n"):]
    examples = [l for l in cues.split("\n") if l.startswith('"[')]
    if len(examples) != EXAMPLES[name] or any(l for l in new.split("\n") if l.startswith('"[') and l not in examples):
        raise SystemExit("%s: expected %d example lines in STYLE CUES, found %d" % (name, EXAMPLES[name], len(examples)))
    for l in examples:
        tags = BRACKET.findall(l)
        if not l.endswith('"') or l.count('"') != 2 or not l[1:].startswith(tags[0]) or len(tags) > 3 or any(t not in ALLOWED for t in tags):
            raise SystemExit("%s: example breaks the guide: %s" % (name, l))
        if l.rstrip('"').rstrip().endswith("]"):
            raise SystemExit("%s: example ends with a tag: %s" % (name, l))
    # the tool turn: its first line is the pre-tool line alone ([warm] + «ثواني…» / "One moment…"), the next line answers from the result
    i = cues.split("\n").index(examples[0])
    tool_line = cues.split("\n")[i - 1]
    if not tool_line.startswith("A tool turn (") or BRACKET.findall(examples[0]) != ["[warm]"] or not examples[0].endswith('…"'):
        raise SystemExit("%s: the tool-turn example is not a pre-tool line followed by the answer: %r" % (name, examples[:2]))
    c["examples"] = [{"tags": BRACKET.findall(l), "n": len(BRACKET.findall(l))} for l in examples]
    c["tool_turn_example_split"] = True
    if new.count(OVERRIDE_START) != 1 or new.count(OVERRIDE_END) != 1 or new.index(OVERRIDE_START) > new.index(OVERRIDE_END):
        raise SystemExit("%s: the override sentence is missing or repeated" % name)
    if new.count(FRAMES) != 1 or new.index(FRAMES) < new.index("\n# STYLE CUES\n"):
        raise SystemExit("%s: the sentence about the platform's bracket frames is missing" % name)
    c["override_and_frames"] = True
    for t in ["Stay in character", "that's unusual", "[laughter] where", "Example style:", "sparingly", "[neutral], [laughter]"]:
        if t in new:
            raise SystemExit("%s: old cue text still present: %r" % (name, t))
    c["old_cue_text_gone"] = True
    # every banned tag occurs only inside the one ban sentence of the guide, once
    for t in BANNED:
        if t != "[laughter]" and new.count(t) != 1:
            raise SystemExit("%s: banned tag %s occurs %d times (only the ban sentence may name it)" % (name, t, new.count(t)))
    c["banned_named_once"] = True
    if u16(new) - len(new) != u16(base) - len(base):
        raise SystemExit("%s: a character outside the BMP was added or removed" % name)
    c["astral_characters"] = u16(new) - len(new)
    if not new.endswith("\n"):
        raise SystemExit("%s: the final newline is gone" % name)
    return c


def sync_check(kind, old_path, new_path):
    node = shutil.which("node")
    if not node or not os.path.exists(SYNC):
        return {"skipped": "node or check_sync.mjs missing"}
    cmd = [node, "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
           "--import", os.path.join(REPO, "worker", "test", "json-loader.mjs"), SYNC, kind, old_path, new_path]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    try:
        res = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        raise SystemExit("price-sync check failed to run: %s %s" % (p.stdout[-400:], p.stderr[-400:]))
    if not res.get("ok"):
        raise SystemExit("price-sync check: %r" % res)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", default=LIVE)
    ap.add_argument("--out", default=HERE)
    ap.add_argument("--base", action="append", default=[], help="persona=path: rebuild on this text instead of the record")
    ap.add_argument("--no-sync-check", action="store_true")
    a = ap.parse_args()
    overrides = dict(x.split("=", 1) for x in a.base)
    with open(os.path.join(HERE, "replacements.json"), encoding="utf-8") as f:
        R = json.load(f)
    os.makedirs(os.path.join(a.out, "diffs"), exist_ok=True)
    # plan.json: exactly one top-level key per persona; each entry is self-contained (nothing is written by this script)
    plan = {}
    NO_CALLS = ("Only after the owner's OK, and only while no call of this persona runs: anam_session_list active=true shows none (saved-persona "
                "calls by personaId; ephemeral copies by clientLabel madeinegyptgate-janna-ar / madeinegyptgate-janna-en / "
                "madeinegyptgate-bassem-*).")
    ORDER_WHY = ("Janna AR first (the persona the owner complained about and tests; saved-persona path, where cue application is confirmed), "
                 "then the owner's test call; Janna EN and Bassem only after it passes (rationale.md section 8).")
    TEST_GATE = ("Before the next persona and before any later change: in a test call on desktop Chrome, a DIRECTOR_NOTE_CUE_APPLIED event "
                 "(MIG_LIVE_CLIENT.client.addListener(anam.AnamEvent.DIRECTOR_NOTE_CUE_APPLIED, function (e) { console.log('cue', e.cueTag); })) "
                 "for every spoken reply, and anam_session_search text '[' over the test window finds no persona message. If the "
                 "returning-visitor (ephemeral) call shows one of the five tags in its transcript, or no cue events, hold Bassem's write "
                 "(all his site calls are ephemeral) and raise it with Anam.")
    REBUILD = ("If the live text differs (e.g. the Worker's price sync wrote meanwhile): save it byte-exact and rerun "
               "python3 -I apply_patch.py --base <persona>=<file>; every old string must still occur once.")
    ok = True
    for key in ("janna-ar", "janna-en", "bassem"):
        E = EXPECTED[key]
        rec_path = os.path.join(a.live, key + ".systemPrompt.md")
        base_path = overrides.get(key, rec_path)
        base = read(base_path)
        if key not in overrides and sha(base) != E["sha256"]:
            raise SystemExit("%s: the record's sha256 is %s, expected the live %s" % (key, sha(base), E["sha256"]))
        new, spans, new_spans = apply(base, R[key])
        v = verify_only_spans(base, new, spans, new_spans)
        c = content_checks(key, base, new)
        hb, hn = headings(base), headings(new)
        hdiff = {o: n for o, n in zip(hb, hn) if o != n}
        if len(hb) != len(hn) or hdiff != E["heading_changes"]:
            raise SystemExit("%s: unexpected heading changes %r" % (key, hdiff))
        out_path = os.path.join(a.out, key + ".new.md")
        with open(out_path, "w", encoding="utf-8", newline="") as f:
            f.write(new)
        if read(out_path) != new:
            raise SystemExit("%s: the written file differs from the built text" % key)
        diff = difflib.unified_diff(base.split("\n"), new.split("\n"), "a/anam/live/%s.systemPrompt.md" % key,
                                    "b/anam/live/%s.systemPrompt.md" % key, lineterm="", n=1)
        with open(os.path.join(a.out, "diffs", key + ".diff"), "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(diff) + "\n")
        sync = {"skipped": "--no-sync-check"} if a.no_sync_check else sync_check(E["sync_kind"], base_path, out_path)
        mo, mn = metrics(base), metrics(new)
        bassem = key == "bassem"
        before = [NO_CALLS,
                  ("anam_persona_get: updatedAt = %s, the trim notice total = %d UTF-16 units, and the visible part byte-identical to the "
                   "start of the record (the API trims his prompt, so its sha256 cannot be read)" % (E["updatedAt"], mo["utf16_units"]))
                  if bassem else
                  ("anam_persona_get: updatedAt = %s and sha256(brain.systemPrompt) = %s" % (E["updatedAt"], mo["sha256"])),
                  REBUILD]
        after = [("anam_persona_get: updatedAt changed, the trim notice total = %d UTF-16 units, the visible part byte-identical to the start "
                  "of new_file (compare only the trim total and the visible part, never a fixed visible length)" % mn["utf16_units"]) if bassem else
                 ("anam_persona_get: sha256(brain.systemPrompt) = %s" % mn["sha256"]),
                 "directorNotes = %s; dynamicDirectorNotes = true (unchanged: not sent); every other field as before (name, LLM, voice, "
                 "avatar, avatarModel cara-4.1-express, toolIds, languageCode, initialMessage, voiceDetectionOptions, widget)" % json.dumps(DIRECTOR_NEW),
                 "then copy new_file over anam/live/%s.systemPrompt.md and record the round in anam/live/README.md: the write's UTC time, "
                 "updatedAt %s -> the new one, sha256 / lengths old -> new, directorNotes %s -> %s, dynamicDirectorNotes unchanged (true) "
                 "(.md only: no deploy)" % (key, E["updatedAt"], json.dumps(E["directorNotes_live"]), json.dumps(DIRECTOR_NEW))]
        plan[key] = {
            "persona": E["name"], "id": E["id"], "record": "anam/live/%s.systemPrompt.md" % key,
            "base": base_path, "new_file": os.path.normpath(out_path),
            "order": E["order"], "order_why": ORDER_WHY,
            "directorNotes": DIRECTOR_NEW, "dynamicDirectorNotes": "not sent (stays %s)" % json.dumps(E["dynamicDirectorNotes_live"]),
            "fallback": {"step1": {"what": "prompt edit: apologies move to [supportive], [concerned] stays for sympathy only",
                                   "file": "fallback/%s.fallback.md" % key, "patch": "fallback-concerned.json",
                                   "when": "the pained look comes back only on apology sentences, and the console cue log shows 'concerned' there"},
                         "step2": {"directorNotes": FALLBACK, "when": "the face is still pained, sad or exaggerated (eyes closing, drawn brows) on "
                                   "calm sentences while the console cue log shows warm or supportive applied there; send directorNotes alone"}},
            "expectedUpdatedAt": E["updatedAt"],
            "write": {"tool": "anam_persona_update",
                      "fields": {"id": E["id"], "systemPrompt": "<the bytes of new_file>", "directorNotes": DIRECTOR_NEW,
                                 "expectedUpdatedAt": "<the updatedAt just read>"},
                      "only_these_fields": True, "not_sent": ["dynamicDirectorNotes", "llmId", "voice", "avatar", "avatarModel", "toolIds",
                                                               "initialMessage", "languageCode", "voiceDetectionOptions"],
                      "before": before, "after": after,
                      "test_gate": TEST_GATE,
                      "rollback": {"systemPrompt": "<the bytes of the record: sha256 %s>" % mo["sha256"],
                                   "directorNotes": E["directorNotes_live"]}},
            "live_now": {"updatedAt": E["updatedAt"], "directorNotes": E["directorNotes_live"],
                         "dynamicDirectorNotes": E["dynamicDirectorNotes_live"], "avatarModel": "cara-4.1-express"},
            "old": mo, "new": mn,
            "net_code_points": mn["code_points"] - mo["code_points"], "net_utf16_units": mn["utf16_units"] - mo["utf16_units"],
            "replacements": len(R[key]),
            "replacement_ids": [{"id": r["id"], "old_code_points": len(r["old"]), "new_code_points": len(r["new"]),
                                 "old_lines": "%d-%d" % (line_span(base, s0, s1)[0] + 1,
                                                         min(line_span(base, s0, s1)[1], base.count("\n") - 1) + 1)}
                                for s0, s1, r in spans],
            "checks": {**v, **c, "headings_changed": hdiff, "price_sync": sync},
        }
        print("%-9s %d replacements  %6d -> %6d code points (%+d), %6d -> %6d UTF-16 units  sha256 %s…  only spans differ: %s  sync: %s"
              % (key, len(R[key]), mo["code_points"], mn["code_points"], mn["code_points"] - mo["code_points"], mo["utf16_units"],
                 mn["utf16_units"], mn["sha256"][:16], v["frames_identical"] and v["line_diff_only_in_spans"],
                 sync.get("ok", sync.get("skipped"))))
    with open(os.path.join(a.out, "plan.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", os.path.join(a.out, "plan.json"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
