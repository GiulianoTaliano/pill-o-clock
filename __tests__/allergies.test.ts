/**
 * Allergy conflict detection + ingredient search (F3).
 *
 * Matching runs on canonical ingredient keys (see ingredients.ts), so it works
 * for catalogs that carry an RxCUI (RxTerms) AND for those that do not (ANMAT).
 * The final block exercises the REAL Argentine assets, because the whole class
 * of bug this replaces was invisible to fixture-only tests.
 */
import {
  searchIngredients,
  findAllergyConflicts,
  ingredientKeysFor,
  isAllergyCheckable,
  _setIngredientDbForTests,
} from "../src/services/interactions";
import { _setDatasetForTests } from "../src/services/drugDb";

jest.mock("../src/services/deviceCountry", () => ({
  getDrugRegion: jest.fn(() => "US"),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDrugRegion } = require("../src/services/deviceCountry");

const NLM_DB = {
  groups: {
    "100": ["7980", "1191"], // med A → penicillin G + aspirin
    "200": ["161"], //           med B → acetaminophen
  },
  names: {
    "7980": "penicillin G",
    "1191": "aspirin",
    "161": "acetaminophen",
    // Not in any group above — present so the ES→EN bridge has a real English
    // ingredient to confirm against, exactly as the full NLM tables do.
    "5640": "ibuprofen",
    "723": "amoxicillin",
  },
};

describe("with the NLM (RxCUI) catalog", () => {
  beforeEach(() => {
    getDrugRegion.mockReturnValue("US");
    _setIngredientDbForTests(NLM_DB);
    _setDatasetForTests([["Amoxidal (Oral Pill)", "100", ["500 mg"], ""]]);
  });
  afterEach(() => {
    _setIngredientDbForTests(null);
    _setDatasetForTests(null);
  });

  it("finds ingredients by prefix and substring, prefix first", () => {
    const results = searchIngredients("pen");
    expect(results[0]?.name).toBe("penicillin G");
  });

  it("requires at least 2 characters", () => {
    expect(searchIngredients("p")).toEqual([]);
  });

  it("flags an allergy pinned to an ingredient of the drug", () => {
    const conflicts = findAllergyConflicts({ rxcui: "100" }, [
      { name: "Penicilina", ingRxcui: "7980" },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].allergyName).toBe("Penicilina");
  });

  it("does not flag an unrelated drug", () => {
    expect(findAllergyConflicts({ rxcui: "200" }, [
      { name: "Penicilina", ingRxcui: "7980" },
    ])).toEqual([]);
  });

  it("does not flag an allergy that is not an ingredient of the drug", () => {
    expect(findAllergyConflicts({ rxcui: "100" }, [{ name: "Polen" }])).toEqual([]);
    expect(findAllergyConflicts({ rxcui: "100" }, [{ name: "mani" }])).toEqual([]);
  });

  it("returns nothing when the drug has no resolvable ingredients", () => {
    expect(findAllergyConflicts({}, [{ name: "Penicilina", ingRxcui: "7980" }])).toEqual([]);
    expect(findAllergyConflicts({ rxcui: "999" }, [{ name: "Penicilina", ingRxcui: "7980" }])).toEqual([]);
  });

  it("matches a free-text allergy typed in Spanish against an English ingredient", () => {
    // Previously impossible: free text was never compared at all.
    const conflicts = findAllergyConflicts({ rxcui: "200" }, [{ name: "paracetamol" }]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].allergyName).toBe("paracetamol");
  });
});

describe("with the ANMAT (no-RxCUI) catalog", () => {
  const AR_DATA: [string, string, string[], string][] = [
    ["APASMO COMPUESTO (Comprimido)", "", ["300 mg"], "Dipirona 300 Mg + Propinoxato Clorhidrato 5 Mg"],
    ["IBUPIRAC (Comprimido)", "", ["400 mg"], "Ibuprofeno 400 Mg"],
    ["AMOXIDAL (Comprimido)", "", ["500 mg"], "Amoxicilina Trihidrato 500 Mg"],
  ];

  beforeEach(() => {
    getDrugRegion.mockReturnValue("AR");
    _setIngredientDbForTests(NLM_DB);
    _setDatasetForTests(AR_DATA);
  });
  afterEach(() => {
    _setIngredientDbForTests(null);
    _setDatasetForTests(null);
  });

  it("resolves ingredients from the actives string when there is no RxCUI", () => {
    const keys = ingredientKeysFor({ name: "APASMO COMPUESTO (Comprimido)" });
    expect(keys).toContain("metamizole");
    expect(keys).toContain("propinoxato");
  });

  it("flags a Spanish allergy on a product with no RxCUI — the core regression", () => {
    const conflicts = findAllergyConflicts(
      { rxcui: "", name: "APASMO COMPUESTO (Comprimido)" },
      [{ name: "Dipirona" }]
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].allergyName).toBe("Dipirona");
    // Names the ingredient in the user's own language, not the internal key.
    expect(conflicts[0].ingredientName).toBe("Dipirona");
  });

  it("matches across the salt form", () => {
    const conflicts = findAllergyConflicts(
      { name: "AMOXIDAL (Comprimido)" },
      [{ name: "Amoxicilina" }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("matches an allergy recorded in the other language", () => {
    const conflicts = findAllergyConflicts(
      { name: "IBUPIRAC (Comprimido)" },
      [{ name: "ibuprofen" }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("offers Spanish ingredient names in the autocomplete", () => {
    const names = searchIngredients("dipi").map((s) => s.name);
    expect(names).toContain("Dipirona");
  });

  it("still does not flag an unrelated allergy", () => {
    expect(findAllergyConflicts({ name: "IBUPIRAC (Comprimido)" }, [{ name: "polen" }])).toEqual([]);
  });

  it("reports a no-RxCUI allergy as checkable, since here none of them have one", () => {
    // The UI badge hangs off this: testing for ingRxcui would label every
    // Argentine allergy "not checked" while it was in fact being checked.
    expect(isAllergyCheckable({ name: "Dipirona" })).toBe(true);
    expect(isAllergyCheckable({ name: "Ibuprofeno" })).toBe(true);
    expect(isAllergyCheckable({ name: "polen" })).toBe(false);
  });
});

describe("against the real bundled Argentine catalog", () => {
  beforeEach(() => {
    getDrugRegion.mockReturnValue("AR");
    _setIngredientDbForTests(null);
    _setDatasetForTests(null);
  });
  afterEach(() => getDrugRegion.mockReturnValue("US"));

  it("offers dipirona, which the NLM tables do not contain at all", () => {
    const names = searchIngredients("dipirona").map((s) => s.name.toLowerCase());
    expect(names.some((n) => n.includes("dipirona"))).toBe(true);
  });

  it("warns about a real dipirona product for a user allergic to dipirona", () => {
    const conflicts = findAllergyConflicts(
      { rxcui: "", name: "APASMO COMPUESTO (Comprimido Recubierto)" },
      [{ name: "dipirona" }]
    );
    expect(conflicts).toHaveLength(1);
  });

  it("switches vocabulary when the catalog changes, without a stale cache", () => {
    expect(searchIngredients("dipirona").length).toBeGreaterThan(0);
    // Same "injected dataset" identity, different contents: the caches must
    // still invalidate, or a region switch would keep serving the old country.
    _setDatasetForTests([["Only (Pill)", "", ["1 mg"], "Loratadina 10 Mg"]]);
    expect(searchIngredients("dipirona")).toEqual([]);
    expect(searchIngredients("loratadina").length).toBeGreaterThan(0);
    _setDatasetForTests(null);
  });

  it("finds ingredients for Spanish queries that returned nothing before", () => {
    for (const q of ["paracetamol", "ibuprofeno", "amoxicilina"]) {
      expect(searchIngredients(q).length).toBeGreaterThan(0);
    }
  });

  it("bridges a real English allergy onto a real Spanish product", () => {
    const conflicts = findAllergyConflicts(
      { rxcui: "", name: "ACTRON 600 RAPIDA ACCION (Capsula Blanda)" },
      [{ name: "ibuprofen" }]
    );
    expect(conflicts).toHaveLength(1);
  });
});
