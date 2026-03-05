import { useMemo } from "react";
import { format } from "date-fns";
import { useAppStore } from "../store";
import { TodayDose, TodayDoseStatus } from "../types";
import { isScheduleActiveOnDate, parseTime } from "../utils";

/**
 * Returns the list of TodayDose items for a given date (default: today).
 * Merges schedules with their dose logs to determine current status.
 */
export function useTodaySchedule(dateStr?: string): TodayDose[] {
  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const todayLogs = useAppStore((s) => s.todayLogs);
  const snoozedTimes = useAppStore((s) => s.snoozedTimes);

  const targetDate = dateStr ?? format(new Date(), "yyyy-MM-dd");

  return useMemo(() => {
    const [year, month, day] = targetDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();
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
        const { hours, minutes } = parseTime(schedule.time);
        const scheduledDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
        status = scheduledDateTime < now ? "missed" : "pending";
      } else {
        // Past days with no log → always missed; future days → pending
        status = date < now ? "missed" : "pending";
      }

      doses.push({
        doseLogId: log?.id,
        medication: med,
        schedule,
        scheduledDate: targetDate,
        scheduledTime: schedule.time,
        status,
        takenAt: log?.takenAt,
        snoozedUntil: isToday ? snoozedTimes[`${schedule.id}-${targetDate}`] : undefined,
      });
    }

    // Sort by time
    doses.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    return doses;
  }, [medications, schedules, todayLogs, snoozedTimes, targetDate]);
}
