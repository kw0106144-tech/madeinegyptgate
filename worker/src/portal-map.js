/* Team portal (panel.gcctendersgate.org) → Control Center: what a portal staff session may see and do (owner request 2026-11-24).
   The portal (one sign-in for the owner's 11 sites) gives each staff member a list of sections, each "r" (view) or "w" (view + edit).
   Here those sections become (1) Control Center permissions — never an OWNER_ONLY one, never the team, settings, plans/prices, keys,
   e-mail, import, audit or developer ones — and (2) a fail-closed list of the API paths a portal session may call at all.
   Pure functions, no imports: used by acc-base.js (roleOf), acc.js (handleCC, whoami) and portal-sso.js (sign-in). */

/* portal section → [perms for view, extra perms for edit] */
const CONTENT = [["content.read"], ["content.write", "media.upload"]];
export const PORTAL_SECTION_PERMS = {
  users: [["members.read"], ["members.write", "members.contact", "members.plan"]],
  partners: [["members.read"], ["members.write", "members.contact", "members.plan"]],
  customers: [["customers.read"], ["customers.write"]],
  members: [["directory.read", "legacy.contacts", "content.read"], ["directory.write", "directory.link", "directory.verify", "content.write", "media.upload"]],
  plans: [["plans.read"], []],
  approvals: [[], ["approvals.products", "approvals.company"]],
  invoices: [["pay.read"], ["pay.invoice", "pay.mark_paid"]],
  tenders: CONTENT, rfqs: CONTENT, products: CONTENT, store: CONTENT, awards: CONTENT, projects: CONTENT, procurement: CONTENT,
  events: CONTENT, banners: CONTENT, zones: CONTENT, news: CONTENT, videos: CONTENT, notices: CONTENT,
  media: [["content.read"], ["media.upload", "media.delete"]],
  publish: [["content.read"], ["content.publish"]],
  messages: [["orders.read"], ["orders.reply", "orders.note", "orders.close", "orders.rfq"]],
};
/* the only permissions a portal session can ever hold (everything above; nothing owner-only, nothing about the team or the system) */
export const PORTAL_PERMS = [...new Set(Object.values(PORTAL_SECTION_PERMS).flatMap(([r, w]) => [...r, ...w]))];

/* content collections (content.js COLLS) → the portal sections that cover them */
const COLL_SECTIONS = {
  fac: ["members"], facx: ["members"], prod: ["products", "store"], tend: ["tenders"], opp: ["tenders"], intl: ["tenders"], rfq: ["rfqs"],
  offer: ["store"], cats: ["store"], zone: ["zones"], news: ["news", "procurement"], event: ["events"], award: ["awards"], video: ["videos"],
  proj: ["projects"], banner: ["banners"], notice: ["notices"],
};
const CONTENT_SECTIONS = ["members", "tenders", "rfqs", "products", "store", "awards", "projects", "procurement", "events", "banners", "zones", "news", "videos", "notices", "media", "publish"];

/* the portal's claim {section: "r" | "w"} → a clean {section: "r" | "w"} of known sections only */
export function cleanSections(p) {
  const out = {};
  if (!p || typeof p !== "object" || Array.isArray(p)) return out;
  for (const k of Object.keys(PORTAL_SECTION_PERMS)) if (p[k] === "r" || p[k] === "w") out[k] = p[k];
  return out;
}
/* sections → permissions */
export function portalPerms(sections) {
  const s = cleanSections(sections), out = new Set();
  for (const [k, lv] of Object.entries(s)) { const [r, w] = PORTAL_SECTION_PERMS[k]; r.forEach(p => out.add(p)); if (lv === "w") w.forEach(p => out.add(p)); }
  return PORTAL_PERMS.filter(p => out.has(p));
}

/* may a portal session call this Control Center path (path without /api/admin/cc)? Anything not listed here is refused. */
export function portalAllowed(path, method, sections) {
  const s = cleanSections(sections), M = method === "HEAD" ? "GET" : method, read = M === "GET";
  const any = keys => keys.some(k => s[k] === "w" || (read && s[k] === "r"));
  const seg = String(path || "/").split("/").filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
  const a = seg[0] || "", b = seg[1] || "";
  if (a === "whoami") return read && seg.length === 1;
  if (a === "members") return any(["users", "partners"]);
  if (a === "customers") return any(["customers"]);
  if (a === "legacy") return b === "companies" ? any(["members"]) : b === "messages" ? any(["messages"]) : false;
  if (a === "orders") return any(["messages"]);
  if (a === "rfqs") return M === "POST" && seg.length === 1 && any(["rfqs", "messages"]);
  if (a === "approvals") return any(["approvals"]);
  if (a === "plans") return read && seg.length === 1 && any(["plans"]);
  if (a === "pay") return (b === "invoices" || b === "payments") && any(["invoices"]);
  if (a === "media") return read ? any(CONTENT_SECTIONS) : M === "POST" && seg.length === 1 ? any(CONTENT_SECTIONS.filter(k => k !== "publish")) : any(["media"]);
  if (a === "content") {
    if (b === "schema" || b === "status" || b === "overlay") return read && any(CONTENT_SECTIONS);
    if (b === "publish" || b === "edge-retry") return M === "POST" && s.publish === "w";
    const secs = COLL_SECTIONS[b];
    return !!secs && any(secs);
  }
  return false;
}
/* the Control Center navigation keys a portal session may see (data/acc.js GR keys; identical to the portal's section keys) */
export function portalNav(sections) {
  const s = cleanSections(sections), out = {};
  for (const k of Object.keys(s)) if (k !== "approvals" || s[k] === "w") out[k] = s[k];
  return out;
}
