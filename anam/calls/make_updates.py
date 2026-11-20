#!/usr/bin/env python3
"""Write anam/calls/updates.json: the exact Anam write field sets for the «calls» round, from build.py's outputs. Writes nothing to Anam.
usage (from the repository root): python3 -I anam/calls/build.py --trims B5,B6c,B7a,B4,B9,B7c && python3 -I anam/calls/make_updates.py"""
import hashlib, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def text(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8", newline="") as f:
        return f.read()


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


S = json.loads(text("anam/calls/build-summary.json"))
ID = {"janna-ar": "5f06d835-22cc-4460-b412-84cefa9e565b", "janna-en": "e5101653-65b4-44a6-85e5-ec2e78f82685",
      "bassem": "19ef9078-5252-42a4-bbdf-9a3c4a38a4be"}
LABEL = {"janna-ar": "Janna AR", "janna-en": "Janna EN", "bassem": "Bassem"}
EN_VDO = {"sttProvider": "anam", "endOfSpeechSensitivity": 0.45, "speechEnhancementLevel": 1,
          "silenceBeforeSkipTurnSeconds": 30, "silenceBeforeSessionEndSeconds": 180}
T6_ID, T6_UPDATED = "4c3b35f3-0590-44d7-85d1-321eeb21c79e", "2026-11-19T15:02:22.378Z"
BASSEM_UPDATED = S["built_from"]["bassem"]["updatedAt"]
WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"}
fmt = lambda n: "{:,}".format(n)

persona_updates = []
for name in ("janna-ar", "janna-en", "bassem"):
    p, src = S["personas"][name], S["built_from"][name]
    new = text(p["file"])
    assert sha(new) == p["sha256"], name
    fields = {"id": ID[name], "expectedUpdatedAt": src["updatedAt"], "systemPrompt": new}
    if name == "janna-en":
        fields["voiceDetectionOptions"] = EN_VDO
    e = {
        "persona": LABEL[name],
        "tool": "anam_persona_update",
        "fields": fields,
        "systemPrompt_file": p["file"],
        "systemPrompt_sha256": p["sha256"],
        "chars": p["chars"], "tokens_o200k": p["tokens_o200k"],
        "built_from": {"live_copy": src["file"], "sha256": src["sha256"], "chars": src["chars"], "tokens_o200k": src["tokens_o200k"],
                       "updatedAt": src["updatedAt"]},
        "edits": [x["id"] + ": " + x["what"] for x in p["edits"]],
        "rollback": {"tool": "anam_persona_update",
                     "fields": {"id": ID[name], "systemPrompt": "<the exact text of " + src["file"] + ", sha256 " + src["sha256"] + ">",
                                "expectedUpdatedAt": "<the updatedAt this write returns>"}},
    }
    if "trims" in p:
        cut, nocut, live_t = p["tokens_o200k"], p["variant_without_cuts"]["tokens_o200k"], src["tokens_o200k"]
        nt = S["bassem_notify_on_top"]
        e["edits"] += [x["id"] + ": " + x["what"] for x in p["trims"]]
        e["size_cuts"] = {
            "why": ("The limit is the LANGUAGE plan's: Anam's prompting guide says performance tends to drop once a system prompt exceeds "
                    "8,000 tokens; Bassem is already past it (%s tokens o200k live), so beyond its own section the language plan adds nothing "
                    "more to him and leaves trimming to the speed task. The three plans together would put him at %s tokens; these %s cuts are "
                    "speed change 6's «optional trims», "
                    "which its conflicts_with_multilingual #7 allows «to make room, not for speed», and bring this round to %s (%+d over live). "
                    "Only trims that do not depend on change 5 were offered (B1, B2, B6a, B6b were not); none touches a do_not section "
                    "(noise, «السؤال عن الحال» and the mishearing list, «الأمانة», «حقائق», rules 1-3, «الإيميلات», STYLE CUES). "
                    "Not applied: B8 (it drops «وماتقولهوش كنصيحة» from the web-results safety line) and B7b (rewords how an Information "
                    "Center result opens).") % (fmt(live_t), fmt(nocut), WORDS.get(len(p["trims"]), str(len(p["trims"]))), fmt(cut), cut - live_t),
            "applied": {x["id"]: x["what"] for x in p["trims"]},
            "sections": p.get("trim_sections"),
            "variant_without_cuts": p["variant_without_cuts"],
            "if_anam_bassem_notify_is_applied_too": (
                "anam/bassem-notify/prompt-changes.json (merged to main, NOT APPLIED) applies cleanly on top of this text (%d/%d found once) "
                "→ %s tokens; with the one further cut B7b on top → %s. Never B8, unless its replacement keeps «وماتقولهوش كنصيحة» (the "
                "guard against instructions inside web results).") % (nt["replaced"], nt["replaced"], fmt(nt["tokens_o200k"]),
                                                                      fmt(nt["with_B7b"]["tokens_o200k"])),
        }
    if "variant_without_PROMPT_4" in p:
        e["variant_without_PROMPT_4"] = dict(p["variant_without_PROMPT_4"], why=(
            "BARGE-IN PROMPT-4 is marked OPTIONAL in its plan: the owner decides, because he asked for detailed persuasion. "
            "This round includes it; if the owner says no, send this file's text as systemPrompt instead (same other fields)."))
    if name == "janna-en":
        e["voiceDetectionOptions_note"] = (
            "LANGUAGE plan anam_changes: sttProvider \"anam\" plus the four values read today (0.45 / 1 / 30 / 180, unchanged; "
            "the API merges this object anyway). Without it her Default provider for English (Cartesia Ink-2: en es fr hi ja only, fixed "
            "for the call) cannot follow the 🌐 switch. Tradeoff: Ink-2 is also her English turn-detection; Janna EN has had 0 sessions. "
            "Not sent: sttLanguages (anam rejects it), languageCode (stays en). After this write these are her expected values: the "
            "BARGE-IN ANAM-1 guard compares against them (never the old «no sttProvider» row of anam/live/README.md).")
        e["rollback"]["voiceDetectionOptions"] = (
            "Lab: Advanced → Voice Detection → STT Provider → Default; or by API voiceDetectionOptions null (resets to the defaults) then "
            "{endOfSpeechSensitivity:0.45, speechEnhancementLevel:1, silenceBeforeSkipTurnSeconds:30, silenceBeforeSessionEndSeconds:180}; "
            "or one write with sttProvider \"cartesia_ink_2\" (what Default resolves to for English today, pinned).")
    persona_updates.append(e)

t6_live = text("anam/calls/inputs/bassem_save_profile.description.txt")
tool_updates = [{
    "tool_name": "bassem_save_profile",
    "tool": "anam_tool_update",
    "why": "SPEED change 4 T6, which must ship with Bassem's B3 (save and search in ONE step). The live description says «before searching… "
           "Then search with it», which would contradict B3. Only the description changes: config (awaitResult true, 16 s, parameters) and "
           "disableInterruptions (false, BARGE-IN ANAM-2) are left out, so they keep their stored values.",
    "fields": {"id": T6_ID, "description": S["T6"]["new_description"], "expectedUpdatedAt": T6_UPDATED},
    "description_chars": S["T6"]["chars"],
    "live_description_sha256": sha(t6_live),
    "rollback": {"tool": "anam_tool_update", "fields": {"id": T6_ID, "description": t6_live, "expectedUpdatedAt": "<the updatedAt this write returns>"}},
}]
trims = S["personas"]["bassem"].get("trims", [])
trim_ids = ", ".join(x["id"].replace("SPEED6-", "") for x in trims)

doc = {
    "_what": "PREPARED, NOT APPLIED. Nothing here was written to Anam. Every write needs the owner's OK (anam/APPLY.md). One write per "
             "persona carries ALL of this round's prompt edits (LANGUAGE prompt_changes, BARGE-IN PROMPT-1..4, SPEED change 4), because the "
             "plans' writes share each persona's expectedUpdatedAt and only the first would succeed. The review corrections of 2026-11-20 "
             "(review_fixes) are inside the prompts.",
    "read_at": "2026-11-20, read-only: anam_persona_get 5f06d835 / e5101653 / 19ef9078 (Bassem's prompt trimmed by the API at 10,965 of "
               "24,736 chars: its visible part is byte-identical to anam/live/bassem.systemPrompt.md, same length and updatedAt), "
               "anam_tool_get 4c3b35f3.",
    "apply_order": [
        "1. The three persona writes below (Janna EN: systemPrompt and voiceDetectionOptions in ONE write) and the bassem_save_profile "
        "tool update — BEFORE deploy-site ships data/janna-live.js with the 🌐 switch: the page's LANGUAGE lines need the prompts' "
        "«# لغة الكلام» / # LANGUAGE sections, and on the English pages every Arabic choice is refused until Janna EN has sttProvider \"anam\".",
        "2. Bassem's prompt, then at once the tool update (how_to_send).",
        "3. After each write: refresh anam/live/ (README there) in one commit; for Janna EN also its voiceDetectionOptions row in "
        "anam/live/README.md and anam/APPLY.md §6.",
    ],
    "how_to_send": [
        "Re-read each persona (anam_persona_get) right before its write. If its updatedAt is the expectedUpdatedAt below, send. If not, "
        "do not send. Janna AR / EN (the read returns the whole prompt): save it as anam/live/<persona>.systemPrompt.md, put its sha256 and "
        "updatedAt into LIVE in anam/calls/build.py, and re-run build.py and make_updates.py (every find must still occur exactly once, "
        "or build.py stops).",
        "Bassem: if his updatedAt is not " + BASSEM_UPDATED + ", stop. The Anam read cuts his prompt (it showed 10,965 of 24,736 "
        "characters), so his live text cannot be taken from it, and the Worker's price sync (worker/src/acc-plans.js personaSync: after a "
        "plans change, retried hourly) can rewrite his price section on its own. Take the full live text outside the cut read: the Anam Lab "
        "(copy the system prompt), or — when only the price sync wrote — anam/live/bassem.systemPrompt.md with its price section replaced by "
        "the «after» the Control Center's persona sync shows, whose sha256 must start with the after.sha of that sync's «سجل العمليات» "
        "entry (persona.sync). Save it as anam/live/bassem.systemPrompt.md, put its sha256 and updatedAt into LIVE in build.py, then "
        "re-run build.py and make_updates.py.",
        "Send `fields` exactly (anam_persona_update / anam_tool_update). Nothing else: no toolIds, no languageCode, no LLM, voice or avatar.",
        "Bassem's prompt and the bassem_save_profile tool update go together, in this order (B3 «وفي نفس الخطوة دوّر بيه» contradicts the "
        "live tool text «before searching… Then search with it»): 1) Bassem's anam_persona_update; 2) at once the tool's anam_tool_update "
        "(expectedUpdatedAt " + T6_UPDATED + "). On a 409 for the tool: anam_tool_get, apply the two t6 pairs of "
        "anam/calls/inputs/pairs.json to its live description (each must occur once) and retry with its new updatedAt. If the tool update "
        "cannot be written, roll Bassem back: systemPrompt = the text of anam/live/bassem.systemPrompt.md, expectedUpdatedAt = the "
        "updatedAt his write returned.",
        "After each write: record the new live text and its updatedAt in anam/live/ (README there; Janna EN: also her voiceDetectionOptions "
        "row there and anam/APPLY.md §6, in the same commit) and keep the 409 rule for the next writer.",
    ],
    "persona_updates": persona_updates,
    "tool_updates": tool_updates,
    "review_fixes": S["review_fixes"],
    "not_in_this_round": [
        "SPEED change 3 llm-ab (needs the owner on a call)",
        "SPEED changes 6 prompts-one-step and 7 tool-descriptions (only after change 5 is live) — except the %s size trims above (%s), "
        "which the speed plan allows on their own to make room" % (WORDS.get(len(trims), str(len(trims))), trim_ids),
        "BARGE-IN ANAM-1 (guard, no write; the conditional speechEnhancementLevel 0.8 only after ?nzdebug=1 shows missed-by-anam > 0). "
        "After this round's Janna EN write her expected voiceDetectionOptions are {sttProvider \"anam\", endOfSpeechSensitivity 0.45, "
        "speechEnhancementLevel 1, silenceBeforeSkipTurnSeconds 30, silenceBeforeSessionEndSeconds 180}: the guard compares against those, "
        "never the old «no sttProvider» row — \"restoring\" it would silently break the 🌐 switch to Arabic on the English pages. "
        "Janna AR and Bassem: as before.",
        "BARGE-IN ANAM-2 (guard, no write: every tool keeps disableInterruptions false)",
    ],
}
with open(os.path.join(ROOT, "anam", "calls", "updates.json"), "w", encoding="utf-8", newline="") as f:
    json.dump(doc, f, ensure_ascii=False, indent=1)
    f.write("\n")
# self-check: the prompts inside updates.json are byte-identical to the files
d = json.loads(text("anam/calls/updates.json"))
for e in d["persona_updates"]:
    assert sha(e["fields"]["systemPrompt"]) == e["systemPrompt_sha256"] == sha(text(e["systemPrompt_file"])), e["persona"]
    assert set(e["fields"]) <= {"id", "expectedUpdatedAt", "systemPrompt", "voiceDetectionOptions"}, e["persona"]
    print("%-8s fields %s  sha256 %s  %d chars  %d tokens" % (e["persona"], sorted(e["fields"]), e["systemPrompt_sha256"][:16] + "…",
                                                               e["chars"], e["tokens_o200k"]))
for t in d["tool_updates"]:
    print("%-8s fields %s  %d chars" % (t["tool_name"], sorted(t["fields"]), t["description_chars"]))
print(d["persona_updates"][2]["size_cuts"]["if_anam_bassem_notify_is_applied_too"])
print(d["not_in_this_round"][1])
