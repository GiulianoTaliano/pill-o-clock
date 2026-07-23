/**
 * PRN safety limits (F2): max doses per day + minimum spacing between doses.
 *
 * Pure functions — the medications slice runs the check before logging a PRN
 * dose and the UI shows a WARNING with an explicit "log anyway" confirmation.
 * We warn, we never hard-block: the user may be following updated doctor
 * instructions the app doesn't know about.
 */
import { Medication, DoseLog } from "../types";

export interface PrnLimitCheck {
  /** True when either limit would be exceeded by logging now. */
  blocked: boolean;
  /** Daily-max exceeded. */
  overMax: boolean;
  /** Too soon after the previous dose. */
  tooSoon: boolean;
  /** Taken doses already logged today. */
  takenToday: number;
  /** When the next dose becomes allowed (interval limit), else null. */
  nextAllowedAt: Date | null;
}

/** Local calendar date (YYYY-MM-DD) for a Date — mirrors utils.toDateString. */
function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Evaluates the PRN limits for `medication` given its recent TAKEN logs
 * (today + yesterday is enough for any realistic interval) at time `now`.
 */
export function checkPrnLimits(
  medication: Medication,
  recentLogs: DoseLog[],
  now: Date = new Date()
): PrnLimitCheck {
  const taken = recentLogs.filter(
    (l) => l.medicationId === medication.id && l.status === "taken" && l.takenAt
  );

  const today = localDate(now);
  const takenToday = taken.filter((l) => l.scheduledDate === today).length;

  const overMax =
    medication.prnMaxPerDay != null &&
    medication.prnMaxPerDay > 0 &&
    takenToday >= medication.prnMaxPerDay;

  let tooSoon = false;
  let nextAllowedAt: Date | null = null;
  if (medication.prnMinIntervalMinutes != null && medication.prnMinIntervalMinutes > 0) {
    const lastTakenMs = taken.reduce((max, l) => {
      const t = new Date(l.takenAt!).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (lastTakenMs > 0) {
      const allowedMs = lastTakenMs + medication.prnMinIntervalMinutes * 60_000;
      if (now.getTime() < allowedMs) {
        tooSoon = true;
        nextAllowedAt = new Date(allowedMs);
      }
    }
  }

  return { blocked: overMax || tooSoon, overMax, tooSoon, takenToday, nextAllowedAt };
}

/** Builds the localized warning body shown before "log anyway". */
export function prnWarningMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  medication: Medication,
  check: PrnLimitCheck
): string {
  const parts: string[] = [];
  if (check.overMax) {
    parts.push(
      t("prn.limitMax", { count: check.takenToday, max: medication.prnMaxPerDay })
    );
  }
  if (check.tooSoon && check.nextAllowedAt) {
    const hh = String(check.nextAllowedAt.getHours()).padStart(2, "0");
    const mm = String(check.nextAllowedAt.getMinutes()).padStart(2, "0");
    parts.push(t("prn.limitSoon", { time: `${hh}:${mm}` }));
  }
  return parts.join("\n");
}
