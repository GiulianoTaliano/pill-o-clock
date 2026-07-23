/**
 * Builds the bundled NDC → drug lookup (assets/ndc-db.json) used by the
 * barcode-scan accelerator (F2). Joins two NLM sources:
 *
 *   1. RxNorm "Current Prescribable Content" (free, no UMLS license):
 *        https://download.nlm.nih.gov/rxnorm/RxNorm_full_prescribe_current.zip
 *      → rrf/RXNSAT.RRF rows with ATN=NDC give 11-digit NDC → RXCUI.
 *   2. An RxTerms monthly release (same source as build-drug-db.mjs)
 *      → RXCUI → SXDG_RXCUI, the key drug-db.json entries carry.
 *
 * Only NDCs whose SXDG exists in assets/drug-db.json are kept, so every hit
 * resolves to a usable autocomplete entry. Keys are truncated to NDC9
 * (labeler + product, package code dropped): package size never changes the
 * drug, and it collapses ~3x the rows.
 *
 * Output (decoded lazily by src/services/ndcDb.ts):
 *   { "sxdgs": [rxcui, ...],
 *     "ndc9": "<delta36>:<idx36>;..." }   // ndc9 ascending, delta-encoded
 *
 * Usage:
 *   node scripts/build-ndc-db.mjs path/to/rrf/RXNSAT.RRF path/to/RxTermsYYYYMM.txt
 */
import { createReadStream, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";

const [rxnsatPath, rxtermsPath] = process.argv.slice(2);
if (!rxnsatPath || !rxtermsPath) {
  console.error("Usage: node scripts/build-ndc-db.mjs <RXNSAT.RRF> <RxTermsYYYYMM.txt>");
  process.exit(1);
}

// ─── 1. RXCUI → SXDG from RxTerms (active rows only) ──────────────────────
const RXT = { RXCUI: 0, SUPPRESS_FOR: 11, IS_RETIRED: 13, SXDG_RXCUI: 14 };
const rxcuiToSxdg = new Map();
{
  const lines = readFileSync(rxtermsPath, "utf8").split("\n");
  const header = lines.shift();
  if (!header?.startsWith("RXCUI|")) {
    console.error("Unexpected header — is this an RxTerms release file?");
    process.exit(1);
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = line.split("|");
    if (c[RXT.IS_RETIRED]?.trim() || c[RXT.SUPPRESS_FOR]?.trim()) continue;
    const sxdg = c[RXT.SXDG_RXCUI]?.trim();
    if (sxdg) rxcuiToSxdg.set(c[RXT.RXCUI], sxdg);
  }
}
console.log(`RxTerms active concepts: ${rxcuiToSxdg.size}`);

// ─── 2. SXDGs that actually exist in the bundled autocomplete DB ──────────
const drugDb = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../assets/drug-db.json"), "utf8")
);
const knownSxdgs = new Set(drugDb.map((e) => e[1]).filter(Boolean));
console.log(`drug-db SXDGs: ${knownSxdgs.size}`);

// ─── 3. Stream RXNSAT: NDC attributes → ndc9 → sxdg ───────────────────────
// RXNSAT columns: RXCUI|LUI|SUI|RXAUI|STYPE|CODE|ATUI|SATUI|ATN|SAB|ATV|SUPPRESS|CVF
const SAT = { RXCUI: 0, ATN: 8, SAB: 9, ATV: 10, SUPPRESS: 11 };
const ndc9ToSxdg = new Map();
let ndcRows = 0, joined = 0, conflicts = 0;

const rl = createInterface({ input: createReadStream(rxnsatPath), crlfDelay: Infinity });
for await (const line of rl) {
  const c = line.split("|");
  if (c[SAT.ATN] !== "NDC" || c[SAT.SAB] !== "RXNORM") continue;
  if (c[SAT.SUPPRESS] && c[SAT.SUPPRESS] !== "N") continue;
  const ndc11 = c[SAT.ATV];
  if (!/^\d{11}$/.test(ndc11)) continue;
  ndcRows++;
  const sxdg = rxcuiToSxdg.get(c[SAT.RXCUI]);
  if (!sxdg || !knownSxdgs.has(sxdg)) continue;
  const ndc9 = Number(ndc11.slice(0, 9));
  const prev = ndc9ToSxdg.get(ndc9);
  if (prev === undefined) {
    ndc9ToSxdg.set(ndc9, sxdg);
    joined++;
  } else if (prev !== sxdg) {
    conflicts++; // same product code, different group — keep first, rare
  }
}
console.log(`RXNSAT NDC rows: ${ndcRows}; unique ndc9 joined: ${joined}; conflicts: ${conflicts}`);

// ─── 4. Compact delta encoding ────────────────────────────────────────────
const sxdgs = Array.from(new Set(ndc9ToSxdg.values()));
const sxdgIdx = new Map(sxdgs.map((s, i) => [s, i]));
const sorted = Array.from(ndc9ToSxdg.keys()).sort((a, b) => a - b);

let prev = 0;
const tokens = sorted.map((ndc9) => {
  const tok = `${(ndc9 - prev).toString(36)}:${sxdgIdx.get(ndc9ToSxdg.get(ndc9)).toString(36)}`;
  prev = ndc9;
  return tok;
});

const out = { sxdgs: sxdgs.map(Number), ndc9: tokens.join(";") };
const dest = resolve(import.meta.dirname, "../assets/ndc-db.json");
const json = JSON.stringify(out);
writeFileSync(dest, json);
console.log(`output: ${dest} (${(json.length / 1024 / 1024).toFixed(2)} MB, ${sorted.length} NDC9s, ${sxdgs.length} groups)`);
