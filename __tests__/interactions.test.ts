/**
 * Unit tests for the duplicate-therapy checker (F2 interaction checker v1).
 */
import {
  findDuplicateTherapy,
  _setIngredientDbForTests,
} from "../src/services/interactions";

const DB = {
  groups: {
    // Tylenol-like (acetaminophen)
    g1: ["i-apap"],
    // Combo cold product (acetaminophen + dextromethorphan)
    g2: ["i-apap", "i-dxm"],
    // Ibuprofen product
    g3: ["i-ibu"],
  },
  names: { "i-apap": "acetaminophen", "i-dxm": "dextromethorphan", "i-ibu": "ibuprofen" },
};

const med = (id: string, name: string, rxcui?: string, isActive = true) => ({
  id,
  name,
  rxcui,
  isActive,
});

describe("findDuplicateTherapy", () => {
  beforeAll(() => _setIngredientDbForTests(DB));
  afterAll(() => _setIngredientDbForTests(null));

  it("detects a shared ingredient across two products", () => {
    const hits = findDuplicateTherapy("g1", [med("a", "Resfriol", "g2")]);
    expect(hits).toHaveLength(1);
    expect(hits[0].medicationName).toBe("Resfriol");
    expect(hits[0].ingredients).toEqual(["acetaminophen"]);
  });

  it("returns nothing when no ingredients overlap", () => {
    expect(findDuplicateTherapy("g1", [med("a", "Ibupirac", "g3")])).toEqual([]);
  });

  it("skips inactive meds, meds without rxcui, and the excluded id", () => {
    const others = [
      med("a", "Inactivo", "g2", false),
      med("b", "SinRxcui", undefined),
      med("c", "YoMismo", "g2"),
    ];
    expect(findDuplicateTherapy("g1", others, "c")).toEqual([]);
  });

  it("no candidate rxcui or unknown group → empty", () => {
    expect(findDuplicateTherapy(undefined, [med("a", "X", "g2")])).toEqual([]);
    expect(findDuplicateTherapy("unknown", [med("a", "X", "g2")])).toEqual([]);
  });

  it("reports multiple conflicting meds", () => {
    const hits = findDuplicateTherapy("g2", [
      med("a", "Tafirol", "g1"),
      med("b", "OtroCombo", "g2"),
    ]);
    expect(hits.map((h) => h.medicationName)).toEqual(["Tafirol", "OtroCombo"]);
  });
});
