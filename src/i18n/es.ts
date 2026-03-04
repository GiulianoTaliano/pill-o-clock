const es = {
  // ─── Common ──────────────────────────────────────────────────────────────
  common: {
    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    edit: "Editar",
    add: "Agregar",
    close: "Cerrar",
    confirm: "Confirmar",
    yes: "Sí",
    no: "No",
    ok: "OK",
    error: "Error",
    loading: "Cargando...",
    saving: "Guardando...",
    required: "*",
    start: "inicio",
    end: "sin fin",
  },

  // ─── Days ─────────────────────────────────────────────────────────────────
  days: {
    short: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
    full: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  },

  // ─── Dosage units ─────────────────────────────────────────────────────────
  dosageUnits: {
    gotas: "gotas",
    comprimidos: "comp.",
    capsulas: "cáps.",
  },

  // ─── Categories ───────────────────────────────────────────────────────────
  categories: {
    antibiotico: "Antibiótico",
    analgesico: "Analgésico",
    antiinflamatorio: "Antiinflamatorio",
    suplemento: "Suplemento",
    vitamina: "Vitamina",
    otro: "Otro",
  },

  // ─── Dose status ──────────────────────────────────────────────────────────
  status: {
    pending: "Pendiente",
    taken: "Tomado",
    skipped: "Omitido",
    missed: "No tomado",
  },

  // ─── Home screen ──────────────────────────────────────────────────────────
  home: {
    title: "💊 Pill-O-Clock",
    noMeds: "Sin medicamentos hoy",
    noMedsSubtitle: "Agregá tu primer medicamento tocando el + arriba",
    sectionPending: "Pendientes",
    sectionMissed: "No tomados",
    sectionDone: "Completados",
    chipPending: "{{count}} pendientes",
    chipTaken: "{{count}} tomados",
    chipSkipped: "{{count}} omitidos",
    chipMissed: "{{count}} no tomados",
  },

  // ─── Medications screen ───────────────────────────────────────────────────
  medications: {
    title: "Medicamentos",
    subtitle: "{{count}} configurados",
    sectionActive: "Activos",
    sectionInactive: "Pausados",
    noMeds: "Sin medicamentos",
    noMedsSubtitle: "Agregá tu primer medicamento para comenzar a recibir recordatorios",
    deleteTitle: "Eliminar medicamento",
    deleteMessage: "¿Estás seguro que querés eliminar \"{{name}}\"? Se cancelarán todas sus alarmas.",
    resetTitle: "Restablecer datos",
    resetMessage: "Se eliminarán todos los medicamentos, horarios y registros de dosis. Esta acción no se puede deshacer.",
    resetButton: "Restablecer",
    resetButtonFull: "Restablecer todos los datos",
    scheduleDaily: "Diario · {{time}}",
  },

  // ─── History screen ───────────────────────────────────────────────────────
  history: {
    title: "Historial",
    adherence: "Adherencia: {{value}}%",
    adherenceLabel: "Adherencia",
    taken: "Tomados",
    skipped: "Omitidos",
    total: "Total",
    noLogs: "Sin registros",
    noLogsSubtitle: "No hay dosis registradas en este período",
  },

  // ─── Calendar screen ──────────────────────────────────────────────────────
  calendar: {
    title: "Calendario",
    today: "Hoy",
    noDoses: "Sin dosis",
    noDosesSubtitle: "No hay dosis programadas para este día",
    dayHeaders: ["L", "M", "X", "J", "V", "S", "D"],
  },

  // ─── Medication form ──────────────────────────────────────────────────────
  form: {
    newTitle: "Nuevo medicamento",
    editTitle: "Editar medicamento",
    addButton: "Agregar medicamento",
    saveChanges: "Guardar cambios",
    sectionInfo: "Información del medicamento",
    sectionFrequency: "Frecuencia",
    sectionWhen: "Cuándo",
    sectionAlarm: "Alarma",
    sectionPeriod: "Período de tratamiento (opcional)",
    sectionAlarms: "Alarmas ({{count}})",
    fieldName: "Nombre",
    fieldNamePlaceholder: "ej: Ibuprofeno",
    fieldDose: "Dosis",
    fieldDoseAmountPlaceholder: "ej: 500",
    fieldDoseAmountLabel: "cantidad",
    fieldCategory: "Categoría",
    fieldNotes: "Instrucciones / Notas",
    fieldNotesPlaceholder: "ej: Tomar con comida",
    fieldColor: "Color",
    fieldStartDate: "Fecha de inicio",
    fieldEndDate: "Fecha de fin",
    fieldDate: "Fecha",
    fieldTime: "Hora",
    fieldDays: "Días",
    selectDate: "Seleccioná una fecha",
    modeOnce: "Única vez",
    modeOnceSub: "Solo un día",
    modeRepeat: "Repetir",
    modeRepeatSub: "Varios días",
    addAlarm: "Agregar",
    removeAlarm: "Quitar alarma",
    errorNameRequired: "Nombre requerido",
    errorNameRequiredMsg: "Completá el nombre del medicamento.",
    errorDuplicate: "Nombre duplicado",
    errorDuplicateMsg: "Ya tenés un medicamento llamado \"{{name}}\". Usá un nombre diferente o editá el existente.",
    errorDoseRequired: "Dosis requerida",
    errorDoseRequiredMsg: "Ingresá una cantidad válida (ej: 500, 1, 10).",
    errorNoAlarms: "Sin alarmas",
    errorNoAlarmsMsg: "Agregá al menos una alarma.",
    errorInvalidPeriod: "Período inválido",
    errorInvalidPeriodMsg: "La fecha de fin no puede ser anterior a la fecha de inicio.",
    errorGeneric: "No se pudo guardar el medicamento. Intentá de nuevo.",
  },

  // ─── Alarm screen ─────────────────────────────────────────────────────────
  alarm: {
    subtitle: "Recordatorio de medicamento",
    dose: "Dosis",
    takeMed: "Tomé el medicamento",
    snooze: "Posponer {{minutes}} min",
    skip: "Omitir esta dosis",
  },

  // ─── Dose card ────────────────────────────────────────────────────────────
  doseCard: {
    snooze: "+15 min",
    skip: "Omitir",
    take: "Tomado",
    takeLate: "Tomé tarde",
    takenAt: " a las {{time}}",
  },

  // ─── Medication card ──────────────────────────────────────────────────────
  medicationCard: {
    deleteButton: "Eliminar",
    inactiveLabel: "Inactivo",
  },

  // ─── Notifications ────────────────────────────────────────────────────────
  notifications: {
    reminderTitle: "💊 Hora de tomar {{name}}",
    repeatTitle: "⏰ Recordatorio: {{name}}",
    snoozeTitle: "⏰ Recordatorio (pospuesto): {{name}}",
    body: "Dosis: {{dose}}",
    bodyWithNotes: "Dosis: {{dose}} · {{notes}}",
    bodyActions: " · Expande para ver opciones",
    actionTaken: "✅ Tomé el medicamento",
    actionSnooze: "⏰ Posponer {{minutes}} min",
    actionSkip: "❌ Omitir",
    channelName: "Recordatorios de medicamentos",
    channelCollapsed: "Recordatorio de medicamento",
  },

  // ─── Permissions ──────────────────────────────────────────────────────────
  permissions: {
    exactAlarmTitle: "Permiso necesario",
    exactAlarmMessage:
      "Para que las alarmas suenen a tiempo en Android 12, habilitá \"Alarmas y recordatorios\" para Pill-O-Clock en Configuración.",
    exactAlarmLater: "Ahora no",
    exactAlarmOpen: "Abrir configuración",
  },

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  tabs: {
    today: "Hoy",
    calendar: "Calendario",
    medications: "Medicamentos",
    history: "Historial",
    settings: "Ajustes",
  },

  // ─── Settings screen ──────────────────────────────────────────────────────
  settings: {
    title: "Ajustes",
    // Data
    sectionData: "Tus datos",
    exportButton: "Exportar datos",
    exportSubtitle: "Guardar copia de seguridad en tu dispositivo",
    importButton: "Importar datos",
    importSubtitle: "Restaurar desde una copia de seguridad",
    importModeTitle: "¿Cómo querés importar?",
    importModeMessage:
      "Reemplazar borrará todos los datos actuales. Fusionar mantendrá los existentes y agregará los nuevos.",
    importModeReplace: "Reemplazar todo",
    importModeMerge: "Fusionar",
    importSuccess: "Importación exitosa",
    importSuccessMsg: "{{count}} medicamento(s) importado(s) correctamente.",
    importError: "Error al importar",
    importErrorFormat: "El archivo no tiene el formato correcto de Pill-O-Clock.",
    importErrorGeneric: "No se pudo importar el archivo. Intentá de nuevo.",
    exportError: "Error al exportar",
    exportErrorGeneric: "No se pudo exportar. Intentá de nuevo.",
    // Language
    sectionLanguage: "Idioma",
    languageEs: "Español",
    languageEn: "English",
    // About
    sectionAbout: "Información",
    version: "Versión",
    // Danger zone
    sectionDanger: "Zona de peligro",
    clearData: "Borrar todos los datos",
    clearDataSubtitle: "Esta acción no se puede deshacer",
    clearDataConfirmTitle: "¿Borrar todo?",
    clearDataConfirmMsg:
      "Se eliminarán todos tus medicamentos, alarmas e historial. Esta acción no se puede deshacer.",
    clearDataConfirmButton: "Sí, borrar todo",
  },

  // ─── Onboarding ──────────────────────────────────────────────────────────
  onboarding: {
    next: "Siguiente",
    skip: "Omitir",
    start: "Comenzar",
    slide1Title: "Pill-O-Clock",
    slide1Sub: "Tu asistente de medicamentos",
    slide1Desc: "Nunca más olvidés una dosis. Alarmas puntuales y seguimiento de adherencia en un solo lugar.",
    slide2Title: "Alarmas inteligentes",
    slide2Desc: "Recordatorios con opciones para tomar, posponer u omitir — sin necesidad de abrir la app.",
    slide3Title: "Seguí tu adherencia",
    slide3Desc: "Historial completo y estadísticas para saber cómo vas con tus tratamientos.",
    slide4Title: "Casi listo",
    slide4Desc: "Necesitamos tu permiso para enviarte recordatorios cuando sea momento de tomar tus medicamentos.",
    enableNotifications: "Activar notificaciones",
    notificationsGranted: "✅ Notificaciones activadas",
    notificationsDenied: "Pods activarlas luego desde Ajustes del sistema.",
  },
} as const;

export default es;
export type TranslationKeys = typeof es;

/** Recursively replaces all string literal types with `string`, so other
 *  locale files can be typed against the same shape without requiring
 *  exact value matches. */
type DeepString<T> = {
  [K in keyof T]: T[K] extends readonly string[]
    ? string[]
    : T[K] extends string
    ? string
    : DeepString<T[K]>;
};
export type TranslationShape = DeepString<TranslationKeys>;
