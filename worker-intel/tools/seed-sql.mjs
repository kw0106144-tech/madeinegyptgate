#!/usr/bin/env node
/* seeds/sources.json → seeds/sources.sql (idempotent upsert; keeps runtime state; a seed can disable but never re-enable
   a source that an admin or the auto-disable rule turned off). Usage: node tools/seed-sql.mjs && npx wrangler d1 execute migate-intel --remote --file=seeds/sources.sql */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlLit } from "../src/util.js";
const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(join(here, "..", "seeds", "sources.json"), "utf8"));
const now = new Date().toISOString();
const cols = ["id", "name", "name_ar", "kind", "market", "lang", "parser", "endpoint", "method", "body", "mapping", "schedule", "enabled", "robots_ok", "terms_note", "official", "homepage", "listed", "disabled_reason", "created_at", "updated_at"];
const upd = ["name", "name_ar", "kind", "market", "lang", "parser", "endpoint", "method", "body", "mapping", "schedule", "robots_ok", "terms_note", "official", "homepage", "listed", "updated_at"];
const rows = S.map(s => "(" + cols.map(c => sqlLit(c === "mapping" ? JSON.stringify(s.mapping || {}) : c === "enabled" ? (s.enabled === 0 || s.enabled === false ? 0 : 1) : c === "method" ? (s.method || "GET") : c === "listed" ? (s.listed === 0 ? 0 : 1) : c === "robots_ok" ? 1 : c === "official" ? (s.official ?? 1) : c === "created_at" || c === "updated_at" ? now : s[c] ?? null)).join(",") + ")");
let sql = "";
for (let i = 0; i < rows.length; i += 20) sql += `INSERT INTO intel_sources (${cols.join(",")}) VALUES\n${rows.slice(i, i + 20).join(",\n")}\nON CONFLICT(id) DO UPDATE SET ${upd.map(c => c + "=excluded." + c).join(",")}, enabled=CASE WHEN excluded.enabled=0 THEN 0 ELSE intel_sources.enabled END, disabled_reason=CASE WHEN excluded.enabled=0 THEN excluded.disabled_reason ELSE intel_sources.disabled_reason END;\n`;
writeFileSync(join(here, "..", "seeds", "sources.sql"), sql);
console.log("seeds/sources.sql:", S.length, "sources,", S.filter(s => s.enabled !== 0 && s.enabled !== false).length, "enabled");
