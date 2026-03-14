import { addDays, addMinutes, format, startOfDay } from "date-fns";
import * as StoreReview from "expo-store-review";
import type { StateCreator } from "zustand";
import type { AppState, MedicationsSlice } from "../types";
import type { Medication, Schedule, DoseLog } from "../../types";
import { storage } from "../../storage";
import { STORAGE_KEYS } from "../../config";
import {
  getMedications,
  getSchedulesByMedication,
  getAllActiveSchedules,
  insertMedication,
  updateMedication,
  deleteMedication,
  insertSchedule,
  deleteSchedule,
  getDoseLogsByDateRange,
  upsertDoseLog,
  deleteDoseLog,
  updateMedicationStock,
  updateDoseLogNotes,
} from "../../db/database";
import {
  generateId,
  today,
  toISOString,
  toDateString,
  isScheduleActiveOnDate,
} from "../../utils";
import {
  scheduleDoseChain,
  cancelDoseNotifications,
  cancelScheduleNotifications,
  snoozeDose,
  SNOOZE_MINUTES,
  scheduleStockAlert,
} from "../../services/notifications";

export const createMedicationsSlice: StateCreator<AppState, [], [], MedicationsSlice> = (set, get) => ({
  medications: [],
  schedules: [],

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

    const existing = await getSchedulesByMedication(med.id);

    await Promise.all(
      existing.map((s) =>
        Promise.all([cancelScheduleNotifications(s.id), deleteSchedule(s.id)])
      )
    );

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

    const allMeds = await getMedications();
    set({ medications: allMeds });
  },

  // ── Mark dose (taken / skipped) ────────────────────────────────────────

  async markDose(dose, status, notes, skipReason) {
    const now = new Date();
    const log: DoseLog = {
      id: generateId(),
      medicationId: dose.medication.id,
      scheduleId: dose.schedule.id,
      scheduledDate: dose.scheduledDate,
      scheduledTime: dose.snoozedUntil ?? dose.scheduledTime,
      status,
      takenAt: status === "taken" ? toISOString(now) : undefined,
      createdAt: toISOString(now),
      notes,
      skipReason: status === "skipped" ? skipReason : undefined,
    };

    await upsertDoseLog(log);
    await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);

    const doseKey = `${dose.schedule.id}-${dose.scheduledDate}`;
    set((s) => {
      const { [doseKey]: _removed, ...rest } = s.snoozedTimes;
      return { snoozedTimes: rest };
    });

    // Decrement stock
    if (status === "taken") {
      const latestMed =
        get().medications.find((m) => m.id === dose.medication.id) ??
        dose.medication;
      if (latestMed.stockQuantity != null && latestMed.stockQuantity > 0) {
        const newQty = latestMed.stockQuantity - 1;
        await updateMedicationStock(latestMed.id, newQty);
        if (
          latestMed.stockAlertThreshold != null &&
          newQty < latestMed.stockAlertThreshold
        ) {
          await scheduleStockAlert({ ...latestMed, stockQuantity: newQty });
        }
        const allMeds = await getMedications();
        set({ medications: allMeds });
      }
    }

    // ── Store-review prompt ─────────────────────────────────────────────
    if (status === "taken") {
      const prompted = storage.getString(STORAGE_KEYS.REVIEW_PROMPTED);
      if (!prompted) {
        let firstLaunch = storage.getString(STORAGE_KEYS.FIRST_LAUNCH);
        if (!firstLaunch) {
          firstLaunch = new Date().toISOString();
          storage.set(STORAGE_KEYS.FIRST_LAUNCH, firstLaunch);
        }

        const prevCount = parseInt(storage.getString(STORAGE_KEYS.DOSES_TAKEN_COUNT) ?? "0", 10);
        const newCount = prevCount + 1;
        storage.set(STORAGE_KEYS.DOSES_TAKEN_COUNT, String(newCount));

        const daysSince = (Date.now() - new Date(firstLaunch).getTime()) / 86_400_000;
        if (daysSince >= 7 && newCount >= 10 && (await StoreReview.isAvailableAsync())) {
          await StoreReview.requestReview();
          storage.set(STORAGE_KEYS.REVIEW_PROMPTED, "1");
        }
      }
    }

    await get().loadTodayLogs();
  },

  async updateDoseNote(scheduleId, scheduledDate, notes) {
    await updateDoseLogNotes(scheduleId, scheduledDate, notes);
    await get().loadTodayLogs();
  },

  // ── Snooze ─────────────────────────────────────────────────────────────

  async snoozeDose(dose) {
    const now = new Date();
    const [sh, sm] = dose.schedule.time.split(":").map(Number);
    const originalDateTime = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(), sh, sm
    );
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;

    if (originalDateTime > now) {
      const currentSnoozedHHmm = get().snoozedTimes[key];
      const baseDate = currentSnoozedHHmm
        ? (() => {
            const [bh, bm] = currentSnoozedHHmm.split(":").map(Number);
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
          })()
        : originalDateTime;
      const fireDate = addMinutes(baseDate, SNOOZE_MINUTES);
      const snoozeHHmm = format(fireDate, "HH:mm");

      await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate, fireDate);
      set((s) => ({ snoozedTimes: { ...s.snoozedTimes, [key]: snoozeHHmm } }));
    } else {
      const snoozeDate = addMinutes(new Date(), SNOOZE_MINUTES);
      const snoozeHHmm = format(snoozeDate, "HH:mm");
      await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate);
      set((s) => ({ snoozedTimes: { ...s.snoozedTimes, [key]: snoozeHHmm } }));
    }
  },

  // ── Reschedule once ────────────────────────────────────────────────────

  async rescheduleOnce(dose, newTime) {
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    const [h, m] = newTime.split(":").map(Number);
    const now = new Date();
    const fireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);

    await snoozeDose(dose.medication, dose.schedule, dose.scheduledDate, fireDate);
    set((s) => ({ snoozedTimes: { ...s.snoozedTimes, [key]: newTime } }));
  },

  // ── Revert snooze ────────────────────────────────────────────────────

  async revertSnooze(dose) {
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);

    const [h, m] = dose.schedule.time.split(":").map(Number);
    const [y, mo, d] = dose.scheduledDate.split("-").map(Number);
    const originalFireDate = new Date(y, mo - 1, d, h, m);
    if (originalFireDate > new Date()) {
      await scheduleDoseChain(dose.medication, dose.schedule, dose.scheduledDate);
    }

    set((s) => {
      const { [key]: _removed, ...rest } = s.snoozedTimes;
      return { snoozedTimes: rest };
    });
  },

  // ── Revert dose ────────────────────────────────────────────────────────

  async revertDose(dose) {
    await deleteDoseLog(dose.schedule.id, dose.scheduledDate);
    await _scheduleNotificationsForSchedule(dose.medication, dose.schedule);

    const revertKey = `${dose.schedule.id}-${dose.scheduledDate}`;
    set((s) => {
      const { [revertKey]: _removed, ...rest } = s.snoozedTimes;
      return { snoozedTimes: rest };
    });
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

  // ── Log PRN dose ──────────────────────────────────────────────────────

  async logPRNDose(medication) {
    const now = new Date();
    // Each PRN log gets a unique scheduleId so that multiple doses on the
    // same day are tracked as separate entries (not overwritten by upsert).
    const log: DoseLog = {
      id: generateId(),
      medicationId: medication.id,
      scheduleId: `prn-${medication.id}-${generateId().slice(0, 8)}`,
      scheduledDate: toDateString(now),
      scheduledTime: format(now, "HH:mm"),
      status: "taken",
      takenAt: toISOString(now),
      createdAt: toISOString(now),
    };
    await upsertDoseLog(log);

    if (medication.stockQuantity != null && medication.stockQuantity > 0) {
      const newQty = medication.stockQuantity - 1;
      await updateMedicationStock(medication.id, newQty);
      if (
        medication.stockAlertThreshold != null &&
        newQty < medication.stockAlertThreshold
      ) {
        await scheduleStockAlert({ ...medication, stockQuantity: newQty });
      }
      const allMeds = await getMedications();
      set({ medications: allMeds });
    }

    await get().loadTodayLogs();
  },
});

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
