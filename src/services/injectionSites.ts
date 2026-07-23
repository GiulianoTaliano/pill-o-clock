/**
 * Injection-site rotation (F3 — GLP-1 / weekly injectables).
 *
 * Standard pen sites: abdomen (L/R), thigh (L/R), upper arm (L/R). The
 * suggestion is the least-recently-used site so consecutive doses naturally
 * rotate — the guidance every GLP-1 leaflet gives. Recording a site is
 * always optional: we never fabricate one the user didn't confirm.
 */
import { DoseLog, Medication, Schedule } from "../types";
import { isScheduleActiveOnDate } from "../utils";

export const INJECTION_SITES = [
  "abdomen_l",
  "abdomen_r",
  "thigh_l",
  "thigh_r",
  "arm_l",
  "arm_r",
] as const;

export type InjectionSite = (typeof INJECTION_SITES)[number];

/**
 * Least-recently-used site given the med's past logs (most recent first or
 * not — order is derived from scheduledDate). Sites never used win first,
 * in list order.
 */
export function suggestNextSite(logs: DoseLog[]): InjectionSite {
  const lastUsed = new Map<string, string>();
  for (const log of logs) {
    if (!log.injectionSite) continue;
    const prev = lastUsed.get(log.injectionSite);
    if (!prev || log.scheduledDate > prev) lastUsed.set(log.injectionSite, log.scheduledDate);
  }
  let best: InjectionSite = INJECTION_SITES[0];
  let bestDate = "9999-99-99";
  for (const site of INJECTION_SITES) {
    const used = lastUsed.get(site);
    if (!used) return site; // never used → immediate winner
    if (used < bestDate) {
      best = site;
      bestDate = used;
    }
  }
  return best;
}

/**
 * Next date (YYYY-MM-DD, local) the medication is due, scanning up to
 * `horizon` days from tomorrow. Powers the weekly countdown on the med list.
 */
export function nextDueDate(
  med: Medication,
  schedules: Schedule[],
  from: Date,
  horizon = 35
): { date: string; inDays: number } | null {
  const active = schedules.filter((s) => s.medicationId === med.id && s.isActive);
  if (active.length === 0) return null;
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12);
    if (active.some((s) => isScheduleActiveOnDate(s, d, med))) {
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return { date: `${d.getFullYear()}-${m}-${day}`, inDays: i };
    }
  }
  return null;
}
