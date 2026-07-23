/**
 * Complex regimens (F3): every-N-days, cycle on/off, and dose tapers.
 *
 * Covers what simple reminder apps get wrong — prednisone tapers, 21/7
 * contraceptive cycles, chemo cycles, alternate-day dosing, GLP-1 titration —
 * WITHOUT complicating the 90% case: `medication.regimen` is a nullable JSON
 * column; when absent, scheduling behaves exactly as before.
 *
 * All date math is calendar-day based, anchored at the medication's
 * startDate (or its creation date when no startDate is set):
 *   - everyN:  active on day 0, N, 2N, ... from the anchor
 *   - cycle:   active the first `on` days of every (on+off)-day block
 *   - taper:   consecutive steps, each `days` long at `amount` units;
 *              after the last step the medication is no longer due
 *
 * The single scheduling choke point (isScheduleActiveOnDate in utils) calls
 * isRegimenActiveOnDate, so Today, the calendar and alarm scheduling all
 * agree for free.
 */
import { Medication } from "../types";

/** Local YYYY-MM-DD formatter — duplicated from utils to avoid an import
 *  cycle (utils → regimen for the scheduling choke point). */
function toDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type Regimen =
  | { type: "everyN"; n: number }
  | { type: "cycle"; on: number; off: number }
  | { type: "taper"; steps: { days: number; amount: number }[] };

/** Safe parse + shape validation. Malformed JSON = no regimen (fail open). */
export function parseRegimen(med: Pick<Medication, "regimen">): Regimen | null {
  if (!med.regimen) return null;
  try {
    const r = JSON.parse(med.regimen) as Regimen;
    switch (r.type) {
      case "everyN":
        return Number.isInteger(r.n) && r.n >= 2 ? r : null;
      case "cycle":
        return Number.isInteger(r.on) && r.on >= 1 && Number.isInteger(r.off) && r.off >= 1
          ? r
          : null;
      case "taper":
        return Array.isArray(r.steps) &&
          r.steps.length >= 1 &&
          r.steps.every((s) => Number.isInteger(s.days) && s.days >= 1 && s.amount > 0)
          ? r
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Calendar-day difference between two YYYY-MM-DD strings (b - a). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The regimen's day-0 anchor: startDate, else the creation date. */
export function regimenAnchor(med: Medication): string {
  return med.startDate ?? toDateString(new Date(med.createdAt));
}

/**
 * True when the medication is due on `dateStr` per its regimen. Medications
 * without a (valid) regimen are always due — existing behavior.
 */
export function isRegimenActiveOnDate(med: Medication, dateStr: string): boolean {
  const regimen = parseRegimen(med);
  if (!regimen) return true;

  const d = dayDiff(regimenAnchor(med), dateStr);
  if (d < 0) return false;

  switch (regimen.type) {
    case "everyN":
      return d % regimen.n === 0;
    case "cycle":
      return d % (regimen.on + regimen.off) < regimen.on;
    case "taper": {
      let total = 0;
      for (const s of regimen.steps) total += s.days;
      return d < total;
    }
  }
}

/**
 * The dose amount due on `dateStr` — differs from med.dosageAmount only
 * during a taper. Null when the taper is already over.
 */
export function effectiveAmountForDate(med: Medication, dateStr: string): number | null {
  const regimen = parseRegimen(med);
  if (!regimen || regimen.type !== "taper") return med.dosageAmount;

  let d = dayDiff(regimenAnchor(med), dateStr);
  if (d < 0) return null;
  for (const step of regimen.steps) {
    if (d < step.days) return step.amount;
    d -= step.days;
  }
  return null;
}

/**
 * A copy of the medication whose dosage reflects `dateStr` (tapers only);
 * returns the SAME object when nothing changes so memoized UI stays stable.
 */
export function withEffectiveDose(med: Medication, dateStr: string): Medication {
  const amount = effectiveAmountForDate(med, dateStr);
  if (amount == null || amount === med.dosageAmount) return med;
  return {
    ...med,
    dosageAmount: amount,
    dosage: `${amount} ${med.dosageUnit}`,
  };
}

/** Builds the JSON string for storage; null for the "none" case. */
export function buildRegimenJson(regimen: Regimen | null): string | undefined {
  return regimen ? JSON.stringify(regimen) : undefined;
}
