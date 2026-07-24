/**
 * Offline GTIN → drug lookup for the Argentine barcode scanner (F2).
 *
 * Data: assets/drug-gtin-ar.json, built by scripts/build-drug-db-ar.mjs from the
 * ANMAT VNM scrape (the VNM carries a GS1 GTIN per presentation). Shape:
 *   [[gtin14, displayName, strengths[]], …]
 * GTINs are stored zero-padded to 14 digits; the scanner normalizes the scanned
 * code the same way before lookup. Decoded lazily into a Map on first scan.
 */
import type { DrugSuggestion } from "./drugDb";

type RawGtin = [string, string, string[]];

let map: Map<string, DrugSuggestion> | null = null;

function getMap(): Map<string, DrugSuggestion> {
  if (!map) {
    const raw = require("../../assets/drug-gtin-ar.json") as RawGtin[];
    map = new Map();
    for (const [gtin, name, strengths] of raw) {
      map.set(gtin, { name, rxcui: "", strengths });
    }
  }
  return map;
}

/** Test seam: inject a small dataset instead of the bundled asset. */
export function _setGtinDatasetForTests(entries: RawGtin[] | null): void {
  map = entries
    ? new Map(entries.map(([g, n, s]) => [g, { name: n, rxcui: "", strengths: s }]))
    : null;
}

/** Resolves a 14-digit (zero-padded) GTIN to a bundled Argentine drug. */
export function lookupGtin(gtin14: string): DrugSuggestion | null {
  return getMap().get(gtin14) ?? null;
}
