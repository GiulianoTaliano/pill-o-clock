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
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

/** ISO-3166-1 alpha-2, uppercased. `null` when the device exposes no region. */
export type CountryCode = string;

function deviceRegion(): CountryCode | null {
  try {
    const region = Localization.getLocales()[0]?.regionCode;
    return region ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * The active drug region: the persisted override if set, else the device
 * region, else `null` (unknown → callers use their international fallback).
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
