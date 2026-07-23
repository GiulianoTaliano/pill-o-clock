/**
 * Duplicate-therapy checker (F2 — interaction checker v1).
 *
 * Detects when two of the user's medications share an ACTIVE INGREDIENT
 * (e.g. two products both containing acetaminophen) — the most common
 * real-world double-dosing hazard. Fully offline and authoritative: the data
 * is NLM RxTerms + RxTermsIngredients (assets/drug-ingredients.json, built by
 * scripts/build-ingredients-db.mjs), keyed by the SXDG RxCUI captured when
 * the user picks an autocomplete suggestion.
 *
 * SCOPE NOTE (do not silently expand): pairwise drug-drug INTERACTION data is
 * deliberately NOT included. We will not hand-author medical pairs; adding
 * them requires an authoritative, license-compatible dataset (the NLM
 * interaction API died in 2024; DDInter is CC-BY-NC; DrugBank is paid).
 * Until then this module answers only "do these two meds contain the same
 * ingredient?" — informational, always paired with a consult-your-doctor
 * disclaimer in the UI.
 */
import { Medication } from "../types";

interface IngredientDb {
  /** SXDG RxCUI → ingredient RxCUIs. */
  groups: Record<string, string[]>;
  /** ingredient RxCUI → ingredient name. */
  names: Record<string, string>;
}

let db: IngredientDb | null = null;

function getDb(): IngredientDb {
  if (!db) {
    db = require("../../assets/drug-ingredients.json") as IngredientDb;
  }
  return db;
}

/** Test seam. */
export function _setIngredientDbForTests(data: IngredientDb | null): void {
  db = data;
}

export interface DuplicateTherapyHit {
  /** The other medication that shares ingredients. */
  medicationName: string;
  /** Shared ingredient display names. */
  ingredients: string[];
}

/**
 * Returns the medications in `others` that share at least one active
 * ingredient with the candidate `rxcui`. Meds without a captured rxcui are
 * skipped (manual free-text entries can't be resolved offline).
 */
export function findDuplicateTherapy(
  rxcui: string | undefined,
  others: Pick<Medication, "id" | "name" | "rxcui" | "isActive">[],
  excludeId?: string
): DuplicateTherapyHit[] {
  if (!rxcui) return [];
  const data = getDb();
  const candidate = new Set(data.groups[rxcui] ?? []);
  if (candidate.size === 0) return [];

  const hits: DuplicateTherapyHit[] = [];
  for (const med of others) {
    if (!med.isActive || !med.rxcui || med.id === excludeId) continue;
    const shared = (data.groups[med.rxcui] ?? []).filter((i) => candidate.has(i));
    if (shared.length > 0) {
      hits.push({
        medicationName: med.name,
        ingredients: shared.map((i) => data.names[i] ?? i),
      });
    }
  }
  return hits;
}

/** Localized, disclaimer-suffixed body for the duplicate-therapy alert. */
export function duplicateTherapyMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  hits: DuplicateTherapyHit[]
): string {
  const lines = hits.map((h) =>
    t("interactions.dupLine", {
      name: h.medicationName,
      ingredients: h.ingredients.join(", "),
    })
  );
  lines.push("");
  lines.push(t("interactions.disclaimer"));
  return lines.join("\n");
}
