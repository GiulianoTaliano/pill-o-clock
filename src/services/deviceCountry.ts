/**
 * Device country → drug region resolution (country-aware drug data, F1/F2).
 *
 * The drug-name catalog and the barcode scanner are country-specific (US uses
 * RxTerms + NDC; Argentina uses ANMAT; etc. — see drugCatalog.ts / barcode.ts).
 * We pick which one to use from the device region (ISO-3166-1 alpha-2, e.g.
 * "AR", "US"), with a persisted user override for people whose device region
 * differs from where they actually get their medication.
 *
 * Everything downstream degrades gracefully: an unknown/unsupported region
 * falls back to the international catalog and hides the scanner, and free-text
 * medication entry is ALWAYS allowed regardless of region.
 */
import * as Localization from "expo-localization";
import * as Cellular from "expo-cellular";
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

/** ISO-3166-1 alpha-2, uppercased. `null` when the device exposes no region. */
export type CountryCode = string;

// ─── SIM country (expo-cellular) ────────────────────────────────────────────
// The SIM's country is the strongest signal: it tracks where the user actually
// is/operates, so a traveler with a local eSIM gets that country's catalog.
// getIsoCountryCodeAsync() is async, but getDrugRegion() must stay sync (it runs
// on every keystroke / scan), so we refresh the value once at startup and cache
// it (module var, hydrated from storage so it survives the sync boundary and
// restarts). Reading the SIM country ISO needs no runtime permission on Android.

let cachedSimCountry: CountryCode | null = (() => {
  try {
    const c = storage.getString(STORAGE_KEYS.SIM_COUNTRY);
    return c ? c.toUpperCase() : null;
  } catch {
    return null;
  }
})();

/** Refreshes the cached SIM country. Call once at app startup. */
export async function refreshSimCountry(): Promise<void> {
  try {
    const iso = await Cellular.getIsoCountryCodeAsync();
    if (iso) {
      cachedSimCountry = iso.toUpperCase();
      storage.set(STORAGE_KEYS.SIM_COUNTRY, cachedSimCountry);
    }
  } catch {
    /* no SIM / not permitted / wifi-only device — keep the previous cache */
  }
}

/** The locale's region — reliable for es-AR/en-US, but null for region-less
 *  locales like es-419 (Latin American Spanish), which is exactly the gap the
 *  timezone fallback below closes. */
function localeRegion(): CountryCode | null {
  try {
    const region = Localization.getLocales()[0]?.regionCode;
    return region ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Country inferred from the device timezone (e.g. America/Argentina/Buenos_Aires
 * → AR). Permission-free and independent of the chosen language, so it resolves
 * es-419 users correctly. Map is the IANA zone→country table (assets/tz-country
 * .json), loaded lazily only when the locale carries no region.
 */
function timezoneRegion(): CountryCode | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return null;
    const map = require("../../assets/tz-country.json") as Record<string, string>;
    return map[tz]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort auto-detected region, strongest signal first:
 * SIM country → locale region → device timezone.
 */
function deviceRegion(): CountryCode | null {
  return cachedSimCountry ?? localeRegion() ?? timezoneRegion();
}

/**
 * The active drug region: the persisted override if set, else the auto-detected
 * device region (locale region → timezone), else `null` (unknown → callers use
 * their international fallback).
 */
export function getDrugRegion(): CountryCode | null {
  try {
    const override = storage.getString(STORAGE_KEYS.DRUG_REGION);
    if (override) return override.toUpperCase();
  } catch {
    /* storage unavailable — fall through to device region */
  }
  return deviceRegion();
}

/** Persists a manual region override (e.g. from Settings). Empty clears it. */
export function setDrugRegion(country: CountryCode | null): void {
  if (country) storage.set(STORAGE_KEYS.DRUG_REGION, country.toUpperCase());
  else storage.remove(STORAGE_KEYS.DRUG_REGION);
}

/**
 * The manual override if the user set one, else `null` meaning "Automatic"
 * (use the device region). Distinct from getDrugRegion(), which resolves the
 * effective region — used by the Settings picker to show the current choice.
 */
export function getDrugRegionOverride(): CountryCode | null {
  try {
    const override = storage.getString(STORAGE_KEYS.DRUG_REGION);
    return override ? override.toUpperCase() : null;
  } catch {
    return null;
  }
}
