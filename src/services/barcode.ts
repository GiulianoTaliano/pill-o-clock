/**
 * Barcode → medication resolution (F2 — accelerator over the autocomplete).
 *
 * Supported carriers on US drug packaging:
 *   - UPC-A (12 digits, number system 3): digits 2–11 are the 10-digit NDC.
 *   - EAN-13 starting "03": UPC-A with a leading 0, same NDC payload.
 *   - GS1 DataMatrix / Code 128 / QR: AI (01) carries a GTIN-14 whose
 *     digits 4–13 are the 10-digit NDC (indicator + "03" prefix + check).
 *
 * A raw 10-digit NDC is ambiguous (4-4-2, 5-3-2 or 5-4-1 segmenting), so we
 * derive up to three NDC9 (labeler+product) candidates and try each against
 * the bundled NDC database. Codes that don't resolve (e.g. Argentine EAN-13
 * retail codes — GS1 prefix 779) simply return null: the UI degrades to the
 * regular autocomplete, never blocking manual entry.
 */
import { lookupNdc9 } from "./ndcDb";
import { searchDrugsByRxcui, DrugSuggestion } from "./drugDb";
import { lookupGtin } from "./gtinDb";
import { getDrugRegion } from "./deviceCountry";

/**
 * Regions whose drug packaging this scanner can resolve offline:
 *   - US: NDC-in-barcode → RxNorm (assets/ndc-db.json).
 *   - AR: GS1 GTIN → ANMAT drug (assets/drug-gtin-ar.json). The VNM does carry
 *     a GTIN per presentation — the field is hidden in the UI, which is why
 *     earlier scrapes reported it empty; reading it via textContent recovers it.
 * Regions without a bundled mapping are absent, and the UI hides the scan
 * button there rather than offering a control that can never match a local box.
 * Brazil (ANVISA CMED publishes EAN/GTIN) is the natural next region to add.
 */
const SCAN_SUPPORTED_REGIONS = new Set<string>(["US", "AR"]);

/** Whether to surface the barcode-scan button for the given/active region. */
export function isBarcodeScanSupported(
  region: string | null = getDrugRegion()
): boolean {
  return !!region && SCAN_SUPPORTED_REGIONS.has(region);
}

/** GS1 element string: AI 01 = GTIN-14; bare, GS-separated or "(01)" form. */
const GS1_GTIN = /(?:^|\x1d)01(\d{14})/;
const GS1_GTIN_HRI = /\(01\)(\d{14})/;

/** Extracts the 10-digit NDC payload from a scanned barcode, if any. */
export function ndc10FromBarcode(type: string, data: string): string | null {
  const d = data.trim();
  switch (type) {
    case "upc_a":
      return /^3\d{11}$/.test(d) ? d.slice(1, 11) : null;
    case "ean13":
      return /^03\d{11}$/.test(d) ? d.slice(2, 12) : null;
    case "datamatrix":
    case "code128":
    case "qr": {
      const m = GS1_GTIN.exec(d) ?? GS1_GTIN_HRI.exec(d);
      if (!m) return null;
      const gtin = m[1];
      // US drug GTIN-14: indicator digit + "03" + NDC10 + check digit.
      return gtin.slice(1, 3) === "03" ? gtin.slice(3, 13) : null;
    }
    default:
      return null;
  }
}

/**
 * The three possible NDC9 normalizations of a raw 10-digit NDC — the missing
 * zero can pad the labeler (4-4-2), the product (5-3-2), or nothing (5-4-1).
 */
export function ndc9Candidates(ndc10: string): string[] {
  if (!/^\d{10}$/.test(ndc10)) return [];
  return [
    ndc10.slice(0, 9), //                     5-4-1: first nine digits as-is
    "0" + ndc10.slice(0, 8), //               4-4-2: pad labeler
    ndc10.slice(0, 5) + "0" + ndc10.slice(5, 8), // 5-3-2: pad product
  ];
}

export interface BarcodeMatch {
  suggestion: DrugSuggestion;
  /** US path: the NDC9 that matched. */
  ndc9?: string;
  /** AR path: the 14-digit GTIN that matched. */
  gtin?: string;
}

/** US: scanned code → NDC10 → NDC9 candidates → RxNorm → drug. */
function resolveBarcodeUs(type: string, data: string): BarcodeMatch | null {
  const ndc10 = ndc10FromBarcode(type, data);
  if (!ndc10) return null;
  for (const ndc9 of ndc9Candidates(ndc10)) {
    const rxcui = lookupNdc9(ndc9);
    if (!rxcui) continue;
    const suggestion = searchDrugsByRxcui(rxcui);
    if (suggestion) return { suggestion, ndc9 };
  }
  return null;
}

/** Extracts a zero-padded 14-digit GTIN from a scanned code, if any. */
export function gtin14FromBarcode(type: string, data: string): string | null {
  const d = data.trim();
  switch (type) {
    case "ean13":
      return /^\d{13}$/.test(d) ? d.padStart(14, "0") : null;
    case "upc_a":
      return /^\d{12}$/.test(d) ? d.padStart(14, "0") : null;
    case "datamatrix":
    case "code128":
    case "qr": {
      const m = GS1_GTIN.exec(d) ?? GS1_GTIN_HRI.exec(d);
      return m ? m[1] : null;
    }
    default:
      return null;
  }
}

/** AR: scanned code → GS1 GTIN → ANMAT drug. */
function resolveBarcodeAr(type: string, data: string): BarcodeMatch | null {
  const gtin = gtin14FromBarcode(type, data);
  if (!gtin) return null;
  const suggestion = lookupGtin(gtin);
  return suggestion ? { suggestion, gtin } : null;
}

/**
 * Full pipeline: scanned (type, data) → drug suggestion, routed by the active
 * region. Returns null when the code carries no resolvable id or the id isn't
 * in the bundled database — the form then falls back to manual entry.
 */
export function resolveBarcode(type: string, data: string): BarcodeMatch | null {
  return getDrugRegion() === "AR"
    ? resolveBarcodeAr(type, data)
    : resolveBarcodeUs(type, data);
}
