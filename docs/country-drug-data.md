# Country-aware drug data (autocomplete + barcode)

The medication-name autocomplete and the barcode scanner are **per-country**:
the app detects the device region and serves the matching drug catalog and
barcode resolver, degrading gracefully where a country isn't supported. Free-text
medication entry is **always** allowed regardless of region.

## Architecture

```
getDrugRegion()                REGION_TO_CATALOG            active drug catalog
(device regionCode      ──►    { AR: ANMAT, else: intl }  ──►  search() + attribution
 or user override)             (src/services/drugDb.ts)
      │
      └───────────────────►    SCAN_SUPPORTED_REGIONS     ──►  scan button shown?
                               { US, … }                       (src/services/barcode.ts)
                               isBarcodeScanSupported()         → hidden where unsupported
```

- **`src/services/deviceCountry.ts`** — `getDrugRegion()` returns the ISO-3166-1
  alpha-2 region: a persisted user override (`STORAGE_KEYS.DRUG_REGION`) if set,
  else the device `regionCode`, else `null` (→ callers use their fallback).
  `setDrugRegion()` persists an override (future Settings control).
- **`src/services/drugDb.ts`** — the catalog registry + shared search engine.
  `CATALOGS[id] = { load, attributionKey }`; `REGION_TO_CATALOG` maps a region to
  a catalog (unlisted → `DEFAULT_CATALOG = "intl"`). Each catalog's index is built
  lazily and cached. `getActiveDrugCatalog()` gives the UI the attribution key.
- **`src/services/barcode.ts`** — `isBarcodeScanSupported(region)` gates the scan
  button on `SCAN_SUPPORTED_REGIONS` (only regions with a real offline mapping).
- **`components/MedicationForm.tsx`** — `searchDrugs()` routes by region
  automatically; the scan button renders only when `isBarcodeScanSupported()`; the
  attribution line uses `getActiveDrugCatalog().attributionKey`.

Every catalog ships the same compact shape (`[displayName, rxcui, strengths[],
synonym]`) so the search engine is shared. `rxcui` (US RxNorm) powers the
interaction/duplicate-therapy checker; it's `""` for catalogs without a RxNorm
mapping (e.g. ANMAT), which simply means no interaction data for those entries.

## Adding a country

1. **Build the dataset** → `assets/drug-db-<cc>.json` via a builder script (mirror
   `scripts/build-drug-db.mjs` (RxTerms) or `build-drug-db-ar.mjs` (ANMAT VNM)).
2. Register a catalog in `CATALOGS` (+ an `attributionKey` string in the three
   i18n files) and map its region(s) in `REGION_TO_CATALOG`.
3. **Barcode (optional)**: if a GTIN/national-code → drug mapping exists, add a
   resolver and the region to `SCAN_SUPPORTED_REGIONS`. Otherwise leave it out —
   the scanner stays hidden there, which is the honest default.

## Data-source status by country

| Country | Name dataset | Barcode → drug | Notes |
|---|---|---|---|
| **US** | RxTerms (NLM), bundled ✅ | NDC-in-barcode, bundled ✅ | current baseline |
| **AR** | ANMAT VNM — **scrape required** ⚠️ | **not available (free/offline)** ❌ | see below |
| **BR** | ANVISA open data ✅ | **ANVISA CMED publishes EAN/GTIN** ✅ | best next candidate for scanning |
| **ES** | AEMPS CIMA (download + REST) ✅ | Código Nacional, not GTIN | scanner would need CN, not GS1 |
| **CL** | ISP registry (query UI only) ⚠️ | none found ❌ | weak public data |

## Argentina — the two open decisions

### 1. Autocomplete dataset content (needs a sourcing decision)

There is **no current official bulk export** of the VNM. The datos.gob.ar open-data
CSVs are monthly deltas frozen at 2018 (the bundled seed
`assets/drug-db-ar.json`, ~37 drugs, is built from one of them via
`build-drug-db-ar.mjs` — enough to prove the pipeline, **not** to ship).

Options to get the full, current dataset:

- **A — Scrape the public VNM consultation** (`servicios.pami.org.ar/vademecum/
  views/consultaPublica/listado.zul`). A community MIT scraper exists
  (`afborga/ANMAT-Medicamentos-Scraper`, Oct 2024) whose columns already match
  the builder. One respectful, rate-limited run (hours) → a real ~10-20k-drug
  asset, refreshed periodically. **Recommended** — free, official data, our
  attribution. Requires sign-off (load on a government server + ToS review).
- **B — Licensed catalog** (Alfabeta / Kairós, the industry vademécum vendors) —
  current and clean but **paid/licensed**, and conflicts with the "no pharma
  money" stance unless purely a data license.
- **C — Ship the tiny seed** — not recommended; worse UX than the intl fallback.

Until A or B lands, consider keeping AR on the `intl` fallback (or gating the AR
catalog behind a minimum-size check) so users don't get a near-empty list.

### 2. Barcode scanning in Argentina (blocked on data)

**Not solvable with free, public, offline data today.** The VNM's GTIN field is
effectively empty; ANMAT's traceability system (which holds GTIN↔product) is
closed/authenticated; GS1 Argentina lookup is membership-gated with no bulk
export; and the only complete GTIN catalogs (Alfabeta/Kairós) are paid. The
scanner is therefore **hidden in AR** (via `SCAN_SUPPORTED_REGIONS`) rather than
offered as a control that can never match a local box.

Paths to enable it later, in order of realism:

1. **Add Brazil first** — ANVISA's CMED price list publishes EAN/GTIN, so BR is a
   clean, free win that exercises the same country-aware scanner plumbing.
2. **AR via a licensed catalog** — if a data license is acquired (see 1B), it
   would also supply GTIN↔product for scanning.
3. **AR via an online lookup service** — stand up a small backend seeded from
   scraped/licensed data; the scanner would require connectivity (breaks the
   fully-offline model — a product tradeoff).

Recommendation: keep AR scanning hidden, ship AR autocomplete once the dataset
lands (decision 1), and treat BR as the reference implementation for the next
scannable country.
