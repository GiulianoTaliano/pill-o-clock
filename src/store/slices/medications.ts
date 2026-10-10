import { addDays, addMinutes, format, startOfDay } from "date-fns";
import * as StoreReview from "expo-store-review";
import type { StateCreator } from "zustand";
import type { AppState, MedicationsSlice } from "../types";
import type { Medication, Schedule, DoseLog } from "../../types";
import { storage } from "../../storage";
import { STORAGE_KEYS } from "../../config";
import {
  getActiveMedications,
  getSchedulesByMedication,
  getAllActiveSchedules,
  updateMedication,
  deleteMedication,
  getDoseLogsByDateRange,
  getDoseLogByScheduleAndDate,
  updateDoseLogNotes,
  saveMedicationWithSchedules,
  saveDoseLogWithStock,
  removeDoseLogWithStock,
  setMedicationRenewalNotifIds,
} from "../../db/database";
import {
  generateId,
  toISOString,
  toDateString,
  isScheduleActiveOnDate,
} from "../../utils";
import {
  scheduleDoseChain,
  cancelDoseNotifications,
  cancelScheduleNotifications,
  snoozeDose,
  scheduleStockAlert,
  scheduleRenewalReminders,
  cancelRenewalReminders,
  DAYS_AHEAD,
} from "../../services/notifications";
import { checkPrnLimits } from "../../services/prnLimits";
import { getDefaultSnoozeMinutes } from "../../services/snoozeSettings";
import { effectiveDoseDateTime } from "../../services/doseTime";
import { saveSnoozedDoses } from "../../services/snoozedDoses";

export class SavedMedicationError extends Error {
  readonly saved = true;
  constructor() {
    super("uxMedication.notificationsPending");
    this.name = "SavedMedicationError";
  }
}

export class SavedDoseError extends Error {
  readonly saved = true;
  constructor() {
    super("uxMedication.operationError");
    this.name = "SavedDoseError";
  }
}

const mutations = new Map<string, Promise<unknown>>();
async function serialized<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = mutations.get(key) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  mutations.set(key, task);
  try {
    return await task;
  } finally {
    if (mutations.get(key) === task) mutations.delete(key);
  }
}

export const createMedicationsSlice: StateCreator<
  AppState,
  [],
  [],
  MedicationsSlice
> = (set, get) => ({
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

    const schedules: Schedule[] = scheduleInputs.map((s) => ({
      ...s,
      id: generateId(),
      medicationId: med.id,
      isActive: true,
    }));

    await saveMedicationWithSchedules(med, schedules);

    const notificationResults = await Promise.allSettled(
      schedules.map((s) => _scheduleNotificationsForSchedule(med, s))
    );

    // Prescription-renewal reminders (F1).
    if (med.renewalDate) {
      try {
        const renewalIds = await scheduleRenewalReminders(med);
        await setMedicationRenewalNotifIds(med.id, renewalIds ?? null);
      } catch {
        notificationResults.push({ status: "rejected", reason: "renewal" });
      }
    }

    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getActiveMedications();
    set({ medications: allMeds, schedules: allSchedules });

    if (notificationResults.some((result) => result.status === "rejected"))
      throw new SavedMedicationError();

    return med;
  },

  // ── Update medication ──────────────────────────────────────────────────

  async updateMedication(med, scheduleInputs) {
    const previous = get().medications.find((item) => item.id === med.id);
    const existing = await getSchedulesByMedication(med.id);
    const existingIds = new Set(existing.map((item) => item.id));
    const resolved: Schedule[] = scheduleInputs.map((input) => ({
      id: input.id && existingIds.has(input.id) ? input.id : generateId(),
      time: input.time,
      days: input.days,
      medicationId: med.id,
      isActive: true,
    }));
    await saveMedicationWithSchedules(
      { ...med, renewalNotifIds: undefined },
      resolved
    );
    const results = await Promise.allSettled(
      existing.map((item) => cancelScheduleNotifications(item.id))
    );
    if (previous) {
      try {
        await cancelRenewalReminders(previous);
      } catch {
        results.push({ status: "rejected", reason: "renewal cancellation" });
      }
    }
    const scheduled = await Promise.allSettled(
      resolved.map((item) =>
        med.isActive
          ? _scheduleNotificationsForSchedule(med, item)
          : Promise.resolve()
      )
    );
    results.push(...scheduled);
    if (med.isActive && med.renewalDate) {
      try {
        const ids = await scheduleRenewalReminders(med);
        await setMedicationRenewalNotifIds(med.id, ids ?? null);
      } catch {
        results.push({ status: "rejected", reason: "renewal" });
      }
    }
    set({
      medications: await getActiveMedications(),
      schedules: await getAllActiveSchedules(),
    });
    if (results.some((result) => result.status === "rejected"))
      throw new SavedMedicationError();
  },

  // ── Delete medication ──────────────────────────────────────────────────

  async deleteMedication(id) {
    const schedules = await getSchedulesByMedication(id);
    await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
    const med = get().medications.find((m) => m.id === id);
    if (med) await cancelRenewalReminders(med);
    await deleteMedication(id);
    const allSchedules = await getAllActiveSchedules();
    const allMeds = await getActiveMedications();
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
    const results = await Promise.allSettled(
      schedules.map((s) =>
        isActive
          ? _scheduleNotificationsForSchedule(updated, s)
          : cancelScheduleNotifications(s.id)
      )
    );
    try {
      if (!isActive) await cancelRenewalReminders(med);
      else if (updated.renewalDate) {
        const ids = await scheduleRenewalReminders(updated);
        await setMedicationRenewalNotifIds(id, ids ?? null);
      }
    } catch {
      results.push({ status: "rejected", reason: "renewal" });
    }

    const [allMeds, allSchedules] = await Promise.all([
      getActiveMedications(),
      getAllActiveSchedules(),
    ]);
    set({ medications: allMeds, schedules: allSchedules });
    if (results.some((result) => result.status === "rejected"))
      throw new SavedMedicationError();
  },

  // ── Archive / unarchive (F3): retire without losing history ────────────

  async archiveMedication(id, reason) {
    const med = get().medications.find((m) => m.id === id);
    if (!med) return;
    // Silence everything first — an archived med must never ring.
    const schedules = await getSchedulesByMedication(id);
    await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
    await cancelRenewalReminders(med);
    await updateMedication({
      ...med,
      isActive: false,
      archivedAt: new Date().toISOString(),
      archiveReason: reason,
      renewalNotifIds: undefined,
    });
    set({
      medications: await getActiveMedications(),
      schedules: await getAllActiveSchedules(),
    });
  },

  async unarchiveMedication(id) {
    const med = get().medications.find((m) => m.id === id);
    if (!med) return;
    const restored = {
      ...med,
      isActive: true,
      archivedAt: undefined,
      archiveReason: undefined,
    };
    await updateMedication(restored);
    const schedules = await getSchedulesByMedication(id);
    const results = await Promise.allSettled(
      schedules.map((s) => _scheduleNotificationsForSchedule(restored, s))
    );
    if (restored.renewalDate) {
      try {
        const ids = await scheduleRenewalReminders(restored);
        await setMedicationRenewalNotifIds(id, ids ?? null);
      } catch {
        results.push({ status: "rejected", reason: "renewal" });
      }
    }
    set({
      medications: await getActiveMedications(),
      schedules: await getAllActiveSchedules(),
    });
    if (results.some((result) => result.status === "rejected"))
      throw new SavedMedicationError();
  },

  // ── Mark dose (taken / skipped) ────────────────────────────────────────

  async markDose(dose, status, notes, skipReason) {
    return serialized(dose.medication.id, async () => {
      const now = new Date();
      // Read the prior log BEFORE upsert so stock changes stay idempotent:
      // we only decrement when a dose *becomes* taken, and restore when a
      // previously-taken dose is changed to skipped (audit H16).
      const prior = await getDoseLogByScheduleAndDate(
        dose.schedule.id,
        dose.scheduledDate
      );
      if (prior?.status === status) {
        // The log is unchanged, but a reminder left armed by an earlier failed
        // cancellation (or a re-armed loop) must still be silenced.
        let cancelFailed = false;
        try {
          await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);
        } catch {
          cancelFailed = true;
        }
        await get().loadTodayLogs();
        if (cancelFailed) throw new SavedDoseError();
        return;
      }
      const latestMed =
        get().medications.find((m) => m.id === dose.medication.id) ??
        dose.medication;
      const wasTaken = prior?.status === "taken";
      const isTaken = status === "taken";
      const consumed =
        isTaken &&
        latestMed.stockQuantity != null &&
        latestMed.stockQuantity > 0
          ? 1
          : 0;
      const restored = wasTaken ? prior.stockDelta ?? 1 : 0;
      const log: DoseLog = {
        id: generateId(),
        medicationId: dose.medication.id,
        scheduleId: dose.schedule.id,
        scheduledDate: dose.scheduledDate,
        scheduledTime: format(
          effectiveDoseDateTime(
            dose.scheduledDate,
            dose.scheduledTime,
            dose.snoozedUntil
          ),
          "HH:mm"
        ),
        status,
        takenAt: status === "taken" ? toISOString(now) : undefined,
        createdAt: toISOString(now),
        notes: notes ?? prior?.notes,
        injectionSite: prior?.injectionSite,
        skipReason: status === "skipped" ? skipReason : undefined,
        stockDelta: consumed,
      };

      const nextStock =
        latestMed.stockQuantity == null
          ? undefined
          : isTaken
          ? latestMed.stockQuantity - consumed
          : latestMed.stockQuantity + restored;
      await saveDoseLogWithStock(log, nextStock);
      let notificationFailed = false;
      try {
        await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);
      } catch {
        notificationFailed = true;
      }
      const doseKey = `${dose.schedule.id}-${dose.scheduledDate}`;
      set((state) => {
        // Retain the original-day link for an overnight dose so today's completed
        // list can still resolve it after registration (including after restart).
        if (state.snoozedTimes[doseKey]?.includes("T")) return {};
        const { [doseKey]: removed, ...snoozedTimes } = state.snoozedTimes;
        saveSnoozedDoses(snoozedTimes);
        return { snoozedTimes };
      });
      if (nextStock != null) {
        set({ medications: await getActiveMedications() });
        if (
          isTaken &&
          consumed > 0 &&
          latestMed.stockAlertThreshold != null &&
          nextStock < latestMed.stockAlertThreshold
        ) {
          try {
            await scheduleStockAlert({
              ...latestMed,
              stockQuantity: nextStock,
            });
          } catch {
            notificationFailed = true;
          }
        }
      }

      await get().loadTodayLogs();
      if (notificationFailed) throw new SavedDoseError();

      // ── Store-review prompt after the dose UI is refreshed ───────────────
      try {
        if (status === "taken") {
          const prompted = storage.getString(STORAGE_KEYS.REVIEW_PROMPTED);
          if (!prompted) {
            let firstLaunch = storage.getString(STORAGE_KEYS.FIRST_LAUNCH);
            if (!firstLaunch) {
              firstLaunch = new Date().toISOString();
              storage.set(STORAGE_KEYS.FIRST_LAUNCH, firstLaunch);
            }

            const prevCount = parseInt(
              storage.getString(STORAGE_KEYS.DOSES_TAKEN_COUNT) ?? "0",
              10
            );
            const newCount = prevCount + 1;
            storage.set(STORAGE_KEYS.DOSES_TAKEN_COUNT, String(newCount));

            const daysSince =
              (Date.now() - new Date(firstLaunch).getTime()) / 86_400_000;
            if (
              daysSince >= 7 &&
              newCount >= 10 &&
              (await StoreReview.isAvailableAsync())
            ) {
              await StoreReview.requestReview();
              storage.set(STORAGE_KEYS.REVIEW_PROMPTED, "1");
            }
          }
        }
      } catch {
        /* A store-review service failure must not turn a saved dose into an error. */
      }
    });
  },

  async updateDoseNote(scheduleId, scheduledDate, notes) {
    await updateDoseLogNotes(scheduleId, scheduledDate, notes);
    await get().loadTodayLogs();
  },

  // ── Snooze ─────────────────────────────────────────────────────────────

  async snoozeDose(dose, minutes = getDefaultSnoozeMinutes()) {
    if (!Number.isFinite(minutes) || minutes <= 0)
      throw new Error("uxMedication.invalidNumber");
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    const now = new Date();
    const original = effectiveDoseDateTime(
      dose.scheduledDate,
      dose.schedule.time,
      get().snoozedTimes[key]
    );
    const fireDate = addMinutes(original > now ? original : now, minutes);
    await snoozeDose(
      dose.medication,
      dose.schedule,
      dose.scheduledDate,
      fireDate
    );
    const value =
      toDateString(fireDate) === dose.scheduledDate
        ? format(fireDate, "HH:mm")
        : fireDate.toISOString();
    set((state) => {
      const snoozedTimes = { ...state.snoozedTimes, [key]: value };
      saveSnoozedDoses(snoozedTimes);
      return { snoozedTimes };
    });
  },

  // ── Reschedule once ────────────────────────────────────────────────────

  async rescheduleOnce(dose, newTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime))
      throw new Error("uxMedication.invalidNumber");
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    const [h, m] = newTime.split(":").map(Number);
    const now = new Date();
    const fireDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m
    );

    if (fireDate <= now) throw new Error("uxMedication.timePast");
    await snoozeDose(
      dose.medication,
      dose.schedule,
      dose.scheduledDate,
      fireDate
    );
    set((s) => {
      const value =
        toDateString(fireDate) === dose.scheduledDate
          ? newTime
          : fireDate.toISOString();
      const snoozedTimes = { ...s.snoozedTimes, [key]: value };
      saveSnoozedDoses(snoozedTimes);
      return { snoozedTimes };
    });
  },

  // ── Revert snooze ────────────────────────────────────────────────────

  async revertSnooze(dose) {
    const key = `${dose.schedule.id}-${dose.scheduledDate}`;
    await cancelDoseNotifications(dose.schedule.id, dose.scheduledDate);

    const [h, m] = dose.schedule.time.split(":").map(Number);
    const [y, mo, d] = dose.scheduledDate.split("-").map(Number);
    const originalFireDate = new Date(y, mo - 1, d, h, m);
    if (originalFireDate > new Date()) {
      await scheduleDoseChain(
        dose.medication,
        dose.schedule,
        dose.scheduledDate
      );
    }

    set((s) => {
      const { [key]: _removed, ...rest } = s.snoozedTimes;
      saveSnoozedDoses(rest);
      return { snoozedTimes: rest };
    });
  },

  // ── Revert dose ────────────────────────────────────────────────────────

  async revertDose(dose) {
    return serialized(dose.medication.id, async () => {
      const prior = await getDoseLogByScheduleAndDate(
        dose.schedule.id,
        dose.scheduledDate
      );
      if (!prior) {
        await get().loadTodayLogs();
        return;
      }
      const medication =
        get().medications.find((item) => item.id === dose.medication.id) ??
        dose.medication;
      const restored = prior.status === "taken" ? prior.stockDelta ?? 1 : 0;
      const quantity =
        medication.stockQuantity == null
          ? undefined
          : medication.stockQuantity + restored;
      await removeDoseLogWithStock(
        dose.schedule.id,
        dose.scheduledDate,
        medication.id,
        quantity
      );
      if (quantity != null) set({ medications: await getActiveMedications() });
      const postponed =
        get().snoozedTimes[`${dose.schedule.id}-${dose.scheduledDate}`];
      set((state) => {
        if (postponed?.includes("T")) return {};
        const {
          [`${dose.schedule.id}-${dose.scheduledDate}`]: removed,
          ...snoozedTimes
        } = state.snoozedTimes;
        saveSnoozedDoses(snoozedTimes);
        return { snoozedTimes };
      });
      await get().loadTodayLogs();
      const [year, month, day] = dose.scheduledDate.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      const fireDate = effectiveDoseDateTime(
        dose.scheduledDate,
        dose.schedule.time,
        postponed
      );
      if (
        !dose.schedule.id.startsWith("prn-") &&
        medication.isActive &&
        !medication.archivedAt &&
        isScheduleActiveOnDate(dose.schedule, date, medication) &&
        fireDate > new Date()
      ) {
        try {
          if (postponed)
            await snoozeDose(
              medication,
              dose.schedule,
              dose.scheduledDate,
              fireDate
            );
          else
            await scheduleDoseChain(
              medication,
              dose.schedule,
              dose.scheduledDate
            );
        } catch {
          throw new SavedDoseError();
        }
      }
    });
  },

  // ── History ────────────────────────────────────────────────────────────

  async getHistoryLogs(from, to) {
    // Scope to the active profile via its medications (F2 multi-profile).
    const logs = await getDoseLogsByDateRange(from, to);
    const medIds = new Set(get().medications.map((m) => m.id));
    return logs.filter((l) => medIds.has(l.medicationId));
  },

  // ── Helper ────────────────────────────────────────────────────────────

  getSchedulesForMedication(medicationId) {
    return get().schedules.filter((s) => s.medicationId === medicationId);
  },

  // ── Log PRN dose ──────────────────────────────────────────────────────

  async logPRNDose(medication, opts) {
    return serialized(medication.id, async () => {
      medication =
        get().medications.find((item) => item.id === medication.id) ??
        medication;
      const now = new Date();

      // PRN safety limits (F2): when configured, evaluate BEFORE logging and
      // return the check so the UI can warn + require an explicit "log anyway"
      // (opts.force). Include the complete configured interval, including several days.
      if (
        !opts?.force &&
        (medication.prnMaxPerDay != null ||
          medication.prnMinIntervalMinutes != null)
      ) {
        const intervalDays = Math.ceil(
          (medication.prnMinIntervalMinutes ?? 0) / (24 * 60)
        );
        const from = toDateString(addDays(now, -Math.max(1, intervalDays)));
        const recent = await getDoseLogsByDateRange(from, toDateString(now));
        const check = checkPrnLimits(medication, recent, now);
        if (check.blocked) return check;
      }

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
      log.stockDelta =
        medication.stockQuantity != null && medication.stockQuantity > 0
          ? 1
          : 0;
      const quantity =
        medication.stockQuantity == null
          ? undefined
          : medication.stockQuantity - log.stockDelta;
      await saveDoseLogWithStock(log, quantity);
      if (quantity != null) set({ medications: await getActiveMedications() });
      await get().loadTodayLogs();
      if (
        quantity != null &&
        log.stockDelta > 0 &&
        medication.stockAlertThreshold != null &&
        quantity < medication.stockAlertThreshold
      ) {
        try {
          await scheduleStockAlert({ ...medication, stockQuantity: quantity });
        } catch {
          throw new SavedDoseError();
        }
      }
      return undefined;
    });
  },
});

// ─── Internal helpers ──────────────────────────────────────────────────────

async function _scheduleNotificationsForSchedule(
  med: Medication,
  schedule: Schedule
): Promise<void> {
  const now = new Date();
  // Use the platform-aware DAYS_AHEAD window (iOS 3 / Android 7) so this
  // per-schedule path matches scheduleAllUpcoming/rescheduleAllNotifications
  // and never overruns the iOS 64-pending-notification budget (audit C5).
  for (let i = 0; i < DAYS_AHEAD; i++) {
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
