import { sqliteTable, text, real, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ─── Profiles (F2 multi-profile: one caregiver, several people/pets) ───────
// The row with id 'default' always exists (created in migration v14) and its
// empty name renders as a localized "Me" in the UI.

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("blue"),
  createdAt: text("created_at").notNull(),
});

// ─── Medications ───────────────────────────────────────────────────────────

export const medications = sqliteTable("medications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  dosage: text("dosage").notNull(),
  dosageAmount: real("dosage_amount").notNull().default(1),
  dosageUnit: text("dosage_unit").notNull().default("comprimidos"),
  category: text("category").notNull().default("otro"),
  notes: text("notes"),
  color: text("color").notNull().default("blue"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  stockQuantity: integer("stock_quantity"),
  stockAlertThreshold: integer("stock_alert_threshold"),
  photoUri: text("photo_uri"),
  isPRN: integer("is_prn", { mode: "boolean" }).notNull().default(false),
  renewalDate: text("renewal_date"),
  renewalNotifIds: text("renewal_notif_ids"),
  prnMaxPerDay: integer("prn_max_per_day"),
  prnMinIntervalMinutes: integer("prn_min_interval_minutes"),
  rxcui: text("rxcui"),
  profileId: text("profile_id").notNull().default("default"),
});

// ─── Schedules ─────────────────────────────────────────────────────────────

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    medicationId: text("medication_id").notNull().references(() => medications.id, { onDelete: "cascade" }),
    time: text("time").notNull(),
    /** JSON array of day numbers: 0=Sun..6=Sat. Empty = every day. */
    days: text("days").notNull().default("[]"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("idx_schedules_medication_id").on(t.medicationId)]
);

// ─── Dose logs ─────────────────────────────────────────────────────────────

export const doseLogs = sqliteTable(
  "dose_logs",
  {
    id: text("id").primaryKey(),
    medicationId: text("medication_id").notNull(),
    scheduleId: text("schedule_id").notNull(),
    scheduledDate: text("scheduled_date").notNull(),
    scheduledTime: text("scheduled_time").notNull(),
    status: text("status").notNull().default("pending"),
    takenAt: text("taken_at"),
    createdAt: text("created_at").notNull(),
    notes: text("notes"),
    skipReason: text("skip_reason"),
  },
  (t) => [
    uniqueIndex("idx_dose_unique").on(t.scheduleId, t.scheduledDate),
    index("idx_dose_logs_medication_id").on(t.medicationId),
    index("idx_dose_logs_scheduled_date").on(t.scheduledDate),
  ]
);

// ─── Appointments ──────────────────────────────────────────────────────────

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  doctor: text("doctor"),
  location: text("location"),
  locationLat: real("location_lat"),
  locationLng: real("location_lng"),
  notes: text("notes"),
  date: text("date").notNull(),
  time: text("time"),
  reminderMinutes: integer("reminder_minutes"),
  notificationId: text("notification_id"),
  createdAt: text("created_at").notNull(),
  profileId: text("profile_id").notNull().default("default"),
});

// ─── Appointment documents ─────────────────────────────────────────────────

export const appointmentDocuments = sqliteTable(
  "appointment_documents",
  {
    id: text("id").primaryKey(),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    fileUri: text("file_uri").notNull(),
    fileSize: integer("file_size"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_appointment_docs_appointment_id").on(t.appointmentId)]
);

// ─── Health measurements ───────────────────────────────────────────────────

export const healthMeasurements = sqliteTable(
  "health_measurements",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    value1: real("value1").notNull(),
    value2: real("value2"),
    measuredAt: text("measured_at").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    profileId: text("profile_id").notNull().default("default"),
  },
  (t) => [index("idx_health_measurements_type_date").on(t.type, t.measuredAt)]
);

// ─── Daily check-ins ───────────────────────────────────────────────────────

export const dailyCheckins = sqliteTable(
  "daily_checkins",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    mood: integer("mood").notNull(),
    /** JSON array of symptom strings. */
    symptoms: text("symptoms").notNull().default("[]"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    profileId: text("profile_id").notNull().default("default"),
  },
  // One check-in per person per day (was UNIQUE(date) pre-multi-profile).
  (t) => [uniqueIndex("idx_checkin_profile_date").on(t.profileId, t.date)]
);

// ─── Notification map ──────────────────────────────────────────────────────

export const notificationMap = sqliteTable(
  "notification_map",
  {
    notifId: text("notif_id").primaryKey(),
    scheduleId: text("schedule_id").notNull(),
    scheduledDate: text("scheduled_date").notNull(),
    scheduledTime: text("scheduled_time").notNull(),
    medicationId: text("medication_id").notNull(),
    doseLogId: text("dose_log_id").notNull(),
  },
  (t) => [index("idx_notif_map_dose").on(t.scheduleId, t.scheduledDate)]
);
