/* The ONLY memory erasure (owner's memory policy, 2026-11-18 23:50: «اوعي تخلّي حد يمسح ذاكرة باسم»): the owner's audited Control Center
   action for a FORMAL LEGAL data-subject request under the Egyptian personal data protection law 151/2020. API only (the panel's account
   deletion «🗑 أرشفة ومسح البيانات» — acc-members.js deleteMember — erases the same memory together with the whole account).
   POST /api/admin/cc/memory/erase   (route permission members.delete = OWNER_ONLY: the owner role / bootstrap owners only)
     {member_id | visitor_id | visitor_email | visitor_phone   — exactly ONE person per call (never bulk, never automatic)
      visitor_ids — with visitor_email / visitor_phone: the visitor ids the owner CONFIRMS are that person's (from the dry run's list):
                    an e-mail / mobile a visitor gave Janna is CLAIMED, not verified, so two people can share one (a company mobile) —
                    only the confirmed ids are erased (review 2026-11-19 #12)
      reason   — the legal basis, ≥ ERASE_REASON_MIN characters (the formal request), kept in the audit row
      confirm  — the member's account e-mail (or his id), or the visitor id / e-mail / phone typed again
      dry_run? — true: only the counts (+ for an e-mail / phone: the matching visitor ids with their first / last visit and calls),
                 nothing erased, no audit row}
   → {ok, erased: {memory_rows, tasks, briefs, visitors, knowledge_askers, knowledge_removed}} — Bassem's memory of the member
   (advisor_memory), Janna's memory of every visitor id linked to him (or of the confirmed visitor ids), their tasks (memory_tasks) and
   briefs (memory_briefs), the janna_visitors rows, the person's short keyed hash in «بنك المعلومات», and the bank entries only HE asked
   (knowledge.js kbEraseStmts) and (0011) the person's rows of the daily calls report (call_sessions, call_reviews). The factory profile and
   the account itself stay (that is the account deletion). One cc_audit row (memory.erase, counts + the reason) in the SAME batch as the
   deletes: no audit row → nothing is erased. */
import { line, isEmail } from "./common.js";
import { fail, body as readBody, hasTable, batch, first, all, countOf } from "./acc-base.js";
import { vidOk, subjectOf, contactHash } from "./visitor.js";
import { kbEraseStmts } from "./knowledge.js";

export const ERASE_REASON_MIN = 10;
const IN = n => Array.from({ length: n }, () => "?").join(", ");
export async function eraseMemory(req, env, ctx, adm) {
  const b = await readBody(req);
  const memberId = line(b.member_id, 64), vid = line(b.visitor_id, 40).toLowerCase(), vEmail = line(b.visitor_email, 254).toLowerCase(), vPhone = line(b.visitor_phone, 30);
  if ([memberId, vid, vEmail, vPhone].filter(Boolean).length !== 1) fail(400, "one_subject", "one person per call: member_id OR visitor_id OR visitor_email OR visitor_phone (never bulk)");
  const reason = line(b.reason, 300);
  if (Array.from(reason).length < ERASE_REASON_MIN) fail(400, "reason_required", "اكتب السبب القانوني (طلب رسمي من صاحب البيانات بموجب قانون حماية البيانات الشخصية 151 لسنة 2020) / state the legal basis (a formal data-subject request, Egyptian PDPL 151/2020)", { min: ERASE_REASON_MIN });
  const jv = await hasTable(env, "janna_visitors"), confirm = String(b.confirm == null ? "" : b.confirm).trim().toLowerCase();
  let visitors = [], target, subjects, matches = null;
  if (memberId) {
    const m = await first(env, "SELECT id, email FROM members WHERE id = ?", memberId);
    if (!m) fail(404, "not_found", "member not found");
    if (confirm !== String(m.email || "").toLowerCase() && confirm !== m.id.toLowerCase()) fail(400, "confirm_required", "type the account e-mail (or the member id) to confirm");
    visitors = jv ? (await all(env, "SELECT visitor_id FROM janna_visitors WHERE member_id = ? LIMIT 50", m.id)).map(r => r.visitor_id) : [];
    subjects = [m.id, ...visitors.map(subjectOf)]; target = { type: "member", id: m.id };
  } else {
    if (!jv) fail(404, "not_found", "no visitor memory on this database (migration 0009 not applied)");
    if (vid) { if (!vidOk(vid)) fail(400, "invalid", "visitor_id: 32 hex characters", { field: "visitor_id" }); visitors = (await all(env, "SELECT visitor_id FROM janna_visitors WHERE visitor_id = ?", vid)).map(r => r.visitor_id); }
    else {
      const kind = vEmail ? "email" : "phone", h = await contactHash(env, kind, vEmail || vPhone);
      if (!h || (vEmail && !isEmail(vEmail))) fail(400, "invalid", kind + " not valid", { field: "visitor_" + kind });
      const found = await all(env, `SELECT visitor_id, first_at, last_at, calls, stage, member_id FROM janna_visitors WHERE ${kind}_hash = ? ORDER BY first_at LIMIT 50`, h);
      if (!found.length) fail(404, "not_found", "no visitor memory for that id / e-mail / phone");
      matches = found.map(r => ({ visitor_id: r.visitor_id, first_at: r.first_at, last_at: r.last_at, calls: Number(r.calls || 0), stage: r.stage || "", linked: !!r.member_id }));
      /* claimed, not verified: only the ids the owner confirms (never «every id with that mobile») */
      const want = Array.isArray(b.visitor_ids) ? [...new Set(b.visitor_ids.map(x => String(x || "").trim().toLowerCase()))] : [];
      if (b.dry_run !== true) {
        if (!want.length) fail(400, "visitor_ids_required", "an e-mail / mobile a visitor gave Janna is claimed, not verified — list the visitor ids that are this person's (visitor_ids, from the dry run)", { matches });
        if (want.some(x => !matches.some(m => m.visitor_id === x))) fail(400, "invalid", "visitor_ids: only ids that the e-mail / mobile leads to", { field: "visitor_ids", matches });
      }
      visitors = b.dry_run === true ? matches.map(m => m.visitor_id) : want;
    }
    if (confirm !== (vid || vEmail || vPhone).toLowerCase()) fail(400, "confirm_required", "type the visitor id / e-mail / phone again to confirm");
    if (!visitors.length) fail(404, "not_found", "no visitor memory for that id / e-mail / phone");
    subjects = visitors.map(subjectOf); target = { type: "visitor", id: visitors.length === 1 ? "v:" + visitors[0].slice(0, 8) + "…" : visitors.length + " visitor ids" };
  }
  const has = { mem: await hasTable(env, "advisor_memory"), tsk: await hasTable(env, "memory_tasks"), brf: await hasTable(env, "memory_briefs"), kb: await hasTable(env, "knowledge_bank"),
    cs: await hasTable(env, "call_sessions"), cr: await hasTable(env, "call_reviews") }; // 0011: the calls report's rows of this person
  /* call_sessions: a member's own calls (member_id) + every subject's ('v:' visitor ids) — ≤ 52 bound values (D1 allows 100) */
  const csWhere = target.type === "member" ? `member_id = ? OR subject IN (${IN(subjects.length)})` : `subject IN (${IN(subjects.length)})`, csArgs = target.type === "member" ? [target.id, ...subjects] : subjects;
  const counts = {
    memory_rows: has.mem ? (await countOf(env, `SELECT COUNT(*) AS n FROM advisor_memory WHERE member_id IN (${IN(subjects.length)})`, ...subjects)) || 0 : 0,
    tasks: has.tsk ? (await countOf(env, `SELECT COUNT(*) AS n FROM memory_tasks WHERE subject IN (${IN(subjects.length)})`, ...subjects)) || 0 : 0,
    briefs: has.brf ? (await countOf(env, `SELECT COUNT(*) AS n FROM memory_briefs WHERE subject IN (${IN(subjects.length)})`, ...subjects)) || 0 : 0,
    visitors: visitors.length, knowledge_askers: 0 };
  /* the calls report's rows (0011) are counted only when there are some (the answer of a person without any stays as it was) */
  const callS = has.cs ? (await countOf(env, `SELECT COUNT(*) AS n FROM call_sessions WHERE ${csWhere}`, ...csArgs)) || 0 : 0;
  const callR = has.cr ? (await countOf(env, `SELECT COUNT(*) AS n FROM call_reviews WHERE subject IN (${IN(subjects.length)})`, ...subjects)) || 0 : 0;
  if (callS) counts.call_sessions = callS;
  if (callR) counts.call_reviews = callR;
  /* the person's short keyed hash in the knowledge bank's asker lists; an entry only HE asked goes too (review 2026-11-19 #8) */
  const kb = has.kb ? await kbEraseStmts(env, subjects) : { stmts: [], askers: 0, removed: 0 }, kbFix = kb.stmts;
  counts.knowledge_askers = kb.askers; counts.knowledge_removed = kb.removed;
  if (b.dry_run === true) return { body: { ok: true, dry_run: true, counts, subject: target, ...(matches ? { matches } : {}) } };
  if (!counts.memory_rows && !counts.tasks && !counts.briefs && !counts.visitors && !kbFix.length && !callS && !callR) fail(404, "nothing_to_erase", "there is no memory of this person");
  await batch(env, [
    ...(has.mem ? [env.DB.prepare(`DELETE FROM advisor_memory WHERE member_id IN (${IN(subjects.length)})`).bind(...subjects)] : []),
    ...(has.tsk ? [env.DB.prepare(`DELETE FROM memory_tasks WHERE subject IN (${IN(subjects.length)})`).bind(...subjects)] : []),
    ...(has.brf ? [env.DB.prepare(`DELETE FROM memory_briefs WHERE subject IN (${IN(subjects.length)})`).bind(...subjects)] : []),
    ...(visitors.length ? [env.DB.prepare(`DELETE FROM janna_visitors WHERE visitor_id IN (${IN(visitors.length)})`).bind(...visitors)] : []),
    ...kbFix,
    ...(callS ? [env.DB.prepare(`DELETE FROM call_sessions WHERE ${csWhere}`).bind(...csArgs)] : []),
    ...(callR ? [env.DB.prepare(`DELETE FROM call_reviews WHERE subject IN (${IN(subjects.length)})`).bind(...subjects)] : []),
    adm.auditStmt("memory.erase", target.type, target.id, { counts, ...(matches ? { via: vEmail ? "visitor_email" : "visitor_phone", confirmed_ids: visitors.length, matching_ids: matches.length } : {}) }, { reason },
      `memory erased (${counts.memory_rows} rows, ${counts.tasks} tasks, ${counts.briefs} briefs, ${counts.visitors} visitor ids${matches ? " confirmed of " + matches.length : ""}) · legal request: ${reason}`),
  ]);
  return { body: { ok: true, erased: counts, subject: target } };
}
