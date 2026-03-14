import type { StateCreator } from "zustand";
import type { AppState, HealthSlice } from "../types";
import type { HealthMeasurement, DailyCheckin } from "../../types";
import {
  getHealthMeasurements,
  insertHealthMeasurement,
  deleteHealthMeasurement as deleteHealthMeasurementDb,
  getDailyCheckins,
  upsertDailyCheckin,
} from "../../db/database";
import { generateId, toISOString } from "../../utils";

export const createHealthSlice: StateCreator<AppState, [], [], HealthSlice> = (set) => ({
  healthMeasurements: [],
  dailyCheckins: [],

  async loadHealthMeasurements(type) {
    const items = await getHealthMeasurements(type);
    set({ healthMeasurements: items });
  },

  async addHealthMeasurement(data) {
    const m: HealthMeasurement = {
      ...data,
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    await insertHealthMeasurement(m);
    set((s) => ({ healthMeasurements: [m, ...s.healthMeasurements] }));
  },

  async deleteHealthMeasurement(id) {
    await deleteHealthMeasurementDb(id);
    set((s) => ({ healthMeasurements: s.healthMeasurements.filter((m) => m.id !== id) }));
  },

  async loadDailyCheckins() {
    const items = await getDailyCheckins();
    set({ dailyCheckins: items });
  },

  async saveDailyCheckin(data) {
    const checkin: DailyCheckin = {
      ...data,
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    await upsertDailyCheckin(checkin);
    set((s) => ({
      dailyCheckins: [
        checkin,
        ...s.dailyCheckins.filter((c) => c.date !== checkin.date),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    }));
  },
});
