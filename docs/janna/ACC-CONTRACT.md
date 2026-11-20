# ACC-CONTRACT — Admin Control Center (panel.html) + customer dashboard self-service

**Status:** normative build contract for "deploy 2" (the owner's request «الداش بورد الحاليه في الموقع متشيلعاش ضيف عليها اللي احنا قولنا عليه» → «تمام»).
**Written:** 2026-11-18 by the architect, from the real code (worker/src/*.js, worker/schema.sql + migrations 0002–0005, worker/wrangler.toml,
worker/test/helpers.mjs, functions/_middleware.js + functions/_lib/seo-*.js, data/*.js, site.py as changed by deploy 1 at 09:11, dash.part.html,
register.part.py, inbox.part.py, seo-admin.part.py, seo_build.part.py, seo/config.json, tools/dump-data.mjs, worker/build-index.js, deploy/*)
and the live system copies in docs/janna/legacy-live/. Reconciled with deploy 1 (BACKLOG 19 team flow, candidates.js, login links, clean
URLs, legacy-live.txt) as it stood at 09:32 — deploy 1 was still being integrated, so every anchor in §10.3 is a locator to re-derive.
**Readers:** the six builders (acc-core, content, payments, email, admin-ui, site-side) and the final integrator.

Words: MUST / MUST NOT / SHOULD are binding. "Integrator" = the final integration step that owns every EXISTING file. "Builder" = one of the
six areas; a builder creates only the NEW files listed for it in §10 and writes every change it needs in an existing file, as an exact patch,
into `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad/acc/<area>-INTEGRATION.md`.

---

## 0. Architecture in one page

```
                       ┌────────────────────────────── Cloudflare zone madeinegyptgate.com ─────────────────────────────┐
 browser ──► Pages (static build + functions/_middleware.js SEO edge + /api/seo/* Pages Function, KV SEO_KV "seo:bundle")
        └──► Worker "janna-lookup" (specific routes only — never /api/*):
               existing  /api/janna /api/advisor /api/meetings /api/auth/* /api/me[/*] /api/inquiries* /api/admin/* /api/ev /api/unsub* /api/wa/*
               NEW       /api/admin/cc/*            Control Center API (acc.js router → content.js, payments.js, email-center.js)
                         /api/me/{account,products,company,media,invoices,recognize}[/*]   member self-service (acc.js)
                         /api/auth/legacy[/*]        old-password bridge (acc.js)
                         /api/plans  /api/settings   public JSON (acc.js)
                         /api/ev/pv                  privacy-preserving page analytics (acc.js)
                         /api/pay/*                  invoices, checkout, provider returns + webhooks (payments.js)
                         /data/overlay.js            compiled published edits (content.js) — overrides the static no-op file
                         /media/u/*                  public uploaded images from R2 MEDIA (content.js)
                         /api/index.php*             transparent proxy to the OLD PHP API (acc.js `handleOldApi`, same as mis-egypt) — built and
                                                     tested, but NOT routed in deploy 2: the path stays on the owner's Worker mis-egypt
                                                     (deploy/legacy-live.txt) so no route changes hands (§10.3 P-W7, P-T6)
               bindings  DB (D1 migate-db) · MEDIA (R2 migate-media) · SEO_KV (KV b321fb348f3447179c99b4380952e5ac, same namespace as Pages)
               secrets   + CONFIG_SECRET (new, AES-GCM key material) · optional RESEND_API_KEY / BREVO_API_KEY · ANAM_API_KEY · PLATFORM_KEY …
```

* **One system.** The new admin dashboard lives at the SAME URL `panel.html` (live look, live sections, live labels and order, all backed by the
  Worker) plus every new section. `admin.html` redirects to `panel.html`. `login.html` keeps its URL (e-mail code + «حساب قديم؟ ادخل بالباسورد بتاعك»).
  `dashboard.html` keeps every tab and gains «منتجاتي» and «ملف الشركة» and the live status line. New public page `pay.html`.
* **Static site, live edits.** Public pages read `window.*` data from data/*.js. Admin edits are stored in D1 and compiled into ONE file served at
  `/data/overlay.js`; `data/mig-overlay.js` (client applier) installs accessor setters BEFORE the data files run, so every page — including
  `factories.html`, which loads oldfac.js `async` — sees the patched arrays. The daily production build (deploy/deploy.sh, 02:37 UTC) pulls the
  published overlay and bakes it into the generated SEO pages; until then hidden/deleted items get `noindex`/redirect at the edge through the
  existing SEO API (single writer of `seo:bundle`), and the panel lists what still waits for a rebuild.
* **Nothing removed.** The old PHP system stays reachable at the same `/api/index.php*` URL (mis-egypt keeps exactly that route); its data is
  imported (owner-only tool) and the old password still signs members in (server-side bridge straight to `LEGACY_ORIGIN`, never stored).
* **Plans matrix = single source of truth** for prices, limits, geographic scope and feature switches: Worker (via `planCan()` + in-place scope
  mutation), site (via the overlay and `data/plans-live.js`), invoices, and the Janna/Bassem persona prompts (plans section only).
* **No invented numbers, no demo rows.** Every count comes from D1, the data files or the analytics tables; empty states say so.

### 0.1 Ground rules every builder MUST follow
1. Owner decisions: everything automatic in normal flows; registered factories (basic+) get matching requests automatically; non-registered
   directory factories are never contacted; factory personal phones/e-mails are never rendered publicly (imported legacy contacts are admin-only);
   no sample/demo data anywhere; unverified things are hidden, not labelled (public site); Arabic first with full English parity; RTL/LTR correct;
   usable at 390×844.
2. Security: every `/api/admin/cc/*` request needs a server-verified v2 session (`authUser()` from worker/src/auth.js) whose member has a Control
   Center role (§0.5), or `X-Platform-Key` (= `env.PLATFORM_KEY`, constant-time compare). Every admin write is audit-logged (§0.6). Secrets only via
   worker/src/crypto.js (AES-GCM with `CONFIG_SECRET`), never returned to the browser. Webhooks verified and idempotent (§5). Uploads validated (§4.11).
   Every admin/overlay string is neutralised server-side and escaped client-side (§0.4). CORS limited to the site origins (§0.3). Rate limits on every
   public endpoint. No PII in logs (`console.*`) beyond ids.
3. Never deploy, never call Cloudflare/Resend/Brevo/Anam/payment APIs with write effects, never send real e-mail or WhatsApp. Tests mock `fetch`.
4. Do not edit existing files (§10.1 list). Do not create files you do not own. If your tests need another area's module before it exists, wait or
   stub it inside your own test file (dependency injection, §0.2) — never create it.
5. ES modules, no new npm dependencies (worker), ES5 browser JS (site, panel) — same style as the existing code. Node ≥ 22.12 test runner.

### 0.2 Module boundaries and dependency injection (no cross-area imports)
New Worker modules MUST NOT import each other statically (they are built in parallel). Cross-area calls go through one object, `CC`, that the
integrator builds in worker/src/index.js and passes to every new handler:

```js
// worker/src/index.js (integrator)
import * as ACC from "./acc.js"; import * as CONTENT from "./content.js"; import * as PAY from "./payments.js"; import * as MAILC from "./email-center.js";
const CC = { acc: ACC, content: CONTENT, payments: PAY, email: MAILC };
```

Allowed static imports for new modules:

| module | may import |
|---|---|
| `crypto.js` (payments area; leaf) | nothing |
| `email-center.js` | `./crypto.js` only (it is imported BY common.js and advisor.js after integration — importing common.js would create a load-time cycle) |
| `content.js` | `./common.js`, `./auth.js`, `./crypto.js`, `./data.json` (base counts for `contentCounts`; tests load it through test/json-loader.mjs) |
| `payments.js` | `./common.js`, `./auth.js`, `./crypto.js`, `./meetings.js` (`cairoLocal`, `cairoToUtc`) |
| `acc.js`, `acc-*.js` | `./common.js`, `./auth.js` (incl. deploy 1's `signLoginLink`, `dashLoginUrl`), `./crypto.js`, `./inquiries.js` (`buyerUpdate`, `asInq`, `REF_RX`, `routeInquiry`, `rematchForMember`, `trackUrl`, `respondUrl`, `handleInquiries`, `inquiryListItem`, `statusLabel`, and deploy 1's `needsTeam`, `routable`, `teamReply`, `teamFlow`, `latestCandidates`, `refreshCandidates`), `./candidates.js` (deploy 1: `directoryCandidates`, `webProvider`), `./meetings.js` (`cairoToUtc`, `cairoLocal`), `./whatsapp.js` (`e164`), `./text.js` (`norm`, `tokens`, `stem`), `./data.json` |

Deploy 1 ("BACKLOG 19 + clean URLs") was still being integrated while this contract was written (files changed up to 09:32). Every function named
above was present at that time; if one is renamed before deploy 2 starts, the integrator maps the name — builders never re-implement it.

Every other cross-area call uses `CC.<area>.<fn>(…)`. Tests pass a fake `CC`. Module-level caches MUST be keyed by `env.DB` (a `WeakMap`), because the
test suite creates many envs in one process.

### 0.3 HTTP conventions (same as the existing Worker)
* JSON in, JSON out; success = an object; error = `{error: "<human text>", code: "<snake_case>", ...extra}` with the HTTP status below.
* Common codes: 400 `bad_json` `required` `invalid_<field>` · 401 `unauthorized` · 403 `forbidden` `owner_only` `plan` `use_email_code` ·
  404 `not_found` · 405 `method` · 409 `conflict` `state` `exists` `locked` · 413 `too_large` · 415 `unsupported_type` · 422 `invalid` (with
  `errors:[{field, msg}]`) · 429 `rate_limited` `limit` · 502 `provider_error` · 503 `store_off` `kv_off` `media_off` `config_secret_missing`
  `legacy_off` `email_off`.
* Body limit 64 KB (`readJson()` from common.js) unless stated (uploads 5 MB raw, import batches 512 KB).
* Paging: `?page=<0-based>&limit=<1..200, default 50>` → `{items, total, page, limit}`. Sorting is fixed per endpoint (newest first unless stated).
* CORS for every NEW endpoint: `Access-Control-Allow-Origin` echoes the request `Origin` only when it is `https://madeinegyptgate.com`,
  `https://www.madeinegyptgate.com` or listed in `env.CC_ORIGINS` (comma separated, e.g. `http://localhost:8780` for local tests); otherwise no
  CORS header. `Vary: Origin`. Methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`; headers `Content-Type, Authorization, X-Platform-Key`.
  Provider webhooks and `/data/overlay.js`, `/media/u/*` send no credentialed CORS (`/media/u/*` may send `Access-Control-Allow-Origin: *`).
  common.js `json()`/`err()`/`preflight()` always add `Access-Control-Allow-Origin: *` (existing endpoints), so new modules MUST answer through
  their own wrapper — `ccJson(req, env, body, status = 200, extra)` / `ccErr(req, env, status, code, msg, extra)` / `ccPreflight(req, env)` =
  the same `Content-Type`/`Cache-Control: no-store` plus `X-Content-Type-Options: nosniff`, `Vary: Origin` and `ccCors(req, env)` (the echo
  rule above, nothing for any other origin). Each new module carries its own copy (≤ 15 lines; no cross-area import).
* `Cache-Control: no-store` on every JSON response; `X-Content-Type-Options: nosniff` everywhere.
* Times: ISO-8601 UTC strings (`new Date().toISOString()`); "Cairo day" = `cairoDay()` from common.js. Dates typed by admins: `YYYY-MM-DD`.
* Money: integer minor units (piasters) in D1 and APIs (`*_minor`), plus `price_egp` (integer pounds) for plan prices; currency `EGP`.
  VAT basis points `vat_bp` (1400 = 14 %). `vat_minor = Math.round(net_minor * vat_bp / 10000)`.
* CSV: UTF-8 with BOM, `\n` line ends, every cell quoted (`"` doubled), formula guard: a cell that starts with `=`, `+`, `-`, `@`, TAB or CR is
  prefixed with `'`. Header row = API field names. File name `<section>-<YYYY-MM-DD>.csv`.
* Ids: random ids use the alphabet `23456789abcdefghjkmnpqrstuvwxyz` (31 chars, like inquiries' REF alphabet, lower case): `rid(n)`.
* Rate limits use `rateOk(env, key, limit, windowSec)` from common.js (table `rl`). Admin writes: 120/min per actor. Public endpoints: per endpoint below.

### 0.4 Text safety (no stored XSS) — normative for content.js, acc.js, payments.js and the applier
Server side, every free-text field that can reach a public page is passed through `neutral(s)`:
```js
const neutral = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  .replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/'/g, "’").replace(/`/g, "ˋ").trim();
```
(single-line fields additionally collapse `\s+` to one space). This makes a value harmless in HTML text, double- AND single-quoted attributes and
JS string literals, even where an existing consumer forgets to escape. URL fields are NOT neutralised; they are validated: `https:` absolute URLs
(no credentials, no spaces/quotes/angle brackets, ≤ 500 chars) or same-site relative paths matching `^/(media/u|img)/[A-Za-z0-9/_\-.]+$` or
`^img/[A-Za-z0-9/_\-.]+$`. `javascript:`, `data:` and protocol-relative `//` are refused (`invalid_url`). Public text of the directory/products
collections and member submissions MUST NOT contain phone numbers, WhatsApp numbers or e-mail addresses (`invalid_contact`; same rule as
functions/_lib/seo-privacy.js). The client applier (data/mig-overlay.js) re-applies `neutral()` to every string it writes into a data array
(defence in depth) and builds HTML only through its own `esc()`. The overlay JSON is serialised with `<` → `<`, U+2028 → ` `,
U+2029 → ` `.

### 0.5 Roles and permissions
Roles: `owner`, `admin`, `editor`, `support`. Resolution (`roleOf(env, member, sessionVia)` in acc.js, normative order):
1. `sessionVia === "legacy"` (session created by the old-password bridge, table `cc_session_meta`) → **no role** (403 `use_email_code`).
2. Member e-mail in `env.ADMIN_EMAILS` AND `members.email_verified_at != ''` → `owner` (bootstrap; cannot be changed or removed in the UI).
3. Row in `cc_staff` with `disabled_at = ''` → that role.
4. `members.role = 'admin'` (legacy admin flag) → `admin`.
5. else → none (panel shows the lock box «غير مصرّح لك بدخول هذه الصفحة», the live wording).
`X-Platform-Key` → pseudo-role `platform` = `admin` permissions minus every owner-only permission; audit actor `platform`.

Keeping existing modules working: when acc.js grants/changes a role it also sets `members.role`: owner/admin → `'admin'` (existing
`/api/admin/*` inbox endpoints and `/api/seo/*` keep working for them), editor → `'seo'` (the SEO workspace's restricted role), support → `'user'`.
Removing a role sets `members.role = 'user'`. Bootstrap owners are never written to `cc_staff`.

Permissions (strings used in code; `adm.can(p)`):

| permission | owner | admin | editor | support |
|---|:-:|:-:|:-:|:-:|
| `stats.read` (home, badges) | ✓ | ✓ | ✓ | ✓ |
| `members.read` | ✓ | ✓ | — | ✓ |
| `members.write` (profile fields, create, invite) | ✓ | ✓ | — | — |
| `members.contact` (name, title, phone, company only) | ✓ | ✓ | — | ✓ |
| `members.plan` (plan, expiry, status/suspend) | ✓ | ✓ | — | — |
| `members.delete` (anonymise) | ✓ | — | — | — |
| `customers.read` / `customers.write` (notes, tags) | ✓/✓ | ✓/✓ | — | ✓/✓ |
| `directory.read` / `directory.write` | ✓/✓ | ✓/✓ | ✓/✓ | ✓/— |
| `directory.verify` (badge) · `directory.link` (company↔member) | ✓ | ✓ | — | — |
| `legacy.contacts` (imported e-mails/phones) | ✓ | ✓ | — | ✓ |
| `approvals.products` | ✓ | ✓ | ✓ | — |
| `approvals.company` (edits, claims, creates) | ✓ | ✓ | — | — |
| `orders.read` · `orders.reply` («إحنا اللي هنرد») · `orders.note` · `orders.close` | ✓ | ✓ | — | ✓ |
| `orders.rfq` (manual RFQ entry) | ✓ | ✓ | — | ✓ |
| `orders.resend` · `orders.block` (existing endpoints) | ✓ | ✓ | — | — |
| `content.read` / `content.write` / `content.publish` | ✓ | ✓ | ✓ | ✓/—/— |
| `content.toggle` (overlay emergency off) | ✓ | — | — | — |
| `media.upload` / `media.delete` | ✓ | ✓ | ✓/✓ | — |
| `plans.read` / `plans.write` / `plans.sync` | ✓ | ✓/✓/✓ | ✓/—/— | ✓/—/— |
| `pay.read` · `pay.invoice` (issue, void, resend) · `pay.mark_paid` | ✓ | ✓ | — | ✓/—/— |
| `pay.config` (provider, keys) | ✓ | — | — | — |
| `email.read` · `email.templates` · `email.test` | ✓ | ✓ | — | — |
| `email.config` (provider, key, sender) | ✓ | — | — | — |
| `settings.read` / `settings.write` | ✓ | ✓ | ✓/— | ✓/— |
| `seo.*` (through /api/seo roles: admin = members.role admin, editor = 'seo') | ✓ | ✓ | ✓ | — |
| `staff.read` | ✓ | ✓ | — | — |
| `staff.write` (owner: any role; admin: editor/support only) | ✓ | ✓* | — | — |
| `audit.read` / `audit.export` | ✓/✓ | ✓/— | — | — |
| `reports.read` / `reports.export` | ✓ | ✓ | — | — |
| `wa.read` · `bassem.read` | ✓ | ✓ | — | ✓ |
| `import.run` | ✓ | — | — | — |
| `meetings.bassem` («📞 اجتماعات باسم»: send Bassem to a Meet / Zoom / Teams call, list, cancel — never X-Platform-Key) | ✓ | ✓ | — | — |
| `meetings.cap` (the daily cap of those invites) | ✓ | — | — | — |

### 0.6 Audit log (acc.js exports `audit(env, e)`; the router passes `adm.audit`)
Every admin write (any non-GET under `/api/admin/cc/*`, the import, provider-driven activations, persona syncs, secret changes) inserts one
`cc_audit` row: `{at, actor_id, actor_email, actor_role, action, target_type, target_id, summary, before_json, after_json, ip_hash, req_id}`.
`before`/`after` are the changed fields only; values of any key matching `/pass|secret|token|api_?key|hmac|server_key/i` are replaced by
`"***"`; strings longer than 2,000 chars are cut. Action names: `<area>.<verb>` (e.g. `member.plan`, `member.status`, `content.publish`,
`content.hide`, `pay.config`, `pay.mark_paid`, `email.key`, `email.template`, `staff.add`, `import.apply`, `plans.save`, `persona.sync`,
`settings.save`, `order.team_reply`, `approval.product.approve`). If the audit insert fails, the write MUST fail (500 `audit_failed`) — never a
silent unaudited change. Retention: rows older than 730 days are purged by `ccCron` once a day.

### 0.7 Shared module `worker/src/crypto.js` (owned by payments; used by acc-core and email) — exact API and reference source
```js
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
```
Secret slot names (normative): `pay.ngenius.api_key`, `pay.ngenius.webhook_value`, `pay.paymob.secret_key`, `pay.paymob.hmac_secret`,
`pay.paytabs.server_key`, `mail.resend.api_key`, `mail.brevo.api_key`, `anam.api_key` (optional; else `env.ANAM_API_KEY`).
If `CONFIG_SECRET` changes, stored secrets become unreadable: status endpoints report `readable:false` and the UI asks the owner to re-enter them.

---
## 1. Information architecture

### 1.1 panel.html — shell (reproduces the live panel)
Built by **panel.part.py** as a standalone page (NOT through `page()`), exactly like the live `docs/janna/legacy-live/panel.html`:
`<html lang="ar" dir="rtl">`, `<title>لوحة الإدارة – صنع في مصر</title>`, `<meta name="robots" content="noindex,nofollow">`,
`<meta name="mig-acc" content="1">` (the smoke test's proof that the new panel answers, §11.6), the live CSS
verbatim (`:root{--g:#8E0B20;--g2:#A50E26;--r:#B42318;--line:#E5E9E7;--bg:#F4F6F5}`, `.lay` flex, 250 px maroon `aside` with `.lg` header
«صنع في مصر / لوحة الإدارة», grouped `nav` with `<h4>` group titles and `<button data-e>` items with `.bd` badges, `.ft` footer «مسجّل باسم
<b>…</b> · فتح الموقع ↗ · خروج», `main` with `#ph` page head and `#ct` content, `.kp/.kc` KPI cards, `.cd` cards, `.bar` filters, `table`, `.tag`
chips, `.pg` pager, `.note`, `#mo/#bx` modal, `#tt` toast, the 820 px breakpoint). Additions allowed: a ☰ toggle that collapses the aside on
≤ 820 px (35+ items), an EN/AR switch in `.ft`, `dir="auto"` on data cells, focus outlines, `prefers-reduced-motion`. Logic may move to
`data/acc.js` and CSS to `data/acc.css` (admin-ui owns both); the page loads, in order: `data/mig-api.js` (session token `mig-tok`, e-mail-code
dialog `MIGAPI.open()`), `data/mig-overlay.js` with `window.MIGOVL_ADMIN = 1` set before it (schema + row mappers, NO setters), `data/acc.js`.
Data files (`data/oldfac.js`, `oldfacd.js` on demand, `facx.js`+`factories.js`, `oldprod.js`, `oldtend.js`, `oldrfq.js`, `offers.js`,
`zones.js`, `real.js`, `videos.js`, `projects.js`, `regions.js`, `products.js`) are loaded lazily by the section that needs them, with their
build `?v=` hashes (panel.part.py runs after the pages loop, so it can call site.py's `_bust()`).

Language: `window.MIGLANG` from `?lang=en|ar` / localStorage `mig-lang` (same keys as data/i18n.js) but the panel does NOT load i18n.js or the
7.9 MB dictionary: every UI string is `T(ar, en)` in code; `<html lang dir>` switch with the language; numbers in Latin digits; dates
`ar-EG-u-nu-latn` / `en-GB`. Data values (Arabic company names…) are shown as stored with `dir="auto"`.

Boot: (1) no token → lock card with the live text «لوحة الإدارة» + «ادخل بكود على الإيميل» (`MIGAPI.open()`), link to login.html;
(2) `GET /api/admin/cc/whoami` → 401 → same; 403 → the live 403 page text «غير مصرّح لك بدخول هذه الصفحة» + «الرئيسية» link;
API unreachable (`code:"offline"`) → «لوحة التحكم مش متصلة بالسيرفر دلوقتي — جرّب تاني بعد شوية» (no cached rows ever shown);
(3) OK → render nav filtered by `perms`, open `#<section>` from the hash (default `home`), poll `GET /api/admin/cc/badges` every 60 s.
"خروج" → `MIGAPI.logout()` then `login.html`. Every list shows `جارٍ التحميل…`, then rows or the live empty text «لا توجد نتائج».
Destructive actions use the live `confirm("حذف نهائي؟ لا يمكن التراجع.")` pattern (or a modal with the item name typed for owner-only deletes).
Toasts say only what the server confirmed (`{ok:true}` / an id), e.g. «تم الحفظ ✓», «اتنشر ✓ (يظهر على الموقع خلال دقيقة)».

### 1.2 Navigation (live groups, labels and order first; new items inserted into the same navigation)
`GR` (key · AR label · EN label · badge · permission · backing API). **Live items keep their live key, label and position**; ➕ marks a new item.

| group | key | AR | EN | badge | perm | API |
|---|---|---|---|---|---|---|
| — | `home` | الرئيسية | Dashboard | | stats.read | `GET /api/admin/cc/stats` |
| العملاء والاشتراكات · Customers & subscriptions | `users` | الأعضاء والاشتراكات | Members & subscriptions | `expSoon` | members.read | `/api/admin/cc/members*` |
| | `partners` | الشركاء | Partners | | members.read | `/api/admin/cc/members?plan=partner,strategic` |
| | ➕ `customers` | العملاء (المشترون) | Customers (buyers) | | customers.read | `/api/admin/cc/customers*` |
| | `members` | دليل الشركات | Company directory | | directory.read | data files + `/api/admin/cc/content/fac*`, `/api/admin/cc/legacy/companies*` |
| | `plans` | الباقات والصلاحيات | Plans & permissions | | plans.read | `/api/admin/cc/plans*` |
| | ➕ `approvals` | الموافقات | Approvals | `approvals` | approvals.products ∨ approvals.company | `/api/admin/cc/approvals*` |
| | ➕ `invoices` | الفواتير والمدفوعات | Invoices & payments | `unpaid` | pay.read | `/api/admin/cc/pay/invoices*`, `/payments` |
| الخدمات · Services | `tenders` | المناقصات | Tenders | | content.read | `/api/admin/cc/content/{tend,opp,intl}` |
| | `rfqs` | طلبات عروض المشترين | Buyer RFQs | `rfqNew` | content.read | `/api/admin/cc/content/rfq`, `POST /api/admin/cc/rfqs` |
| | `products` | المنتجات | Products | | content.read | `/api/admin/cc/content/prod` |
| | ➕ `store` | المتجر والعروض والتصنيفات | Store, offers & categories | | content.read | `/api/admin/cc/content/{offer,cats}` |
| | `awards` | الترسيات والفائزون | Awards & winners | | content.read | `/api/admin/cc/content/award` |
| | `projects` | المشاريع | Projects | | content.read | `/api/admin/cc/content/proj` |
| | `procurement` | أخبار المشتريات | Procurement news | | content.read | `/api/admin/cc/content/news?category=procurement` |
| | `events` | الفعاليات والمعارض | Events & exhibitions | | content.read | `/api/admin/cc/content/event` |
| | `banners` | البانرات الإعلانية | Banners | | content.read | `/api/admin/cc/content/banner` |
| | ➕ `zones` | المناطق الصناعية | Industrial zones | | content.read | `/api/admin/cc/content/zone` |
| المحتوى · Content | `news` | الأخبار | News | | content.read | `/api/admin/cc/content/news` |
| | `videos` | الفيديوهات | Videos | | content.read | `/api/admin/cc/content/video` |
| | ➕ `notices` | إعلانات الموقع | Site notices | | content.read | `/api/admin/cc/content/notice` |
| | ➕ `media` | مكتبة الصور | Media library | | media.upload | `/api/admin/cc/media*` |
| | ➕ `publish` | النشر والتحديث | Publishing & rebuild | `edge` | content.read | `/api/admin/cc/content/status` |
| التواصل · Communication | `messages` | الرسائل والطلبات | Messages & requests | `msgNew` | orders.read | `/api/admin/cc/orders*`, `/api/admin/cc/legacy/messages*` |
| | ➕ `whatsapp` | الواتساب | WhatsApp | | wa.read | existing `GET /api/admin/wa`, `GET /api/wa/health` |
| | ➕ `bassem` | باسم – المستشار | Bassem – advisor | | bassem.read | `GET /api/admin/cc/bassem` |
| | ➕ `bassem-meetings` | 📞 اجتماعات باسم | 📞 Bassem's meetings | | meetings.bassem | `/api/admin/cc/meetings*` (worker/README.md «Bassem's meetings») |
| SEO يدوي · SEO (manual) | `seo` | بيانات الصفحات | Page data | | seo | existing `/api/seo/pages`, `/api/seo/page` |
| | `keywords` | تتبع الكلمات | Keyword tracking | | seo | existing `/api/seo/keywords` |
| | `redirects` | تحويلات 301 | 301 redirects | | seo | existing `/api/seo/redirects` |
| | ➕ (link) | مساحة SEO الكاملة ↗ | Full SEO workspace ↗ | | seo | `seo-admin.html` |
| النظام · System | `payments` | بوابة الدفع | Payment gateway | | pay.read | `/api/admin/cc/pay/config` |
| | `mail` | البريد | E-mail | | email.read | `/api/admin/cc/email/*` |
| | `settings` | الإعدادات | Settings | | settings.read | `/api/admin/cc/settings*` |
| | ➕ `staff` | الإدارة والصلاحيات | Admins & roles | | staff.read | `/api/admin/cc/staff*` |
| | ➕ `audit` | سجل العمليات | Audit log | | audit.read | `/api/admin/cc/audit*` |
| | ➕ `reports` | التقارير | Reports | | reports.read | `/api/admin/cc/reports*` |
| | ➕ `import` | استيراد من النظام القديم | Import from the old system | | import.run (owner) | `/api/admin/cc/import*` + same-origin `api/index.php` |

Badges come from `GET /api/admin/cc/badges` → `{msgNew, rfqNew, needsTeam, approvals, unpaid, expSoon, edge}`; a badge shows only when > 0.
The ported admin.part.py sections map as: approvals → `approvals`, projects & awards → `projects`/`awards`, media → `media`+`news`/`events`/
`videos`, banners & partners → `banners` (with partner slots), reports → `reports`, roles → `staff`, settings (operator/billing) → `settings`.

### 1.3 Sections (list · detail/edit · actions · empty state)
Every table has: search box `#q` (350 ms debounce, live behaviour), the section's filters, `➕ <add>` button (if the role may write),
`↻ تحديث`, `⬇ تصدير Excel` (CSV per §0.3; server CSV endpoints where listed, else client-side from the paged API like the live panel),
row actions `تعديل` / `حذف` (or `إخفاء`), pager `السابق · صفحة n من m · التالي` (50 rows). Editors are the live modal form (`.fr` 2-column
grid, `w` = full width, `dir` = LTR input) with inline validation and the server's `errors[]` mapped to fields.

**home — الإحصائيات (آخر 30 يوم)** (live view, same cards and order, real data only)
KPI cards (live order): مشاهدات الصفحات `views` («آخر 30 يوم») · زوار فريدون `visitors` (sub: `«mobile»% موبايل`; tooltip «مجموع الزوار
الفريدين يومياً») · المناقصات `tenders` · الشركات `companies` · الأعضاء `members` (sub: «pending بانتظار التحقق») · طلبات RFQ `rfqs`
(sub «rfqNew جديد هذا الأسبوع») · رسائل جديدة `msgNew` (sub «من msgAll») · الأخبار / الفيديوهات `news / videos` · المنتجات `products` ·
اشتراكات قاربت على الانتهاء `soon` («خلال 30 يوم») · اشتراكات منتهية `expired`; NEW cards: محتاجة تدخّل الفريق `needsTeam`, موافقات معلّقة
`approvals`, فواتير غير مدفوعة `unpaid` (+ total), إيراد الشهر `revenue_month` (paid invoices only). Cards: الزيارات اليومية (live SVG chart:
`series[{day, v, u}]` for 30 days, two lines), أكثر الصفحات زيارة `top[{path, c}]`, مصادر الزيارات `src[{ref, c}]`, الأعضاء حسب الباقة
`plans[{plan, c}]`, آخر المسجّلين `recent[{company, email, status}]`, الطلبات حسب النوع `msgKinds[{kind, c}]`. Empty analytics → the live text
«لا توجد بيانات بعد — العدّاد بدأ يشتغل من الآن.» plus `since` date («بداية العدّ: …»). A metric whose source is not available returns `null`
and the card shows «—» (never 0 invented).

**users — الأعضاء والاشتراكات** (live columns + filters, Worker-backed)
Columns (live): الشركة (company bold + manager small) · البريد (LTR) · الجوال (LTR) · الباقة (inline `<select class="pl">` with the live PLANS
options `""`بدون باقة, `profile`, `basic`, `premium`, `partner`, `strategic`; change → `POST /api/admin/cc/members/:id/plan` → toast «تم تغيير
الباقة ✓») · الاشتراك حتى (tag: «· منتهي» red if past, «· قارب» amber ≤ 30 days, «بدون تاريخ») · الحالة (live button: «✓ نشط» / «⏸ معلّق —
تفعيل»; click → `POST …/status`) · آخر دخول (`last_seen_at` 16 chars). NEW columns at the end: «ربط الدليل» (factory_ref name or «—»),
«فاتورة مفتوحة» (invoice no). Filters (live): كل الباقات / بدون باقة / each plan; كل الحالات / نشط / معلّق (+ NEW «موقوف»); «المنتهية فقط»
checkbox; NEW «تنتهي خلال 30 يوم». Edit form (live fields, in order): البريد الإلكتروني (read-only after creation; owner may change with a
warning), اسم الشركة, اسم المدير (`name`), الجوال (`phone`, stored E.164), الباقة, الاشتراك حتى (YYYY-MM-DD, «اتركه فارغاً لبدون تاريخ»), الحالة;
the live «كلمة مرور جديدة» field is REPLACED by the note «الدخول بكود على الإيميل — مفيش باسورد. الحسابات القديمة تقدر تدخل بباسوردها القديم
من صفحة الدخول.» NEW fields: اللقب (`title`), القطاع, المحافظة, المنتجات/الكلمات (matching), ربط بملف في الدليل (`factory_ref` picker over the
directory, perm directory.link), إيقاف الطلبات الواردة (`inbox_paused`), ملاحظات, «ابعت دعوة دخول» checkbox (template `member_invite`).
Detail drawer (row click): account (plan, expiry, activated_at, verified, created_at, last_seen_at, source, legacy fields), invoices list,
routed requests count + last 5, follows count, Bassem prefs (partner/strategic), sessions («إنهاء كل الجلسات»), audit history, legacy profile
(old dashboard data), actions: issue invoice (`pay.invoice`), extend (+N days), suspend/reactivate, invite, anonymise (owner; typed confirm).
Empty: «لا يوجد أعضاء لسه — أول ما حد يسجّل دخول أو يشترك هيظهر هنا.»

**partners — الشركاء**: the same component with the live fixed filter `plan=partner,strategic` and the live note «الشركاء = أصحاب باقة الشريك
الأساسي والشريك الاستراتيجي.»; add defaults plan `partner`.

**customers ➕ — العملاء (المشترون)**: people who sent requests (aggregated from `inquiries` by `email_key`, §8.1). Columns: الاسم/الشركة,
البريد (LTR), الجوال, أول طلب, آخر طلب, عدد الطلبات (by kind chips), مفتوحة, حساب (plan chip or «بدون حساب»), محظور. Filters: q, has account,
date range, kind. Detail: all their requests (links to `messages` detail), account link, note + tags (editable), «حظر» (existing
`POST /api/admin/block`, admin+). CSV (admin+). Empty: «لسه مفيش طلبات من مشترين.»

**members — دليل الشركات** (live entity «الشركات», now the real directory)
Rows = base directory (`MIGOLDFAC` 2,926 + `MIGFACX.list`) merged with D1 edits/adds/hides (via `MIGOVL.fromRow`) + legacy companies
(imported, admin-only). Live columns kept: الشركة (name + manager small: manager = legacy match, admin-only) · الدولة (EG) · الهاتف (LTR;
**legacy phones, admin-only, perm legacy.contacts; never published**) · الموقع (website) · الحالة (live chip: «مسجّل» when linked to a member
with a plan in force, else «عميل محتمل»). NEW columns: القطاع, المحافظة, موثّق ✓, مخفي, مصدر (منصة / مصادر عامة / مضاف). Filters: q, sector,
governorate, type, linked/unlinked, verified, hidden, source. Edit form = public fields of §4.4 `fac` (name, sector, location, type,
governorate, description, products, website, logo upload, verified (perm directory.verify), plus EN fields) and a separate admin-only box
«بيانات من النظام القديم (للإدارة فقط)» (manager, phones, e-mails, address, activity, status registered/lead, legacy id) that is never
compiled into the overlay. Actions: ➕ شركة جديدة (add), إخفاء/إظهار, حذف (adds only; base rows can only be hidden), «توثيق», «ربط بعضو»
(perm directory.link → `POST /api/admin/cc/members/:id` `{factory_ref}`), «دعوة للتسجيل» (legacy registered companies only; leads disabled with
«الشركات المحتملة مابيتبعتلهاش حاجة»). Save → draft; «حفظ ونشر» is the default button (§4.7). Empty: «مفيش نتايج بالفلتر ده.»

**plans — الباقات والصلاحيات** (live view: matrix, numbers + checkboxes, «💾 حفظ»)
Live head «الباقات والصلاحيات» + «صلاحيات كل عضو تتبع باقته تلقائياً»; live note «الأرقام: 0 = غير متاح، -1 = بلا حد. الخيارات … علامة ✓ = متاح.
اختيار الباقة للعضو من قسم "الأعضاء والاشتراكات".» Table rows = `cc_plan_keys` in `sort` order (§7.2), columns = the live PLANS except «بدون
باقة» (visitor is fixed, shown read-only): تسجيل بيانات فقط · الأساسية · المميزة · الشريك الأساسي · الشريك الاستراتيجي. Number cells
`<input type=number min=-1>`, boolean cells checkboxes (live). Added rows above the matrix: «السعر السنوي (جنيه، قبل الضريبة)», «المدة (يوم)»,
«الاسم بالعربي / بالإنجليزي», «متاحة للبيع». Under the table: VAT % (global), «آخر نشر» version, and «مزامنة جنة وباسم» status (§7.5) with a
«معاينة التغيير» diff. Rows imported from the old system that no Worker/site code applies carry the chip «محفوظ — مش مطبّق».
Save → `PUT /api/admin/cc/plans` (perm plans.write) → toast «تم الحفظ ✓ — الأسعار والحدود اتحدّثت على الموقع خلال دقيقة».

**approvals ➕ — الموافقات** (from admin.part.py): queue of member submissions: products (`cc_member_products` state `pending`) and company
requests (`cc_company_requests`: edit / claim / create). Columns: النوع · المنشأة/العضو · التفاصيل (diff summary) · تاريخ الإرسال · الحالة.
Detail: side-by-side current public value vs submitted value per field, images preview (signed URLs), for claims the member's account +
legacy match evidence. Actions: قبول (optional field corrections) → publishes automatically (§8.4); رفض (reason required, ≤ 500 chars) →
member notified (bell + e-mail `product_rejected` / `company_rejected`). Bulk approve for products. Empty: «مفيش طلبات بانتظار المراجعة.»

**invoices ➕ — الفواتير والمدفوعات**: invoices (`/api/admin/cc/pay/invoices`): رقم الفاتورة · العضو/الشركة · الباقة · الصافي · الضريبة ·
الإجمالي · الحالة (open/paid/void/refunded) · المصدر (signup/renewal/admin/upgrade) · تاريخ الإصدار · تاريخ الدفع · البوابة. Filters: status,
source, provider, date range, q. Detail: lines, payment attempts (`cc_payments`), provider events (`cc_pay_events`, verified flag), e-mails sent.
Actions: «إصدار فاتورة» (member + plan → `POST /api/admin/cc/pay/invoices`), «إعادة إرسال رابط الدفع», «تسجيل دفع يدوي» (perm pay.mark_paid;
reference + date + note; typed confirm), «إلغاء الفاتورة» (void; open only), CSV. Payments tab: attempts list. Empty: «لسه مفيش فواتير.»

**tenders — المناقصات**: three tabs (one collection each): «مناقصات المنصة» (`tend` = MIGTEND 436), «فرص بمصادر» (`opp` = REAL.tenders),
«فرص دولية» (`intl` = REAL.tenders_intl, edit/hide only). Columns: الرقم/الرقم المرجعي · العنوان · الجهة · المحافظة/الدولة · آخر موعد ·
الحالة (computed) · المصدر (link) · حالة النشر (منشور / مسودة / مخفي). Add form (tend/opp) per §4.4; publishing requires `source_url`
(«المصدر مطلوب للنشر — من غير مصدر الإعلان بيفضل مسودة»).

**rfqs — طلبات عروض المشترين** (live entity, live note kept: «سجّل هنا الطلبات اللي تيجيلك بالتليفون أو الواتساب. الطلبات «المنشورة» بتظهر
تلقائيًا في صفحة طلبات الأسعار.»). Live columns: العميل (client + phone, admin-only) · الطلب (product — qty unit) · التسليم (city) · آخر موعد ·
القناة · الحالة («منشور» / «مغلق»). Live form fields in order: اسم العميل / الجهة · الجوال · البريد · قناة الطلب (اتصال هاتفي، واتساب، البريد
الإلكتروني، زيارة المقر، معرض / فعالية) · المنتج / الخدمة المطلوبة · الكمية · الوحدة (طن، م²، م³، قطعة، كرتون، متر، لتر) · القطاع · مدينة التسليم
(+ NEW المحافظة code) · آخر موعد للعروض · تفاصيل الطلب · الحالة («منشور في سوق الطلبات» / «مغلق»). Save of a NEW manual RFQ →
`POST /api/admin/cc/rfqs` (§3.1.9): creates a real inquiry (kind `rfq`, source `admin`) that is routed automatically to matching registered
members, AND (if «منشور») a public `rfq` overlay row with the public fields only (no client name/phone/e-mail). Base MIGRFQ rows (5) can be
edited/hidden. The table merges both and shows the inquiry ref + routed count for manual ones.

**products — المنتجات** (live entity): marketplace products `prod` (MIGOLDP 183 + approved member products + admin adds). Live columns:
المنتج (name + category small) · الشركة (producer from MIGP2F → directory name) · السعر (NEW optional text field `price`, shown only when set)
· الحالة («ظاهر» / «مخفي»). Live form fields: اسم المنتج · الشركة المصنّعة (directory picker → `company_url`) · التصنيف (category key) · السعر ·
رابط الصورة → replaced by «صورة المنتج» upload (media) · الوصف · الحالة. Member-submitted rows show «من العضو …» and link to approvals.

**store ➕ — المتجر والعروض والتصنيفات**: tab «عروض المحلات» (`offer` = MIGOFFERS 102; columns from admin.part.py: image, product, store, price
(+old price struck), valid until, صنع في مصر, actions; source required), tab «تصنيفات السوق» (`cats`: key, AR label, EN label, icon; base
keys from `CATS` in market.part.html + `MIGP.cats`; rename/add/hide), tab «منتجات مميزة» (featured flag on `prod` rows).

**awards — الترسيات والفائزون**, **projects — المشاريع**, **events — الفعاليات والمعارض**, **news — الأخبار**, **videos — الفيديوهات**,
**procurement — أخبار المشتريات** (= `news` rows with `category_ar = "أخبار المشتريات"`), **zones ➕**: the live generic item columns
(العنوان + body excerpt · الرابط · التاريخ · الحالة ظاهر/مخفي) extended with each collection's key fields (§4.4). Videos: «إضافة برابط يوتيوب» →
the Worker verifies with YouTube oEmbed (read-only) and fills title/channel; only oEmbed-confirmed videos can be published.

**banners — البانرات الإعلانية** (live entity; admin.part.py «البانرات والشركاء»): columns: الصورة · الشريك/العنوان · المكان (strategic strip /
partner strip / home) · الفترة (start → end) · الحالة · العضو المرتبط (partner/strategic member, optional). Built-in banners of the build are
listed read-only with «إخفاء البانر الأصلي». Image upload required (banner purpose, ≥ 1120×200).

**notices ➕ — إعلانات الموقع**: short announcements shown as a bar under the header: text AR/EN (≤ 200), link (optional), level
(info/success/warn), pages (all or selected page keys), start/end, «ممكن يتقفل». Preview inline.

**media ➕ — مكتبة الصور**: grid of uploads (`/api/admin/cc/media`): thumbnail, purpose, size, dimensions, owner (admin/member), status
(public/pending/rejected), used by. Upload (drag & drop, JPEG/PNG/WebP ≤ 5 MB). Delete (unreferenced only).

**publish ➕ — النشر والتحديث**: overlay version, size (KB / limit), last publish (who/when), unpublished drafts count with «نشر الكل»,
edge actions (noindex/redirect) pending/failed with «إعادة المحاولة», «محتاج إعادة بناء» list (§4.9) with «بيتحدّث تلقائياً في النشر اليومي
(حوالي 4:37 ص بتوقيت القاهرة)», and (owner) «إيقاف كل التعديلات المنشورة مؤقتاً» (overlay emergency off).

**messages — الرسائل والطلبات** (live entity, now the sales-requests/orders console over `inquiries`, §9) Live columns kept: من (name + phone/
e-mail small) · النوع (kind label) · الموضوع (title/product + message excerpt) · التاريخ · الحالة (status chip). NEW columns: رقم الطلب (ref),
وصل لـ (routed_count), ردود (replies_count), «محتاج الفريق» flag. Tabs: الكل · محتاجة تدخّل الفريق · طلبات أسعار · سلة السوق · عروض على فرص ·
اهتمام · طلبات اشتراك · تصحيح بيانات · تواصل · رسائل النظام القديم (legacy messages with the live statuses جديد/مقروء/تم). Filters: status,
source, market, date range. Detail: same as inbox.html (inquiry, events timeline with internal events marked, routes table with e-mail/WhatsApp
status, quotes) + actions: «إحنا اللي هنرد» (deploy 1 `teamReply()`: textarea ≤ 4,000, channel e-mail / WhatsApp / both — WhatsApp falls back
to e-mail while no buyer template is approved, the result line says so —, resulting status «جاري المتابعة» in_progress / «اترد» replied /
«اتقفل» closed), «ملاحظة داخلية», «إعادة الإرسال» (admin; existing `/resend`), «حظر» (admin; existing `/block`), «قفل الطلب» (= team reply with
status closed), «مصانع مرشّحة» (deploy 1 candidates: platform-directory rows that are not members + web results only when a search key is set,
each with its source line «دليل المنصة — غير مسجّل» / «بحث ويب»; refresh button; admin-only legacy contacts underneath; a banner states
«محدش من دول اتبعتله حاجة — التواصل يدوي من الفريق»). Status chips use inquiries.js `statusLabel()` (AR/EN), incl. «جاري معالجة طلبك».
The live «➕ رسالة يدوية» becomes «➕ طلب يدوي» (opens the RFQ form). CSV (admin+). Empty: «لسه مفيش طلبات.»

**whatsapp ➕**: `GET /api/wa/health` status card (configured channel, dry-run flag), log table from existing `GET /api/admin/wa?flag=` (time,
member, direction, kind, status, flag mood/stop/time, text excerpt), filter chips (كل الرسائل / مزاج / إيقاف / مواعيد). Read-only.
**bassem ➕**: partner/strategic members: plan + days left (365 from `activated_at`), WhatsApp opt-in, morning time, session time, days, paused,
last morning/call sent, open deals count, last activity, mood flags. Read-only monitoring.

**seo / keywords / redirects** (live entities, now on the existing SEO layer, no duplicate backend): `seo` = list of `GET /api/seo/overrides`
(+ search into `GET /api/seo/pages`), live columns الصفحة (path) · العنوان · الكلمة الرئيسية (target_kw) · الفهرسة («مفهرس» / «مخفي عن جوجل»);
live form fields mapped: path, title (≤ 60 hint), descr → description, h1, kw → target_kw, kw2 → secondary_kw, og → og_image, canonical, robots
(index → `index,follow`, noindex → `noindex,follow`) → `PATCH /api/seo/page`. `keywords` = `GET/PUT /api/seo/keywords` (columns: الكلمة,
الصفحة, ملاحظة; the live «الترتيب» column shows Search Console data when imported, else «—»). `redirects` = `GET/POST/DELETE
/api/seo/redirects` (columns من · إلى · الكود; the live note is replaced by «التحويلات بتشتغل فوراً على الموقع (خلال دقيقة).»). Each section
links «مساحة SEO الكاملة ↗» (seo-admin.html). 401/403/503 from /api/seo are shown with the SEO workspace's own wording.

**payments — بوابة الدفع** (live view, same fields and order, implemented providers only): live head «بوابة الدفع» + «ربط بوابة الدفع
لاشتراكات الباقات», live note («مفاتيح الـAPI تُحفظ على السيرفر ولا تظهر بعد الحفظ. استخدم وضع الاختبار أولاً…»). Fields: تفعيل الدفع
الإلكتروني (checkbox) · البوابة (select: N-Genius (Network International) · Paymob · PayTabs · تحويل بنكي / يدوي — Moyasar, Tap, HyperPay,
Stripe, PayPal are NOT shown) · الوضع (اختبار Sandbox / حقيقي Live) · العملة (EGP, read-only) · Merchant / Account ID (N-Genius: — ;
Paymob: Integration IDs (comma separated); PayTabs: Profile ID) · Outlet / Reference ID (N-Genius outlet reference) · API Key / Secret Key
(masked «محفوظ ····tail — اتركه فارغاً للإبقاء»; N-Genius API key, Paymob secret key, PayTabs server key) · Webhook Secret (N-Genius custom
header value; Paymob HMAC secret; PayTabs: not used — the server key signs) · رابط النجاح · رابط الفشل · ملاحظات. Provider-specific extra fields
under «إعدادات إضافية»: Paymob public key; N-Genius API host (sandbox/live/custom regional host); PayTabs region host
(`secure-egypt.paytabs.com`); manual: instructions AR/EN (bank, IBAN, InstaPay handle) + «اعرض التحويل اليدوي كبديل للدفع الإلكتروني».
Read-only box «روابط الـ Webhook» with the exact URLs to paste at the provider (§5.3). Status line: «جاهز للدفع» only when
`GET /api/admin/cc/pay/config` says `ready:true` (live mode + all required fields + readable secrets); otherwise «بوابة الدفع لسه بتتجهّز» with
the missing items. «💾 حفظ» (owner) and «🧪 فاتورة تجريبية» (owner; creates a `test` invoice usable in Sandbox only).

**mail — البريد** (live view, same fields; SMTP removed): live head «البريد» + «إرسال الإيميلات … من سيرفر البريد الخاص» → «إرسال الإيميلات
(أكواد الدخول، الفواتير، الطلبات) من noreply@madeinegyptgate.com»; note: «مفتاح مزوّد البريد يُحفظ مشفّراً ولا يظهر بعد الحفظ. سجلات الدومين
(MX/SPF/DKIM) على Hostinger ماتتلمسش.» Fields: تفعيل إرسال الإيميلات · طريقة الإرسال (Resend — الأساسي / Brevo API) · البريد المرسِل (default
noreply@madeinegyptgate.com) · اسم المرسِل (default «منصة صنع في مصر») · Reply-To (default info@madeinegyptgate.com) · API Key (masked; Resend
`re_…`, Brevo `xkeysib-…`) · «رسالة تجريبية — أرسل إلى» + «✉ إرسال تجريبي». NEW tabs: «القوالب» (registry §6.1: key, name, list, on/off (only
optional ones), subject/intro/outro overrides AR/EN, preview with `‹var›` placeholders, test send), «سجل الإرسال» (time, template, masked
recipient, subject, provider, status, error; search by exact e-mail), «حالة المزوّد» (key source: Control Center / Worker secret / none,
SEND_EMAIL binding present, last check).

**settings — الإعدادات** (live entity kept as key/value table «المفتاح / القيمة» with the live note, PLUS structured groups): «بيانات التواصل»
(contact_email, support_email, hotline display + tel, whatsapp display + wa number, address AR/EN), «حساباتنا» (facebook, x, instagram, linkedin,
youtube URLs), «بيانات المشغّل والفوترة» (operator name AR/EN, registration no., supervising ministry AR/EN, tax no., commercial register no.,
VAT rate, invoice issuer address AR/EN, billing e-mail), «الدفع اليدوي» (instructions AR/EN). Seeds = today's values in site.py / legal.part.py
(§2 seeds). Public keys are compiled into the overlay and applied by data/settings-live.js to `[data-mig-setting]` elements.

**staff ➕ — الإدارة والصلاحيات** (admin.part.py «الصلاحيات والفريق»): list: e-mail, name, role, added by/at, last seen, status; bootstrap
owners (ADMIN_EMAILS) shown with «مالك (من الإعدادات)» and no actions. Add (e-mail + role; e-mail `staff_added`), change role, disable/remove.
A permission matrix (§0.5) read-only underneath.
**audit ➕ — سجل العمليات**: time, actor (e-mail + role), action, target (link), summary; filters actor/action/target/date; detail shows
before/after JSON (redacted); CSV (owner).
**reports ➕ — التقارير** (admin.part.py, real data only): requests per day and per kind, sign-ups per day, paid revenue per month, active
subscriptions per plan, page views per day, tenders by governorate (from data files); each with a CSV. No KPI without a source; no
«توضيحي» numbers (the old 48,210 / 226 / 2,904 / 3.4 % cards are NOT ported).
**import ➕ — استيراد من النظام القديم** (owner only): §1.5.

### 1.4 Role matrix per section (R read · W write · — hidden)
| section | owner | admin | editor | support |
|---|---|---|---|---|
| home | R | R | R | R |
| users, partners | W | W | — | R (+contact fields W) |
| customers | W | W | — | W |
| members (directory) | W (+verify, link, contacts) | W (+verify, link, contacts) | W (public fields) | R (+contacts) |
| plans | W | W | R | R |
| approvals | W | W | W (products) | — |
| invoices | W (+mark paid) | W (+mark paid) | — | R |
| tenders, rfqs, products, store, awards, projects, procurement, events, banners, zones, news, videos, notices, media, publish | W | W | W | R (rfqs: W manual RFQ entry) |
| messages (orders) | W | W | — | W (reply, note, close, manual RFQ; no resend/block) |
| whatsapp, bassem | R | R | — | R |
| seo, keywords, redirects | W | W | W | — |
| payments | W | R | — | — |
| mail | W | R (+templates W, test) | — | — |
| settings | W | W | R | R |
| staff | W | W (editor/support only) | — | — |
| audit | R (+export) | R | — | — |
| reports | R | R | — | — |
| import | W | — | — | — |
The UI hides what the role cannot see and disables what it cannot write; the server enforces every permission independently (403 `forbidden`).

### 1.5 Import tool «استيراد من النظام القديم» (owner only) — old PHP API → D1
Purpose: copy the owner's data from the old system into the new one, once or repeatedly (idempotent upsert), with a dry-run preview and a final
report, audit-logged. Nothing is deleted on Hostinger; the old API stays reachable through the `/api/index.php*` proxy (§3.1.13).

**Flow (panel, owner):**
1. Intro + entity checklist (all on): users, members, products, messages, rfqs, settings, plans, payments config, mail config, seo, keywords,
   redirects, items (tender, news, video, award, project, procurement, event, banner).
2. «ادخل على النظام القديم»: e-mail + password typed by the owner → the browser calls the OLD API directly, same origin:
   `fetch("api/index.php?a=login", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email, password})})`.
   The credentials go only to the old server (through the transparent proxy, which never logs or stores bodies); the panel keeps nothing in
   storage. 401/`ok:false` → «البيانات غلط أو الحساب مش أدمن في النظام القديم».
3. Discovery: `a=admin_stats` (totals), `a=plans_get`, `a=pay_get`, `a=mail_get` (non-secret fields only; the API masks secrets).
4. Fetch: for each entity, page through `a=admin_list` with body `{e, q:"", page, kind?}` (`e` = users | members | products | messages | rfqs |
   seo | keywords | redirects | settings | items; `kind` for items), 50 rows per page, until `rows.length === 0` or the running count reaches
   `total`; 150 ms pause between pages; 2 retries; «إيقاف» button. Progress bar per entity.
5. Transform in the browser (mapping below), dropping every key matching `/pass|secret|token|api_?key|smtp_pass/i` (e.g. `pass_hash`), then send
   batches of ≤ 50 rows: `POST /api/admin/cc/import/runs/:id/batch {entity, rows, dry_run:true}` → preview table (create / update / unchanged /
   conflict / skip / error per row, counts, warnings). Options: «استبدل التعديلات اللي اتعملت في النظام الجديد» (default OFF → conflicts are
   skipped), «انشر المحتوى المستورد مباشرة» (default OFF → drafts), «فعّل التحويلات 301 المستوردة» (default ON).
6. Apply: the same batches with `dry_run:false`; SEO entities go to the existing SEO API (`POST /api/seo/import?kind=overrides|redirects&dry_run=1`
   then `dry_run=0`, CSV built in the browser; keywords via `PUT /api/seo/keywords {items}`) and their results are posted as
   `{entity:"seo"|"keywords"|"redirects", client_result}` for the run report. Final report (counts per entity, errors, skipped conflicts,
   downloadable CSV) → `POST /api/admin/cc/import/runs/:id/finish`. Last step: `a=logout` on the old system.
7. Secrets the old API masks («محفوظ ····») are re-entered by the owner on the same screen (payment keys → payments section API; mail key →
   mail section API). Imported payment/mail configs are saved with `enabled = 0` until their keys are re-entered.

**Field mappings (old → new).** Keys are trimmed; e-mails lower-cased; dates `YYYY-MM-DD`; phones normalised with `e164()` when valid (else kept
raw in meta only); every imported row stores `imported_hash = sha256(JSON(old row without secrets))` for conflict detection.

| old entity · field | new place · field | rule |
|---|---|---|
| users (key = e-mail) · id | `cc_member_meta.legacy_id` | |
| users · email | `members.email` | find by mailbox (`membersByMailbox`); create `u`+hex(8) with `verified=1`, `email_verified_at=''`, `plan='visitor'` if none |
| users · company / manager / tel | `members.company` / `.name` / `.phone` | fill only if empty locally (or overwrite option) |
| users · plan + status + plan_until | `members.plan`, `.plan_expires`, `cc_member_meta.status/requested_plan` | status `active` and (`plan_until` empty or ≥ today) → plan in force = old plan (never lowers a higher plan already in force; expiry = later of the two; `plan_until` → `cairoToUtc(D, "23:59")`); status `pending` → plan unchanged, `status='pending'`, `requested_plan` = old plan; expired → `legacy_*` only |
| users · last_login | `cc_member_meta.legacy_last_login` | |
| users · data (old dashboard profile JSON: addr, web, act, cr, vat, video, cap, year, emp, thick, x, l, i, yt, mk) | `cc_member_meta.legacy_profile_json` | admin-only; pre-fills «ملف الشركة» suggestions |
| users · pass_hash / password | — | NEVER sent, never stored (client drops; server rejects keys) |
| members (key = legacy id, then company+e-mail) · company, manager, country, phones, web, address, activity, email, status | `cc_legacy_companies` (all fields) | admin-only; `company_key = norm(company)`; suggested `factory_ref` = best directory name match (data.json `f`, score ≥ 0.8) |
| products (key = legacy id) · name, company, category, price, img, descr, status | `cc_content` coll `prod`, kind `add`, state `draft` | dedupe vs base by `norm(name)+norm(company)` (match → `skip` «موجود في الدليل»); `img` (old URL) → `fields.legacy_img`, image must be re-uploaded before publishing |
| messages (key = legacy id) · name, phone, email, kind, subject, body, status, created_at | `cc_legacy_messages` | admin-only; shown in «الرسائل والطلبات» → «رسائل النظام القديم» |
| rfqs (key = legacy id) · product, qty, unit, sector, city, deadline, details, status | `cc_content` coll `rfq`, kind `add` (no = `L<legacy id>`), public fields only | published only if «انشر» option AND status active AND (deadline empty or ≥ today); city → governorate code client-side (`MIGREG.of`) |
| rfqs · client, phone, email, channel | `cc_content.private_json` | admin-only; NO inquiry is created and nothing is routed or e-mailed by the import |
| seo · path, title, descr, h1, kw, kw2, og, canonical, robots | SEO overrides via `/api/seo/import` CSV: path, title, description, h1, target_kw, secondary_kw, og_image, canonical, robots | old path → build path through `/_seo/redirects.json` exact map (e.g. `/rfqs.html` → `/rfq/`); rows whose path already has a new override are skipped unless overwrite |
| keywords · kw, page, note, rank | `/api/seo/keywords` items `{cluster: kw, target_kw: kw, target_url: page, secondary_kw: [], difficulty: ""}`; `note`, `rank` → `cc_legacy_rows` | the old manual rank is NOT shown as a ranking |
| redirects · src, dst | `/api/seo/import?kind=redirects` CSV `from,to,code,note` (code 301, note «من النظام القديم») | loops/chains handled by the SEO API |
| settings · k, v | `cc_settings` scope `custom` (`legacy.<k>`); known keys: `contact_email`→`contact_email`, `whatsapp`→`whatsapp`, `phone`→`hotline` (scope `public`, only if the owner ticks «طبّق على الموقع») | |
| plans_get · keys{k:label}, perms{plan:{k:v}} | `cc_plan_keys` + `cc_plans.caps_json` | known keys: products→products, video→video, social→social, featured→featured; `tenders`, `contacts` → `cc_legacy_rows` only (owner decisions: every plan sees tenders; contacts are never shown); other keys → new rows `enforced_by:"none"` |
| pay_get · enabled, provider, mode, currency, merchant_id, outlet_id, success_url, fail_url, notes | `cc_settings` scope `pay` | provider kept only if implemented (ngenius, paytabs, manual); `enabled` forced 0 until secrets re-entered; masked tails ignored |
| mail_get · enabled, provider, from_email, from_name, reply_to | `cc_settings` scope `mail` | provider `brevo` → brevo; `smtp` → `resend` with `enabled = 0` (SMTP cannot run on Workers) |
| items kind=tender | `tend` add | `[ref "L<id>", type "", title, entity "", gov "", sector "", …, source_url = link]`, draft |
| items kind=news / procurement | `news` add | `{title_ar: title, summary_ar: body, url: link, date: created_at, category_ar: kind=procurement ? "أخبار المشتريات" : "", image: legacy_img}` draft |
| items kind=video | `video` add | YouTube id parsed from `link`; oEmbed check at publish |
| items kind=award | `award` add | `{title_ar: title, winner_ar: "", source_url: link, date}` draft |
| items kind=project | `proj` add | `[id "L<id>", name title, …, source url = link]` draft |
| items kind=event | `event` add | `{name_ar: title, about_ar: body, url: link, source_url: link}` draft (dates required before publishing) |
| items kind=banner | `banner` add | `{title_ar: title, link, img: "" (re-upload), place: "home"}` draft |
| items · status pending | any of the above | stays `draft` and `hidden` |

Server-side for every batch: strip forbidden keys, validate, compute the key, compare with existing (`unchanged` when identical,
`conflict` when the local row changed after the last import — i.e. current value ≠ `imported_hash` source — and overwrite is off), never send
e-mail/WhatsApp, never route inquiries, insert one `cc_audit` row per applied batch (`import.apply`, counts in `after`), record the batch in
`cc_import_runs.report_json`.

### 1.6 login.html (same URL; built by login.part.py, standalone like the live page)
Live look kept (`docs/janna/legacy-live/login.html`: centred card, logo `img/logo-site.png`, «دخول المصانع» title / «منصة صنع في مصر», maroon
button, links «ليس لديك حساب؟ سجّل شركتك · الرئيسية»), bilingual (`T()`; EN title "Sign in"), noindex, no site header.
* **Card A — «الدخول بكود على الإيميل» (default):** e-mail → `POST /api/auth/request {email, lang}` (same answer for any address) → 6-digit code
  input (numeric, paste-friendly, 60 s resend timer) → `POST /api/auth/verify {email, code}` → store `localStorage["mig-tok"] = token` and
  `localStorage["mig-me"] = JSON.stringify({user, unread: 0})` (the keys data/mig-api.js uses) → redirect.
* **Card B — «حساب قديم؟ ادخل بالباسورد بتاعك»** (collapsed link under card A, hidden when `GET /api/auth/legacy/health` says
  `{enabled:false}`): e-mail + password → `POST /api/auth/legacy {email, password, lang}` → same storage → redirect. Errors: 401
  `invalid_credentials` «الإيميل أو الباسورد غلط» · 403 `use_email_code` «الحساب ده لازم يدخل بكود على الإيميل» · 429 «محاولات كتير — جرّب بعد
  شوية» · 503 `legacy_off` «النظام القديم مش متاح دلوقتي — ادخل بكود على الإيميل». Note under the form: «الباسورد بيتأكد منه النظام القديم بس
  ومش بيتحفظ عندنا.»
* **Redirect:** `?next=` if it is a same-site relative path matching `^(dashboard|panel|advisor|track|pay|register)\.html(#[^\s<>"']*)?$`;
  else staff (`GET /api/admin/cc/whoami` 200) → `panel.html`; else `dashboard.html`. Already signed in → offer «كمّل على لوحتك» / «خروج».

### 1.7 dashboard.html — keeps every tab, gains «منتجاتي», «ملف الشركة» and the live status line
Existing tabs stay exactly (dash.part.html: نظرة عامة, طلباتي, متابعاتي, الإشعارات, الفرص في نطاقك, طلبات واردة لي, إحصائياتي, بياناتي, الواتساب
والإيميل, باقتي) with their legacy hash map. Integrator patch (§10.3 P-D1) exposes `window.MIGDASH` (addTab / extend / status hooks).
* **Status line**: deploy 1 already renders it (dash.part.html `acctState()` → `<small class="ast ast-ok|exp|wait" id="whoS">` with «✓ حساب نشط»,
  «⏳ الاشتراك انتهى — بانتظار التجديد», «⏳ بانتظار إتمام الاشتراك», also repeated in the overview header). It is KEPT; data/dash-products.js only
  refines it through `MIGDASH.status(fn)` from `GET /api/me/account`: `suspended` → «⏸ الحساب موقوف مؤقتاً — كلّمنا» (class `ast-exp`);
  `pending` with an open invoice → the same «⏳ بانتظار إتمام الاشتراك» text + « · <requested plan name>» + link «ادفع الفاتورة ←»
  (`pay.html#inv=<token>`); `active` → unchanged. Never a second status line; offline/API error → deploy 1's line stays as is.
* **«منتجاتي» tab** (data/dash-products.js; group «مصنعي», after `incoming`, level = plan with `products ≠ 0`; legacy hash `#products`):
  list of my products with state chip (مسودة / بانتظار المراجعة / منشور / مرفوض + reason / مخفي), counter «n من limit» («بلا حد»), «➕ منتج جديد»
  form (name AR*, name EN, category* (market categories), description AR/EN, price text (optional), images (upload, ≤ `images_per_product`),
  «حفظ كمسودة» / «إرسال للمراجعة»), edit (a published product keeps showing its approved version until the new one is approved), hide/delete,
  honest notes: «المنتج بيظهر في السوق بعد موافقة فريق المنصة» and, without a linked company, «اربط حسابك بملف شركتك الأول من «ملف الشركة»».
  Locked (plan without products) → `MIGPLAN.lockHTML("products")`.
* **«ملف الشركة» tab** (data/dash-company.js; group «مصنعي», after «منتجاتي»; legacy hash `#profile_company`): not linked → search the directory
  (client-side over MIGOLDFAC/MIGFACX names loaded lazily) → «ده ملف شركتي» (claim request) or «شركتي مش موجودة — أضفها» (create request);
  linked → current public listing (name, sector, location, governorate, type, description, products, website, logo, + video/social when the
  plan allows) with an edit form → change request (one open request at a time; history with states and reject reasons). Phones/e-mails are not
  accepted in any field («بيانات التواصل الشخصية مش بتتنشر — المشترين بيتواصلوا عن طريق المنصة»).
* **«باقتي» extension** (data/dash-company.js via `MIGDASH.extend("plan", …)`): «فواتيري» list from `GET /api/me/invoices` (no., plan, total,
  status, «ادفع الآن» → `pay.html#inv=<token>` for open ones), «جدّد / رقّي الباقة» → `POST /api/me/invoices {plan}`; replaces the old note «الفواتير
  وتجديد الاشتراك هيظهروا هنا أول ما الدفع الإلكتروني يشتغل» only when the server answered.

### 1.8 pay.html (public, noindex; pay.part.py + data/pay.js)
A PAGES page (site header/footer) at `pay.html` (`/pay/` after the clean-URL build; `pay.html#…` 301s with the hash kept). Reads
`#inv=<pay_token>[&r=1]` (token never in the query string). States:
1. loading → `GET /api/pay/invoice?t=<token>`; 404 → «الرابط ده مش صحيح أو انتهى — لو محتاج مساعدة كلّمنا».
2. `open` + `gateway.ready` → invoice card (رقم الفاتورة، الشركة، الباقة، المدة، الصافي، ضريبة القيمة المضافة n%، الإجمالي) + «ادفع الآن» →
   `POST /api/pay/checkout {t}` → `location.assign(redirect_url)` (provider-hosted page; no card field anywhere on our site).
3. `open` + not ready + `manual.enabled` → manual instructions (AR/EN from settings) + «اكتب رقم الفاتورة <no> في بيان التحويل» + «بعد التحويل،
   الباقة بتتفعّل لما فريق المنصة يأكد وصول المبلغ».
4. `open` + nothing ready → «بوابة الدفع لسه بتتجهّز — أول ما تشتغل، رابط الدفع الآمن بيوصلك تلقائياً على الإيميل» (register.html wording).
5. return (`r=1`) → «جاري تأكيد الدفع…» polling `GET /api/pay/invoice?t=` every 3 s up to 60 s → `paid` «✓ اتدفعت الفاتورة والباقة اتفعّلت» +
   «افتح لوحتك» | `failed` «الدفع ماتمّش — تقدر تحاول تاني» | timeout «لسه ماوصلناش تأكيد من بوابة الدفع. هنبعتلك إيميل أول ما يوصل.»
6. `paid` / `void` / `expired` → final messages. AR/EN, RTL/LTR, mobile; no tracking pixels.

---

## 2. D1 migration `worker/migrations/0006_admin_center.sql` (acc-core writes it verbatim)

Next free number after 0002–0005 is **0006**. The migration is purely additive and idempotent (verified: executed twice on top of the current
schema.sql with node:sqlite → 31 `cc_*` tables, seeds present, partial unique index enforced, `RETURNING` counters work). No `ALTER TABLE`, so
the integrator appends the same text to schema.sql and every test helper can `db.exec(schema.sql)` then `db.exec(0006)` safely. Every new
module MUST also run correctly against a database WITHOUT these tables (fail open: defaults, empty lists, `503 store_off` only for writes),
because the existing 111 tests build their DB from the current schema.sql.

```sql
-- Admin Control Center (panel.html), member self-service, payments, e-mail center, content overlay, page analytics, legacy import.
-- docs/janna/ACC-CONTRACT.md §2. PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS and INSERT OR IGNORE seeds —
-- no ALTER TABLE, no change to an existing table. Safe on any database built from schema.sql (+0002–0005) and safe to re-run.
-- The integrator also appends this file verbatim to schema.sql (new databases), so tests may exec schema.sql and then this file.
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0006_admin_center.sql

-- ============================================ staff, sessions, audit ============================================
CREATE TABLE IF NOT EXISTS cc_staff (
  member_id   TEXT PRIMARY KEY,                       -- members.id (bootstrap owners from ADMIN_EMAILS are never stored here)
  role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'support')),
  note        TEXT NOT NULL DEFAULT '',
  added_by    TEXT NOT NULL DEFAULT '',
  added_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  disabled_at TEXT NOT NULL DEFAULT ''                 -- '' = active
);
CREATE TABLE IF NOT EXISTS cc_session_meta (
  sid_hash    TEXT PRIMARY KEY,                       -- auth_sessions.sid_hash of a session created by the old-password bridge
  via         TEXT NOT NULL CHECK (via IN ('code', 'legacy')),
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cc_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor_id    TEXT NOT NULL DEFAULT '',               -- members.id | 'platform' | 'system' | 'provider:<name>'
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,                          -- <area>.<verb>, e.g. member.plan, content.publish, pay.mark_paid
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  before_json TEXT NOT NULL DEFAULT 'null',           -- changed fields only, secrets redacted
  after_json  TEXT NOT NULL DEFAULT 'null',
  ip_hash     TEXT NOT NULL DEFAULT '',
  req_id      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_audit_at ON cc_audit(at);
CREATE INDEX IF NOT EXISTS cc_audit_target ON cc_audit(target_type, target_id, at);
CREATE INDEX IF NOT EXISTS cc_audit_actor ON cc_audit(actor_id, at);
CREATE INDEX IF NOT EXISTS cc_audit_action ON cc_audit(action, at);
CREATE TABLE IF NOT EXISTS cc_locks (
  k      TEXT PRIMARY KEY,                            -- e.g. 'overlay:publish', 'cron:acc'
  until  TEXT NOT NULL,
  owner  TEXT NOT NULL DEFAULT ''
);

-- ============================================ members (extension, no ALTER on members) ============================================
CREATE TABLE IF NOT EXISTS cc_member_meta (
  member_id           TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  requested_plan      TEXT NOT NULL DEFAULT '',       -- plan asked for (signup / legacy pending); cleared on activation
  suspended_plan      TEXT NOT NULL DEFAULT '',       -- plan held while suspended (members.plan = 'visitor' meanwhile)
  suspended_expires   TEXT NOT NULL DEFAULT '',
  source              TEXT NOT NULL DEFAULT '',       -- signup | admin | import | legacy_login | code | payment
  legacy_id           TEXT NOT NULL DEFAULT '',
  legacy_status       TEXT NOT NULL DEFAULT '',
  legacy_plan         TEXT NOT NULL DEFAULT '',
  legacy_plan_until   TEXT NOT NULL DEFAULT '',
  legacy_last_login   TEXT NOT NULL DEFAULT '',
  legacy_profile_json TEXT NOT NULL DEFAULT '{}',     -- old dashboard profile; admin + that member only, never public
  legacy_login_off    INTEGER NOT NULL DEFAULT 0,     -- 1 = old-password sign-in disabled for this account («مش انت؟» link)
  imported_hash       TEXT NOT NULL DEFAULT '',
  tags                TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_member_meta_status ON cc_member_meta(status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS cc_member_meta_legacy ON cc_member_meta(legacy_id) WHERE legacy_id != '';
CREATE TABLE IF NOT EXISTS cc_customer_notes (
  email_key   TEXT PRIMARY KEY,                       -- common.js emailKey() of the buyer
  note        TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);

-- ============================================ legacy (old PHP system) ============================================
CREATE TABLE IF NOT EXISTS cc_import_runs (
  id           TEXT PRIMARY KEY,                      -- rid(12)
  started_by   TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'partial', 'failed', 'dry')),
  options_json TEXT NOT NULL DEFAULT '{}',
  counts_json  TEXT NOT NULL DEFAULT '{}',
  report_json  TEXT NOT NULL DEFAULT '[]',            -- per batch: {entity, dry_run, counts, errors[≤50]}
  note         TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cc_legacy_companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id     TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',
  company_key   TEXT NOT NULL DEFAULT '',             -- text.js norm(company)
  manager       TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  phones        TEXT NOT NULL DEFAULT '',             -- ADMIN-ONLY, never rendered publicly
  email         TEXT NOT NULL DEFAULT '',             -- ADMIN-ONLY
  email_key     TEXT NOT NULL DEFAULT '',
  web           TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  activity      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '',             -- registered | lead (old system)
  factory_ref   TEXT NOT NULL DEFAULT '',             -- linked directory profile ('' = none); suggested_ref = best name match
  suggested_ref TEXT NOT NULL DEFAULT '',
  raw_json      TEXT NOT NULL DEFAULT '{}',           -- sanitised old row (no secrets)
  imported_hash TEXT NOT NULL DEFAULT '',
  run_id        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_legacy_companies_lid ON cc_legacy_companies(legacy_id) WHERE legacy_id != '';
CREATE INDEX IF NOT EXISTS cc_legacy_companies_key ON cc_legacy_companies(company_key);
CREATE INDEX IF NOT EXISTS cc_legacy_companies_email ON cc_legacy_companies(email_key);
CREATE INDEX IF NOT EXISTS cc_legacy_companies_ref ON cc_legacy_companies(factory_ref);
CREATE TABLE IF NOT EXISTS cc_legacy_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  email_key     TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done')),
  legacy_at     TEXT NOT NULL DEFAULT '',             -- created_at in the old system
  imported_hash TEXT NOT NULL DEFAULT '',
  run_id        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_legacy_messages_status ON cc_legacy_messages(status, legacy_at);
CREATE INDEX IF NOT EXISTS cc_legacy_messages_email ON cc_legacy_messages(email_key);
CREATE TABLE IF NOT EXISTS cc_legacy_rows (
  entity        TEXT NOT NULL,                        -- keywords | plans | settings | rfqs_private | … (raw archive, admin-only)
  legacy_id     TEXT NOT NULL,
  raw_json      TEXT NOT NULL DEFAULT '{}',
  run_id        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  PRIMARY KEY (entity, legacy_id)
);

-- ============================================ plans (single source of truth, §7) ============================================
CREATE TABLE IF NOT EXISTS cc_plan_keys (
  k           TEXT PRIMARY KEY,                       -- matrix row key
  type        TEXT NOT NULL CHECK (type IN ('number', 'bool')),
  label_ar    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  grp         TEXT NOT NULL DEFAULT 'features',        -- limits | markets | features | legacy
  enforced_by TEXT NOT NULL DEFAULT 'none',            -- comma list: worker, site, acc, janna, none
  sort        INTEGER NOT NULL DEFAULT 100,
  builtin     INTEGER NOT NULL DEFAULT 0,
  legacy_key  TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cc_plans (
  plan          TEXT PRIMARY KEY CHECK (plan IN ('visitor', 'profile', 'basic', 'premium', 'partner', 'strategic')),
  sort          INTEGER NOT NULL,
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  price_egp     INTEGER NOT NULL DEFAULT 0,           -- annual price in whole pounds, before VAT
  duration_days INTEGER NOT NULL DEFAULT 365,
  sellable      INTEGER NOT NULL DEFAULT 1,
  caps_json     TEXT NOT NULL DEFAULT '{}',           -- {"products":30,"images_per_product":1,"m_local":1,…}
  updated_by    TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL
);
INSERT OR IGNORE INTO cc_plan_keys (k, type, label_ar, label_en, grp, enforced_by, sort, builtin) VALUES
  ('products',           'number', 'عدد المنتجات في السوق',                     'Products in the marketplace',              'limits',   'acc,site,janna',    10, 1),
  ('images_per_product', 'number', 'صور لكل منتج',                              'Images per product',                       'limits',   'acc,site',          20, 1),
  ('m_local',            'bool',   'فرص وبيانات مصر',                           'Egypt opportunities & data',               'markets',  'worker,site,janna', 30, 1),
  ('m_gulf',             'bool',   'أسواق الخليج والدول العربية',                'Gulf & Arab markets',                      'markets',  'worker,site,janna', 31, 1),
  ('m_africa',           'bool',   'أسواق أفريقيا',                             'African markets',                          'markets',  'worker,site,janna', 32, 1),
  ('m_asia',             'bool',   'أسواق آسيا',                                'Asian markets',                            'markets',  'worker,site,janna', 33, 1),
  ('m_europe',           'bool',   'أسواق أوروبا',                              'European markets',                         'markets',  'worker,site,janna', 34, 1),
  ('alerts',             'bool',   'تنبيهات وملخصات بالجديد',                   'Alerts & digests',                         'features', 'worker,site',       40, 1),
  ('listing',            'bool',   'ملف الشركة في الدليل وتعديله',               'Directory listing & edits',                'features', 'acc,site',          41, 1),
  ('respond',            'bool',   'الرد على المناقصات وطلبات الأسعار',           'Respond to tenders & RFQs',                'features', 'site',              42, 1),
  ('incoming',           'bool',   'استقبال طلبات المشترين المطابقة تلقائياً',     'Receive matching buyer requests',          'features', 'worker,site,janna', 43, 1),
  ('stats',              'bool',   'إحصائيات حقيقية للملف',                      'Real profile statistics',                  'features', 'worker,site',       44, 1),
  ('priority',           'bool',   'أولوية في توزيع الطلبات',                    'Priority in request routing',              'features', 'worker,janna',      45, 1),
  ('featured',           'bool',   'أولوية في ترتيب القوائم والبحث',              'Priority in listings & search',            'features', 'site',              46, 1),
  ('bassem',             'bool',   'المستشار الذكي «باسم»',                       'AI advisor «Bassem»',                      'features', 'worker,site,janna', 47, 1),
  ('video',              'bool',   'فيديو في ملف الشركة',                         'Video on the company profile',             'features', 'acc,site',          48, 1),
  ('social',             'bool',   'روابط السوشيال في ملف الشركة',                'Social links on the company profile',      'features', 'acc,site',          49, 1);
INSERT OR IGNORE INTO cc_plans (plan, sort, name_ar, name_en, price_egp, duration_days, sellable, caps_json, updated_at) VALUES
  ('visitor',   0, 'زائر',                        'Visitor',                0,      0,   0, '{"products":0,"images_per_product":0,"m_local":0,"m_gulf":0,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":0,"listing":0,"respond":0,"incoming":0,"stats":0,"priority":0,"featured":0,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('profile',   1, 'تسجيل بيانات الشركة فقط',     'Company data only',      4000,   365, 1, '{"products":0,"images_per_product":0,"m_local":1,"m_gulf":0,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":0,"incoming":0,"stats":0,"priority":0,"featured":0,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('basic',     2, 'الباقة الأساسية',             'Basic plan',             10000,  365, 1, '{"products":30,"images_per_product":1,"m_local":1,"m_gulf":0,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":0,"featured":0,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('premium',   3, 'الباقة المميزة',              'Premium plan',           25000,  365, 1, '{"products":80,"images_per_product":1,"m_local":1,"m_gulf":1,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":1,"featured":1,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('partner',   4, 'باقة الشريك الأساسي',         'Core Partner plan',      50000,  365, 1, '{"products":200,"images_per_product":1,"m_local":1,"m_gulf":1,"m_africa":1,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":1,"featured":1,"bassem":1,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('strategic', 5, 'باقة الشريك الاستراتيجي',     'Strategic Partner plan', 100000, 365, 1, '{"products":-1,"images_per_product":1,"m_local":1,"m_gulf":1,"m_africa":1,"m_asia":1,"m_europe":1,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":1,"featured":1,"bassem":1,"video":0,"social":0}', '2026-11-18T00:00:00.000Z');

-- ============================================ settings & secrets ============================================
CREATE TABLE IF NOT EXISTS cc_settings (
  k           TEXT PRIMARY KEY,                       -- e.g. contact_email, pay.provider, mail.from_email, legacy.<k>
  scope       TEXT NOT NULL CHECK (scope IN ('public', 'pay', 'mail', 'system', 'custom')),
  v           TEXT NOT NULL DEFAULT '',               -- plain string, or JSON for structured values (see §2.2)
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
INSERT OR IGNORE INTO cc_settings (k, scope, v, updated_at) VALUES
  ('contact_email',     'public', 'info@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('support_email',     'public', 'support@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('hotline_display',   'public', '02 38346757', '2026-11-18T00:00:00.000Z'),
  ('hotline_tel',       'public', '+20238346757', '2026-11-18T00:00:00.000Z'),
  ('whatsapp_display',  'public', '01279188996', '2026-11-18T00:00:00.000Z'),
  ('whatsapp_number',   'public', '201279188996', '2026-11-18T00:00:00.000Z'),
  ('address_ar',        'public', 'الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية', '2026-11-18T00:00:00.000Z'),
  ('address_en',        'public', '', '2026-11-18T00:00:00.000Z'),
  ('social_facebook',   'public', 'https://www.facebook.com/profile.php?id=61595683961104', '2026-11-18T00:00:00.000Z'),
  ('social_x',          'public', 'https://x.com/egy_business_eg', '2026-11-18T00:00:00.000Z'),
  ('social_instagram',  'public', 'https://www.instagram.com/mnstmsrllmnaqsat/', '2026-11-18T00:00:00.000Z'),
  ('social_linkedin',   'public', 'https://www.linkedin.com/in/%D9%85%D9%86%D8%B5%D8%A9-%D9%85%D8%B5%D8%B1-%D9%84%D9%84%D9%85%D9%86%D8%A7%D9%82%D8%B5%D8%A7%D8%AA-%D9%88%D8%A7%D9%84%D9%85%D9%88%D8%B1%D8%AF%D9%8A%D9%86-egyptbusinessgate-8a6346450/', '2026-11-18T00:00:00.000Z'),
  ('social_youtube',    'public', 'https://www.youtube.com/@egyptbusinessgate', '2026-11-18T00:00:00.000Z'),
  ('operator_ar',       'public', 'الجمعية المصرية للتنمية الصناعية', '2026-11-18T00:00:00.000Z'),
  ('operator_en',       'public', '', '2026-11-18T00:00:00.000Z'),
  ('operator_reg_ar',   'public', 'جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي)', '2026-11-18T00:00:00.000Z'),
  ('operator_reg_en',   'public', '', '2026-11-18T00:00:00.000Z'),
  ('operator_url',      'public', 'https://eafid.org/', '2026-11-18T00:00:00.000Z'),
  ('tax_no',            'public', '', '2026-11-18T00:00:00.000Z'),
  ('cr_no',             'public', '', '2026-11-18T00:00:00.000Z'),
  ('vat_bp',            'public', '1400', '2026-11-18T00:00:00.000Z'),
  ('billing_email',     'public', '', '2026-11-18T00:00:00.000Z'),
  ('manual_pay_ar',     'public', '', '2026-11-18T00:00:00.000Z'),
  ('manual_pay_en',     'public', '', '2026-11-18T00:00:00.000Z'),
  ('mail.enabled',      'mail',   '0', '2026-11-18T00:00:00.000Z'),
  ('mail.provider',     'mail',   'resend', '2026-11-18T00:00:00.000Z'),
  ('mail.from_email',   'mail',   'noreply@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('mail.from_name',    'mail',   'منصة صنع في مصر', '2026-11-18T00:00:00.000Z'),
  ('mail.reply_to',     'mail',   'info@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('pay.enabled',       'pay',    '0', '2026-11-18T00:00:00.000Z'),
  ('pay.provider',      'pay',    '', '2026-11-18T00:00:00.000Z'),
  ('pay.mode',          'pay',    'test', '2026-11-18T00:00:00.000Z'),
  ('pay.currency',      'pay',    'EGP', '2026-11-18T00:00:00.000Z'),
  ('pay.manual_fallback','pay',   '0', '2026-11-18T00:00:00.000Z'),
  ('overlay.enabled',   'system', '1', '2026-11-18T00:00:00.000Z'),
  ('persona.auto_sync', 'system', '1', '2026-11-18T00:00:00.000Z');
CREATE TABLE IF NOT EXISTS cc_secrets (
  name    TEXT PRIMARY KEY,                           -- slot names in ACC-CONTRACT §0.7
  sealed  TEXT NOT NULL,                              -- "v1.<iv>.<ciphertext>" (AES-GCM, CONFIG_SECRET)
  tail    TEXT NOT NULL DEFAULT '',                   -- last 4 characters, for the masked display only
  set_by  TEXT NOT NULL DEFAULT '',
  set_at  TEXT NOT NULL
);

-- ============================================ content overlay, edge actions, media (§4) ============================================
CREATE TABLE IF NOT EXISTS cc_content (
  id           TEXT PRIMARY KEY,                      -- adds: collection id (c-xxxxxxxx, TEN-2026-C001 …); base rows: 'e-' || rid(8)
  coll         TEXT NOT NULL,                         -- fac facx prod tend rfq offer zone news event award opp intl video proj banner notice cats
  kind         TEXT NOT NULL CHECK (kind IN ('base', 'add')),
  base_key     TEXT NOT NULL DEFAULT '',              -- kind base: the collection key of the base row (§4.4)
  state        TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'unpublished')),
  draft_json   TEXT NOT NULL DEFAULT '{}',            -- working copy: changed named fields (base) / full record (add)
  live_json    TEXT NOT NULL DEFAULT '',              -- published copy ('' = never published)
  hidden       INTEGER NOT NULL DEFAULT 0,            -- 1 = hidden (draft side)
  live_hidden  INTEGER NOT NULL DEFAULT 0,            -- 1 = hidden in the published overlay
  deleted      INTEGER NOT NULL DEFAULT 0,            -- 1 = deleted (adds: removed; base: hidden + edge redirect)
  private_json TEXT NOT NULL DEFAULT '{}',            -- admin-only fields (rfq client, phone, e-mail, channel; inquiry ref) — never compiled
  seo_path     TEXT NOT NULL DEFAULT '',              -- the static SEO page of this item, when one exists (computed by the panel, §4.10)
  static_impact INTEGER NOT NULL DEFAULT 0,           -- 1 = a rebuild is needed for static pages to show the published change
  source       TEXT NOT NULL DEFAULT 'admin',         -- admin | member | import
  member_id    TEXT NOT NULL DEFAULT '',              -- member submissions (products, company changes)
  rev          INTEGER NOT NULL DEFAULT 0,            -- bumped on every draft change
  published_v  INTEGER NOT NULL DEFAULT 0,            -- overlay version that first contained the current live copy
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL,
  published_by TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_content_base ON cc_content(coll, base_key) WHERE kind = 'base';
CREATE INDEX IF NOT EXISTS cc_content_coll ON cc_content(coll, state, updated_at);
CREATE INDEX IF NOT EXISTS cc_content_pub ON cc_content(published_v);
CREATE TABLE IF NOT EXISTS cc_overlay (
  v           INTEGER PRIMARY KEY,                    -- version = publish time in ms (strictly increasing)
  at          TEXT NOT NULL,
  by          TEXT NOT NULL DEFAULT '',
  bytes       INTEGER NOT NULL DEFAULT 0,
  sha         TEXT NOT NULL DEFAULT '',
  counts_json TEXT NOT NULL DEFAULT '{}',             -- {coll: {e, h, a}}
  js          TEXT NOT NULL DEFAULT '',               -- the compiled /data/overlay.js (kept for the last 20 versions)
  note        TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cc_edge (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id  TEXT NOT NULL,
  path        TEXT NOT NULL,                          -- static SEO path (decoded NFC, trailing slash)
  action      TEXT NOT NULL CHECK (action IN ('noindex', 'redirect', 'restore')),
  to_path     TEXT NOT NULL DEFAULT '',
  before_json TEXT NOT NULL DEFAULT 'null',           -- the SEO override/redirect that existed before (restored on unhide)
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'cancelled')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  done_at     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_edge_status ON cc_edge(status, created_at);
CREATE INDEX IF NOT EXISTS cc_edge_content ON cc_edge(content_id);
CREATE TABLE IF NOT EXISTS cc_media (
  id           TEXT PRIMARY KEY,                      -- rid(16)
  r2_key       TEXT NOT NULL UNIQUE,                  -- u/<yyyy>/<id>.<ext>
  owner_type   TEXT NOT NULL CHECK (owner_type IN ('admin', 'member')),
  owner_id     TEXT NOT NULL,
  purpose      TEXT NOT NULL CHECK (purpose IN ('logo', 'product', 'banner', 'news', 'event', 'zone', 'offer', 'project', 'notice', 'other')),
  mime         TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes        INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'public', 'rejected', 'deleted')),
  orig_name    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  approved_by  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_media_owner ON cc_media(owner_type, owner_id, created_at);
CREATE INDEX IF NOT EXISTS cc_media_sha ON cc_media(sha256);

-- ============================================ member self-service (§8) ============================================
CREATE TABLE IF NOT EXISTS cc_member_products (
  id            TEXT PRIMARY KEY,                     -- 'p-' || rid(8); the same id becomes the published prod row id
  member_id     TEXT NOT NULL,
  factory_ref   TEXT NOT NULL DEFAULT '',             -- the member's directory profile at submission time
  state         TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'pending', 'approved', 'rejected', 'hidden', 'deleted')),
  draft_json    TEXT NOT NULL DEFAULT '{}',           -- {name, name_en, category, description, description_en, price, images:[media ids]}
  live_json     TEXT NOT NULL DEFAULT '',             -- last approved version
  reject_reason TEXT NOT NULL DEFAULT '',
  submitted_at  TEXT NOT NULL DEFAULT '',
  reviewed_by   TEXT NOT NULL DEFAULT '',
  reviewed_at   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_member_products_member ON cc_member_products(member_id, state);
CREATE INDEX IF NOT EXISTS cc_member_products_queue ON cc_member_products(state, submitted_at);
CREATE TABLE IF NOT EXISTS cc_company_requests (
  id            TEXT PRIMARY KEY,                     -- 'cr-' || rid(10)
  member_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('edit', 'claim', 'create')),
  factory_ref   TEXT NOT NULL DEFAULT '',             -- edit/claim: the listing (index, x<i> or c-… id)
  fields_json   TEXT NOT NULL DEFAULT '{}',
  state         TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reject_reason TEXT NOT NULL DEFAULT '',
  reviewed_by   TEXT NOT NULL DEFAULT '',
  reviewed_at   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_company_requests_member ON cc_company_requests(member_id, created_at);
CREATE INDEX IF NOT EXISTS cc_company_requests_queue ON cc_company_requests(state, created_at);

-- ============================================ payments (§5) ============================================
CREATE TABLE IF NOT EXISTS cc_counters (
  k  TEXT PRIMARY KEY,                                -- inv:<yyyy> | rfq | tend:<yyyy> | opp | proj
  n  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cc_invoices (
  id            TEXT PRIMARY KEY,                     -- rid(16)
  no            TEXT NOT NULL UNIQUE,                 -- INV-<yyyy>-<000001>
  member_id     TEXT NOT NULL DEFAULT '',             -- '' until the buyer has an account (linked at payment / sign-in)
  email         TEXT NOT NULL,
  email_key     TEXT NOT NULL,
  company       TEXT NOT NULL DEFAULT '',
  plan          TEXT NOT NULL,
  plan_name     TEXT NOT NULL DEFAULT '',             -- frozen at issue
  period_days   INTEGER NOT NULL,
  period_end    TEXT NOT NULL DEFAULT '',             -- fixed end of the paid period: a prorated upgrade ends with the plan in force (Terms §5); '' = activation + period_days
  net_minor     INTEGER NOT NULL,                     -- piasters
  vat_bp        INTEGER NOT NULL,
  vat_minor     INTEGER NOT NULL,
  total_minor   INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EGP',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void', 'refunded')),
  source        TEXT NOT NULL CHECK (source IN ('signup', 'renewal', 'upgrade', 'admin', 'member', 'test')),
  inquiry_ref   TEXT NOT NULL DEFAULT '',             -- the signup request (kind=signup) that caused it
  pay_token     TEXT NOT NULL UNIQUE,                 -- 32-char b64url secret for pay.html#inv=…
  test          INTEGER NOT NULL DEFAULT 0,           -- 1 = owner's sandbox invoice (never activates a real plan)
  issued_at     TEXT NOT NULL,
  due_at        TEXT NOT NULL DEFAULT '',
  paid_at       TEXT NOT NULL DEFAULT '',
  paid_via      TEXT NOT NULL DEFAULT '',             -- webhook | return | query | manual
  provider      TEXT NOT NULL DEFAULT '',
  provider_ref  TEXT NOT NULL DEFAULT '',
  manual_ref    TEXT NOT NULL DEFAULT '',             -- bank / InstaPay reference typed by the admin
  notes         TEXT NOT NULL DEFAULT '',
  issued_mail_at TEXT NOT NULL DEFAULT '',            -- invoice e-mail sent
  link_mail_at  TEXT NOT NULL DEFAULT '',             -- payment-link e-mail sent (online gateway ready)
  reminder_at   TEXT NOT NULL DEFAULT '',
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_invoices_inquiry ON cc_invoices(inquiry_ref) WHERE inquiry_ref != '';
CREATE INDEX IF NOT EXISTS cc_invoices_member ON cc_invoices(member_id, created_at);
CREATE INDEX IF NOT EXISTS cc_invoices_email ON cc_invoices(email_key, created_at);
CREATE INDEX IF NOT EXISTS cc_invoices_status ON cc_invoices(status, issued_at);
CREATE TABLE IF NOT EXISTS cc_payments (
  id            TEXT PRIMARY KEY,                     -- rid(16)
  invoice_id    TEXT NOT NULL,
  provider      TEXT NOT NULL CHECK (provider IN ('ngenius', 'paymob', 'paytabs', 'manual')),
  mode          TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_ref  TEXT NOT NULL DEFAULT '',             -- N-Genius order reference | Paymob intention id | PayTabs tran_ref
  provider_txn  TEXT NOT NULL DEFAULT '',             -- Paymob transaction id | N-Genius payment id | PayTabs tran_ref
  provider_order TEXT NOT NULL DEFAULT '',            -- Paymob intention_order_id
  amount_minor  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EGP',
  status        TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'redirected', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  raw_status    TEXT NOT NULL DEFAULT '',
  verified_via  TEXT NOT NULL DEFAULT '',
  error         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_payments_invoice ON cc_payments(invoice_id, created_at);
CREATE INDEX IF NOT EXISTS cc_payments_ref ON cc_payments(provider, provider_ref);
CREATE TABLE IF NOT EXISTS cc_pay_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider     TEXT NOT NULL,
  event_key    TEXT NOT NULL,                         -- provider + txn/order id + status: idempotency key
  kind         TEXT NOT NULL CHECK (kind IN ('webhook', 'return', 'query', 'manual')),
  invoice_id   TEXT NOT NULL DEFAULT '',
  payment_id   TEXT NOT NULL DEFAULT '',
  verified     INTEGER NOT NULL DEFAULT 0,
  result       TEXT NOT NULL DEFAULT '',              -- paid | failed | pending | ignored | rejected:<why>
  payload_sha  TEXT NOT NULL DEFAULT '',              -- sha256 of the raw body (the body itself is not stored)
  created_at   TEXT NOT NULL,
  UNIQUE (provider, event_key)
);
CREATE INDEX IF NOT EXISTS cc_pay_events_invoice ON cc_pay_events(invoice_id, created_at);

-- ============================================ e-mail center (§6) ============================================
CREATE TABLE IF NOT EXISTS cc_mail_templates (
  key         TEXT PRIMARY KEY,                       -- template key (§6.1)
  enabled     INTEGER NOT NULL DEFAULT 1,             -- ignored for required templates
  subject_ar  TEXT NOT NULL DEFAULT '',               -- '' = default; may contain {{subject}} and the template's {{vars}}
  subject_en  TEXT NOT NULL DEFAULT '',
  intro_ar    TEXT NOT NULL DEFAULT '',               -- text added before the body
  intro_en    TEXT NOT NULL DEFAULT '',
  outro_ar    TEXT NOT NULL DEFAULT '',               -- text added after the body
  outro_en    TEXT NOT NULL DEFAULT '',
  body_ar     TEXT NOT NULL DEFAULT '',               -- full body (only templates with "vars":true)
  body_en     TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cc_mail_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  msg_id      TEXT NOT NULL DEFAULT '',               -- the caller's message id (idempotency)
  template    TEXT NOT NULL DEFAULT '',
  list        TEXT NOT NULL DEFAULT '',
  to_hash     TEXT NOT NULL DEFAULT '',               -- keyed hash of the lower-cased recipient (search by exact address)
  to_masked   TEXT NOT NULL DEFAULT '',               -- a•••@domain
  subject     TEXT NOT NULL DEFAULT '',               -- ≤ 120 chars; sign-in codes are masked (••••••)
  provider    TEXT NOT NULL DEFAULT '',               -- resend | brevo | cloudflare | ''
  provider_id TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error       TEXT NOT NULL DEFAULT '',
  ms          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cc_mail_log_at ON cc_mail_log(at);
CREATE INDEX IF NOT EXISTS cc_mail_log_to ON cc_mail_log(to_hash, at);
CREATE INDEX IF NOT EXISTS cc_mail_log_tpl ON cc_mail_log(template, at);
CREATE INDEX IF NOT EXISTS cc_mail_log_msg ON cc_mail_log(msg_id);

-- ============================================ page analytics (§3.1.12; no raw IPs) ============================================
CREATE TABLE IF NOT EXISTS cc_pv_day (
  day          TEXT PRIMARY KEY,                      -- Cairo date
  views        INTEGER NOT NULL DEFAULT 0,
  uniq         INTEGER NOT NULL DEFAULT 0,            -- unique visitors that day (daily-salted keyed hash)
  mobile_uniq  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cc_pv_page (
  day    TEXT NOT NULL,
  path   TEXT NOT NULL,
  views  INTEGER NOT NULL DEFAULT 0,
  uniq   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE TABLE IF NOT EXISTS cc_pv_src (
  day  TEXT NOT NULL,
  src  TEXT NOT NULL,                                 -- direct | google | bing | facebook | x | linkedin | youtube | instagram | whatsapp | <host>
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, src)
);
CREATE TABLE IF NOT EXISTS cc_pv_seen (
  h    TEXT PRIMARY KEY,                              -- sha256(secret|pv|day|ip hash|ua family|scope) — purged after 2 days
  day  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_pv_seen_day ON cc_pv_seen(day);

-- ============================================ Janna / Bassem persona sync (§7.5) ============================================
CREATE TABLE IF NOT EXISTS cc_persona_sync (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  TEXT NOT NULL,
  at          TEXT NOT NULL,
  by          TEXT NOT NULL DEFAULT '',
  plans_v     TEXT NOT NULL DEFAULT '',               -- plans updated_at used for the generated section
  status      TEXT NOT NULL CHECK (status IN ('ok', 'unchanged', 'failed', 'dry')),
  before_sha  TEXT NOT NULL DEFAULT '',
  after_sha   TEXT NOT NULL DEFAULT '',
  error       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_persona_sync_p ON cc_persona_sync(persona_id, at);
```

### 2.1 Relations to the existing tables
| new table | relates to | how |
|---|---|---|
| `cc_staff.member_id`, `cc_member_meta.member_id`, `cc_member_products.member_id`, `cc_company_requests.member_id`, `cc_invoices.member_id` | `members.id` | logical FK (no SQL FK, like the existing schema) |
| `cc_session_meta.sid_hash` | `auth_sessions.sid_hash` | 1:1 for bridge sessions; absent row = e-mail-code session |
| `cc_member_meta.status` | `members.plan`, `plan_expires` | `active` ⇔ account usable; `pending` = subscription not completed (no plan in force, `requested_plan` set); `suspended` = admin hold: plan moved to `suspended_plan` and `members.plan='visitor'`, `inbox_paused=1` (existing gates then apply with no code change) |
| `cc_customer_notes.email_key` | `inquiries.email_key` | customers are computed from inquiries (§8.1) |
| `cc_content` (coll `rfq`, `private_json.inquiry_ref`) | `inquiries.ref` | a manual RFQ = one inquiry (routing) + one public overlay row |
| `cc_invoices.inquiry_ref` | `inquiries.ref` (kind `signup`) | one automatic invoice per signup request (partial unique index) |
| `cc_invoices.email_key` | `members` by mailbox | linked to `member_id` at payment or at the buyer's first sign-in |
| `cc_legacy_companies.factory_ref`, `cc_member_products.factory_ref`, `cc_company_requests.factory_ref` | `members.factory_ref` and the directory row id (`"12"`, `"x3"`, `"c-k7m2q9x4"`) | same id format as `members.factory_ref` today (company.html hash) |
| `cc_pv_*` | — | separate from `ev_daily` (item metrics stay in ev.js) |
| `cc_mail_log` | every e-mail of `sendEmail()` / `mail()` | written by the delivery hook (§6.3) |
| `cc_audit` | everything | append-only |
| existing `events` table | — | admin.js keeps writing `member_set` rows; acc writes `cc_audit` (both may exist for one change) |

### 2.2 Value formats in `cc_settings`
Strings, except: `vat_bp` integer string; `mail.enabled`, `pay.enabled`, `pay.manual_fallback`, `overlay.enabled`, `persona.auto_sync` `"0"|"1"`;
`pay.paymob.integration_ids` comma-separated integers; `pay.ngenius.host` / `pay.paytabs.host` host names; `pay.success_url` / `pay.fail_url`
https URLs on the site; `cats` (scope public) JSON `{"<key>":{"ar":"…","en":"…","icon":"…","hidden":0}}`; `custom` scope = the live key/value
rows (`legacy.<k>` for imported ones). Public keys (scope `public`) are the ONLY settings compiled into the overlay.

---

## 3. API contract

### 3.0 Dispatch, boot and cron (integrator wires them in worker/src/index.js; §10.3 P-W1)
Order inside `fetch()` (before the existing lines, because `/api/me` and `/api/auth` and `/api/admin` regexes would swallow these paths):
```js
await CC.acc.ccBoot(env, CC);                                                   // ≤ 1 D1 read per isolate per 60 s; never throws
if (/^\/data\/overlay\.js$/.test(url.pathname)) return CC.content.serveOverlay(req, env, ctx);
if (/^\/media\/u\//.test(url.pathname)) return CC.content.serveMedia(req, env, ctx);
if (/^\/api\/index\.php$/.test(url.pathname)) return CC.acc.handleOldApi(req, env, ctx);
if (/\/api\/admin\/cc(\/|$)/.test(url.pathname)) return CC.acc.handleCC(req, env, ctx, CC);
if (/\/api\/me\/(account|products|company|media|invoices|recognize)(\/|$)/.test(url.pathname)) return CC.acc.handleMeCC(req, env, ctx, CC);
if (/\/api\/auth\/legacy(\/|$)/.test(url.pathname)) return CC.acc.handleLegacyAuth(req, env, ctx, CC);
if (/\/api\/plans\/?$/.test(url.pathname) || /\/api\/settings\/?$/.test(url.pathname) || /\/api\/ev\/pv\/?$/.test(url.pathname)) return CC.acc.handlePublicCC(req, env, ctx, CC); // one regex per family: integ-worker.test.mjs and deploy.sh scan for /api/<family>
if (/\/api\/pay(\/|$)/.test(url.pathname)) return CC.payments.handlePay(req, env, ctx, CC);
// … existing dispatch unchanged; /api/inquiries is wrapped so a new signup gets its invoice at once:
if (/\/api\/inquiries(\/|$)/.test(url.pathname)) { const res = await handleInquiries(req, env, ctx); if (req.method === "POST" && res.status === 201) { try { const j = await res.clone().json(); if (j && j.ref) ctx.waitUntil(CC.payments.onInquiryCreated(env, j.ref, CC)); } catch (e) { /* ignore */ } } return res; }
```
`scheduled()`: `await CC.acc.ccBoot(env, CC)` first (the plan matrix and mail config also govern cron e-mails, digests and Bassem), then
`platformCron` gets one more isolated job `["cc", () => CC.acc.ccCron(env, nowMs, CC)]`; ccCron calls (each in its own try):
`CC.payments.paymentsCron` (renewal invoices 30/7 days, payment links when the gateway becomes ready, signup backstop for inquiries without an
invoice, provider re-query of `pending` payments older than 10 min), `CC.content.contentCron` (edge retries need an admin token → only
bookkeeping; media orphans older than 7 days → R2 delete; overlay KV self-heal from D1), `CC.email.emailCron` (purge mail log > 180 days),
acc's own (purge `cc_pv_seen` older than 2 days, `cc_audit` older than 730 days, legacy-session meta of expired sessions, persona sync retry
when `persona.auto_sync=1` and the last sync failed). `email()` handler: `await CC.acc.ccBoot(env, CC)` first (mail config for replies).

`ccBoot(env, CC)` (acc.js): memo per `env.DB` for 60 s; reads `cc_plans` and applies them (§7.3: `setPlanCaps`, in-place `PLAN_SCOPE`,
`PLAN_NAME`, advisor `PLAN_MARKETS`/`ELIGIBLE`); calls `CC.email.loadMailConfig(env)`. Any error (no table, no DB) → keep defaults.

### 3.1 acc.js — router, members, customers, orders, approvals, plans, settings, staff, audit, reports, import, legacy, analytics, self-service
`handleCC` authenticates once (`authUser()` or `X-Platform-Key`), resolves the role (§0.5), rate-limits writes (120/min/actor, 429
`rate_limited`), builds `adm = {member, role, perms, can(p), audit(action, type, id, before, after, summary), ipHash, reqId, lang, CC}` and
dispatches: `/api/admin/cc/content/*` and `/api/admin/cc/media*` → `CC.content.handleContentAdmin(req, env, ctx, adm)`, `/api/admin/cc/pay/*` →
`CC.payments.handlePayAdmin(…)`, `/api/admin/cc/email/*` → `CC.email.handleEmailAdmin(…)`, everything else in acc. A permission failure is
always 403 `{code:"forbidden", need:"<perm>"}`; owner-only 403 `owner_only`.

#### 3.1.1 Session & badges
| method path | perm | response |
|---|---|---|
| GET `/api/admin/cc/whoami` | any role | `{user: userOut, role, perms:[…], bootstrap_owner: bool, lang_default: "ar", site: "https://madeinegyptgate.com/", features: {overlay_kv: bool, media_r2: bool, config_secret: bool, email_ready: bool, pay_ready: bool, legacy_origin: bool, anam: bool}}` · 401 · 403 `use_email_code` (legacy session) · 403 `forbidden` (no role) |
| GET `/api/admin/cc/badges` | stats.read | `{msgNew, rfqNew, needsTeam, approvals, unpaid, expSoon, edge}` — integers; each from one COUNT (definitions §9.3) |

#### 3.1.2 Statistics (live home view) — GET `/api/admin/cc/stats?days=30` (stats.read; days 7–90)
```json
{"days":30,"since":"2026-11-18","views":0,"visitors":0,"mobile":0,
 "series":[{"day":"2026-11-18","v":0,"u":0}],"top":[{"path":"/factories/","c":0}],"src":[{"ref":"google","c":0}],
 "tenders":497,"companies":3020,"members":0,"pending":0,"rfqs":5,"rfqNew":0,"msgNew":0,"msgAll":0,"news":122,"videos":26,"products":183,
 "soon":0,"expired":0,"plans":[{"plan":"basic","c":0}],"recent":[{"company":"","email":"","status":"active","created_at":""}],
 "msgKinds":[{"kind":"rfq","c":0}],"needsTeam":0,"approvals":0,"unpaid":{"n":0,"total_minor":0},"revenue_month_minor":0}
```
Definitions: `views`/`visitors`/`mobile` = SUM over `cc_pv_day` (mobile = round(100·Σmobile_uniq/Σuniq), 0 when no uniq); `series` per day
(missing days omitted, the chart fills zeros like the live chart); `top` = top 10 `cc_pv_page` paths by views; `src` = top 8 `cc_pv_src`
excluding `direct` first then direct; content counts = `CC.content.contentCounts(env)` (base counts from worker/src/data.json — tenders =
`t.length` + REAL tenders counted from `i`, companies = `f.length`, rfqs = `q.length`, news/videos/products from the build-index counts
`DATA.n` when present (§10.3 P-T3), else `null`) ± published adds/hides; `members` = members with `plan != 'visitor'` in force; `pending` =
`cc_member_meta.status='pending'`; `rfqNew` = inquiries kind `rfq` in the last 7 days; `msgNew` = inquiries with status `received`, `in_progress`
or `no_match` + legacy messages `new`; `msgAll` = all inquiries + legacy messages; `soon` = plan_expires within 30 days; `expired` = verified paid plans
whose plan_expires is past; `plans` = counts by `members.plan` (in force, + `none` = visitor accounts); `recent` = last 6 members by
`created_at` with `cc_member_meta.status`; `msgKinds` = inquiries by kind (all time). `since` = first `cc_pv_day.day` (or today).

#### 3.1.3 Members (accounts & subscriptions)
| method path | perm | request | response / errors |
|---|---|---|---|
| GET `/api/admin/cc/members?q=&plan=&status=&expired=1&soon=1&page=&limit=` | members.read | `plan`: one key, `none`, or comma list (`partner,strategic`) | `{items:[MemberRow], total, page, limit}` |
| GET `/api/admin/cc/members.csv?…same filters` | members.read + (admin/owner) | — | text/csv (every MemberRow field) |
| GET `/api/admin/cc/members/:id` | members.read | — | `{member: MemberRow, meta: {...cc_member_meta}, invoices:[…], routed:{count, last:[{ref,status,created_at}]}, follows: n, bassem: {…prefs}|null, sessions: n, audit:[≤20], legacy_profile: {…}}` · 404 |
| POST `/api/admin/cc/members` | members.write | `{email*, company, name, title, phone, plan, plan_until, status, sector, governorate, products, factory_ref, inbox_paused, notes, invite}` | 201 `{member}` · 409 `exists` `{id}` (same mailbox) · 400 `invalid_*` |
| PATCH `/api/admin/cc/members/:id` | members.write (members.contact for name/title/phone/company only) | any subset of the POST fields except `plan/plan_until/status` | `{member}` · 409 `company_locked` never applies to admins |
| POST `/api/admin/cc/members/:id/plan` | members.plan | `{plan, plan_until?}` (`""`/`none` → visitor) | `{member, rematched}` |
| POST `/api/admin/cc/members/:id/status` | members.plan | `{status: active|pending|suspended}` | `{member}` · 409 `state` |
| POST `/api/admin/cc/members/:id/extend` | members.plan | `{days: 1..1095}` | `{member}` |
| POST `/api/admin/cc/members/:id/invite` | members.write | `{lang?}` | `{ok, sent}` (template `member_invite`; 429 after 3/day/member) |
| POST `/api/admin/cc/members/:id/sessions/revoke` | members.plan | — | `{ok, revoked}` |
| DELETE `/api/admin/cc/members/:id` | members.delete (owner) | `{confirm: "<email>"}` | `{ok}` — anonymise: e-mail → `deleted+<id>@invalid`, name/phone/company/products cleared, plan visitor, sessions revoked, follows/notifications deleted, `cc_member_meta.notes="deleted <at>"`; inquiries keep their rows (buyer data unchanged) |

`MemberRow` = `userOut(env, m)` fields + `{name (manager), phone (tel), plan_until: "YYYY-MM-DD"|"" (Cairo date of plan_expires), status:
active|pending|suspended, requested_plan, last_seen_at (= last_login), verified, factory_ref, factory_name, role (staff role or ""), open_invoice:
{no, total_minor}|null, source, legacy_id}`.

`setPlan(env, {memberId, plan, expires, by, reason, invoiceNo})` — exported, used by the members endpoints and (through `CC.acc.setPlan`) by
payments. It MUST reproduce admin.js `setMember()` semantics exactly: `canonPlan()`; `verified = 1`; `activated_at = now` when the new plan is
basic+ and the member was below basic, had no `activated_at`, or had no plan in force; `plan_expires` = ISO or `''`; then `UPDATE members`,
insert the legacy `events` row `member_set`, `cc_member_meta` upsert (`status='active'`, `requested_plan=''`), `cc_audit`, and
`rematchForMember(env, id)` when the plan in force is ≥ basic (the existing automatic re-matching). `plan_until` (admin form) →
`cairoToUtc(D, "23:59")`. Status semantics: `pending` → no plan change, meta status only; `suspended` → store `plan`/`plan_expires` in
`suspended_plan`/`suspended_expires`, set `members.plan='visitor'`, `inbox_paused=1`, revoke sessions? NO (they may still sign in and pay);
`active` from `suspended` → restore the held plan (if still unexpired) and `inbox_paused=0` (+`resubscribe(env, email, "incoming")`).

#### 3.1.4 Customers (buyers) — §8.1
| GET `/api/admin/cc/customers?q=&kind=&has_account=0|1&from=&to=&page=&limit=` | customers.read | `{items:[{cid, email, name, company, phone, first_at, last_at, total, kinds:{rfq:n,…}, open, member:{id, plan}|null, blocked, note, tags}], total, page, limit}` |
|---|---|---|
| GET `/api/admin/cc/customers.csv?…` | customers.read + admin/owner | text/csv |
| GET `/api/admin/cc/customers/:cid` | customers.read | `{customer, inquiries:[inquiryListItem + routed_count], legacy_messages:[…]}` |
| PUT `/api/admin/cc/customers/:cid/note` | customers.write | `{note ≤ 2000, tags ≤ 200}` → `{ok}` |
`cid` = first 16 chars of `hmac(secretOf(env), "cid|" + email_key)` (no e-mail in URLs); the server keeps a reverse lookup by recomputing from
`inquiries.email_key` (indexed).

#### 3.1.5 Legacy data (admin-only views)
| GET `/api/admin/cc/legacy/companies?q=&status=&linked=&page=` | legacy.contacts | `{items:[cc_legacy_companies row], total}` |
|---|---|---|
| PATCH `/api/admin/cc/legacy/companies/:id` | directory.link | `{factory_ref}` → `{ok}` (also offers `members` link when a member has the same mailbox) |
| GET `/api/admin/cc/legacy/messages?status=&q=&page=` | orders.read | `{items, total}` |
| PATCH `/api/admin/cc/legacy/messages/:id` | orders.note | `{status: new|read|done}` → `{ok}` |
| DELETE `/api/admin/cc/legacy/messages/:id` | orders.close + admin/owner | `{ok}` |

#### 3.1.6 Orders / sales requests over `inquiries` (§9)
| method path | perm | request | response |
|---|---|---|---|
| GET `/api/admin/cc/orders?kind=&status=&needs_team=1&source=&market=&from=&to=&q=&page=&limit=` | orders.read | `kind` may be a comma list | `{items:[OrderRow], total, page, limit, counts:{status:{…}}, kinds:{kind:n}}` |
| GET `/api/admin/cc/orders.csv?…` | orders.read + admin/owner | | text/csv (OrderRow + buyer e-mail/phone) |
| GET `/api/admin/cc/orders/:ref` | orders.read | | `{inquiry, events, routes, quotes, needs_team, candidates, candidates_at, web_search}` — exactly the shape of the existing (deploy 1) `GET /api/admin/inquiries/:id_or_ref`; acc builds it with the same exported helpers so the `support` role (members.role `user`) can read it |
| POST `/api/admin/cc/orders/:ref/team-reply` | orders.reply | `{body 1..4000, channel: email|whatsapp|both, status?: in_progress|replied|closed}` | the result of inquiries.js `teamReply(env, row, {body, channel, status, by: adm.member.email})` = `{ok, sent:{email, whatsapp}, status, fallback?, errors?}` — the SAME function as the existing `POST /api/admin/inquiries/:id_or_ref/reply` (deploy 1: buyer-visible event `team_reply`, actor `team`, e-mail `teamreply-…`, bell); owner/admin may call either endpoint; acc adds the audit row `order.team_reply` |
| POST `/api/admin/cc/orders/:ref/note` | orders.note | `{body 1..2000}` | `{ok}` — `inquiry_events {type:"note", buyer_visible:0, actor: admin e-mail}` |
| POST `/api/admin/cc/orders/:ref/close` | orders.close | `{reason?}` | `{ok}` — through `teamReply(…, {body: reason || "اتقفل الطلب بواسطة فريق المنصة.", channel:"email", status:"closed"})` so the buyer is told |
| GET `/api/admin/cc/orders/:ref/candidates` · POST `…/candidates/refresh` | orders.read | | `latestCandidates(env, inq.id)` / `refreshCandidates(env, inq)` from inquiries.js (deploy 1: candidates.js = platform directory rows that are NOT members + web results only when a search key is set) + acc adds `legacy:{phones, email}` from `cc_legacy_companies` for perm legacy.contacts; NOTHING is sent to anyone |
Resend and block stay on the existing endpoints (`POST /api/admin/inquiries/:id/resend`, `POST /api/admin/block`) and are called by the panel
directly for owner/admin (members.role `admin`). Owner/admin may also use deploy 1's `GET /api/admin/inquiries?status=needs_team`; the
panel uses `/api/admin/cc/orders` for every role because it adds kind/date/source filters, paging, legacy messages and CSV.

`OrderRow` = admin.js `adminInq(r)` + `{needs_team, last_event_at, team_replied: bool}`.

#### 3.1.7 Approvals (member submissions) — §8.4
| GET `/api/admin/cc/approvals?type=product|company&state=pending&page=` | approvals.products / approvals.company | `{items:[{type, id, member:{id, email, company, plan}, factory_ref, factory_name, kind, submitted_at, state, summary, fields, current}], total}` |
|---|---|---|
| POST `/api/admin/cc/approvals/product/:id/approve` | approvals.products | `{fields?}` (corrections) → `{ok, content_id, published_v}` |
| POST `/api/admin/cc/approvals/product/:id/reject` | approvals.products | `{reason 3..500}` → `{ok}` |
| POST `/api/admin/cc/approvals/company/:id/approve` | approvals.company | `{fields?}` → `{ok, factory_ref, published_v}` |
| POST `/api/admin/cc/approvals/company/:id/reject` | approvals.company | `{reason}` → `{ok}` |
| POST `/api/admin/cc/approvals/products/approve` | approvals.products | `{ids:[≤50]}` → `{ok, approved, failed:[{id, code}]}` |

#### 3.1.8 Plans (single source of truth, §7)
| GET `/api/admin/cc/plans` | plans.read | `{keys:[{k,type,label_ar,label_en,grp,enforced_by,sort,builtin}], plans:{<plan>:{sort,name_ar,name_en,price_egp,duration_days,sellable,caps:{…}}}, vat_bp, currency:"EGP", updated_at, published_v, persona:{auto, last:[{persona_id, name, at, status, error}]}}` |
|---|---|---|
| PUT `/api/admin/cc/plans` | plans.write | `{plans:{<plan>:{name_ar?, name_en?, price_egp?, duration_days?, sellable?, caps?}}, vat_bp?, keys?:[{k,label_ar,label_en,type,grp}] (custom rows only)}` → `{ok, updated_at, published_v, persona:{queued: bool}}` — validation: prices integer 0–10,000,000; durations 30–1095; numbers −1–100,000; booleans 0/1; `visitor` immutable; at least one market per sellable plan; then publish the overlay (`CC.content.publishOverlay(env, {by, reason:"plans"})`) and, when `persona.auto_sync=1`, queue the persona sync (`ctx.waitUntil`) |
| POST `/api/admin/cc/plans/persona-sync` | plans.sync | `{dry_run: bool, personas?: [ids]}` → `{items:[{persona_id, name, found_section: bool, changed: bool, before, after, status}]}` |

#### 3.1.9 Manual RFQ entry (live «طلبات عروض المشترين (RFQ)») — POST `/api/admin/cc/rfqs` (orders.rfq)
Request: `{client*, phone, email, channel, product*, qty, unit, sector, gov, city, deadline, details, status: "active"|"closed", publish: bool}`.
Steps: (1) create a real inquiry through the existing engine: build `new Request("https://madeinegyptgate.com/api/inquiries", {method:"POST",
body})` with body `{kind:"rfq", name: client, email: email || TEAM_EMAIL, phone, company: "", message: details, payload:{product, quantity: qty
+ " " + unit, sector, governorate: gov, city, deadline, channel, via_team: !email}, source:"admin", lang:"ar"}`, set
`request[Symbol.for("mig.cc.internal")] = {actor: adm.member.id}` (inquiries.js patch P-W5 skips Turnstile/IP limits for internal requests and
accepts source `admin`) and call `handleInquiries(request, env, ctx)` → `{ref, status, routed}`; (2) if `publish` and status active →
`CC.content.upsert(env, {coll:"rfq", kind:"add", fields:{title: product, details, qty: qty + " " + unit, delivery: city, deadline, gov, sector,
date: today}, private:{client, phone, email, channel, inquiry_ref: ref}, publish:true, by})`. Response 201 `{inquiry:{ref, status, routed},
content:{id, published_v}|null}`. Closing a manual RFQ (`status:"closed"` via PATCH on the content row) hides the public row and closes the
inquiry (`/orders/:ref/close`).

#### 3.1.10 Settings
| GET `/api/admin/cc/settings` | settings.read | `{public:{<k>:v}, custom:[{k, v, updated_at, updated_by}], groups:[{id, keys:[…]}]}` |
|---|---|---|
| PUT `/api/admin/cc/settings` | settings.write | `{public?:{k:v}, custom?:[{k, v}], delete?:[k]}` → `{ok, published_v}` (validation per key: e-mails `isEmail`; `*_tel`/`whatsapp_number` digits with optional +; `social_*`/`operator_url` https; `vat_bp` 0–5000; text ≤ 500, neutralised) → publish overlay |

#### 3.1.11 Staff, audit, reports, Bassem
| GET `/api/admin/cc/staff` | staff.read | `{items:[{member_id, email, name, role, added_by, added_at, disabled_at, last_seen_at, bootstrap}]}` |
|---|---|---|
| POST `/api/admin/cc/staff` | staff.write | `{email, role}` → 201 `{item}` (creates a `members` row `verified=1`, `plan='visitor'` if none; sets `members.role` per §0.5; e-mail `staff_added`) · 403 when an admin grants admin/owner · 409 `exists` |
| PATCH `/api/admin/cc/staff/:member_id` | staff.write | `{role? , disabled?: bool}` → `{item}` · 403 for bootstrap owners or the last active owner |
| DELETE `/api/admin/cc/staff/:member_id` | staff.write | → `{ok}` (`members.role='user'`) |
| GET `/api/admin/cc/audit?actor=&action=&target_type=&target_id=&from=&to=&before=&limit=` | audit.read | `{items:[cc_audit row], next_before}` (newest first, `before` = id cursor) |
| GET `/api/admin/cc/audit.csv?…` | audit.export | text/csv |
| GET `/api/admin/cc/reports/summary?from=&to=` | reports.read | `{inquiries_by_day:[{day, n}], inquiries_by_kind:[{kind, n}], signups_by_day:[{day, n}], revenue_by_month:[{month, total_minor, n}], active_by_plan:[{plan, n}], pv_by_day:[{day, views, uniq}]}` |
| GET `/api/admin/cc/reports/:dataset.csv` | reports.export | dataset ∈ inquiries, signups, invoices, payments, members, customers, pv |
| GET `/api/admin/cc/bassem` | bassem.read | `{items:[{member_id, company, name, title, plan, activated_at, days_left, wa_optin, wa_verified, morning_time, session_time, days, pause, morning_sent_day, call_sent_day, deals_open, last_seen_at, mood_flags_30d}]}` |

#### 3.1.12 Page analytics — POST `/api/ev/pv` (public)
Body (sendBeacon, any content type, ≤ 1 KB): `{p: "<location.pathname>", r: "<document.referrer host or ''>", l: "ar|en"}` → always 204.
Counted only when: Origin/Referer host is the site (same rule as ev.js `sourceOk`, plus `CC_ORIGINS`), UA present and not a bot (ev.js `BOT`
regex + `/HeadlessChrome|Lighthouse|PageSpeed|GTmetrix/`), ≤ 300 counted views per network per day (`rateOk("pvip|"+ipHash, 300, 86400)`).
Path: decoded, NFC, query/hash dropped, ≤ 200 chars, must start with `/`. Source: `r` host → `direct` (empty), dropped (own host), `google`
(`google.` any TLD), `bing`, `yahoo`, `duckduckgo`, `facebook` (facebook.com, fb.com, m.facebook.com), `instagram`, `x` (x.com, t.co,
twitter.com), `linkedin` (linkedin.com, lnkd.in), `youtube`, `whatsapp` (wa.me, whatsapp.com, web.whatsapp.com), `telegram`, else the host
without `www.` (≤ 60 chars). Visitor key `h = sha256(secret + "|pv|" + day + "|" + ipHash + "|" + uaFamily)` where `uaFamily` = coarse
`<browser>/<os>/<m|d>`; first time today → `uniq+1` (and `mobile_uniq+1` when UA matches `/Mobi|Android|iPhone|iPad/`); per page
`sha256(h + "|" + path)` → page `uniq+1`; every counted hit → `views+1` for day and page. Raw IPs, full UAs and full referrers are never stored.
`navigator.doNotTrack === "1"` is respected client-side (no beacon).

#### 3.1.13 Old system bridge: proxy and old-password sign-in
**ANY `/api/index.php*` → `handleOldApi`**: transparent proxy, identical to mis-egypt `serve()` for the API: `const o = new URL(LEGACY_ORIGIN +
"/api/index.php"); o.search = url.search; const r = await fetch(new Request(o.toString(), req), {cf: {cacheTtl: -1}}); const res = new
Response(r.body, r); res.headers.set("Cache-Control", "no-store"); return res;` with `LEGACY_ORIGIN = env.LEGACY_ORIGIN ||
"https://mindful-mediumslateblue-okapi-21.hostingersite.com/egypt"`. No body/cookie is read, logged or stored. `LEGACY_ORIGIN = "off"` → 503
`{ok:false, error:"legacy_off"}` JSON. Rate limit 120 requests/min per network (429 JSON `{ok:false, error:"rate_limited"}`).
Deploy 2 does NOT give this handler a route (§0): on the domain `/api/index.php*` keeps going to mis-egypt, which does the same thing, so the
import tool's same-origin calls and the old cookies behave exactly as today. The handler is wired in index.js, covered by acc.test.mjs and is
the drop-in for the day the owner retires mis-egypt (then deploy.sh rebinds the two route objects with PUT — never part of deploy 2).

**POST `/api/auth/legacy`** `{email, password, lang, turnstile?}` → `{token, expires_at, user, via:"legacy"}`
1. Validate (`isEmail`, password 1..200). Turnstile via `human(req, env, b, {optional:true})`. Limits: 10/15 min per network, 5/hour and 10/day
   per address (`emailKey`), 5 failures/day per address → 429 `locked` until the next Cairo day.
2. Refuse staff before contacting the old server: any member with that mailbox having a role (cc_staff, members.role admin/seo) or the address
   in `ADMIN_EMAILS` → 403 `use_email_code`. `cc_member_meta.legacy_login_off = 1` → 403 `use_email_code`.
3. Server-side: `POST ${LEGACY_ORIGIN}/api/index.php?a=login` (JSON `{email, password}`, 8 s timeout, `User-Agent: MIG-legacy-bridge/1`), read
   `Set-Cookie`; `ok !== true` → 401 `invalid_credentials` (failure counted). Then `POST …?a=me` with that cookie → `user`; require
   `lower(user.email) === email` else 409 `email_mismatch`; then `POST …?a=logout` (best effort). Network error/5xx → 503 `legacy_off`.
4. Upsert the member (by mailbox; create `u`+hex(8) with `verified=1`, `email_verified_at=''` — the bridge does NOT prove the mailbox), fill
   empty company/name/phone, plan per the import rule of §1.5 (users row), `cc_member_meta` (`source='legacy_login'`, legacy_* fields).
5. Create a session exactly like auth.js `verify()` (`auth_sessions` row + `signSession(secretOf(env), id, sid, exp)`) but valid 7 days, and
   insert `cc_session_meta {sid_hash, via:'legacy'}`. Send template `legacy_login_notice` (security notice with a signed «مش انت؟» link
   `GET /api/auth/legacy/stop?m=<id>&s=<hmac>` → confirm page; POST → revoke all sessions of that member + `legacy_login_off=1`). Audit
   `member.legacy_login` (actor `system`).
6. The password is never stored, logged or echoed; error messages never reveal whether the e-mail exists in either system.
**GET `/api/auth/legacy/health`** → `{enabled: bool}` (LEGACY_ORIGIN set and not "off"). **GET|POST `/api/auth/legacy/stop`** as above.

#### 3.1.14 Import runs (owner only, import.run)
| POST `/api/admin/cc/import/runs` | `{note?, options:{overwrite: bool, publish: bool, redirects: bool}}` | 201 `{run:{id, started_at}}` |
|---|---|---|
| POST `/api/admin/cc/import/runs/:id/batch` | `{entity, dry_run, rows:[≤50]}` or `{entity:"seo"|"keywords"|"redirects", client_result:{…}}` | `{entity, dry_run, results:[{i, key, action: create|update|unchanged|conflict|skip|error, target_id?, diff?:{field:[old,new]}, warnings?, code?}], counts:{create, update, unchanged, conflict, skip, error}}` — body ≤ 512 KB; entity ∈ users, members, products, messages, rfqs, settings, plans, pay, mail, items:<kind> |
| POST `/api/admin/cc/import/runs/:id/finish` | — | `{run:{id, status, counts, report}}` |
| GET `/api/admin/cc/import/runs` · GET `/api/admin/cc/import/runs/:id` | — | `{items}` · `{run}` |
Mapping and rules: §1.5. Errors: 409 `state` (run finished), 400 `invalid_entity`, 422 per-row errors inside `results`.

#### 3.1.15 Member self-service (signed-in member, Bearer v2; `/api/me/*` existing route)
| method path | rule | request | response / errors |
|---|---|---|---|
| GET `/api/me/account` | any account | — | `{status, plan, plan_name, plan_expires, requested_plan, open_invoice:{no, total_minor, currency, pay_url}|null, caps:{…plan caps}, limits:{products, images_per_product, used_products}, linked:{factory_ref, name}|null, legacy_session: bool}` |
| GET `/api/me/products` | any account | — | `{items:[{id, state, fields(draft), live, reject_reason, submitted_at, images:[{id, url, w, h}]}], limit, used, can_add, need: null|"plan"|"link"}` |
| POST `/api/me/products` | `planLimit(m,"products") ≠ 0`, linked (`factory_ref`) | `{fields:{name*, name_en, category*, description, description_en, price}, images:[media ids], submit: bool}` | 201 `{item}` · 403 `plan` · 409 `link_required` · 429 `limit` `{limit, used}` · 400/422 validation |
| PATCH `/api/me/products/:id` | owner of the row | same as POST (partial) | `{item}` (a change to an approved product creates a new pending version; the live one stays) |
| POST `/api/me/products/:id/submit` | owner | — | `{item}` (state pending) |
| DELETE `/api/me/products/:id` | owner | — | `{ok}` (published → hidden at once through the overlay; frees the slot) |
| POST `/api/me/media` | any account with `listing` or `products` | raw image body, `Content-Type: image/jpeg|png|webp`, `?purpose=product|logo` | 201 `{media:{id, url (signed preview, 1 h), width, height, bytes}}` — via `CC.content.uploadMedia` (§4.11); 10 uploads/hour/member |
| GET `/api/me/company` | any account | — | `{linked, listing:{…public fields}|null, requests:[{id, kind, state, fields, reject_reason, created_at}], allowed:[field names by plan], legacy_hint:{company, activity, web}|null}` |
| POST `/api/me/company` | `listing` cap | `{kind: edit|claim|create, factory_ref?, fields:{…}}` | 201 `{request}` · 409 `open_request` · 403 `plan` · 422 |
| DELETE `/api/me/company/requests/:id` | owner, pending | — | `{ok}` (withdrawn) |
| GET `/api/me/invoices` | any account | — | `{items:[{no, status, plan, plan_name, total_minor, currency, issued_at, paid_at, pay_url}]}` (via `CC.payments.memberInvoices`) |
| POST `/api/me/invoices` | sellable plan ≥ current | `{plan, replace?}` | 201 `{invoice:{no, total_minor, pay_url, period_days, period_end}, quote, replaced?}` · 409 `open_invoice` (returns the open one + `replaceable`) · 409 `plan_lower` {`available_from`} · 403 `suspended` · 429 (5/day) — §13.7 |
| GET `/api/me/invoices/quote?plan=` | any account | — | `{quote:{kind: new\|renewal\|upgrade, prorated, days_left, net_minor, vat_minor, total_minor, until, …}, open_invoice:{…, replaceable}\|null}` — the amount and the end date before the invoice (Terms §5, §13.7) |
| GET `/api/me/recognize` | e-mail-code session only (`email_verified_at` set, not legacy) | — | `{known: bool, company:{company, manager, phone, address, web, activity, country}|null}` from `cc_legacy_companies` (same mailbox) or the member's `legacy_profile_json`; used by register.html to pre-fill (§10.3 P-S9) |

#### 3.1.16 Public plans & settings
| GET `/api/plans` | `{v, currency:"EGP", vat_bp, plans:[{key, sort, name_ar, name_en, price_egp, duration_days, sellable, markets:[…], products, images_per_product, caps:{…}}]}` — `Cache-Control: public, max-age=60`; 60/min per network |
|---|---|
| GET `/api/settings` | `{v, settings:{<public key>: value}}` — same caching |

### 3.2 content.js — collections, publishing, edge actions, media, public overlay and media serving
All admin endpoints receive `adm` from acc's router. `:coll` ∈ `fac facx prod tend rfq offer zone news event award opp intl video proj banner
notice cats` (schemas §4.4). Every write sets `static_impact` (§4.9) and audits `content.<verb>`.

| method path | perm | request | response / errors |
|---|---|---|---|
| GET `/api/admin/cc/content/schema` | content.read | — | `{colls:{<coll>:{label_ar, label_en, global, key, hide_mode, adds, source_required, fields:[{name, type, max, required_on_add, enum?, public: bool, lang?}], seo_prefix}}}` (the normative table of §4.4 as JSON) |
| GET `/api/admin/cc/content/:coll?state=&q=&page=&limit=&all=1` | content.read | `all=1` → up to 5,000 rows, no paging (merge view) | `{items:[ContentRow], total}` |
| GET `/api/admin/cc/content/:coll/:id` | content.read | — | `{item: ContentRow, history:[≤20 cc_audit rows]}` |
| POST `/api/admin/cc/content/:coll` | content.write | `{base_key?, fields:{…}, private?:{…}, seo_path?, publish?: bool}` (`base_key` = edit of a base row; none = add) | 201 `{item}` · 409 `exists` (base row already has an edit row → use PATCH) · 422 `{errors}` |
| PATCH `/api/admin/cc/content/:coll/:id` | content.write | `{fields?:{…} (partial; null clears an override), private?, seo_path?, publish?}` | `{item}` |
| POST `/api/admin/cc/content/:coll/:id/hide` · `/unhide` | content.write (+publish if `publish:true`) | `{publish?: bool, reason?}` | `{item, edge:[…]}` |
| POST `/api/admin/cc/content/:coll/hide` | content.write | `{base_key, seo_path?, publish?}` (hide a base row without editing it) | 201 `{item, edge}` |
| DELETE `/api/admin/cc/content/:coll/:id` | content.publish | `{confirm: true}` | `{ok, edge}` — add never published → row deleted; published add → `deleted=1` (removed at next publish, edge redirect when `seo_path`); base edit row → "revert to the build data" (row deleted at publish; edge restore) |
| POST `/api/admin/cc/content/:coll/:id/discard` | content.write | — | `{item}` (draft = live) |
| POST `/api/admin/cc/content/publish` | content.publish | `{ids?:[…], all?: true, note?}` | `{ok, v, bytes, published:n, edge:[{path, action, status}], needs_rebuild:n, visible_within_s: 120}` · 413 `overlay_too_large` `{bytes, limit}` · 409 `locked` (another publish running, retry in 5 s) |
| GET `/api/admin/cc/content/status` | content.read | — | `{v, at, by, bytes, limit:524288, enabled, drafts:n, edge:{pending, failed, items:[≤50]}, needs_rebuild:{n, items:[{coll, id, title, op, published_at}]}, kv: bool, baked_v: number|null}` (`baked_v` comes from the panel: `?baked_v=` it read from `/_seo/overlay-baked.json`) |
| POST `/api/admin/cc/content/edge-retry` | content.publish | — | `{done, failed, pending}` (uses the caller's Bearer token for the SEO API, §4.10) |
| GET `/api/admin/cc/content/overlay` | content.read | — | `{v, data}` — the compiled JSON (preview) |
| POST `/api/admin/cc/content/overlay-toggle` | content.toggle (owner) | `{enabled: bool}` | `{ok, enabled}` (serveOverlay answers `window.MIGOVL_DATA=null;` while off) |
| GET `/api/admin/cc/content/counts` | stats.read | — | `{tenders, companies, rfqs, news, videos, products, offers, zones, events, awards, projects}` |
| POST `/api/admin/cc/media?purpose=&name=` | media.upload | raw body (`Content-Type` image/jpeg, image/png, image/webp), ≤ 5 MB | 201 `{media:{id, url, public_url, width, height, bytes, mime}}` · 415 `unsupported_type` · 413 · 422 `invalid_image` `{why}` · 503 `media_off` |
| GET `/api/admin/cc/media?purpose=&owner=&status=&page=` | content.read | — | `{items:[{id, url, purpose, width, height, bytes, status, owner_type, owner_id, created_at, used_by:[content ids]}], total}` |
| DELETE `/api/admin/cc/media/:id` | media.delete | — | `{ok}` · 409 `in_use` `{used_by}` |

`ContentRow` = `{id, coll, kind, base_key, state, draft, live, hidden, live_hidden, deleted, seo_path, static_impact, source, member_id, rev,
published_v, created_by, created_at, updated_by, updated_at, published_by, published_at, private (only with legacy.contacts / orders.read)}`.

Exported functions (normative signatures, used through `CC.content`):
* `handleContentAdmin(req, env, ctx, adm)`; `serveOverlay(req, env, ctx)`; `serveMedia(req, env, ctx)`;
* `upsert(env, {coll, kind, base_key, id?, fields, private?, seo_path?, publish?, by, source?, member_id?})` → `{item, published_v?}`
  (used by approvals and the manual RFQ; validation identical to the HTTP path);
* `setHidden(env, {coll, id|base_key, hidden, publish, by, seo_path?})`;
* `publishOverlay(env, {by, reason, ids?})` → `{v, bytes}` (compiles ALL live rows + plans + public settings + cats + pay readiness);
* `uploadMedia(env, {owner_type, owner_id, purpose, body: ArrayBuffer, type, name})` → `{media}` (throws `{status, code}`);
* `mediaPublic(env, ids)` (approval makes a member's media public); `contentCounts(env)`; `contentCron(env, nowMs)`;
* `handleMemberMedia(req, env, ctx, member)` (the `/api/me/media` route).

**Public serving**
* `GET /data/overlay.js` → `200 application/javascript; charset=utf-8`, `Cache-Control: public, max-age=60, stale-while-revalidate=300`,
  `ETag: "ovl-<v>"` (304 on `If-None-Match`), `X-Content-Type-Options: nosniff`, `X-Overlay-V: <v>`. Source order: isolate memo (30 s) → KV
  `SEO_KV.getWithMetadata("acc:overlay", {type:"text", cacheTtl:60})` → D1 `cc_overlay` latest row (and re-put to KV) → the no-op body
  `window.MIGOVL_DATA=null;`. `overlay.enabled = "0"` → no-op body. Any error → no-op body with status 200 (never a 5xx: the file is a
  synchronous `<script>` on every page and the site's error reporter would show a banner).
* `GET /media/u/<yyyy>/<id>.<ext>` → R2 `MEDIA.get("u/<yyyy>/<id>.<ext>")` only when `cc_media.status='public'` (memo 60 s), or with a valid
  signed preview query `?e=<exp>&s=<hmac(secretOf, "media|"+id+"|"+e)>` (≤ 1 h) for pending/rejected ones; headers `Content-Type` = stored
  mime, `Cache-Control: public, max-age=31536000, immutable` (public) or `private, no-store` (signed), `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline`, `Access-Control-Allow-Origin: *`. Unknown/deleted → 404 plain text. Meeting recordings under `meetings/` are
  never reachable through this route.

### 3.3 payments.js — invoices, checkout, provider returns and webhooks (§5)
Admin (`/api/admin/cc/pay/*`, `adm` from the router):
| method path | perm | request | response |
|---|---|---|---|
| GET `/api/admin/cc/pay/config` | pay.read | — | `{enabled, provider, mode, currency, fields:{merchant_id, outlet_id, integration_ids, public_key, host, success_url, fail_url, notes, manual_fallback, manual_ar, manual_en}, secrets:{<slot>:{set, tail, set_at, readable}}, ready: bool, missing:[…], webhooks:{paymob, ngenius, paytabs, returns:{…}}, providers:[{key, label, implemented:true}]}` |
| PUT `/api/admin/cc/pay/config` | pay.config (owner) | the live payload `{enabled, provider, mode, currency, merchant_id, outlet_id, api_key, webhook_secret, success_url, fail_url, notes}` + `{integration_ids, public_key, host, manual_fallback, manual_ar, manual_en}`; `api_key`/`webhook_secret` "" = keep | `{ok, ready, missing}` · 400 `invalid_provider` (only ngenius, paymob, paytabs, manual) · 503 `config_secret_missing` when a secret is sent without CONFIG_SECRET |
| GET `/api/admin/cc/pay/invoices?status=&source=&provider=&from=&to=&q=&page=` | pay.read | — | `{items:[Invoice], total}` |
| GET `/api/admin/cc/pay/invoices/:no` | pay.read | — | `{invoice, payments:[…], events:[…], mails:[…]}` |
| POST `/api/admin/cc/pay/invoices` | pay.invoice | `{member_id|email, plan, source: "admin", notes?, send: bool}` | 201 `{invoice}` · 409 `open_invoice` |
| POST `/api/admin/cc/pay/invoices/:no/resend` | pay.invoice | — | `{ok, sent}` |
| POST `/api/admin/cc/pay/invoices/:no/void` | pay.invoice | `{reason}` | `{ok}` (open only) |
| POST `/api/admin/cc/pay/invoices/:no/mark-paid` | pay.mark_paid | `{manual_ref*, paid_on: "YYYY-MM-DD", note?, confirm: "<no>"}` | `{ok, member}` (activation via `CC.acc.setPlan`, receipt e-mail) |
| POST `/api/admin/cc/pay/test-invoice` | pay.config | `{plan}` | `{invoice}` (`test=1`, owner's own e-mail, usable only in Sandbox) |
| GET `/api/admin/cc/pay/payments?status=&provider=&page=` | pay.read | — | `{items, total}` |
| GET `/api/admin/cc/pay/invoices.csv` · `/payments.csv` | pay.read + admin/owner | — | text/csv |
Public (`/api/pay/*`, rate limit 60/10 min per network unless stated):
| method path | request | response |
|---|---|---|
| GET `/api/pay/invoice?t=<pay_token>` | — | `{invoice:{no, status, plan, plan_name, period_days, net_minor, vat_bp, vat_minor, total_minor, currency, company, issued_at, paid_at, test}, gateway:{ready, provider_label}, manual:{enabled, ar, en}, email_masked}` · 404 `not_found` (also wrong token) |
| POST `/api/pay/checkout` | `{t}` | `{redirect_url}` · 409 `state` (not open) · 503 `gateway_not_ready` · 502 `provider_error` `{provider_code?}` — 10/hour per invoice |
| GET|POST `/api/pay/return/:provider` | provider query/form | 303 → `${SITE}pay.html#inv=<token>&r=1` (always; result comes from polling) |
| POST `/api/pay/webhook/:provider` | provider body | 200 `{ok:true}` for every verified OR unverifiable-but-well-formed call (no oracle); 400 for malformed JSON; never 5xx loops (errors logged in `cc_pay_events.result`) |
| GET `/api/pay/health` | — | `{ok, ready, provider, mode, manual}` (no secrets) |
Exported: `handlePay`, `handlePayAdmin`, `onInquiryCreated(env, ref, CC)`, `issueInvoice(env, {member_id?, email, company, plan, source,
inquiry_ref?, by, send}, CC)` → `{invoice}`, `memberInvoices(env, member)`, `createMemberInvoice(env, member, plan, CC)`, `payReady(env)` →
`{ready, provider, manual}` (also used by the overlay compile), `paymentsCron(env, nowMs, CC)`.

### 3.4 email-center.js — sender settings, templates, preview, test send, delivery log, provider status (§6)
| method path | perm | request | response |
|---|---|---|---|
| GET `/api/admin/cc/email/config` | email.read | — | `{enabled, provider: "resend"|"brevo", from_email, from_name, reply_to, key:{source: "control_center"|"worker_secret"|"none", tail, set_at, readable}, send_email_binding: bool, ready: bool, providers:[{key:"resend", label:"Resend"}, {key:"brevo", label:"Brevo API"}]}` |
| PUT `/api/admin/cc/email/config` | email.config (owner) | the live payload `{enabled, provider, from_email, from_name, reply_to, api_key}` (`api_key` "" = keep; `smtp_*` fields → 400 `smtp_unsupported`) | `{ok, ready}` · 400 `invalid_key` (Resend keys start `re_`, Brevo API keys `xkeysib-`; Brevo SMTP keys `xsmtpsib-` refused) · 400 `invalid_from` (must be on madeinegyptgate.com) |
| POST `/api/admin/cc/email/test` | email.test | `{to, template?, lang?}` (the live `mail_test {to}` + optional template) | `{ok, sent, provider, id?, error?}` — subject prefixed «[اختبار] / [Test]»; 10/hour |
| GET `/api/admin/cc/email/templates` | email.read | — | `{items:[{key, name_ar, name_en, group, list, required, vars:[…], body_editable, enabled, overrides:{…}, sent_30d, failed_30d}]}` |
| PUT `/api/admin/cc/email/templates/:key` | email.templates | `{enabled?, subject_ar?, subject_en?, intro_ar?, intro_en?, outro_ar?, outro_en?, body_ar?, body_en?}` | `{item}` · 400 `required_template` (disabling a required one) · 400 `body_not_editable` · 422 `unknown_var` `{vars}` |
| POST `/api/admin/cc/email/preview` | email.read | `{key, lang, overrides?}` | `{subject, text, html}` rendered with `‹var›` placeholders (no invented data) |
| GET `/api/admin/cc/email/log?template=&status=&to=&from=&to_date=&before=&limit=` | email.read | `to` = exact address (hashed server-side) | `{items:[{at, template, list, to_masked, subject, provider, provider_id, status, error, ms}], next_before}` |
| GET `/api/admin/cc/email/status` | email.read | — | `{provider, key_source, domain:"madeinegyptgate.com", last_check:{at, ok, detail}|null}` |
| POST `/api/admin/cc/email/status/check` | email.config | — | `{ok, detail}` — read-only provider call: Resend `GET https://api.resend.com/domains` (a sending-only key answers 401 → `{ok:true, detail:"key works for sending only"}` after confirming the key format), Brevo `GET https://api.brevo.com/v3/account` |
Exported: `prepareMail(env, m)`, `deliver(env, msg)`, `mailReady(env)`, `attachOk(env)` (sync: the provider that `deliver()` would use
supports real attachments = resend or brevo), `fmtFrom(f)`, `loadMailConfig(env)`, `renderTemplate(env, key, {lang, vars})` →
`{subject, ar, en, list, why}`, `TEMPLATES`, `templateKeyOf(msg)`, `handleEmailAdmin`, `emailCron`.

### 3.5 Existing endpoints reused unchanged
`/api/auth/request|verify|logout` (panel/login sign-in), `GET /api/me` (role/plan), `GET /api/admin/inquiries[/:id]`, `POST
/api/admin/inquiries/:id/resend`, `POST /api/admin/block` (owner/admin), `GET|POST /api/admin/members` (kept for tools/set-plan.mjs; the panel uses
`/api/admin/cc/members`), `GET /api/admin/wa?flag=`, `GET /api/wa/health`, `/api/seo/*` (Pages Function: pages, page PATCH, overrides,
redirects, keywords, import, rebuild), `GET /api/inquiries/health`, `/api/advisor/health`, `/api/meetings/health`. inbox.html stays as is (the
panel's «الرسائل والطلبات» links to it as «شاشة المتابعة القديمة»).

---

## 4. Content overlay (live edits without a rebuild)

### 4.1 Data model
* One `cc_content` row per touched item: `kind:"base"` (edit and/or hide of a row that exists in the static data, addressed by its collection
  key `base_key`) or `kind:"add"` (a new item, addressed by its stable `id`). Fields are NAMED (the §4.4 names), never array indices; the
  applier maps names to indices. `draft_json` = working copy; `live_json` = what the published overlay contains. Base rows store only the
  changed fields (`null` in a PATCH removes an override, i.e. "back to the build value"); adds store the full record.
* States: `draft` (draft ≠ live), `published` (draft = live), `unpublished` (an add that was published and then deleted, waiting for the next
  publish to drop it). `hidden`/`live_hidden`, `deleted` as in §2.
* Every save bumps `rev`; publishing copies `draft_json → live_json`, `hidden → live_hidden`, sets `published_v`, `published_by/at`.
* Member submissions and the import create rows with `source = "member" | "import"` and the same rules.

### 4.2 Compiled overlay (the body of `/data/overlay.js`)
```js
/* Made in Egypt Gate — published admin edits v=1763460000123 (2026-11-18T10:00:00.123Z). Applied by data/mig-overlay.js; do not edit. */
window.MIGOVL_DATA={"v":1763460000123,"at":"2026-11-18T10:00:00.123Z",
 "c":{                                         // collections (only those with live rows)
   "fac":{"e":{"/factories/hydrohex/":{"description":"…","gov":"QLB"}},  // base edits by key (changed fields only)
          "h":["/factories/تشكيل-المعادن-في-السادات/"],                   // hidden / deleted base keys
          "a":[{"id":"c-k7m2q9x4","name":"…","sector":"…",…}]},           // adds, in creation order
   "tend":{"e":{},"h":[],"a":[]}, "…":{} },
 "tr":{"<arabic text>":"<english text>"},       // English for edited/added Arabic fields (registered only when MIGLANG === "en")
 "hp":["/factories/تشكيل-المعادن-في-السادات/"],  // static SEO paths of hidden/deleted items (optional notice on those pages)
 "plans":{"vat_bp":1400,"currency":"EGP","list":{"basic":{"name_ar":"…","name_en":"…","price_egp":10000,"duration_days":365,"sellable":1,"caps":{…}},…}},
 "settings":{"contact_email":"info@madeinegyptgate.com",…},   // public settings only
 "cats":{"food":{"ar":"…","en":"…","icon":"🍞","hidden":0},…},
 "banners":[{"id":"b-…","place":"partner","img":"/media/u/2026/….webp","link":"/register.html#partner","title_ar":"…","title_en":"…","alt_ar":"…","alt_en":"…","start":"","end":"","sort":10}],
 "banner_hide":["img/ban-p-elhelal.jpg"],
 "notices":[{"id":"nt-…","text_ar":"…","text_en":"…","link":"","level":"info","pages":[],"start":"","end":"","dismissible":1}],
 "pay":{"ready":false,"manual":false}};
```
Rules: keys sorted; JSON serialised with `<`→`<`, U+2028/U+2029 escaped; every string already neutralised (§0.4); hard limit
**512 KiB** for the whole file (publish fails with 413 `overlay_too_large`), warning in the panel above 256 KiB; text limits per field keep
typical files far smaller. The static no-op fallback **data/overlay.js** (site-side) is exactly:
```js
/* Published admin edits — static fallback with no edits. On madeinegyptgate.com the Worker serves the live file at this same URL. */
window.MIGOVL_DATA = window.MIGOVL_DATA || null;
```

### 4.3 Publish → compile → serve → cache
1. `POST /api/admin/cc/content/publish` (or a plans/settings/approval save) takes the D1 lock `cc_locks('overlay:publish')` (30 s), copies the
   selected drafts to live, then compiles from ALL live rows (`live_json`, `live_hidden`, `deleted`) + `cc_plans` + public `cc_settings` +
   `cats` + `payReady(env)`.
2. `v = max(Date.now(), last_v + 1)`; insert `cc_overlay {v, js, bytes, sha, counts}` (keep the newest 20 rows); `SEO_KV.put("acc:overlay", js,
   {metadata:{v, at, bytes}})` and before that `put("acc:overlay:prev", <previous js>)`; set the isolate memo.
3. Visibility: same isolate at once; other PoPs ≤ 60 s (KV cacheTtl) + browser `max-age=60` → the UI says «يظهر على الموقع خلال دقيقتين تقريباً».
4. KV unavailable → the publish still succeeds in D1 and `serveOverlay` falls back to D1 (status shows `kv:false`); `contentCron` re-puts the
   latest D1 row into KV when they differ.

### 4.4 Collections — exact field mapping to the real shapes
Notation: `name → target` (type, max length or enum; `*` = required on add; `pub` = public field; `en` = has an `_en` twin that feeds `tr`).
`key(row)` = the base key; "hide mode" `hole` = `delete arr[i]` (indices of every other row stay valid), `splice` = in-place removal (only for
collections addressed by id, never by index). Adds are appended in creation order AFTER the base rows. Common derived rules: `gov` is one of
the 27 codes of data/regions.js (`CAI … MTR`); dates `YYYY-MM-DD`; `source_url` https; images are `/media/u/…` URLs (§4.11).

**fac — directory companies** · `window.MIGOLDFAC` (+ parallel `window.MIGOLDFACD`) · key = decoded NFC pathname of `row[7]` · hide `hole` ·
adds id `c-` + rid(8) · base 2,926 rows. Example base row (index 5):
`["Hydrohex","المياه ومعالجتها","القليوبية","مصنع",0,0,5,"https://www.madeinegyptgate.com/factories/hydrohex/","",["Basket Screen","Mechanical Screen"],"QLB",0,"محطات مياه وفلاتر ومعالج مياه","",""]`
and `MIGOLDFACD[5]` = its description string.
| name | target | rule |
|---|---|---|
| name* (en) | `[0]` | text ≤ 160, pub, no contacts |
| sector* | `[1]` | one of `window.MIGSECTORS` canonical names (panel validates; server ≤ 80) |
| location | `[2]` | text ≤ 160 («المدينة، المحافظة») |
| type* | `[3]` | enum `مصنع` · `شركة ومورد` (the two base values) |
| verified | `[4]` | 0/1 — only with `directory.verify`; never set by plan purchase |
| logo | `[15]` (NEW trailing index) | `/media/u/…` URL; base `[5]`/`[6]` sprite stays; adds get `[5] = -1`, `[6] = 0` |
| url | `[7]` | base: unchanged (it is the key); adds: `"https://www.madeinegyptgate.com/factories/" + slugAr(name) + "-" + id.slice(2) + "/"` |
| description (en) | `MIGOLDFACD[i]` | text ≤ 2,000, pub, no contacts |
| products (en: products_en[]) | `[9]` | array ≤ 30 × ≤ 80 chars |
| gov* | `[10]` | gov code |
| website | `[17]` (NEW) | https URL (shown by patched consumers only) |
| — | `[8]` | stays `""` (descriptions live in MIGOLDFACD) |
| — | `[11]` | recomputed for adds/edits: `(gov ? 0 : 1) | (description ? 0 : 2)`, other base bits kept |
| — | `[12]`,`[13]`,`[14]` | adds: `""` |
| — | `[16]` (NEW) | adds: the id (`c-…`); base rows: absent |
`slugAr(s)`: NFC, keep Arabic letters, Latin letters, digits; every other run → `-`; trim `-`; ≤ 60 chars.

**facx — public-source factories** · `window.MIGFACX.list` (+ `MIGFACX.fp[name]` products) · key = `row[0]` (name, unique) · hide `hole` ·
no adds (new companies go to `fac`). Example: `["إيجيتك للكابلات","الكهرباء والكابلات والإضاءة","العاشر من رمضان، الشرقية","مصنع","كابلات القوى والأسلاك الكهربائية …",0,"","e2","https://www.elsewedyelectric.com/",""]`.
Fields: sector→`[1]`, location→`[2]`, type→`[3]` (`مصنع`|`شركة`), description (en)→`[4]` (≤ 2,000), verified→`[5]` (directory.verify),
logo→`[6]` (media URL), cover→`[7]` (keep code), source_url→`[8]`, website→`[9]`, products (en)→`MIGFACX.fp[name]`. The name is NOT editable
(it keys `fp` and `rawSector`); `name_en` only feeds `tr`.

**prod — marketplace products** · `window.MIGOLDP` (+ parallel `window.MIGP2F`) · key = decoded NFC pathname of `row[5]` · hide `hole` · adds
id `p-` + rid(8) (member products keep their `cc_member_products.id`). Example (index 3):
`["فلفل اسود","من إنتاج مصنع البهارات السبعه","food",0,3,"https://www.madeinegyptgate.com/industrial_products/فلفل-اسود/","",0,""]`, `MIGP2F[3]` =
`"https://www.madeinegyptgate.com/factories/مصنع-البهارات-السبعه/"`.
| name | target | rule |
|---|---|---|
| name* (en → `[6]` as well) | `[0]` | ≤ 120, no contacts |
| description | `[1]` | ≤ 600 (base style «من إنتاج <company>»; adds default to that when empty) |
| category* | `[2]` | key of the market categories (`food build plastic elec glass metal petro med furn cosm other` + `cats` adds) |
| image | `[9]` (NEW) | media URL; adds `[3] = -1`, `[4] = 0` |
| url | `[5]` | adds: `"https://www.madeinegyptgate.com/industrial_products/" + slugAr(name) + "-" + id.slice(2) + "/"` |
| name_en | `[6]` | ≤ 120 |
| — | `[7]` | adds: `(company_url ? 0 : 16) | (image ? 0 : 128)` |
| — | `[8]` | adds `""` |
| — | `[10]` (NEW) | adds: id |
| price | `[11]` (NEW) | text ≤ 40 (shown by patched consumers only) |
| featured | `[12]` (NEW) | 0/1 (store «منتجات مميزة») |
| company_url* (adds) | `MIGP2F[i]` | the producer's `MIGOLDFAC[x][7]` URL (member products: their linked company) |

**tend — tenders of the platform** · `window.MIGTEND` · key = `row[0] + "|" + row[3]` (ref + title; refs alone repeat) · hide `splice`
(tenders.html opens `#<ref>` by value) · adds ref `TEN-<yyyy>-C<seq 3+>` (counter `tend:<yyyy>`). Example:
`["TEN-2026-233","ممارسة عامة","غير محدد الموعد","توريد وتركيب اجهزة حاسب آلى","جهة حكومية","","تكنولوجيا المعلومات والأجهزة المكتبية","","","","","https://www.madeinegyptgate.com/tender-item/…/",13,"الأجهزة والمستلزمات المكتبية والحاسبات"]`.
| name | target | rule |
|---|---|---|
| ref (adds: generated) | `[0]` | base: key part, not editable |
| type* | `[1]` | enum `مناقصة عامة` · `مناقصة` · `ممارسة عامة` · `مناقصة محدودة` |
| — | `[2]` status | computed by the applier from `[9]` and today (Cairo): none → `غير محدد الموعد`; past → `منتهية`; ≤ 7 days → `تنتهي قريباً`; else `سارية` |
| title* (en) | `[3]` | ≤ 300 |
| entity (en) | `[4]` | ≤ 160 |
| gov_name | `[5]` | filled from `MIGREG.name(gov)` by the panel |
| sector | `[6]` | canonical sector |
| booklet | `[7]` | integer EGP or "" |
| bond | `[8]` | text ≤ 60 |
| deadline | `[9]` | date |
| gov | `[10]` | gov code |
| source_url* (publish) | `[11]` | https; required to publish |
| — | `[12]` | `(gov?0:1) | (deadline?0:4) | (entity?0:8)` |
| — | `[13]` | adds `""` |

**rfq — buyer RFQs on rfqs.html** · `window.MIGRFQ` · key = `String(row[0])` · hide `splice` · adds no `C<seq ≥ 1001>` (counter `rfq`), imported
`L<legacy id>`. Example: `["34207","2026-11-08","طلب عرض سعر – توريد غلاف وعاء ضغط …","1. تفاصيل طلب عرض السعر …","","","","","https://www.madeinegyptgate.com/rfq/…/","المياه ومعالجتها","1. RFQ details. …",33,""]`.
Fields: date→`[1]` (default publish day), title*→`[2]` (≤ 300), details (en → `[10]`)→`[3]` (≤ 2,000), delivery→`[4]` (≤ 120), qty→`[5]`
(≤ 60, «1,200 م²»), deadline→`[6]`, gov→`[7]`, url→`[8]` (adds `""`), sector→`[9]`, `[11]` = `(gov?0:1) | (qty||delivery||deadline ? 0 : 32)`,
`[12]` = `""`. Private (never compiled): client, phone, email, channel, inquiry_ref.

**offer — retail offers** · `window.MIGOFFERS` · key = `o.id` · hide `splice` · adds id `cc-of-` + rid(8). Example: `{"id":"seoudi-juhayna-cooking-cream-1-liter","product_ar":"جهينة كريمة طهي - 1 لتر","product_en":"Juhayna Cooking Cream - 1 Liter","brand":"Juhayna","made_in_egypt":true,"category_ar":"ألبان ومنتجاتها","size_unit":"1 L","price_egp":265,"old_price_egp":299,"discount_pct":11.4,"store_ar":"أسواق سعودي","store_en":"Seoudi Market","cities_ar":["القاهرة","الجيزة"],"region_codes":["CAI","GIZ"],"branch_example":"…","lat":30.1004,"lon":31.3747,"approx":true,"valid_from":"2026-11-16","valid_to":"2026-12-01","source_url":"https://seoudisupermarket.com/…","source_checked":"2026-11-17","note":null,"image_file":"img/offers/….jpg","img":"img/offers/….jpg","price_sar":265,"price_aed":265,"old_price_sar":299,"old_price_aed":299,"saudi_made":true,"made_in_uae":true,"category_en":"Dairy products","branch_en":"…"}`.
Fields (same names as the object keys): product_ar*, product_en, brand, made_in_egypt (bool), category_ar, category_en, size_unit, price_egp*
(number), old_price_egp, store_ar*, store_en, cities_ar[], region_codes[], branch_example, branch_en, lat, lon, approx, valid_from, valid_to*,
source_url* (publish), image (→ `img` and `image_file`). Derived for every add/edit: `discount_pct = round1((old−price)/old·100)` when
old > price; compatibility keys `price_sar = price_aed = price_egp`, `old_price_sar = old_price_aed = old_price_egp`, `saudi_made = made_in_uae
= made_in_egypt`; `source_checked` = publish day.

**zone — industrial zones** · `window.MIGZONES` · key = `z.id` · hide `splice` · adds id `cc-zone-` + rid(8). Example: `{"id":"sczone-sokhna-iz","name_ar":"المنطقة الصناعية بالعين السخنة","name_en":"Ain Sokhna Industrial Zone (SCZone)","type":"industrial_area","region_code":"SUZ","city":"العين السخنة","lat":29.71515,"lon":32.29656,"approx":false,"coord_source":"https://www.ida.gov.eg/ar/industrial-areas","area_km2":210,"area_text":"…","focus_sectors_ar":["…"],"focus_sectors_basis":"source","operator_ar":"…","website":"https://sczone.eg","status_ar":"قائمة وتعمل","notes":"…","source_url":"https://sczone.eg/…"}`.
Fields = keys: name_ar*, name_en, type* (`industrial_area industrial_city free_zone tech_park port_zone investment_zone`), region_code*, city,
lat, lon, approx (bool), coord_source, area_km2, area_text, focus_sectors_ar[], operator_ar, website, status_ar, notes (≤ 600), source_url*.

**news — news** (also «أخبار المشتريات» = `category_ar: "أخبار المشتريات"`) · `window.REAL.news` · key = `n.url` · hide `hole`
(article.html#<index>) · adds `id: "n-" + rid(8)`. Example: `{"title_ar":"بروتوكول استثماري بـ240 مليون دولار لإنشاء مصنع للخلايا والألواح الشمسية في مصر","summary_ar":"…","source_name":"أموال الغد","date":"2026-11-16","category_ar":"طاقة","region_code":null,"url":"https://amwalalghad.com/…","image_file":"img/news/n0.jpg","image_url":"https://amwalalghad.com/…jpg"}`.
Fields: title_ar* (en), summary_ar (en, ≤ 1,200), source_name*, date*, category_ar, region_code, url* (= source, publish), image (→ `image_file`;
`image_url` = ""), id (adds).

**event — events & exhibitions** · `window.REAL.events` · key = `e.id` (read BEFORE media pages rewrite `e.id` to `ev<n>`) · hide `hole`
(event.html#ev<index+1>) · adds id `cc-ev-` + rid(8). Example: `{"id":"cairo-woodshow-2026","name_ar":"معرض القاهرة للأخشاب …","name_en":"Cairo WoodShow 2026","start_date":"2026-11-26","end_date":"2026-11-29","venue":"…","organizer":null,"sector_ar":"…","url":"https://www.woodshowglobal.com/cairo","about_ar":"…","agenda_ar":["…"],"source_url":"https://www.woodshowglobal.com/cairo","city":"القاهرة","region_code":"CAI","image_file":"img/events/cairo-woodshow-2026.jpg"}`.
Fields = keys: name_ar* (en via `name_en` key itself), name_en, start_date*, end_date, venue, organizer, sector_ar, url, about_ar (≤ 2,000),
agenda_ar[] (≤ 12 × 200), source_url* (publish), city, region_code, image (→ `image_file`).

**award — contract awards** · `window.REAL.awards` · key = `title_ar + "|" + date + "|" + (source_url || "")` · hide `hole` (winner.html#<index>)
· adds `id: "a-" + rid(8)`. Example: `{"title_ar":"عقد تصميم وتنفيذ محطة معالجة الصرف الصحي الجديدة بطنطا (100 ألف م3/يوم)","winner_ar":"محمد عبد المحسن الخرافي وأولاده","awarding_entity_ar":"شركة مياه الشرب والصرف الصحي بالغربية","value_egp_million":null,"value_usd_million":79,"region_code":"GHR","city":"طنطا","date":"2025-06-19","source_url":"https://www.meed.com/kharafi-wins-egypt-wastewater-deal","value_eur_million":69,"value_sar_million":null,"value_aed_million":null}`.
Fields = keys: title_ar* (en), winner_ar* (en), awarding_entity_ar (en), value_egp_million, value_usd_million, value_eur_million (numbers or
null; `value_sar_million`/`value_aed_million` kept null on adds), region_code, city, date*, source_url* (publish), id (adds).

**opp — sourced opportunities** · `window.REAL.tenders` · key = `t.id` · hide `hole` (index loops in oldlists.part.py and janna.js get guards, P-S6)
· adds id `cc-tnd-` + (700000 + counter `opp`) so `MIGOID()` gives `ET7…` (stable). Example: `{"id":"eg-tnd-003","ref":"6/2026/2027","kind":"public-company","title_ar":"تصنيع وتوريد وتركيب منشآت معدنية لصوامع …","title_en":"Manufacturing, supply and erection …","entity_ar":"شركة مطاحن مصر العليا","entity_en":"Upper Egypt Flour Mills","region_code":"LXR","city":"طيبة الجديدة - الأقصر","sector_ar":"…","publish_date":"2026-11-16","closing_date":"2026-12-08","status":"open","procurement_type":"مناقصة عامة","bid_bond_egp":1000000,"booklet_price_egp":7000,"source_url":"https://meobserver.news/…","via":"…","estimated_value_sar":1000000}`.
Fields = keys: ref, kind, title_ar*, title_en, entity_ar*, entity_en, region_code, city, sector_ar, publish_date*, closing_date, status (`open`
| `closed`; the applier sets `closed` when closing_date is past), procurement_type, bid_bond_egp, booklet_price_egp, source_url* (publish),
via, note.

**intl — international opportunities** · `window.REAL.tenders_intl` · key = `t.ref` · hide `hole` · edit/hide only (no adds; `in<k>` ids are
index-based). Example: `{"ref":"MZ-EDM-554194-GO-RFB","market":"africa","country_ar":"موزمبيق","country_en":"Mozambique","city":"Maputo","kind":"gov","title_ar":"توريد عوازل كهربائية لشبكات التوزيع","title_en":"Supply of Insulators","entity_ar":"شركة كهرباء موزمبيق (EDM)","sector_ar":"الكهرباء والكابلات","publish_date":"2026-11-02","closing_date":"2027-01-12","estimated_value":null,"currency":null,"source_name":"World Bank – …","source_url":"https://projects.worldbank.org/…"}`.
Editable: title_ar, title_en, entity_ar, sector_ar, closing_date, estimated_value, currency, source_url.

**video — videos** · `window.MIGVIDS` · key = `v.id` (YouTube id) · hide `splice` · adds id = the YouTube id (11 chars `[A-Za-z0-9_-]`) parsed
from the URL. Example: `{"id":"miVnCNXcCpQ","url":"https://www.youtube.com/watch?v=miVnCNXcCpQ","title_original":"…","title_ar":"…","title_en":"…","channel":"eXtra news","date":"2026-11-16","date_approx":true,"duration":40,"category_ar":"مصانع وجولات","governorate":"CAI","thumb":"img/yt/miVnCNXcCpQ.jpg","lang":"ar","verified_oembed":true,"source_url":"https://www.youtube.com/watch?v=miVnCNXcCpQ"}`.
Fields = keys: title_ar*, title_en, channel, date, date_approx, category_ar, governorate, lang; adds: `url = source_url =
"https://www.youtube.com/watch?v=<id>"`, `thumb = "https://i.ytimg.com/vi/<id>/hqdefault.jpg"`, `title_original` and `channel` from YouTube
oEmbed (`GET https://www.youtube.com/oembed?url=<url>&format=json`, read-only, at save), `verified_oembed = true` only when that call returned
200; publishing an add requires `verified_oembed`.

**proj — projects** · `window.MIG.PROJECTS` (assigned twice by data/projects.js; the applier patches both assignments) · key = `p[0]` · hide
`splice` (`MIG.proj()` loops by index) · adds id `cc-p` + counter `proj`. Example: `["r001","مزرعة رياح خليج السويس بقدرة 1.1 جيجاوات","محافظة البحر الأحمر","جبل الزيت","طاقة ومياه",4,null,"أكوا باور وحسن علام للمرافق (HAU Energy)","باور تشاينا (PowerChina)","لم يُعلن","2025","",45,[[…]],[["2025-01-09","مشروع رياح برية …"]],"https://enterpriseam.com/…","img/gov/gv-BBA.jpg"]`
(projects.js: id, name, region, city, sector, stage 0–6 of `MIG.STAGES`, value (millions EGP), owner, contractor, consultant, start, end,
progress, packages, updates, source, image).
Fields: name*→`[1]`, region→`[2]` («محافظة …»), city→`[3]`, sector→`[4]`, stage*→`[5]` (0–6), value→`[6]` (number|null), owner→`[7]`,
contractor→`[8]`, consultant→`[9]`, start→`[10]`, end→`[11]`, updates→`[14]` (`[[date, text]]` ≤ 10), source_url*→`[15]`, image→`[16]`;
adds: `[12] = null`, `[13] = []` (progress and packages are never shown).

**banner, notice, cats** — overlay-only collections (no data file): records as in §4.2; banners need an image (≥ 1120×200, purpose `banner`),
`place` ∈ `strategic` (the `.sbn` strip without `.core`) · `partner` (`.sbn.core`) · `home`; `link` = same-site path or https URL.
**plans, settings, pay** — compiled from `cc_plans`, public `cc_settings`, `payReady()` (not `cc_content`).

### 4.5 The client applier `data/mig-overlay.js` (site-side) — normative behaviour
Loaded synchronously right after data/i18n.js on every site.py page, BEFORE plan.js and every data file (§10.3 P-S1), followed by
`data/overlay.js`. ES5, no dependencies, ≤ 25 KB minified-equivalent.
1. **Install setters at load** (unless `window.MIGOVL_ADMIN`): for `MIGOLDFAC`, `MIGOLDFACD`, `MIGOLDP`, `MIGP2F`, `MIGTEND`, `MIGRFQ`,
   `MIGOFFERS`, `MIGZONES`, `MIGVIDS`, `MIGFACX`, `REAL` use `Object.defineProperty(window, NAME, {configurable:true, enumerable:true, get,
   set})`; for `MIG.PROJECTS` pre-create `window.MIG = window.MIG || {}` with an accessor `PROJECTS` (data/projects.js does
   `window.MIG = window.MIG || {}` and keeps the object). Every data file assigns these globals with `window.X = …` (verified), so the setter runs
   no matter when the file loads (head, end of body, `async` oldfac.js on factories.html, a second copy on the same page).
2. **Apply in the setter** when both the value and `MIGOVL_DATA` exist; if `MIGOVL_DATA` arrives later (order inverted by a third-party cache),
   a setter on `MIGOVL_DATA` applies to every target already assigned. Idempotent: an applied array gets a non-enumerable `__migovl = v`.
   Order inside one collection: edits (by key → index map built once per array), then hides (`hole` = `delete arr[i]` + the same index in the
   parallel array; `splice` = remove in place from the end), then adds (`push`; parallel arrays set at the same index). REAL: apply `news`,
   `events`, `awards`, `tenders` (= opp), `tenders_intl` (= intl) inside the REAL setter. MIGFACX: apply `.list` and `.fp`.
   Parallel arrays: the index map of MIGOLDFAC/MIGOLDP is kept so MIGOLDFACD/MIGP2F (assigned later) are patched by the same indices.
3. **Strings**: every string written is passed through `neutral()` again; arrays/objects are cloned from the JSON (no shared references).
4. **English**: when `window.MIGLANG === "en"` and `window.I18N_EN` exists, each `tr` pair is registered as the data files do:
   `k = ar.replace(/\s+/g, " ").trim().replace(NUM, "{n}")`, `v = en.replace(NUM, "{n}")` (NUM = data/i18n.js `/[0-9٠-٩][0-9٠-٩,.:%/\-]*/g`),
   only when both contain the same count of numbers; `I18N_EN[k] = v` (overrides an older translation on purpose).
5. **API** `window.MIGOVL`: `{v, data, admin, schema, key(coll, row), fromRow(coll, row, i)` → named fields, `toRow(coll, fields, base?)` →
   row, `idx(coll, id)` → current index of an added row or −1, `isHidden(coll, i)`, `count(coll)` → visible rows, `href(coll, i)` →
   `company.html#c-…` / `article.html#n-…` / `winner.html#a-…` for added rows else the index form, `logo(row)` / `image(row)` → URL or "",
   `bg(url)` → `background-image:url("…");background-size:contain;background-position:center;background-repeat:no-repeat`,
   `imgTag(url, alt, cls)`, `banners(sectionEl, k)` (merge banners into an `.sbn` before SBN_JS starts it), `cats(CATS)` (returns the merged
   market categories), `notices()` (inserts the notice bar after `.site-hdr` on DOMContentLoaded; dismiss in localStorage
   `mig-notice-<id>-<v>` inside try/catch), `hidePathNotice()` (on a static SEO page whose decoded path is in `hp`: replace `main` with «المحتوى
   ده مش معروض حالياً» + hub link; optional, §4.6), `esc(s)`, `neutral(s)`}.
   `MIGOVL_ADMIN` mode installs NO setters and exposes only the pure helpers (the panel uses `schema`, `key`, `fromRow`, `toRow`).
6. **Fail safe**: any exception inside apply is caught per collection (`console.warn` once, the collection stays as built); never throws to the
   page; with `MIGOVL_DATA == null` the file only defines `MIGOVL` helpers.

### 4.6 Applier timing per page type
| page type | data files | timing |
|---|---|---|
| site.py pages (`page()`): home, market, tenders, rfqs, factories, company, city, region, offers, offer, events, event, news, article, awards/winner, opportunity, projects, project, radar, map, suppliers, register, dashboard … | head: plan.js, mig-api.js, mig-forms.js, regions.js, real.js, factories.js; page js prepends e.g. oldfac.js, oldfacd.js, oldprod.js, facx.js, oldtend.js, oldrfq.js, offers.js, zones.js, videos.js, projects.js | mig-overlay.js + overlay.js run first (P-S1), so every later `window.X =` is patched before any page script reads it |
| factories.html (`/factories/search/` after the clean-URL build) | `oldfac.js async onload="window.__ofl && window.__ofl()"` + inline facx.js | the setter patches MIGOLDFAC when the async script executes, before its onload callback (`__ofl`) merges it |
| company.html (shim in the clean-URL build) | oldfac.js, oldfacd.js, oldprod.js, facx.js | MIGOLDFAC first, MIGOLDFACD by the same index map; `#c-…` resolved by P-S5 |
| generated SEO pages (`/factories/<slug>/`, `/tender-item/…`, `/news/…` …) | none at first; Janna's lazy bundle `window.SEO_ASK_SRC` | content is build-time HTML until the next build (the daily build bakes the overlay, §4.9). P-T4 puts `data/mig-overlay.js` + `data/overlay.js` first in `assistant.scripts` so Janna's data matches the site; optional P-T5 adds a deferred include for `hidePathNotice()` |
| panel.html | loaded lazily by sections | `MIGOVL_ADMIN = 1`: raw base rows + D1 drafts merged by the panel |
| tools/dump-data.mjs (SEO build), worker/build-index.js (Janna index) | vm sandbox | P-T1/P-T2 evaluate mig-overlay.js + `build/overlay.js` (pulled by deploy.sh, P-T6) before the data files |

### 4.7 Editor flow and states (panel)
Every editor offers «حفظ ونشر» (default: save the draft and publish it in one call: `publish:true`) and «حفظ كمسودة». The list shows a state
chip: «منشور», «مسودة لم تُنشر», «مخفي», «محذوف (ينتظر النشر)», «يحتاج إعادة بناء». «نشر الكل» publishes every draft (publish section). Sources:
publishing a tend/opp/news/event/award/offer/zone/proj/video add or a change of its `source_url` requires a valid `source_url` (422
`source_required`); RFQs, banners, notices, cats and directory companies do not.

### 4.8 Hide / delete semantics
* **Hide** (base or add): removed from every runtime list and detail page at the next publish (hole or splice per collection); detail pages show
  their existing «not found» state (company.html «لم يُعثر على المنشأة», article.html «لم يُعثر على الخبر» …). Static SEO page → edge
  `noindex,follow` (§4.10) until the next build drops the page. Unhide restores everything (edge `restore`).
* **Delete**: adds → removed (never published: row deleted; published: `deleted` → dropped at publish, edge 301 to the collection hub when the
  add already had a baked static page); base rows cannot be deleted from the build data: "delete" = permanent hide + edge 301 to the hub.
  Hubs: fac/facx → `/factories/`, prod → `/products/`, tend/opp/intl → `/tenders/`, rfq → `/rfq/`, news → `/news/`, event → `/events/`,
  award → `/awards/`, offer → `/offers/`, zone → `/industrial-zones/`, proj → `/projects/`.
* Counts: `.length` of hole collections still includes hidden rows; consumers that print a count should use `MIGOVL.count(coll)` (P-S7 lists
  the known ones); build-time counts are correct after the next build.

### 4.9 "Needs rebuild" list
`static_impact = 1` for every published change in `fac`, `facx`, `prod`, `tend`, `rfq`, `news`, `event`, `award`, `opp`, `intl`, `offer`,
`zone`, `proj`, `video` and for public settings (the static SEO pages' footer) — the generated SEO pages, sitemaps and Janna's worker index
(worker/src/data.json) only show them after a build. The patched build writes `/_seo/overlay-baked.json` = `{"v": <baked overlay v>, "at": "…"}`
(P-T1 dumps it, P-B4 writes it, P-T6 pulls the overlay before the daily build). The panel reads that file and calls `GET /api/admin/cc/content/status?baked_v=<v>`; items with `published_v > baked_v` and
`static_impact = 1` are listed with «بيتحدّث تلقائياً في النشر اليومي (02:37 UTC)». No file → `baked_v:null` → «النسخة المنشورة من الموقع
مبنية قبل التعديلات دي». Runtime pages (lists, search, detail apps) show the change within ~2 minutes in every case.

### 4.10 Edge actions through the existing SEO layer (never edit functions/_middleware.js)
The SEO bundle in KV (`seo:bundle`: `ov[path].robots`, `rd[path] = {to, code}`) has ONE writer: the Pages Function `/api/seo/*`. content.js
performs edge actions by calling it server-side with the acting admin's own `Authorization` header (owners/admins have `members.role =
'admin'`, editors `'seo'` — both accepted by seo-auth.js):
* hide → `GET https://<site>/api/seo/page?path=<p>` (remember `override.robots` in `cc_edge.before_json`), then `PATCH /api/seo/page`
  `{path, robots:"noindex,follow", note:"مخفي من لوحة الإدارة: <coll>/<id>"}`;
* unhide → `PATCH /api/seo/page {path, robots: <before value or "">}` ("" removes the field);
* delete → `POST /api/seo/redirects {from: <p>, to: <hub>, code: 301, note:"محذوف من لوحة الإدارة: <coll>/<id>"}`; undo → `DELETE
  /api/seo/redirects?from=<p>`.
`seo_path` is computed by the panel: fac/prod/tend/rfq from the row's own legacy URL (`[7]`, `[5]`, `[11]`, `[8]` pathname when on
madeinegyptgate.com); other collections and `x<i>` companies through the build's `/_seo/hash/<type>.json` maps (company, article, event, offer,
city, winner, project, opportunity); none → no edge action. At most 50 edge calls per request (the SEO API allows 120 writes/min); failures
(network, 401/403, 409 manifest, 503 kv_off in local tests) stay `pending`/`failed` with the error, are shown in «النشر والتحديث», and are
retried by `POST /edge-retry` (the panel calls it automatically on load when pending > 0). After the next build the static page no longer exists
(the middleware's imported-entity prefixes answer 410) and the noindex override becomes harmless; the panel offers «تنظيف» to remove
overrides whose page is gone.

### 4.11 Media uploads (content.js; R2 binding MEDIA)
* Accepted: `image/jpeg`, `image/png`, `image/webp` only (SVG/GIF/HEIC refused), body ≤ 5 MB (admin) / 3 MB (member); magic bytes must match
  the declared type (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF….WEBP`); dimensions parsed from the header (JPEG SOFn,
  PNG IHDR, WebP VP8/VP8L/VP8X): min 64×64, max 6000×6000, max 36 MP; per-purpose minimum (banner ≥ 1120×200, logo ≥ 96×96, product ≥ 300×300).
* Privacy: JPEG APP1 (EXIF/XMP) and APP13 segments are stripped; PNG `tEXt`/`iTXt`/`zTXt`/`eXIf` chunks are dropped; WebP `EXIF`/`XMP `
  chunks are dropped (VP8X flags updated). No re-encoding.
* Key `u/<yyyy>/<id>.<jpg|png|webp>`, `httpMetadata.contentType` = mime, `customMetadata = {owner_type, owner_id, purpose, sha256}`;
  duplicate sha256 by the same owner → the existing media row is returned.
* Admin uploads are `public` at once; member uploads stay `pending` (served only with a signed preview URL) until the product/company
  request that references them is approved (`mediaPublic`).
* No MEDIA binding → 503 `media_off` (the editors then hide upload buttons and say «رفع الصور محتاج تفعيل R2»).

---

## 5. Payments (N-Genius, Paymob, PayTabs, manual) — payments.js

### 5.0 Research basis and what is verified
Official documentation was searched on 2026-11-18; direct page fetches to paymob.com / developers.paymob.com were blocked by this session's
network policy, so the facts below come from the providers' own doc pages as shown in search results plus long-standing public integration
patterns. Everything marked **VERIFY** must be checked once with real sandbox credentials before going live (the adapter isolates each in one
function so a fix is local). Sources: developers.paymob.com (Intention API create/update, Unified Checkout redirection, HMAC transaction
callback), docs.oman.paymob.com (HMAC calculation, same algorithm), docs.ngenius-payments.com + docs.ksa.ngenius-payments.com (creating
orders, order input attributes, consuming web hooks), network.ae developer page (identity token call), support.paytabs.com (callback
`Signature` header, return URL response), docs.paytabs.com (PT2 API endpoints, return/landing handling).

### 5.1 Common adapter interface (payments.js, one object per provider)
```js
// adapter.checkout(env, cfg, invoice, payment, urls) → {redirect_url, provider_ref, provider_order?, raw_status}
// adapter.verifyWebhook(env, cfg, req, rawBody) → {ok, event_key, provider_ref, provider_txn, status: "paid"|"failed"|"pending", amount_minor, currency, merchant_ref}
// adapter.verifyReturn(env, cfg, url, form) → same shape (or {ok:false})
// adapter.query(env, cfg, payment) → same shape (authoritative server-side status), when the provider supports it
```
`cfg` = decrypted config for the active provider (secrets from crypto.js). All calls: `fetch` with 15 s timeout, JSON, no logging of bodies.
Result handling is provider-independent (§5.4). Amounts: `total_minor` (piasters) of the invoice; currency `EGP`.

### 5.2 Providers
**Paymob (Accept, Intention API — Egypt host `https://accept.paymob.com`; test vs live by the key pair, same host)**
* Config: secret key `egy_sk_test_…|egy_sk_live_…` (slot `pay.paymob.secret_key`), public key `egy_pk_…` (setting `pay.paymob.public_key`),
  integration ids (setting, comma list of integers: card / wallet), HMAC secret (slot `pay.paymob.hmac_secret`, Dashboard → Settings → Account
  info → HMAC). Mode must match the key prefix (`_test_` ↔ test) or `ready:false` with «المفاتيح مش متوافقة مع الوضع».
* Checkout: `POST https://accept.paymob.com/v1/intention/` headers `Authorization: Token <secret_key>`, `Content-Type: application/json`, body
  `{"amount": total_minor, "currency": "EGP", "payment_methods": [<integration ids as numbers>], "items": [{"name": "<plan_name>", "amount":
  total_minor, "description": "<invoice no>", "quantity": 1}], "billing_data": {"first_name", "last_name", "email", "phone_number" (E.164 or
  "NA"), "apartment": "NA", "floor": "NA", "street": "NA", "building": "NA", "city": "NA", "state": "NA", "country": "EG"}, "special_reference":
  "<invoice no>-<payment id short>", "notification_url": "<site>api/pay/webhook/paymob", "redirection_url":
  "<site>api/pay/return/paymob?t=<pay_token>", "extras": {"invoice": "<no>"}}` → 201 `{id, client_secret, intention_order_id, status, …}`;
  `redirect_url = "https://accept.paymob.com/unifiedcheckout/?publicKey=" + encodeURIComponent(public_key) + "&clientSecret=" +
  encodeURIComponent(client_secret)`; store `provider_ref = id`, `provider_order = intention_order_id`. (VERIFY: required billing fields,
  whether `special_reference` must be unique per attempt — we make it unique.)
* Transaction-processed callback (`POST` JSON `{type:"TRANSACTION", obj:{…}}` to notification_url with `?hmac=<hex>`): HMAC-SHA512 (hex,
  lower case) keyed with the HMAC secret over the concatenation, in this order, of `obj.amount_cents, obj.created_at, obj.currency,
  obj.error_occured, obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure, obj.is_auth, obj.is_capture, obj.is_refunded,
  obj.is_standalone_payment, obj.is_voided, obj.order.id, obj.owner, obj.pending, obj.source_data.pan, obj.source_data.sub_type,
  obj.source_data.type, obj.success` (booleans as `true`/`false`, null as empty string); constant-time compare. Paid ⇔ `success === true &&
  pending === false && !is_voided && !is_refunded && !error_occured && amount_cents === total_minor && currency === "EGP"`; match the
  payment by `obj.order.id === provider_order` (else by `obj.order.merchant_order_id`/`special_reference`). `event_key =
  "paymob:" + obj.id + ":" + (paid ? "paid" : success ? "pending" : "failed")`. (VERIFY the field list/order against the dashboard's test
  callback; the docs show this 20-field order.)
* Response callback (browser GET to redirection_url with the same fields flattened — `order`, `source_data.pan` … — and `hmac`): verified the
  same way; then 303 to pay.html. No separate re-query (Paymob's inquiry needs the legacy API key); the webhook is authoritative.

**N-Genius Online (Network International) — host per region**
* Config: API key (slot `pay.ngenius.api_key`; the portal's service-account key, already in the form the gateway expects — never re-encode),
  outlet reference (setting `pay.ngenius.outlet_id`), API host (setting `pay.ngenius.host`: `api-gateway.sandbox.ngenius-payments.com` for test,
  `api-gateway.ngenius-payments.com` for live, or the regional host Network International gives the merchant — **VERIFY the Egypt host at
  onboarding**; KSA uses `*.ksa.ngenius-payments.com`), optional webhook header value (slot `pay.ngenius.webhook_value`, configured in the
  portal as custom header `X-MIG-Webhook`).
* Token: `POST https://<host>/identity/auth/access-token` headers `Authorization: Basic <api key>`, `Content-Type:
  application/vnd.ni-identity.v1+json`, `Accept: application/vnd.ni-identity.v1+json` → `{access_token, expires_in}`; cache per isolate
  until `expires_in − 30 s`.
* Checkout: `POST https://<host>/transactions/outlets/<outlet>/orders` headers `Authorization: Bearer <token>`, `Content-Type:
  application/vnd.ni-payment.v2+json`, `Accept: application/vnd.ni-payment.v2+json`, body `{"action": "PURCHASE", "amount": {"currencyCode":
  "EGP", "value": total_minor}, "emailAddress": "<invoice e-mail>", "merchantOrderReference": "<invoice no>", "language": "ar"|"en",
  "merchantAttributes": {"redirectUrl": "<site>api/pay/return/ngenius?t=<pay_token>", "cancelUrl": "<site>api/pay/return/ngenius?t=<pay_token>&c=1",
  "skipConfirmationPage": true}}` → `{reference, _links: {payment: {href}}, _embedded: {payment: [{state}]}}`; `redirect_url =
  _links.payment.href`; `provider_ref = reference`.
* Status (authoritative, used by return, webhook and cron): `GET https://<host>/transactions/outlets/<outlet>/orders/<reference>` (Bearer,
  Accept v2) → `_embedded.payment[0].state`: `PURCHASED` or `CAPTURED` = paid (amount `amount.value` and `currencyCode` must match),
  `FAILED` / `DECLINED` / `CANCELLED` = failed, `STARTED` / `AUTHORISED` / `AWAIT_3DS` = pending. The return URL gets `?ref=<reference>` from
  N-Genius (VERIFY the parameter name; we also accept the stored `provider_ref`).
* Webhook (`POST` JSON `{eventName, order:{reference, …}}`): if a header value is configured it must match (constant-time) — then ALWAYS
  re-query the order (the payload alone never activates anything). `event_key = "ngenius:" + reference + ":" + state`.

**PayTabs (PT2) — Egypt host `https://secure-egypt.paytabs.com` (test vs live by the profile, same host)**
* Config: profile id (setting `pay.paytabs.profile_id`, integer), server key (slot `pay.paytabs.server_key`), host (setting, default
  `secure-egypt.paytabs.com`).
* Checkout: `POST https://<host>/payment/request` headers `authorization: <server key>`, `content-type: application/json`, body
  `{"profile_id": <int>, "tran_type": "sale", "tran_class": "ecom", "cart_id": "<invoice no>-<payment id short>", "cart_currency": "EGP",
  "cart_amount": total_minor / 100 (2 decimals), "cart_description": "<plan_name> — <invoice no>", "paypage_lang": "ar"|"en",
  "customer_details": {"name", "email", "phone", "street1": "NA", "city": "NA", "state": "NA", "country": "EG", "zip": "00000"},
  "hide_shipping": true, "callback": "<site>api/pay/webhook/paytabs", "return": "<site>api/pay/return/paytabs?t=<pay_token>"}` →
  `{tran_ref, redirect_url}`; `provider_ref = tran_ref`.
* Callback/IPN (`POST` JSON): header `Signature` = hex HMAC-SHA256 of the RAW body keyed with the server key → verify on the raw bytes, then
  query. Return (browser `POST` form `tranRef, respStatus, respCode, respMessage, cartId, customerEmail, acquirerRRN, acquirerMessage, token,
  signature`): signature = hex HMAC-SHA256 (server key) of the remaining non-empty fields sorted by key and URL-encoded as a query string →
  verify, then query. The return handler MUST accept POST (Worker route, not the static page).
* Query (authoritative): `POST https://<host>/payment/query {"profile_id", "tran_ref"}` → `payment_result.response_status`: `A` = paid (and
  `cart_amount`/`cart_currency` match), `H` hold / `P` pending = pending, `D` declined / `E` error / `V` voided = failed. `event_key =
  "paytabs:" + tran_ref + ":" + response_status`.

**Manual (bank transfer / InstaPay)**: no provider call. Instructions AR/EN from settings `manual_pay_ar` / `manual_pay_en` (bank name, account
name, IBAN/account number, InstaPay handle — entered by the owner, public on pay.html). The invoice stays `open` until an admin records the
payment (`mark-paid`, typed confirmation, reference required) — the only human step, and only for this method.

### 5.3 URLs to configure at the providers (shown read-only in «بوابة الدفع»)
Paymob: notification and redirection URLs are sent per intention (no dashboard field needed): `https://madeinegyptgate.com/api/pay/webhook/paymob`,
`https://madeinegyptgate.com/api/pay/return/paymob`. N-Genius portal webhook: `https://madeinegyptgate.com/api/pay/webhook/ngenius` (+ custom
header `X-MIG-Webhook: <value>`). PayTabs: sent per request: `…/api/pay/webhook/paytabs`, `…/api/pay/return/paytabs`. The live panel's
«رابط النجاح / رابط الفشل» are kept as settings and used as the final pages after pay.html shows the result (default
`https://madeinegyptgate.com/dashboard.html#plan` and `https://madeinegyptgate.com/register.html#plans`).

### 5.4 Invoice lifecycle, activation, idempotency
* **Readiness** (`payReady(env)`): `pay.enabled = 1`, provider implemented, `pay.mode = "live"`, every required field and secret present and
  readable → `{ready:true}`. Test mode is NEVER public: customers see «بوابة الدفع لسه بتتجهّز»; only `test=1` invoices can be paid in test
  mode (owner). `manual` = `pay.provider = "manual"` or `pay.manual_fallback = 1` with instructions filled.
* **Numbering**: `INV-<yyyy>-<6 digits>` from `cc_counters` (`INSERT … ON CONFLICT DO UPDATE SET n = n + 1 RETURNING n`, gap-free per year,
  yyyy = Cairo year of issue). `pay_token` = 24 random bytes, base64url (32 chars).
* **Amounts**: `net_minor = price_egp × 100` from `cc_plans` at issue time (frozen), `vat_bp` from settings (1400), `vat_minor =
  round(net × vat_bp / 10000)`, `total = net + vat`. No proration.
* **Automatic invoice on signup**: `onInquiryCreated(env, ref, CC)` (called by index.js after a 201 on POST /api/inquiries, and by the cron
  backstop for signups of the last 7 days without an invoice): when `kind = "signup"` and `payload.plan` is sellable → `issueInvoice({email:
  inquiry.email, company: payload.company || inquiry.company, plan, source:"signup", inquiry_ref: ref})` (idempotent through the unique
  `inquiry_ref`), member link: an existing member with the same mailbox (`membersByMailbox`), else `member_id = ''` (linked later), and
  `cc_member_meta.status = 'pending'`, `requested_plan = plan` for that member when one exists. E-mail `invoice_issued` (pay link when ready;
  manual instructions when manual; otherwise the honest «بوابة الدفع لسه بتتجهّز…» text). The signup receipt e-mail from inquiries.js stays
  unchanged.
* **Gateway goes live later**: `paymentsCron` e-mails `payment_link` once to every `open` non-test invoice with `link_mail_at = ''` issued in
  the last 60 days (≤ 50 per run), automatically.
* **Checkout**: one `cc_payments` row per attempt (`created` → `redirected`); a new attempt marks older `created/redirected` ones `cancelled`.
* **Result handling (all providers)**: insert `cc_pay_events (provider, event_key, …)`; a UNIQUE conflict = duplicate → return 200 and do
  nothing. Paid + verified + amount/currency match + payment belongs to the invoice → `UPDATE cc_invoices SET status='paid', paid_at, paid_via,
  provider, provider_ref WHERE id = ? AND status = 'open'`; only when `changes = 1`: activation via `CC.acc.setPlan(env, {memberId (find or
  create by mailbox: verified=1, email_verified_at=''), plan, expires, by: "provider:<name>", reason: "payment", invoiceNo})` with `expires =
  max(now, current plan_expires if the same plan is in force) + duration_days` (an upgrade starts a new period at payment), then e-mail
  `payment_received`, bell notification, audit `pay.paid`. `test=1` invoices are marked paid but NEVER call setPlan. Amount mismatch →
  `result = "rejected:amount"`, invoice stays open, audit `pay.mismatch`, team e-mail. Failed → payment `failed`, invoice stays open, e-mail
  `payment_failed` (optional template).
* **Renewal**: `paymentsCron` daily: members with a paid plan (verified, in force) expiring in 30 days or 7 days and no open
  renewal/upgrade invoice → `issueInvoice({source:"renewal"})` + e-mail `renewal_reminder`; never for test invoices.
* **Re-query**: payments `redirected/pending` older than 10 min and younger than 48 h are re-queried (N-Genius, PayTabs) every 15 min.
* **Void / refund**: void = admin, open invoices only; refunds are done at the provider by the owner and recorded with `status = refunded`
  (manual, no API call; plan is not downgraded automatically — the owner decides in «الأعضاء»).

### 5.5 Unverified until real credentials exist
Paymob billing_data strictness and the exact callback HMAC field order; N-Genius Egypt API host and the return parameter name; PayTabs return
signature canonicalisation and status letters other than `A`; webhook retry behaviour of each provider; Arabic hosted-page languages. The
panel shows «لم يُجرَّب بمفاتيح حقيقية بعد» under the provider until the first verified sandbox payment is recorded (`cc_pay_events.verified =
1` in test mode).

---

## 6. E-mail center — email-center.js (Resend first, Brevo API alternative, SEND_EMAIL binding as last fallback)

### 6.1 Template registry (every e-mail the Worker sends today + the new ones)
`templateKeyOf(msg)`: explicit `msg.tpl` wins; else by `msg.id` prefix; deal e-mails (header `X-MIG-Deal`) → `deal_email`; unknown → `other`.
`required` templates cannot be switched off; `body` = full body editable (only templates rendered by `renderTemplate` with variables);
the others accept subject/intro/outro overrides only (their bodies are composed in code).
| key | id prefix / source | to | list | required | vars (for overrides) |
|---|---|---|---|---|---|
| `auth_code` | `code-` (auth.js) | user | — | ✓ | `subject` (code masked in the log) |
| `inquiry_receipt` | `rcpt-` (inquiries.js sendReceipt) | buyer | — | ✓ | subject, ref, kind |
| `inquiry_to_factory` | `route-` (sendRoute) | member | incoming | ✓ | subject, ref, about |
| `inquiry_update` | `upd-<id>-<what>-` (buyerUpdate: reply, quote, declined, rematched, closed, declined_all, in_progress) | buyer | updates | ✓ | subject, ref, what |
| `buyer_message_to_factory` | `bmsg-` (relayToFactory) | member | incoming | ✓ | subject, ref |
| `factory_reminder` | `remind-` (inquiriesCron) | member | incoming | | subject, ref |
| `team_inquiry_notice` | `team-` (create) | TEAM_EMAIL | — | | subject, ref, kind, status |
| `team_needs_alert` | `teamneed-<id>-<i>` (deploy 1 teamFlow: no registered match) | TEAM_EMAIL + ADMIN_EMAILS (`adminEmails()`) | — | ✓ | subject, ref, kind |
| `team_reply` | `teamreply-<id>-` (deploy 1 teamReply «إحنا اللي هنرد») | buyer | — | ✓ | subject, ref |
| `wa_consent_notice` | `wa-on-` (me.js waNotice) | member | — | ✓ | subject |
| `follow_digest` | `digest-` (digest.js) | member | digest | | subject |
| `deadline_reminder` | `dl-` (digest.js) | member | digest | | subject |
| `team_mood_flag` | `wamood-` (whatsapp.js) | TEAM_EMAIL | — | | subject |
| `bassem_morning_email` | `bm-<member>-<day>` (whatsapp.js, Bassem's morning message by e-mail when WhatsApp is off) | member | bassem | | subject |
| `bassem_call_email` | `bc-<member>-<day>` (whatsapp.js, Bassem's call note by e-mail) | member | bassem | | subject |
| `meeting_confirmation` | `mc-` (meetings.js) | visitor | — | ✓ | subject |
| `meeting_cancelled` | `mx-` | visitor | — | ✓ | subject |
| `meeting_reminder` | `mr24h-`, `mr1h-` (also `mr24-`, `mr1-`) | visitor | — | | subject |
| `meeting_summary` | `ms-` | visitor | — | | subject |
| `team_meeting_booked` | `mt-` | TEAM_EMAIL | — | | subject |
| `team_meeting_summary` | `mf-` | TEAM_EMAIL | — | | subject |
| `advisor_login_link` | `l-` (advisor.js) | member | — | ✓ | subject |
| `bassem_note` | `nt-` | member | — | | subject |
| `advisor_reply_notice` | `n-` | member | — | | subject |
| `deal_email` | header `X-MIG-Deal` (member-authored) | third party | — | ✓ | none (log only; never altered) |
| `invoice_issued` ★ | payments | buyer | — | ✓ | invoice_no, plan_name, total, currency, pay_url, gateway_text, manual_text, company |
| `payment_link` ★ | payments | buyer | — | ✓ | invoice_no, plan_name, total, pay_url |
| `payment_received` ★ | payments | member | — | ✓ | invoice_no, plan_name, total, plan_until, dashboard_url |
| `payment_failed` ★ | payments | buyer | — | | invoice_no, pay_url |
| `renewal_reminder` ★ | payments cron | member | updates | | plan_name, plan_until, days_left, invoice_no, pay_url |
| `member_invite` ★ | acc (admin «ابعت دعوة») | member | — | | name, company, login_url |
| `legacy_login_notice` ★ | acc bridge | member | — | ✓ | stop_url, when |
| `product_approved` ★ / `product_rejected` ★ | acc approvals | member | updates | | product, reason, url |
| `company_approved` ★ / `company_rejected` ★ | acc approvals | member | updates | | company, reason, url |
| `staff_added` ★ | acc staff | staff | — | ✓ | role, login_url |
| `test_email` ★ | email-center test | admin | — | ✓ | — |
(★ = new, defaults bilingual AR first, Egyptian-friendly wording, rendered by `renderTemplate` and sent through common.js `mail()` so they get
the platform footer, PDPL line and the unsubscribe footer when `list` is set.) Lists are exactly common.js `EMAIL_LISTS` = `digest`, `updates`,
`incoming`, `bassem` (deploy 1 added `bassem`); the registry MUST NOT invent a list. The registry is a constant in email-center.js; a test
greps worker/src/*.js for every `id: "<prefix>` / ``id: `<prefix>`` literal and fails when a prefix has no registry row (so a future e-mail cannot
bypass the center unnoticed).

Default texts of the new templates (AR then EN; `{{var}}` placeholders):
* `invoice_issued` — subject «فاتورة اشتراك {{plan_name}} رقم {{invoice_no}} / Subscription invoice {{invoice_no}}»; body «أهلاً،\nدي فاتورة
  اشتراك {{company}} في {{plan_name}}: الإجمالي {{total}} {{currency}} (شامل ضريبة القيمة المضافة).\n{{gateway_text}}\n{{manual_text}}» where
  `gateway_text` = «ادفع أونلاين من صفحة الدفع الآمنة: {{pay_url}}» when ready, else «بوابة الدفع الإلكتروني لسه بتتجهّز — أول ما تشتغل هيوصلك
  رابط الدفع تلقائياً على الإيميل ده، ومش هنطلب منك بيانات كارت على صفحاتنا أبداً.»; `manual_text` = the manual instructions + «اكتب رقم
  الفاتورة {{invoice_no}} في بيان التحويل.» when manual, else "".
* `payment_link` — «بوابة الدفع اشتغلت ✓ تقدر تدفع فاتورة {{invoice_no}} ({{total}} جنيه) من هنا: {{pay_url}}».
* `payment_received` — «استلمنا دفع الفاتورة {{invoice_no}} واتفعّلت {{plan_name}} لحد {{plan_until}}. لوحتك: {{dashboard_url}}».
* `renewal_reminder` — «اشتراكك في {{plan_name}} بينتهي يوم {{plan_until}} (فاضل {{days_left}} يوم). فاتورة التجديد {{invoice_no}}: {{pay_url}}».
* `member_invite` — «أهلاً {{name}}، حساب {{company}} على منصة صنع في مصر جاهز. ادخل بكود على الإيميل من غير باسورد: {{login_url}}».
* `legacy_login_notice` — «حد دخل على حسابك بالباسورد القديم يوم {{when}}. لو مش انت اضغط هنا وهنقفل الدخول بالباسورد القديم فوراً: {{stop_url}}».
* `product_*`, `company_*` — «اتوافق على …» / «ماتوافقش على … — السبب: {{reason}}. تقدر تعدّل وتبعت تاني من لوحتك: {{url}}».
* `staff_added` — «اتضافت كـ{{role}} في لوحة إدارة منصة صنع في مصر. ادخل بكود على الإيميل: {{login_url}}».
* `test_email` — «رسالة تجريبية من لوحة الإدارة — الإرسال شغال ✓».

### 6.2 Overrides, preview, test, log
* `cc_mail_templates` row per key (absent = defaults). Subject override may use `{{subject}}` (the code's subject) and the template's vars;
  intro/outro are inserted as their own paragraphs before/after the composed AR/EN bodies; full bodies only where `body_editable`.
  Unknown `{{x}}` → 422. Overrides are neutralised; links in them are plain text unless they start with the site URL (common.js `linkify`).
* `prepareMail()` caches overrides per `env.DB` for 60 s; missing table → no overrides.
* Preview renders defaults+overrides with `‹var›` placeholders (no invented values). Test send renders the same with placeholders, prefixes the
  subject «[اختبار] / [Test]», sends to the typed address (perm email.test, 10/hour).
* Log: one `cc_mail_log` row per delivery attempt (`deliver()`), `to_hash = hmac(secretOf(env), "mail|" + lower(to)).slice(0, 32)`,
  `to_masked = first char + "•••@" + domain`, subject ≤ 120 chars with 6-digit codes replaced by `••••••`, no bodies. Search by exact address =
  hash match. Retention 180 days.

### 6.3 Provider selection, sender, and the exact hooks
`loadMailConfig(env)` (memo per env.DB, 60 s) reads `mail.*` settings and the key (`mail.<provider>.api_key` slot; else the Worker secret
`RESEND_API_KEY` for resend / `BREVO_API_KEY` for brevo) → `{ready, provider, key, from_email, from_name, reply_to, source}`.
`mailReady(env)` (sync) = `(cfg && cfg.ready) || !!env.RESEND_API_KEY || !!(env.SEND_EMAIL && typeof env.SEND_EMAIL.send === "function")`.
`deliver(env, msg)` (msg = the existing sendEmail shape `{id, from:{email, name}, to:[…], cc?, replyTo?, subject, text, html, headers?,
attachments?:[{filename, content (string), type}]}`) → `{sent, provider, id?, error?, skipped?}`:
1. Dedupe: a `cc_mail_log` row with the same `msg_id` and `status = 'sent'` in the last 24 h → `{sent:true, provider, id, dedup:true}` (no send).
2. Sender: `from.email` → configured `from_email` (default `noreply@madeinegyptgate.com`) for every platform message; `from.name` → kept when
   the caller set a specific one (e.g. «Janna — Made in Egypt Gate», «<company> via Made in Egypt Gate»), replaced by `from_name` («منصة صنع
   في مصر») when it is the generic `BRAND.name`. `replyTo`: the caller's value wins; else `reply_to` (default info@madeinegyptgate.com).
3. Provider order: (a) Control Center config ready → its provider; (b) `env.RESEND_API_KEY` → Resend; (c) `env.SEND_EMAIL` binding;
   (d) none → `{sent:false, provider:"", error:"email not configured"}`.
4. Resend: `POST https://api.resend.com/emails` headers `Authorization: Bearer <key>`, `Content-Type: application/json`, `Idempotency-Key:
   msg.id` (when set) — body `{from: fmtFrom(from), to, cc, reply_to: replyTo || undefined, subject, text, html, headers: headers || undefined}`
   plus, only when attachments exist, `attachments: [{filename, content: base64(utf8(content)), content_type: type}]` — byte-for-byte the current
   advisor.js request (same key order, `cc` undefined when empty) so existing tests keep passing. `fmtFrom` is copied verbatim from advisor.js
   (`"Name <addr>"`, the name double-quoted when it contains RFC 5322 specials) — email-center.js MUST NOT import advisor.js. → `{sent:true,
   provider:"resend", id}`; errors `{sent:false, provider:"resend", error:"resend <status>: <message ≤200>"}` / `"resend: <exception>"`.
   Brevo: `POST https://api.brevo.com/v3/smtp/email` headers `api-key: <key>`, `Content-Type: application/json`, `Accept: application/json` —
   body `{sender: {name, email}, to: [{email}], cc?: [{email}], replyTo?: {email}, subject, htmlContent: html, textContent: text, headers?,
   attachment?: [{name: filename, content: base64}]}` → `{messageId}`; errors `brevo <status>: <message>`.
   SEND_EMAIL: exactly the existing call `env.SEND_EMAIL.send({from: msg.from, to: msg.to, ...(cc ? {cc} : {}), ...(msg.replyTo ? {replyTo} : {}),
   subject, text, html, ...(msg.headers ? {headers} : {})})` → `{sent:true, provider:"cloudflare", id: messageId}`; errors `"cloudflare: <code>
   <message>"` (provider names `resend` | `brevo` | `cloudflare` | `""` — the existing ones are kept because tests and the inbox UI read them).
5. Log the attempt (best effort; a missing table never fails the send).

Hooks (integrator applies; §10.3 P-W2/P-W3/P-W4):
```js
// common.js — import at the top:
import { prepareMail, mailReady } from "./email-center.js";
// common.js — replace the emailOn line:
export const emailOn = env => !!(env && mailReady(env));
// common.js — inside mail(env, m), right after the recipient check:
  m = await prepareMail(env, m);                       // e-mail center: per-template on/off + subject/intro/outro overrides
  if (m.__skip) return { sent: false, skipped: m.__skip, error: m.__skip };
// advisor.js — import at the top and make sendEmail delegate (fmtFrom stays exported: meetings.js uses it):
import { deliver, mailReady } from "./email-center.js";
export async function sendEmail(env, msg) { return deliver(env, msg); }   // provider, sender, idempotency and delivery log live in email-center.js
const emailConfigured = env => !!(env && mailReady(env));
// meetings.js — import at the top:
import { attachOk } from "./email-center.js";
// meetings.js — replace the whole `if (env.RESEND_API_KEY && atts.length) { … }` block of the local mail() with:
  if (atts.length && attachOk(env)) return sendEmail(env, { id: msg.id, from: msg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: toHtml(msg.text, env), attachments: atts });
// (the following inline-text fallback for providers without attachments stays exactly as it is)
```
`prepareMail(env, m)` returns `m` unchanged when there is no override; it only ever adds `m.__skip` for optional templates switched off.

---

## 7. Plans & prices — single source of truth

### 7.1 Seed = today's values (no new numbers)
| plan | name (AR / EN, from data/plan.js) | price_egp (register.part.py) | products (plan.js / register LIM) | markets (common.js PLAN_SCOPE) | features (plan.js FEAT + server checks) |
|---|---|---|---|---|---|
| visitor | زائر / Visitor | — (not sellable) | 0 | — | — |
| profile | تسجيل بيانات الشركة فقط / Company data only | 4,000 | 0 | local | alerts, listing |
| basic | الباقة الأساسية / Basic plan | 10,000 | 30 | local | + respond, incoming, stats |
| premium | الباقة المميزة / Premium plan | 25,000 | 80 | + gulf | + priority, featured |
| partner | باقة الشريك الأساسي / Core Partner plan | 50,000 | 200 | + africa | + bassem |
| strategic | باقة الشريك الاستراتيجي / Strategic Partner plan | 100,000 | −1 (unlimited) | + asia, europe | same as partner |
VAT 14 % (`vat_bp = 1400`, register.html «ضريبة القيمة المضافة 14%»), duration 365 days, `images_per_product = 1` (the current data model
holds one image per product), `video = social = 0` until the owner enables them (or the import brings the old matrix values).

### 7.2 Matrix keys and who enforces them
`cc_plan_keys` rows (sort order = the matrix rows): products, images_per_product, m_local … m_europe, alerts, listing, respond, incoming, stats,
priority, featured, bassem, video, social, + imported custom rows. Enforcement:
| key | Worker | site | other |
|---|---|---|---|
| price_egp, duration_days, sellable, vat_bp | invoices (payments.js) | register.html cards/summary, home plans, legal text (plans-live.js) | Janna/Bassem prompts (persona sync); janna.js / bot.js answers read MIGPLAN (no patch; P-S8 only for the payment sentence) |
| products, images_per_product | `/api/me/products` (acc) | register LIM + hint, dashboard «منتجاتي», MIGPLAN.PL.products | |
| m_* markets | `PLAN_SCOPE` (matching scope, digests `inScope`), advisor `PLAN_MARKETS` | `MIGPLAN.PL[k].markets`, scope chips, lock boxes | Janna text |
| alerts | digest.js (`planCan(m,"alerts")`, P-W6) | MIGPLAN.can("alerts") | |
| incoming | matching.js candidates + scoreMember, me.js incoming/respond, inquiries.js rematch + respond page (P-W6) | dashboard «طلبات واردة لي» lock | |
| stats | me.js `/api/me/stats` (P-W6) | dashboard «إحصائياتي» lock | |
| priority | matching.js `scoreMember` (P-W6) | — | |
| featured | — | directory/market ordering by patched consumers (P-S7, optional) | |
| bassem | advisor.js `ELIGIBLE`/`PLAN_MARKETS`, whatsapp.js bassemCron (P-W6) | MIGPLAN.can("advisor"/"bassem"), dashboard Bassem card | persona |
| respond, listing, video, social | acc (`/api/me/company` allowed fields) | MIGPLAN.can("respond"), «ملف الشركة» fields | |
Imported rows with no enforcer are stored and shown with «محفوظ — مش مطبّق».

### 7.3 Worker application (acc-core `ccBoot` → `applyPlans`; integrator patch P-W2 adds the helpers to common.js)
common.js gets (exact code, P-W2):
```js
/* ---------- plan capabilities (Control Center matrix; acc.js calls setPlanCaps at boot — defaults = the original hard-coded rules) ---------- */
let PLAN_CAPS = null;                                  // {plan: {key: number|0|1}} from cc_plans.caps_json
export function setPlanCaps(c) { PLAN_CAPS = c && typeof c === "object" ? c : null; }
const CAP_DEFAULT = { alerts: 1, listing: 1, respond: 2, incoming: 2, stats: 2, priority: 3, featured: 3, bassem: 4 }; // minimum plan level
export function planCan(m, cap, nowIso) {              // nowIso: the cron's clock (digest/bassem pass iso(nowMs)), else now
  const p = effPlan(m, nowIso), c = PLAN_CAPS && PLAN_CAPS[p];
  if (p === "visitor") return false;
  if (c && cap in c) return !!c[cap];
  return cap in CAP_DEFAULT ? PLAN_LV[p] >= CAP_DEFAULT[cap] : false;
}
const LIMIT_DEFAULT = { products: { profile: 0, basic: 30, premium: 80, partner: 200, strategic: -1 }, images_per_product: { basic: 1, premium: 1, partner: 1, strategic: 1 } };
export function planLimit(m, key, nowIso) {            // -1 = unlimited, 0 = not available
  const p = effPlan(m, nowIso), c = PLAN_CAPS && PLAN_CAPS[p];
  if (p === "visitor") return 0;
  if (c && typeof c[key] === "number") return c[key];
  return (LIMIT_DEFAULT[key] && LIMIT_DEFAULT[key][p]) || 0;
}
/* plan keys that have a capability — for SQL pre-filters (matching candidates, Bassem's cron); never empty-string-injected */
export const plansWith = cap => Object.keys(PLAN_LV).filter(p => p !== "visitor" && planCan({ plan: p }, cap));
```
`effPlan(m, undefined)` uses its default (`new Date().toISOString()`), so the existing call sites keep their behaviour. The defaults
reproduce today's hard-coded rules exactly (alerts ⇔ profile+, respond/incoming/stats ⇔ basic+, priority/featured ⇔ premium+, bassem ⇔
partner+), so the patched Worker behaves identically until the owner changes the matrix — the existing test suite is the proof.
`applyPlans(env, rows)` (acc.js): builds `caps` (numbers + booleans per plan) and calls `setPlanCaps(caps)` (guarded:
`typeof C.setPlanCaps === "function"`, so acc works before the patch); mutates in place `PLAN_SCOPE[p]` (`splice(0)` + push markets with
`m_*=1`; visitor keeps `["local"]`), `PLAN_NAME[p] = [name_ar, name_en]`, and — when advisor.js exports them (P-W3) — `PLAN_MARKETS` (keys =
plans with `bassem=1`, values = their markets) and `ELIGIBLE` (`splice(0)` + push those keys). Nothing else in the Worker changes: matching,
digests and the advisor read these shared objects at call time.

### 7.4 Site application (data/plans-live.js, site-side) — loaded right after data/plan.js on every page (P-S1)
From `MIGOVL_DATA.plans` (no network call): (1) `MIGPLAN.PL[k].n/en` = names, `.price` = price_egp (EGP before VAT — `MIGPLAN.price(k)` reads
it), `.products` = products (−1 → `Infinity`), `.markets` = markets, and `MIGPLAN.VAT = vat_bp / 10000`. data/janna.js (`planPrice`,
`vatRate`, `plansList`) and data/bot.js (`pkgText`) already build every plan/price sentence from MIGPLAN at call time (deploy 1), so they follow
the matrix without any patch;
(2) wrap `MIGPLAN.can(f)`: `respond|incoming|stats|priority|bassem|alerts|listing` → caps; `advisor` → bassem; `products` → products ≠ 0;
`intl` → any non-local market; anything else → the original FEAT level check; (3) expose `window.MIGPLANS = {data, price(k) → "10,000",
priceNum(k), vatRate() → 0.14, vatLabel() → "14%", products(k), markets(k), name(k), patchCards(PLANS, PROFILE_ONLY), patchLimits(LIM),
sentence(lang, style), apply()}`; (4) on DOMContentLoaded replace the text of `[data-mig-price="<plan>"]` (formatted price),
`[data-mig-plan-name="<plan>"]`, `[data-mig-limit="<plan>:products"]` («30» / «غير محدودة» / "unlimited"), `[data-mig-prices="<style>"]`
(full sentence); (5) `window.MIGPAYREADY = MIGOVL_DATA.pay.ready`.
`patchCards(PLANS, PROFILE_ONLY)` mutates the register/home arrays in place before `plansHTML()` runs (P-S9): `p[2]` = formatted price;
`p[5]` = products label («30 منتجاً» / «منتجات غير محدودة»); every `p[7]` bullet that contains «منتج» and digits gets the new number; `p[4]`
= scope chips from the markets (🇪🇬 مصر · 🌍 الخليج والدول العربية · 🌍 أفريقيا · 🌐 آسيا وأوروبا وكل الأسواق); `PROFILE_ONLY[2]` = profile price.
`patchLimits(LIM)` sets `LIM[k] = products (−1 → Infinity)`. `sentence(lang, style)` styles: `legal` (the legal.part.py «membership»
sentence «تسجيل بيانات فقط (4,000 جنيه)، والأساسية (10,000 جنيه)، … سنوياً، والأسعار غير شاملة ضريبة القيمة المضافة (14%)») and `bot` (the static
`PKG` fallback of data/bot.js, used only when MIGPLAN is missing) — each regenerates today's literal with the current names, prices and VAT,
keeping the surrounding wording (builders copy the literal and replace only the numbers/names). The payment-state sentences (data/janna.js
`PAYTXT`, data/bot.js `PAY` and the gateway clause of `pkgText`, register.html done step) switch on `window.MIGPAYREADY` (P-S8). Absent overlay
→ nothing changes (the static literals stay).

### 7.5 Janna & Bassem persona sync (acc-core; Anam REST API, `ANAM_API_KEY` or slot `anam.api_key`)
Personas (BACKLOG 29): Janna AR `5f06d835-22cc-4460-b412-84cefa9e565b`, Janna EN `e5101653-65b4-44a6-85e5-ec2e78f82685`, Bassem
`19ef9078-5252-42a4-bbdf-9a3c4a38a4be`. Flow: `GET https://api.anam.ai/v1/personas/<id>` (Bearer) → `brain.systemPrompt` → replace ONLY the
plans section → `PUT https://api.anam.ai/v1/personas/<id>` with `{"systemPrompt": "<new>"}` (partial update; other fields untouched).
Sections (verified in the live prompts today, read-only): Janna AR — from the line `# حقائق الباقات والدفع` up to (not including) the next line
starting with `# ` (today `# تاجات المشاعر`); Janna EN — from `# PLANS & PAYMENT` up to the next `# ` (today `# EMOTION TAGS`); Bassem — inside
`# حقائق`, the single bullet line starting with `- كل الباقات بتشوف المناقصات` (it carries the partner/strategic facts). The generated text
keeps today's structure and tone (prices in Arabic words for speech: أربعة آلاف، عشرة آلاف، خمسة وعشرين ألف، خمسين ألف، مية ألف — `arWords(n)`
for multiples of 1,000 up to 1,000,000, digits otherwise; EN words likewise), the payment sentence switches between «بوابة الدفع لسه
بتتجهّز…» and «الدفع أونلاين من صفحة الدفع الآمنة بعد طلب التسجيل…» from `payReady()`. Section not found → `failed` («القسم مش موجود —
راجع البرومبت يدوياً»), nothing written. Unchanged text → `unchanged`, no PUT. Triggered after `PUT /api/admin/cc/plans` (auto when
`persona.auto_sync = 1`) or by the button (`dry_run` first shows the diff). Every attempt → `cc_persona_sync` + audit `persona.sync`. Tests
mock `fetch`; builders never call the real API with PUT.

---

## 8. Customers, members, companies

### 8.1 Customers (buyers) — computed, not a new entity
A customer = one `inquiries.email_key`. List = `SELECT email_key, MIN(created_at), MAX(created_at), COUNT(*), SUM(status NOT IN
('closed','blocked','recorded')) … GROUP BY email_key` + latest `name/company/phone/email` (latest row) + kinds histogram + member with the same
mailbox (`membersByMailbox`) + `blocks` (email) + `cc_customer_notes`. Legacy messages (`cc_legacy_messages.email_key`) are shown in the
detail. Buyers never become "members" by sending requests; an account exists only after an e-mail-code sign-in (or a platform action).

### 8.2 Members (accounts) — `members` + `cc_member_meta`
* Status (panel + `/api/me/account`): `active` = account usable (default; a visitor buyer account is active too); `pending` = subscription not
  completed (`requested_plan` set: open signup invoice, or imported «معلّق» user) → dashboard «⏳ بانتظار إتمام الاشتراك»; `suspended` = admin
  hold (plan held aside, `inbox_paused = 1`).
* Plan changes only through `setPlan()` (panel, payments, import, legacy bridge) — same semantics as admin.js (verified=1, activated_at,
  rematch). The browser never sets a plan.
* `factory_ref` links an account to its directory listing (index `"12"`, `"x3"` or an added `"c-…"` id) — set only by `directory.link`
  (panel) or by approving a claim/create request. It locks the company name for the member (existing me.js rule) and is the profile whose
  stats the member sees.

### 8.3 Verification badge
`verified` (MIGOLDFAC `[4]`, MIGFACX `[5]`) changes only by an explicit `directory.verify` action in «دليل الشركات» (audit
`content.verify`), never by a payment, a claim or an import. The public chip «موثّق» is whatever the existing consumers render for that flag.

### 8.4 Member submissions and approvals
* Product (`cc_member_products`): member saves draft → submits (`pending`) → editor/admin approves → acc calls
  `CC.content.upsert(env, {coll:"prod", kind:"add", id: <the product id>, fields:{name, name_en, category, description, image: first image url,
  price, company_url: MIGOLDFAC/added row URL of the member's factory_ref}, source:"member", member_id, publish:true})` and
  `CC.content.mediaPublic(env, images)` → live within ~2 min; state `approved`, `live_json` = the approved version; e-mail `product_approved`
  + bell. A later edit creates a new pending version; the live product stays until the new one is approved. Delete/hide by the member →
  `setHidden(… publish:true)` immediately (removal needs no approval). Count against the plan limit = products not in `deleted/rejected`.
* Company request (`cc_company_requests`): `edit` (linked listing; allowed fields by plan: name (needs admin), sector, location, type, gov,
  description, products, website, logo (+ video, social when the plan allows)), `claim` («ده ملف شركتي»: links an existing listing to the
  account), `create` (adds a new `fac` row). Approve → content upsert (edit/create) and/or `members.factory_ref` + `members.company` (claim/
  create), e-mail `company_approved`. One pending request per member. Claims are admin-only approvals (identity), evidence shown: same e-mail
  domain as the listing website, legacy company match by mailbox, member plan.

---

## 9. Orders / sales requests over `inquiries`

### 9.1 Kinds and labels (inquiries.js KIND_AR/KIND_EN)
`contact` رسالة تواصل · `rfq` طلب عرض سعر · `basket` طلب سلة منتجات (market baskets) · `opp_offer` عرض على فرصة (offers) · `lead_interest` اهتمام
بفرصة · `project_interest` اهتمام بمشروع · `entity_contact` تواصل مع جهة · `signup` طلب اشتراك (linked to its invoice) · `profile_fix` تصحيح
بيانات. Source: `form`, `janna`, `bassem`, `basket`, `admin` (manual RFQ, after P-W5).

### 9.2 Statuses (unchanged engine)
`received` (delivery being retried) → `routed` (sent to N) / `in_progress` (deploy 1, BACKLOG 19: no registered member matched — the buyer
was told «جاري معالجة طلبك», candidates are listed for the team; older rows may still say `no_match`) → `replied` → `closed` (auto after 30 days,
or by the team); `recorded` for non-routed kinds; `blocked`. The panel never edits statuses except through the team reply (`status` param).

### 9.3 needs_team, badges and filters
`needs_team` = inquiries.js `needsTeam(r)` (deploy 1: routable kind AND status `in_progress` or `no_match`) — never re-implemented. Badges:
`msgNew` = status `received`, `in_progress` or `no_match` + legacy messages `new`; `rfqNew` = kind rfq in the last 7 days; `needsTeam` = COUNT of
`needsTeam`. Filters: kind (multi), status (incl. `needs_team` pseudo-status), source, market, date range (created_at), q (ref, e-mail,
company, name, target, message — same LIKE as admin.js). Sort newest first.

### 9.4 «إحنا اللي هنرد» and candidates (already in the engine since deploy 1 — reused)
Team reply = inquiries.js `teamReply()` (§3.1.6): buyer-visible event `team_reply` (actor `team`), e-mail `teamreply-…` with Reply-To
TEAM_EMAIL, bell for the buyer's account, WhatsApp only through an approved buyer template (none yet → e-mail). The automatic team alert for
a no-match request is deploy 1's `teamFlow()` (candidates + bell for every admin + e-mail `teamneed-…` to TEAM_EMAIL/ADMIN_EMAILS). The receipt
text for normal flows stays «كل ده بيتم تلقائياً»; the team path is the owner's explicit exception (BACKLOG 19). Candidates list directory
factories for the team to contact manually; nothing is sent automatically to non-registered factories.

### 9.5 CSV
`orders.csv` columns: ref, kind, status, source, created_at, updated_at, name, company, email, phone, target_type, target_id, target_name,
sector, governorate, market, routed_count, replies_count, needs_team, message (≤ 1,000), payload JSON (admin/owner only).


---

## 10. File ownership, forbidden files and the integration patches

### 10.1 Existing files — no builder edits them (the integrator applies every change as a patch)
* `/home/user/madeinegyptgate/site.py`
* every existing `/home/user/madeinegyptgate/*.part.py` and `*.part.html` (incl. dash.part.html, register.part.py, company.part.py, legal.part.py,
  media2.part.py, pages.part.py, oldlists.part.py, inbox.part.py, admin.part.py, market.part.html, home2.part.html …)
* every existing `/home/user/madeinegyptgate/data/*.js` (plan.js, mig-api.js, janna.js, bot.js, oldfac.js …)
* `/home/user/madeinegyptgate/functions/**`, `/home/user/madeinegyptgate/seo_build.part.py`, `/home/user/madeinegyptgate/seo-admin.part.py`
* `/home/user/madeinegyptgate/deploy/**`
* `/home/user/madeinegyptgate/worker/src/{index,common,admin,auth,me,inquiries,matching,whatsapp,digest,advisor,meetings,ev,text}.js` — and
  deploy 1's `worker/src/candidates.js` (it exists now, so it is an existing file) and the generated `worker/src/data.json`
* `/home/user/madeinegyptgate/worker/schema.sql`, `/home/user/madeinegyptgate/worker/wrangler.toml`
* existing worker tests and test tooling: `worker/test/{advisor,meetings,platform,qa-fixes,integ-worker}.test.mjs`, `helpers.mjs`,
  `integration.mjs`, `json-hooks.mjs`, `json-loader.mjs`, `wrangler.integration.toml`
* also untouched: `worker/build-index.js`, `worker/README.md`, `worker/tools/*`, `tools/**`, `seo/**`, `docs/**` (this contract included —
  builders read it; questions and deviations go into their INTEGRATION.md), `docs/janna/legacy-live/*`

### 10.2 New files per area (the ONLY files a builder creates)
| area | new files | must also deliver |
|---|---|---|
| **acc-core** (backend core) | `worker/migrations/0006_admin_center.sql` (verbatim §2), `worker/src/acc.js` (+ optional `worker/src/acc-*.js` helpers, e.g. `acc-import.js`, `acc-legacy.js`, `acc-stats.js`, `acc-persona.js`, `acc-me.js`), `worker/test/acc.test.mjs` | `…/scratchpad/acc/acc-core-INTEGRATION.md` |
| **content** (content & media) | `worker/src/content.js`, `worker/test/content.test.mjs` | `…/scratchpad/acc/content-INTEGRATION.md` |
| **payments** | `worker/src/payments.js`, `worker/src/crypto.js` (verbatim §0.7 — written FIRST, before anything else, because acc/content/email import it), `worker/test/payments.test.mjs` (mock provider HTTP) | `…/scratchpad/acc/payments-INTEGRATION.md` |
| **email** (e-mail center) | `worker/src/email-center.js`, `worker/test/email-center.test.mjs` | `…/scratchpad/acc/email-INTEGRATION.md` |
| **admin-ui** | `panel.part.py` (writes `OUT + 'panel.html'` and `OUT + 'admin.html'` = redirect page to `panel.html`), `data/acc.js`, `data/acc.css` (when logic/styles move out of the page), `login.part.py` (writes `OUT + 'login.html'`) | `…/scratchpad/acc/admin-ui-INTEGRATION.md`, harness + screenshots under `…/scratchpad/acc/ui/` |
| **site-side** | `data/overlay.js` (exactly `window.MIGOVL_DATA = window.MIGOVL_DATA \|\| null;` + a one-line comment), `data/mig-overlay.js`, `data/plans-live.js`, `data/settings-live.js`, `data/dash-products.js`, `data/dash-company.js`, `pay.part.py` (`PAGES['pay']`), `data/pay.js` | `…/scratchpad/acc/site-side-INTEGRATION.md`, harness under `…/scratchpad/acc/site/` |

(`…/scratchpad` = `/tmp/claude-0/-home-user/16f6faf5-3188-59a6-a3eb-9f56f306beda/scratchpad`.)

Builder rules:
1. **INTEGRATION.md format** — sections «Patches» (each: the §10.3 id it implements or a new id `X-<area>-<n>`, the file, the anchor text copied
   from the file AS IT IS NOW, the exact replacement/insert, and why), «Config» (routes, bindings, vars, secrets), «Tests» (commands run + result
   lines), «Deviations / questions». A patch the builder could not verify against the real file is marked `UNVERIFIED`.
2. **Worker test harness** — run only your own file: `cd /home/user/madeinegyptgate/worker && node --disable-warning=ExperimentalWarning
   --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./test/json-loader.mjs --test test/<own>.test.mjs`. D1: `new D1()` from
   test/helpers.mjs (schema.sql) and then `d.db.exec(readFileSync(new URL("../migrations/0006_admin_center.sql", import.meta.url), "utf8"))`
   (twice in one test: it must be idempotent). KV / R2 fakes are Map-backed objects inside your test (`get/put/delete/getWithMetadata/list`,
   `put/get/head/delete`). `globalThis.fetch` is replaced per test and restored; any unexpected URL fails the test. No real network, ever.
   Cross-area calls use a fake `CC` object (§0.2). acc/content/email wait until `worker/src/crypto.js` exists (payments writes it first,
   verbatim) — never create or copy it into `src/`.
3. **Site/admin harness** — copy `site.py` into your scratch dir (admin-ui: `…/acc/ui/`, site-side: `…/acc/site/`), apply your own §10.3
   patches there only (P-S1 includes, execs), and build into a temp OUT dir of your scratch (`OUT` env or a patched constant). Never write into
   `/home/user/madeinegyptgate/site/`, `build/` or any repo file other than your own new files. Browser tests: Playwright with route mocking
   (`page.route("**/api/**", …)`), no live API; screenshots in `…/acc/ui/shots/` (admin-ui) or `…/acc/site/shots/` (site-side).
4. Strings: Arabic first, English parity, Egyptian-friendly wording as in the live pages; no sample/demo rows; empty states say what is true.

### 10.3 Consolidated integration patches (the integrator applies them; builders put the exact code in their INTEGRATION.md)
Anchors were verified against the files at 09:32 on 2026-11-18, while **deploy 1 was still being integrated** (site.py, worker/src/*,
dash.part.html and seo/config.json kept changing). Each anchor is a locator: the integrator re-reads the current file, re-derives the exact
anchor text, and applies the intent. Order: worker (W) → tools/build (T, B) → site (S, D) → config/deploy (C) → full test run.

#### Worker (owner of the patch code: the area in brackets)
**P-W1 `worker/src/index.js` [acc-core]**
* imports (after the existing `import { cairoDay, addDays } from "./common.js";`):
  ```js
  import * as ACC from "./acc.js"; import * as CONTENT from "./content.js"; import * as PAY from "./payments.js"; import * as MAILC from "./email-center.js";
  export const CC = { acc: ACC, content: CONTENT, payments: PAY, email: MAILC };   // Control Center (ACC-CONTRACT §0.2)
  ```
* `fetch()`: right after `const url = new URL(req.url);` insert `try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ }` and the
  eight dispatch lines of §3.0 (overlay, media, index.php, admin/cc, me-cc, auth/legacy, public plans/settings/pv, pay) — BEFORE the existing
  `/api/advisor` line, because `/api/me(\/|$)`, `/api/auth(\/|$)` and `/api/admin(\/|$)` would otherwise swallow them. Replace the existing
  line `if (/\/api\/inquiries(\/|$)/.test(url.pathname)) return handleInquiries(req, env, ctx);` with the wrapped line of §3.0.
* `email()`: first statement `try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ }`.
* `scheduled()`: first statement `try { await CC.acc.ccBoot(env, CC); } catch (e) { /* defaults */ }`; `platformCron`'s job list gets
  `["cc", () => CC.acc.ccCron(env, nowMs, CC)]` as its LAST element.

**P-W2 `worker/src/common.js` [email + acc-core]**
* top: `import { prepareMail, mailReady } from "./email-center.js";` (email-center imports only crypto.js → no cycle).
* replace `export const emailOn = env => !!(env && (env.RESEND_API_KEY || (env.SEND_EMAIL && typeof env.SEND_EMAIL.send === "function")));`
  with `export const emailOn = env => !!(env && mailReady(env));`.
* inside `export async function mail(env, m) {`, right after its first line (`if (!m.to || !isEmail(m.to)) return …;`):
  `m = await prepareMail(env, m); if (m.__skip) return { sent: false, skipped: m.__skip, error: m.__skip };`
* after `export const scopeOf = …;` insert the plan-capability block of §7.3 (`setPlanCaps`, `planCan`, `planLimit`, `plansWith`).

**P-W3 `worker/src/advisor.js` [email + acc-core]**
* top: `import { deliver, mailReady } from "./email-center.js";`
* replace the whole body of `export async function sendEmail(env, msg) { … }` with `return deliver(env, msg);` (keep the doc comment and keep
  `export const fmtFrom` — meetings.js imports it).
* replace `const emailConfigured = env => …;` with `const emailConfigured = env => !!(env && mailReady(env));`.
* `const ELIGIBLE = Object.keys(PLAN_MARKETS);` → `export const ELIGIBLE = Object.keys(PLAN_MARKETS);` (PLAN_MARKETS is already exported;
  acc's `applyPlans` mutates both in place — never reassigns them).

**P-W4 `worker/src/meetings.js` [email]** — `import { attachOk } from "./email-center.js";` and the local `mail()`'s
`if (env.RESEND_API_KEY && atts.length) { … }` block replaced as in §6.3 (the inline-text fallback below it stays).

**P-W5 `worker/src/inquiries.js` [acc-core]** — internal (Control Center) requests:
* `const SOURCES = ["form", "janna", "bassem", "basket"];` → add `"admin"`.
* in `async function create(req, env, ctx) {` after `const b = await readJson(req); …`: `const internal = req[Symbol.for("mig.cc.internal")] || null;`
  then (a) skip the Turnstile/`human()` call and the `inqip|` / `inqem|` `rateOk` limits when `internal`; (b) source =
  `internal ? "admin" : (SOURCES.includes(b.source) ? b.source : "form")`; (c) add the event meta `{by: internal.actor}` to the creation event
  when `internal`. Nothing else changes (routing, receipt, team flow, tracking stay identical).

**P-W6 plan checks → `planCan` [acc-core]** (import `planCan, plansWith` from common.js where needed; text locators, not line numbers):
| file | today | becomes |
|---|---|---|
| matching.js `scoreMember` | `priority: PLAN_LV[plan] >= PLAN_LV.premium ? 1 : 0` | `priority: planCan(m, "priority") ? 1 : 0` |
| matching.js `scoreMember` | `if (PLAN_LV[plan] < PLAN_LV.basic) return null;` | `if (!planCan(m, "incoming")) return null;` |
| matching.js `candidates` | `plan IN ('basic', 'premium', 'partner', 'strategic')` | `plan IN (${plansWith("incoming").map(() => "?").join(", ") || "''"})` + `.bind(...plansWith("incoming"))` |
| me.js profile update | `PLAN_LV[effPlan(fresh)] >= PLAN_LV.basic` (rematch) | `planCan(fresh, "incoming")` |
| me.js `/api/me/stats` | `if (PLAN_LV[effPlan(me)] < PLAN_LV.basic) return err(403, "plan", "available from the basic plan", { need: "basic" });` | `if (!planCan(me, "stats")) return err(403, "plan", "available from the basic plan", { need: plansWith("stats")[0] \|\| "basic" });` |
| me.js incoming list | `… "receiving requests needs the basic plan or higher" …` | same with `!planCan(me, "incoming")` |
| me.js respond | `… "needs the basic plan or higher" …` | same with `!planCan(me, "respond")` |
| inquiries.js `rematchForMember` | `PLAN_LV[effPlan(m)] < PLAN_LV.basic` | `!planCan(m, "incoming")` |
| inquiries.js respond page | `if (PLAN_LV[effPlan(member)] < PLAN_LV.basic) notice = …` | `if (!planCan(member, "respond")) notice = …` |
| digest.js daily | `if (PLAN_LV[effPlan(m, iso(nowMs))] < PLAN_LV.profile) continue;` | `if (!planCan(m, "alerts", iso(nowMs))) continue;` |
| whatsapp.js `bassemCron` | SQL `plan IN ('partner', 'strategic')` and `if (PLAN_LV[effPlan(m, iso(nowMs))] < PLAN_LV.partner) continue;` | `plan IN (…plansWith("bassem"))` (bound) and `if (!planCan(m, "bassem", iso(nowMs))) continue;` |
admin.js keeps its `PLAN_LV` checks (activation bookkeeping, not features). With the default matrix every row behaves exactly as today.

**P-W7 `worker/wrangler.toml` [acc-core; integrator]** — add, for `madeinegyptgate.com` AND `www.madeinegyptgate.com` (one line each, zone_name
`madeinegyptgate.com`): `/api/plans*`, `/api/settings*`, `/api/pay/*`, `/api/ev/*` (the existing exact `/api/ev` stays), `/data/overlay.js*`,
`/media/u/*`. NOT `/api/index.php*`, `/panel.html`, `/login.html` (Pages and mis-egypt serve them, §0). Add
```toml
# KV: the SAME namespace as the Pages project's SEO_KV — the Worker writes only keys "acc:*" (the SEO API stays the only writer of "seo:bundle")
[[kv_namespaces]]
binding = "SEO_KV"
id = "b321fb348f3447179c99b4380952e5ac"
```
`[vars]`: `LEGACY_ORIGIN = "https://mindful-mediumslateblue-okapi-21.hostingersite.com/egypt"` (the old PHP system, read by the bridge and
the import). Secrets comment: `+ CONFIG_SECRET (required to save gateway / mail / Anam keys: openssl rand -base64 32) · optional BREVO_API_KEY`.
D1 comment: «Empty database, in this order: schema.sql → 0004 → 0005 → 0006». `CC_ORIGINS` is never set in production.

**P-W8 `worker/schema.sql` [acc-core; integrator]** — append the body of `0006_admin_center.sql` verbatim at the end (new databases); the
file header comment lists 0006.

**P-W9 `worker/README.md` [all backend areas]** — sections «Control Center API», «Payments», «E-mail center», «Secrets» (+ CONFIG_SECRET,
BREVO_API_KEY), «Routes» (the new ones and why `/api/index.php*` is not one).

#### Tools, SEO build and tests (T, B)
**P-T1 `tools/dump-data.mjs` [site-side]** — before `for (const f of REQUIRED) run(A, f, true);` and before the same loop of pass 2 (`E`):
`run(A, "mig-overlay.js", false); runOverlay(A);` where `function runOverlay(ctx) { const f = process.env.MIG_OVERLAY_FILE ||
path.join(ROOT, "build", "overlay.js"); if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: "overlay.js",
timeout: 10000 }); }`; and `out.overlay = W.MIGOVL_DATA ? { v: W.MIGOVL_DATA.v, at: W.MIGOVL_DATA.at } : null;`. Hidden rows of hole
collections arrive as `null` in build/data.json (indices stay stable).

**P-T2 / P-T3 `worker/build-index.js` [site-side]** — before the `for (const f of ['regions', …])` loop evaluate `data/mig-overlay.js` and
the overlay file (same rule as P-T1); `forEach` already skips hidden rows; company links use `'company.html#' + (f[16] || i)` (adds → `#c-…`);
add `'videos'` to the file list and `out.n = { news, events, awards, videos, products }` (visible counts) for the panel's statistics (§3.1.2).

**P-T4 `seo/config.json` [site-side]** — `flat_pages: ["janna", "panel", "login", "admin"]`; keep `legacy_live_pages: ["panel", "login"]`
and add `"admin"` (the build uses this list for exactly two things: links stay `/panel.html`, `/login.html`, `/admin.html` and robots.txt
disallows them — both still wanted) and rewrite its `_legacy_live_pages` note to say so; `noindex_static` += `"pay"`;
`assistant.scripts`: insert `"data/mig-overlay.js", "data/overlay.js"` right after `"data/i18n.js"` and `"data/plans-live.js"` right after
`"data/plan.js"`.

**P-T5 (optional) generated SEO pages** — a deferred `<script src="/data/mig-overlay.js"></script><script src="/data/overlay.js"></script>`
plus `MIGOVL.hidePathNotice()` in seo_build's static tail, so a hidden item's static page says «المحتوى ده مش معروض حالياً» before the next
build. Skip it if it costs any Lighthouse budget; the edge `noindex` + the daily build already cover search engines.

**P-B1 `seo_build.part.py` [site-side]** — right after build/data.json is loaded, hidden rows are `None`: every loop over `oldfac`, `oldfacd`,
`oldprod`, `p2f`, `facx.list`, `real.news/events/awards/tenders/tenders_intl` skips `None` (integrator: `grep -n "enumerate(D\|in D\[" seo_build.part.py`),
and `compute_hash_maps` never maps an index whose row is `None` (the shim then falls back to the app page, which shows «لم يُعثر على …»).
**P-B2** — `compute_hash_maps` also maps the stable ids of baked adds: `c-<id>` (fac `[16]`) → the company page, `n-<id>` → the news page,
`a-<id>` → the award page, `cc-ev-<id>` → the event page, so `company.html#c-…` (links shared before the build) land on the static page.
**P-B3** — `emit_headers`: `/data/overlay.js` → `Cache-Control: public, max-age=60` (static fallback on *.pages.dev).
**P-B4** — `emit_manifest`: write `/_seo/overlay-baked.json` = `{"v": D["overlay"]["v"], "at": D["overlay"]["at"]}` (or `{"v": null}`).

**P-T6 `deploy/*` [integrator]**
* `deploy/deploy.sh production|preview`: before the build, `curl -fsS --max-time 20 https://madeinegyptgate.com/data/overlay.js -o build/overlay.js`
  (read-only GET; on failure keep the previous file and print a warning; never abort the daily build for it).
* `deploy/legacy-live.txt`: remove `/panel.html`, `/login.html` and `/data/egadm.js` (the new build ships its own identical-format egadm.js and
  pages, nothing needs the old copies); KEEP `/api/index.php*` (the old PHP API stays exactly where it is — import tool and old cookies);
  `/data/auth.js`, `/data/me.js` may stay (no new page loads them; the new build has no such files, so nothing is shadowed). Update its header.
* `deploy/stage-exclude.txt`: delete the lines `panel.html` and `login.html` (otherwise the new pages are dropped from the upload).
* `deploy/deploy.sh`: new commands `admin-release` / `admin-release-rollback`: list the zone's Workers routes; for every route bound to
  `$LEGACY_WORKER` whose path is no longer in legacy-live.txt (the specific `/panel.html`, `/login.html`, `/data/egadm.js` routes of the
  deploy-1 cutover) → confirm → `DELETE` (rollback re-creates them bound to `$LEGACY_WORKER`); never touches the catch-all routes, DNS, MX/TXT,
  or any other Worker. The route family check skips families whose path is in legacy-live.txt (`/api/index.php` is served by index.js but
  deliberately unrouted). The `worker-config` check accepts the new non-API routes `/data/overlay.js*` and `/media/u/*`.
  Both orders work: if the deploy-1 cutover has not happened yet when deploy 2 ships, `deploy.sh cutover` reads the shortened legacy-live.txt
  (mis-egypt then keeps only `/api/index.php*` + the two old scripts) and `admin-release` finds nothing to remove. The Worker and D1 are already
  live with real data (deploy 1): 0006 is purely additive and idempotent, and `deploy.sh db` must show the plan before applying it.
* `deploy/d1_migrate.py`: `ALLOWED_MIGRATIONS = ("0004", "0005", "0006")`, `DEFAULT_MIGRATIONS` += `worker/migrations/0006_admin_center.sql`
  (no ALTER statements in it, so the planner applies it whole); the deploy.sh `db` text says «schema + 0004 + 0005 + 0006».
* `deploy/smoke-test.sh`: new section «Control Center» (§11.6 smoke list).
* `deploy/README-DEPLOY.md`: «النشر الثاني» section (order of §11.7, the new secret, admin-release + rollback).

**P-T7 existing worker tests [integrator]** — `worker/test/integ-worker.test.mjs`:
* «routes» tests: allow the non-API patterns `^(www\.)?madeinegyptgate\.com\/(data\/overlay\.js\*|media\/u\/\*)$` (still refuse `index.php`,
  `panel.html`, `login.html`, `/api/seo`, catch-alls); `served` = the old list + `index`, `pay`, `plans`, `settings` (`index` = /api/index.php,
  checked to have NO route); `need` += `plans*`, `settings*`, `pay/*`, `ev/*`; the count assertion becomes `(need.length + 2) * 2`.
* «D1 launch order» tests: append `migrations/0006_admin_center.sql` to both file lists; assert it has no `ALTER TABLE` line.
* «README lists every secret»: + `CONFIG_SECRET`.
All other existing tests must pass unchanged (they are the proof that P-W2/P-W3/P-W6 changed nothing by default).

#### Site (S) and dashboard (D) — `site.py` and existing parts [site-side, admin-ui]
**P-S1 `site.py` includes and builders** (ids P-S3/P-S4 of earlier drafts are folded into P-S1 — banners — and P-S9 — home plans)
* `page()`: replace the FIRST `'<script src="data/plan.js"></script>'` of the body string with
  `'<script src="data/mig-overlay.js"></script><script src="data/overlay.js"></script><script src="data/plan.js"></script><script src="data/plans-live.js"></script>'`
  (i.e. after data/i18n.js and the MIGHAY helper, before every data file), and append `'<script src="data/settings-live.js"></script>'` right
  after `'<script src="data/seo.js"></script>'`. `_bust()` versions them like every data file.
* dashboard: `pages['dashboard'] = ('لوحة المصنع – صنع في مصر', 'rfq', css, body, js)` → `js + '<script src="data/dash-products.js"></script><script src="data/dash-company.js"></script>'`.
* execs: after `exec(open(B + 'seo-admin.part.py', …).read())` add `exec(open(B + 'pay.part.py', encoding='utf-8').read())  # pay.html → /pay/`.
  The `PAGES.pop` / `pages.pop` loops for `('panel', 'login', 'admin')` stay (those three are standalone pages now, never `page()` pages, and
  admin.part.py is never exec'd). Comment them «deploy 2: built by panel.part.py / login.part.py».
* after the page output loop and `seo_files(OUT, …)`, before `SEO_STATS = build_static_seo(OUT)`:
  `exec(open(B + 'panel.part.py', encoding='utf-8').read())  # panel.html + admin.html (redirect)` and
  `exec(open(B + 'login.part.py', encoding='utf-8').read())  # login.html`. Both write flat files into OUT, use `_bust()` for their data
  script tags, and must not call `page()`.
* `SBN_JS` (banner slider): at the start of the per-section function, before `sl=[].slice.call(st.querySelectorAll(".sbn-s"))`:
  `if(window.MIGOVL&&MIGOVL.banners)try{MIGOVL.banners(sec,k)}catch(x){}`.
* home plans include (`PLANS_JS` comes from register.part.py — covered by P-S9).
**P-S2 settings markers (`site.py` shared util bar/header/footer + the contact page in pages.part.py)** — add `data-mig-setting="<key>"`
(keys exactly as seeded in §2: `contact_email`, `support_email`, `hotline_display` + `hotline_tel`, `whatsapp_display` + `whatsapp_number`,
`address_ar` / `address_en`, `social_facebook`, `social_x`, `social_instagram`, `social_linkedin`, `social_youtube`, `operator_ar` /
`operator_en`) to the elements that print them today (e.g. the util bar `mailto:` and `wa.me` links, the footer address and social icons).
A link element carries the href key and, when the visible text differs, `data-mig-setting-text="<display key>"`. settings-live.js sets
`textContent` / `href` only on these markers (mailto:/tel:/https://wa.me/ built from the validated value, §2.2); a value `""` leaves the static
markup untouched; a social link whose value is `"-"` (panel: «إخفاء الرابط») is hidden.
**P-S5 detail resolution of added rows**
* company.part.py: after `var F = window.MIGOLDFAC || [], H = (location.hash || "").slice(1);` add
  `if (/^c-[2-9a-hjkmnp-z]{8}$/.test(H) && window.MIGOVL) { var CI = MIGOVL.idx("fac", H); H = CI >= 0 ? String(CI) : ""; }`; and where the
  logo style is built (`function lgStyle(x)`), prefer `MIGOVL.logo(x)` → `MIGOVL.bg(url)` when set; the website line uses `x[17]` when set.
* article.part.py / winner.part.py: `id = parseInt(…)` → accept `n-<rid>` / `a-<rid>` via `MIGOVL.idx("news"|"award", h)`.
* media2.part.py: `e.id = "ev" + (i + 1)` → `e.id = /^cc-ev-/.test(e.id) ? e.id : "ev" + (i + 1)`.
* products (market.part.html / company products): show `[9]` image via `MIGOVL.image(p)` when set (else the sprite), `[11]` price text when set,
  `[12]` featured for the «منتجات مميزة» strip ordering.
* offers, projects, zones, tenders, RFQs, opportunities already resolve by id/ref — no change (verified: offers `id`, projects `MIG.proj(id)`,
  tenders/rfqs `String(x[0]) === h`, opportunities `MIGOID`).
**P-S6 hole safety** — rule: code that reaches a hole collection (`MIGOLDFAC`, `MIGOLDFACD`, `MIGOLDP`, `MIGP2F`, `MIGFACX.list`, `REAL.news`,
`events`, `awards`, `tenders`, `tenders_intl`) by index or with `for (i …)` / `Array.from` / spread must skip `undefined`. A scan of the
current files found only `forEach`/`map`/`filter`/hash look-ups (all safe); the site-side Playwright test (§11.5) hides one row of every hole
collection and loads every consumer page with zero console errors — any failure there becomes a guard patch.
**P-S7 counts** — replace visible-count uses of `.length` on hole collections with `(window.MIGOVL ? MIGOVL.count("<coll>") : X.length)`:
home2.part.html (`MIGOLDP.length` ×3 → `prod`, `REAL.tenders.length` → `opp`, `REAL.tenders_intl.length` → `intl`), pages.part.py
(`REAL.tenders.length`, `REAL.tenders_intl.length`, `REAL.news.length` → `news`, `REAL.events.length` → `event`). Build-time counts
(`_fill_counts`) are correct after the daily build.
**P-S8 payment sentences** — data/janna.js `var PAYTXT = {…}` and data/bot.js `var PAY = "…"` + the gateway clause at the end of `pkgText()`:
when `window.MIGPAYREADY` is true use «الدفع أونلاين من صفحة الدفع الآمنة بعد طلب التسجيل — رابط الدفع بيوصلك على بريد الشركة، والحساب
بيتفعّل تلقائياً بعد الدفع.» / "Payment is online, on the secure payment page, after you send the registration — the link reaches the
company e-mail and the account is activated automatically after payment."; else today's text unchanged. Prices need no patch (§7.4).
**P-S9 `register.part.py`** (PLANS_JS is shared by register.html and the home page):
* after `var PROFILE_ONLY = ["profile", "تسجيل بيانات الشركة فقط", "4,000"];` add `if (window.MIGPLANS) MIGPLANS.patchCards(PLANS, PROFILE_ONLY);`
* `var ALL = PLANS.map(…).concat([["profile", "تسجيل بيانات فقط", "4,000", "بدون منتجات"]]);` → use `PROFILE_ONLY[2]` instead of `"4,000"`.
* after `var LIM = { profile: 0, basic: 30, premium: 80, partner: 200, strategic: Infinity };` add `if (window.MIGPLANS) MIGPLANS.patchLimits(LIM);`
* `var f = fee(), v = f * .14;` → `var f = fee(), v = Math.round(f * (window.MIGPLANS ? MIGPLANS.vatRate() : .14));` and the «ضريبة القيمة
  المضافة 14%» label → `MIGPLANS.vatLabel()` when present.
* done step: the payment paragraph («بوابة الدفع لسه بتتجهّز — …») switches on `window.MIGPAYREADY` («هيوصلك رابط الدفع الآمن على بريد الشركة
  خلال دقايق» + after submit the server's invoice e-mail) — the EN pairs in the same file get the matching lines.
* prefill: when `MIGAPI.token()` is set, on load call `MIGAPI.request("/me/recognize")` and fill only EMPTY fields: company → `#r-name`, manager →
  `#r-mgr`, phone → `#r-tel`, address → `#r-addr`, web → `#r-web`, activity → `#r-act`; a note «جبنا بياناتك من حسابك القديم — راجعها» when
  `known`. No unauthenticated look-up exists (the old `a=check` oracle is not reproduced).
* legal.part.py: wrap the membership price sentence in `<span data-mig-prices="legal">…</span>` (plans-live.js regenerates it).
**P-D1 `dash.part.html`** — the plug-in API for the self-service tabs:
* after `function tabOK(k) { … }` insert:
  ```js
  /* deploy 2: self-service tabs plug in here (data/dash-products.js, data/dash-company.js — ACC-CONTRACT §1.7) */
  var XT = { status: null, ext: {} };
  window.MIGDASH = {
    addTab: function (d) { if (!d || !d.key || tabOK(d.key)) return; var at = TABS.length;
      for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === d.after) { at = i + 1; break; }
      TABS.splice(at, 0, [d.key, d.icon || "•", d.ar, d.en, d.level || 0]); V[d.key] = d.view;
      if (d.need) NEEDS[d.key] = d.need; if (d.done) XT.ext[d.key] = (XT.ext[d.key] || []).concat([d.done]);
      (d.legacy || []).forEach(function (h) { LEGACY[h] = d.key; }); if (S.me) { fromHash(); render(); } },
    extend: function (key, fn) { XT.ext[key] = (XT.ext[key] || []).concat([fn]); if (S.me && S.tab === key) render(); },
    status: function (fn) { XT.status = fn; if (S.me) render(); },
    me: function () { return S.me; }, lv: function () { return lv(); }, T: T, esc: esc, api: A, ui: U, render: function () { if (S.me) render(); }
  };
  ```
* `function acctState() {` → rename to `function acctState0() {` and add
  `function acctState() { var st = acctState0(); try { if (XT.status) st = XT.status(st, S.me || {}) || st; } catch (x) {} return st; }`
* in `nav()` (and the overview header that prints `st.t`): after `esc(st.t)` append
  `(st.href ? ' <a href="' + esc(st.href) + '">' + esc(st.ht || "") + "</a>" : "")`.
* first line of `function after() {`: `(XT.ext[S.tab] || []).forEach(function (f) { try { f($("#panel"), S.me); } catch (x) {} });`
Tabs added by the site-side scripts: `products` («منتجاتي», icon 📦, after `incoming`, legacy `["products"]` — replaces today's
`products → profile` alias), `company` («ملف الشركة», 🏭, after `products`, legacy `["profile_company", "seo"]`); «باقتي» is extended,
never replaced.

#### Configuration that is not a file patch (C)
* Worker secret `CONFIG_SECRET` (owner, before saving any key in the panel); optional `BREVO_API_KEY`. Nothing else is new.
* Provider dashboards (only when the owner goes live with a gateway): webhook/return URLs of §5.3.
* Cloudflare: the KV namespace already exists; D1 0006 via `deploy.sh db`; routes via `wrangler deploy` (P-W7) and `deploy.sh admin-release`.
* NEVER: MX/SPF/DKIM/DMARC records, Email Routing, the mis-egypt script itself, anything on Hostinger.

---

## 11. Test plans and acceptance

Common to every test: no network (fetch mocked, unexpected URL = failure), no real e-mail/WhatsApp/payment/Anam/Cloudflare call, no sample data
in any product file (fixtures live in the test file or the scratch dir only), fixed clocks via the `nowMs` parameters where the code offers
them. Each builder reports the exact command and the pass/fail lines in its INTEGRATION.md.

### 11.1 acc-core — `worker/test/acc.test.mjs`
1. **Migration**: 0006 applied twice on a schema.sql database → no error; every `cc_*` table of §2 exists; seeds: 6 `cc_plans` rows with the
   §7.1 values, every `cc_settings` seed of §2; no line starting with `ALTER TABLE`.
2. **Roles (§0.5)**: no token → 401; a v2 token of a plain member → 403 `forbidden`; an ADMIN_EMAILS member with `email_verified_at` → owner,
   without it → none; `cc_staff` roles; `members.role = 'admin'` → admin; `X-Platform-Key` → platform (constant-time compare); a legacy-bridge
   session (`cc_session_meta.via = 'legacy'`) → no role even for a staff mailbox; an admin cannot add/promote an owner (403 `owner_only`); the
   last owner cannot be removed (409 `state`); `members.role` sync owner/admin → `admin`, editor → `seo`, support → `user`.
3. **Permission matrix**: table-driven — every `/api/admin/cc/*` route × {owner, admin, editor, support} → allowed exactly as §0.5/§1.4
   (403 `{code:"forbidden", need}` otherwise); the routes delegated to content/payments/email are checked with a fake `CC` that records calls.
4. **Audit (§0.6)**: every write route leaves one `cc_audit` row with actor, action, entity, before/after; keys matching the redaction regex are
   `"•••"`; if the audit insert fails (table dropped in the test) the write is refused (500) and nothing changed.
5. **HTTP**: CORS echo only for the site origins / `CC_ORIGINS`; OPTIONS preflight; `Cache-Control: no-store`, `nosniff`; 64 KB body limit; 121st
   write in a minute → 429 `rate_limited`.
6. **Stats**: empty database → zeros and `null`s only (no invented number); with fixtures the field names equal the live `admin_stats` ones
   and every value is the count of the fixtures; `since` = first `cc_pv_day.day`.
7. **Members**: list/search/filter/paging; `setPlan` = admin.js semantics (activated_at rules; a request that waits as `in_progress` is
   routed to the member after activation to basic — real inquiries tables); suspend/unsuspend (sessions revoked, inbox paused, status line);
   delete is refused (owner-only «أرشفة»).
8. **Customers**: computed from inquiries; `cid` stable for the same mailbox; contact fields only with `customers.contacts`.
9. **Orders**: filters incl. the `needs_team` pseudo-status (= deploy 1 `needsTeam`); detail shape equal to `GET /api/admin/inquiries/:ref`;
   team reply → deploy 1 `teamReply` (event `team_reply` visible on track, mail through the mocked Resend URL, audit `order.team_reply`);
   close → buyer told; candidates refresh with no search key → directory only, `web.provider = ""`; legacy contacts only with `legacy.contacts`.
10. **Manual RFQ**: creates a real inquiry through `handleInquiries` with the internal symbol (no Turnstile even with `TURNSTILE_SECRET` set —
    asserted in the integration run, after P-W5); `publish:true` calls `CC.content.upsert` with the private fields kept out of `fields`.
11. **Approvals**: member product/company submissions → pending → approve (content upsert on the fake CC, e-mail `product_approved`) / reject
    (reason required, e-mail `product_rejected`); one open company request at a time.
12. **Plans**: `PUT /api/admin/cc/plans` → `applyPlans` mutates `PLAN_SCOPE`, `PLAN_NAME`, `PLAN_MARKETS`, `ELIGIBLE` in place (same object
    identity asserted) and calls `setPlanCaps` when present; with no `cc_plans` rows every `planCan` answer equals today's rule for all 6 plans
    × 8 caps; persona sync: dry run returns the diff; real run = mocked `GET` then `PUT https://api.anam.ai/v1/personas/<id>` with ONLY
    `systemPrompt`, only the plans section changed (rest byte-identical); section missing → `failed`, no PUT; unchanged → no PUT.
13. **Settings**: public vs private keys; validation (https URLs, e-mail, phone digits, `-` for hidden social links); private keys never in
    `/api/settings` nor in the overlay.
14. **Staff**: add (invite e-mail `staff_added`), change role, remove; owner-only rules.
15. **Legacy bridge (§3.1.13)** with a mocked `LEGACY_ORIGIN`: success (login → me → logout; 7-day session; `cc_session_meta.via = 'legacy'`;
    `legacy_login_notice` sent); staff/ADMIN_EMAILS mailbox → 403 `use_email_code` with NO fetch made; wrong password → 401 + failure counter →
    429 `locked`; e-mail mismatch → 409; network error/5xx → 503 `legacy_off`; the stop link revokes sessions and blocks the bridge; the
    password string appears nowhere in D1 (scan every table) or in captured `console.*` output.
16. **Old API proxy**: method, query, body and cookies forwarded unchanged to `LEGACY_ORIGIN/api/index.php`; response headers kept +
    `Cache-Control: no-store`; `LEGACY_ORIGIN = "off"` → 503 JSON.
17. **Import (§1.5)** with a mocked old API (every `admin_list` kind, paging, `plans_get`, `pay_get`, `mail_get`, `document`): every mapping row
    of §1.5 lands where specified; re-run = no duplicates (keys); `overwrite:false` keeps local edits; contacts land only in
    `cc_legacy_companies` / `cc_legacy_messages`; public content goes to `CC.content` as drafts unless `publish`; payment/mail secrets from the
    old system are NOT imported (only non-secret fields; the report says «المفاتيح لازم تتدخل من جديد»); the old session cookie is not stored.
18. **Analytics**: `POST /api/ev/pv` counting rules (one unique per hashed visitor/day/page, bots ignored, 204), no raw IP/UA/referrer stored.
19. **Self-service**: `/api/me/products` limits from `planLimit` (basic: the 31st product → 403 `limit`), images per product, contacts in text →
    422 `invalid_contact`, edit of a published product keeps the published version until approval; `/api/me/company` claim/create/edit; legacy
    session → 403 for `/api/me/recognize`; recognize returns only the same mailbox's legacy company.
20. **Public**: `/api/plans` (sellable plans, no secrets, `vat_bp`), `/api/settings` (public keys only); rate limits; CORS.
21. **Cron**: purges (`cc_pv_seen` > 2 days, `cc_audit` > 730 days, expired legacy-session meta), persona retry only when auto-sync failed.

### 11.2 content — `worker/test/content.test.mjs`
1. For EACH collection of §4.4 (fac, facx, prod, tend, rfq, offer, zone, news, event, award, opp, intl, video, proj, banner, notice, cats):
   base edit + hide (+ add where allowed) using the §4.4 example row as the base row → stored `cc_content`, validation errors exactly as
   specified (`required`, enums, `invalid_url`, `invalid_contact`, `source_required` on publish, video `verified_oembed` required).
2. **Compile/publish**: deterministic JSON for the same rows; `v` strictly increasing; the body starts with `window.MIGOVL_DATA=` and parses in
   `vm`; 512 KiB limit → 413 `too_large` and nothing published; KV `acc:overlay` + `acc:overlay:prev` written; KV missing → D1 fallback,
   status `kv:false`; `overlay.enabled = 0` → no-op body.
3. **serveOverlay**: always 200 `application/javascript; charset=utf-8`, `Cache-Control: public, max-age=60`, `nosniff`; memo → KV → D1 →
   no-op order; never throws (DB missing).
4. **XSS**: every text field stored with `<img src=x onerror=alert(1)>`, `"><script>alert(1)</script>`, `'-alert(1)-'`, backticks and
   `</script>` → the compiled overlay contains no raw `<`, `>`, `"`, `'`, `` ` `` inside values and no `</script`; URL fields with
   `javascript:`, `data:`, `//evil`, spaces or quotes → 422 `invalid_url`.
5. **Ids & counters**: adds get the §4.4 ids (`c-…`, `p-…`, `n-…`, `a-…`, `cc-ev-…`, `cc-of-…`, `cc-zone-…`, `cc-p<n>`, `TEN-<yyyy>-C<seq>`,
   rfq `C1001+`, `cc-tnd-7xxxxx`); two publishes in parallel never reuse a counter value.
6. **Edge actions (§4.10)**: hide of a row with a static page → mocked `GET` + `PATCH https://<site>/api/seo/page` carrying the admin's own
   `Authorization`; unhide restores the remembered value; delete → `POST /api/seo/redirects` 301 to the hub; failure → `cc_edge` pending with
   retry; the module never writes `seo:bundle` (KV fake asserts the key is untouched).
7. **Media (§4.11)**: JPEG/PNG/WebP accepted by magic bytes (not by name/type header); SVG, HTML, GIF-with-script, polyglots refused 415; > 5 MB
   → 413; dimension rules per purpose; JPEG APP1/EXIF and PNG text chunks stripped (bytes compared); R2 key `u/<yyyy>/<id>.<ext>`; public
   `serveMedia` with long cache; draft preview only with a valid signature; orphans older than 7 days removed by `contentCron`.
8. **Status / needs rebuild** with `baked_v` (null, older, equal); **locks**: a second editor → 409 `locked` until expiry or release.

### 11.3 payments — `worker/test/payments.test.mjs`
1. **crypto.js**: seal/unseal round trip; wrong name (AAD) or tampered ciphertext fails; missing `CONFIG_SECRET` → 503
   `config_secret_missing` when a secret is sent; `GET /api/admin/cc/pay/config` never contains a secret (JSON scanned for each test secret),
   only `{set, tail, set_at, readable}`.
2. **Invoices**: a signup inquiry with a plan → `onInquiryCreated` issues `INV-<yyyy>-<6 digits>` with net/VAT/total from `cc_plans` (price
   × 100, `round(net × vat_bp / 10000)`); twice → one invoice; a plan without a price → no invoice and a note; member linked by mailbox.
3. **Adapters with mocked HTTP** — request URL, headers and body exactly as §5.2 for Paymob (intention, `Authorization: Token …`, amount in
   piasters, integration ids, `special_reference` = invoice no, unified-checkout redirect), N-Genius (access token, `PURCHASE` order,
   `_links.payment.href`), PayTabs (`/payment/request`, server-key header, `cart_id`, callback/return URLs); manual → instructions, no redirect.
4. **Webhooks/returns**: Paymob HMAC-SHA512 over the 20 fields (valid → paid; invalid → 401, no change); N-Genius state taken only from the
   server-side re-query; PayTabs `Signature` HMAC-SHA256 of the raw body + return-form signature; the same event twice → one
   `cc_pay_events` row and ONE activation (`CC.acc.setPlan` called once); amount or currency mismatch → `mismatch`, no activation.
5. **Readiness**: test mode or missing fields → `gateway.ready = false` on `/api/pay/invoice` (except `test=1` invoices in Sandbox); checkout
   on a not-ready gateway → 503 `gateway_not_ready`; checkout rate limit 10/hour per invoice.
6. **Cron**: renewal invoices/reminders at 30 and 7 days exactly once; payment links sent once when the gateway becomes ready; `pending`
   payments re-queried after 10 min.
7. No endpoint accepts card fields (a body with `card_number`/`cvv` → 400 and nothing stored).

### 11.4 email — `worker/test/email-center.test.mjs`
1. `deliver()` → the Resend request (URL, headers incl. `Idempotency-Key`, `JSON.stringify` body) is byte-identical to today's advisor.js
   request for a message without attachments (build both and compare); Brevo body; `SEND_EMAIL` binding call and provider name `cloudflare`;
   provider order (Control Center config → `RESEND_API_KEY` → binding → `email not configured`); 24 h dedupe by `msg_id`; one `cc_mail_log` row
   per attempt (masked + hashed address, 6-digit codes masked in the subject, no body).
2. `prepareMail()`: no override → the same object; subject/intro/outro overrides with vars; an optional template switched off → `__skip`;
   a required one → `PUT` 400 `required_template`; unknown `{{var}}` → 422.
3. `templateKeyOf()` for every registry prefix of §6.1; the completeness test: every `id: "<prefix>` / ``id: `<prefix>`` literal in
   `worker/src/*.js` has a registry row.
4. Preview with `‹var›` placeholders; test send «[اختبار] / [Test]» to the typed address, 10/hour; `mailReady()` / `attachOk()` truth table;
   status check = mocked read-only GET (never a POST).

### 11.5 Frontend — admin-ui and site-side (Playwright, mocked API, real built pages)
**admin-ui** (harness `…/acc/ui/`, screenshots `…/acc/ui/shots/<role>-<lang>-<w>-<section>.png`):
1. Build panel.html, admin.html, login.html with the harness; `admin.html` redirects to `panel.html` (hash kept).
2. For roles owner, admin, editor, support, signed-in non-staff (lock box), signed-out (lock card) × AR/EN × 1366×800 and 390×844: every nav
   item opens; lists show loading → rows → paging; search/filters change the request query; detail and edit forms show field errors from
   422 responses; destructive actions ask for confirmation; empty states show the §1.3 texts; API 503/offline → honest error card, no crash.
   Screenshots: every section for owner AR desktop and AR mobile; home + one write section for every role and EN.
3. Nav groups, labels and order equal the live panel (`docs/janna/legacy-live/panel.html`) for the live items (automated text comparison) and
   side-by-side screenshots of home, users, plans, payments, mail.
4. Badges come only from `/api/admin/cc/badges` (no client-side counting).
5. Import tool against a mocked OLD PHP API on the same origin (`api/index.php?a=login|admin_list|plans_get|pay_get|mail_get|document`):
   happy path, wrong password, network error, partial failure → the report and the retry.
6. login.html: e-mail code flow (mocked `/api/auth/request|verify`), «حساب قديم؟» with mocked `/api/auth/legacy` (ok, invalid, `use_email_code`,
   `locked`), redirects (staff → panel.html, member → dashboard.html).
7. XSS probe: the mocked API returns `<img src=x onerror="window.__xss=1">` and `"><svg onload=window.__xss=1>` in every string field of every
   section → after visiting all sections `window.__xss` is undefined.
8. Zero console errors and zero page errors in every run (`page.on("console")` type error, `page.on("pageerror")`); no request to any host
   other than the mocked ones and Google Fonts; keyboard: nav and dialogs reachable, Esc closes, focus returns.
**site-side** (harness `…/acc/site/`):
1. Build the real site with a test overlay file (fixture in scratch, §4.2 format) holding, for EVERY collection, one edit, one hide and one
   add (where adds exist), plus a banner, a notice, a category, a plan price change and a settings change.
2. Pages: home; factories search (async oldfac.js — the hidden company is absent on first render); company detail by index, by `#c-…`
   and a hidden one («لم يُعثر على المنشأة»); market + product image/price/featured; tenders search + `#<ref>`; RFQ search; offers +
   offer detail; industrial zones; news + `article.html#n-…`; events + `event.html#cc-ev-…`; awards + `winner.html#a-…`; opportunities;
   international; projects + project detail; videos; register (cards, summary VAT, limits); legal membership sentence; contact page;
   dashboard tabs. Each: edits visible, hidden items gone, adds present, counts right (P-S7), AR and EN (EN text of edits/adds via `tr`),
   1366×800 and 390×844, zero console errors.
3. Without the overlay (static no-op file) the key pages' DOM equals a baseline build (no change for visitors).
4. Hostile strings written raw into the fixture (bypassing the server) are neutralised by the applier — no script runs.
5. plans-live: the new price shows on register, home, the summary VAT, Janna (`plansList()`/`planPriceTxt()` output) and the bot answer;
   a products-limit change reaches register `LIM` and the «منتجاتي» counter; `MIGPAYREADY` true/false switches the payment sentences.
6. settings-live: a new WhatsApp number updates the util bar link and the contact page; `-` hides a social link; `""` changes nothing.
7. Self-service with mocked `/api/me/*`: «منتجاتي» (states, add/edit validation, image type/size errors, limit reached, locked plan, no linked
   company), «ملف الشركة» (search, claim, create, edit request, pending, rejected + reason), «باقتي» invoices, the status line variants
   (pending + invoice link, suspended, active, plan ended).
8. pay.html states 1–6 with mocked `/api/pay/*`; `location.assign` is captured (no navigation to a provider).

### 11.6 Integration run (integrator, after §10.3)
1. `cd worker && npm test` → every existing test file and the four new ones pass.
2. `python3 site.py` → `site/panel.html`, `site/admin.html`, `site/login.html` (flat) and `/pay/`; every `page()` page loads
   `mig-overlay.js` + `overlay.js` before `plan.js` and `plans-live.js` right after it (grep the built HTML); the dashboard loads the two
   dash scripts; `build_static_seo` and `deploy/stage.py` pass with the new legacy-live.txt / stage-exclude.txt.
3. `npx wrangler deploy --dry-run --outdir <scratch>` bundles (no upload); bundle size reported.
4. Local end-to-end (`worker/test/integration.mjs` pattern: `wrangler dev --local` + local D1 with schema.sql incl. 0006) and the smoke list
   below against localhost.
5. **Smoke list** (also the new section of deploy/smoke-test.sh for production later): `/panel.html` 200 with `<meta name="mig-acc"
   content="1">` and noindex; `/admin.html` → panel.html; `/login.html` 200 with the code form and «حساب قديم؟»; `/api/admin/cc/whoami`
   without a token → 401 JSON; `/api/plans` 200, the 5 sellable plans with today's prices; `/api/settings` 200 without private keys;
   `/data/overlay.js` 200 JavaScript, `max-age=60`; `/media/u/none.jpg` 404; `/api/pay/invoice?t=bad` 404; `/pay/` 200 noindex;
   `POST /api/ev/pv` 204; `/api/index.php?a=me` still answered by the old system exactly as before.

### 11.7 Go-live order (README-DEPLOY «النشر الثاني»; run later by the owner/integrator — never by a builder)
1. `npx wrangler secret put CONFIG_SECRET` (owner). 2. `deploy.sh db` (0006). 3. `deploy.sh worker` (code + P-W7 routes) → health.
4. `deploy.sh production` (Pages with panel/login/pay; overlay pulled). 5. `deploy.sh admin-release` (mis-egypt's specific panel/login/egadm
routes removed) → smoke list. 6. The owner signs in at login.html with the e-mail code (ADMIN_EMAILS → owner), runs «استيراد من النظام
القديم», reviews and publishes. Rollback: `deploy.sh admin-release-rollback` brings the old panel back in seconds; D1 data stays.

### 11.8 Acceptance checklist — admin dashboard (each item in AR and EN, at 1366×800 and 390×844, zero console errors)
- [ ] `panel.html` opens at the same URL with the live look; every live nav group/item is there with the same label and order; the new items
      sit inside the same navigation; `admin.html` lands on it.
- [ ] Signed out → lock card «ادخل بكود على الإيميل»; a non-staff member → lock box; owner/admin/editor/support see exactly their sections
      and actions (§1.4); a legacy-password session never gets admin access.
- [ ] «الرئيسية»: KPIs, 30-day chart, top pages, sources, members by plan, latest sign-ups — all from real data; empty states honest.
- [ ] Users/members/customers/companies: search, filter, paging, detail, plan change (activates immediately, invoice/link logic), suspend,
      verification badge only by explicit action; imported contacts visible to admins only.
- [ ] Plans matrix: edit prices/limits/markets/switches → register.html, home, Janna, bot and dashboard reflect it within ~2 minutes;
      persona sync shows the diff and changes only the plans section.
- [ ] Approvals: member products and company changes approve/reject with reasons; the member gets the e-mail; approved items appear.
- [ ] Invoices & payments: issue, resend link, void, manual mark-paid (activation), CSV; gateway not ready → honest state everywhere.
- [ ] Every content section (tenders, RFQs, products, store, awards, projects, procurement, events, banners, zones, news, videos, notices,
      directory): add, edit, hide, delete with confirmation; publish → visible on the site; hidden items gone; «محتاج إعادة بناء» list.
- [ ] Media: upload with validation errors in plain words; images appear on the public pages.
- [ ] Messages & requests: kinds/tabs, needs-team badge, detail timeline, «إحنا اللي هنرد» (e-mail; WhatsApp falls back to e-mail), close,
      candidates with the «محدش اتبعتله حاجة» banner, legacy messages tab, manual RFQ, CSV.
- [ ] WhatsApp and Bassem monitoring read-only and honest (dry-run shown).
- [ ] SEO pages/keywords/redirects work through the existing SEO API; link to seo-admin.html.
- [ ] Payment gateway settings: N-Genius / Paymob / PayTabs / manual; secrets masked after save, never shown again; test mode never public.
- [ ] E-mail center: sender, templates (on/off, overrides, preview), test send, delivery log, provider status — never touching DNS/MX.
- [ ] Settings, staff (roles, invite), audit log (who/what/before/after, filters), reports/CSV.
- [ ] Import from the old system (owner): runs, reports, re-runs without duplicates; nothing deleted on Hostinger.
- [ ] XSS probe passes in every section; every write appears in the audit log.

### 11.9 Acceptance checklist — customer dashboard and public flows (AR and EN, desktop + mobile, zero console errors)
- [ ] login.html: e-mail code sign-in; «حساب قديم؟ ادخل بالباسورد بتاعك» signs an old member in (security e-mail sent; «مش انت؟» link works);
      staff are told to use the e-mail code.
- [ ] dashboard.html keeps every existing tab and hash link (incl. the deploy-1 `#lt=` login links and `#incoming=<ref>`); the status line
      shows «⏳ بانتظار إتمام الاشتراك» / «✓ حساب نشط» (and the suspended/ended variants) correctly.
- [ ] «منتجاتي»: add/edit/hide products within the plan limit, upload an image, see the review state and the reason of a rejection; the
      approved product appears in the market with its image.
- [ ] «ملف الشركة»: find and claim the company or ask to add it; edit request; approved changes appear on the company page; personal
      phones/e-mails are refused with the explanation.
- [ ] «باقتي»: invoices with «ادفع الآن»; renew/upgrade creates an invoice; honest «بوابة الدفع لسه بتتجهّز» while not live.
- [ ] register.html: prices, VAT and limits from the matrix; a signed-in old member gets the pre-filled form; the signup creates the invoice
      e-mail automatically (no human step).
- [ ] pay.html: every state (invalid link, ready, manual, not ready, return polling paid/failed/timeout, paid/void/expired).
- [ ] Public pages: admin edits/adds/hides visible within ~2 minutes, detail links of added items work, no stored XSS, contacts of
      non-registered factories never shown, unverified things hidden not labelled; English pages show the English texts.
- [ ] Registered factories (basic+) still receive matching requests automatically; non-registered directory factories are never contacted.

---

*End of contract. Changes after this point go through the integrator (a dated «Amendments» list appended here), never through a builder.*

---

## 12. ADDENDUM — Team dashboards (owner request, 2026-11-18 ~10:30 UTC). Binding for every builder.

Owner, verbatim: «عايزك تعمل داش بورد منفصله لتيم ال SEO الي شغالين مانوال وغاير داش بورد منفصله لتيم الداتا عندي اللي ممكن عميل ييجي للمقر يبقي عايز ينزل طلبيه او نسجله مانوال او نضيف مشروع او مناقصه ودول ٢ داش بورد بسيطين لتيمات منفرده غير الداش الرئيسية بتاعت الأدمن وداش بورد العملاء».

### 12.1 Roles (acc-core)
- Add two staff roles next to owner / admin / editor / support: **`seo`** and **`data`**. Owners and admins add or remove team members in panel.html → «الصلاحيات والفريق» (e-mail + role). Team members sign in with the normal e-mail code; the session carries the role. Every write is audit-logged with the team member's e-mail.
- **`seo`** can only use the SEO tools. These are the existing SEO layer endpoints /api/seo/* (page overrides: title, description, keywords, canonical, robots, OG, H1, intro; keyword tracking; 301 redirects; sitemap view; IndexNow ping; page checks) plus a read-only page list. It has NO access to members, customers, orders, payments, settings, admins, content or e-mail.
- **`data`** can only use the front-desk actions in 12.3 and its own entries list. It has NO access to payments, settings, admins, SEO or e-mail, and no plan activation and no deleting others' data. It sees only the entries it created.
- owner/admin can do everything the two roles can do.
- Integration patch: the /api/seo/* auth in functions/** must accept role `seo` as well as admin/owner, using the same v2 token check. Write the exact patch in the INTEGRATION notes; functions/** is not yours to edit.

### 12.2 Pages (new builder "team-ui"; new files only)
- **`${P}/team-seo.part.py` → site/seo-team.html** («لوحة فريق الـ SEO»). A deliberately SIMPLE Arabic-first (+EN) dashboard with big clear tabs:
  - الصفحات: search, see a page's current title/description, edit overrides with a live Google preview and length counters
  - الكلمات المفتاحية
  - التحويلات 301
  - الفحص: pages with missing/long titles or descriptions, from seo-manifest.json
  - الأرشفة: sitemap links + IndexNow button
  - Reuse the SEO API exactly as seo-admin.html does; read seo-admin.part.py, never edit it.
- **`${P}/team-data.part.py` → site/data-desk.html** («لوحة فريق الداتا — مكتب الاستقبال»). A deliberately SIMPLE, big-button, mobile/tablet-friendly page:
  - (a) «طلبية لعميل في المقر»
  - (b) «تسجيل عضو يدوي»
  - (c) «إضافة مشروع»
  - (d) «إضافة مناقصة»
  - (e) «إضافة طلب عرض سعر (RFQ)»
  - (f) «إدخالاتي»: the team member's own entries with status, ref and a link
  - Forms validate required fields, show the REAL server result (ref, routed count, status) and never fake success. Offline → an honest message.
- Both pages are noindex, out of sitemaps, show an honest lock box to anyone without the role, and have a sign-in with the e-mail code via window.MIGAPI.

### 12.3 Front-desk endpoints (acc-core; role data|admin|owner)
- **`POST /api/team/desk/inquiry`**:
  - Body: `{buyer:{name, company, phone, email?, governorate?, type?}, product, quantity, unit?, details?, deadline?, target_company_ref?}`.
  - Creates a normal inquiry with source "desk" and `created_by` = the team member, through the SAME code path as POST /api/inquiries, so it is auto-routed to matching registered members. The no-match flow applies (needs_team).
  - The buyer receives the receipt e-mail if an e-mail address was given.
  - Returns `{ok, ref, status, routed}`.
- **`POST /api/team/desk/member`**:
  - Body: `{company, contact_name, title?, email, phone, sector, governorate, products?, requested_plan}`.
  - Creates or updates a member with status "pending" and the requested plan stored as a request. Activation and plan changes stay admin-only; the gateway is still being set up, so the invoice flow is honest.
  - Sends the welcome / sign-in e-mail.
  - Returns `{ok, member_id, status}`.
  - Duplicate e-mail → 409 with the existing member's public-safe summary.
- **`POST /api/team/desk/content`**:
  - Body: `{collection: "tenders"|"projects"|"rfqs", item:{…same fields as the overlay collection…}, source_url?}`.
  - Published immediately through the content overlay WHEN a source_url / official document is given. Otherwise it is saved as a draft for admin approval in panel.html.
  - Returns `{ok, id, state:"published"|"draft"}`.
  - Uses the content module's validation (content.js). acc-core calls content.js exports; coordinate the function names through INTEGRATION notes.
- **`GET /api/team/desk/mine?kind=&page=`** → the caller's own entries across the three kinds, with status.
- Rate limits and audit log on all four endpoints. Only role data|admin|owner; seo → 403; members/visitors → 401/403.

### 12.4 Tests
- Unit tests for the role matrix: seo cannot reach /api/team/desk/*, /api/admin/cc/*; data cannot reach /api/seo/* writes, /api/admin/cc/* (except its own GET mine); both 401 when signed out.
- Playwright tests for both pages, AR/EN, 1366x800 and 768x1024 (tablet at the desk) and 390x844, mocked API, zero console errors.

### 12.5 «🌐 فرص من الإنترنت» — web leads on the data desk (2026-11-20, migration `0012_web_leads.sql`)
What Janna's and Bassem's web search and opportunity hunt return from a provider (worker/README.md "Web search and the opportunity hunt")
is kept in `web_leads` for the data team. NEVER public: no page, no overlay, no persona tool reads it. Roles data | admin | owner (as 12.3),
300 reads + writes an hour; the owner switch `web_leads` (src/flags.js) stops the recording (the desk list stays readable).
- **`GET /api/team/desk/leads?status=new|accepted|rejected|all&type=&market=&q=&sort=recent|seen&page=&limit≤100`** (default `new`, 50 a
  page) → `{items:[{id, url, title, site, snippet, type, type_ar, type_en, official, aggregator, query, product, market, governorate,
  persona, personas, via, lang, date, first_seen, last_seen, seen_count, status, status_ar, status_en, reason, reason_ar, reason_en,
  reviewed_by, reviewed_at, note, content_id}], total, page, limit, counts:{new, accepted, rejected}, by_type, status, sort}`. Types:
  `tender`, `rfq`, `buyer`, `buyer_list`, `project`, `news`, `other` (no CHECK in SQL: the classifier may grow a type without a table
  rebuild). Without the table: `{items:[], total:0, …, off:true, hint}` (200).
- **`PUT /api/team/desk/leads/:id`** `{status: accepted|rejected|new, reason?: off_topic|old|duplicate|not_credible|advert, note? ≤ 300}` →
  `{ok, item}`. The UPDATE and its `cc_audit` row (`leads.accept` / `leads.reject` / `leads.reopen`; before/after = status and reason
  only, never the snippet or the note's text) in ONE batch · 400 `invalid_status` / `invalid_reason` / `invalid_content` · 404 · 503
  `leads_off`. A rejection with `old` / `duplicate` / `not_credible` / `advert` keeps the link out of every later hunt; `off_topic` (or no
  reason) only for that product.
- **`POST /api/team/desk/content`** accepts `lead_id`: after the content is created, the lead becomes `accepted` with `content_id`
  (audit `leads.convert`), best effort — the answer adds `lead_linked: true|false`, and a failed link never undoes the content. The
  desk page fills the form from an accepted tender / RFQ / project (title; the link as `source_url` only when it is an official portal, so
  anything else is saved as a draft for the admins, as 12.3 says).
- A lead is recorded only from a FRESH provider answer (a cached one is not counted again), one sighting at most per clock hour, and keeps
  the team's decision when it is found again; a rejected link is read for every candidate of a hunt, however many there are. Tests:
  `worker/test/web-leads.test.mjs`, `worker/test/web-hunt.test.mjs`.

---

## 13. AMENDMENTS (dated; the deploy-2 integration, 2026-11-18 — these override the sections they name)
1. **Roles (§0.5, §12.1):** `seo` and `data` are real `cc_staff` roles (0006 CHECK allows them); they never reach `/api/admin/cc/*` (403 with
   `team_page`). The Pages SEO API (`functions/_lib/seo-auth.js`) resolves the role from an active `cc_staff` row (owner/admin → admin,
   seo/editor → seo, a disabled row → none) and refuses old-password-bridge sessions (403 `use_email_code`).
2. **URLs (§1.1, §1.6; FRONTEND.md):** the Control Center is `/admin/` («لوحة التحكم»), THE sign-in page is `/login/` (e-mail code + the
   «حساب قديم؟» card + staff routing by `GET /api/me` `user.staff_role`). `/panel.html`, `/login.html`, `/api/index.php*`, `/data/auth.js`,
   `/data/me.js`, `/data/egadm.js` stay on the owner's old system (mis-egypt, deploy/legacy-live.txt); no mis-egypt route changes hands, and
   `deploy.sh admin-release` was dropped. E-mails link `login/`; `/api/team/whoami` `team_page` = `admin/` | `seo-team/` | `data-desk/`.
3. **Old-password bridge (§3.1.13):** `GET /api/auth/legacy/health` says `enabled:true` only when `LEGACY_ORIGIN` (https, not "off"), the session
   secret, an e-mail provider (the security notice) and the 0006 tables are all present; `POST` answers 503 `legacy_off` otherwise.
4. **Service keys «مفاتيح الخدمات» (owner decision):** new owner-only API `/api/admin/cc/keys*` (permission `keys.manage` ∈ OWNER_ONLY):
   write-only slots `respondio.token`, `anam.api_key` (sealed, §0.7) and the setting `respondio.channel`; server-side read-only tests
   (respond.io `GET /v2/space/channel` with the channel listed; Anam `GET /v1/personas?perPage=1`); one test message to the platform's own
   WhatsApp number; the switch «تشغيل إرسال واتساب الحقيقي». Settings `wa.*` / `respondio.*` / `keys.*` (scope system) are reserved — never custom.
   Key precedence everywhere (janna-session, meetings, persona sync, whatsapp): the Worker secret wins (`ANAM_API_KEY`, `RESPONDIO_TOKEN`), else
   the panel slot (this replaces §0.7's "slot first" for `anam.api_key`). The channel: the panel value, else `RESPONDIO_CHANNEL_ID`, else 580384.
5. **WhatsApp (§0.1, wrangler.toml):** `WA_DRY_RUN = "0"` in production; real sending = a token AND `WA_DRY_RUN` not "1" AND the panel switch
   on after a passed token test (fail-closed on anything missing or unreadable). The switch can only be turned on after the token test, a sent
   test message and the owner's confirmation; a new token or channel turns it off. `WA_DRY_RUN = "1"` stays the hard kill switch. The Meta
   Cloud API reminders of meetings.js obey the same switch.
6. **Plans (§7):** the Bassem live-call gate (`/api/janna/session`) uses `planCan(m, "bassem")` at call time (no load-time snapshot); the Bassem
   monitor's `days_left` = Cairo days until `plan_expires` (null without an end date).
7. **Review fixes (2026-11-18, findings F1–F10, L3, L4, PAY-H1–H3) — these override §0.5, §3.1, §5.4 and §8.4 where they differ:**
   * **Payee text (F1):** `manual_pay_ar/en` (the bank / InstaPay instructions) are written only with `pay.config` (owner): `PUT /settings`
     answers 403 `owner_only` {`need:"pay.config"`, `section:"payments"`} for anyone else; the panel shows that card read-only with a link to
     «بوابة الدفع»; every change (either path) e-mails the owners (ADMIN_EMAILS) the old and the new text. The WhatsApp go-live test always goes
     to the fixed own number 201279188996 — never to the editable public `whatsapp_number`.
   * **Owner / admin accounts (F2):** plan, status, extend, invite, sessions, profile (`/members/:id…`) and re-adding through `POST /staff` on an
     account that is a bootstrap owner, an owner/admin `cc_staff` row (also disabled) or `members.role = 'admin'` → 403 `owner_only` unless the
     caller is the owner; a non-owner cannot create an account for an ADMIN_EMAILS address.
   * **Invariants inside the write (F4):** the plan's product cap (create; a rejected product edited / submitted back into the count), one
     pending company request, and ONE open non-test invoice per member / mailbox (counter + invoice in one conditional transaction: a refused
     insert takes no number) — a parallel second request gets 429 `limit` / 409 `open_request` / 409 `open_invoice`.
   * **Listings (F5):** a claim is approved only while no other account holds the listing (409 `claimed`, checked again inside the write); an
     edit only while the member still holds it (409 `state`); a create only for an unlinked account.
   * **Signups (F6, R2):** an invoice from an anonymous signup is NOT bound to the mailbox's account and changes no status — it is bound only
     when the account holder sent it signed in (user_id + a confirmed mailbox), else linkLoose attaches it after an e-mail-code sign-in. A
     second signup while an invoice is open for that mailbox issues no second invoice (buyer-visible note). The renewal cron reuses an open
     invoice only for the member's own plan; an open SIGNUP invoice for another plan is voided and replaced by the renewal.
   * **Replacing an open invoice (R3):** `POST /api/me/invoices {plan, replace:true}` voids the open invoice first when it is not the team's
     (source ≠ admin) and has no online payment in progress; without `replace` the 409 `open_invoice` carries `replaceable`. «باقتي» asks first.
   * **Prices (PAY-H1, the public Terms §5 «احتساب الفرق نسبياً للمدة المتبقية» — replaces §5.4 «No proration»):** `planQuote` — new: full
     price, a period from the payment · renewal (same plan): full price, the period continues from the current end · upgrade with ≥ 1 day left:
     `round(P_new×d/D_new) − round(P_cur×d/D_cur)` piasters for the d Cairo days left, `period_days = d`, `period_end` = the current end (kept at
     activation) · otherwise a full new period. `GET /api/me/invoices/quote?plan=` → `{quote:{kind, prorated, days_left, net_minor, vat_minor,
     total_minor, until, …}, open_invoice:{…, replaceable}|null}`; «باقتي» shows the amount and the end date before the invoice is issued.
   * **Lower plan (PAY-H2):** never invoiced while a higher plan is in force (member 409 `plan_lower` {`available_from`}; signup: no invoice +
     note). A lower-plan invoice paid anyway (e.g. issued by the team) keeps the ledger `activated:skip_higher`, sends the payer
     `payment_review` (new ★ template) + a bell, alerts the team, and paymentsCron applies it once the higher plan has ended.
   * **Suspension (PAY-H3):** a suspended account gets no quote / invoice (403 `suspended`) and no signup invoice; a payment that arrives anyway
     never lifts the suspension (`activated:skip_suspended`, review receipt, team alert) and is applied by the cron after the owner / admin
     reactivates the account. The old-system plan rule never grants a plan to a suspended account.
   * **Member publishes (F7):** every «منتجاتي» write shares 60 / hour / member; a member's hide / show / delete is saved at once and published
     right away only within 6 / member / hour and 60 in total (and while the publish lock is free) — else contentCron ships every waiting
     member change in ONE publish (≤ 15 min). Overlay versions by `member:<id>` / `system:member` never push the newest 20 team versions out.
   * **Old-password bridge (F8, overrides §3.1.13 and amendment 3):** refused (403 `use_email_code`, before the old server is called) when any
     account of the mailbox has `email_verified_at`, or the existing account did not come from the old system (`legacy_id`, or source `import`
     / `legacy_login`); Turnstile required when `TURNSTILE_SECRET` is set; the 7-day session id starts with `lg` and has the scope of an
     e-mailed login link (read, pay, answer routed requests; no Bassem, profile / prefs / products / company / invoice creation, CC or team).
   * **Routing (F9):** every index.js family is anchored at the start of the path (`^/api/admin/cc(/|$)`, …); so are the path strippers.
   * **Statistics (F10):** `GET /stats` carries `recent[].email` only with `members.read` and `unpaid` / `revenue_month_minor` only with `pay.read`.
   * **Exports (L4):** every CSV export writes ONE `cc_audit` row `export.<dataset>` {filters, rows} before the file (fail-closed).
   * **Paymob (L3):** a callback binds only through the HMAC-covered `order.id` = the stored intention order (`intention_order_id` is required
     at checkout); `merchant_order_id` is an unsigned field: a mismatch is noted (`pay.mismatch`), never decisive.
8. **Final check (2026-11-18, findings PAY-M3–M5, UX-1–UX-6 and the D1 upgrade path) — these override §5.2, §5.4, §6.1 and §8.4 where they differ:**
   * **D1 upgrade path:** production ran the FIRST 0006 (md5 7d82df38…, 2026-11-18 19:0x UTC). The review fix PAY-H1 added `cc_invoices.period_end`
     to 0006 / schema.sql, which `CREATE TABLE IF NOT EXISTS` cannot add to an existing table: `worker/tools/upgrade-pre-0006r.sql` holds the
     `ALTER TABLE cc_invoices ADD COLUMN period_end TEXT NOT NULL DEFAULT ''`, and `deploy/d1_migrate.py` plans it only where the column is
     missing (`deploy.sh db` / `deploy.sh worker`). The Worker must never be deployed before this step: every invoice INSERT names the column.
   * **Approval re-check (PAY-M5):** approving a NEW member product (no `live_json`) re-checks the member's current plan: 409 `plan` when the plan has no
     marketplace products any more (expired, suspended, downgraded), 409 `limit` {limit, live} when the live products already fill the cap. An edit of a
     product that is already live is approved as before.
   * **Unconfirmed payments (PAY-M3):** a webhook whose provider secret is saved but unreadable (CONFIG_SECRET changed) answers **503** `retry` (the
     provider re-sends) and alerts the owners once per hour per provider; a secret that was never saved stays 200 `unconfigured`. An attempt that reached
     the gateway (`redirected` / `pending`) and expires unconfirmed after 48 h sends ONE «محتاج تدخّل» alert per attempt (open, non-test invoice) to check
     the gateway's dashboard and record the payment by hand if it went through. `/pay/` shows «فيه محاولة دفع … لسه مستنية تأكيد البوابة — ماتدفعش تاني»
     for 48 h after such an attempt (the button stays). A server-side Paymob transaction inquiry is NOT implemented (N-Genius and PayTabs are re-queried).
   * **Invoice details (PAY-M4):** `invoice_issued`, `payment_received` and `payment_review` carry `{{invoice_details_text}}` (required var): invoice no and
     date; seller = operator name, registration, address, and the tax / commercial registration numbers from «الإعدادات» → operator (`tax_no`, `cr_no` —
     a line is left out while its value is empty); buyer = company, e-mail and the tax / CR numbers of the signup form; the line item; net · VAT rate =
     VAT · total; a paid invoice adds the date, the method and the reference. The receipt states the amount. NOT done (owner decision): the Egyptian Tax
     Authority e-invoice / e-credit-note integration promised on /register/, the dashboard and the legal pages.
   * **Control Center UX:** «بوابة الدفع» shows the Worker's `missing_labels` (never raw codes), a distinct Sandbox-complete state (`state = sandbox`) with
     what is left for Live, the Paymob Public Key next to the Secret Key, and the «إعدادات إضافية» block opens by itself when the manual-transfer text is
     missing; the permanent «لم يُجرَّب بمفاتيح حقيقية بعد» line is gone (UX-1, UX-2). `.btn:disabled` is styled, and each disabled WhatsApp go-live
     button names the missing step (UX-3). The «الباقة» select in members / partners asks first (company, old → new, side effects) (UX-5).
   * **Site UX:** «لوحة مصنعي» → «الإدارة» links «لوحة التحكم» (/admin/) by `staff_role` like the header menu, and labels /panel.html as the old system
     (UX-4); a plan lock box reads «"…" بتديك:» with the price on its own «السعر: …» line (UX-6).
   * **Still open (follow-up, not a launch blocker today — 0 member products live):** when a plan ends, is suspended or is downgraded, approved member
     products stay in the marketplace (Terms §4 says non-renewal stops the visibility) — a daily job that hides the overflow (and restores it on renewal)
     is needed before the first paid plan can expire (PAY-M6).
