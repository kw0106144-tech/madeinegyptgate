# Facial expressions follow the words: Janna AR, Janna EN and Bassem (final design, 2026-11-20)

The owner, after a live call with Janna: «تعابير وشها عايزه تتظبط مع سياق الكلام». This is the final design of the fix, after three reviews
(Anam, language, regression; section 9). Nothing was written to Anam, to the repository or to the live site. Inputs: the three live prompt
records `anam/live/*.systemPrompt.md` (byte-identical to live), `../docs-facts.md`, `../forensics.md`, and these read-only reads: the
transcript and session record of call `8bacbfac` (the owner's test call), the session record of the ephemeral call `fc81e15d`, Bassem's
saved persona, the Director Notes docs page, the prompting guide's note on prompt size, and the Worker code that builds the calls
(`worker/src/bassem-context.js`, `janna-session.js`, `visitor.js`, `knowledge.js`, `acc-plans.js`, `data/captions.js`, `data/janna-live.js`).
The pre-review version is kept in `pre-review/`.

**In one line for the owner (Egyptian Arabic):** الرد اللي في الصورة بدأ بكلمة «[صاف]» وأنام ماتعرفهاش، فالـ٤٧ ثانية كلهم اتعرضوا بالشكل
الأساسي، على موديل أفاتار أنام نفسها بتقول إنه مش مستقر (اتغيّر قبل آخر المكالمة بثواني)، وبقوة تعبير ٠.٧ أعلى من المنصوح بيه. التعديل: كل رد
يبدأ بتاج إنجليزي من خمسة بس (دافية، مبسوطة، مهتمة، هادية ومتفهمة، متعاطفة ومعتذرة) وتاج جديد لما الإحساس يتغيّر، ومفيش زعل ولا غضب ولا
هزار ولا ضحك، وقوة التعبير ٠.٥، وإعداد «Dynamic» بتاع أنام يفضل زي ما هو.

## 1. Why her face looked pained in the screenshot turn

Reply #48 of `8bacbfac` (09:28:14, 47.3 s) is the screenshot: it opened with «[صاف]» (the rest of her words is left out of this copy). Four things were true at once:

1. **No cue at all.** «[صاف]» is not an Anam cue. Anam strips the tags it recognizes and leaves unknown ones in the transcript, which is why we
   can see it. With no recognized cue, the whole 47 s ran in the baseline style: `warm`, expressivity 0.7.
2. **An unstable avatar model.** The call started at 09:17:53 on `cara-4-latest`: "subject to change and may be unstable. We do not recommend it
   for production" (Anam, `/introduction/models`). The switch to `cara-4.1-express` landed at 09:30:52, ten seconds before the call ended.
3. **Expressivity above Anam's starting point.** "Start with the default by omitting `expressivity`, or set `0.5` when you want to be
   explicit … Higher expressivity … also increases movement, including speech-driven articulation … Very high values can look exaggerated or
   unstable" (`/personas/director-notes`). Janna ran at 0.7.
4. **Long replies that mix moods.** 60% of Janna's replies over 20 s carry bad news or an apology, an explanation and a question
   (forensics §4). Before this design, one tag (or none) had to cover all of that.

Anam's docs never mention closed eyes or drawn brows. This is the most likely combination of documented risks, not a proven cause.

## 2. What changes

| | Before (live) | After (this design) |
|---|---|---|
| Cue tags allowed | 12, including `[neutral]` (not a cue tag), `[sad]`, `[angry]`, `[distressed]`, `[playful]`, `[surprised]`, `[laughter]` | 5: `[warm]` `[happy]` `[curious]` `[supportive]` `[concerned]` |
| When to tag | "sparingly … when your mood shifts" | one at the very start of every reply, then one before each sentence where the mood changes; at most 3 per reply, and the tag on the first sentence after a tool does not count; a turn that is only a tool call gets none |
| Which tag when | nothing | a situation → tag map in the persona's own language, with Arabic feeling words next to each tag (section 3.2) |
| Examples | "[curious] Oh... that's unusual. But I like unusual. Tell me exactly what happened." | a tool turn split in two lines (before the tool / from its result), a real match, and an apology for her own mistake (Bassem: a frustrated member); Janna EN also gets one Arabic line |
| Other cue sections | nothing | "These rules … replace any other cue list or cue instructions, including any other # STYLE CUES section", which covers the hidden section Lab may append while Dynamic stays on |
| Written laughter, "um" | "Don't write haha or hehe" | never "um" or «اممم», runs of exclamation marks, haha, hehe or ههه |
| The Worker's bracket frames | nothing | "Blocks the platform adds after this section are framed by lines in square brackets; those frames are not cue tags" |
| Brackets inside spoken example lines | «[منتجه]», "[product]", «[لقبه واسمه]» | gone |
| `directorNotes` | Janna AR/EN `{warm, 0.7}`, Bassem `{warm, 0.55}` | all three `{presetStyle "warm", expressivity 0.5}` |
| `dynamicDirectorNotes` | `true` | **`true`, not sent** (section 5) |

| Persona | Code points (old → new) | UTF-16 units (old → new) | Net | sha256 old → new | Replacements | Lines changed (old → new) |
|---|---|---|---|---|---|---|
| Janna AR | 21,796 → 23,801 | 21,797 → 23,802 | +2005 | `34453d59217ecdc2…` → `b286114d09d0016f…` | 3 (AR-S lines 47-47, AR-G lines 134-135, AR-C lines 137-146) | 11 → 22 |
| Janna EN | 25,357 → 27,654 | 25,358 → 27,655 | +2297 | `f2cbd0c36fc8891d…` → `bc2b2de6f407b6a2…` | 3 (EN-S lines 42-42, EN-G lines 99-100, EN-C lines 102-111) | 11 → 23 |
| Bassem | 26,459 → 28,552 | 26,460 → 28,553 | +2093 | `fadcad2a6fec3f8c…` → `1eabb20ff5d74298…` | 3 (BA-G lines 31-31, BA-S lines 129-129, BA-C lines 160-169) | 10 → 21 |

Full hashes, lengths and checks: `plan.json`. Bassem's UTF-16 count is what Anam's trim notice shows in a read (🌐 counts 2).

Each prompt grows by about 2,000 to 2,300 characters (8 to 9%), all of it inside the cue sections. Anam sets no `systemPrompt` size limit
for Turnkey sessions; its rule of thumb is that performance "tends to drop once a system prompt exceeds 8,000 tokens", and these prompts were
already near or above that, so the growth adds roughly 600 to 700 tokens to a prompt that was already long. `apply_patch.py` proves that the
text outside the replaced spans is identical, that a line diff touches only the spans' lines, and that the Worker's anchored price sync
(`worker/src/acc-plans.js` `rewritePrompt`) still finds its section in each new prompt and makes the same (zero) changes there.
`work/verify_final.py` checks the same independently, with GNU `diff`.

## 3. The cue guide

### 3.1 The five tags, and the tags never used

| Tag | Anam's cue table | Our use |
|---|---|---|
| `[warm]` | Friendly, affectionate delivery | welcomes, wishes («دعاء»), thanks, goodbyes, summing up what the visitor said («تمام، فهمت إن…», «وصلتني التفاصيل»), silence prompts («لسه معايا؟»), «اتفضل يا فندم، سامعاك», waiting, the line before a tool («ثواني، بدوّرلك…»). Also the choice when unsure: it is the baseline preset as well |
| `[happy]` | Brighter, more positive delivery | real good news only: the result itself truly matches, or something actually done (registration or RFQ sent, e-mail sent, a deal step done) |
| `[curious]` | Attentive, questioning delivery | a question or a checking question: the name, the business, «تقصد…؟», «معلش ماسمعتش كويس», offers like «تحب أجرّب؟» |
| `[supportive]` | Calm, teaching or reassuring delivery | explanations, details, plans, help, answering a complaint («معاك حق تسأل», «فاهمة قصدك»), bad news said calmly and honestly (nothing found, not a match, «ماقدرش», no guarantee), mixed news and results that are only close. **This is the screenshot turn** |
| `[concerned]` | Sympathetic delivery | only the apology itself as its own short sentence («حقك عليّ يا فندم.»), or «ألف سلامة عليك… إيه اللي مزعلك؟» to a visitor who said they are upset or tired; whatever she says next gets its own tag |

| Never | Why |
|---|---|
| `[sad]` | "Lower-energy, sad delivery": the look the owner complained about. Bad news is said calmly, with `[supportive]` |
| `[angry]` | Firm, stern. A business persona is never angry at a visitor, even an insulting one |
| `[distressed]` | Panicked or distressed. Never fits these calls |
| `[playful]` | Anam's own use cases for the playful preset: "AI friend, companion avatar, casual host". A light moment is `[warm]` or `[happy]` |
| `[surprised]` | "More animated". It reads as over-acting in a sales or advice call; good news is `[happy]` |
| `[laughter]` | "Laughter in supported TTS providers": an audible laugh that can land on the wrong sentence. Written laughter (haha, ههه) is banned with it, because the voice would read it |
| `[neutral]` | Not a cue tag at all, only a `presetStyle` value, so writing it is an unknown tag. To come back to the baseline inside a turn, use `[warm]` |
| `[smile]`, `[laugh]`, `[support]`, `[gentle]`, `[thought]` | Not Anam cues. They are the English tags the model invented (forensics §1.1: `[smile]` 9 times, `[support]` 3, `[gentle]` 2, `[thought]` 2). `[smile]` stopped after it was banned by name on 11-18, so the names stay |

### 3.2 Placement, and why each rule is there

- **One tag at the very start of every reply, fitting its first sentence.** A reply without a recognized tag plays at baseline, which is
  exactly what happened in the screenshot turn. A first tag that is always there also leaves no slot for an improvised one. A turn that is
  only a tool call, with no words (4 Janna and 5 Bassem turns in the forensics), gets no tag, so the rule never asks for a lone tag.
- **A new tag before each sentence where the mood changes; at most 3, and the tag on the first sentence after a tool does not count.** "A cue
  applies from the tag until the next cue tag or the end of the current turn" (Anam). The limit keeps the face from flickering. The
  exemption exists because the speed rule puts «ثواني…» before every tool: an apology followed by a search needs `[concerned]` → `[warm]` →
  tool → `[supportive]` → `[curious]`, and with a hard cap of 3 the model would drop the tag after the tool and let the earlier cue run into
  the results. Anam's own example puts 4 cues in one short turn.
- **After «ثواني…» and the tool, the first sentence of the result gets its own tag.** The line before a tool call and the answer after it are
  one turn (multi-utterance; the LLM is GPT 6 Luna on Azure). In the owner's call that happened in #9, #11, #15 and #17.
- **The apology is its own short sentence.** The model joins the apology to the explanation (reply #19 of the call), and tags change only before a sentence, so `[concerned]` covered half the reply. Asking for «حقك عليّ يا فندم.» alone keeps the
  sympathetic face to one short sentence.
- **Complaint openers and mixed news are `[supportive]`.** «معاك حق تسأل» (the screenshot turn) and «فاهمة قصدك» are listed under
  `[supportive]`, and the gloss «متفهمة», the model's most frequent stray word (6 of 38), is now on `[supportive]`, not on `[concerned]`.
  Mixed news (a weak hit plus nothing local, 6% of Janna's replies) and results that are only close are `[supportive]`; `[happy]` only when
  the result itself truly matches.
- **English tags exactly as listed, in every language, not translated.** The model translated tags into the language it spoke: «[داعم]»,
  «[دافئة]», «[متفهمة]», «[暖]». 21 of the 38 stray cue attempts were Arabic words. Each tag in the Arabic guides carries the Arabic feeling
  words the model reached for, so those feelings map to the English tag: Janna AR [warm] (دافئة: the model's own stray word, kept on purpose),
  [happy] (مبسوطة ومتحمسة), [curious] (مهتمة وحريصة), [supportive] (هادية وداعمة ومتفهمة), [concerned] (متعاطفة ومعتذرة); Bassem the same in the
  masculine, with the Egyptian «دافي». The glosses sit in parentheses after the tag, never inside the square brackets, and speech may not
  contain square or other brackets, so a gloss is not spoken as a tag.
- **No other word in square brackets, Arabic or not; never a tag on its own or at the end of a reply.** This covers «[صاف]», the `[smile]`
  at the end of lines (11-18), and a lone tag.
- **Tags only in what is said aloud, never in tools, forms or e-mails.** "Every reply starts with a tag" creates a new risk: free-text tool
  fields (Bassem's e-mail body, the RFQ details, task titles) are not cleaned by Anam. Bassem is also told to put the tag before the lines he
  says «من بين «»», because his prompt says to say only what is inside «».
- **The platform's bracket frames.** On ephemeral calls (section 5) the Worker appends blocks after STYLE CUES, each framed by a sentence in
  square brackets («[بداية ذاكرة جنة مع الزائر ده — …]», «[بداية بنك المعلومات — …]», «[بداية ذاكرة باسم مع العضو — …]» and four more;
  `fc81e15d`'s stored prompt shows it). The new sentence tells the model those frames are not cue tags. Reframing them without brackets is a
  Worker change (section 10).
- **"These rules, together with the guide above, replace any other cue list or cue instructions, including any other # STYLE CUES
  section."** Dynamic stays on (section 5), so Lab may append its hidden section after ours. That hidden text allows `[sad]`, `[angry]`,
  `[distressed]`, `[playful]` and `[surprised]`, says "Use them sparingly", asks for "um" and for "loads of exclamation marks", and does
  laughter with `[laughter]`. The same sentence therefore restates the points it would contradict: a tag on every reply, no "um", no runs of
  exclamation marks, no `[laughter]`. A visible prompt cannot go further against a hidden one.
- **Examples.** Models copy examples more closely than rules. The tool-turn example is two lines, the line before the tool and the answer
  from its result, with "the second line only after their result, and only from it": the pre-review example put «ثواني، بدوّرلك…» and a
  "nothing found" in one quoted line with no tool between them, which is exactly #50 / #53 (she said she was searching and called no tool).
  The apology example is about her own mistake, not about results that do not match (those are `[supportive]` and not her fault). One
  example shows `[happy]` on a real match, so the bright face has a model too.

### 3.3 Placeholders removed

The three prompts each had one bracketed placeholder inside a line meant to be spoken. That is the same pattern as the stray tags, and the
new rule "no other word in square brackets" would contradict it. Each is replaced by words that need no brackets (Janna's tenders line keeps
the visitor's own product, with steel as the example):

- Janna AR, tour step 2: `«دي مناقصات [منتجه] في مصر»` → `«دي مناقصات حديد التسليح في مصر» (بمنتجه هو مكان «حديد التسليح»)`
- Janna EN, tour step 2: `"These are the [product] tenders in Egypt"` → `"These are the steel tenders in Egypt" (their own product instead of "steel")`
- Bassem, «المتابعة اليومية»: `- في أول مقابلة: «يا [لقبه واسمه]، تحب أبعتلك` → `- في أول مقابلة ناديه بلقبه واسمه واسأله: «تحب أبعتلك`

### 3.4 The exact new texts

The full prompts are `janna-ar.new.md`, `janna-en.new.md` and `bassem.new.md`; the line diffs are in `diffs/`. Janna AR's guide replaces
«# تاجات المشاعر» where it was, just above STYLE CUES. Janna EN's replaces "# EMOTION TAGS". Bassem's replaces his tag bullet inside «قواعد
الكلام», near the top of his prompt. His STYLE CUES section stays at the end, where the Worker appends his member block after it.

**Janna AR**: «# تاجات المشاعر» (replaces the 2-line section, `AR-G`), then STYLE CUES (`AR-C`; the heading line is kept):

```text
# تاجات المشاعر (وشّك بيمشي مع كلامك)
- ابدئي كل رد بتاج واحد يناسب أول جملة فيه، وقبل أي جملة بيتغيّر فيها إحساسك حطي تاج جديد (اعتذار ← شرح ← سؤال)، ٣ بالكتير في الرد، وتاج أول جملة بعد الأداة مش محسوب منهم:
  - [warm] (دافئة): ترحيب ودعاء وشكر ووداع، وتلخيص كلامه («تمام، فهمت إن…»، «وصلتني التفاصيل»)، ولما يسكت شوية («لسه معايا؟»)، «اتفضل يا فندم، سامعاك»، «هستنى حضرتك»، «ثواني، بدوّرلك…».
  - [happy] (مبسوطة ومتحمسة): خبر حلو بجد بس: النتيجة نفسها مطابقة لطلبه، أو حاجة خلصت فعلاً (التسجيل أو الطلب اتبعت).
  - [curious] (مهتمة وحريصة): سؤال أو سؤال تأكيد: الاسم، النشاط، «تقصد…؟»، «معلش ماسمعتش كويس»، «تحب أجرّب؟».
  - [supportive] (هادية وداعمة ومتفهمة): الشرح والتفاصيل والباقات والمساعدة، والرد على شكوى أو زعل من النتايج («معاك حق تسأل»، «فاهمة قصدك»)، والخبر الوحش بهدوء وصراحة: مالقيتش، مش مطابقة، ماقدرش، مفيش ضمان. ولو الخبر فيه حلو ووحش، أو النتيجة قريبة بس مش مطابقة: برضه [supportive].
  - [concerned] (متعاطفة ومعتذرة): جملة الاعتذار نفسها، قصيرة ولوحدها («حقك عليّ يا فندم.»)، أو «ألف سلامة عليك… إيه اللي مزعلك؟» لزائر قال إنه متضايق أو تعبان. ولو كمّلتي بعدها بشرح أو مساعدة، حطي قبله تاج تاني.
- بعد «ثواني…» والأداة، أول جملة في النتيجة ليها تاج جديد. والرد اللي هو أداة بس من غير كلام مالوش تاج.
- لو مش متأكدة من التاج: [warm].
- التاج واحد من الخمسة دول بالإنجليزي زي ما هو في أي لغة بتتكلميها، مش ترجمته. ممنوع أي كلمة تانية بين [] (عربي أو غيره)، وممنوع [sad] و[angry] و[distressed] و[playful] و[surprised] و[laughter] و[neutral]، ولا [smile] ولا [laugh] ولا [support] ولا [gentle] ولا [thought].
- التاج قبل الكلام اللي بيأثر فيه، عمره ما ييجي لوحده ولا في آخر الرد، وفي كلامك بس، مش في الأدوات ولا الفورم.
# STYLE CUES
These rules, together with the «تاجات المشاعر» section above, replace any other cue list or cue instructions, including any other # STYLE CUES section: start every reply with a tag, never use [laughter], and never write "um" or «اممم», runs of exclamation marks, or laughter such as haha, hehe or ههه. You may use only these cue tags: [warm], [happy], [curious], [supportive], [concerned].

Cue tags are the only markup you may use, even where other instructions ask for plain text. Write every tag in English exactly as listed, whatever language you speak. Never put any other word, in any language, in square or other brackets, and never use angle-bracket tags, asterisk actions or emoji. Do not explain or mention the tags. Blocks the platform adds after this section are framed by lines in square brackets; those frames are not cue tags: never copy them or write anything like them.

Examples:
A tool turn (the first line and the tool calls in the same reply; the second line only after their result, and only from it):
"[warm] ثواني، بدوّرلك…"
"[supportive] بصراحة البحث ماطلّعش فرصة مطابقة لنشاط حضرتك دلوقتي. [curious] تحب أجرّب بكلمة تانية؟"
A result that truly matches:
"[happy] لقيت مناقصة مطابقة لنشاط حضرتك بالظبط. [curious] أفتحلك تفاصيلها؟"
Your own mistake:
"[concerned] حقك عليّ يا فندم، فهمت طلبك غلط. [supportive] حضرتك بتصنّع المنتج ده، مش بتشتريه. [curious] كده صح؟"
```

**Janna EN**: "# EMOTION TAGS" (`EN-G`), then STYLE CUES (`EN-C`):

```text
# EMOTION TAGS (your face follows your words)
- Start every reply with one tag that fits its first sentence, and put a new tag right before any sentence where your mood changes (apology → explanation → question); at most 3 per reply, and the tag on the first sentence after a tool never counts toward that limit:
  - [warm]: welcomes, wishes, thanks, goodbyes, summing up what they said ("Got it, so you…"), when they go quiet ("Are you still with me?"), "Go ahead, I'm listening", "I'll wait", "One moment, let me check…".
  - [happy]: real good news only: a result that itself truly matches, or something actually done (registration or request sent).
  - [curious]: a question or a checking question: their name, their business, "Do you mean…?", "Sorry, I didn't catch that", "Shall I try…?".
  - [supportive]: explanations, details, plans, help, answering a complaint ("You're right to ask", "I understand"), and calm, honest bad news: nothing found, not a match, I can't, no guarantee. Mixed news, or a result that is only close, is [supportive] too.
  - [concerned]: only the apology itself, as its own short sentence ("I'm sorry about that."), or the sympathy for a visitor who says they are upset or tired; if you go on to explain or help, put a new tag before it.
- After "One moment…" and the tool, the first sentence of the result gets its own tag. A turn that is only a tool call, with no words, gets no tag.
- If you are unsure which tag fits: [warm].
- Never use [sad], [angry], [distressed], [playful], [surprised], [laughter] or [neutral], nor [smile], [laugh], [support], [gentle] or [thought].
# STYLE CUES
These rules, together with the EMOTION TAGS section above, replace any other cue list or cue instructions, including any other # STYLE CUES section: start every reply with a tag, never use [laughter], and never write "um" or «اممم», runs of exclamation marks, or laughter such as haha, hehe or ههه. You may use only these cue tags: [warm], [happy], [curious], [supportive], [concerned].

Cue tags are the only markup you may use, even where other instructions ask for plain text, and only in what you say aloud (never in tool arguments or forms). Write each tag in English exactly as listed, whatever language you speak, right before the words it affects, never on its own or at the end of a reply. Never put any other word, in any language, in square or other brackets, and never use angle-bracket tags, asterisk actions or emoji. Do not explain or mention the tags. Blocks the platform adds after this section are framed by lines in square brackets; those frames are not cue tags: never copy them or write anything like them.

Examples:
A tool turn (the first line and the tool calls in the same reply; the second line only after their result, and only from it):
"[warm] One moment, let me check…"
"[supportive] Honestly, nothing matching your products came up right now. [curious] Shall I try another word?"
A result that truly matches:
"[happy] I found a tender that matches your products exactly. [curious] Shall I open its details?"
Your own mistake:
"[concerned] I'm sorry, I got that wrong. [supportive] You make this product; you aren't buying it. [curious] Is that right?"
In Arabic the tags stay in English:
"[supportive] بصراحة البحث ماطلّعش فرصة مطابقة لنشاط حضرتك دلوقتي. [curious] تحب أجرّب بكلمة تانية؟"
```

**Bassem**: inside «قواعد الكلام», in place of his tag bullet (`BA-G`):

```text
- تاجات المشاعر (وشّك بيمشي مع كلامك): ابدأ كل رد بتاج واحد يناسب أول جملة فيه، وقبل أي جملة بيتغيّر فيها إحساسك حط تاج جديد (اعتذار ← شرح ← سؤال)، ٣ بالكتير في الرد، وتاج أول جملة بعد الأداة مش محسوب منهم:
  - [warm] (دافي): ترحيب ودعاء وشكر ووداع، وتلخيص كلامه («تمام، فهمت…»)، «اتفضل يا فندم، سامعك»، «هستنى حضرتك»، ولما يسكت شوية («لسه معايا؟»)، «ثواني، بدوّرلك…».
  - [happy] (مبسوط ومتحمس): خبر حلو بجد بس: فرصة مطابقة لنشاطه، أو حاجة اتعملت فعلاً (الإيميل اتبعت، أو خطوة في الصفقة خلصت).
  - [curious] (مهتم وحريص): سؤال أو سؤال تأكيد: «تحب أبعته؟»، «تقصد…؟»، «معلش ماسمعتش كويس».
  - [supportive] (هادي وداعم ومتفهم): الشرح والتفاصيل، ملخص الإيميل، اللي على الشاشة، طمأنة العميل المحبط، والرد على شكوى أو زعل من النتايج («معاك حق»، «فاهم قصدك»)، والخبر الوحش بهدوء وصراحة: مالقيتش، مش منشور، ماتبعتش، ماقدرش، مفيش ضمان. ولو الخبر فيه حلو ووحش، أو النتيجة قريبة بس مش مطابقة: برضه [supportive].
  - [concerned] (متعاطف ومعتذر): جملة الاعتذار نفسها، قصيرة ولوحدها («حقك عليّ يا فندم.»)، أو «ألف سلامة عليك… إيه اللي مزعلك؟» لعميل قال إنه متضايق أو تعبان. ولو كمّلت بعدها بشرح أو مساعدة، حط قبله تاج تاني.
- بعد «ثواني…» والأداة، أول جملة في النتيجة ليها تاج جديد. والرد اللي هو أداة بس من غير كلام مالوش تاج.
- لو مش متأكد من التاج: [warm].
- التاج واحد من الخمسة دول بالإنجليزي زي ما هو في أي لغة بتتكلمها، مش ترجمته. ممنوع أي كلمة تانية بين [] (عربي أو غيره)، وممنوع [sad] و[angry] و[distressed] و[playful] و[surprised] و[laughter] و[neutral]، ولا [smile] ولا [laugh] ولا [support] ولا [gentle] ولا [thought].
- التاج قبل الكلام اللي بيأثر فيه، وحتى قبل الجملة اللي بتقولها من بين «»، وعمره ما ييجي لوحده ولا في آخر الرد، وفي كلامك بس، مش في الإيميل ولا الأدوات.
```

and at the end, STYLE CUES (`BA-C`; the heading line is kept):

```text
# STYLE CUES
These rules, together with the «تاجات المشاعر» bullets in «قواعد الكلام» above, replace any other cue list or cue instructions, including any other # STYLE CUES section: start every reply with a tag, never use [laughter], and never write "um" or «اممم», runs of exclamation marks, or laughter such as haha, hehe or ههه. You may use only these cue tags: [warm], [happy], [curious], [supportive], [concerned].

Cue tags are the only markup you may use, even where other instructions ask for plain text. Write every tag in English exactly as listed, whatever language you speak. Never put any other word, in any language, in square or other brackets, and never use angle-bracket tags, asterisk actions or emoji. Do not explain or mention the tags. Blocks the platform adds after this section are framed by lines in square brackets; those frames are not cue tags: never copy them or write anything like them.

Examples:
A tool turn (the first line and the tool calls in the same reply; the second line only after their result, and only from it):
"[warm] ثواني يا فندم، بدوّرلك…"
"[supportive] مالقيتش فرصة مطابقة لمنتجك في المصادر الرسمية، حتى بعد ما جرّبت بكلمة تانية. [curious] تحب أدوّر في سوق تاني؟"
A result that truly matches:
"[happy] لقيت فرصة مطابقة لمنتجك بالظبط. [curious] أفتحهالك؟"
A frustrated member:
"[concerned] معلش يا فندم، فاهم إحساسك. [supportive] هشتغل معاك بنفسي كل يوم، ومش هوعدك بحاجة مش في إيدي. [curious] إيه الأسواق اللي تقدر تورّدلها؟"
```

## 4. `directorNotes`: `{presetStyle "warm", expressivity 0.5}` for all three

- **The `warm` preset stays.** Anam's preset table gives `warm` for "Virtual assistant, onboarding guide, brand spokesperson", which is
  Janna's job; Bassem is the members' assistant. The preset is the baseline the face returns to between turns and wherever a cue is missing.
  With a tag at the start of every reply, it now mostly governs listening and pauses. The alternatives were rejected:
  - `happy` would brighten every untagged moment, bad news included;
  - `supportive` would start greetings and good news from a teaching tone;
  - no preset (neutral) is cooler than these personas;
  - `customStylePrompt` and `customIdlingStylePrompt` "may be followed less consistently than presets", and neither can be combined with
    `presetStyle`. They would replace the documented preset with free text.
- **Expressivity 0.5.** Anam: "Start with the default by omitting `expressivity`, or set `0.5` when you want to be explicit. Increase it when
  you want a stronger performance, and lower it when you want steadier, more restrained motion. Very high values can look exaggerated or
  unstable." The persona-update schema says 0.5 is the default. `cara-4.1-express` already brings "more expressive animation and better
  adherence to Director Notes", and the cues now carry the changes of mood, so the dial does not need to amplify them. Bassem goes from 0.55
  to 0.5 for the same reasons, so all three share one value.
- **Where it applies.** The saved personas carry it for Janna's first-visit calls. The ephemeral copies (Bassem's site calls, Janna's
  returning visitors, and every Janna call once the knowledge bank holds a team-approved entry) copy `presetStyle`, `customStylePrompt`,
  `expressivity` and `customIdlingStylePrompt` from the saved persona at every call (`worker/src/bassem-context.js` `DIRECTOR`), so the
  baseline is the same there. Whether the **cues** are applied on those ephemeral calls is not proven (section 5); the test calls check it.

**The fallback, in this order:**

1. **The pained look comes back only on apology sentences** (the console cue log shows `concerned` there): send the prepared prompt edit
   `fallback-concerned.json` (`fallback/<persona>.fallback.md`): apologies move to `[supportive]`, and `[concerned]` stays only for sympathy
   with a visitor who says they are upset or tired. Of the five cues, `[concerned]` ("Sympathetic delivery") is the most likely to draw the
   brows together, and a lower expressivity would flatten every cue at once, not just that one.
2. **The face is still pained, sad or exaggerated on calm sentences** (the cue log shows `warm` or `supportive` applied there): send
   `directorNotes {"presetStyle": "warm", "expressivity": 0.4}` alone. It is Anam's own next step ("lower it when you want steadier, more
   restrained motion"; "Start with the default and adjust gradually"), it is one number, and the ephemeral copies carry it.

Not the fallback: custom style prompts (less consistent, and they replace the preset), the `supportive` preset (it flattens greetings and good
news), a higher expressivity (the opposite of the observed problem). If the opposite complaint comes ("her face never changes"), the first
thing to check is whether cues are written and applied at all (the console cue log, section 8), not this dial.

## 5. `dynamicDirectorNotes`: kept on, not sent in this round

The pre-review design turned it off on all three. The Anam review showed that this would most likely switch cue application off on the only
path where it is confirmed on, so the writes no longer carry the field.

- **The evidence** (all four records read by the Anam review; `8bacbfac` is also in forensics §0, and `fc81e15d` was read again for this
  round). Anam's session records of saved-persona calls (`8bacbfac` on the site, Janna AR; `5877165a` on the Lab share page, Bassem) carry `personaConfig.metadata.applyEmotionCues: true` and an `initialMessage` that starts with `[warm]`. Ephemeral calls from the
  same site code, with the same SDK options (`fc81e15d`, Janna's returning visitor at 09:36 today; `8f4d017e`, Bassem's member call) carry
  neither: their metadata is only `{client: js-sdk, version 4.29.1, accountId}`. So `applyEmotionCues` follows
  the saved persona, most likely its Dynamic flag, not the browser. Turning the flag off could therefore turn the cues off, and
  expressivity 0.5 would then make the face flatter, which would look like "the fix did nothing" and lead to the wrong fallback.
- **The hidden section.** With Dynamic on, Lab may append its hidden `# STYLE CUES` text after ours (Anam: "Lab appends this hidden
  `# STYLE CUES` section to the persona system prompt; it does not edit the visible prompt"). Whether it reaches these API sessions is
  unknown: the stored session prompt ends with the visible text (expected either way), and no "um" or «اممم» appears in the 25 newest calls.
  The widened override sentence (section 3.2) is the answer within the visible prompt.
- **The ephemeral paths are the open question.** They never carry the flag (there is no ephemeral field for it), and their records show no
  `applyEmotionCues`. Stripping is likely there (the glued sentence in the ephemeral call `685cdbfb`, forensics §1.3), but stripping a tag is
  not the same as applying it. These paths are most of the real traffic: every Bassem member call, every returning Janna visitor, and every
  Janna call once the team approves the first knowledge-bank answer (`worker/src/visitor.js`: the knowledge text alone creates a context).
  The owner's own iPhone has had visitor memory since `8bacbfac`, so his next call there will most likely be ephemeral. No promise of face
  changes is made for these paths until the console cue log shows cue events there (section 8). If no events arrive, the question goes to
  Anam (the ephemeral `personaConfig` has no cue switch).
- **Later.** Turning the flag off, if ever, is a separate write, and only after the cue log shows cues applied in a session that has no flag.

## 6. Test set A: every persona message of the owner's call `8bacbfac`

The tags the final guide gives, in order; "at «…»" marks the sentence where a new tag goes. #0 is the fixed greeting (`initialMessage`), not an
LLM reply. Times are UTC, durations are Anam's speaking time. The rows kept what she actually said; where the new rules would make her say it
differently (the apology as its own sentence, a real tool call after «ثواني»), the note said so.

The turn-by-turn table of this section (each persona reply of the call, quoted from its transcript, with the tags the final guide gives) is left out of this repository copy: call transcripts, visitors' words and names stay out of git. It was part of the reviewed design; the totals below are its result.

Totals for the 29 replies: 45 tags. That is 21 `[warm]`, 11 `[curious]`, 11 `[supportive]`, 2 `[concerned]`. No real match was found in that call, so there is no bright face (`[happy]` 0). No reply has more than 3 counted tags. The screenshot turn becomes `[supportive]` → `[curious]` instead of «[صاف]» and 47 s of baseline.

## 7. Test set B: the situations of the forensics, both personas

| Situation (forensics §3; share of Janna / Bassem replies) | Janna | Bassem |
|---|---|---|
| Greeting, returning visitor, a second person (10% / 12%) | `[warm]` | `[warm]` |
| How-are-you answers (5% / 3%) | `[warm]`, then `[curious]` for the follow-up question | same |
| Upset visitor (3% / 5%) | `[concerned]` («ألف سلامة عليك… إيه اللي مزعلك؟»), then she listens; `[supportive]` only when she goes on to help | same. His mismatched cheerful reply to an upset member becomes `[concerned]` |
| Asking the name or title (9% / 3%), asking about the business (6% / 4%) | `[curious]` | `[curious]` |
| Summing up what the visitor said, acknowledging what arrived | `[warm]` | `[warm]` |
| The line before a tool (2% / 8%) | `[warm]`, and the result's first sentence gets its own tag (not counted in the 3) | same |
| A turn that is only a tool call, with no words (4 Janna / 5 Bassem turns) | no tag | no tag |
| Results that truly match (3% / 2%) | `[happy]` → `[curious]` («أفتحلك أنهي واحدة؟») | same |
| Results but no match (5% / 2%), nothing found (6% / 6%), mixed news (6% / 2%) | `[supportive]` → `[curious]` | same |
| One item's details (6% / 3%), how the platform works (4% / 6%), know-how (5% / 7%), plans (5% / 1%) | `[supportive]` (→ `[curious]` for «أكمّل لحضرتك؟») | `[supportive]` |
| Registration steps (5%), RFQ form (8%), the meeting (3%) | `[supportive]`; sent or done → `[happy]`; the offer → `[curious]` | – |
| Complaint (1% / 1%) | `[supportive]` («معاك حق تسأل», «فاهمة قصدك»), then `[curious]` | same («معاك حق», «فاهم قصدك») |
| Apology (3% / 1%) | `[concerned]` on the apology sentence alone → `[supportive]` → `[curious]` | same |
| Cannot do it, not on the platform (6% / 7%) | `[supportive]` | `[supportive]` («ماقدرش»، «مش منشور»، «ماتبعتش») |
| Misheard words or noise (20% / 11%) | `[curious]` | `[curious]` |
| Silence prompt (7% / 2%), «اتفضل سامعاك» and waiting (3% / 4%) | `[warm]` | `[warm]` |
| Opening a page on screen (2% / 12%), helping with the site (2%) | `[supportive]` | `[supportive]` («اللي على الشاشة») |
| Bassem's e-mails (12%) | – | the summary `[supportive]` → «تحب أبعته؟» `[curious]`; «اتبعت» `[happy]`; not sent → `[supportive]` |
| Bassem's tasks and schedule (3%) | – | done → `[happy]`; otherwise `[warm]` |
| Thanks and goodbye (5% / 9%), off-topic chat (2% / 1%) | `[warm]` | `[warm]` |

## 8. How to write it and check it (for whoever applies it, after the owner's OK)

`plan.json` has the exact fields, hashes and lengths; `final.json` has the summary. In short:

1. **Order.** Janna AR first: she is the persona the owner complained about and will test, and her first-visit calls run on the saved
   persona, where cue application is confirmed. Then the owner's test call. Janna EN and Bassem only after it passes.
2. **No call of that persona running:** `anam_session_list active=true` shows none. Check saved-persona calls by `personaId`, and ephemeral
   copies by `clientLabel` (`madeinegyptgate-janna-ar`, `-janna-en`, `-bassem-*`).
3. **Read the persona and compare it with the record:**
   - Janna AR/EN: the read prompt's sha256 and `updatedAt`.
   - Bassem, whose read is trimmed: `updatedAt`, the trim total of 26,460 UTF-16 units, and the visible part (never a fixed visible length).

   If anything differs (for example the Worker's price sync wrote meanwhile), save the live text byte-exact and run
   `python3 -I apply_patch.py --base <persona>=<file>`.
4. **One `anam_persona_update` per persona, with only these fields:**
   - `systemPrompt` = the bytes of `<persona>.new.md`;
   - `directorNotes` = `{"presetStyle": "warm", "expressivity": 0.5}`;
   - `expectedUpdatedAt` = the `updatedAt` just read.

   Nothing else: not `dynamicDirectorNotes`, and no tools, LLM, voice, avatar, `avatarModel` or greeting.
5. **Read the persona again:** the new sha256 (Bassem: trim total and visible part), `directorNotes` as sent, `dynamicDirectorNotes` still
   `true`, every other field as before. Then copy each new file over `anam/live/<persona>.systemPrompt.md` and record the round in
   `anam/live/README.md`: the write's UTC time, `updatedAt` before → after, sha256 and lengths, `directorNotes` before → after, and
   "dynamicDirectorNotes unchanged (true)". These are `.md` files only, so nothing is deployed.
6. **Test calls.** The owner judges the faces on his phone; someone on desktop Chrome watches the cue events. In every test call, after it
   starts, in the browser console:

   ```js
   MIG_LIVE_CLIENT.client.addListener(anam.AnamEvent.DIRECTOR_NOTE_CUE_APPLIED, function (e) { console.log('cue', e.cueTag); })
   ```

   (`data/janna-live.js` publishes the SDK client as `window.MIG_LIVE_CLIENT`; the SDK is `window.anam`, js-sdk 4.29.1.)
   - **Janna AR, first visit (saved persona):** a private window (or site data cleared); in DevTools → Network, the `/api/janna/session`
     reply has no `visitor_context`. Then:
     - answer «إزيك» with «مدايق شوية»: a sympathetic face on «ألف سلامة عليك…», and she waits;
     - give a name: warm, then attentive at «نشاط شركتكم إيه؟»;
     - ask for something with no match (his cylinder test): warm at «ثواني», then **calm and open, not pained** on the "nothing found",
       then attentive at the question;
     - say «هتفيديني بإيه؟»: calm and reassuring all through the explanation;
     - an apology turn, for example «إنتِ فهمتيني غلط» after a wrong search: a short «حقك عليّ يا فندم.», sympathetic for that sentence only,
       then calm;
     - ask for something that exists (for example «مناقصات حديد»): bright on the real result;
     - «استنى» while she talks: warm «اتفضل يا فندم، سامعاك»; 30 s of silence: warm «لسه معايا؟».
   - **Janna AR, returning visitor (ephemeral copy):** a normal window that has called before (the owner's iPhone has memory); DevTools shows
     `visitor_context: true`. The no-match search, the complaint and the apology again.
   - **Janna EN** (it has never had a call): the same in English, then the 🌐 button to switch to Arabic.
   - **Bassem, signed-in partner test member (ephemeral copy):** «مدايق»; «قول اللي عندك»; «اكتبلي إيميل للجهة» → «ابعته».
   - In every call, listen at the first «ثواني…» (`[warm]`) and at the apology (`[concerned]`): the voice should sound as before, with no
     whisper, sigh or laugh (Anam documents only the ElevenLabs → Anam direction: `[whispers]` → warm, `[sighs]` → concerned). If one
     appears, report it before going on; directorNotes alone cannot fix the voice.
7. **Pass criteria:**
   - the console shows a `cue` line for every spoken reply, on each path tested. This is the only proof that a cue reached the face:
     recognized tags never appear in transcripts, and the site's captions remove every bracketed word of 1 to 24 characters anyway
     (`data/captions.js` `clean()`), so captions cannot show a failure;
   - `anam_session_search` with text `[` over the test window finds no persona message. A hit with an unknown word is a stray tag (the guide
     failed there); a hit with one of the five tags means that path does not strip, and probably does not apply, cues;
   - the faces listed in step 6;
   - the voice as before.

   If the ephemeral paths show no cue events, the prompt change still helps the saved-persona path, but no face change is promised for
   Bassem or returning visitors: raise it with Anam (the ephemeral `personaConfig` has no cue switch). If Janna's returning-visitor call
   shows one of the five tags in its transcript (that path does not strip them), or no cue events, hold Bassem's write: all his site calls
   are ephemeral. The fallback steps (section 4) and any
   later `dynamicDirectorNotes` change are decided on this cue log, not on the look of the face alone.
8. **Rollback:** `systemPrompt` = the record (old sha256 in `plan.json`) and `directorNotes` = Janna `{warm, 0.7}`, Bassem `{warm, 0.55}`.
   `dynamicDirectorNotes` was never changed.

## 9. The review round: what changed, and what was not taken

Three reviews (Anam, language, regression) read the pre-review design. Every blocker and every "should" was taken, in substance; most nits
too. `final.json` lists the points not taken as written.

| Review point | What the final design does |
|---|---|
| Anam, blocker: `dynamicDirectorNotes: false` may turn cues off | Not sent; stays `true` (section 5). Verified on the ephemeral record `fc81e15d` |
| Anam: the ephemeral paths are unverified | Section 4 and 5 no longer claim that every path gets cues; the test plan adds the private window, the Network check and the console cue log |
| Anam: captions can never show a tag | The caption criterion is gone; the cue log and the `[` search are the criteria |
| Anam + language: the cap of 3 collides with the tag after the tool | "the tag on the first sentence after a tool does not count" (the Anam wording: one count, and no notion of "before the tool" for turns without one) |
| Anam + regression: written laughter was no longer banned | "never write … haha, hehe or ههه" in all three |
| Anam: the hidden section's instructions are not covered by "cue list" | The override sentence names "cue instructions" and "any other # STYLE CUES section" and restates the four contradicted points |
| Anam, nits: tool-only turns; Bassem's «» lines; listen for whisper or sigh; an apology turn in the test | All taken |
| Language, blocker; regression: the first example has no tool call | Split into two lines with "the second line only after their result, and only from it" |
| Language: «متفهمة» pulls complaints to `[concerned]` | «متفهمة» moved to `[supportive]`, with «معاك حق تسأل», «فاهمة قصدك» |
| Language: `[concerned]` reaches into the explanation; "then a new tag" pushes her to keep talking | The apology is its own short sentence; a new tag only if she goes on |
| Language: the apology example apologizes for results | Now her own mistake |
| Language: Janna EN asked "what is wrong" against her own script | Dropped |
| Language: mixed news has no rule | `[supportive]`; `[happy]` only when the result itself truly matches |
| Language: the Worker's bracket frames | A sentence in STYLE CUES now; reframing them is a Worker change (section 10) |
| Language + regression: Janna EN has no Arabic example | One Arabic line added |
| Language, nits: «سؤال تأكيد», summaries and silence prompts under `[warm]`, «ودعاء», glosses, more named bans, Bassem's examples, the reach of "replace", the fallback bullet, a `[happy]` example | All taken; «دافئة» kept for Janna AR on purpose (it is the model's own stray word) |
| Regression: the `[smile]`/`[laugh]` ban was dropped | Restored by name (with `[support]`, `[gentle]`, `[thought]`); `apply_patch.py` checks each is named once |
| Regression: stage the round | Taken, with Janna AR first instead of Janna EN first (the flag is no longer changed) |
| Regression, nits: "other brackets"; the product slot; the README record; the voice check | All taken |

## 10. Not in this round

- «حاضر، هجرب…» and «ثواني، بدوّر دلوقتي…» with no tool call (#50, #53). This is what the owner reacted to at the end of the call. The speed
  rule already says «ماتقوليش «ثواني» من غير ما تستدعي الأداة», and the new tool-turn example now shows the right shape, but «حاضر، هجرب»
  got past the rule. It is a content fix, not a face fix.
- The Worker's bracket frames (`VISITOR_BLOCK`, `VISITOR_BLOCK_EN`, `KNOWLEDGE_BLOCK`, `MEMORY_BLOCK`, `PROFILE_BLOCK`, `RESUME_BLOCK`,
  `MEETING_BLOCK`): reframe them without square brackets, for example «=== بداية ذاكرة جنة مع الزائر ده (…) ===», and give `KNOWLEDGE_BLOCK`,
  which only Janna reads, the feminine «ماتنفّذيش». A Worker pull request, deployed by `deploy-worker`.
- Stray tags already stored in memory and in call-continuation text still go back into prompts until the branch `fix/stray-cue-tags`
  (worktree `.claude/worktrees/expr-code`, not merged) ships.
- Logging the cue events in `data/janna-live.js` (today only the console snippet of section 8 shows them).
- The unanswered last line of `8bacbfac` (forensics §5): the stall began before the 09:30:52 write. Future writes wait until no call is
  running.
- «أنا معاكي» said to men on silence prompts, and the Cyrillic word «оплаты»: content slips.
- The greetings (`initialMessage`) and the voice settings. ElevenLabs `stability` is the voice's own emotion dial, and voice changes need the
  owner's OK.

## 11. Files

All in `/tmp/claude-0/-home-user-madeinegyptgate/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/expr/`:

- `design/janna-ar.new.md`, `design/janna-en.new.md`, `design/bassem.new.md`: the full new prompts, byte for byte what to send.
- `design/replacements.json`: the exact old → new strings (3 per persona; each old string occurs once).
- `design/apply_patch.py`: builds the new prompts from the records and checks them; writes `plan.json` and `diffs/`.
- `design/plan.json`: per persona, what to send, the old and new sha256 and lengths, the order, the checks, the test gate and the rollback.
- `design/final.json`: the summary: per persona the id, `expectedUpdatedAt`, file, hashes, lengths and `directorNotes`; the fallback; the
  review points not taken.
- `design/owner-summary-ar.md`: the owner's summary in Egyptian Arabic.
- `design/fallback-concerned.json`, `design/fallback/*.fallback.md`, `design/fallback/*.fallback.diff`: fallback step 1, prepared and
  checked, not to be sent unless the test calls call for it.
- `design/diffs/*.diff`: line diffs, record → new.
- `design/rationale.md`: this file. `design/pre-review/`: the design before the reviews.
- `work/make_replacements.py`: writes `replacements.json` (it holds the new texts; the old ones come from the records).
- `work/check_sync.mjs`: runs the Worker's price-sync code on the old and the new prompt (read-only).
- `work/verify_final.py`: the independent check (GNU `diff`, occurrences, characters).
- `work/make_fallback.py`: writes and checks fallback step 1.
- `work/make_rationale.py`: assembles this file from `work/rationale.template.md`, `replacements.json` and `plan.json`.
- `work/make_final.py`: writes `final.json` from `plan.json`, `fallback-concerned.json` and the review decisions.
