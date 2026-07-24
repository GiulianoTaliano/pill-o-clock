/**
 * Builds the bundled Argentine drug assets from an ANMAT VNM scrape:
 *   assets/drug-db-ar.json   — name autocomplete (shared shape, see drugDb.ts)
 *   assets/drug-gtin-ar.json  — GTIN → drug, for the AR barcode scanner
 *
 * Source: the VNM public consultation, scraped per-laboratorio (the GTIN column
 * is present but hidden, so it must be read via textContent — the reason older
 * scrapes reported empty GTINs). Attribution: ANMAT VNM (Settings → About).
 *
 * Input CSV columns (from the scraper): cert, lab, com, forma, pres, gtin, gen
 *   com  = nombre comercial (e.g. "IBUXIM")
 *   forma= forma farmacéutica (e.g. "COMPRIMIDO")
 *   pres = presentación (e.g. "BLISTER por 10 UNIDADES")
 *   gtin = GS1 GTIN (may be empty for some products)
 *   gen  = monodroga + concentración (e.g. "IBUPROFENO 600 MG")
 *
 * Usage: node scripts/build-drug-db-ar.mjs path/to/vnm_out.csv
 *
 * Name asset shape (identical to RxTerms): [displayName, "", strengths[], synonym]
 *   displayName "NOMBRE COMERCIAL (Forma)", synonym = gen (search by active).
 * GTIN asset shape: [[gtin, displayName, strengths[]], …] (Map-built at runtime).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/build-drug-db-ar.mjs <vnm_out.csv>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

/** Pulls strength tokens ("400 mg", "25000 u") out of the monodroga string. */
function strengthsFromGen(gen) {
  const out = [];
  const re = /(\d[\d.,]*)\s*(mg|mcg|g|ml|ui|u|%)\b/gi;
  let m;
  while ((m = re.exec(gen))) out.push(`${m[1].replace(",", ".")} ${m[2].toLowerCase()}`);
  return out;
}

/** GTIN as bundled: 14-digit, zero-padded. The scanner normalizes on lookup. */
function normGtin(g) {
  const d = (g || "").replace(/\D/g, "");
  return d ? d.padStart(14, "0") : "";
}

const rows = parseCsv(readFileSync(src, "utf8"));
const header = rows.shift()?.map((h) => h.trim().toLowerCase());
const need = ["com", "forma", "pres", "gtin", "gen"];
if (!header || !need.every((c) => header.includes(c))) {
  console.error("Unexpected header — expected scrape columns: " + need.join(", "));
  process.exit(1);
}
const ix = Object.fromEntries(header.map((h, i) => [h, i]));

/** @type {Map<string, {gen: string, strengths: Set<string>}>} display → entry */
const byName = new Map();
/** @type {Map<string, [string, string[]]>} gtin → [displayName, strengths] */
const byGtin = new Map();

for (const r of rows) {
  const com = (r[ix.com] || "").trim();
  if (!com) continue;
  const forma = (r[ix.forma] || "").trim();
  const gen = (r[ix.gen] || "").trim();
  const display = forma ? `${com} (${titleCase(forma)})` : com;
  const strengths = strengthsFromGen(gen);

  let e = byName.get(display);
  if (!e) { e = { gen: "", strengths: new Set() }; byName.set(display, e); }
  if (gen && !e.gen) e.gen = titleCase(gen);
  strengths.forEach((s) => e.strengths.add(s));

  const gtin = normGtin(r[ix.gtin]);
  if (gtin && !byGtin.has(gtin)) byGtin.set(gtin, [display, strengths]);
}

const names = Array.from(byName.entries())
  .sort(([a], [b]) => a.localeCompare(b, "es"))
  .map(([name, e]) => [name, "", Array.from(e.strengths), e.gen]);

const gtins = Array.from(byGtin.entries())
  .map(([g, [name, str]]) => [g, name, str]);

const nameDest = resolve(import.meta.dirname, "../assets/drug-db-ar.json");
const gtinDest = resolve(import.meta.dirname, "../assets/drug-gtin-ar.json");
writeFileSync(nameDest, JSON.stringify(names));
writeFileSync(gtinDest, JSON.stringify(gtins));

const mb = (o) => (JSON.stringify(o).length / 1024 / 1024).toFixed(2);
console.log(`input rows: ${rows.length}`);
console.log(`names: ${names.length} (${mb(names)} MB) → ${nameDest}`);
console.log(`gtins: ${gtins.length} (${mb(gtins)} MB) → ${gtinDest}`);
