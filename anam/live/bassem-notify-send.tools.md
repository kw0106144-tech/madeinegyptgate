# Bassem's tools `bassem_notify_member` and `bassem_send_email`: what is live in Anam

Written on 2026-11-21 (owner: «اه»، «ايوه بس متاخدش وقت»), one `anam_tool_update` each with `expectedUpdatedAt`, no 409. Stored as `.md` so a commit
here does not start a site deploy (`anam/**` is not in `paths-ignore` of `deploy-site.yml`, `**.md` is). The `config` blocks below are exactly what was sent
(no masked values in either tool: both are CLIENT tools). A rollback sends the «before» block back with `expectedUpdatedAt` = the «after» `updatedAt`.

## bassem_notify_member `325b182c-e5e0-42d0-a130-658919faf12f` (CLIENT)

`updatedAt` `2026-11-20T08:27:35.164Z` → `2026-11-21T22:06:40.549Z`. `disableInterruptions` false (unchanged), name and type unchanged.

- `awaitResult` false → **true**, `toolTimeoutSeconds` **5** (the prepared 8 was cut to 5 by the owner: «متاخدش وقت»). The page's SDK handler
  (`data/janna-live.js` `notifyStart`, live as `janna-live.js?v=2bca1b10`) answers synchronously «لسه بيتبعت ومااتأكدش…» before the send itself runs,
  so the wait is milliseconds; the real outcome reaches Bassem afterwards as «نتيجة «ابعتلي»» (notifyDone → tellBassem).
- `description`: the prepared text (`anam-changes.json` of fix/bassem-call-quality) was 1,335 characters, over Anam's 1,024 limit; it was shortened to
  1,006 with every rule kept (ids at most 3 / re-fetch an older one first / no invented links, amounts, dates / `message` = 2-5 line summary / WAIT, say
  only «ببعتهولك دلوقتي», never «بعت» / «اتبعت» / "sent" / the outcome line «نتيجة «ابعتلي»» / no promise of details, links or files / «ابعتهولي» for a
  draft on the screen = bassem_send_email to = me). No timeout number is mentioned in it.

### After (sent, and returned by the reply)
```json
{
 "description": "Send the member HIMSELF a short note on his registered WhatsApp and/or e-mail («ابعتلي», «على إيميلي»). Opportunities your tools returned in THIS call: put each id in `ids` exactly as returned (a bassem_intel id like rw0000000a1, or the platform tender id), at most 3; one from an earlier call: fetch it again by its id first. The platform adds details, links and, when allowed, the official file. Never write links, amounts or dates in `message` that are not in the results. `message` = the summary itself in 2-5 short lines (what was found, for whom, the next step), never a title alone. WAIT for the result: it says the note is being sent, NOT sent: say only «ببعتهولك دلوقتي», never «بعت» / «اتبعت» / \"sent\" in that reply. The real outcome reaches you shortly in a line starting «نتيجة «ابعتلي»»: only then tell him in one sentence whether it went. Do not promise details, links or files. An e-mail draft on the screen he wants for himself («ابعتهولي») is bassem_send_email with to = me, not this tool.",
 "config": {
  "awaitResult": true,
  "toolTimeoutSeconds": 5,
  "parameters": {
   "type": "object",
   "required": [
    "message"
   ],
   "properties": {
    "ids": {
     "type": "string",
     "description": "Ids of the opportunities this note is about, exactly as this call's tools returned them, comma-separated (an id may contain spaces), at most 3 (e.g. rw0000000a1,eg-tnd-003). Empty for a general note."
    },
    "channel": {
     "enum": [
      "whatsapp",
      "email",
      "both"
     ],
     "type": "string"
    },
    "message": {
     "type": "string",
     "description": "The summary/alert text in the member's language"
    }
   }
  }
 }
}
```

### Before (rollback)
```json
{
 "description": "Send the member HIMSELF a short note on his registered WhatsApp and/or e-mail («ابعتلي», «على إيميلي»): what you did together, an opportunity, a reply, a deadline. When the note is about opportunities your tools returned in THIS call, put the id of each one in `ids` exactly as returned (a bassem_intel id like rw0000000a1, or the platform tender id from janna_lookup / platform_item), at most 3; an opportunity from an earlier call: fetch it again with its tool by the id in your memory first. The platform then adds what it can from its own data: details, links and, when the source allows a download, the official file. Never write links, amounts or dates in `message` that are not in the results. Tell him you are sending it; do not promise details, links or files — the e-mail itself says what it carries, and you hear the outcome afterwards.",
 "config": {
  "awaitResult": false,
  "parameters": {
   "type": "object",
   "required": [
    "message"
   ],
   "properties": {
    "ids": {
     "type": "string",
     "description": "Ids of the opportunities this note is about, exactly as this call's tools returned them, comma-separated (an id may contain spaces), at most 3 (e.g. rw0000000a1,eg-tnd-003). Empty for a general note."
    },
    "channel": {
     "enum": [
      "whatsapp",
      "email",
      "both"
     ],
     "type": "string"
    },
    "message": {
     "type": "string",
     "description": "The summary/alert text in the member's language"
    }
   }
  }
 }
}
```

## bassem_send_email `a00e4d99-df41-4a43-8c66-39bdfa3d2495` (CLIENT)

`updatedAt` `2026-11-19T22:06:35.548Z` → `2026-11-21T22:06:43.489Z`. Only `config` was sent: the same `awaitResult` true, 25 s and the same three
parameters; the `to` description gained the word `me` (a copy to the member's own registered e-mail, `data/janna-live.js` since fix/bassem-call-quality).
The tool's own `description` is unchanged.

### After (sent, and returned by the reply)
```json
{
 "config": {
  "awaitResult": true,
  "toolTimeoutSeconds": 25,
  "parameters": {
   "type": "object",
   "properties": {
    "to": {
     "type": "string",
     "description": "Only when the member just dictated or corrected the recipient: the address as he said it (spoken forms are fine: info at x dot com · آت · دوت · أندرسكور). Never invent one. Or the single word me when he wants the e-mail himself («ابعتهولي», «على إيميلي»): a copy goes to his own e-mail registered on the platform, never to the buyer, and no deal starts."
    },
    "deal": {
     "type": "string",
     "description": "Words identifying the deal; empty = where the last draft is (its deal room, or the e-mail draft on the screen)"
    },
    "market": {
     "type": "string",
     "description": "Only when the result asked for it: the buyer's country or market as the member said it (e.g. Kenya, UAE, السعودية)"
    }
   }
  }
 }
}
```

### Before (rollback)
```json
{
 "config": {
  "awaitResult": true,
  "toolTimeoutSeconds": 25,
  "parameters": {
   "type": "object",
   "properties": {
    "to": {
     "type": "string",
     "description": "Only when the member just dictated or corrected the recipient: the address as he said it (spoken forms are fine: info at x dot com · آت · دوت · أندرسكور). Never invent one."
    },
    "deal": {
     "type": "string",
     "description": "Words identifying the deal; empty = where the last draft is (its deal room, or the e-mail draft on the screen)"
    },
    "market": {
     "type": "string",
     "description": "Only when the result asked for it: the buyer's country or market as the member said it (e.g. Kenya, UAE, السعودية)"
    }
   }
  }
 }
}
```
