import type {
  Appointment,
  Medication,
  MeasurementType,
  Schedule,
} from "../types";
import {
  formatTimeForDisplay,
  getLocalizedDosage,
  toDateString,
} from "../utils";
import { effectiveAmountForDate, parseRegimen, regimenAnchor } from "./regimen";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Parse the entire input, preserving decimal separators used by ES/PT keyboards. */
export function parseMeasurementInput(
  input: string,
  type: MeasurementType
): number | null {
  const text = input.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || (type === "spo2" && value > 100))
    return null;
  return value;
}

/** Current treatment does not imply a dose is due today (cycles may have rest days). */
export function isMedicationCurrent(
  med: Medication,
  now = new Date()
): boolean {
  const date = toDateString(now);
  return (
    med.isActive &&
    (!med.startDate || med.startDate <= date) &&
    (!med.endDate || med.endDate >= date) &&
    effectiveAmountForDate(med, date) !== null
  );
}

export function isAppointmentPast(
  appt: Pick<Appointment, "date" | "time">,
  now = new Date()
): boolean {
  const date = toDateString(now);
  if (appt.date !== date) return appt.date < date;
  if (!appt.time) return false;
  const [h, m] = appt.time.split(":").map(Number);
  const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  return time.getTime() < now.getTime();
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Full human-readable plan, shared by the emergency card and every export. */
export function describeMedicationPlan(
  med: Medication,
  schedules: Schedule[],
  t: Translate
): string {
  const regimen = parseRegimen(med);
  const pieces = [getLocalizedDosage(med, t)];
  if (med.isPRN) {
    pieces.push(t("fhir.prn"));
    if (med.prnMaxPerDay != null)
      pieces.push(t("snapshot.prnMax", { n: med.prnMaxPerDay }));
    if (med.prnMinIntervalMinutes != null)
      pieces.push(t("snapshot.prnInterval", { n: med.prnMinIntervalMinutes }));
  } else {
    if (regimen?.type === "everyN")
      pieces.push(
        t("uxHealth.everyN", { n: regimen.n, date: regimenAnchor(med) })
      );
    if (regimen?.type === "cycle")
      pieces.push(
        t("uxHealth.cycle", {
          on: regimen.on,
          off: regimen.off,
          date: regimenAnchor(med),
        })
      );
    if (regimen?.type === "monthlyDay")
      pieces.push(t("uxHealth.monthly", { day: regimen.day }));
    if (regimen?.type === "taper")
      pieces.push(
        regimen.steps
          .map((s) =>
            t("uxHealth.taperStep", {
              days: s.days,
              amount: `${s.amount} ${med.dosageUnit}`,
            })
          )
          .join(" → ")
      );
    pieces.push(
      ...schedules
        .filter((s) => s.isActive)
        .map((s) => {
          const days = regimen
            ? ""
            : s.days.length
            ? s.days.map((d) => t(`insights.weekday_${d}`)).join(", ")
            : t("snapshot.daily");
          return [formatTimeForDisplay(s.time), days]
            .filter(Boolean)
            .join(" · ");
        })
    );
  }
  if (med.startDate) pieces.push(t("uxHealth.from", { date: med.startDate }));
  if (med.endDate) pieces.push(t("uxHealth.until", { date: med.endDate }));
  return pieces.filter(Boolean).join(" · ");
}
