import { useEffect, useState } from "react";
import { subDays } from "date-fns";
import { useAppStore } from "../store";
import { toDateString, today } from "../utils";

/**
 * Computes the current adherence streak: consecutive days where every
 * *scheduled* dose was "taken".
 *
 * A day is "compliant" only if it has ≥1 taken dose AND no skipped or missed
 * dose (H6 — a missed dose breaks the streak; the background task persists a
 * "missed" log for past unresolved doses). PRN/as-needed doses are excluded so
 * a single as-needed dose can't whitewash a day of missed scheduled ones (M7).
 * Today is treated as neutral: an in-progress today (doses not yet due/logged)
 * neither breaks nor resets the through-yesterday streak, and only extends it
 * once today is itself fully compliant (M8).
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

      // Group by date, excluding PRN doses (scheduleId prefixed "prn-"): they
      // are as-needed and must not count toward or mask scheduled adherence (M7).
      const byDate = new Map<string, { hasTaken: boolean; hasSkipped: boolean; hasMissed: boolean }>();
      for (const log of logs) {
        if (log.scheduleId.startsWith("prn-")) continue;
        const entry = byDate.get(log.scheduledDate) ?? { hasTaken: false, hasSkipped: false, hasMissed: false };
        if (log.status === "taken")   entry.hasTaken   = true;
        if (log.status === "skipped") entry.hasSkipped = true;
        if (log.status === "missed")  entry.hasMissed  = true;
        byDate.set(log.scheduledDate, entry);
      }

      const isCompliant = (dateStr: string): boolean => {
        const entry = byDate.get(dateStr);
        return !!entry && entry.hasTaken && !entry.hasSkipped && !entry.hasMissed;
      };

      // Count consecutive compliant days ending YESTERDAY (completed days).
      let count = 0;
      let checkDate = subDays(new Date(), 1);
      while (isCompliant(toDateString(checkDate))) {
        count++;
        checkDate = subDays(checkDate, 1);
      }

      // Today extends the streak only once it is itself fully compliant; an
      // in-progress or skipped/missed today neither breaks nor resets the
      // through-yesterday streak during the day (M8).
      if (isCompliant(todayStr)) count++;

      setStreak(count);
    };

    compute();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getHistoryLogs, todayLogs]);

  return streak;
}
