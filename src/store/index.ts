import { create } from "zustand";
import { Appearance, Platform } from "react-native";
import { storage } from "../storage";
import {
  getActiveMedications,
  getAllActiveSchedules,
  getDoseLogsByDate,
  getDoseLogsByDateRange,
  reconcileActiveProfile,
  clearAllData,
  getActiveAppointments,
  getProfiles,
} from "../db/database";
import { today } from "../utils";
import { format, subDays } from "date-fns";
import { saveSnoozedDoses } from "../services/snoozedDoses";
import { applyWebTheme } from "../services/webTheme";
import { getActiveProfileId } from "../services/profileStore";
import {
  cancelAllNotifications,
  rebuildDoseNotifications,
} from "../services/notifications";
import { unregisterBackgroundFetch } from "../services/backgroundTask";
import { STORAGE_KEYS } from "../config";
import type { AppState, ThemeMode } from "./types";

import { createMedicationsSlice } from "./slices/medications";
import { createAppointmentsSlice } from "./slices/appointments";
import { createHealthSlice } from "./slices/health";
import { createUISlice } from "./slices/ui";
import { createProfilesSlice } from "./slices/profiles";

export type { ThemeMode } from "./types";

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()((...a) => {
  const [set, get] = a;
  let loadGeneration = 0;
  let logGeneration = 0;
  let resetting = false;

  return {
    // ── Spread slices ──────────────────────────────────────────────────
    ...createMedicationsSlice(...a),
    ...createAppointmentsSlice(...a),
    ...createHealthSlice(...a),
    ...createUISlice(...a),
    ...createProfilesSlice(...a),

    // ── Core state ─────────────────────────────────────────────────────
    todayLogs: [],
    isLoading: false,
    themeMode: "system" as ThemeMode,
    // Senior mode reads synchronously so the first render is already scaled.
    seniorMode: storage.getString(STORAGE_KEYS.SENIOR_MODE) === "1",

    setSeniorMode(on: boolean) {
      storage.set(STORAGE_KEYS.SENIOR_MODE, on ? "1" : "0");
      set({ seniorMode: on });
    },

    // ── Theme ──────────────────────────────────────────────────────────

    loadThemeMode() {
      const saved = storage.getString(STORAGE_KEYS.THEME_MODE) as
        | ThemeMode
        | undefined;
      const mode: ThemeMode = saved ?? "system";
      if (Platform.OS !== "web") {
        Appearance.setColorScheme(mode === "system" ? null : mode);
      } else {
        applyWebTheme(mode);
      }
      set({ themeMode: mode });
    },

    setThemeMode(mode) {
      if (Platform.OS !== "web") {
        Appearance.setColorScheme(mode === "system" ? null : mode);
      } else {
        applyWebTheme(mode);
      }
      storage.set(STORAGE_KEYS.THEME_MODE, mode);
      set({ themeMode: mode });
    },

    // ── Load all data ─────────────────────────────────────────────────

    async loadAll() {
      if (resetting) return;
      const generation = ++loadGeneration;
      ++logGeneration;
      set({ isLoading: true });
      try {
        const activeProfileId = await reconcileActiveProfile();
        if (generation !== loadGeneration) return;
        if (activeProfileId !== get().activeProfileId) {
          set({
            activeProfileId,
            medications: [],
            schedules: [],
            todayLogs: [],
            appointments: [],
            appointmentDocuments: [],
            healthMeasurements: [],
            dailyCheckins: [],
            selectedAppointmentId: null,
            pendingEditAppointmentId: null,
          });
        }
        const [meds, schedules, appointments, profiles] = await Promise.all([
          getActiveMedications(),
          getAllActiveSchedules(),
          getActiveAppointments(),
          getProfiles(),
        ]);
        const logs = await getDoseLogsByDateRange(
          format(subDays(new Date(), 1), "yyyy-MM-dd"),
          today()
        );
        if (
          generation !== loadGeneration ||
          getActiveProfileId() !== activeProfileId
        )
          return;
        set({
          activeProfileId,
          medications: meds,
          schedules,
          todayLogs: logs,
          appointments,
          profiles,
          isLoading: false,
        });
      } catch (e) {
        if (generation === loadGeneration) set({ isLoading: false });
        throw e;
      }
    },

    async loadTodayLogs() {
      if (resetting) return;
      const generation = ++logGeneration;
      const profileId = getActiveProfileId();
      const logs = await getDoseLogsByDateRange(
        format(subDays(new Date(), 1), "yyyy-MM-dd"),
        today()
      );
      if (generation !== logGeneration || getActiveProfileId() !== profileId)
        return;
      set({ todayLogs: logs });
    },

    // ── Reset all data (dev / fresh start) ─────────────────────────────

    async resetAllData() {
      if (resetting) return;
      resetting = true;
      ++loadGeneration;
      ++logGeneration;
      set({ isLoading: true });
      try {
        try {
          await cancelAllNotifications();
          await clearAllData();
        } catch (error) {
          await rebuildDoseNotifications().catch(() => {});
          throw error;
        }
        await unregisterBackgroundFetch();
        saveSnoozedDoses({});
        const activeProfileId = await reconcileActiveProfile();
        const [meds, schedules, profiles] = await Promise.all([
          getActiveMedications(),
          getAllActiveSchedules(),
          getProfiles(),
        ]);
        const logs = await getDoseLogsByDate(today());
        set({
          activeProfileId,
          profiles,
          medications: meds,
          schedules,
          todayLogs: logs,
          appointments: [],
          appointmentDocuments: [],
          healthMeasurements: [],
          dailyCheckins: [],
          snoozedTimes: {},
          selectedAppointmentId: null,
          pendingEditAppointmentId: null,
        });
      } finally {
        resetting = false;
        set({ isLoading: false });
      }
    },
  };
});
