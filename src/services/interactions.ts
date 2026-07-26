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
import { getActiveCatalogKey, getDrugActives, listCatalogActives } from "./drugDb";
import { canonicalKey, normalizeIngredient, parseActives } from "./ingredients";

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
  knownCache = null;
  vocabularyCache = null;
}

// ─── Canonical ingredient identity ─────────────────────────────────────────
// Both catalogs project into one comparison space (see ingredients.ts): the
// RxCUI path resolves through the NLM tables, the catalogs without an RxCUI
// (ANMAT) parse their actives string. Everything downstream compares keys, so
// no check is silently dead just because a region lacks an external vocabulary.

let knownCache: Set<string> | null = null;

/** Normalized NLM ingredient names — gates the ES→EN morphological bridge. */
function knownIngredientNames(): Set<string> {
  if (!knownCache) {
    knownCache = new Set(
      Object.values(getDb().names).map((n) => normalizeIngredient(n))
    );
  }
  return knownCache;
}

/**
 * Ingredients of a medication as canonical key → display name, from whichever
 * identity its catalog has. The display name is kept so alerts can name the
 * ingredient the way the user's own catalog does ("Dipirona", not the
 * cross-language key "metamizole").
 */
function ingredientsFor(med: { rxcui?: string; name?: string }): Map<string, string> {
  const known = knownIngredientNames();
  const found = new Map<string, string>();
  const add = (name: string) => {
    const key = canonicalKey(name, known);
    if (key && !found.has(key)) found.set(key, name.trim());
  };

  if (med.rxcui) {
    const data = getDb();
    for (const ing of data.groups[med.rxcui] ?? []) {
      const name = data.names[ing];
      if (name) add(name);
    }
  }
  // Catalogs without an RxCUI (and products the NLM tables don't group) fall
  // back to the actives string the catalog ships for this product name.
  if (found.size === 0 && med.name) {
    for (const active of parseActives(getDrugActives(med.name))) add(active);
  }
  return found;
}

/** Canonical keys for a medication — the values the checks compare on. */
export function ingredientKeysFor(med: { rxcui?: string; name?: string }): string[] {
  return Array.from(ingredientsFor(med).keys());
}

/**
 * Canonical key for a recorded allergy. Derived at check time rather than
 * stored so allergies already in the database — including the free-text ones
 * that were previously unmatchable — resolve without a migration.
 */
function allergyKey(allergy: { name: string; ingRxcui?: string }): string {
  const known = knownIngredientNames();
  const authoritative = allergy.ingRxcui
    ? getDb().names[allergy.ingRxcui]
    : undefined;
  return canonicalKey(authoritative ?? allergy.name, known);
}

export interface DuplicateTherapyHit {
  /** The other medication that shares ingredients. */
  medicationName: string;
  /** Shared ingredient display names. */
  ingredients: string[];
}

/**
 * Returns the medications in `others` that share at least one active
 * ingredient with the candidate. Identity comes from the RxCUI when the
 * catalog provides one and from the product's actives string otherwise, so
 * this works for ANMAT products too. Entries whose ingredients cannot be
 * resolved at all (hand-typed names absent from the catalog) are skipped.
 */
export function findDuplicateTherapy(
  candidate: { rxcui?: string; name?: string },
  others: Pick<Medication, "id" | "name" | "rxcui" | "isActive">[],
  excludeId?: string
): DuplicateTherapyHit[] {
  const mine = ingredientsFor(candidate);
  if (mine.size === 0) return [];

  const hits: DuplicateTherapyHit[] = [];
  for (const med of others) {
    if (!med.isActive || med.id === excludeId) continue;
    const shared = Array.from(ingredientsFor(med))
      .filter(([key]) => mine.has(key))
      .map(([, name]) => name);
    if (shared.length > 0) {
      hits.push({ medicationName: med.name, ingredients: shared });
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

// ─── Allergies (F3) ────────────────────────────────────────────────────────
// Reuses the same NLM ingredient pipeline: an allergy can be pinned to an
// ingredient RxCUI (searchable below) or stay free text (not checkable).

export interface IngredientSuggestion {
  /** Canonical key — the value the conflict check compares on. */
  key: string;
  /** Display name, in the language of the region's catalog. */
  name: string;
  /** NLM ingredient RxCUI when the suggestion came from the NLM tables. */
  rxcui?: string;
}

interface VocabularyEntry {
  key: string;
  name: string;
  rxcui?: string;
  /** Pre-normalized haystack, so a keystroke does no per-entry normalization. */
  norm: string;
}

let vocabularyCache: {
  forCatalog: string;
  entries: VocabularyEntry[];
  keys: Set<string>;
} | null = null;

/**
 * The region's ingredient vocabulary, built once per catalog. Regions whose
 * drug catalog ships an actives string (ANMAT) get their own, in their own
 * language — which is why "dipirona" is offered in Argentina even though the
 * NLM tables have no dipyrone at all (withdrawn from the US market in 1977).
 * Everyone else gets the NLM ingredient names.
 *
 * Caching matters: this feeds a per-keystroke autocomplete over ~1-2k entries,
 * and both the keys and the normalized names are far too costly to rebuild on
 * every character.
 */
function vocabulary(): { entries: VocabularyEntry[]; keys: Set<string> } {
  const catalogKey = getActiveCatalogKey();
  if (vocabularyCache?.forCatalog === catalogKey) return vocabularyCache;

  const known = knownIngredientNames();
  const build = (name: string, rxcui?: string): VocabularyEntry => ({
    key: canonicalKey(name, known),
    name: name.trim(),
    rxcui,
    norm: normalizeIngredient(name),
  });

  // Catalog-derived first (regions with their own actives strings)…
  const byKey = new Map<string, VocabularyEntry>();
  for (const actives of listCatalogActives()) {
    for (const name of parseActives(actives)) {
      const entry = build(name);
      if (entry.key && !byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
  }
  // …otherwise fall back to the NLM ingredient names.
  if (byKey.size === 0) {
    for (const [rxcui, name] of Object.entries(getDb().names)) {
      const entry = build(name, rxcui);
      if (entry.key && !byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
  }

  vocabularyCache = {
    forCatalog: catalogKey,
    entries: Array.from(byKey.values()),
    keys: new Set(byKey.keys()),
  };
  return vocabularyCache;
}

/**
 * Case/accent-insensitive ingredient search powering the allergy autocomplete.
 * Query and candidate names are normalized through the SAME function, so an
 * accented name is reachable from an unaccented query (it was not before).
 */
export function searchIngredients(query: string, limit = 6): IngredientSuggestion[] {
  const q = normalizeIngredient(query);
  if (q.length < 2) return [];
  const starts: IngredientSuggestion[] = [];
  const contains: IngredientSuggestion[] = [];
  for (const { key, name, rxcui, norm } of vocabulary().entries) {
    const i = norm.indexOf(q);
    if (i === -1) continue;
    (i === 0 ? starts : contains).push({ key, name, rxcui });
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Whether a recorded allergy participates in conflict checking — i.e. it
 * resolves to an ingredient the active catalog actually knows.
 *
 * The UI must ask this rather than testing for an ingRxcui: catalogs without
 * an RxCUI (ANMAT) produce fully checkable allergies that carry no RxCUI at
 * all, and labelling those "not checked" would be plain wrong.
 */
export function isAllergyCheckable(allergy: { name: string; ingRxcui?: string }): boolean {
  if (allergy.ingRxcui) return true;
  const key = allergyKey(allergy);
  return !!key && vocabulary().keys.has(key);
}

export interface AllergyConflict {
  /** Allergy display name as the user recorded it. */
  allergyName: string;
  /** The offending ingredient's display name. */
  ingredientName: string;
}

/**
 * Ingredients of the candidate med that match a recorded allergy, compared on
 * canonical keys. Informational, never blocking.
 *
 * A free-text allergy now matches when its text resolves to a real ingredient
 * of the same drug ("dipirona" vs "Dipirona 300 Mg"). That is exact equality
 * after normalization — still no substring or fuzzy guessing — and it is what
 * makes the check work at all in regions whose catalog carries no RxCUI.
 */
export function findAllergyConflicts(
  candidate: { rxcui?: string; name?: string },
  allergies: { name: string; ingRxcui?: string }[]
): AllergyConflict[] {
  const ingredients = ingredientsFor(candidate);
  if (ingredients.size === 0) return [];
  const conflicts: AllergyConflict[] = [];
  for (const allergy of allergies) {
    const key = allergyKey(allergy);
    const ingredientName = key ? ingredients.get(key) : undefined;
    if (ingredientName) {
      conflicts.push({ allergyName: allergy.name, ingredientName });
    }
  }
  return conflicts;
}

/** Localized, disclaimer-suffixed body for the allergy-conflict alert. */
export function allergyConflictMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  conflicts: AllergyConflict[]
): string {
  const lines = conflicts.map((c) =>
    t("interactions.allergyLine", { allergy: c.allergyName, ingredient: c.ingredientName })
  );
  lines.push("");
  lines.push(t("interactions.disclaimer"));
  return lines.join("\n");
}
