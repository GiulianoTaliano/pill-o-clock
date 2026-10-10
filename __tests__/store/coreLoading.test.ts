import { useAppStore } from "../../src/store";
import * as db from "../../src/db/database";
import { getActiveProfileId } from "../../src/services/profileStore";
import { makeDoseLog, makeMedication } from "../factories";

jest.mock("../../src/store/slices/medications", () => ({
  createMedicationsSlice: () => ({ medications: [], schedules: [] }),
}));
jest.mock("../../src/store/slices/appointments", () => ({
  createAppointmentsSlice: () => ({ appointments: [] }),
}));
jest.mock("../../src/store/slices/health", () => ({
  createHealthSlice: () => ({ healthMeasurements: [], dailyCheckins: [] }),
}));
jest.mock("../../src/store/slices/ui", () => ({
  createUISlice: () => ({ snoozedTimes: {} }),
}));
jest.mock("../../src/store/slices/profiles", () => ({
  createProfilesSlice: () => ({ activeProfileId: "default", profiles: [] }),
}));
jest.mock("../../src/services/profileStore", () => ({
  getActiveProfileId: jest.fn(() => "default"),
}));
jest.mock("../../src/services/notifications", () => ({
  cancelAllNotifications: jest.fn().mockResolvedValue(undefined),
  rebuildDoseNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/backgroundTask", () => ({
  unregisterBackgroundFetch: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/services/webTheme", () => ({ applyWebTheme: jest.fn() }));
jest.mock("../../src/db/database", () => ({
  getActiveMedications: jest.fn().mockResolvedValue([]),
  getAllActiveSchedules: jest.fn().mockResolvedValue([]),
  getDoseLogsByDate: jest.fn().mockResolvedValue([]),
  getDoseLogsByDateRange: jest.fn().mockResolvedValue([]),
  reconcileActiveProfile: jest.fn().mockResolvedValue("default"),
  clearAllData: jest.fn().mockResolvedValue(undefined),
  getActiveAppointments: jest.fn().mockResolvedValue([]),
  getProfiles: jest.fn().mockResolvedValue([]),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getActiveProfileId).mockReturnValue("default");
  useAppStore.setState({
    activeProfileId: "default",
    medications: [],
    todayLogs: [],
    isLoading: false,
  });
});

it("does not restore stale medications when an earlier load finishes after reset", async () => {
  const pending = deferred<ReturnType<typeof makeMedication>[]>();
  jest.mocked(db.getActiveMedications).mockReturnValueOnce(pending.promise);
  const load = useAppStore.getState().loadAll();
  await Promise.resolve();
  await useAppStore.getState().resetAllData();
  pending.resolve([makeMedication({ id: "removed" })]);
  await load;
  expect(useAppStore.getState().medications).toEqual([]);
  expect(useAppStore.getState().isLoading).toBe(false);
});

it("does not publish dose logs from a person who is no longer selected", async () => {
  const pending = deferred<ReturnType<typeof makeDoseLog>[]>();
  jest.mocked(db.getDoseLogsByDateRange).mockReturnValueOnce(pending.promise);
  const load = useAppStore.getState().loadTodayLogs();
  jest.mocked(getActiveProfileId).mockReturnValue("other-person");
  pending.resolve([makeDoseLog({ id: "private-old-log" })]);
  await load;
  expect(useAppStore.getState().todayLogs).toEqual([]);
});

it("keeps the latest profile when an earlier reconciliation finishes late", async () => {
  const pending = deferred<string>();
  jest.mocked(db.reconcileActiveProfile).mockReturnValueOnce(pending.promise);
  const earlier = useAppStore.getState().loadAll();
  jest.mocked(getActiveProfileId).mockReturnValue("other-person");
  jest.mocked(db.reconcileActiveProfile).mockResolvedValueOnce("other-person");
  await useAppStore.getState().loadAll();
  pending.resolve("default");
  await earlier;
  expect(useAppStore.getState().activeProfileId).toBe("other-person");
});
