/**
 * __tests__/hooks/useAdherenceStreak.test.tsx
 *
 * Adherence streak correctness (audit H6 / M7 / M8):
 *  - H6: a "missed" dose breaks the streak (was ignored).
 *  - M7: PRN/as-needed doses don't count toward or mask scheduled adherence.
 *  - M8: today is neutral — an in-progress today doesn't reset the streak,
 *        and only extends it once today is itself compliant.
 *
 * Strategy: mock the store's getHistoryLogs, fix "now" to Mon 2025-06-16 10:00,
 * flush the hook's async effect, then assert the computed streak.
 */

import { renderHook, act } from "@testing-library/react-native";
import { useAdherenceStreak } from "../../src/hooks/useAdherenceStreak";
import { makeDoseLog } from "../factories";

jest.mock("../../src/store", () => ({ useAppStore: jest.fn() }));
import { useAppStore } from "../../src/store";

// ─── Fixed "now": Monday, June 16, 2025 ─────────────────────────────────────
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2025, 5, 16, 10, 0, 0, 0));
});
afterAll(() => jest.useRealTimers());
beforeEach(() => jest.clearAllMocks());

// log(date, status, scheduleId?) — a dose log on a given day
function log(date: string, status: string, scheduleId = "sch-1") {
  return makeDoseLog({ scheduledDate: date, status: status as any, scheduleId });
}

async function computeStreak(logs: ReturnType<typeof log>[]): Promise<number> {
  const getHistoryLogs = jest.fn().mockResolvedValue(logs);
  const state = { getHistoryLogs, todayLogs: [] };
  (useAppStore as jest.Mock).mockImplementation((sel: (s: any) => unknown) => sel(state));

  const { result } = renderHook(() => useAdherenceStreak());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result.current;
}

// ─── H6 — missed breaks the streak ──────────────────────────────────────────

describe("H6 — missed doses break the streak", () => {
  it("stops counting at a day that has a missed dose", async () => {
    // today + yesterday compliant; 06-14 has a missed dose → streak caps at 2.
    const streak = await computeStreak([
      log("2025-06-16", "taken"),
      log("2025-06-15", "taken"),
      log("2025-06-14", "taken"),
      log("2025-06-14", "missed"),
      log("2025-06-13", "taken"),
    ]);
    expect(streak).toBe(2); // today + yesterday; 06-14 (missed) breaks it
  });

  it("does not count a day whose only dose was missed", async () => {
    const streak = await computeStreak([
      log("2025-06-15", "missed"),
      log("2025-06-14", "taken"),
    ]);
    expect(streak).toBe(0); // yesterday missed → break immediately
  });
});

// ─── M7 — PRN doses excluded ─────────────────────────────────────────────────

describe("M7 — PRN doses do not count toward the streak", () => {
  it("a PRN-only today does not extend the streak", async () => {
    const streak = await computeStreak([
      log("2025-06-16", "taken", "prn-med-1"), // PRN today — excluded
      log("2025-06-15", "taken"),
      log("2025-06-14", "taken"),
    ]);
    expect(streak).toBe(2); // yesterday + 06-14 only; PRN today adds nothing
  });

  it("a PRN taken cannot mask a missed scheduled dose the same day", async () => {
    const streak = await computeStreak([
      log("2025-06-16", "taken"),
      log("2025-06-15", "missed", "sch-1"),        // scheduled missed
      log("2025-06-15", "taken", "prn-med-1"),     // PRN taken — must not whitewash
    ]);
    expect(streak).toBe(1); // only today; 06-15 still counts as missed → break
  });
});

// ─── M8 — today is neutral ───────────────────────────────────────────────────

describe("M8 — today does not reset the streak before it is due", () => {
  it("keeps the through-yesterday streak when today has no logs yet", async () => {
    const streak = await computeStreak([
      log("2025-06-15", "taken"),
      log("2025-06-14", "taken"),
      log("2025-06-13", "taken"),
    ]);
    expect(streak).toBe(3); // today (no logs) neither breaks nor adds
  });

  it("extends the streak once today becomes compliant", async () => {
    const streak = await computeStreak([
      log("2025-06-16", "taken"),
      log("2025-06-15", "taken"),
    ]);
    expect(streak).toBe(2); // yesterday + today
  });
});

// ─── Preserved behavior — skipped still breaks ──────────────────────────────

describe("skipped doses still break the streak", () => {
  it("breaks at a day with a skipped dose", async () => {
    const streak = await computeStreak([
      log("2025-06-15", "taken"),
      log("2025-06-15", "skipped"),
      log("2025-06-14", "taken"),
    ]);
    expect(streak).toBe(0); // yesterday skipped → break
  });
});
