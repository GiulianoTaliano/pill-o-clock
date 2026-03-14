#!/usr/bin/env node

/**
 * Pushes seed data into the Pill O-Clock SQLite database on an Android device/emulator.
 *
 * This script:
 *   1. Reads a Pill O-Clock backup JSON (from generate-seed-data.mjs or test-backup.json)
 *   2. Stops the app
 *   3. Runs SQL INSERTs directly into pilloclock.db via `adb shell run-as`
 *   4. Restarts the app
 *
 * Usage:
 *   node scripts/push-seed-data.mjs <backup.json> [--serial <device>]
 *   node scripts/push-seed-data.mjs scripts/seed-data.json
 *
 * Requires: adb in PATH, app installed on target device with debuggable build
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const APP_PACKAGE = 'com.pilloclock.app';
const DB_NAME = 'pilloclock.db';

// ─── CLI ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const serialIdx = args.indexOf('--serial');
const serial = serialIdx !== -1 ? args.splice(serialIdx, 2)[1] : null;
const backupPath = args[0];

if (!backupPath) {
  console.error('Usage: node scripts/push-seed-data.mjs <backup.json> [--serial <device>]');
  process.exit(1);
}

// ─── ADB helpers ────────────────────────────────────────────

function adb(...adbArgs) {
  const allArgs = serial ? ['-s', serial, ...adbArgs] : adbArgs;
  return execFileSync('adb', allArgs, { encoding: 'utf-8', timeout: 15000 }).trim();
}

function adbShell(...shellArgs) {
  return adb('shell', ...shellArgs);
}

function runSql(sql) {
  // Run SQL via run-as to access the app's private data dir
  // Use sqlite3 if available on device, otherwise use the app's Expo SQLite wrapper
  const dbPath = `/data/data/${APP_PACKAGE}/databases/${DB_NAME}`;
  const escaped = sql.replace(/'/g, "'\\''");
  return adbShell('run-as', APP_PACKAGE, 'sh', '-c',
    `sqlite3 '${dbPath}' '${escaped}'`
  );
}

function runSqlBatch(statements) {
  // Batch SQL statements into a single sqlite3 call for performance
  const batchSize = 20;
  for (let i = 0; i < statements.length; i += batchSize) {
    const batch = statements.slice(i, i + batchSize).join('\n');
    const dbPath = `/data/data/${APP_PACKAGE}/databases/${DB_NAME}`;
    // Write batch to a temp file on device and execute
    const escaped = batch.replace(/'/g, "'\\''");
    adbShell('run-as', APP_PACKAGE, 'sh', '-c',
      `sqlite3 '${dbPath}' '${escaped}'`
    );
  }
}

// ─── SQL escaping ───────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ─── Build INSERT statements ────────────────────────────────

function buildMedicationInsert(m) {
  return `INSERT OR REPLACE INTO medications (id,name,dosage,dosage_amount,dosage_unit,category,notes,color,start_date,end_date,is_active,created_at,stock_quantity,stock_alert_threshold,photo_uri,is_prn) VALUES (${esc(m.id)},${esc(m.name)},${esc(m.dosage)},${esc(m.dosageAmount)},${esc(m.dosageUnit)},${esc(m.category)},${esc(m.notes)},${esc(m.color)},${esc(m.startDate)},${esc(m.endDate)},${esc(m.isActive)},${esc(m.createdAt)},${esc(m.stockQuantity)},${esc(m.stockAlertThreshold)},${esc(m.photoUri)},${esc(m.isPRN ?? false)});`;
}

function buildScheduleInsert(s) {
  const days = Array.isArray(s.days) ? JSON.stringify(s.days) : (s.days ?? '[]');
  return `INSERT OR REPLACE INTO schedules (id,medication_id,time,days,is_active) VALUES (${esc(s.id)},${esc(s.medicationId)},${esc(s.time)},${esc(days)},${esc(s.isActive ?? true)});`;
}

function buildDoseLogInsert(d) {
  return `INSERT OR REPLACE INTO dose_logs (id,medication_id,schedule_id,scheduled_date,scheduled_time,status,taken_at,created_at,notes,skip_reason) VALUES (${esc(d.id)},${esc(d.medicationId)},${esc(d.scheduleId)},${esc(d.scheduledDate)},${esc(d.scheduledTime)},${esc(d.status)},${esc(d.takenAt)},${esc(d.createdAt)},${esc(d.notes)},${esc(d.skipReason)});`;
}

function buildAppointmentInsert(a) {
  const lat = a.locationCoords?.latitude ?? a.locationLat ?? null;
  const lng = a.locationCoords?.longitude ?? a.locationLng ?? null;
  return `INSERT OR REPLACE INTO appointments (id,title,doctor,location,location_lat,location_lng,notes,date,time,reminder_minutes,notification_id,created_at) VALUES (${esc(a.id)},${esc(a.title)},${esc(a.doctor)},${esc(a.location)},${esc(lat)},${esc(lng)},${esc(a.notes)},${esc(a.date)},${esc(a.time)},${esc(a.reminderMinutes)},${esc(a.notificationId)},${esc(a.createdAt)});`;
}

function buildHealthMeasurementInsert(h) {
  return `INSERT OR REPLACE INTO health_measurements (id,type,value1,value2,measured_at,notes,created_at) VALUES (${esc(h.id)},${esc(h.type)},${esc(h.value1)},${esc(h.value2)},${esc(h.measuredAt)},${esc(h.notes)},${esc(h.createdAt)});`;
}

function buildCheckinInsert(c) {
  const symptoms = Array.isArray(c.symptoms) ? JSON.stringify(c.symptoms) : (c.symptoms ?? '[]');
  return `INSERT OR REPLACE INTO daily_checkins (id,date,mood,symptoms,notes,created_at) VALUES (${esc(c.id)},${esc(c.date)},${esc(c.mood)},${esc(symptoms)},${esc(c.notes)},${esc(c.createdAt)});`;
}

// ─── Main ───────────────────────────────────────────────────

const raw = readFileSync(backupPath, 'utf-8');
const backup = JSON.parse(raw);
const data = backup.data || backup;

console.log('Pill O-Clock Seed Data Pusher');
console.log('=============================');
console.log(`  Source: ${backupPath}`);
console.log(`  Target: ${serial || '(auto-detect)'}`);

// Stop the app to release DB lock
console.log('\n  Stopping app...');
adbShell('am', 'force-stop', APP_PACKAGE);

// Verify sqlite3 is available
try {
  adbShell('run-as', APP_PACKAGE, 'sh', '-c', 'sqlite3 --version');
} catch {
  console.error('  ERROR: sqlite3 not found on device. Most emulator system images');
  console.error('  include sqlite3, but some production builds do not.');
  process.exit(1);
}

// Build all SQL statements
const statements = [];

// Clear existing seed data (anything with seed- prefix) first, then insert
statements.push(`DELETE FROM dose_logs WHERE id LIKE 'seed-%';`);
statements.push(`DELETE FROM schedules WHERE id LIKE 'seed-%';`);
statements.push(`DELETE FROM medications WHERE id LIKE 'seed-%';`);
statements.push(`DELETE FROM appointments WHERE id LIKE 'seed-%';`);
statements.push(`DELETE FROM health_measurements WHERE id LIKE 'seed-%';`);
statements.push(`DELETE FROM daily_checkins WHERE id LIKE 'seed-%';`);

const counts = {};

if (data.medications?.length) {
  counts.medications = data.medications.length;
  for (const m of data.medications) statements.push(buildMedicationInsert(m));
}
if (data.schedules?.length) {
  counts.schedules = data.schedules.length;
  for (const s of data.schedules) statements.push(buildScheduleInsert(s));
}
if (data.doseLogs?.length) {
  counts.doseLogs = data.doseLogs.length;
  for (const d of data.doseLogs) statements.push(buildDoseLogInsert(d));
}
if (data.appointments?.length) {
  counts.appointments = data.appointments.length;
  for (const a of data.appointments) statements.push(buildAppointmentInsert(a));
}
if (data.healthMeasurements?.length) {
  counts.healthMeasurements = data.healthMeasurements.length;
  for (const h of data.healthMeasurements) statements.push(buildHealthMeasurementInsert(h));
}
if (data.dailyCheckins?.length) {
  counts.dailyCheckins = data.dailyCheckins.length;
  for (const c of data.dailyCheckins) statements.push(buildCheckinInsert(c));
}

console.log('\n  Inserting seed data...');
for (const [table, count] of Object.entries(counts)) {
  console.log(`    ${table}: ${count} rows`);
}

try {
  runSqlBatch(statements);
  console.log(`\n  Done! ${statements.length} SQL statements executed.`);
} catch (err) {
  console.error(`\n  ERROR: SQL execution failed: ${err.message}`);
  console.error('  The app database may need to be initialized first (launch the app once).');
  process.exit(1);
}

// Restart the app
console.log('  Restarting app...');
adbShell('am', 'start', '-n', `${APP_PACKAGE}/.MainActivity`);
console.log('  App launched. Seed data is ready.');
