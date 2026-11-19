/* Admin MONITORING console (owner decision 5: no step needs a person — admins only watch, search, resend, block abuse,
   and set plans until online payment is live). Access: a signed-in member with role=admin or whose verified email is in
   ADMIN_EMAILS; the plan endpoints also accept X-Platform-Key (payment webhook / tools/activate.mjs).
   GET  /api/admin/inquiries?status=&q=&limit=&before=   → {items, counts}   (items[].needs_team; counts.needs_team; status=needs_team filters)
   GET  /api/admin/inquiries/:id_or_ref                  → {inquiry, events, routes, quotes, needs_team, candidates, candidates_at, web_search}
        needs_team: no REGISTERED member matched → status in_progress (the buyer was told «جاري معالجة طلبك») and the admins act.
        candidates[]: {name, governorate, sector, source: "directory" | "web", url, profile_url, snippet, origin, score} —
                   admins only; directory = platform directory rows that are NOT registered members (never contacted
                   automatically); web = only when BRAVE_SEARCH_KEY or GOOGLE_CSE_KEY + GOOGLE_CSE_CX is configured.
   POST /api/admin/inquiries/:id_or_ref/candidates/refresh → {candidates, web_search, at}
   POST /api/admin/inquiries/:id_or_ref/reply {body, channel: email|whatsapp|both, status?: in_progress|replied|closed}
                                                         → {ok, sent:{email, whatsapp}, status, fallback?, errors?}
        «إحنا اللي هنرد»: a buyer-visible event with actor "team" (track page + bell) + email to the buyer (Reply-To TEAM_EMAIL);
        WhatsApp only through an approved buyer template (none yet → the email carries it).
        routes[]: {company, plan, email, score, status, email_status, wa_status (sent | template | failed | skipped | pending),
                   email_sent, wa_sent, attempts, error, quote (latest {price, currency, …}), quotes_count, …}
   POST /api/admin/inquiries/:id_or_ref/resend           → {ok, routed, added}   (retries failed deliveries + new matches)
   POST /api/admin/block {email | ip_hash, reason}       → {ok, revoked}  (blocks new requests + that member's sessions, quotes,
                                                            email replies and incoming routing)
   GET  /api/admin/members?q=&plan=                      → {items}
   POST /api/admin/members {email | id, plan, plan_expires?, company?, name?, title?, phone?, sector?, governorate?, products?, factory_ref?, role?}
                                                         → {user, rematched}   (activation → automatic re-matching of open requests)
   GET  /api/admin/wa?flag=                              → {items}   (WhatsApp log: mood flags, stops, time choices) */
import { json, err, preflight, readJson, bodyErr, line, str, now, hex, jparse, isAdmin, userOut, canonPlan, PLAN_LV, effPlan, emailKey, isEmail, safeEq, membersByMailbox, resubscribe } from "./common.js";
import { authUser, isLinkSession, linkSessionErr } from "./auth.js";
import { asInq, routeInquiry, rematchForMember, REF_RX, needsTeam, latestCandidates, refreshCandidates, teamReply, teamFlow } from "./inquiries.js";
import { directoryCandidates } from "./candidates.js";
import { e164 } from "./whatsapp.js";

export async function handleAdmin(req, env, ctx) {
  env = env || {}; if (!ctx || typeof ctx.waitUntil !== "function") ctx = { waitUntil() {} };
  if (req.method === "OPTIONS") return preflight();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/admin/, "").replace(/\/+$/, "") || "/";
  try {
    if (!env.DB) return err(503, "store_off", "store not configured");
    const platform = !!env.PLATFORM_KEY && safeEq(req.headers.get("X-Platform-Key") || "", env.PLATFORM_KEY);
    const me = platform ? null : await authUser(req, env);
    if (!platform && !me) return err(401, "unauthorized", "sign in required");
    if (!platform && !isAdmin(env, me)) return err(403, "forbidden", "admins only");
    if (!platform && isLinkSession(me)) return linkSessionErr(); // the console needs an e-mail-code session
    const M = req.method;
    if (path === "/members") return M === "GET" ? await members(env, url) : M === "POST" ? await setMember(req, env, me) : err(405, "method", "method not allowed");
    if (platform) return err(403, "forbidden", "platform key only manages members");
    if (path === "/inquiries") return M === "GET" ? await list(env, url) : err(405, "method", "method not allowed");
    let m;
    if ((m = path.match(/^\/inquiries\/([A-Za-z0-9-]{6,20})$/))) return M === "GET" ? await show(env, m[1]) : err(405, "method", "method not allowed");
    if ((m = path.match(/^\/inquiries\/([A-Za-z0-9-]{6,20})\/resend$/))) return M === "POST" ? await resend(env, m[1], me) : err(405, "method", "method not allowed");
    if ((m = path.match(/^\/inquiries\/([A-Za-z0-9-]{6,20})\/candidates\/refresh$/))) return M === "POST" ? await candRefresh(env, m[1]) : err(405, "method", "method not allowed");
    if ((m = path.match(/^\/inquiries\/([A-Za-z0-9-]{6,20})\/reply$/))) return M === "POST" ? await reply(req, env, m[1], me) : err(405, "method", "method not allowed");
    if (path === "/block") return M === "POST" ? await block(req, env, me) : err(405, "method", "method not allowed");
    if (path === "/wa") return M === "GET" ? await waLog(env, url) : err(405, "method", "method not allowed");
    return err(404, "not_found", "not found");
  } catch (e) {
    console.error("admin error", e && e.stack || e);
    return err(500, "server", "server error");
  }
}
const find = (env, idOrRef) => { const v = String(idOrRef); return REF_RX.test(v.toUpperCase()) ? env.DB.prepare("SELECT * FROM inquiries WHERE ref = ?").bind(v.toUpperCase()).first() : env.DB.prepare("SELECT * FROM inquiries WHERE id = ?").bind(v.toLowerCase()).first(); };
const adminInq = r => ({ id: r.id, ref: r.ref, kind: r.kind, status: r.status, source: r.source, target_type: r.target_type, target_id: r.target_id, target_name: r.target_name, name: r.name, company: r.company, email: r.email, phone: r.phone, consent_wa: !!r.consent_wa,
  message: r.message, payload: jparse(r.payload_json, {}), items: jparse(r.items_json, []), sector: r.sector, governorate: r.governorate, market: r.market, routed_count: r.routed_count, replies_count: r.replies_count, ip_hash: r.ip_hash, user_id: r.user_id, lang: r.lang, created_at: r.created_at, updated_at: r.updated_at, closed_at: r.closed_at,
  needs_team: needsTeam(r) });
const ROUTABLE_SQL = "(kind IN ('rfq', 'basket') OR (kind = 'contact' AND target_type IN ('factory', 'company')))";

async function list(env, url) {
  const status = line(url.searchParams.get("status"), 20), q = line(url.searchParams.get("q"), 100), before = line(url.searchParams.get("before"), 40);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 50));
  const where = [], args = [];
  if (status === "needs_team") where.push(`status IN ('in_progress', 'no_match') AND ${ROUTABLE_SQL}`);
  else if (status) { where.push("status = ?"); args.push(status); }
  if (before) { where.push("created_at < ?"); args.push(before); }
  if (q) { where.push("(ref LIKE ? OR email LIKE ? OR company LIKE ? OR name LIKE ? OR target_name LIKE ? OR message LIKE ?)"); const like = "%" + q.replace(/[%_]/g, "") + "%"; args.push(like, like, like, like, like, like); }
  const { results } = await env.DB.prepare(`SELECT * FROM inquiries ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ?`).bind(...args, limit).all();
  const { results: counts } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status").all();
  const team = await env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('in_progress', 'no_match') AND ${ROUTABLE_SQL}`).first("n");
  return json({ items: (results || []).map(adminInq), counts: { ...Object.fromEntries((counts || []).map(c => [c.status, c.n])), needs_team: team || 0 } });
}
async function show(env, id) {
  const r = await find(env, id);
  if (!r) return err(404, "not_found", "not found");
  const { results: events } = await env.DB.prepare("SELECT id, type, actor, body, meta_json, buyer_visible, created_at FROM inquiry_events WHERE inquiry_id = ? ORDER BY id ASC").bind(r.id).all();
  const { results: routes } = await env.DB.prepare("SELECT r.*, m.company, m.email, m.plan FROM inquiry_routes r LEFT JOIN members m ON m.id = r.member_id WHERE r.inquiry_id = ? ORDER BY r.priority DESC, r.score DESC").bind(r.id).all();
  const { results: quotes } = await env.DB.prepare("SELECT * FROM quotes WHERE inquiry_id = ? ORDER BY id ASC").bind(r.id).all();
  // per channel, what really happened (the monitoring console's only view of delivery)
  const chan = (sent, st, rt) => sent ? "sent" : st || (rt.status === "pending" ? "pending" : rt.attempts ? "failed" : "");
  const out = (routes || []).map(rt => { const qs = (quotes || []).filter(q => q.route_id === rt.id);
    return { ...rt, email_status: chan(rt.email_sent, rt.email_status, rt), wa_status: rt.wa_sent ? "sent" : rt.wa_status || "skipped", quote: qs.length ? qs[qs.length - 1] : null, quotes_count: qs.length }; });
  // candidate factories (admins only): the stored list, else — for a request that needs the team — the directory list right now
  const need = needsTeam(r), stored = await latestCandidates(env, r.id);
  const cand = stored || (need ? { candidates: directoryCandidates(env, asInq(r)), web: { provider: "", skipped: "not_run" }, at: "" } : { candidates: [], web: {}, at: "" });
  return json({ inquiry: adminInq(r), events: (events || []).filter(e => e.type !== "candidates").map(e => ({ ...e, meta: jparse(e.meta_json, {}), meta_json: undefined, buyer_visible: !!e.buyer_visible })), routes: out, quotes: quotes || [],
    needs_team: need, candidates: cand.candidates, candidates_at: cand.at, web_search: cand.web });
}
async function candRefresh(env, id) {
  const r = await find(env, id);
  if (!r) return err(404, "not_found", "not found");
  const c = await refreshCandidates(env, asInq(r));
  return json({ candidates: c.candidates, web_search: c.web, at: c.at });
}
async function reply(req, env, id, me) {
  const b = await readJson(req, 16384); const be = bodyErr(b); if (be) return be;
  const r = await find(env, id);
  if (!r) return err(404, "not_found", "not found");
  const out = await teamReply(env, r, { body: b.body != null ? b.body : b.message, body_en: b.body_en, channel: line(b.channel, 10), status: b.status == null ? "" : line(b.status, 20), by: me && me.email });
  if (!out.ok) return err(out.status || 400, out.code, out.error, out.max ? { max: out.max } : undefined);
  return json(out);
}
async function resend(env, id, me) {
  const r = await find(env, id);
  if (!r) return err(404, "not_found", "not found");
  if (r.status === "closed" || r.status === "blocked") return err(409, "closed", "closed or blocked");
  await env.DB.prepare("UPDATE inquiry_routes SET attempts = 0 WHERE inquiry_id = ? AND status IN ('pending', 'failed')").bind(r.id).run();
  const res = await routeInquiry(env, asInq(r));
  await env.DB.prepare("INSERT INTO inquiry_events (inquiry_id, type, actor, body, meta_json, buyer_visible, created_at) VALUES (?, 'resend', ?, '', ?, 0, ?)").bind(r.id, line(me.email, 120), JSON.stringify(res), now()).run();
  if (res.needs_team) await teamFlow(env, r.id, { buyer: !!r.receipt_sent }); // nothing deliverable after all → the admins act
  return json({ ok: true, routed: res.routed, added: res.added });
}
async function block(req, env, me) {
  const b = await readJson(req, 4096); const be = bodyErr(b); if (be) return be;
  const email = line(b.email, 254).toLowerCase(), ih = line(b.ip_hash, 64).toLowerCase(), t = now(), reason = line(b.reason, 200);
  if (!email && !ih) return err(400, "required", "email or ip_hash required");
  if (email && !isEmail(email)) return err(400, "invalid_email", "invalid email");
  if (ih && !/^[a-f0-9]{16,64}$/.test(ih)) return err(400, "invalid_ip_hash", "invalid ip_hash");
  const stmts = [];
  let revoked = 0;
  if (email) { stmts.push(env.DB.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('email', ?, ?, ?) ON CONFLICT(kind, value) DO UPDATE SET reason = excluded.reason").bind(emailKey(email), reason, t));
    stmts.push(env.DB.prepare("UPDATE inquiries SET status = 'blocked', updated_at = ? WHERE email_key = ? AND status IN ('received', 'routed', 'no_match', 'replied', 'recorded')").bind(t, emailKey(email)));
    // a blocked member: every session ends now (auth.js also refuses blocked addresses), no more routed requests
    for (const m of await membersByMailbox(env, email, "id")) {
      stmts.push(env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at = ''").bind(t, m.id));
      stmts.push(env.DB.prepare("UPDATE members SET inbox_paused = 1, updated_at = ? WHERE id = ?").bind(t, m.id));
      revoked++;
    } }
  if (ih) { stmts.push(env.DB.prepare("INSERT INTO blocks (kind, value, reason, created_at) VALUES ('ip', ?, ?, ?) ON CONFLICT(kind, value) DO UPDATE SET reason = excluded.reason").bind(ih, reason, t));
    stmts.push(env.DB.prepare("UPDATE inquiries SET status = 'blocked', updated_at = ? WHERE ip_hash = ? AND status IN ('received', 'routed', 'no_match', 'replied', 'recorded')").bind(t, ih)); }
  await env.DB.batch(stmts);
  return json({ ok: true, revoked });
}

async function members(env, url) {
  const q = line(url.searchParams.get("q"), 100), plan = line(url.searchParams.get("plan"), 20);
  const where = [], args = [];
  if (plan) { where.push("plan = ?"); args.push(canonPlan(plan)); }
  if (q) { const like = "%" + q.replace(/[%_]/g, "") + "%"; where.push("(email LIKE ? OR company LIKE ? OR name LIKE ? OR id = ?)"); args.push(like, like, like, q); }
  const { results } = await env.DB.prepare(`SELECT * FROM members ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT 200`).bind(...args).all();
  return json({ items: (results || []).map(m => userOut(env, m)) });
}
/* set a plan (payment confirmed / N-Genius webhook later) and the matching profile; creates the account if needed */
async function setMember(req, env, me) {
  const b = await readJson(req, 16384); const be = bodyErr(b); if (be) return be;
  const email = line(b.email, 254).toLowerCase(), id = line(b.id, 64);
  if (!id && !isEmail(email)) return err(400, "invalid_email", "email or id required");
  const t = now();
  let m = id ? await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first() : (await env.DB.prepare("SELECT * FROM members WHERE lower(email) = ? ORDER BY verified DESC, created_at ASC LIMIT 1").bind(email).first());
  if (!m) {
    if (!isEmail(email)) return err(404, "not_found", "member not found");
    const nid = "u" + hex(8);
    // created by the platform → verified (its plan is the platform's word); an email-code sign-in for this address adopts it
    await env.DB.prepare("INSERT INTO members (id, company, email, plan, verified, created_at, updated_at) VALUES (?, '', ?, 'visitor', 1, ?, ?)").bind(nid, email, t, t).run();
    m = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(nid).first();
  }
  const set = {};
  if ("plan" in b) {
    const p = canonPlan(b.plan);
    if (String(b.plan || "").trim() && p === "visitor" && !/^(visitor|none)$/i.test(String(b.plan))) return err(400, "invalid_plan", "invalid plan", { plans: Object.keys(PLAN_LV) });
    set.plan = p; set.verified = 1;
    if (PLAN_LV[p] >= PLAN_LV.basic && (PLAN_LV[canonPlan(m.plan)] < PLAN_LV.basic || !m.activated_at || effPlan(m) === "visitor")) set.activated_at = t;
  }
  if ("plan_expires" in b) { const v = line(b.plan_expires, 40); if (v && isNaN(Date.parse(v))) return err(400, "invalid_date", "plan_expires must be an ISO date"); set.plan_expires = v ? new Date(Date.parse(v)).toISOString() : ""; }
  for (const [k, n] of [["company", 160], ["name", 120], ["title", 40], ["sector", 160], ["governorate", 60], ["factory_ref", 60]]) if (k in b) set[k] = line(b[k], n);
  if ("products" in b) set.products = str(b.products, 1000).replace(/\s+/g, " ");
  if ("phone" in b) { const p = b.phone ? e164(b.phone) : ""; if (b.phone && !p) return err(400, "invalid_phone", "invalid phone"); set.phone = p; }
  if ("role" in b) { if (!/^(user|admin)$/.test(String(b.role))) return err(400, "invalid_role", "role must be user or admin"); if (!me) return err(403, "forbidden", "only an admin can change roles"); set.role = b.role; }
  if ("inbox_paused" in b) set.inbox_paused = b.inbox_paused ? 1 : 0;
  if (!Object.keys(set).length) return err(400, "nothing", "nothing to update");
  const cols = Object.keys(set);
  await env.DB.prepare(`UPDATE members SET ${cols.map(c => c + " = ?").join(", ")}, updated_at = ? WHERE id = ?`).bind(...cols.map(c => set[c]), t, m.id).run();
  if (set.inbox_paused === 0 && m.email) await resubscribe(env, m.email, "incoming"); // un-pausing must also clear an earlier unsubscribe
  const fresh = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(m.id).first();
  await env.DB.prepare("INSERT INTO events (deal_id, member_id, type, data, at) VALUES ('', ?, 'member_set', ?, ?)").bind(m.id, JSON.stringify({ by: me ? me.email : "platform", fields: cols, plan: fresh.plan }), t).run();
  let rematched = 0;
  if (PLAN_LV[effPlan(fresh)] >= PLAN_LV.basic && (set.activated_at || "sector" in set || "products" in set || "plan" in set || set.inbox_paused === 0)) rematched = (await rematchForMember(env, m.id)).sent;
  return json({ user: userOut(env, fresh), rematched });
}
async function waLog(env, url) {
  const flag = line(url.searchParams.get("flag"), 20);
  const { results } = await env.DB.prepare(`SELECT w.*, m.company, m.name FROM wa_messages w LEFT JOIN members m ON m.id = w.member_id ${flag ? "WHERE w.flag = ?" : ""} ORDER BY w.id DESC LIMIT 200`).bind(...(flag ? [flag] : [])).all();
  return json({ items: results || [] });
}
