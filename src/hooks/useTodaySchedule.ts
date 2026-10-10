import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useAppStore } from "../store";
import { TodayDose, TodayDoseStatus } from "../types";
import { isScheduleActiveOnDate } from "../utils";
import { withEffectiveDose } from "../services/regimen";
import { effectiveDoseDateTime } from "../services/doseTime";

/**
 * Returns the list of TodayDose items for a given date (default: today).
 * Merges schedules with their dose logs to determine current status.
 */
export function useTodaySchedule(dateStr?: string): TodayDose[] {
  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const todayLogs = useAppStore((s) => s.todayLogs);
  const snoozedTimes = useAppStore((s) => s.snoozedTimes);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const targetDate = dateStr ?? format(new Date(), "yyyy-MM-dd");

  return useMemo(() => {
    const [year, month, day] = targetDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date(clock);
    const isToday = targetDate === format(now, "yyyy-MM-dd");

    const logMap = new Map(
      todayLogs.map((l) => [`${l.scheduleId}-${l.scheduledDate}`, l])
    );
    const medMap = new Map(medications.map((m) => [m.id, m]));

    const doses: TodayDose[] = [];

    for (const schedule of schedules) {
      const med = medMap.get(schedule.medicationId);
      if (!med) continue;
      if (!isScheduleActiveOnDate(schedule, date, med)) continue;

      const key = `${schedule.id}-${targetDate}`;
      const log = logMap.get(key);

      let status: TodayDoseStatus;
      if (log) {
        status = log.status;
      } else if (isToday) {
        // If the scheduled time has already passed today and there's no log,
        // treat the dose as missed rather than pending.
        const scheduledDateTime = effectiveDoseDateTime(
          targetDate,
          schedule.time,
          snoozedTimes[key]
        );
        status = scheduledDateTime < now ? "missed" : "pending";
      } else {
        // Past days with no log → always missed; future days → pending
        status = date < now ? "missed" : "pending";
      }

      doses.push({
        doseLogId: log?.id,
        // Taper-aware dose for the target date (F3); same object otherwise.
        medication: withEffectiveDose(med, targetDate),
        schedule,
        scheduledDate: targetDate,
        scheduledTime: schedule.time,
        status,
        takenAt: log?.takenAt,
        injectionSite: log?.injectionSite,
        notes: log?.notes,
        skipReason: log?.skipReason,
        snoozedUntil: isToday
          ? snoozedTimes[`${schedule.id}-${targetDate}`]
          : undefined,
      });
    }

    // Keep an overnight reminder attached to its original dose and regimen day.
    if (isToday) {
      for (const [key, postponed] of Object.entries(snoozedTimes)) {
        const originalDate = key.slice(-10);
        if (originalDate >= targetDate || !postponed.includes("T")) continue;
        const scheduledId = key.slice(0, -11);
        const schedule = schedules.find((item) => item.id === scheduledId);
        const medication = schedule
          ? medMap.get(schedule.medicationId)
          : undefined;
        if (!schedule || !medication?.isActive) continue;
        const fireDate = effectiveDoseDateTime(
          originalDate,
          schedule.time,
          postponed
        );
        if (format(fireDate, "yyyy-MM-dd") !== targetDate) continue;
        const log = logMap.get(key);
        doses.push({
          doseLogId: log?.id,
          medication: withEffectiveDose(medication, originalDate),
          schedule,
          scheduledDate: originalDate,
          scheduledTime: schedule.time,
          status: log ? log.status : fireDate < now ? "missed" : "pending",
          takenAt: log?.takenAt,
          injectionSite: log?.injectionSite,
          notes: log?.notes,
          skipReason: log?.skipReason,
          snoozedUntil: postponed,
        });
      }
    }

    // Sort by time
    doses.sort(
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
    return doses;
  }, [medications, schedules, todayLogs, snoozedTimes, targetDate, clock]);
}
