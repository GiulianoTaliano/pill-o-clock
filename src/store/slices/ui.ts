import type { StateCreator } from "zustand";
import type { AppState, UISlice } from "../types";

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set) => ({
  selectedAppointmentId: null,
  setSelectedAppointmentId: (id) => set({ selectedAppointmentId: id }),
  pendingEditAppointmentId: null,
  setPendingEditAppointmentId: (id) => set({ pendingEditAppointmentId: id }),
  snoozedTimes: {},
});
