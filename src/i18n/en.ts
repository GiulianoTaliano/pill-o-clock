import { TranslationShape } from "./es";

const en: TranslationShape = {
  // ─── Common ──────────────────────────────────────────────────────────────
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    close: "Close",
    confirm: "Confirm",
    yes: "Yes",
    no: "No",
    ok: "OK",
    error: "Error",
    loading: "Loading...",
    saving: "Saving...",
    required: "*",
    start: "start",
    end: "no end",
  },

  // ─── Days ─────────────────────────────────────────────────────────────────
  days: {
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    full: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },

  // ─── Dosage units ─────────────────────────────────────────────────────────
  dosageUnits: {
    gotas: "drops",
    comprimidos: "tab.",
    capsulas: "caps.",
  },

  // ─── Categories ───────────────────────────────────────────────────────────
  categories: {
    antibiotico: "Antibiotic",
    analgesico: "Analgesic",
    antiinflamatorio: "Anti-inflammatory",
    suplemento: "Supplement",
    vitamina: "Vitamin",
    otro: "Other",
  },

  // ─── Dose status ──────────────────────────────────────────────────────────
  status: {
    pending: "Pending",
    taken: "Taken",
    skipped: "Skipped",
    missed: "Missed",
  },

  // ─── Home screen ──────────────────────────────────────────────────────────
  home: {
    title: "💊 Pill-O-Clock",
    noMeds: "No medications today",
    noMedsSubtitle: "Add your first medication by tapping + above",
    sectionPending: "Pending",
    sectionMissed: "Missed",
    sectionDone: "Completed",
    chipPending_one: "{{count}} pending",
    chipPending_other: "{{count}} pending",
    chipTaken_one: "{{count}} taken",
    chipTaken_other: "{{count}} taken",
    chipSkipped_one: "{{count}} skipped",
    chipSkipped_other: "{{count}} skipped",
    chipMissed_one: "{{count}} missed",
    chipMissed_other: "{{count}} missed",
    tipReschedule: "Tip: Tap the time badge on any pending dose to reschedule it today. Tap to dismiss.",
    streak_one: "🔥 {{count}} day streak",
    streak_other: "🔥 {{count}} day streak",
  },

  // ─── Medications screen ───────────────────────────────────────────────────
  medications: {
    title: "Medications",
    subtitle_one: "{{count}} configured",
    subtitle_other: "{{count}} configured",
    sectionActive: "Active",
    sectionInactive: "Paused",
    noMeds: "No medications",
    noMedsSubtitle: "Add your first medication to start receiving reminders",
    deleteTitle: "Delete medication",
    deleteMessage: "Are you sure you want to delete \"{{name}}\"? All its alarms will be cancelled.",
    resetTitle: "Reset all data",
    resetMessage: "All medications, schedules and dose logs will be deleted. This action cannot be undone.",
    resetButton: "Reset",
    resetButtonFull: "Reset all data",
    scheduleDaily: "Daily · {{time}}",
  },

  // ─── History screen ───────────────────────────────────────────────────────
  history: {
    title: "History",
    adherence: "Adherence: {{value}}%",
    adherenceLabel: "Adherence",
    taken: "Taken",
    skipped: "Skipped",
    total: "Total",
    noLogs: "No records",
    noLogsSubtitle: "No doses recorded in this period",
  },

  // ─── Calendar screen ──────────────────────────────────────────────────────
  calendar: {
    title: "Calendar",
    today: "Today",
    noDoses: "No doses",
    noDosesSubtitle: "No doses scheduled for this day",
    dayHeaders: ["M", "T", "W", "T", "F", "S", "S"],
  },

  // ─── Medication form ──────────────────────────────────────────────────────
  form: {
    newTitle: "New medication",
    editTitle: "Edit medication",
    addButton: "Add medication",
    saveChanges: "Save changes",
    sectionInfo: "Medication info",
    sectionFrequency: "Frequency",
    sectionWhen: "When",
    sectionAlarm: "Alarm",
    sectionPeriod: "Treatment period (optional)",
    sectionAlarms_one: "Alarm ({{count}})",
    sectionAlarms_other: "Alarms ({{count}})",
    fieldName: "Name",
    fieldNamePlaceholder: "e.g. Ibuprofen",
    fieldDose: "Dose",
    fieldDoseAmountPlaceholder: "e.g. 500",
    fieldDoseAmountLabel: "amount",
    fieldCategory: "Category",
    fieldNotes: "Instructions / Notes",
    fieldNotesPlaceholder: "e.g. Take with food",
    fieldColor: "Color",
    fieldStartDate: "Start date",
    fieldEndDate: "End date",
    fieldDate: "Date",
    fieldTime: "Time",
    fieldDays: "Days",
    selectDate: "Select a date",
    modeOnce: "One-time",
    modeOnceSub: "Single day",
    modeRepeat: "Recurring",
    modeRepeatSub: "Multiple days",
    addAlarm: "Add",
    removeAlarm: "Remove alarm",
    errorNameRequired: "Name required",
    errorNameRequiredMsg: "Please enter the medication name.",
    errorDuplicate: "Duplicate name",
    errorDuplicateMsg: "You already have a medication called \"{{name}}\". Use a different name or edit the existing one.",
    errorDoseRequired: "Dose required",
    errorDoseRequiredMsg: "Enter a valid amount (e.g. 500, 1, 10).",
    errorNoAlarms: "No alarms",
    errorNoAlarmsMsg: "Add at least one alarm.",
    errorInvalidPeriod: "Invalid period",
    errorInvalidPeriodMsg: "The end date cannot be before the start date.",
    errorGeneric: "Could not save the medication. Please try again.",
    sectionStock: "Stock (optional)",
    fieldStock: "Current stock",
    fieldStockPlaceholder: "e.g. 30",
    fieldStockThreshold: "Alert when below",
    fieldStockThresholdPlaceholder: "e.g. 5",
    fieldStockUnit: "units",
  },

  // ─── Alarm screen ─────────────────────────────────────────────────────────
  alarm: {
    subtitle: "Medication reminder",
    dose: "Dose",
    takeMed: "I took my medication",
    snooze: "Snooze {{minutes}} min",
    skip: "Skip this dose",
  },

  // ─── Dose card ────────────────────────────────────────────────────────────
  doseCard: {
    snooze: "+15 min",
    skip: "Skip",
    take: "Taken",
    takeLate: "Taken late",
    takenAt: " at {{time}}",
    revert: "Undo",
    snoozeConfirm: "Reminder snoozed for 15 min ⏰",
    rescheduleConfirm: "Dose rescheduled to {{time}} 🕐",
    rescheduleTitle: "Reschedule dose",
    rescheduleOriginal: "Original time: {{time}}",
    addNote: "Add note",
    noteModalTitle: "Dose note",
    noteModalPlaceholder: "How did you feel? Any side effects?",
    noteSaved: "Note saved",
  },

  // ─── Medication card ──────────────────────────────────────────────────────
  medicationCard: {
    deleteButton: "Delete",
    inactiveLabel: "Inactive",
  },

  // ─── Notifications ────────────────────────────────────────────────────────
  notifications: {
    reminderTitle: "💊 Time to take {{name}}",
    repeatTitle: "⏰ Reminder: {{name}}",
    snoozeTitle: "⏰ Reminder (snoozed): {{name}}",
    body: "Dose: {{dose}}",
    bodyWithNotes: "Dose: {{dose}} · {{notes}}",
    bodyActions: " · Expand to see options",
    actionTaken: "✅ I took my medication",
    actionSnooze: "⏰ Snooze {{minutes}} min",
    actionSkip: "❌ Skip",
    channelName: "Medication reminders",
    channelCollapsed: "Medication reminder",
  },

  // ─── Permissions ──────────────────────────────────────────────────────────
  permissions: {
    exactAlarmTitle: "Permission needed",
    exactAlarmMessage:
      "For alarms to ring on time on Android 12, enable \"Alarms & Reminders\" for Pill-O-Clock in Settings.",
    exactAlarmLater: "Not now",
    exactAlarmOpen: "Open settings",    fullScreenTitle: "Allow full-screen alarms",
    fullScreenMessage:
      "On Android 14+, you need to grant \"Display full-screen notifications\" permission so the alarm screen can appear above the lock screen. Tap \"Open settings\" and enable it for Pill-O-Clock.",  },

  // ─── Stock ────────────────────────────────────────────────────────────────
  stock: {
    alertTitle: "Low stock: {{name}}",
    alertBody: "Only {{count}} left. Time to request a refill.",
    badge_one: "{{count}} left",
    badge_other: "{{count}} left",
    low: "Low stock",
  },

  // ─── Appointments ─────────────────────────────────────────────────────────
  appointments: {
    title: "Appointments",
    noAppointments: "No appointments",
    noAppointmentsSubtitle: "Add your next doctor visit or checkup",
    upcoming: "Upcoming",
    past: "Past",
    deleteTitle: "Delete appointment",
    deleteMessage: "Are you sure you want to delete this appointment?",
    newTitle: "New appointment",
    editTitle: "Edit appointment",
    fieldTitle: "Title",
    fieldTitlePlaceholder: "e.g. Cardiologist",
    fieldDoctor: "Doctor (optional)",
    fieldDoctorPlaceholder: "e.g. Dr. García",
    fieldLocation: "Location (optional)",
    fieldLocationPlaceholder: "e.g. City Hospital, Floor 2",
    fieldNotes: "Notes (optional)",
    fieldNotesPlaceholder: "Questions to ask, things to bring...",
    fieldDate: "Date",
    fieldTime: "Time (optional)",
    fieldReminder: "Reminder",
    reminderNone: "No reminder",
    reminder1h: "1 hour before",
    reminder2h: "2 hours before",
    reminder1d: "1 day before",
    notifTitle: "📅 Appointment reminder",
    notifBody: "{{title}}",
    saveButton: "Save appointment",
    errorTitleRequired: "Title required",
    errorDateRequired: "Date required",
    errorGeneric: "Could not save the appointment. Please try again.",
  },

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  tabs: {
    today: "Today",
    calendar: "Calendar",
    medications: "Medications",
    history: "History",
    appointments: "Appointments",
    settings: "Settings",
  },

  // ─── Settings screen ──────────────────────────────────────────────────────
  settings: {
    title: "Settings",
    // Data
    sectionData: "Your data",
    exportButton: "Export data",
    exportSubtitle: "Save a backup to your device",
    importButton: "Import data",
    importSubtitle: "Restore from a backup file",
    importModeTitle: "How do you want to import?",
    importModeMessage:
      "Replace will delete all your current data. Merge will keep existing records and add new ones.",
    importModeReplace: "Replace all",
    importModeMerge: "Merge",
    importSuccess: "Import successful",
    importSuccessMsg_one: "{{count}} medication imported successfully.",
    importSuccessMsg_other: "{{count}} medications imported successfully.",
    importError: "Import error",
    importErrorFormat: "The file is not a valid Pill-O-Clock backup.",
    importErrorGeneric: "Could not import the file. Please try again.",
    exportError: "Export error",
    exportErrorGeneric: "Could not export. Please try again.",
    // Language
    sectionLanguage: "Language",
    languageEs: "Español",
    languageEn: "English",
    // Appearance
    sectionAppearance: "Appearance",
    themeSystem: "Automatic (system)",
    themeLight: "Light",
    themeDark: "Dark",
    // About
    sectionAbout: "About",
    version: "Version",
    // Danger zone
    sectionDanger: "Danger zone",
    clearData: "Delete all data",
    clearDataSubtitle: "This action cannot be undone",
    clearDataConfirmTitle: "Delete everything?",
    clearDataConfirmMsg:
      "All your medications, alarms and history will be permanently deleted. This cannot be undone.",
    clearDataConfirmButton: "Yes, delete all",
  },

  // ─── Onboarding ──────────────────────────────────────────────────────────
  onboarding: {
    next: "Next",
    skip: "Skip",
    start: "Get started",
    slide1Title: "Pill-O-Clock",
    slide1Sub: "Your medication assistant",
    slide1Desc: "Never miss a dose again. Smart alarms and adherence tracking, all in one place.",
    slide2Title: "Smart alarms",
    slide2Desc: "Reminders with options to take, snooze or skip — without opening the app.",
    slide3Title: "Track your adherence",
    slide3Desc: "Full history and stats to know how well you\'re keeping up with your treatments.",
    slide4Title: "Almost ready",
    slide4Desc: "We need your permission to send you reminders when it\'s time to take your medications.",
    enableNotifications: "Enable notifications",
    notificationsGranted: "✅ Notifications enabled",
    notificationsDenied: "You can enable them later from System Settings.",
  },

  // ─── Color picker ─────────────────────────────────────────────────────────
  colorPicker: {
    title: "Custom color",
    recentLabel: "Recently used",
  },
};

export default en;
