/**
 * Offline drug-name autocomplete — country-aware (F1 — backlog decision D4).
 *
 * The catalog served depends on the device region (see deviceCountry.ts):
 *   - AR  → assets/drug-db-ar.json (ANMAT VNM; scripts/build-drug-db-ar.mjs)
 *   - else → assets/drug-db.json    (RxTerms/NLM; scripts/build-drug-db.mjs)
 * Both share this file's search engine and the compact on-disk shape
 *   [displayName, rxcui, strengths[], synonym]
 * so adding a country = one loader + one asset + one REGION_TO_CATALOG entry.
 *
 * The datasets ASSIST entry — free text is ALWAYS allowed — and the RxCUI (US
 * only; "" for ANMAT) feeds the interaction/duplicate-therapy checker. Loaded
 * lazily on first search; each catalog's index is parsed once and cached.
 */
import { getDrugRegion } from "./deviceCountry";

/** [displayName, sxdgRxcui, strengths, synonym] — see the builder scripts. */
type RawEntry = [string, string, string[], string];

export interface DrugSuggestion {
  /** Human-facing display name, e.g. "Ibuprofen (Oral Pill)". */
  name: string;
  /** RxNorm SXDG RxCUI ("" when unknown — always "" for ANMAT). */
  rxcui: string;
  /** Available strengths, e.g. ["200 mg", "400 mg"]. */
  strengths: string[];
}

interface IndexedEntry extends DrugSuggestion {
  /** Normalized haystack: name + synonym, lowercased, accents stripped. */
  norm: string;
}

// ─── Catalog registry (country-aware) ──────────────────────────────────────

type CatalogId = "intl" | "ar";

interface CatalogDef {
  /** Lazy require so an asset is only bundled-parsed when its country needs it. */
  load: () => RawEntry[];
  /** i18n key for the required source attribution shown under the suggestions. */
  attributionKey: string;
}

const CATALOGS: Record<CatalogId, CatalogDef> = {
  intl: {
    load: () => require("../../assets/drug-db.json") as RawEntry[],
    attributionKey: "form.drugDbAttribution",
  },
  ar: {
    load: () => require("../../assets/drug-db-ar.json") as RawEntry[],
    attributionKey: "form.drugDbAttributionAr",
  },
};

/** ISO-3166 region → catalog. Unlisted regions fall back to DEFAULT_CATALOG. */
const REGION_TO_CATALOG: Partial<Record<string, CatalogId>> = {
  AR: "ar",
};
const DEFAULT_CATALOG: CatalogId = "intl";

function activeCatalogId(): CatalogId {
  const region = getDrugRegion();
  return (region && REGION_TO_CATALOG[region]) || DEFAULT_CATALOG;
}

/** Metadata for the active catalog (e.g. the attribution line for the UI). */
export function getActiveDrugCatalog(): { attributionKey: string } {
  return { attributionKey: CATALOGS[activeCatalogId()].attributionKey };
}

// ─── Index build + cache (per catalog) ─────────────────────────────────────

const indexes: Partial<Record<CatalogId, IndexedEntry[]>> = {};
let testIndex: IndexedEntry[] | null = null;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function buildIndex(raw: RawEntry[]): IndexedEntry[] {
  return raw.map(([name, rxcui, strengths, synonym]) => ({
    name,
    rxcui,
    strengths,
    norm: normalize(synonym ? `${name} ${synonym}` : name),
  }));
}

function getIndex(): IndexedEntry[] {
  if (testIndex) return testIndex;
  const id = activeCatalogId();
  if (!indexes[id]) indexes[id] = buildIndex(CATALOGS[id].load());
  return indexes[id]!;
}

/** Test seam: inject a small dataset (bypasses region + asset loading). */
export function _setDatasetForTests(raw: RawEntry[] | null): void {
  testIndex = raw ? buildIndex(raw) : null;
}

// ─── Search ────────────────────────────────────────────────────────────────

/**
 * Finds the entry for a given SXDG RxCUI (used by the barcode scanner to turn
 * an NDC hit into a prefillable suggestion). First match in sorted-name order.
 */
export function searchDrugsByRxcui(rxcui: string): DrugSuggestion | null {
  if (!rxcui) return null;
  for (const { name, rxcui: r, strengths } of getIndex()) {
    if (r === rxcui) return { name, rxcui: r, strengths };
  }
  return null;
}

/**
 * Searches the active catalog. Ranking:
 *   1. name starts with the query
 *   2. any word in the name starts with the query
 *   3. name contains the query
 * Requires ≥ 2 characters; returns at most `limit` results.
 */
export function searchDrugs(query: string, limit = 6): DrugSuggestion[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];

  const starts: DrugSuggestion[] = [];
  const wordStarts: DrugSuggestion[] = [];
  const contains: DrugSuggestion[] = [];

  for (const e of getIndex()) {
    const i = e.norm.indexOf(q);
    if (i === -1) continue;
    if (i === 0) starts.push(e);
    else if (/[\s(/-]/.test(e.norm[i - 1] ?? "")) wordStarts.push(e);
    else contains.push(e);
    // Early exit once the best bucket alone can fill the limit.
    if (starts.length >= limit) break;
  }

  return [...starts, ...wordStarts, ...contains].slice(0, limit).map(
    ({ name, rxcui, strengths }) => ({ name, rxcui, strengths })
  );
}
