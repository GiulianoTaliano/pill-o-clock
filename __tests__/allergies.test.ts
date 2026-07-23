/**
 * Allergy conflict detection + ingredient search (F3) — reuses the NLM
 * ingredient pipeline from the duplicate-therapy checker.
 */
import {
  searchIngredients,
  findAllergyConflicts,
  _setIngredientDbForTests,
} from "../src/services/interactions";

beforeEach(() => {
  _setIngredientDbForTests({
    groups: {
      "100": ["7980", "1191"], // med A → penicillin G + aspirin
      "200": ["161"], //           med B → acetaminophen
    },
    names: {
      "7980": "penicillin G",
      "1191": "aspirin",
      "161": "acetaminophen",
    },
  });
});

afterEach(() => _setIngredientDbForTests(null));

describe("searchIngredients", () => {
  it("finds by prefix and substring, prefix first", () => {
    const results = searchIngredients("pen");
    expect(results[0]).toEqual({ rxcui: "7980", name: "penicillin G" });
  });

  it("requires two characters", () => {
    expect(searchIngredients("p")).toEqual([]);
  });
});

describe("findAllergyConflicts", () => {
  const penicillinAllergy = { name: "Penicilina", ingRxcui: "7980" };
  const freeTextAllergy = { name: "Polen" };

  it("flags a med containing the allergy ingredient", () => {
    const conflicts = findAllergyConflicts("100", [penicillinAllergy, freeTextAllergy]);
    expect(conflicts).toEqual([
      { allergyName: "Penicilina", ingredientName: "penicillin G" },
    ]);
  });

  it("never matches free-text allergies (no string guessing)", () => {
    expect(findAllergyConflicts("100", [freeTextAllergy])).toEqual([]);
  });

  it("clean med → no conflicts; no rxcui → no check", () => {
    expect(findAllergyConflicts("200", [penicillinAllergy])).toEqual([]);
    expect(findAllergyConflicts(undefined, [penicillinAllergy])).toEqual([]);
  });
});
