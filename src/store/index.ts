import { create } from "zustand";
import { Appearance, Platform } from "react-native";
import { storage } from "../storage";
import {
  getMedications,
  getAllActiveSchedules,
  getDoseLogsByDate,
  clearAllData,
  getAppointments,
} from "../db/database";
import { today } from "../utils";
import { cancelAllNotifications } from "../services/notifications";
import { unregisterBackgroundFetch } from "../services/backgroundTask";
import { STORAGE_KEYS } from "../config";
import type { AppState, ThemeMode } from "./types";

import { createMedicationsSlice } from "./slices/medications";
import { createAppointmentsSlice } from "./slices/appointments";
import { createHealthSlice } from "./slices/health";
import { createUISlice } from "./slices/ui";

export type { ThemeMode } from "./types";

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()((...a) => {
  const [set, get] = a;

  return {
    // ── Spread slices ──────────────────────────────────────────────────
    ...createMedicationsSlice(...a),
    ...createAppointmentsSlice(...a),
    ...createHealthSlice(...a),
    ...createUISlice(...a),

    // ── Core state ─────────────────────────────────────────────────────
    todayLogs: [],
    isLoading: false,
    themeMode: "system" as ThemeMode,

    // ── Theme ──────────────────────────────────────────────────────────

    loadThemeMode() {
      const saved = storage.getString(STORAGE_KEYS.THEME_MODE) as ThemeMode | undefined;
      const mode: ThemeMode = saved ?? "system";
      if (Platform.OS !== "web") {
        Appearance.setColorScheme(mode === "system" ? null : mode);
      }
      set({ themeMode: mode });
    },

    setThemeMode(mode) {
      if (Platform.OS !== "web") {
        Appearance.setColorScheme(mode === "system" ? null : mode);
      }
      storage.set(STORAGE_KEYS.THEME_MODE, mode);
      set({ themeMode: mode });
    },

    // ── Load all data ─────────────────────────────────────────────────

    async loadAll() {
      set({ isLoading: true });
      try {
        const [meds, schedules, appointments] = await Promise.all([
          getMedications(),
          getAllActiveSchedules(),
          getAppointments(),
        ]);
        const logs = await getDoseLogsByDate(today());
        set({ medications: meds, schedules, todayLogs: logs, appointments, isLoading: false });
      } catch (e) {
        set({ isLoading: false });
        throw e;
      }
    },

    async loadTodayLogs() {
      const logs = await getDoseLogsByDate(today());
      set({ todayLogs: logs });
    },

    // ── Reset all data (dev / fresh start) ─────────────────────────────

    async resetAllData() {
      await cancelAllNotifications();
      await clearAllData();
      await unregisterBackgroundFetch();
      const [meds, schedules] = await Promise.all([getMedications(), getAllActiveSchedules()]);
      const logs = await getDoseLogsByDate(today());
      set({ medications: meds, schedules, todayLogs: logs, appointments: [], healthMeasurements: [], dailyCheckins: [], snoozedTimes: {} });
    },
  };
});
