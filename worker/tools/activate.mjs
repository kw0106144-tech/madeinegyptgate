#!/usr/bin/env node
// Activate (or revoke) the AI Deal Advisor for a member after the platform has confirmed the payment.
// Usage (the key is read from the environment, never typed on the command line):
//   PLATFORM_KEY=... node tools/activate.mjs --member <platform member id> --company "<company>" --email <member email> --plan partner|strategic
//   PLATFORM_KEY=... node tools/activate.mjs --member <id> --plan basic          # downgrade / cancel → all tokens and links stop working
// Options: --api https://madeinegyptgate.com/api/advisor (default) · --no-email (only print the link; send it to the member yourself)
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "--no-email") opt.noEmail = true; else if (a.startsWith("--")) opt[a.slice(2)] = args[++i]; }
const key = process.env.PLATFORM_KEY;
if (!key || !opt.member || !opt.plan) { console.error("Usage: PLATFORM_KEY=... node tools/activate.mjs --member <id> --plan partner|strategic [--company <name>] [--email <addr>] [--no-email] [--api <url>]"); process.exit(2); }
const api = String(opt.api || "https://madeinegyptgate.com/api/advisor").replace(/\/+$/, "");
const r = await fetch(api + "/activation", { method: "POST", headers: { "Content-Type": "application/json", "X-Platform-Key": key }, body: JSON.stringify({ member_id: opt.member, company: opt.company || "", email: opt.email || "", plan: opt.plan, send_email: !opt.noEmail }) });
const j = await r.json().catch(() => ({}));
if (r.status === 403 && j.error === "plan not eligible") { console.log(`Advisor revoked for ${opt.member} (plan ${opt.plan}).`); process.exit(0); }
if (!r.ok) { console.error(`Error ${r.status}: ${j.error || r.statusText}`); process.exit(1); }
console.log(`Activated ${j.member.id} (${j.member.company || "-"}) on plan ${j.member.plan}; markets: ${j.member.markets.join(", ")}`);
console.log(j.emailed ? `Login link emailed to ${j.member.email}.` : `Login link NOT emailed${j.email_error ? " (" + j.email_error + ")" : ""} — send it to the member yourself:`);
if (!j.emailed) console.log(j.activation_url);
console.log(`Link is single-use and valid until ${j.expires_at}.`);
