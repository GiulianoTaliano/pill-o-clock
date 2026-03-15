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

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_PACKAGE = 'com.pilloclock.app';
const DB_NAME = 'pilloclock.db';
// Expo SQLite stores databases under files/SQLite/, not databases/
const DB_REL_PATH = `files/SQLite/${DB_NAME}`;
const DEVICE_TMP = '/data/local/tmp';

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
  const escaped = sql.replace(/'/g, "'\\''");
  return adbShell('run-as', APP_PACKAGE, 'sh', '-c',
    `sqlite3 '${DB_REL_PATH}' '${escaped}'`
  );
}

function runSqlBatch(statements) {
  const batchSize = 20;
  for (let i = 0; i < statements.length; i += batchSize) {
    const batch = statements.slice(i, i + batchSize).join('\n');
    const escaped = batch.replace(/'/g, "'\\''");
    adbShell('run-as', APP_PACKAGE, 'sh', '-c',
      `sqlite3 '${DB_REL_PATH}' '${escaped}'`
    );
  }
}

// ─── Device vs Host sqlite3 detection ───────────────────────

function hasDeviceSqlite3() {
  try {
    adbShell('run-as', APP_PACKAGE, 'sh', '-c', 'sqlite3 --version');
    return true;
  } catch {
    return false;
  }
}

function findHostSqlite3() {
  const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const result = execFileSync(cmd, ['sqlite3'], { encoding: 'utf-8', timeout: 5000 });
    return result.trim().split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

// ─── Host-based SQL execution (pull DB → modify → push back) ─

function adbArgs() {
  return serial ? ['-s', serial] : [];
}

function pullDbToHost(localDir) {
  const mainDb = join(localDir, DB_NAME);
  const tmpRemote = `${DEVICE_TMP}/${DB_NAME}_seed_pull`;

  // Copy from app sandbox to /data/local/tmp/ via device-side redirect
  adbShell(`run-as ${APP_PACKAGE} cat ${DB_REL_PATH} > ${tmpRemote}`);
  adb('pull', tmpRemote, mainDb);

  // Pull WAL and SHM if they exist (schema/data may live in WAL)
  for (const suffix of ['-wal', '-shm']) {
    try {
      const remoteTmp = `${tmpRemote}${suffix}`;
      adbShell(`run-as ${APP_PACKAGE} cat ${DB_REL_PATH}${suffix} > ${remoteTmp}`);
      adb('pull', remoteTmp, mainDb + suffix);
      adbShell('rm', '-f', remoteTmp);
    } catch { /* file may not exist */ }
  }

  adbShell('rm', '-f', tmpRemote);
  return mainDb;
}

function pushDbToDevice(localDbPath) {
  const remoteTmp = `${DEVICE_TMP}/${DB_NAME}_seed_push`;

  adb('push', localDbPath, remoteTmp);
  adbShell('chmod', '644', remoteTmp);
  // Copy into app sandbox via run-as (app user can read from /data/local/tmp/)
  adbShell(`run-as ${APP_PACKAGE} sh -c 'cat ${remoteTmp} > ${DB_REL_PATH}'`);
  // Remove stale WAL/SHM — the app will recreate them on next launch
  adbShell(`run-as ${APP_PACKAGE} rm -f ${DB_REL_PATH}-wal ${DB_REL_PATH}-shm`);
  adbShell('rm', '-f', remoteTmp);
}

function runSqlBatchViaHost(statements, sqlite3Bin) {
  const localDir = tmpdir();
  console.log('  Using host sqlite3 (device binary not available)');

  // Pull the database (+ WAL) from the device
  const localDb = pullDbToHost(localDir);

  // Write all SQL to a temp file with explicit UTF-8 encoding, then feed via
  // stdin.  Passing SQL as CLI args goes through Windows codepage conversion
  // (typically CP-1252), which corrupts non-ASCII characters (á, ñ, ó, etc.).
  // Using stdin with a Buffer bypasses this entirely.
  const sqlFile = join(localDir, 'seed-batch.sql');
  writeFileSync(sqlFile, statements.join('\n') + '\n', 'utf-8');
  execFileSync(sqlite3Bin, [localDb], {
    input: readFileSync(sqlFile),
    timeout: 30000,
  });

  // Checkpoint WAL into main DB so we only need to push one file
  execFileSync(sqlite3Bin, [localDb], {
    input: Buffer.from('PRAGMA wal_checkpoint(TRUNCATE);\n', 'utf-8'),
    timeout: 10000,
  });

  // Push the modified database back
  pushDbToDevice(localDb);

  // Clean up local temp files
  try { unlinkSync(sqlFile); } catch { /* ignore */ }
  for (const suffix of ['', '-wal', '-shm']) {
    try { unlinkSync(localDb + suffix); } catch { /* ignore */ }
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

// Determine sqlite3 strategy: device binary or host binary
const useDeviceSqlite = hasDeviceSqlite3();
let hostSqlite3 = null;
if (!useDeviceSqlite) {
  hostSqlite3 = findHostSqlite3();
  if (!hostSqlite3) {
    console.error('  ERROR: sqlite3 not found on device or host.');
    console.error('  Install sqlite3 or use an emulator image that includes it.');
    console.error('  On Windows, sqlite3 is often bundled with Android SDK platform-tools.');
    process.exit(1);
  }
  console.log(`  Device sqlite3: not available (API 36+ emulator)`);
  console.log(`  Host sqlite3:   ${hostSqlite3}`);
} else {
  console.log('  Using device sqlite3');
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
  if (useDeviceSqlite) {
    runSqlBatch(statements);
  } else {
    runSqlBatchViaHost(statements, hostSqlite3);
  }
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
