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
| **US** | RxTerms (NLM), bundled ✅ | NDC-in-barcode, bundled ✅ | baseline |
| **AR** | ANMAT VNM — scraped ✅ | **VNM GTIN, bundled ✅** | GTIN recovered via scrape (see below) |
| **BR** | ANVISA open data ✅ | ANVISA CMED publishes EAN/GTIN ✅ | clean next candidate |
| **ES** | AEMPS CIMA (download + REST) ✅ | Código Nacional, not GTIN | scanner would need CN, not GS1 |
| **CL** | ISP registry (query UI only) ⚠️ | none found ❌ | weak public data |

## Argentina — data acquisition (both autocomplete AND scanner)

There is **no official bulk export** of the VNM (the datos.gob.ar open-data CSVs
are monthly deltas frozen at 2018). Both AR assets are therefore built by
**scraping the public VNM consultation** (`servicios.pami.org.ar/vademecum/views/
consultaPublica/listado.zul`), per-laboratorio (~430 labs from the GS1 registry),
via `scripts/vnm_scrape.py` → `vnm_out.csv` → `scripts/build-drug-db-ar.mjs` →
`assets/drug-db-ar.json` (names) + `assets/drug-gtin-ar.json` (GTIN → drug).
Attribution: ANMAT VNM. Refresh cadence: re-run the scrape every few months.

Two things that made this work (both fixes over the community scraper
`afborga/ANMAT-Medicamentos-Scraper`, MIT, Oct 2024):

- **GTIN recovery.** The VNM *does* carry a GS1 GTIN per presentation, but the
  column is **hidden in the results grid**, so Selenium's `.text` returns `""` —
  which is why earlier scrapes (and initial research) reported the GTIN "empty".
  Reading the cell via **`textContent`** recovers it; observed coverage ≈ 90%+ of
  products. This is what makes the **AR barcode scanner viable** — it resolves the
  large subset of products with a registered GTIN and degrades to typing for the
  rest, exactly like the US NDC path.
- **Robust pagination** (advance-and-verify) + checkpoint/resume + a polite delay,
  so a full run survives interruptions without hammering the server.

Scraping load/ToS: the run is rate-limited and resumable; it reads only the
public consultation. Re-runs should stay polite (single session, delay between
labs). If a licensed catalog (Alfabeta/Kairós) is ever acquired it would be a
drop-in higher-freshness replacement for both assets.

### Barcode scanning in Argentina — enabled

`resolveBarcode()` routes by region: **AR → `gtin14FromBarcode()` → `lookupGtin()`**
against `assets/drug-gtin-ar.json`; US → the NDC path. A scanned EAN-13 (or GS1
DataMatrix/QR GTIN) is normalised to a 14-digit GTIN and looked up. AR is in
`SCAN_SUPPORTED_REGIONS`, so the scan button shows there. Products without a
registered GTIN simply fall back to manual entry.

Next scannable country: **Brazil** (ANVISA CMED publishes EAN/GTIN) — same
plumbing, just a `BR` catalog + GTIN asset + registry entries.
