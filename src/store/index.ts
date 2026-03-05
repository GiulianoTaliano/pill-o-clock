import { create } from "zustand";
import { addDays, startOfDay } from "date-fns";
import { Appearance, LayoutAnimation, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Medication, Schedule, DoseLog, TodayDose } from "../types";
import {
  getMedications,
  getSchedulesByMedication,
  getAllActiveSchedules,
  insertMedication,
  updateMedication,
  deleteMedication,
  insertSchedule,
  deleteSchedule,
  getDoseLogsByDate,
  getDoseLogsByDateRange,
  upsertDoseLog,
  deleteDoseLog,
  clearAllData,
} from "../db/database";
import {
  generateId,
  today,
  toISOString,
  toDateString,
  isScheduleActiveOnDate,
} from "../utils";
import {
  scheduleDoseChain,
  cancelDoseNotifications,
  cancelScheduleNotifications,
  cancelAllNotifications,
  snoozeDose,
} from "../services/notifications";
import { unregisterBackgroundFetch } from "../services/backgroundTask";

// ─── State ─────────────────────────────────────────────────────────────────

export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "@pilloclock/theme_mode";

interface AppState {
  medications: Medication[];
  schedules: Schedule[];  // all schedules in memory
  todayLogs: DoseLog[];
  isLoading: boolean;
  themeMode: ThemeMode;

  // Actions
  loadAll: () => Promise<void>;
  loadThemeMode: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  loadTodayLogs: () => Promise<void>;

  addMedication: (
    data: Omit<Medication, "id" | "createdAt" | "isActive">,
    scheduleInputs: Omit<Schedule, "id" | "medicationId" | "isActive">[]
  ) => Promise<Medication>;

  updateMedication: (
    med: Medication,
    scheduleInputs: Omit<Schedule, "id" | "medicationId" | "isActive">[]
  ) => Promise<void>;

  deleteMedication: (id: string) => Promise<void>;

  toggleMedicationActive: (id: string, isActive: boolean) => Promise<void>;

  markDose: (
    dose: TodayDose,
    status: "taken" | "skipped"
  ) => Promise<void>;

  snoozeDose: (dose: TodayDose) => Promise<void>;

  /** Remove a taken/skipped log so the dose can be re-marked. */
  revertDose: (dose: TodayDose) => Promise<void>;

  getHistoryLogs: (from: string, to: string) => Promise<DoseLog[]>;

  getSchedulesForMedication: (medicationId: string) => Schedule[];

  /** Wipes all DB rows and cancels all scheduled notifications. */
  resetAllData: () => Promise<void>;
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  medications: [],
  schedules: [],
  todayLogs: [],
  isLoading: false,
  themeMode: "system",

  // ── Theme ─────────────────────────────────────────────────────────────

  async loadThemeMode() {
    const saved = (await AsyncStorage.getItem(THEME_KEY)) as ThemeMode | null;
    const mode: ThemeMode = saved ?? "system";
    Appearance.setColorScheme(mode === "system" ? null : mode);
    set({ themeMode: mode });
  },

  async setThemeMode(mode) {
    Appearance.setColorScheme(mode === "system" ? null : mode);
    await AsyncStorage.setItem(THEME_KEY, mode);
    set({ themeMode: mode });
  },

  // ── Load all data ──────────────────────────────────────────────────────

  async loadAll() {
    set({ isLoading: true });
    try {
      const [meds, schedules] = await Promise.all([
        getMedications(),
        getAllActiveSchedules(),
      ]);
      const logs = await getDoseLogsByDate(today());
      set({ medications: meds, schedules, todayLogs: logs, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  async loadTodayLogs() {
    const logs = await getDoseLogsByDate(today());
    set({ todayLogs: logs });
  },

  // ── Add medication ─────────────────────────────────────────────────────

  async addMedication(data, scheduleInputs) {
    const med: Medication = {
      ...data,
      id: generateId(),
      isActive: true,
      createdAt: toISOString(new Date()),
    };

    await insertMedication(med);

    const schedules: Schedule[] = scheduleInputs.map((s) => ({
      ...s,
      id: generateId(),
      medicationId: med.id,
      isActive: true,
    }));

    await Promise.all(
      schedules.map(async (s) => {
        await insertSchedule(s);
        await _scheduleNotificationsForSchedule(med, s);
      })
    );

    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    set({ medications: allMeds, schedules: allSchedules });

    return med;
  },

  // ── Update medication ──────────────────────────────────────────────────

  async updateMedication(med, scheduleInputs) {
    await updateMedication(med);

    // Get existing schedules
    const existing = await getSchedulesByMedication(med.id);

    // Cancel all current notifications for this med's schedules
    await Promise.all(
      existing.map((s) =>
        Promise.all([cancelScheduleNotifications(s.id), deleteSchedule(s.id)])
      )
    );

    // Insert new schedules
    const newSchedules: Schedule[] = scheduleInputs.map((s) => ({
      ...s,
      id: generateId(),
      medicationId: med.id,
      isActive: true,
    }));

    await Promise.all(
      newSchedules.map(async (s) => {
        await insertSchedule(s);
        if (med.isActive) await _scheduleNotificationsForSchedule(med, s);
      })
    );

    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    set({ medications: allMeds, schedules: allSchedules });
  },

  // ── Delete medication ──────────────────────────────────────────────────

  async deleteMedication(id) {
    const schedules = await getSchedulesByMedication(id);
    await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
    await deleteMedication(id);
    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    set({ medications: allMeds, schedules: allSchedules });
  },

  // ── Toggle active ──────────────────────────────────────────────────────

  async toggleMedicationActive(id, isActive) {
    const { medications } = get();
    const med = medications.find((m) => m.id === id);
    if (!med) return;
    const updated = { ...med, isActive };
    await updateMedication(updated);

    const schedules = await getSchedulesByMedication(id);
    if (!isActive) {
      await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
    } else {
      await Promise.all(schedules.map((s) => _scheduleNotificationsForSchedule(updated, s)));
    }

    const allMeds = await getMedications();    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);    set({ medications: allMeds });
  },

  // ── Mark dose (taken / skipped) ────────────────────────────────────────

  async markDose(dose, status) {
    const now = new Date();
    const log: DoseLog = {
      id: generateId(),
      medicationId: dose.medication.id,
      scheduleId: dose.schedule.id,
      scheduledDate: dose.scheduledDate,
      scheduledTime: dose.scheduledTime,
      status,
      takenAt: status === "taken" ? toISOString(now) : undefined,
      createdAt: toISOString(now),
    };

    await upsertDoseLog(log);
    await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);
    await get().loadTodayLogs();
  },

  // ── Snooze ─────────────────────────────────────────────────────────────

  async snoozeDose(dose) {
    // Cancel current chain and schedule for +15 min
    await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate);
  },
  // ── Revert dose (undo taken/skipped) ─────────────────────────────────────────

  async revertDose(dose) {
    await deleteDoseLog(dose.schedule.id, dose.scheduledDate);
    // Re-schedule any future notifications for this dose's schedule
    await _scheduleNotificationsForSchedule(dose.medication, dose.schedule);
    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await get().loadTodayLogs();
  },
  // ── History ────────────────────────────────────────────────────────────

  async getHistoryLogs(from, to) {
    return getDoseLogsByDateRange(from, to);
  },

  // ── Helper ────────────────────────────────────────────────────────────

  getSchedulesForMedication(medicationId) {
    return get().schedules.filter((s) => s.medicationId === medicationId);
  },

  // ── Reset all data (dev / fresh start) ────────────────────────────────

  async resetAllData() {
    await cancelAllNotifications();
    await unregisterBackgroundFetch();
    await clearAllData();
    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    set({ medications: [], schedules: [], todayLogs: [] });
  },
}));

// ─── Internal helpers ──────────────────────────────────────────────────────

async function _scheduleNotificationsForSchedule(
  med: Medication,
  schedule: Schedule
): Promise<void> {
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const date = addDays(startOfDay(now), i);
    if (!isScheduleActiveOnDate(schedule, date, med)) continue;
    const scheduledDate = toDateString(date);

    // Build fire Date
    const [h, m] = schedule.time.split(":").map(Number);
    const fireDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      h,
      m
    );
    if (fireDate <= now) continue;

    await scheduleDoseChain(med, schedule, scheduledDate);
  }
}
