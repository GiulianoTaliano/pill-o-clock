/**
 * Builds the bundled ingredient map (assets/drug-ingredients.json) used by the
 * duplicate-therapy checker (F2). Source: an RxTerms monthly release —
 * RxTerms<YYYYMM>.txt (RXCUI → SXDG group) + RxTermsIngredients<YYYYMM>.txt
 * (RXCUI → active ingredients, with RxNorm ingredient RXCUIs).
 *
 * Usage:
 *   node scripts/build-ingredients-db.mjs /path/RxTerms202606.txt /path/RxTermsIngredients202606.txt
 *
 * Output shape (see src/services/interactions.ts):
 *   { groups: { [sxdgRxcui]: ingRxcui[] }, names: { [ingRxcui]: ingredientName } }
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const [mainPath, ingPath] = process.argv.slice(2);
if (!mainPath || !ingPath) {
  console.error("Usage: node scripts/build-ingredients-db.mjs <RxTerms.txt> <RxTermsIngredients.txt>");
  process.exit(1);
}

// RXCUI -> SXDG group id (skip retired/suppressed rows, mirrors drug-db).
const rxcuiToGroup = new Map();
{
  const lines = readFileSync(mainPath, "utf8").split("\n");
  lines.shift(); // header
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = line.split("|");
    if (c[13]?.trim() || c[11]?.trim()) continue; // IS_RETIRED / SUPPRESS_FOR
    const rxcui = c[0]?.trim();
    const sxdg = c[14]?.trim();
    if (rxcui && sxdg) rxcuiToGroup.set(rxcui, sxdg);
  }
}

/** @type {Map<string, Set<string>>} */
const groups = new Map();
/** @type {Map<string, string>} */
const names = new Map();
{
  const lines = readFileSync(ingPath, "utf8").split("\n");
  lines.shift(); // header: RXCUI|INGREDIENT|ING_RXCUI
  for (const line of lines) {
    if (!line.trim()) continue;
    const [rxcui, ingredient, ingRxcui] = line.split("|").map((s) => s?.trim());
    if (!rxcui || !ingRxcui) continue;
    const group = rxcuiToGroup.get(rxcui);
    if (!group) continue;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(ingRxcui);
    if (ingredient && !names.has(ingRxcui)) names.set(ingRxcui, ingredient);
  }
}

const out = {
  groups: Object.fromEntries(
    Array.from(groups.entries()).map(([g, s]) => [g, Array.from(s)])
  ),
  names: Object.fromEntries(names),
};

const dest = resolve(import.meta.dirname, "../assets/drug-ingredients.json");
writeFileSync(dest, JSON.stringify(out));
console.log(`groups: ${groups.size}, ingredients: ${names.size}`);
console.log(`output: ${dest} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
