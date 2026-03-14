/**
 * __tests__/hooks/useTodaySchedule.test.tsx
 *
 * P1 — useTodaySchedule hook: status resolution, sorting, snoozedUntil.
 *
 * Strategy:
 *  - Mock the entire Zustand store so we control medications/schedules/logs/snoozedTimes.
 *  - Use fake timers fixed at 10:00 AM on 2025-06-16 (Monday) so time-based
 *    pending/missed logic is deterministic.
 *  - renderHook from @testing-library/react-native renders Hook in a React context.
 */

import { renderHook } from "@testing-library/react-native";
import { useTodaySchedule } from "../../src/hooks/useTodaySchedule";
import { makeMedication, makeSchedule, makeDoseLog } from "../factories";

// ─── Mock the entire store ─────────────────────────────────────────────────

jest.mock("../../src/store", () => ({
  useAppStore: jest.fn(),
}));

import { useAppStore } from "../../src/store";

// ─── Helpers ───────────────────────────────────────────────────────────────

type StoreState = {
  medications: ReturnType<typeof makeMedication>[];
  schedules: ReturnType<typeof makeSchedule>[];
  todayLogs: ReturnType<typeof makeDoseLog>[];
  snoozedTimes: Record<string, string>;
};

function mockStore(state: Partial<StoreState>) {
  const full: StoreState = {
    medications: [],
    schedules: [],
    todayLogs: [],
    snoozedTimes: {},
    ...state,
  };
  (useAppStore as jest.Mock).mockImplementation((selector: (s: StoreState) => unknown) =>
    selector(full)
  );
}

// ─── Fixed "now": Monday, June 16, 2025 at 10:00 AM (local) ───────────────
const FAKE_NOW = new Date(2025, 5, 16, 10, 0, 0, 0);
const TODAY = "2025-06-16";

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FAKE_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Empty state ───────────────────────────────────────────────────────────

describe("empty state", () => {
  it("returns an empty array when there are no medications", () => {
    mockStore({});
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toEqual([]);
  });

  it("returns an empty array when the medication has no schedules", () => {
    mockStore({ medications: [makeMedication()], schedules: [] });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toEqual([]);
  });

  it("returns an empty array when all medications are inactive", () => {
    mockStore({
      medications: [makeMedication({ isActive: false })],
      schedules: [makeSchedule()],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toEqual([]);
  });
});

// ─── Status resolution — pending / missed ─────────────────────────────────

describe("status resolution — today, no log", () => {
  it("assigns 'pending' status for a future scheduled time", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ time: "12:00" })], // noon > 10 AM
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe("pending");
  });

  it("assigns 'missed' status for a past scheduled time", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ time: "08:00" })], // 8 AM < 10 AM
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].status).toBe("missed");
  });
});

// ─── Status from existing logs ─────────────────────────────────────────────

describe("status resolution — existing logs", () => {
  it("reflects 'taken' status from a log", () => {
    const log = makeDoseLog({ status: "taken" });
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule()],
      todayLogs: [log],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current[0].status).toBe("taken");
    expect(result.current[0].takenAt).toBe(log.takenAt);
    expect(result.current[0].doseLogId).toBe(log.id);
  });

  it("reflects 'skipped' status and skipReason from a log", () => {
    const log = makeDoseLog({ status: "skipped", skipReason: "forgot", takenAt: undefined });
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule()],
      todayLogs: [log],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current[0].status).toBe("skipped");
    expect(result.current[0].skipReason).toBe("forgot");
  });

  it("reflects 'missed' status from a log", () => {
    const log = makeDoseLog({ status: "missed", takenAt: undefined });
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule()],
      todayLogs: [log],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current[0].status).toBe("missed");
  });
});

// ─── Past and future dates ─────────────────────────────────────────────────

describe("status resolution — non-today dates", () => {
  it("returns 'missed' for a past date when no log exists", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ time: "08:00" })],
    });
    const { result } = renderHook(() => useTodaySchedule("2025-06-15")); // yesterday

    expect(result.current[0].status).toBe("missed");
  });

  it("returns 'pending' for a future date when no log exists", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ time: "08:00" })],
    });
    const { result } = renderHook(() => useTodaySchedule("2025-06-17")); // tomorrow

    expect(result.current[0].status).toBe("pending");
  });

  it("does NOT include snoozedUntil for non-today dates", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule()],
      snoozedTimes: { "sch-1-2025-06-15": "09:00" },
    });
    const { result } = renderHook(() => useTodaySchedule("2025-06-15"));

    // For non-today dates the hook intentionally omits snoozedUntil
    expect(result.current[0].snoozedUntil).toBeUndefined();
  });
});

// ─── Snoozed doses ─────────────────────────────────────────────────────────

describe("snoozedUntil", () => {
  it("includes snoozedUntil for today's date when snoozed", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule()],
      snoozedTimes: { "sch-1-2025-06-16": "08:30" },
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current[0].snoozedUntil).toBe("08:30");
  });

  it("snoozedUntil is undefined when there is no entry for the dose", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule()],
      snoozedTimes: {},
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    expect(result.current[0].snoozedUntil).toBeUndefined();
  });
});

// ─── Day-of-week filtering ─────────────────────────────────────────────────

describe("day-of-week schedule filtering", () => {
  // 2025-06-16 is a Monday (getDay() = 1)

  it("includes doses for schedules that match Monday", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ days: [1] })],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(1);
  });

  it("excludes doses for schedules that do not match Monday", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ days: [3, 5] })], // Wed and Fri only
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(0);
  });

  it("includes doses for daily schedules (empty days array) on all days", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ days: [] })],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(1);
  });
});

// ─── Date-bound medications ────────────────────────────────────────────────

describe("date-bound medication filtering", () => {
  it("excludes a medication that hasn't started yet", () => {
    mockStore({
      medications: [makeMedication({ startDate: "2025-06-20" })],
      schedules: [makeSchedule()],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(0);
  });

  it("excludes a medication whose course has ended", () => {
    mockStore({
      medications: [makeMedication({ endDate: "2025-06-14" })],
      schedules: [makeSchedule()],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(0);
  });

  it("includes a medication on its exact startDate boundary", () => {
    mockStore({
      medications: [makeMedication({ startDate: TODAY })],
      schedules: [makeSchedule()],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(1);
  });

  it("includes a medication on its exact endDate boundary", () => {
    mockStore({
      medications: [makeMedication({ endDate: TODAY })],
      schedules: [makeSchedule()],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(1);
  });
});

// ─── Multiple doses / sorting ──────────────────────────────────────────────

describe("multiple doses — sorting", () => {
  it("sorts doses ascending by scheduledTime", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [
        makeSchedule({ id: "sch-c", time: "20:00" }),
        makeSchedule({ id: "sch-a", time: "08:00" }),
        makeSchedule({ id: "sch-b", time: "14:00" }),
      ],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));

    const times = result.current.map((d) => d.scheduledTime);
    expect(times).toEqual(["08:00", "14:00", "20:00"]);
  });

  it("includes doses from multiple schedules of the same medication", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [
        makeSchedule({ id: "sch-1", time: "08:00" }),
        makeSchedule({ id: "sch-2", time: "20:00" }),
      ],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(2);
  });

  it("includes doses from multiple different medications", () => {
    mockStore({
      medications: [
        makeMedication({ id: "med-1" }),
        makeMedication({ id: "med-2", name: "Acetaminophen" }),
      ],
      schedules: [
        makeSchedule({ id: "sch-1", medicationId: "med-1" }),
        makeSchedule({ id: "sch-2", medicationId: "med-2" }),
      ],
    });
    const { result } = renderHook(() => useTodaySchedule(TODAY));
    expect(result.current).toHaveLength(2);
  });
});

// ─── Log matching by scheduleId + scheduledDate ────────────────────────────

describe("log matching", () => {
  it("only matches a log to the correct schedule/date combination", () => {
    // Two schedules; only sch-1 has a log
    const logForSch1 = makeDoseLog({ scheduleId: "sch-1", scheduledDate: TODAY, status: "taken" });
    mockStore({
      medications: [makeMedication()],
      schedules: [
        makeSchedule({ id: "sch-1", time: "08:00" }),
        makeSchedule({ id: "sch-2", time: "12:00" }),
      ],
      todayLogs: [logForSch1],
    });

    const { result } = renderHook(() => useTodaySchedule(TODAY));
    const dose1 = result.current.find((d) => d.schedule.id === "sch-1");
    const dose2 = result.current.find((d) => d.schedule.id === "sch-2");

    expect(dose1?.status).toBe("taken");
    expect(dose2?.status).toBe("pending"); // noon is in the future relative to 10 AM
  });

  it("uses the default target date (today) when no dateStr is provided", () => {
    mockStore({
      medications: [makeMedication()],
      schedules: [makeSchedule({ time: "12:00" })],
    });
    // No argument → hook uses format(new Date(), "yyyy-MM-dd")
    // With fake timers this resolves to TODAY
    const { result } = renderHook(() => useTodaySchedule());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].scheduledDate).toBe(TODAY);
  });
});
