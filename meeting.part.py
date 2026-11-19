# Scheduled-meeting room: meeting.html#<meetingId> — the introductory meeting a visitor booked with Janna (janna_schedule_meeting
# → Worker POST /api/meetings, link sent by email). Not gated, noindex. Reads GET /api/meetings/<id> (public fields only:
# first name, start time, status), shows a countdown, and from 10 minutes before the start lets the visitor enter: one click
# (it also unlocks audio) opens Janna's live overlay in meeting mode with the meeting id (data/janna-live.js), so the
# finish call links the Anam session to this meeting. Unknown / expired ids and the static preview (no API) are handled.
# All UI text is bilingual in code: T(ar, en).
PAGES['meeting'] = ('اجتماعك مع جنة – صنع في مصر', '', COMMON_CSS + '''
.mtgh { background: radial-gradient(ellipse at 85% 0%, #0d3a4a 0%, #04121a 55%, #020a0f 100%); color: #dff7ff; border-bottom: 1px solid rgba(120,220,255,.25); }
.mtgh .wrap { padding-block: 28px 26px; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.mtgh .av { width: 104px; height: 104px; border-radius: 50%; object-fit: cover; object-position: 50% 15%; border: 3px solid rgba(120,220,255,.7); box-shadow: 0 0 34px -6px rgba(90,210,255,.8); flex: none; background: #0b2430; }
.mtgh .tx { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.mtgh .crumb { font-size: .8rem; opacity: .8; } .mtgh .crumb a { color: #dff7ff; }
.mtgh h1 { font-size: clamp(1.3rem, 3.2vw, 2rem); font-weight: 900; color: #fff; }
.mtgh p { opacity: .9; max-width: 60em; }
.mtgm { padding-block: 24px 70px; display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 20px; align-items: start; }
.mtgc { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.mtgc h2 { font-size: 1.15rem; font-weight: 900; }
.mtgw { font-size: 1.05rem; font-weight: 800; color: var(--fg); }
.mtgl { color: var(--muted); font-size: .85rem; }
.mtgcd { display: flex; gap: 10px; flex-wrap: wrap; direction: ltr; justify-content: center; }
.mtgcd div { min-width: 74px; background: #04121a; color: #bff3ff; border-radius: 14px; padding: 10px 8px; text-align: center; box-shadow: 0 0 22px -12px rgba(90,210,255,.9); }
.mtgcd b { display: block; font: 900 1.7rem/1.1 ui-monospace, Menlo, Consolas, monospace; color: #fff; }
.mtgcd span { font-size: .72rem; opacity: .85; }
.mtgok { display: flex; gap: 8px; align-items: flex-start; font-size: .9rem; cursor: pointer; background: var(--sunken, #f6f1f2); border-radius: 12px; padding: 10px 12px; }
.mtgok input { margin-top: 5px; accent-color: #0b5d47; flex: none; }
.mtgbtn { font: inherit; font-weight: 900; font-size: 1.05rem; border: 0; border-radius: 14px; padding: 13px 20px; background: #0b5d47; color: #fff; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; justify-content: center; }
.mtgbtn[disabled] { background: #9fb5ae; cursor: not-allowed; }
.mtgbtn i { width: 10px; height: 10px; border-radius: 50%; background: #ff3b5c; }
.mtgn { color: var(--muted); font-size: .84rem; }
.mtga { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.mtgst { border-radius: 14px; padding: 12px 14px; font-weight: 700; font-size: .92rem; }
.mtgst.warn { background: #FFF4E0; color: #8A5200; } .mtgst.err { background: #FDECEE; color: #8E0B20; } .mtgst.ok { background: #E3F7EA; color: #0B6B35; }
.mtgside { display: flex; flex-direction: column; gap: 12px; order: -1; } /* side column under the floating Janna figure, the join controls stay clear */
.mtgside .mtgc { padding: 16px; gap: 8px; }
.mtgside h3 { font-size: .98rem; font-weight: 900; }
.mtgside ol { margin: 0; padding-inline-start: 20px; display: flex; flex-direction: column; gap: 4px; font-size: .88rem; }
.mtgside ul { margin: 0; padding-inline-start: 18px; font-size: .86rem; color: var(--muted); display: flex; flex-direction: column; gap: 3px; }
.mtgsk { height: 18px; border-radius: 8px; background: linear-gradient(90deg, var(--line), transparent, var(--line)); background-size: 200% 100%; animation: mtgsk 1.2s linear infinite; }
@keyframes mtgsk { to { background-position: -200% 0; } }
.jnl-btn { display: none !important; } /* the page has its own join button */
/* «🛠️ المطوّر» → janna_live off (data/flags.js hides #mtgNow / #mtgGo): no countdown, consent or join hint for a call that cannot start */
html.mig-off-janna_live #mtgCd, html.mig-off-janna_live .mtgok, html.mig-off-janna_live #mtgHint { display: none !important; }
@media (max-width: 900px) { .mtgm { grid-template-columns: 1fr; } .mtgside { order: 0; } }
@media (max-width: 520px) { .mtgh .av { width: 72px; height: 72px; } .mtgcd div { min-width: 62px; } .mtgcd b { font-size: 1.35rem; } .mtgbtn { width: 100%; } }
''', '''
<section class="mtgh"><div class="wrap"><img class="av" src="img/janna.jpg" alt="" width="104" height="104"><div class="tx"><nav class="crumb" id="mtgCr"></nav><h1 id="mtgH"></h1><p id="mtgP"></p></div></div></section>
<main class="wrap mtgm" id="top"><section class="mtgc" id="mtgBox" aria-live="polite"><div class="mtgsk"></div><div class="mtgsk" style="width:60%"></div></section><aside class="mtgside" id="mtgSide"></aside></main>
''', r'''
var EN = window.MIGLANG === "en", T = function (ar, en) { return EN ? en : ar; };
var API = String(window.MEETINGS_API || "/api/meetings").replace(/\/+$/, "");
var WA = "201279188996", MAIL = "info@madeinegyptgate.com";
var EARLY = 10 * 60000, LATE = 60 * 60000, M = null, TMR = 0, entered = false;
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function z2(n) { return (n < 10 ? "0" : "") + n; }
function fmt(ms, tz) { try { return new Intl.DateTimeFormat(EN ? "en-GB" : "ar-EG-u-nu-latn", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)); } catch (e) { return new Date(ms).toISOString(); } }
function lang(u) { return EN ? u.replace(/^([^#]*)/, function (p) { return p + (p.indexOf("?") > -1 ? "&" : "?") + "lang=en"; }) : u; }
$("#mtgCr").innerHTML = '<a href="' + lang("home.html") + '">' + T("الرئيسية", "Home") + '</a> › ' + T("اجتماعك مع جنة", "Your meeting with Janna");
function hero(h, p) { $("#mtgH").textContent = h; $("#mtgP").textContent = p; }
hero(T("اجتماعك التعريفي مع جنة", "Your introductory meeting with Janna"), T("جنة هتعرّفك على المنصة، وتعمل معاك جولة على الشاشة، وتساعدك تختار الباقة المناسبة وتسجّل.", "Janna will introduce the platform, give you a screen tour, and help you choose the right plan and register."));
$("#mtgSide").innerHTML = '<div class="mtgc"><h3>🗓️ ' + T("جدول الاجتماع", "Agenda") + '</h3><ol>'
  + [["التعارف ونشاطك", "Introductions & your business"], ["المنصة والجهة المشغّلة", "The platform & its operator"], ["جولة على الشاشة", "Screen tour"], ["الباقة المناسبة ومستشارك باسم", "The right plan & your advisor Bassem"], ["أسئلتك", "Your questions"], ["التسجيل", "Registration"]].map(function (a) { return "<li>" + T(a[0], a[1]) + "</li>"; }).join("")
  + '</ol></div><div class="mtgc"><h3>✅ ' + T("قبل ما تدخل", "Before you join") + '</h3><ul><li>' + T("افتح الصفحة من الكمبيوتر أو الموبايل، والصوت شغّال.", "Use a computer or phone with sound on.") + '</li><li>' + T("اسمح للمتصفح باستخدام الميكروفون.", "Allow the browser to use your microphone.") + '</li><li>' + T("الجلسة المباشرة حدّها 10 دقايق في المرة الواحدة في الباقة الحالية، ولو محتاج وقت أكتر ابدأ جلسة تانية.", "A live session is capped at 10 minutes at a time on the current plan; start another session if you need more time.") + '</li></ul></div>'
  + '<div class="mtgc"><h3>💬 ' + T("محتاج مساعدة؟", "Need help?") + '</h3><div class="mtga"><a class="btn btn-sm btn-green" target="_blank" rel="noopener" href="https://wa.me/' + WA + '">' + T("واتساب", "WhatsApp") + '</a><a class="btn btn-sm btn-line" href="mailto:' + MAIL + '">' + MAIL + '</a></div></div>';
function box(h) { $("#mtgBox").innerHTML = h; if (window.MIGFLAGS && MIGFLAGS.apply) MIGFLAGS.apply(); } /* the switches' notice in the new markup */
/* shown only while the owner has switched Janna's live calls off (data/flags.js [data-mig-off]; the Worker refuses the call too) */
function offNote() { return '<div class="mtgst warn" data-mig-off="janna_live" hidden>' + T("مكالمات جنة المباشرة موقوفة مؤقتاً — تقدر تكلّمها كتابة من «اسأل جنة»، أو تكلّمنا على واتساب المنصة أو الإيميل ونحدد معاك ميعاد.", "Live calls with Janna are paused for now — you can still write to her via «Ask Janna», or reach us on the platform's WhatsApp or by e-mail to set a time.") + '</div>'; }
function contact(msg) {
  var wa = "https://wa.me/" + WA + "?text=" + encodeURIComponent(msg);
  return '<div class="mtga"><a class="btn btn-green" target="_blank" rel="noopener" href="' + esc(wa) + '">💬 ' + T("واتساب المنصة", "The platform's WhatsApp") + '</a><a class="btn btn-line" href="mailto:' + MAIL + '?subject=' + encodeURIComponent(T("اجتماع تعريفي مع جنة", "Introductory meeting with Janna")) + '">✉️ ' + MAIL + '</a></div>';
}
function liveBtn(label) { return offNote() + '<button type="button" class="mtgbtn" id="mtgNow"><i></i>' + label + '</button>'; }
function bindNow(intent) { var b = $("#mtgNow"); if (b) b.onclick = function () { if (window.JANNA_LIVE) JANNA_LIVE.open(intent ? { intent: intent } : { screen: "home.html" }); }; }
var id = ((/^#([a-f0-9]{20})$/.exec(location.hash || "") || [])[1]) || "";
function state(kind, extra) {
  clearInterval(TMR);
  if (kind === "noid") {
    hero(T("صفحة الاجتماعات مع جنة", "Meetings with Janna"), T("افتح الصفحة من الرابط اللي وصلك على الإيميل، أو احجز اجتماع جديد مع جنة.", "Open this page from the link in your email, or book a new meeting with Janna."));
    box('<h2>' + T("احجز اجتماع مع جنة", "Book a meeting with Janna") + '</h2><p class="mtgn">' + T("اضغط الزرار وقول لجنة «عايز اجتماع تعريفي دلوقتي»، أو قولها اليوم والساعة اللي يناسبوك وهي تحجز الموعد وتبعتلك الرابط على الإيميل تلقائي.", "Press the button and tell Janna “I'd like an introductory meeting now”, or tell her the day and time that suit you: she books it and e-mails you the link automatically.") + '</p><div class="mtga">' + liveBtn(T("ابدأ مع جنة", "Start with Janna")) + '</div>');
    bindNow("meeting"); return;
  }
  if (kind === "offline") {
    box('<div class="mtgst warn">' + T("صفحة الاجتماع هتشتغل بعد تفعيل سيرفر المنصة. لحد كده تقدر تكلّم جنة مباشرة.", "The meeting page works once the platform server is activated. Meanwhile you can talk to Janna directly.") + '</div><div class="mtga">' + liveBtn(T("كلّم جنة دلوقتي", "Talk to Janna now")) + '</div>' + contact(T("مرحباً، عندي اجتماع تعريفي مع جنة ورقمه: ", "Hello, I have an introductory meeting with Janna, id: ") + id));
    bindNow(); return;
  }
  if (kind === "unknown") {
    box('<div class="mtgst err">' + T("الرابط ده مش صحيح أو الاجتماع اتلغى.", "This link is not valid or the meeting was cancelled.") + '</div><p class="mtgn">' + T("اتأكد إنك فتحت الرابط كامل من الإيميل، أو احجز موعد جديد مع جنة.", "Check that you opened the full link from the email, or book a new time with Janna.") + '</p><div class="mtga">' + liveBtn(T("احجز مع جنة", "Book with Janna")) + '</div>' + contact(T("مرحباً، رابط الاجتماع مش شغّال: ", "Hello, my meeting link does not work: ") + id));
    bindNow(); return;
  }
  if (kind === "error") { box('<div class="mtgst err">' + T("تعذّر تحميل بيانات الاجتماع، جرّب تاني بعد شوية.", "Could not load the meeting, please try again shortly.") + '</div>' + contact(T("مرحباً، مش قادر أفتح صفحة الاجتماع: ", "Hello, I can't open my meeting page: ") + id)); return; }
  var st = Date.parse(M.starts_at), tzLocal = "";
  try { tzLocal = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  var whenCairo = fmt(st, "Africa/Cairo") + T(" (بتوقيت القاهرة)", " (Egypt time)");
  var whenLocal = tzLocal && tzLocal !== "Africa/Cairo" && fmt(st, tzLocal) !== fmt(st, "Africa/Cairo") ? '<div class="mtgl">' + T("بتوقيتك المحلي: ", "Your local time: ") + esc(fmt(st, tzLocal)) + ' (' + esc(tzLocal) + ')</div>' : "";
  hero((M.first_name ? T("أهلاً ", "Hello ") + M.first_name + T("، ", ", ") : "") + T("اجتماعك التعريفي مع جنة", "your introductory meeting with Janna"), T("جنة هتعرّفك على المنصة، وتعمل معاك جولة على الشاشة، وتساعدك تختار الباقة المناسبة وتسجّل.", "Janna will introduce the platform, give you a screen tour, and help you choose the right plan and register."));
  if (kind === "ended") {
    box('<h2>' + T("الاجتماع انتهى", "This meeting has ended") + '</h2><div class="mtgw">' + esc(whenCairo) + '</div><div class="mtgst ok">' + T("لو الاجتماع بدأ مع جنة هيوصلك ملخصه على بريدك، ومعاه التسجيل والنص لو كنت وافقت على التسجيل.", "If the meeting took place with Janna, its summary will reach your email, with the recording and transcript if you agreed to the recording.") + '</div><div class="mtga"><a class="btn btn-gold" href="' + lang("register.html") + '">✍️ ' + T("كمّل التسجيل", "Continue to registration") + '</a></div>');
    return;
  }
  if (kind === "expired") {
    box('<h2>' + T("موعد الاجتماع فات", "This meeting time has passed") + '</h2><div class="mtgw">' + esc(whenCairo) + '</div><p class="mtgn">' + T("ولا يهمك، احجز موعد جديد مع جنة أو كلّمها دلوقتي.", "No problem: book a new time with Janna or talk to her now.") + '</p><div class="mtga">' + liveBtn(T("كلّم جنة دلوقتي", "Talk to Janna now")) + '</div>' + contact(T("مرحباً، فاتني موعد الاجتماع التعريفي مع جنة وعايز موعد جديد.", "Hello, I missed my introductory meeting with Janna and would like a new time.")));
    bindNow(); return;
  }
  /* upcoming / open */
  box('<h2>' + T("موعد الاجتماع", "Meeting time") + '</h2><div class="mtgw">' + esc(whenCairo) + '</div>' + whenLocal
    + '<div class="mtgcd" id="mtgCd" aria-label="' + T("العد التنازلي", "Countdown") + '"></div>'
    + '<label class="mtgok"><input type="checkbox" id="mtgOk"><span>' + T("موافق على تسجيل الاجتماع (صوت وصورة ونص المحادثة) وإرسال التسجيل والنص والملخص لبريدي. من غير الموافقة مش هنحفظ تسجيل ولا نص للمحادثة، وهيوصلك ملخص مكتوب من بياناتك ومحاور الاجتماع بس. اختيارك هنا وقت الدخول هو اللي بيتنفّذ، حتى لو كنت وافقت وقت الحجز.", "I agree to the meeting being recorded (audio, video and the conversation transcript) and the recording, transcript and summary being sent to my email. Without consent no recording or transcript is kept, and you only get a written summary of your details and the agenda. Your choice here when you join is what applies, even if you agreed when booking.") + '</span></label>'
    + offNote() + '<div class="mtga"><button type="button" class="mtgbtn" id="mtgGo" disabled><i></i>' + T("ادخل الاجتماع", "Join the meeting") + '</button><a class="btn btn-line" href="' + esc(API + "/" + id + "/ics") + '" download="meeting.ics">📅 ' + T("أضف للتقويم", "Add to calendar") + '</a></div><p class="mtgn" id="mtgHint"></p>');
  $("#mtgGo").onclick = function () {
    if (!window.JANNA_LIVE) return;
    entered = true;
    /* the click is the user gesture that unlocks audio; Janna's overlay opens in meeting mode linked to this meeting id */
    JANNA_LIVE.open({ meeting: { id: id, kind: "scheduled", name: M.first_name || "", consent: $("#mtgOk").checked }, screen: "home.html" });
    $("#mtgHint").textContent = T("لو قفلت نافذة جنة تقدر تدخل تاني من نفس الزرار.", "If you close Janna's window you can join again with the same button.");
  };
  function tick() {
    var now = Date.now(), left = st - now, open = left <= EARLY && now <= st + LATE, cd = $("#mtgCd"), go = $("#mtgGo"), h = $("#mtgHint");
    if (!cd) return clearInterval(TMR);
    if (now > st + LATE && !entered) return state("expired");
    var s = Math.max(0, Math.floor(left / 1000)), d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
    cd.innerHTML = (d ? '<div><b>' + d + '</b><span>' + T("يوم", "days") + '</span></div>' : "") + '<div><b>' + z2(hh) + '</b><span>' + T("ساعة", "hours") + '</span></div><div><b>' + z2(mm) + '</b><span>' + T("دقيقة", "min") + '</span></div><div><b>' + z2(ss) + '</b><span>' + T("ثانية", "sec") + '</span></div>';
    go.disabled = !open;
    if (!entered) h.textContent = open ? (left > 0 ? T("الاجتماع مفتوح، تقدر تدخل دلوقتي وجنة مستنياك.", "The meeting room is open: you can join now, Janna is waiting.") : T("الاجتماع بدأ، ادخل دلوقتي.", "The meeting has started: join now.")) : T("زرار الدخول بيتفعّل قبل الموعد بـ 10 دقايق.", "The join button is enabled 10 minutes before the start.");
  }
  tick(); TMR = setInterval(tick, 1000);
}
if (!id) state("noid");
else fetch(API + "/" + id, { headers: { Accept: "application/json" } }).then(function (r) {
  if ((r.headers.get("content-type") || "").indexOf("application/json") < 0) return state("offline");
  return r.json().then(function (j) {
    if (r.status === 404) return state("unknown");
    if (!r.ok || !j || !j.starts_at) return state("error");
    M = j; var st = Date.parse(j.starts_at);
    if (j.status === "ended") return state("ended");
    if (j.status === "cancelled") return state("unknown");
    if (j.status === "missed" || Date.now() > st + LATE) return state("expired");
    state("open");
  });
}, function () { state("offline"); });
''')
# not for search engines: personal meeting links
_seo_head_mtg = seo_head
def seo_head(key, title):
    return '<meta name="robots" content="noindex, nofollow">\n' if key == 'meeting' else _seo_head_mtg(key, title)
_seo_files_mtg = seo_files
def seo_files(OUT, keys):
    return _seo_files_mtg(OUT, [k for k in keys if k != 'meeting'])
