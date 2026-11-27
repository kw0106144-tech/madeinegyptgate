# Firewall & security — madeinegyptgate.com (applied 2026-11-18)

Honest note for the owner: no system can guarantee "zero breaches". These layers make attacks hard, block known
bad actors automatically and keep the protection current.

## Site-copying programs (2026-11-27, owner: «قافل أي نسخ»)
- `functions/_middleware.js` answers 403 to a page request from a site-copying program or scraping library (HTTrack, WebCopier,
  SiteSucker, Wget, WebZIP, Offline Explorer, Teleport, scrapy, python-requests / urllib, aiohttp, httpx, Go-http-client, libwww-perl,
  Java, okhttp, node-fetch, axios, PhantomJS, Bytespider), like Made in UAE / Saudi Gate. Search engines, SEO tools (Ahrefs, Semrush,
  Moz), the AI crawlers robots.txt allows, browsers, the app, curl and this site's own CI / smoke / Worker fetches (`migate-*`,
  `MIG-*`) are served as before; `/api/*`, `/data`, `/img`, `/assets` … are not affected. Tests: `functions/_tests/middleware.test.mjs`,
  `site-guard.test.mjs`. Honest limit: a copier that pretends to be a browser still gets the page — what a browser shows it has
  downloaded; `data/guard.js` makes copying from a browser harder and reports the attempts.

## Cloudflare zone (394786ba84adf85eca52354fa2ffd7da)
- **TLS / HTTPS**
  - Always Use HTTPS = on; minimum TLS = 1.2; TLS 1.3 = on.
  - HSTS: max-age 180 days, nosniff. includeSubDomains and preload are OFF, so mail/webmail subdomains are not affected.
  - A snapshot of the settings before the change is in scratchpad/shield/settings-before.json.
- **Managed transforms:** "Add security headers" adds X-Content-Type-Options, X-Frame-Options SAMEORIGIN, Referrer-Policy and X-XSS-Protection. "Remove X-Powered-By" = on.
- **WAF managed rules:** the Cloudflare Managed Free Ruleset is deployed. Cloudflare updates it continuously; entrypoint ruleset c82ceb7174d54602934b48516da832d9.
- **WAF custom rules** (entrypoint 7c73d671306844da83da768488f1c416):
  - MIG-1 — block IPs in the list `migate_blocklist`.
  - MIG-2 — block exploit scanners and secret-file probes: wp-login, xmlrpc, wp-admin, .env, .git, phpmyadmin, phpunit, cgi-bin, .aws, server-status, *.sql, *.bak, *.zip outside /media/.
  - MIG-3 — block unusual HTTP methods.
  - MIG-4 — block /api/* requests that have no User-Agent.
  - MIG-5 — managed challenge on panel.html / login.html / inbox.html / seo-admin.html / admin.html for cloud-hosting networks (AWS, GCP, Azure, DigitalOcean, OVH, Hetzner, Linode, Vultr, Contabo, Alibaba, Tencent …) or a bad reputation.
- **Rate limiting** (ac9fa5a47d9144bda7ddaff17fcccfb1): at most 15 POST requests per 10 s per IP on /api/auth/*, /api/index.php and /api/inquiries*. Over the limit → blocked for 10 s.
- **IP list** `migate_blocklist` (d185cb2d0ddb4fed98550f025541f096)
  - Holds 2,320 entries: Spamhaus DROP, abuse.ch Feodo, Emerging Threats compromised IPs. Public IPv4 only, /8 to /32.
  - It is refreshed every 15 minutes by the Worker `migate-shield` (worker-shield/) once the owner adds its secret CF_LISTS_TOKEN (permission "Account Filter Lists: Edit").
  - Safeguards: it never wipes the list when feeds fail or return fewer than 50 entries; it caps the list at 9,500 items; it skips the update when nothing changed (that check needs the BANS KV). Auto-bans come from KV keys "ban:<ip>" with a TTL.
- **Not enabled, on purpose**
  - Bot Fight Mode: on the Free plan it cannot be bypassed for webhooks (respond.io, payment gateways), so it could break them.
  - DNSSEC: needs a DS record at the domain registrar — owner action, optional.

## Application layer (code)
- Worker:
  - strict CORS to the site origins, rate limits on login codes, codes stored only as keyed hashes, 30-day tokens that logout revokes;
  - role checks on admin endpoints, HMAC-signed links, no raw IPs stored, PII never rendered publicly.
- Next: deploy 2
  - CSP headers in Pages _headers: frame-ancestors 'self', object-src 'none', base-uri 'self', form-action 'self', upgrade-insecure-requests;
  - the main Worker writes auto-bans to KV for repeated abuse (failed codes, honeypot paths);
  - Turnstile on the public forms;
  - an optional Cloudflare Access (Zero Trust, free up to 50 users) layer in front of the admin pages.

## Rollback (one command each; token = the deploy token)
- Custom rules off: PUT zones/<zone>/rulesets/phases/http_request_firewall_custom/entrypoint with {"rules":[]}.
- Rate limit off: the same with the http_ratelimit phase.
- Managed WAF off: the same with the http_request_firewall_managed phase.
- HSTS off: PATCH settings/security_header with enabled:false. Browsers that already saw HSTS keep it for max-age, so keep HTTPS working.
