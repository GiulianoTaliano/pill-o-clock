/**
 * Builds the bundled offline drug-name database (assets/drug-db.json) from an
 * RxTerms release file (F1: medication autocomplete — backlog decision D4).
 *
 * RxTerms is a drug interface terminology derived from RxNorm by the U.S.
 * National Library of Medicine, released monthly and freely downloadable:
 *   https://data.lhncbc.nlm.nih.gov/public/rxterms/release/RxTerms<YYYYMM>.zip
 * Attribution is shown in Settings → About. Refresh cadence: rebuild this
 * asset every few months (owner: release checklist).
 *
 * Usage:
 *   node scripts/build-drug-db.mjs path/to/RxTerms202606.txt
 *
 * Output format (compact array, parsed lazily at runtime by drugDb.ts):
 *   [displayName, sxdgRxcui, strengths[], synonym]
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/build-drug-db.mjs <RxTermsYYYYMM.txt>");
  process.exit(1);
}

const COL = {
  DISPLAY_NAME: 7,
  STRENGTH: 10,
  SUPPRESS_FOR: 11,
  SYNONYM: 12,
  IS_RETIRED: 13,
  SXDG_RXCUI: 14,
};

const lines = readFileSync(src, "utf8").split("\n");
const header = lines.shift();
if (!header?.startsWith("RXCUI|")) {
  console.error("Unexpected header — is this an RxTerms release file?");
  process.exit(1);
}

/** @type {Map<string, {r: string, s: Set<string>, y: string}>} */
const byName = new Map();
let rows = 0;

for (const line of lines) {
  if (!line.trim()) continue;
  const c = line.split("|");
  if (c[COL.IS_RETIRED]?.trim()) continue; // retired concept
  if (c[COL.SUPPRESS_FOR]?.trim()) continue; // suppressed for display
  const name = c[COL.DISPLAY_NAME]?.trim();
  if (!name) continue;
  rows++;
  let e = byName.get(name);
  if (!e) {
    e = { r: c[COL.SXDG_RXCUI]?.trim() ?? "", s: new Set(), y: "" };
    byName.set(name, e);
  }
  const strength = c[COL.STRENGTH]?.trim();
  if (strength) e.s.add(strength);
  const syn = c[COL.SYNONYM]?.trim();
  if (syn && !e.y) e.y = syn;
  if (!e.r) e.r = c[COL.SXDG_RXCUI]?.trim() ?? "";
}

const out = Array.from(byName.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([n, e]) => [n, e.r, Array.from(e.s), e.y]);

const dest = resolve(import.meta.dirname, "../assets/drug-db.json");
writeFileSync(dest, JSON.stringify(out));

const bytes = JSON.stringify(out).length;
console.log(`rows kept: ${rows}`);
console.log(`unique display names: ${out.length}`);
console.log(`output: ${dest} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
