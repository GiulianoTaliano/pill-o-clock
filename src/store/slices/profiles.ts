import type { StateCreator } from "zustand";
import type { AppState, ProfilesSlice } from "../types";
import type { Profile } from "../../types";
import {
  getProfiles,
  insertProfile,
  updateProfile as updateProfileDb,
  deleteProfileData,
  getMedications,
  getAppointments,
  getSchedulesByMedication,
  deleteMedication as deleteMedicationDb,
} from "../../db/database";
import {
  cancelScheduleNotifications,
  cancelRenewalReminders,
  cancelAppointmentNotification,
} from "../../services/notifications";
import {
  getActiveProfileId,
  setActiveProfileId,
  DEFAULT_PROFILE_ID,
} from "../../services/profileStore";
import { generateId, toISOString } from "../../utils";

/**
 * Multi-profile slice (F2). The active profile scopes what UI lists show;
 * alarms and notifications always cover every profile (see profileStore.ts).
 */
export const createProfilesSlice: StateCreator<AppState, [], [], ProfilesSlice> = (set, get) => ({
  profiles: [],
  activeProfileId: getActiveProfileId(),

  async loadProfiles() {
    set({ profiles: await getProfiles() });
  },

  async addProfile(name, color) {
    const profile: Profile = {
      id: generateId(),
      name: name.trim(),
      color,
      createdAt: toISOString(new Date()),
    };
    await insertProfile(profile);
    set((s) => ({ profiles: [...s.profiles, profile] }));
    return profile;
  },

  async renameProfile(id, name, color, contact) {
    const existing = get().profiles.find((p) => p.id === id);
    if (!existing) return;
    const updated: Profile = {
      ...existing,
      name: name.trim(),
      color: color ?? existing.color,
      emergencyContactName: contact?.name || undefined,
      emergencyContactPhone: contact?.phone || undefined,
    };
    await updateProfileDb(updated);
    set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? updated : p)) }));
  },

  async switchProfile(id) {
    if (id === get().activeProfileId) return;
    setActiveProfileId(id);
    set({ activeProfileId: id });
    // Reload every profile-scoped list for the new person.
    await get().loadAll();
    await Promise.all([get().loadHealthMeasurements(), get().loadDailyCheckins()]);
  },

  async removeProfile(id) {
    if (id === DEFAULT_PROFILE_ID) return;

    // Cancel every alarm/notification belonging to the profile BEFORE the
    // rows go away — orphaned alarms for a deleted person must never ring.
    // Cross-profile, so we go through the DB, not the (active-scoped) state.
    const meds = (await getMedications()).filter((m) => m.profileId === id);
    for (const med of meds) {
      const schedules = await getSchedulesByMedication(med.id);
      await Promise.all(schedules.map((s) => cancelScheduleNotifications(s.id)));
      await cancelRenewalReminders(med);
      await deleteMedicationDb(med.id);
    }
    const appts = (await getAppointments()).filter((a) => a.profileId === id);
    for (const appt of appts) {
      if (appt.notificationId) await cancelAppointmentNotification(appt.notificationId);
    }

    await deleteProfileData(id);
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) }));

    if (get().activeProfileId === id) {
      await get().switchProfile(DEFAULT_PROFILE_ID);
    }
  },
});
