#!/usr/bin/env node
// Set a member's plan (any plan: profile | basic | premium | partner | strategic | visitor) after the platform confirmed the
// payment, plus the matching profile that decides which requests reach them automatically. Until N-Genius is live.
// Usage (the key is read from the environment, never typed on the command line):
//   PLATFORM_KEY=... node tools/set-plan.mjs --email owner@factory.com --plan basic --company "Nile Plast" \
//       --sector "الصناعات البلاستيكية" --products "براميل، جراكن" --governorate "الجيزة" [--expires 2027-11-18] [--factory-ref 24]
// Options: --api https://madeinegyptgate.com/api/admin (default). Open requests the member matches are sent automatically.
const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith("--")) opt[args[i].slice(2)] = args[++i];
const key = process.env.PLATFORM_KEY;
if (!key || !opt.email || !opt.plan) { console.error("Usage: PLATFORM_KEY=... node tools/set-plan.mjs --email <addr> --plan <plan> [--company] [--name] [--title] [--phone] [--sector] [--products] [--governorate] [--expires YYYY-MM-DD] [--factory-ref <id>]"); process.exit(2); }
const body = { email: opt.email, plan: opt.plan };
for (const [k, f] of [["company"], ["name"], ["title"], ["phone"], ["sector"], ["products"], ["governorate"], ["expires", "plan_expires"], ["factory-ref", "factory_ref"]]) if (opt[k] != null) body[f || k] = opt[k];
const api = String(opt.api || "https://madeinegyptgate.com/api/admin").replace(/\/+$/, "");
const r = await fetch(api + "/members", { method: "POST", headers: { "Content-Type": "application/json", "X-Platform-Key": key }, body: JSON.stringify(body) });
const j = await r.json().catch(() => ({}));
if (!r.ok) { console.error(`Error ${r.status}: ${j.error || r.statusText}`); process.exit(1); }
console.log(`${j.user.email}: plan ${j.user.plan} (markets ${j.user.markets.join(", ")})${j.user.plan_expires ? ", expires " + j.user.plan_expires : ""}; open requests sent now: ${j.rematched}`);
console.log("The member signs in with an email code at the website — no password, no link to forward.");
