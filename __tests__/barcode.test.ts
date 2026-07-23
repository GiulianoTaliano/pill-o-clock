/**
 * Unit tests for the barcode → NDC → drug resolution pipeline (F2).
 */
import { ndc10FromBarcode, ndc9Candidates, resolveBarcode } from "../src/services/barcode";
import { _setNdcDatasetForTests, lookupNdc9 } from "../src/services/ndcDb";
import { _setDatasetForTests } from "../src/services/drugDb";

afterEach(() => {
  _setNdcDatasetForTests(null);
  _setDatasetForTests(null);
});

describe("ndc10FromBarcode", () => {
  it("extracts the NDC from a drug UPC-A (number system 3)", () => {
    expect(ndc10FromBarcode("upc_a", "312345678908")).toBe("1234567890");
  });

  it("rejects a non-drug UPC-A", () => {
    expect(ndc10FromBarcode("upc_a", "712345678908")).toBeNull();
  });

  it("extracts the NDC from an EAN-13 with the 03 prefix", () => {
    expect(ndc10FromBarcode("ean13", "0312345678908")).toBe("1234567890");
  });

  it("rejects a retail EAN-13 (Argentine GS1 prefix 779)", () => {
    expect(ndc10FromBarcode("ean13", "7791234567890")).toBeNull();
  });

  it("extracts the NDC from a GS1 DataMatrix GTIN-14", () => {
    // AI 01 + GTIN-14 (indicator 0, prefix 03, NDC 1234567890, check 8),
    // followed by another AI (17 = expiry).
    expect(ndc10FromBarcode("datamatrix", "01003123456789081726123110LOT42")).toBe("1234567890");
  });

  it("extracts the NDC from a human-readable GS1 string", () => {
    expect(ndc10FromBarcode("qr", "(01)00312345678908(10)LOT42")).toBe("1234567890");
  });

  it("rejects a GTIN-14 without the US drug prefix", () => {
    expect(ndc10FromBarcode("datamatrix", "0107791234567895")).toBeNull();
  });

  it("ignores unsupported symbologies", () => {
    expect(ndc10FromBarcode("pdf417", "312345678908")).toBeNull();
  });
});

describe("ndc9Candidates", () => {
  it("returns the three possible labeler+product normalizations", () => {
    expect(ndc9Candidates("1234567890")).toEqual([
      "123456789", // 5-4-1
      "012345678", // 4-4-2
      "123450678", // 5-3-2
    ]);
  });

  it("rejects malformed input", () => {
    expect(ndc9Candidates("12345")).toEqual([]);
  });
});

describe("lookupNdc9 + resolveBarcode", () => {
  beforeEach(() => {
    _setNdcDatasetForTests([[123456789, "500"]]);
    _setDatasetForTests([
      ["Ibuprofen (Oral Pill)", "500", ["200 mg", "400 mg"], "Advil"],
    ]);
  });

  it("resolves a known NDC9 to its SXDG RxCUI", () => {
    expect(lookupNdc9("123456789")).toBe("500");
    expect(lookupNdc9("999999999")).toBeNull();
  });

  it("resolves a scanned UPC-A end to end", () => {
    const match = resolveBarcode("upc_a", "312345678908");
    expect(match).not.toBeNull();
    expect(match!.suggestion.name).toBe("Ibuprofen (Oral Pill)");
    expect(match!.suggestion.rxcui).toBe("500");
    expect(match!.ndc9).toBe("123456789");
  });

  it("returns null when the NDC is not in the database", () => {
    _setNdcDatasetForTests([[111111111, "500"]]);
    expect(resolveBarcode("upc_a", "312345678908")).toBeNull();
  });

  it("returns null for a code with no NDC payload", () => {
    expect(resolveBarcode("ean13", "7791234567890")).toBeNull();
  });
});
