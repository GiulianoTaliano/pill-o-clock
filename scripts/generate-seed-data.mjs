#!/usr/bin/env node

/**
 * Generates a Pill O-Clock backup JSON with dates relative to today.
 * This ensures screenshots always show realistic, "fresh" data regardless
 * of when the audit runs.
 *
 * Usage:
 *   node scripts/generate-seed-data.mjs > scripts/seed-data.json
 *   node scripts/generate-seed-data.mjs --output scripts/seed-data.json
 */

// ─── Date helpers ───────────────────────────────────────────

function today() { return new Date(); }

function dayOffset(days) {
  const d = today();
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fmtISO(d) {
  return d.toISOString();
}

function dateAtTime(dateObj, time) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(dateObj);
  d.setHours(h, m, 0, 0);
  return d;
}

function minutesLater(dateObj, mins) {
  return new Date(dateObj.getTime() + mins * 60000);
}

// ─── Medications ────────────────────────────────────────────

const medications = [
  {
    id: 'seed-med-001', name: 'Ibuprofeno',
    dosageAmount: 400, dosageUnit: 'mg', dosage: '400 mg',
    category: 'antiinflamatorio',
    notes: 'Tomar con comida para proteger el estómago',
    color: 'orange',
    startDate: fmtDate(dayOffset(-40)),
    isActive: true,
    createdAt: fmtISO(dayOffset(-40)),
    stockQuantity: 20, stockAlertThreshold: 5,
  },
  {
    id: 'seed-med-002', name: 'Amoxicilina',
    dosageAmount: 500, dosageUnit: 'mg', dosage: '500 mg',
    category: 'antibiotico',
    notes: 'Ciclo de 7 días',
    color: 'red',
    startDate: fmtDate(dayOffset(-7)),
    endDate: fmtDate(dayOffset(0)),
    isActive: true,
    createdAt: fmtISO(dayOffset(-7)),
    stockQuantity: 3, stockAlertThreshold: 2,
  },
  {
    id: 'seed-med-003', name: 'Vitamina D3',
    dosageAmount: 2000, dosageUnit: 'UI', dosage: '2000 UI',
    category: 'vitamina', color: 'teal',
    startDate: fmtDate(dayOffset(-60)),
    isActive: true,
    createdAt: fmtISO(dayOffset(-60)),
    stockQuantity: 45, stockAlertThreshold: 10,
  },
  {
    id: 'seed-med-004', name: 'Omeprazol',
    dosageAmount: 20, dosageUnit: 'mg', dosage: '20 mg',
    category: 'otro',
    notes: 'Tomar en ayunas, 30 min antes del desayuno',
    color: 'purple',
    isActive: true,
    createdAt: fmtISO(dayOffset(-90)),
  },
  {
    id: 'seed-med-005', name: 'Paracetamol',
    dosageAmount: 1, dosageUnit: 'g', dosage: '1 g',
    category: 'analgesico', color: 'blue',
    isActive: true,
    createdAt: fmtISO(dayOffset(-30)),
    isPRN: true,
  },
  {
    id: 'seed-med-006', name: 'Magnesio',
    dosageAmount: 400, dosageUnit: 'mg', dosage: '400 mg',
    category: 'suplemento',
    notes: 'Tomar antes de dormir',
    color: 'green',
    isActive: true,
    createdAt: fmtISO(dayOffset(-40)),
    stockQuantity: 30, stockAlertThreshold: 8,
  },
  {
    id: 'seed-med-007', name: 'Gotas oftálmicas',
    dosageAmount: 2, dosageUnit: 'gotas', dosage: '2 gotas',
    category: 'otro',
    notes: 'Ojo derecho solamente',
    color: 'pink',
    isActive: false,
    createdAt: fmtISO(dayOffset(-120)),
    endDate: fmtDate(dayOffset(-60)),
  },
];

// ─── Schedules ──────────────────────────────────────────────

const schedules = [
  { id: 'seed-sch-001', medicationId: 'seed-med-001', time: '08:00', days: [1,2,3,4,5], isActive: true },
  { id: 'seed-sch-002', medicationId: 'seed-med-001', time: '20:00', days: [1,2,3,4,5], isActive: true },
  { id: 'seed-sch-003', medicationId: 'seed-med-002', time: '08:00', days: [], isActive: true },
  { id: 'seed-sch-004', medicationId: 'seed-med-002', time: '16:00', days: [], isActive: true },
  { id: 'seed-sch-005', medicationId: 'seed-med-002', time: '00:00', days: [], isActive: true },
  { id: 'seed-sch-006', medicationId: 'seed-med-003', time: '09:00', days: [], isActive: true },
  { id: 'seed-sch-007', medicationId: 'seed-med-004', time: '06:30', days: [], isActive: true },
  { id: 'seed-sch-008', medicationId: 'seed-med-006', time: '22:00', days: [], isActive: true },
];

// ─── Dose Logs ──────────────────────────────────────────────
// Generate logs for: today (pending future slots + some taken),
// yesterday (mostly taken, one missed), day before (all taken)

function makeDoseLogs() {
  const logs = [];
  let idx = 1;

  function log(medId, schId, daysAgo, time, status, extra = {}) {
    const d = dayOffset(-daysAgo);
    const at = dateAtTime(d, time);
    const entry = {
      id: `seed-log-${String(idx++).padStart(3, '0')}`,
      medicationId: medId,
      scheduleId: schId,
      scheduledDate: fmtDate(d),
      scheduledTime: time,
      status,
      createdAt: fmtISO(status === 'missed' ? minutesLater(at, 120) : minutesLater(at, 5)),
      ...extra,
    };
    if (status === 'taken') entry.takenAt = fmtISO(minutesLater(at, Math.floor(Math.random() * 15)));
    logs.push(entry);
  }

  // Today — some taken, some pending (gives realistic home screen)
  log('seed-med-004', 'seed-sch-007', 0, '06:30', 'taken');
  log('seed-med-001', 'seed-sch-001', 0, '08:00', 'taken');
  log('seed-med-002', 'seed-sch-003', 0, '08:00', 'taken');
  log('seed-med-003', 'seed-sch-006', 0, '09:00', 'pending');
  log('seed-med-002', 'seed-sch-004', 0, '16:00', 'pending');
  log('seed-med-001', 'seed-sch-002', 0, '20:00', 'pending');
  log('seed-med-006', 'seed-sch-008', 0, '22:00', 'pending');

  // Yesterday — mostly taken, one missed, one skipped
  log('seed-med-004', 'seed-sch-007', 1, '06:30', 'taken');
  log('seed-med-001', 'seed-sch-001', 1, '08:00', 'taken');
  log('seed-med-002', 'seed-sch-003', 1, '08:00', 'taken');
  log('seed-med-003', 'seed-sch-006', 1, '09:00', 'taken');
  log('seed-med-002', 'seed-sch-004', 1, '16:00', 'skipped', { skipReason: 'side_effect', notes: 'Malestar estomacal' });
  log('seed-med-001', 'seed-sch-002', 1, '20:00', 'taken');
  log('seed-med-006', 'seed-sch-008', 1, '22:00', 'missed');

  // 2 days ago — all taken
  log('seed-med-004', 'seed-sch-007', 2, '06:30', 'taken');
  log('seed-med-001', 'seed-sch-001', 2, '08:00', 'taken');
  log('seed-med-002', 'seed-sch-003', 2, '08:00', 'taken');
  log('seed-med-003', 'seed-sch-006', 2, '09:00', 'taken');
  log('seed-med-002', 'seed-sch-004', 2, '16:00', 'taken');
  log('seed-med-001', 'seed-sch-002', 2, '20:00', 'taken');
  log('seed-med-006', 'seed-sch-008', 2, '22:00', 'taken');

  // 3 days ago — one skipped
  log('seed-med-004', 'seed-sch-007', 3, '06:30', 'skipped', { skipReason: 'forgot' });
  log('seed-med-001', 'seed-sch-001', 3, '08:00', 'taken');
  log('seed-med-003', 'seed-sch-006', 3, '09:00', 'taken');

  // PRN dose 2 days ago
  log('seed-med-005', 'prn', 2, '14:00', 'taken', { notes: 'Dolor de cabeza' });

  return logs;
}

// ─── Appointments ───────────────────────────────────────────

const appointments = [
  {
    id: 'seed-apt-001',
    title: 'Control general',
    doctor: 'Dra. García',
    location: 'Hospital Central, Consultorio 205',
    locationCoords: { latitude: -34.6037, longitude: -58.3816 },
    notes: 'Llevar análisis de sangre',
    date: fmtDate(dayOffset(6)),
    time: '10:30',
    reminderMinutes: 60,
    createdAt: fmtISO(dayOffset(-14)),
  },
  {
    id: 'seed-apt-002',
    title: 'Oftalmólogo',
    doctor: 'Dr. Martínez',
    location: 'Clínica de la Visión',
    date: fmtDate(dayOffset(22)),
    time: '16:00',
    reminderMinutes: 30,
    createdAt: fmtISO(dayOffset(-9)),
  },
  {
    id: 'seed-apt-003',
    title: 'Análisis de sangre',
    location: 'Laboratorio CEMA',
    notes: 'Ayuno de 12 horas. No tomar Omeprazol la noche anterior.',
    date: fmtDate(dayOffset(4)),
    time: '07:00',
    reminderMinutes: 720,
    createdAt: fmtISO(dayOffset(-4)),
  },
];

// ─── Health Measurements ────────────────────────────────────

function makeHealthMeasurements() {
  const measurements = [];
  let idx = 1;

  function m(type, daysAgo, time, v1, v2, notes) {
    const d = dateAtTime(dayOffset(-daysAgo), time);
    measurements.push({
      id: `seed-hm-${String(idx++).padStart(3, '0')}`,
      type, value1: v1, ...(v2 != null && { value2: v2 }),
      measuredAt: fmtISO(d),
      ...(notes && { notes }),
      createdAt: fmtISO(d),
    });
  }

  // Blood pressure — 5 readings over the last days
  m('blood_pressure', 0, '08:00', 125, 82);
  m('blood_pressure', 1, '08:00', 118, 78);
  m('blood_pressure', 2, '08:00', 130, 85, 'Medición después de café');
  m('blood_pressure', 4, '08:00', 122, 80);
  m('blood_pressure', 6, '08:00', 127, 83);

  // Glucose
  m('glucose', 0, '07:00', 95, undefined, 'En ayunas');
  m('glucose', 1, '12:30', 110, undefined, 'Post-almuerzo');
  m('glucose', 3, '07:00', 92, undefined, 'En ayunas');

  // Weight
  m('weight', 0, '07:30', 74.5);
  m('weight', 7, '07:30', 74.8);

  // Heart rate
  m('heart_rate', 0, '08:05', 72, undefined, 'En reposo');
  m('heart_rate', 1, '18:00', 88, undefined, 'Después de caminar');

  // SpO2
  m('spo2', 0, '08:05', 97);

  return measurements;
}

// ─── Daily Check-ins ────────────────────────────────────────

const dailyCheckins = [
  {
    id: 'seed-chk-001', date: fmtDate(dayOffset(-1)), mood: 4,
    symptoms: ['fatiga'],
    notes: 'Buen día en general, un poco cansado por la tarde',
    createdAt: fmtISO(dateAtTime(dayOffset(-1), '22:00')),
  },
  {
    id: 'seed-chk-002', date: fmtDate(dayOffset(-2)), mood: 3,
    symptoms: ['dolor_cabeza', 'fatiga'],
    notes: 'Dolor de cabeza a media tarde, tomé Paracetamol',
    createdAt: fmtISO(dateAtTime(dayOffset(-2), '22:00')),
  },
  {
    id: 'seed-chk-003', date: fmtDate(dayOffset(-3)), mood: 5,
    symptoms: [],
    notes: 'Excelente día, sin molestias',
    createdAt: fmtISO(dateAtTime(dayOffset(-3), '21:00')),
  },
  {
    id: 'seed-chk-004', date: fmtDate(dayOffset(-4)), mood: 2,
    symptoms: ['nausea', 'mareo', 'fatiga'],
    notes: 'Malestar general, posible efecto de Amoxicilina',
    createdAt: fmtISO(dateAtTime(dayOffset(-4), '20:00')),
  },
  {
    id: 'seed-chk-005', date: fmtDate(dayOffset(-5)), mood: 4,
    symptoms: [],
    createdAt: fmtISO(dateAtTime(dayOffset(-5), '21:30')),
  },
];

// ─── Build & Output ─────────────────────────────────────────

const backup = {
  version: 2,
  exportedAt: new Date().toISOString(),
  app: 'pill-o-clock',
  data: {
    medications,
    schedules,
    doseLogs: makeDoseLogs(),
    appointments,
    healthMeasurements: makeHealthMeasurements(),
    dailyCheckins,
  },
};

const json = JSON.stringify(backup, null, 2);

const outputFlag = process.argv.indexOf('--output');
if (outputFlag !== -1 && process.argv[outputFlag + 1]) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.argv[outputFlag + 1], json, 'utf-8');
  const counts = Object.entries(backup.data).map(([k, v]) => `${v.length} ${k}`).join(', ');
  console.error(`Seed data written: ${counts}`);
} else {
  process.stdout.write(json);
}
