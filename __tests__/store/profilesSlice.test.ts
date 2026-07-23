/**
 * Profiles slice (F2 multi-profile). The safety-critical path is
 * removeProfile: every alarm belonging to the profile must be cancelled
 * BEFORE its rows are deleted, and the built-in default profile can never
 * be removed.
 */
import { create } from "zustand";
import { createProfilesSlice } from "../../src/store/slices/profiles";
import { makeMedication, makeSchedule } from "../factories";
import * as db from "../../src/db/database";
import * as notifs from "../../src/services/notifications";

jest.mock("../../src/db/database", () => ({
  getProfiles: jest.fn().mockResolvedValue([]),
  insertProfile: jest.fn().mockResolvedValue(undefined),
  updateProfile: jest.fn().mockResolvedValue(undefined),
  deleteProfileData: jest.fn().mockResolvedValue(undefined),
  getMedications: jest.fn().mockResolvedValue([]),
  getAppointments: jest.fn().mockResolvedValue([]),
  getSchedulesByMedication: jest.fn().mockResolvedValue([]),
  deleteMedication: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/notifications", () => ({
  cancelScheduleNotifications: jest.fn().mockResolvedValue(undefined),
  cancelRenewalReminders: jest.fn().mockResolvedValue(undefined),
  cancelAppointmentNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/profileStore", () => {
  let active = "default";
  return {
    DEFAULT_PROFILE_ID: "default",
    getActiveProfileId: jest.fn(() => active),
    setActiveProfileId: jest.fn((id: string) => { active = id; }),
  };
});

const mockLoadAll = jest.fn().mockResolvedValue(undefined);
const mockLoadHealth = jest.fn().mockResolvedValue(undefined);
const mockLoadCheckins = jest.fn().mockResolvedValue(undefined);

function makeTestStore(initialState: Record<string, unknown> = {}) {
  return create<any>()((...a) => ({
    loadAll: mockLoadAll,
    loadHealthMeasurements: mockLoadHealth,
    loadDailyCheckins: mockLoadCheckins,
    ...createProfilesSlice(...a),
    ...initialState,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("addProfile / renameProfile", () => {
  it("persists a new profile and appends it to state", async () => {
    const store = makeTestStore();
    const p = await store.getState().addProfile("Mamá", "green");
    expect(jest.mocked(db.insertProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Mamá", color: "green" })
    );
    expect(store.getState().profiles).toContainEqual(p);
  });

  it("renames in place", async () => {
    const store = makeTestStore({
      profiles: [{ id: "p1", name: "Mamá", color: "green", createdAt: "2026-01-01" }],
    });
    await store.getState().renameProfile("p1", "Mami", "pink");
    expect(jest.mocked(db.updateProfile)).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Mami", color: "pink" })
    );
    expect(store.getState().profiles[0].name).toBe("Mami");
  });
});

describe("switchProfile", () => {
  it("persists the id and reloads every profile-scoped list", async () => {
    const store = makeTestStore();
    await store.getState().switchProfile("p1");
    expect(store.getState().activeProfileId).toBe("p1");
    expect(mockLoadAll).toHaveBeenCalled();
    expect(mockLoadHealth).toHaveBeenCalled();
    expect(mockLoadCheckins).toHaveBeenCalled();
  });
});

describe("removeProfile (safety-critical)", () => {
  it("never removes the default profile", async () => {
    const store = makeTestStore();
    await store.getState().removeProfile("default");
    expect(jest.mocked(db.deleteProfileData)).not.toHaveBeenCalled();
  });

  it("cancels the profile's alarms, renewals and appointment reminders before deleting", async () => {
    const med = makeMedication({ id: "med-p1", profileId: "p1" });
    const otherMed = makeMedication({ id: "med-other", profileId: "default" });
    const sched = makeSchedule({ id: "sch-p1", medicationId: "med-p1" });
    jest.mocked(db.getMedications).mockResolvedValue([med, otherMed]);
    jest.mocked(db.getSchedulesByMedication).mockResolvedValue([sched]);
    jest.mocked(db.getAppointments).mockResolvedValue([
      { id: "appt-1", title: "Cardio", date: "2026-08-01", createdAt: "2026-01-01", notificationId: "notif-9", profileId: "p1" } as never,
    ]);

    const store = makeTestStore({
      profiles: [
        { id: "default", name: "", color: "blue", createdAt: "2026-01-01" },
        { id: "p1", name: "Mamá", color: "green", createdAt: "2026-01-02" },
      ],
    });
    await store.getState().removeProfile("p1");

    // Only the profile's own med was touched, with its alarms cancelled first.
    expect(jest.mocked(notifs.cancelScheduleNotifications)).toHaveBeenCalledWith("sch-p1");
    expect(jest.mocked(notifs.cancelRenewalReminders)).toHaveBeenCalledWith(med);
    expect(jest.mocked(db.deleteMedication)).toHaveBeenCalledWith("med-p1");
    expect(jest.mocked(db.deleteMedication)).not.toHaveBeenCalledWith("med-other");
    expect(jest.mocked(notifs.cancelAppointmentNotification)).toHaveBeenCalledWith("notif-9");
    expect(jest.mocked(db.deleteProfileData)).toHaveBeenCalledWith("p1");
    expect(store.getState().profiles.map((p: { id: string }) => p.id)).toEqual(["default"]);
  });

  it("switches back to the default profile when the active one is removed", async () => {
    const store = makeTestStore({
      profiles: [
        { id: "default", name: "", color: "blue", createdAt: "2026-01-01" },
        { id: "p1", name: "Mamá", color: "green", createdAt: "2026-01-02" },
      ],
    });
    await store.getState().switchProfile("p1");
    mockLoadAll.mockClear();

    await store.getState().removeProfile("p1");
    expect(store.getState().activeProfileId).toBe("default");
    expect(mockLoadAll).toHaveBeenCalled();
  });
});
