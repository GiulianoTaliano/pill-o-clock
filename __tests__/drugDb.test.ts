/**
 * Unit tests for the offline drug autocomplete (F1).
 * Uses the test seam to avoid loading the bundled 0.6 MB asset.
 */
import { searchDrugs, _setDatasetForTests } from "../src/services/drugDb";

const DATA: [string, string, string[], string][] = [
  ["Ibuprofen (Oral Pill)", "1152222", ["200 mg", "400 mg"], ""],
  ["Acetaminophen/Ibuprofen (Oral Pill)", "1151553", ["250-125 mg"], "APAP"],
  ["IBUPROHM (Oral Pill)", "1152230", ["200 mg"], ""],
  ["Enalapril (Oral Pill)", "1153650", ["5 mg", "10 mg", "20 mg"], ""],
  ["hydroCHLOROthiazide (Oral Pill)", "1152110", ["25 mg"], "HCTZ"],
];

describe("drugDb.searchDrugs", () => {
  beforeAll(() => _setDatasetForTests(DATA));
  afterAll(() => _setDatasetForTests(null));

  it("requires at least 2 characters", () => {
    expect(searchDrugs("")).toEqual([]);
    expect(searchDrugs("i")).toEqual([]);
  });

  it("ranks name-prefix matches before word and substring matches", () => {
    const names = searchDrugs("ibu").map((s) => s.name);
    expect(names[0]).toBe("Ibuprofen (Oral Pill)");
    // word-boundary match (after "/") comes before none here; substring later
    expect(names).toContain("Acetaminophen/Ibuprofen (Oral Pill)");
    expect(names).toContain("IBUPROHM (Oral Pill)");
  });

  it("is case- and accent-insensitive", () => {
    expect(searchDrugs("ENALAPRIL")[0]?.name).toBe("Enalapril (Oral Pill)");
    expect(searchDrugs("enálapril".normalize("NFC"))[0]?.name).toBe("Enalapril (Oral Pill)");
  });

  it("matches synonyms (e.g. HCTZ)", () => {
    expect(searchDrugs("hctz")[0]?.name).toBe("hydroCHLOROthiazide (Oral Pill)");
  });

  it("returns strengths and rxcui", () => {
    const hit = searchDrugs("enala")[0]!;
    expect(hit.rxcui).toBe("1153650");
    expect(hit.strengths).toEqual(["5 mg", "10 mg", "20 mg"]);
  });

  it("honors the result limit", () => {
    expect(searchDrugs("oral", 2).length).toBeLessThanOrEqual(2);
  });
});
