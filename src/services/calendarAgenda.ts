import type { DoseLog, Medication, Schedule, TodayDose } from "../types";
import { isScheduleActiveOnDate, toDateString } from "../utils";
import { effectiveDoseDateTime } from "./doseTime";
import { withEffectiveDose } from "./regimen";

export function buildCalendarDoses(
  medications: Medication[],
  schedules: Schedule[],
  logs: DoseLog[],
  date: string,
  snoozedTimes: Record<string, string> = {},
  now = new Date()
): TodayDose[] {
  const medMap = new Map(medications.map((m) => [m.id, m]));
  const local = new Date(`${date}T12:00`);
  const current = toDateString(now);
  const logsForDay = logs.filter((l) => l.scheduledDate === date);
  const logMap = new Map(logsForDay.map((l) => [l.scheduleId, l]));
  // Historical dates are events, never a reconstruction from today's mutable plan.
  const ids = new Set(
    date < current
      ? []
      : schedules
          .filter((s) => {
            const m = medMap.get(s.medicationId);
            return m && isScheduleActiveOnDate(s, local, m);
          })
          .map((s) => s.id)
  );
  logsForDay.forEach((l) => ids.add(l.scheduleId));
  const result: TodayDose[] = [];
  for (const id of ids) {
    const log = logMap.get(id);
    const schedule =
      schedules.find((s) => s.id === id) ??
      (log
        ? {
            id,
            medicationId: log.medicationId,
            time: log.scheduledTime,
            days: [],
            isActive: false,
          }
        : undefined);
    if (!schedule) continue;
    const med = medMap.get(schedule.medicationId);
    if (!med) continue;
    const snoozedUntil =
      !log || log.status === "pending"
        ? snoozedTimes[`${id}-${date}`]
        : undefined;
    const due = effectiveDoseDateTime(
      date,
      log?.scheduledTime ?? schedule.time,
      snoozedUntil
    );
    result.push({
      medication: withEffectiveDose(med, date),
      schedule,
      scheduledDate: date,
      scheduledTime: log?.scheduledTime ?? schedule.time,
      snoozedUntil,
      status:
        log?.status ?? (date === current && due < now ? "missed" : "pending"),
      doseLogId: log?.id,
      takenAt: log?.takenAt,
      notes: log?.notes,
      skipReason: log?.skipReason,
      injectionSite: log?.injectionSite,
    });
  }
  for (const [key, postponed] of Object.entries(snoozedTimes)) {
    const original = key.slice(-10),
      id = key.slice(0, -11);
    if (original === date) continue;
    const schedule = schedules.find((s) => s.id === id),
      med = schedule ? medMap.get(schedule.medicationId) : undefined;
    if (
      !schedule ||
      !med ||
      !isScheduleActiveOnDate(schedule, new Date(`${original}T12:00`), med)
    )
      continue;
    const due = effectiveDoseDateTime(original, schedule.time, postponed);
    if (
      toDateString(due) !== date ||
      logs.some(
        (l) =>
          l.scheduleId === id &&
          l.scheduledDate === original &&
          l.status !== "pending"
      )
    )
      continue;
    result.push({
      medication: withEffectiveDose(med, original),
      schedule,
      scheduledDate: original,
      scheduledTime: schedule.time,
      snoozedUntil: postponed,
      status: due < now ? "missed" : "pending",
    });
  }
  return result.sort(
    (a, b) =>
      effectiveDoseDateTime(
        a.scheduledDate,
        a.scheduledTime,
        a.snoozedUntil
      ).getTime() -
      effectiveDoseDateTime(
        b.scheduledDate,
        b.scheduledTime,
        b.snoozedUntil
      ).getTime()
  );
}
