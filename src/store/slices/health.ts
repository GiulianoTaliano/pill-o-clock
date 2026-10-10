import type { StateCreator } from "zustand";
import type { AppState, HealthSlice } from "../types";
import type { HealthMeasurement, DailyCheckin } from "../../types";
import {
  getActiveHealthMeasurements,
  insertHealthMeasurement,
  deleteHealthMeasurement as deleteHealthMeasurementDb,
  getActiveDailyCheckins,
  upsertDailyCheckin,
} from "../../db/database";
import { generateId, toISOString } from "../../utils";
import { syncMeasurementToHealthConnect } from "../../services/healthSync";
import { getActiveProfileId } from "../../services/profileStore";

export const createHealthSlice: StateCreator<AppState, [], [], HealthSlice> = (
  set,
  get
) => ({
  healthMeasurements: [],
  dailyCheckins: [],

  async loadHealthMeasurements(type) {
    const profile = getActiveProfileId();
    const items = await getActiveHealthMeasurements(type, 0);
    if (getActiveProfileId() === profile) set({ healthMeasurements: items });
  },

  async addHealthMeasurement(data) {
    const m: HealthMeasurement = {
      ...data,
      profileId: data.profileId ?? getActiveProfileId(),
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    await insertHealthMeasurement(m);
    if (getActiveProfileId() === m.profileId)
      set((s) => ({
        healthMeasurements: [m, ...s.healthMeasurements].sort((a, b) =>
          b.measuredAt.localeCompare(a.measuredAt)
        ),
      }));
    // One-way Health Connect push (F2) — fire-and-forget, never blocks the save.
    syncMeasurementToHealthConnect(m).catch(() => {});
  },

  async deleteHealthMeasurement(id) {
    await deleteHealthMeasurementDb(id);
    set((s) => ({
      healthMeasurements: s.healthMeasurements.filter((m) => m.id !== id),
    }));
  },

  async loadDailyCheckins() {
    const profile = getActiveProfileId();
    const items = await getActiveDailyCheckins(undefined, undefined, 0);
    if (getActiveProfileId() === profile) set({ dailyCheckins: items });
  },

  async saveDailyCheckin(data) {
    const profileId = data.profileId ?? getActiveProfileId();
    const previous = get().dailyCheckins.find(
      (c) => c.date === data.date && (c.profileId ?? "default") === profileId
    );
    const checkin: DailyCheckin = {
      ...data,
      profileId,
      id: previous?.id ?? generateId(),
      createdAt: previous?.createdAt ?? toISOString(new Date()),
    };
    await upsertDailyCheckin(checkin);
    if (getActiveProfileId() === profileId)
      set((s) => ({
        dailyCheckins: [
          checkin,
          ...s.dailyCheckins.filter((c) => c.date !== checkin.date),
        ].sort((a, b) => b.date.localeCompare(a.date)),
      }));
  },
});
