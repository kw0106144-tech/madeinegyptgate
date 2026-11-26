/* ONE guarded Workers AI text call («بحث وكتابة عميقة», design part A §A.5) — the photo pattern of chat-media.js lookImage generalised to
   text: the request shape follows the model, one call raced against a timeout, the JSON taken leniently, the usage turned into neurons,
   the provider's error mapped to a code. Rules:
   - env.AI.run gets EXACTLY two arguments, or three with {rejectIfBusy: true} — NEVER a gateway option: AI Gateway logs keep the prompt
     (design ai-facts §2.4). A test asserts it.
   - Workers AI only: zero data retention, no training on the inputs (ai-facts §2.4); no third-party LLM here.
   - The model's own error message (≤ 300 characters) is returned for the owner's test only («🧪 تجربة موديل نصي»), never logged with text.
   - MODEL_ALLOW = the only models the owner may pick («🛠️ المطوّر» → «🧪 الذكاء الاصطناعي»); retired models are not in it.
   Shapes (ai-facts §2.2): "native" {messages, max_tokens, response_format:{type:"json_schema", json_schema}} → {response} (Llama 4 Scout,
   Llama 3.3, Mistral); "chat" (chat-completions) {messages, max_completion_tokens, response_format:{type:"json_schema", json_schema:{name,
   schema, strict}}, chat_template_kwargs / reasoning_effort} → {choices[0].message.content} (Gemma 4, gpt-oss, Qwen 3.8, DeepSeek V4.1,
   Inkling 2). The exact reasoning parameter of each model is confirmed by the owner's test before anything is switched on. */
export const MODEL_ALLOW = Object.freeze([
  "@cf/google/gemma-4-26b-a4b-it", "@cf/openai/gpt-oss-120b", "@cf/openai/gpt-oss-20b", "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/qwen/qwen3.8-27b", "@cf/deepseek-ai/deepseek-v4.1-flash-1017", "@cf/thinkingmachines/inkling-2-small",
]);
/* Paid-only models (20 requests a minute per account): members' jobs only */
export const PAID_ONLY = Object.freeze(["@cf/deepseek-ai/deepseek-v4.1-flash-1017", "@cf/thinkingmachines/inkling-2-small"]);
/* neurons per million tokens [in, out] (the pricing page, ai-facts §2.2; $0.011 per 1,000 neurons) */
export const MODEL_RATES = Object.freeze({
  "@cf/google/gemma-4-26b-a4b-it": [9091, 27273], "@cf/openai/gpt-oss-120b": [31818, 68182], "@cf/openai/gpt-oss-20b": [18182, 27273],
  "@cf/meta/llama-4-scout-17b-16e-instruct": [24545, 77273], "@cf/qwen/qwen3.8-27b": [40909, 290909],
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017": [27273, 109091], "@cf/thinkingmachines/inkling-2-small": [27273, 90909],
});
export const USD_PER_NEURON = 0.011 / 1000;
export const DEFAULT_MODELS = Object.freeze({ research_bassem: "@cf/openai/gpt-oss-120b", research_janna: "@cf/google/gemma-4-26b-a4b-it", fallback: "@cf/google/gemma-4-26b-a4b-it", fallback2: "@cf/meta/llama-4-scout-17b-16e-instruct" });
export const AI_TIMEOUT_MS = 120000;
const CHAT_RX = /^@cf\/(?:google\/gemma-4|openai\/gpt-oss|qwen\/qwen3\.8|deepseek-ai\/deepseek-v4|thinkingmachines\/inkling|zai-org\/glm-|moonshotai\/kimi)/i;
export const shapeOf = model => (CHAT_RX.test(String(model || "")) ? "chat" : "native");
export const modelOk = m => MODEL_ALLOW.includes(String(m || ""));
export const aiOn = env => !!(env && env.AI && typeof env.AI.run === "function");
const REASON = new Set(["low", "medium", "high"]);

/* the exact request of one call — o: {system, user, schema, maxTokens, temperature, reasoning: "off"|"low"|"medium"|"high"} */
export function textInput(model, o = {}) {
  const messages = [{ role: "system", content: String(o.system || "") }, { role: "user", content: String(o.user || "") }];
  const max = Math.max(64, Math.min(Math.floor(+o.maxTokens || 1024), 8192)), temp = Number.isFinite(+o.temperature) ? Math.max(0, Math.min(+o.temperature, 1)) : 0.3;
  const r = String(o.reasoning || "").toLowerCase();
  if (shapeOf(model) === "chat") {
    const x = { messages, max_completion_tokens: max, temperature: temp };
    if (o.schema) x.response_format = { type: "json_schema", json_schema: { name: "document", schema: o.schema, strict: true } };
    if (/gemma-4/.test(model)) x.chat_template_kwargs = { enable_thinking: r !== "" && r !== "off" && REASON.has(r) };
    else if (REASON.has(r)) x.reasoning_effort = r;
    return x;
  }
  const x = { messages, max_tokens: max, temperature: temp };
  if (o.schema) x.response_format = { type: "json_schema", json_schema: o.schema };
  return x;
}
/* the text inside either answer shape (a string, an object answer, or content parts) */
export function textOf(res) {
  let r = res;
  if (r && typeof r === "object" && !Array.isArray(r)) {
    if (Array.isArray(r.choices)) { const c = r.choices[0]; r = c && c.message && typeof c.message === "object" ? c.message.content : c && typeof c.text === "string" ? c.text : null; }
    else if (Object.prototype.hasOwnProperty.call(r, "response")) r = r.response;
    else return r;
  }
  if (Array.isArray(r)) r = r.map(p => (p && typeof p === "object" && typeof p.text === "string" ? p.text : typeof p === "string" ? p : "")).join("");
  return r;
}
/* the JSON object of an answer: an object as it is, else the first «{» to the last «}» of the text (models that ignore response_format) */
export function jsonOf(res) {
  const r = textOf(res);
  if (r && typeof r === "object" && !Array.isArray(r)) return r;
  if (typeof r !== "string") return null;
  const a = r.indexOf("{"), b = r.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { const o = JSON.parse(r.slice(a, b + 1)); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch (e) { return null; }
}
/* usage of either shape → {in, out} tokens (0 when the model gave none) */
export function usageOf(res) {
  const u = res && typeof res === "object" ? res.usage || null : null;
  const n = v => Math.max(0, Math.floor(+v || 0));
  return u ? { in: n(u.prompt_tokens != null ? u.prompt_tokens : u.input_tokens), out: n(u.completion_tokens != null ? u.completion_tokens : u.output_tokens) } : { in: 0, out: 0 };
}
export function neuronsOf(model, usage) {
  const r = MODEL_RATES[model] || [40909, 290909]; // an unknown model is billed at the dearest rate of the list (never under-counted)
  return Math.ceil(((usage && usage.in) || 0) * r[0] / 1e6 + ((usage && usage.out) || 0) * r[1] / 1e6);
}
/* the estimate a reservation takes BEFORE a call: input characters / 3 ≈ tokens (Arabic is not measured yet — a high guess) + the cap */
export const estimateNeurons = (model, chars, maxTokens) => neuronsOf(model, { in: Math.ceil(Math.max(0, chars) / 3), out: Math.max(0, maxTokens || 0) });
/* the provider's error → a code (ai-facts §2.3) */
export function codeOf(e) {
  const s = String((e && (e.message || e.code)) || e || "");
  if (/\b5028\b/.test(s)) return "model_retired";
  if (/\b3040\b/.test(s)) return "ai_busy";
  if (/\b3036\b/.test(s)) return "ai_free_used";
  if (/\b5035\b/.test(s)) return "ai_paid_only";
  if (/\b5016\b/.test(s)) return "ai_terms";
  if (/\b3007\b/.test(s)) return "ai_timeout";
  return "ai_error";
}
const TIMEOUT = new Error("ai timeout");
/* ONE call → {ok, model, shape, ms, json, text, usage, neurons, code, error}. o: textInput's fields + {timeoutMs, rejectIfBusy} */
export async function aiText(env, model, o = {}) {
  const t0 = Date.now(), shape = shapeOf(model), input = textInput(model, o), ms0 = Math.max(10, Math.min(+o.timeoutMs || AI_TIMEOUT_MS, 300000));
  let res = null, code = "", error = "", tm = 0;
  if (!aiOn(env)) return { ok: false, model, shape, ms: 0, json: null, text: "", usage: { in: 0, out: 0 }, neurons: 0, code: "ai_off", error: "" };
  try {
    res = await Promise.race([Promise.resolve().then(() => (o.rejectIfBusy ? env.AI.run(model, input, { rejectIfBusy: true }) : env.AI.run(model, input))),
      new Promise((_, rej) => { tm = setTimeout(() => rej(TIMEOUT), ms0); })]);
  } catch (e) {
    code = e === TIMEOUT ? "ai_timeout" : codeOf(e);
    if (e !== TIMEOUT) { try { error = String((e && e.message) || e || "").replace(/\s+/g, " ").trim().slice(0, 300); } catch (x) { error = ""; } }
  } finally { clearTimeout(tm); }
  const ms = Date.now() - t0;
  if (code) return { ok: false, model, shape, ms, json: null, text: "", usage: { in: 0, out: 0 }, neurons: 0, code, error };
  const usage = usageOf(res), json = o.schema ? jsonOf(res) : null, t = textOf(res);
  const text = typeof t === "string" ? t : t && typeof t === "object" ? JSON.stringify(t) : "";
  return { ok: o.schema ? !!json : !!text, model, shape, ms, json, text: text.slice(0, 60000), usage, neurons: neuronsOf(model, usage), code: o.schema && !json ? "bad_json" : "", error: "" };
}
