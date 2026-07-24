/**
 * Builds the bundled offline Argentine drug-name database
 * (assets/drug-db-ar.json) from an ANMAT Vademécum Nacional de Medicamentos
 * (VNM) export (country-aware autocomplete — see drugDb.ts).
 *
 * Source: ANMAT VNM. There is NO current official bulk export — the open-data
 * CSVs on datos.gob.ar are monthly deltas frozen at 2018. A full, fresh dataset
 * requires scraping the public VNM consultation
 *   https://servicios.pami.org.ar/vademecum/views/consultaPublica/listado.zul
 * (e.g. the community MIT scraper afborga/ANMAT-Medicamentos-Scraper, whose
 * columns match this builder's input). Attribution shown in Settings → About.
 *
 * Input CSV columns (VNM schema, header row required):
 *   laboratorio_titular, numero_certificado, nombre_comercial, nombre_generico,
 *   concentracion, forma_farmaceutica, presentacion
 * The afborga scraper's columns (Nombre_Comercial_Presentacion, Monodroga_
 * Generico, Laboratorio, Forma_Farmaceutica, Numero_Certificado, GTIN,
 * Disponibilidad) map onto the same fields — adapt the COL map if using it.
 *
 * Usage:
 *   node scripts/build-drug-db-ar.mjs path/to/vnm.csv
 *
 * Output format (identical shape to the RxTerms builder, so the runtime search
 * engine is shared): [displayName, rxcui, strengths[], synonym]
 *   - displayName: "NOMBRE COMERCIAL (Forma farmacéutica)"
 *   - rxcui: "" (ANMAT has no RxNorm mapping; interaction-checker plumbing N/A)
 *   - strengths: distinct concentraciones, e.g. ["250 mg", "500 mg"]
 *   - synonym: the monodroga/genérico, so typing the generic finds the brand
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/build-drug-db-ar.mjs <vnm.csv>");
  process.exit(1);
}

/** Minimal RFC-4180-ish parser: handles quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  // Strip UTF-8 BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* ignore */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Title-cases an ALL-CAPS form like "COMPRIMIDO RECUBIERTO". */
function titleCase(s) {
  return s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

/** Normalizes a strength: "250 MG" → "250 mg", collapses spaces. */
function normStrength(s) {
  return s.trim().replace(/\s+/g, " ").replace(/\bMG\b/gi, "mg")
    .replace(/\bML\b/gi, "ml").replace(/\bMCG\b/gi, "mcg").replace(/\bG\b/g, "g");
}

const rows = parseCsv(readFileSync(src, "utf8"));
const header = rows.shift()?.map((h) => h.trim().toLowerCase());
if (!header || !header.includes("nombre_comercial")) {
  console.error("Unexpected header — expected VNM columns incl. nombre_comercial");
  process.exit(1);
}
const idx = (name) => header.indexOf(name);
const C = {
  brand: idx("nombre_comercial"),
  generic: idx("nombre_generico"),
  strength: idx("concentracion"),
  form: idx("forma_farmaceutica"),
};

/** @type {Map<string, {generic: string, strengths: Set<string>}>} */
const byName = new Map();
let kept = 0;

for (const r of rows) {
  const brand = (r[C.brand] ?? "").trim();
  if (!brand) continue;
  const form = C.form >= 0 ? (r[C.form] ?? "").trim() : "";
  const display = form ? `${brand} (${titleCase(form)})` : brand;
  let e = byName.get(display);
  if (!e) { e = { generic: "", strengths: new Set() }; byName.set(display, e); }
  const generic = C.generic >= 0 ? (r[C.generic] ?? "").trim() : "";
  if (generic && !e.generic) e.generic = titleCase(generic);
  const strength = C.strength >= 0 ? normStrength(r[C.strength] ?? "") : "";
  if (strength) e.strengths.add(strength);
  kept++;
}

const out = Array.from(byName.entries())
  .sort(([a], [b]) => a.localeCompare(b, "es"))
  .map(([name, e]) => [name, "", Array.from(e.strengths), e.generic]);

const dest = resolve(import.meta.dirname, "../assets/drug-db-ar.json");
writeFileSync(dest, JSON.stringify(out));

const bytes = JSON.stringify(out).length;
console.log(`rows kept: ${kept}`);
console.log(`unique display names: ${out.length}`);
console.log(`output: ${dest} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
