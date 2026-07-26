/**
 * Ingredient identity (country-agnostic allergy/duplicate matching).
 * These rules are what let a catalog with no RxCUI (ANMAT) take part in the
 * safety checks at all, so they are pinned tightly.
 */
import {
  normalizeIngredient,
  stripSalts,
  parseActives,
  canonicalKey,
} from "../src/services/ingredients";

describe("normalizeIngredient", () => {
  it("folds case, accents and punctuation", () => {
    expect(normalizeIngredient("Ácido Acetilsalicílico")).toBe("acido acetilsalicilico");
    expect(normalizeIngredient("  IBUPROFENO  ")).toBe("ibuprofeno");
    expect(normalizeIngredient("Amoxicilina/Clavulánico")).toBe("amoxicilina clavulanico");
  });

  it("normalizes a query and a stored name identically", () => {
    // The asymmetry this replaces meant an accented name was unreachable.
    expect(normalizeIngredient("acido folico")).toBe(normalizeIngredient("Ácido Fólico"));
  });
});

describe("stripSalts", () => {
  it("removes salt qualifiers before and after the moiety", () => {
    expect(stripSalts("clorhidrato de labetalol")).toBe("labetalol");
    expect(stripSalts("apomorfina clorhidrato")).toBe("apomorfina");
    expect(stripSalts("amoxicilina trihidrato")).toBe("amoxicilina");
    expect(stripSalts("metoprolol succinate")).toBe("metoprolol");
  });

  it("reduces a salt phrase to its moiety", () => {
    expect(stripSalts("gluconato de calcio")).toBe("calcio");
    expect(stripSalts("cloruro de sodio")).toBe("sodio");
  });

  it("never returns empty when the name is nothing but salt terms", () => {
    expect(stripSalts("clorhidrato")).toBe("clorhidrato");
    expect(stripSalts("sulfato de potasico")).toBe("sulfato de potasico");
  });
});

describe("parseActives", () => {
  it("splits a combination and drops the dose", () => {
    expect(parseActives("Dipirona 300 Mg + Propinoxato Clorhidrato 5 Mg")).toEqual([
      "Dipirona",
      "Propinoxato Clorhidrato",
    ]);
  });

  it("drops parenthetical and 'como' salt asides", () => {
    expect(parseActives("Acido Clavulanico (como Clavulanato De Potasio) 125 Mg + Amoxicilina Trihidrato 875 Mg"))
      .toEqual(["Acido Clavulanico", "Amoxicilina Trihidrato"]);
    expect(parseActives("Vitamina B1 Como Clorhidrato De Tiamina 100 Mg")).toEqual(["Vitamina B1"]);
  });

  it("handles a single active and concentration-style doses", () => {
    expect(parseActives("Ofloxacina 300 Mg")).toEqual(["Ofloxacina"]);
    expect(parseActives("Lidocaina Clorhidrato 2 G / 100 Ml")).toEqual(["Lidocaina Clorhidrato"]);
  });

  it("returns nothing for an empty actives string", () => {
    expect(parseActives("")).toEqual([]);
  });
});

describe("canonicalKey", () => {
  const known = new Set(["acetaminophen", "ibuprofen", "amoxicillin", "aspirin", "omeprazole"]);

  it("maps Spanish INN names onto the English ingredient via morphology", () => {
    expect(canonicalKey("Ibuprofeno", known)).toBe("ibuprofen");
    expect(canonicalKey("Amoxicilina", known)).toBe("amoxicillin");
    expect(canonicalKey("Omeprazol", known)).toBe("omeprazole");
  });

  it("uses the explicit map where morphology cannot reach", () => {
    expect(canonicalKey("Paracetamol", known)).toBe("acetaminophen");
    expect(canonicalKey("Ácido Acetilsalicílico", known)).toBe("aspirin");
  });

  it("gives dipyrone/metamizole one key even though RxNorm has neither", () => {
    const k = canonicalKey("Dipirona", known);
    expect(k).toBe("metamizole");
    expect(canonicalKey("metamizol", known)).toBe(k);
    expect(canonicalKey("Dipyrone", known)).toBe(k);
  });

  it("agrees across salt forms and languages", () => {
    expect(canonicalKey("Amoxicilina Trihidrato", known)).toBe(canonicalKey("amoxicillin", known));
  });

  it("does not invent an English form that is not a real ingredient", () => {
    // "boldo" has no English counterpart in `known`; it must stay itself
    // rather than being mangled into a spurious match.
    expect(canonicalKey("Boldo", known)).toBe("boldo");
  });

  it("is stable without a known-name set (same-catalog matching still works)", () => {
    expect(canonicalKey("Ibuprofeno")).toBe("ibuprofeno");
    expect(canonicalKey("Ibuprofeno")).toBe(canonicalKey("IBUPROFENO"));
  });
});
