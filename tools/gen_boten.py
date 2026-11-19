# Builds data/bot-en.js (English texts + keywords for the assistant «حسن» in data/bot.js) from the translator output.
# Keys in bot_en.json are raw JS literals (with \n escapes); they are decoded so they match the runtime strings.
import json, sys
SP = '/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/'
src = json.load(open(SP + 'bot_en.json', encoding='utf-8'))
kw = json.load(open(SP + 'bot_kw_en.json', encoding='utf-8'))
def dec(lit):
    try: return json.loads('"' + lit + '"')
    except Exception: return lit.replace('\\n', '\n').replace('\\"', '"')
out = {dec(k): dec(v) for k, v in src.items()}
out.update({
    '💬 تواصل مع خدمة العملاء (واتساب)': '💬 Contact customer service (WhatsApp)',
    'حسن يكتب…': 'Hassan is typing…',
})
js = '/* English texts for the assistant «حسن» (Hassan), used by data/bot.js when the site is in English. */\nwindow.MIGBOT_EN=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\nwindow.MIGBOT_KW=' + json.dumps(kw, ensure_ascii=False, separators=(',', ':')) + ';\n'
open('/home/user/madeinegyptgate/data/bot-en.js', 'w', encoding='utf-8').write(js)
print(len(out), 'texts,', len(kw), 'keyword topics,', len(js), 'bytes')
