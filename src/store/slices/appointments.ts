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

export const createAppointmentsSlice: StateCreator<AppState, [], [], AppointmentsSlice> = (set, get) => ({
  appointments: [],
  appointmentDocuments: [],

  async loadAppointments() {
    const appointments = await getActiveAppointments();
    set({ appointments });
  },

  async addAppointment(data) {
    const appt: Appointment = {
      ...data,
      id: generateId(),
      createdAt: toISOString(new Date()),
    };
    const notificationId = await scheduleAppointmentNotification(appt);
    const apptWithNotif = { ...appt, notificationId };
    await insertAppointment(apptWithNotif);
    set((s) => ({ appointments: [...s.appointments, apptWithNotif].sort((a, b) => a.date.localeCompare(b.date)) }));
  },

  async updateAppointment(data) {
    const existing = get().appointments.find((a) => a.id === data.id);
    if (existing?.notificationId) {
      await cancelAppointmentNotification(existing.notificationId);
    }
    const appt: Appointment = { ...data, notificationId: undefined };
    const notificationId = await scheduleAppointmentNotification(appt);
    const apptWithNotif = { ...appt, notificationId };
    await updateAppointmentDb(apptWithNotif);
    set((s) => ({
      appointments: s.appointments
        .map((a) => (a.id === data.id ? apptWithNotif : a))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));
  },

  async deleteAppointment(id) {
    const appt = get().appointments.find((a) => a.id === id);
    if (appt?.notificationId) {
      await cancelAppointmentNotification(appt.notificationId);
    }
    // Delete associated document files from disk
    const docs = get().appointmentDocuments.filter((d) => d.appointmentId === id);
    for (const doc of docs) {
      try {
        const f = new File(doc.fileUri);
        if (f.exists) f.delete();
      } catch { /* file already gone */ }
    }
    await deleteAppointmentDb(id);
    set((s) => ({
      appointments: s.appointments.filter((a) => a.id !== id),
      appointmentDocuments: s.appointmentDocuments.filter((d) => d.appointmentId !== id),
    }));
  },

  // ─── Document actions ──────────────────────────────────────────────────

  async loadAppointmentDocuments(appointmentId) {
    const docs = await getAppointmentDocuments(appointmentId);
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

    await insertAppointmentDocument(doc);
    set((s) => ({ appointmentDocuments: [doc, ...s.appointmentDocuments] }));
  },

  async removeAppointmentDocument(docId) {
    const doc = get().appointmentDocuments.find((d) => d.id === docId);
    if (doc) {
      try {
        const f = new File(doc.fileUri);
        if (f.exists) f.delete();
      } catch { /* file already gone */ }
    }
    await deleteAppointmentDocumentDb(docId);
    set((s) => ({ appointmentDocuments: s.appointmentDocuments.filter((d) => d.id !== docId) }));
  },
});
