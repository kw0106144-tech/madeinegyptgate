/* Members-only opportunities (owner decision 2026-11-28): the Control Center collections whose published edits carry locked fields, and
   those fields (the same split as tools/opp_split.js for the data files). The public overlay (/data/overlay.js, content.js
   compileOverlay) leaves them out; GET /api/me/opps (opp-lock.js) gives them to a member whose plan covers them, and data/opp-full.js
   puts them back into the page's overlay data before the data files are applied. No import: shared by content.js and opp-lock.js. */
export const OVL_LOCK = {
  tend: ["entity", "entity_en", "booklet", "bond", "source_url", "details", "contacts"],
  rfq: ["details", "details_en", "delivery", "qty"],
  award: ["winner_ar", "winner_en", "awarding_entity_ar", "awarding_entity_en", "value_egp_million", "value_usd_million", "value_eur_million", "source_url"],
  opp: ["entity_ar", "entity_en", "bid_bond_egp", "booklet_price_egp", "source_url", "via", "note"],
  intl: ["entity_ar", "entity_en", "estimated_value", "currency", "source_url", "source_name"],
  proj: ["value", "owner", "contractor", "consultant", "updates", "source_url"],
};
/* the market of each collection for the plan check (an international tender's own market is in the record) */
export const OVL_KIND = { tend: "tenders", rfq: "rfqs", award: "awards", opp: "tenders", intl: "tenders", proj: "projects" };
/* rec → [public part, locked part] (the project updates keep their dates in the public part) */
export function splitRec(coll, rec) {
  const L = OVL_LOCK[coll]; if (!L || !rec || typeof rec !== "object") return [rec, null];
  const pub = {}, lock = {};
  for (const [k, v] of Object.entries(rec)) {
    if (!L.includes(k)) { pub[k] = v; continue; }
    lock[k] = v;
    if (coll === "proj" && k === "updates" && Array.isArray(v)) pub[k] = v.map(u => (Array.isArray(u) ? [u[0], ""] : u));
  }
  return [pub, Object.keys(lock).length ? lock : null];
}
