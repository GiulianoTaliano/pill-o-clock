import type { StateCreator } from "zustand";
import type { AppState, AppointmentsSlice } from "../types";
import type { Appointment, AppointmentDocument } from "../../types";
import { Directory, File, Paths } from "expo-file-system";
import {
  getActiveAppointments,
  insertAppointment,
  updateAppointment as updateAppointmentDb,
  deleteAppointment as deleteAppointmentDb,
  getAppointmentDocuments,
  insertAppointmentDocument,
  deleteAppointmentDocument as deleteAppointmentDocumentDb,
} from "../../db/database";
import { generateId, toISOString } from "../../utils";
import { getActiveProfileId } from "../../services/profileStore";
import {
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
} from "../../services/notifications";

// ─── Documents directory ───────────────────────────────────────────────────

function getDocsDir(): Directory {
  return new Directory(Paths.document, "appointment_docs");
}

function ensureDocsDir(): void {
  const dir = getDocsDir();
  if (!dir.exists) {
    dir.create();
  }
}

// ─── Slice ─────────────────────────────────────────────────────────────────

export const createAppointmentsSlice: StateCreator<
  AppState,
  [],
  [],
  AppointmentsSlice
> = (set, get) => {
  let documentRequest = 0;
  return {
    appointments: [],
    appointmentDocuments: [],

    async loadAppointments() {
      const profile = getActiveProfileId();
      const appointments = await getActiveAppointments();
      if (getActiveProfileId() === profile) set({ appointments });
    },

    async addAppointment(data) {
      const appt: Appointment = {
        ...data,
        profileId: data.profileId ?? getActiveProfileId(),
        id: generateId(),
        createdAt: toISOString(new Date()),
      };
      await insertAppointment(appt);
      let notificationId: string | undefined;
      try {
        notificationId = await scheduleAppointmentNotification({
          ...appt,
          time: appt.reminderMinutes === 0 ? undefined : appt.time,
        });
        await updateAppointmentDb({ ...appt, notificationId });
      } catch {
        /* The appointment is saved; the UI exposes notification failure. */
      }
      if (getActiveProfileId() === appt.profileId)
        set((s) => ({
          appointments: [...s.appointments, { ...appt, notificationId }].sort(
            (a, b) =>
              `${a.date} ${a.time ?? ""}`.localeCompare(
                `${b.date} ${b.time ?? ""}`
              )
          ),
        }));
    },

    async updateAppointment(data) {
      const existing = get().appointments.find((a) => a.id === data.id);
      const appt: Appointment = {
        ...data,
        profileId:
          existing?.profileId ?? data.profileId ?? getActiveProfileId(),
        notificationId: undefined,
      };
      await updateAppointmentDb(appt);
      let notificationId: string | undefined;
      try {
        if (existing?.notificationId)
          await cancelAppointmentNotification(existing.notificationId);
        notificationId = await scheduleAppointmentNotification({
          ...appt,
          time: appt.reminderMinutes === 0 ? undefined : appt.time,
        });
      } catch {
        /* Keep the edited appointment even when notifications are unavailable. */
      }
      const apptWithNotif = { ...appt, notificationId };
      await updateAppointmentDb(apptWithNotif);
      if (getActiveProfileId() === appt.profileId)
        set((s) => ({
          appointments: s.appointments
            .map((a) => (a.id === data.id ? apptWithNotif : a))
            .sort((a, b) =>
              `${a.date} ${a.time ?? ""}`.localeCompare(
                `${b.date} ${b.time ?? ""}`
              )
            ),
        }));
    },

    async deleteAppointment(id) {
      const appt = get().appointments.find((a) => a.id === id);
      if (appt?.notificationId) {
        await cancelAppointmentNotification(appt.notificationId);
      }
      const docs = await getAppointmentDocuments(id);
      // Keep attached files intact if deleting the appointment from the database fails.
      await deleteAppointmentDb(id);
      for (const doc of docs) {
        try {
          const f = new File(doc.fileUri);
          if (f.exists) f.delete();
        } catch {
          /* file already gone */
        }
      }
      set((s) => ({
        appointments: s.appointments.filter((a) => a.id !== id),
        appointmentDocuments: s.appointmentDocuments.filter(
          (d) => d.appointmentId !== id
        ),
      }));
    },

    // ─── Document actions ──────────────────────────────────────────────────

    async loadAppointmentDocuments(appointmentId) {
      const profile = getActiveProfileId();
      const token = ++documentRequest;
      set({ appointmentDocuments: [] });
      const docs = await getAppointmentDocuments(appointmentId);
      if (token === documentRequest && getActiveProfileId() === profile)
        set({ appointmentDocuments: docs });
    },

    async addAppointmentDocument(appointmentId, pickerAsset) {
      ensureDocsDir();

      const id = generateId();
      const ext = pickerAsset.name.includes(".")
        ? pickerAsset.name.slice(pickerAsset.name.lastIndexOf("."))
        : "";
      const destName = `${id}${ext}`;
      const destFile = new File(getDocsDir(), destName);

      // Copy the picked file to our persistent directory
      const source = new File(pickerAsset.uri);
      source.copy(destFile);

      const doc: AppointmentDocument = {
        id,
        appointmentId,
        fileName: pickerAsset.name,
        mimeType: pickerAsset.mimeType ?? "application/octet-stream",
        fileUri: destFile.uri,
        fileSize: pickerAsset.size,
        createdAt: toISOString(new Date()),
      };

      try {
        await insertAppointmentDocument(doc);
      } catch (error) {
        try {
          if (destFile.exists) destFile.delete();
        } catch {
          /* Cache cleanup. */
        }
        throw error;
      }
      set((s) => ({ appointmentDocuments: [doc, ...s.appointmentDocuments] }));
    },

    async removeAppointmentDocument(docId) {
      const doc = get().appointmentDocuments.find((d) => d.id === docId);
      await deleteAppointmentDocumentDb(docId);
      if (doc) {
        try {
          const f = new File(doc.fileUri);
          if (f.exists) f.delete();
        } catch {
          /* file already gone */
        }
      }
      set((s) => ({
        appointmentDocuments: s.appointmentDocuments.filter(
          (d) => d.id !== docId
        ),
      }));
    },
  };
};
