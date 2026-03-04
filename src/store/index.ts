import { create } from "zustand";
import { addDays, startOfDay } from "date-fns";
import { Medication, Schedule, DoseLog, DoseStatus, TodayDose } from "../types";
import {
  getMedications,
  getSchedulesByMedication,
  getAllActiveSchedules,
  insertMedication,
  updateMedication,
  deleteMedication,
  insertSchedule,
  updateSchedule,
  deleteSchedule,
  deleteSchedulesByMedication,
  getDoseLogsByDate,
  getDoseLogsByDateRange,
  upsertDoseLog,
  updateDoseLogStatus,
  clearAllData,
} from "../db/database";
import {
  generateId,
  today,
  toISOString,
  isScheduleActiveOnDate,
} from "../utils";
import {
  scheduleDoseChain,
  cancelDoseNotifications,
  cancelScheduleNotifications,
  cancelAllNotifications,
  snoozeDose,
} from "../services/notifications";

// ─── State ─────────────────────────────────────────────────────────────────

interface AppState {
  medications: Medication[];
  schedules: Schedule[];  // all schedules in memory
  todayLogs: DoseLog[];
  isLoading: boolean;

  // Actions
  loadAll: () => Promise<void>;
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

    for (const s of schedules) {
      await insertSchedule(s);
      // Schedule notifications for the next 7 days
      await _scheduleNotificationsForSchedule(med, s);
    }

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
    for (const s of existing) {
      await cancelScheduleNotifications(s.id);
      await deleteSchedule(s.id);
    }

    // Insert new schedules
    const newSchedules: Schedule[] = scheduleInputs.map((s) => ({
      ...s,
      id: generateId(),
      medicationId: med.id,
      isActive: true,
    }));

    for (const s of newSchedules) {
      await insertSchedule(s);
      if (med.isActive) {
        await _scheduleNotificationsForSchedule(med, s);
      }
    }

    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
    set({ medications: allMeds, schedules: allSchedules });
  },

  // ── Delete medication ──────────────────────────────────────────────────

  async deleteMedication(id) {
    const schedules = await getSchedulesByMedication(id);
    for (const s of schedules) {
      await cancelScheduleNotifications(s.id);
    }
    await deleteMedication(id);
    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getMedications();
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
      for (const s of schedules) {
        await cancelScheduleNotifications(s.id);
      }
    } else {
      for (const s of schedules) {
        await _scheduleNotificationsForSchedule(updated, s);
      }
    }

    const allMeds = await getMedications();
    set({ medications: allMeds });
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
    await clearAllData();
    set({ medications: [], schedules: [], todayLogs: [] });
  },
}));

// ─── Internal helpers ──────────────────────────────────────────────────────

import { toDateString } from "../utils";

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
