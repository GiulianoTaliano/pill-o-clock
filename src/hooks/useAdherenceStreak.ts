import { useEffect, useState } from "react";
import { subDays } from "date-fns";
import { useAppStore } from "../store";
import { toDateString, today } from "../utils";

/**
 * Computes the current adherence streak: the number of consecutive days
 * (going backwards from today) where every logged dose was "taken" with
 * no skipped doses.
 *
 * A day is "compliant" if it has ≥1 dose_log AND all logs are "taken".
 * Days with no logs are neutral — they halt the streak if found before
 * any compliant day.
 */
export function useAdherenceStreak(): number {
  const getHistoryLogs = useAppStore((s) => s.getHistoryLogs);
  // Re-compute whenever today's logs change (dose taken, skipped, reverted).
  const todayLogs = useAppStore((s) => s.todayLogs);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const compute = async () => {
      const todayStr = today();
      const fromStr = toDateString(subDays(new Date(), 90));
      const logs = await getHistoryLogs(fromStr, todayStr);

      // Group by date
      const byDate = new Map<string, { hasTaken: boolean; hasSkipped: boolean }>();
      for (const log of logs) {
        const entry = byDate.get(log.scheduledDate) ?? { hasTaken: false, hasSkipped: false };
        if (log.status === "taken")  entry.hasTaken  = true;
        if (log.status === "skipped") entry.hasSkipped = true;
        byDate.set(log.scheduledDate, entry);
      }

      let count = 0;
      let checkDate = new Date();

      while (true) {
        const dateStr = toDateString(checkDate);
        const entry = byDate.get(dateStr);
        if (!entry || !entry.hasTaken || entry.hasSkipped) break;
        count++;
        checkDate = subDays(checkDate, 1);
      }

      setStreak(count);
    };

    compute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getHistoryLogs, todayLogs]);

  return streak;
}
