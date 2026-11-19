/* AES-GCM secret store for the Control Center (gateway keys, mail provider key, optional Anam key).
   Key material: env.CONFIG_SECRET (≥ 32 chars, `openssl rand -hex 32`), stretched with HKDF-SHA256 (salt "mig-cc", info "secrets-v1").
   A sealed value is "v1.<b64url iv(12)>.<b64url ciphertext+tag>"; AAD = "cc-secret|<name>" binds it to its slot.
   Plaintext never leaves the Worker: APIs return {set, tail, set_at, set_by} only. Leaf module: imports nothing. */
const te = new TextEncoder(), td = new TextDecoder();
const b64u = u8 => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const KEYS = new WeakMap(); // env → CryptoKey (per isolate)
export const configSecretOk = env => !!(env && typeof env.CONFIG_SECRET === "string" && env.CONFIG_SECRET.length >= 32);
async function key(env) {
  if (!configSecretOk(env)) { const e = new Error("CONFIG_SECRET missing or shorter than 32 characters"); e.code = "config_secret_missing"; throw e; }
  let k = KEYS.get(env); if (k) return k;
  const base = await crypto.subtle.importKey("raw", te.encode(env.CONFIG_SECRET), "HKDF", false, ["deriveKey"]);
  k = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: te.encode("mig-cc"), info: te.encode("secrets-v1") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  KEYS.set(env, k); return k;
}
export async function seal(env, name, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode("cc-secret|" + name) }, await key(env), te.encode(String(plaintext)));
  return "v1." + b64u(iv) + "." + b64u(new Uint8Array(ct));
}
export async function unseal(env, name, sealed) {            // → plaintext string, or null when missing / tampered / other CONFIG_SECRET
  const p = String(sealed || "").split("."); if (p.length !== 3 || p[0] !== "v1") return null;
  try { return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(p[1]), additionalData: te.encode("cc-secret|" + name) }, await key(env), unb64u(p[2]))); }
  catch (e) { if (e && e.code === "config_secret_missing") throw e; return null; }
}
export const maskTail = s => { s = String(s || ""); return s.length <= 8 ? "" : s.slice(-4); };
export async function putSecret(env, name, value, by) {      // value "" → delete
  if (!value) { await env.DB.prepare("DELETE FROM cc_secrets WHERE name = ?").bind(name).run(); return { set: false }; }
  const sealed = await seal(env, name, value), at = new Date().toISOString();
  await env.DB.prepare("INSERT INTO cc_secrets (name, sealed, tail, set_by, set_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET sealed = excluded.sealed, tail = excluded.tail, set_by = excluded.set_by, set_at = excluded.set_at")
    .bind(name, sealed, maskTail(value), String(by || ""), at).run();
  return { set: true, tail: maskTail(value), set_at: at };
}
export async function getSecret(env, name) {                 // → plaintext | "" (not set) | null (set but unreadable)
  const r = await env.DB.prepare("SELECT sealed FROM cc_secrets WHERE name = ?").bind(name).first();
  if (!r) return ""; return unseal(env, name, r.sealed);
}
export async function secretInfo(env, names) {                // → {name: {set, tail, set_at, set_by, readable}}
  const out = {}; for (const n of names) out[n] = { set: false, tail: "", set_at: "", set_by: "", readable: false };
  const { results } = await env.DB.prepare(`SELECT name, sealed, tail, set_at, set_by FROM cc_secrets WHERE name IN (${names.map(() => "?").join(",")})`).bind(...names).all();
  for (const r of results || []) out[r.name] = { set: true, tail: r.tail, set_at: r.set_at, set_by: r.set_by, readable: configSecretOk(env) && (await unseal(env, r.name, r.sealed)) !== null };
  return out;
}
