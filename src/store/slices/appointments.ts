import type { StateCreator } from "zustand";
import type { AppState, AppointmentsSlice } from "../types";
import type { Appointment } from "../../types";
import {
  getAppointments,
  insertAppointment,
  updateAppointment as updateAppointmentDb,
  deleteAppointment as deleteAppointmentDb,
} from "../../db/database";
import { generateId, toISOString } from "../../utils";
import {
  scheduleAppointmentNotification,
  cancelAppointmentNotification,
} from "../../services/notifications";

export const createAppointmentsSlice: StateCreator<AppState, [], [], AppointmentsSlice> = (set, get) => ({
  appointments: [],

  async loadAppointments() {
    const appointments = await getAppointments();
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
    await deleteAppointmentDb(id);
    set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) }));
  },
});
