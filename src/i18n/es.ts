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
    title: "💊 Pill O-Clock",
    noMeds: "Sin medicamentos hoy",
    noMedsSubtitle: "Agregá tu primer medicamento tocando el + arriba",
    sectionPending: "Pendientes",
    sectionMissed: "No tomados",
    sectionDone: "Completados",
    sectionPRN: "A demanda",
    chipPending_one: "{{count}} pendiente",
    chipPending_other: "{{count}} pendientes",
    chipTaken_one: "{{count}} tomado",
    chipTaken_other: "{{count}} tomados",
    chipSkipped_one: "{{count}} omitido",
    chipSkipped_other: "{{count}} omitidos",
    chipMissed_one: "{{count}} no tomado",
    chipMissed_other: "{{count}} no tomados",
    tipReschedule: "Tip: Tocá el horario de una dosis pendiente para reprogramarla hoy. Tocá para cerrar.",
    streak_one: "🔥 {{count}} día seguido",
    streak_other: "🔥 {{count}} días seguidos",
    prnLogDose: "Registrar dosis",
  },

  // ─── Medications screen ───────────────────────────────────────────────────
  medications: {
    title: "Medicamentos",
    subtitle_one: "{{count}} configurado",
    subtitle_other: "{{count}} configurados",
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
    viewWeek: "Semana",
    viewMonth: "Mes",
    missed: "No tomados",
  },

  // ─── Calendar screen ──────────────────────────────────────────────────────
  calendar: {
    title: "Agenda",
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
    sectionAlarms_one: "Alarma ({{count}})",
    sectionAlarms_other: "Alarmas ({{count}})",
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
    modePRN: "A demanda (PRN)",
    modePRNSub: "Sin horario fijo",
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
    sectionStock: "Stock (opcional)",
    fieldStock: "Stock actual",
    fieldStockPlaceholder: "ej: 30",
    fieldStockThreshold: "Alertar cuando queden menos de",
    fieldStockThresholdPlaceholder: "ej: 5",
    fieldStockUnit: "unidades",
    sectionPhoto: "Foto (opcional)",
    addPhoto: "Agregar foto",
    changePhoto: "Cambiar foto",
    removePhoto: "Quitar foto",
    errorPhotoPermission: "Se necesita permiso para acceder a la galería",
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
    revert: "Revertir",
    snoozeConfirm: "Recordatorio pospuesto 15 min ⏰",
    rescheduleConfirm: "Toma reprogramada para las {{time}} 🕐",
    rescheduleTitle: "Reprogramar toma",
    rescheduleOriginal: "Horario original: {{time}}",
    addNote: "Agregar nota",
    noteModalTitle: "Nota de dosis",
    noteModalPlaceholder: "¿Cómo te sentiste? ¿Algún efecto secundario?",
    noteSaved: "Nota guardada",
    revertSnooze: "Deshacer postergación",
    skipReasonTitle: "¿Por qué lo omitís?",
    skipReasonSubtitle: "Ayuda a hacer seguimiento de tu adherencia",
    skipReason_forgot: "Se me olvidó",
    skipReason_side_effect: "Efecto secundario",
    skipReason_no_stock: "Sin stock",
    skipReason_other: "Otro motivo",
  },

  // ─── Medication card ──────────────────────────────────────────────────────
  medicationCard: {
    deleteButton: "Eliminar",
    inactiveLabel: "Inactivo",
    nextDose: "Próxima: {{time}}",
    nextDosePRN: "A demanda",
    todayComplete: "Completado hoy ✓",
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
      "Para que las alarmas suenen a tiempo en Android 12, habilitá \"Alarmas y recordatorios\" para Pill O-Clock en Configuración.",
    exactAlarmLater: "Ahora no",
    exactAlarmOpen: "Abrir configuración",    fullScreenTitle: "Permitir alarmas en pantalla completa",
    fullScreenMessage:
      "En Android 14+, necesitás otorgar el permiso \"Mostrar notificaciones en pantalla completa\" para que la pantalla de alarma pueda aparecer sobre la pantalla de bloqueo. Tapá \"Abrir configuración\" y activá la opción para Pill O-Clock.",  },

  // ─── Stock ────────────────────────────────────────────────────────────────
  stock: {
    alertTitle: "Stock bajo: {{name}}",
    alertBody: "Solo te quedan {{count}}. Es hora de pedir más.",
    badge_one: "Queda {{count}}",
    badge_other: "Quedan {{count}}",
    low: "Stock bajo",
    channelName: "Alertas de stock",
  },

  // ─── Citas ───────────────────────────────────────────────────────────────
  appointments: {
    title: "Citas",
    noAppointments: "Sin citas",
    noAppointmentsSubtitle: "Agregá tu próxima visita médica tocando +",
    upcomingSection: "Próximas citas",
    viewAll: "Ver todas ({{count}})",
    upcoming: "Próximas",
    past: "Pasadas",
    deleteTitle: "Eliminar cita",
    deleteMessage: "¿Estás seguro que querés eliminar esta cita?",
    newTitle: "Nueva cita",
    editTitle: "Editar cita",
    fieldTitle: "Título",
    fieldTitlePlaceholder: "ej: Cardiólogo",
    fieldDoctor: "Médico (opcional)",
    fieldDoctorPlaceholder: "ej: Dr. García",
    fieldLocation: "Lugar (opcional)",
    fieldLocationPlaceholder: "ej: Hospital General, Piso 2",
    fieldNotes: "Notas (opcional)",
    fieldNotesPlaceholder: "Preguntas para hacer, cosas para llevar...",
    fieldDate: "Fecha",
    fieldTime: "Hora",
    fieldReminder: "Recordatorio",
    reminderNone: "Sin recordatorio",
    reminder1h: "1 hora antes",
    reminder2h: "2 horas antes",
    reminder1d: "1 día antes",
    notifTitle: "📅 Recordatorio de cita",
    notifBody: "{{title}}",
    notifHeadsUpTitle: "📅 {{title}} (ahora)",
    notifHeadsUpBody: "Tu cita está comenzando",
    saveButton: "Guardar cita",
    errorTitleRequired: "Título requerido",
    errorDateRequired: "Fecha requerida",
    errorGeneric: "No se pudo guardar la cita. Intentá de nuevo.",
    // Location picker
    pickOnMap: "Fijar en mapa",
    locationPickerTitle: "Fijar ubicación",
    locationSearchPlaceholder: "Buscar dirección o arrastrá el mapa…",
    locationPickerSubtitle: "Arrastrá el mapa para posicionar el pin",
    locationPickerConfirm: "Confirmar ubicación",
    locateMe: "Mi ubicación",
    viewOnMap: "Ver en mapa",
    shareLocation: "Compartir",
    locationPermDenied: "Se necesita permiso de ubicación para usar esta función.",
    locationPermTitle: "Permiso de ubicación",
    locationLoading: "Obteniendo ubicación…",
    locationClear: "Borrar ubicación",
  },

  // ─── Tabs ─────────────────────────────────────────────────────────────────
  tabs: {
    today: "Hoy",
    calendar: "Calendario",
    agenda: "Agenda",
    medications: "Medicamentos",
    history: "Historial",
    health: "Salud",
    appointments: "Citas",
    settings: "Ajustes",
  },

  // ─── Health & measurements ─────────────────────────────────────────────────────
  health: {
    title: "Salud",
    tabMeasurements: "Mediciones",
    tabDiary: "Diario",
    noMeasurements: "Sin mediciones aún",
    noMeasurementsSubtitle: "Tocá + para registrar tu primera medición",
    noDiary: "Sin registros esta semana",
    noDiarySubtitle: "Completá tu primer check-in diario",
    latestValue: "Último",
    chart: "Evolución",
    deleteTitle: "Eliminar medición",
    deleteMessage: "¿Querés eliminar esta medición?",
    fieldNotes: "Notas (opcional)",
    fieldNotesPlaceholder: "Condiciones, observaciones...",
    fieldDate: "Fecha",
    fieldTime: "Hora",
    saveButton: "Guardar medición",
    errorRequired: "El valor es requerido",
    errorInvalid: "Ingresá valores válidos",
    reminderSection: "Recordatorio diario",
    reminderSubtitle: "Recibí una notificación para medir",
    reminderNone: "Sin recordatorio",
    reminderTapToConfigure: "tocá para configurar",
    reminderActive: "Activo · {{time}}",
    reminderSaved: "Recordatorio guardado",
    reminderCancelled: "Recordatorio desactivado",
    blood_pressure_name: "Presión arterial",
    blood_pressure_unit: "mmHg",
    blood_pressure_field1: "Sistólica",
    blood_pressure_field2: "Diastólica",
    blood_pressure_format: "{{v1}}/{{v2}}",
    glucose_name: "Glucemia",
    glucose_unit: "mg/dL",
    glucose_field1: "Glucemia",
    glucose_format: "{{v1}}",
    weight_name: "Peso",
    weight_unit: "kg",
    weight_field1: "Peso",
    weight_format: "{{v1}}",
    spo2_name: "Oxigenación (SpO₂)",
    spo2_unit: "%",
    spo2_field1: "SpO₂",
    spo2_format: "{{v1}}",
    heart_rate_name: "Frecuencia cardíaca",
    heart_rate_unit: "bpm",
    heart_rate_field1: "Frecuencia",
    heart_rate_format: "{{v1}}",
    notifTitle: "⏱ Hora de registrar",
    notifBody: "Abrí la app para registrar tus mediciones del día",
    channelName: "Recordatorios de salud",
  },

  // ─── Check-in diario ───────────────────────────────────────────────────────
  checkin: {
    title: "Check-in diario",
    heading: "¿Cómo te sentís hoy?",
    moodLabel: "Estado general",
    mood_1: "Muy mal",
    mood_2: "Mal",
    mood_3: "Regular",
    mood_4: "Bien",
    mood_5: "Excelente",
    moodEmoji_1: "😞",
    moodEmoji_2: "😕",
    moodEmoji_3: "😐",
    moodEmoji_4: "🙂",
    moodEmoji_5: "😄",
    symptomsLabel: "Síntomas (opcional)",
    symptom_headache: "Dolor de cabeza",
    symptom_nausea: "Náuseas",
    symptom_fatigue: "Cansancio",
    symptom_dizziness: "Mareos",
    symptom_stomach: "Estómago",
    symptom_pain: "Dolor general",
    symptom_anxiety: "Ansiedad",
    symptom_insomnia: "Insomnio",
    fieldNotes: "Notas (opcional)",
    fieldNotesPlaceholder: "Efectos de medicamentos, observaciones...",
    saveButton: "Guardar check-in",
    alreadyDone: "✅ Check-in de hoy completado",
    editToday: "Ver/editar",
    homePromptTitle: "¿Cómo va tu día?",
    homePromptSubtitle: "Registrá tu bienestar diario",
    noCheckins: "Sin registros",
    noCheckinsSubtitle: "Tu primer check-in aparecerá aquí",
    successMsg: "Check-in guardado",
  },

  // ─── Informe PDF ────────────────────────────────────────────────────────
  report: {
    generate: "Generar informe PDF",
    generateSubtitle: "Compartir con tu médico: medicamentos, historial y mediciones",
    generating: "Generando informe...",
    errorTitle: "Error al generar",
    errorMsg: "No se pudo generar el informe. Intentá de nuevo.",
    sectionTitle: "Informe de Salud — Pill O-Clock",
    sectionMeds: "Medicamentos activos",
    sectionHistory: "Historial de dosis — últimos 30 días",
    sectionHealth: "Mediciones de salud",
    sectionDiary: "Diario de bienestar",
    noData: "Sin datos disponibles",
    generatedBy: "Generado con Pill O-Clock",
    privacyNote: "Datos 100% locales — no se comparten con terceros",
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
    importSuccessMsg_one: "{{count}} medicamento importado correctamente.",
    importSuccessMsg_other: "{{count}} medicamentos importados correctamente.",
    importError: "Error al importar",
    importErrorFormat: "El archivo no tiene el formato correcto de Pill O-Clock.",
    importErrorGeneric: "No se pudo importar el archivo. Intentá de nuevo.",
    exportSuccess: "Copia de seguridad guardada correctamente.",
    exportError: "Error al exportar",
    exportErrorGeneric: "No se pudo exportar. Intentá de nuevo.",
    // Language
    sectionLanguage: "Idioma",
    languageEs: "Español",
    languageEn: "English",
    // Permissions
    sectionPermissions: "Permisos",
    fullScreenPermission: "Alarma en pantalla completa",
    fullScreenPermissionSubtitle: "Permite que la alarma aparezca sobre la pantalla de bloqueo y sobre otras apps (Android 14+)",
    fullScreenPermissionGranted: "Concedido",
    fullScreenPermissionRequired: "Toca para habilitar",
    // Appearance
    sectionAppearance: "Apariencia",
    themeSystem: "Automático (sistema)",
    themeLight: "Claro",
    themeDark: "Oscuro",
    // About
    sectionAbout: "Información",
    version: "Versión",
    privacyPolicy: "Política de privacidad",
    // Danger zone
    sectionDanger: "Zona de peligro",
    clearData: "Borrar todos los datos",
    clearDataSubtitle: "Esta acción no se puede deshacer",
    clearDataConfirmTitle: "¿Borrar todo?",
    clearDataConfirmMsg:
      "Se eliminarán todos tus medicamentos, alarmas e historial. Esta acción no se puede deshacer.",
    clearDataConfirmButton: "Sí, borrar todo",
    clearDataFinalTitle: "⚠️ Confirmación final",
    clearDataFinalMsg:
      "Esta acción es IRREVERSIBLE. Perderás todos tus medicamentos, alarmas, historial y mediciones de salud. ¿Deseas continuar?",
    clearDataFinalButton: "Borrar permanentemente",
  },

  // ─── Onboarding ──────────────────────────────────────────────────────────
  onboarding: {
    next: "Siguiente",
    skip: "Omitir",
    start: "Comenzar",
    // Slide 1 — Bienvenida
    slide1Title: "Pill O-Clock",
    slide1Sub: "Tu asistente de medicamentos",
    slide1Desc: "Tu compañero completo de medicamentos. Organizados, con recordatorios a tiempo y tu salud en seguimiento.",
    chip1: "Medicamentos",
    chip2: "Alarmas",
    chip3: "Turnos médicos",
    chip4: "Salud",
    // Slide 2 — Alarmas
    slide2Title: "Alarmas inteligentes",
    slide2Desc: "Recordatorios con opciones para tomar, posponer u omitir — sin necesidad de abrir la app.",
    // Slide 3 — Turnos (NUEVO)
    slide3Title: "Turnos médicos",
    slide3Desc: "Agendá tus visitas al médico, configurá recordatorios anticipados y marcá la ubicación en el mapa. Tu agenda, organizada.",
    // Slide 4 — Salud (NUEVO)
    slide4Title: "Seguí tu salud",
    slide4Desc: "Registrá presión arterial, glucosa, peso y más. Completá tu check-in diario de bienestar y exportá informes PDF para tu médico.",
    // Slide 5 — Permisos
    slide5Title: "Casi listo",
    slide5Desc: "Necesitamos tu permiso para enviarte recordatorios cuando sea momento de tomar tus medicamentos.",
    enableNotifications: "Activar notificaciones",
    notificationsGranted: "✅ Notificaciones activadas",
    notificationsDenied: "Podés activarlas luego desde Ajustes del sistema.",
    exactAlarmBtn: "Habilitar 'Alarmas y recordatorios'",
    exactAlarmHint: "Necesario en Android 12 para alarmas a tiempo exacto.",
    fullScreenBtn: "Permitir alarmas en pantalla completa",
    fullScreenHint: "Necesario en Android 14+ para mostrar alarmas sobre la pantalla de bloqueo.",
  },

  // ─── Tour in-app ──────────────────────────────────────────────────────────
  tour: {
    next: "Siguiente",
    done: "¡Entendido!",
    skip: "Saltar tour",
    // Paso 1 — Botón agregar medicamento
    step1Title: "Empezá aquí",
    step1Desc: "Tocá + para agregar tu primer medicamento. Configurá nombre, dosis, horario y alarma.",
    // Paso 2 — Tab Calendario
    step2Title: "Agenda y turnos",
    step2Desc: "Acá ves tu plan de dosis del día. También podés agregar turnos médicos con recordatorios y ubicación.",
    // Paso 3 — Tab Salud
    step3Title: "Tu salud",
    step3Desc: "Registrá presión arterial, glucosa, peso y más. Completá tu check-in diario de bienestar aquí.",
    // Paso 4 — Tab Ajustes
    step4Title: "Ajustes",
    step4Desc: "Administrá tus datos, backup, preferencias de idioma y generá informes PDF para tu médico.",
  },

  // ─── Color picker ─────────────────────────────────────────────────────────
  colorPicker: {
    title: "Color personalizado",
    recentLabel: "Usados recientemente",
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
