/**
 * Ingredient identity — the country-agnostic layer that lets allergy and
 * duplicate-therapy checks work across catalogs that share no vocabulary.
 *
 * WHY THIS EXISTS: the RxTerms (intl) catalog keys every product to an RxCUI,
 * so ingredients resolve through assets/drug-ingredients.json. The ANMAT (AR)
 * catalog has no RxCUI at all — its only ingredient signal is the free-text
 * monodroga string ("Dipirona 300 Mg + Propinoxato Clorhidrato 5 Mg"). Before
 * this module every Argentine medication silently skipped BOTH checks.
 *
 * The bridge is a canonical key: a normalized ingredient name, salt/ester
 * stripped, with Spanish INN names mapped onto their English counterpart when
 * one demonstrably exists. Both catalogs project into that one space.
 *
 * Adding a country = make its catalog yield ingredient names (an RxCUI group
 * or a parseable actives string); no change is needed here.
 */

/** Explicit ES→EN pairs. Morphology can't derive these, so they are listed. */
const SYNONYMS: Record<string, string> = {
  // Not in RxNorm at all (withdrawn from the US market in 1977) but extremely
  // common in Latin America — the canonical key is its INN, metamizole.
  dipirona: "metamizole",
  dipyrone: "metamizole",
  metamizol: "metamizole",
  "metamizol sodico": "metamizole",
  novalgina: "metamizole",
  // Irregular ES↔EN pairs.
  paracetamol: "acetaminophen",
  aspirina: "aspirin",
  "acido acetilsalicilico": "aspirin",
  "vitamina c": "ascorbic acid",
  "acido ascorbico": "ascorbic acid",
  "vitamina b1": "thiamine",
  tiamina: "thiamine",
  "vitamina b6": "pyridoxine",
  piridoxina: "pyridoxine",
  "vitamina b12": "cyanocobalamin",
  cianocobalamina: "cyanocobalamin",
  "acido folico": "folic acid",
  "vitamina d": "cholecalciferol",
  "vitamina d3": "cholecalciferol",
  colecalciferol: "cholecalciferol",
  "vitamina a": "retinol",
  "vitamina e": "tocopherol",
  adrenalina: "epinephrine",
  noradrenalina: "norepinephrine",
  "suero fisiologico": "sodium chloride",
  "cloruro de sodio": "sodium chloride",
  "bicarbonato de sodio": "sodium bicarbonate",
  "oxido de zinc": "zinc oxide",
  hierro: "iron",
  yodo: "iodine",
  litio: "lithium",
  potasio: "potassium",
  sodio: "sodium",
  calcio: "calcium",
  magnesio: "magnesium",
  zinc: "zinc",
  estrogenos: "estrogens",
  insulina: "insulin",
  heparina: "heparin",
  "penicilina g": "penicillin g",
  penicilina: "penicillin",
  codeina: "codeine",
  morfina: "morphine",
  cafeina: "caffeine",
  nicotina: "nicotine",
  teofilina: "theophylline",
  "carbon activado": "activated charcoal",
};

/** Salt / ester / hydrate qualifiers to strip, ES and EN. Order-independent. */
const SALT_TERMS = new Set([
  // Spanish
  "clorhidrato", "hidrocloruro", "bromhidrato", "sulfato", "bisulfato",
  "sodico", "sodica", "potasico", "potasica", "calcico", "calcica",
  "magnesico", "maleato", "tartrato", "bitartrato", "succinato", "fumarato",
  "mesilato", "besilato", "tosilato", "citrato", "acetato", "fosfato",
  "nitrato", "bromuro", "cloruro", "yoduro", "lactato", "gluconato",
  "estearato", "palmitato", "propionato", "valerato", "dipropionato",
  "furoato", "benzoato", "salicilato", "carbonato", "oxalato", "pamoato",
  "embonato", "hemifumarato", "hemihidrato", "monohidrato", "dihidrato",
  "trihidrato", "pentahidrato", "anhidro", "anhidra", "micronizado",
  "micronizada", "base", "trometamol", "arginina",
  // English
  "hydrochloride", "hydrobromide", "sulfate", "bisulfate", "sodium",
  "potassium", "calcium", "magnesium", "maleate", "tartrate", "bitartrate",
  "succinate", "fumarate", "mesylate", "besylate", "tosylate", "citrate",
  "acetate", "phosphate", "nitrate", "bromide", "chloride", "iodide",
  "lactate", "gluconate", "stearate", "palmitate", "propionate", "valerate",
  "dipropionate", "furoate", "benzoate", "salicylate", "carbonate",
  "oxalate", "pamoate", "monohydrate", "dihydrate", "trihydrate",
  "anhydrous", "micronized",
]);

/**
 * Connector words, and pharmacopoeia grade markers that qualify the substance
 * rather than name it ("Acido Citrico USP" is citric acid).
 */
const CONNECTORS = new Set([
  "de", "del", "la", "el", "of",
  "usp", "bp", "ep", "nf", "ph", "eur", "usp24",
]);

/**
 * Case/accent/space normalization. The single place accents are stripped —
 * every comparison must run through here so a stored name and a typed query
 * normalize identically (they did not before, so accented names never matched).
 */
export function normalizeIngredient(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips salt/ester/hydrate qualifiers so "Clorhidrato De Labetalol",
 * "Apomorfina Clorhidrato" and "labetalol" all collapse to the same moiety.
 * Never returns empty: an ingredient that IS a salt (e.g. "Calcio") is kept.
 */
export function stripSalts(normalized: string): string {
  const kept = normalized
    .split(" ")
    .filter((w) => !SALT_TERMS.has(w) && !CONNECTORS.has(w));
  const out = kept.join(" ").trim();
  return out || normalized;
}

/**
 * Spanish→English INN morphology. Only ever applied as a *candidate* that must
 * be confirmed against the known-ingredient set, so a bad guess is discarded
 * rather than producing a spurious match.
 */
function morphologicalVariants(s: string): string[] {
  const out: string[] = [];
  const push = (v: string) => { if (v !== s) out.push(v); };
  // The -cilina family doubles the L in English: amoxicilina → amoxicillin.
  if (s.endsWith("cilina")) push(s.slice(0, -6) + "cillin");
  // amoxicilina → amoxicillin, gabapentina → gabapentin
  if (s.endsWith("ina")) { push(s.slice(0, -3) + "in"); push(s.slice(0, -3) + "ine"); }
  // omeprazol → omeprazole, diazepam stays
  if (s.endsWith("azol")) push(s + "e");
  if (s.endsWith("ol") && !s.endsWith("azol")) push(s + "e");
  // prednisona → prednisone
  if (s.endsWith("ona")) push(s.slice(0, -1) + "e");
  // diclofenaco → diclofenac, omeprazol handled above
  if (s.endsWith("aco")) push(s.slice(0, -1));
  if (s.endsWith("ico")) push(s.slice(0, -3) + "ic");
  // furosemida → furosemide, loratadina handled by -ina
  if (s.endsWith("ida")) push(s.slice(0, -1) + "e");
  if (s.endsWith("ida")) push(s.slice(0, -3) + "ide");
  // atorvastatina handled by -ina; sertralina → sertraline
  if (s.endsWith("o")) push(s.slice(0, -1));
  if (s.endsWith("a")) push(s.slice(0, -1));
  // acido X → X acid
  const m = s.match(/^acido (.+)$/);
  if (m) { push(`${m[1]} acid`); push(`${m[1]}ic acid`); }
  return out;
}

/**
 * Canonical comparison key for an ingredient name, in any supported language.
 *
 * `known` (the English ingredient-name set) gates the morphological bridge:
 * a Spanish name only becomes its English form when that form actually exists
 * as an ingredient. Without it the raw normalized name is returned, which
 * still matches other entries in the same catalog.
 */
export function canonicalKey(raw: string, known?: ReadonlySet<string>): string {
  const norm = normalizeIngredient(raw);
  if (!norm) return "";
  if (SYNONYMS[norm]) return SYNONYMS[norm];

  const base = stripSalts(norm);
  if (SYNONYMS[base]) return SYNONYMS[base];
  if (!known || known.size === 0) return base;
  if (known.has(base)) return base;

  for (const variant of morphologicalVariants(base)) {
    if (known.has(variant)) return variant;
  }
  return base;
}

/**
 * Splits a catalog actives string into ingredient names.
 * "Dipirona 300 Mg + Propinoxato Clorhidrato 5 Mg" → ["Dipirona", "Propinoxato Clorhidrato"]
 *
 * Drops the dose (everything from the first digit), parenthetical asides and
 * "como <salt>" qualifiers, all of which describe the salt, not the moiety.
 */
export function parseActives(actives: string): string[] {
  if (!actives) return [];
  return actives
    .split("+")
    .map((part) =>
      part
        .replace(/\([^)]*\)/g, " ")       // "(como Clavulanato De Potasio)"
        .replace(/\bcomo\b.*$/i, " ")     // "Vitamina B1 Como Clorhidrato…"
        // Dose onwards. Anchored on whitespace so a digit that is part of the
        // name survives — "Vitamina B1" must not be truncated to "Vitamina B".
        .replace(/\s+\d[\d.,]*.*$/, " ")
        .trim()
    )
    .filter((n) => n.length > 2);
}
