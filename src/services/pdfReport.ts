import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { format } from "date-fns";
import { Medication, DoseLog, HealthMeasurement, DailyCheckin, MeasurementType } from "../types";
import { getDoseLogsByDateRange, getHealthMeasurements, getDailyCheckins } from "../db/database";
import { getMedications } from "../db/database";
import i18n from "../i18n";
import { today, toDateString } from "../utils";
import { addDays } from "date-fns";
import { getDateLocale } from "../i18n";

// ─── Helpers ───────────────────────────────────────────────────────────────

function t(key: string, opts?: Record<string, unknown>): string {
  return i18n.t(key, opts) as string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return format(d, "PPP", { locale: getDateLocale() });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return format(d, "Pp", { locale: getDateLocale() });
  } catch {
    return iso;
  }
}

function formatMeasurementValue(m: HealthMeasurement): string {
  const type = m.type as MeasurementType;
  const unitKey = `health.${type}_unit` as const;
  const unit = t(unitKey);
  if (type === "blood_pressure" && m.value2 != null) {
    return `${m.value1}/${m.value2} ${unit}`;
  }
  return `${m.value1} ${unit}`;
}

const MOOD_EMOJIS: Record<number, string> = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };
const MOOD_LABELS: Record<number, string> = {
  1: "mood_1", 2: "mood_2", 3: "mood_3", 4: "mood_4", 5: "mood_5"
};

// ─── HTML Template ─────────────────────────────────────────────────────────

function buildHtml(
  medications: Medication[],
  logs: DoseLog[],
  measurements: HealthMeasurement[],
  checkins: DailyCheckin[],
  generatedAt: string
): string {
  const activeMeds = medications.filter((m) => m.isActive);

  // Group logs by date
  const logsByDate: Record<string, DoseLog[]> = {};
  for (const log of logs) {
    if (!logsByDate[log.scheduledDate]) logsByDate[log.scheduledDate] = [];
    logsByDate[log.scheduledDate].push(log);
  }

  // Group measurements by type
  const measurementsByType: Partial<Record<MeasurementType, HealthMeasurement[]>> = {};
  for (const m of measurements) {
    if (!measurementsByType[m.type]) measurementsByType[m.type] = [];
    measurementsByType[m.type]!.push(m);
  }

  const medsRows = activeMeds.length > 0
    ? activeMeds.map((m) => `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td>${m.dosage}</td>
        <td>${t(`categories.${m.category}`)}</td>
        <td>${m.notes ?? "—"}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">${t("report.noData")}</td></tr>`;

  const logDates = Object.keys(logsByDate).sort().reverse();
  const logsHtml = logDates.length > 0
    ? logDates.map((date) => {
        const dayRows = logsByDate[date]
          .map((log) => {
            const statusIcon = log.status === "taken" ? "✅" : log.status === "skipped" ? "❌" : "⏱";
            const med = activeMeds.find((m) => m.id === log.medicationId);
            return `<tr>
              <td>${log.scheduledTime}</td>
              <td>${med?.name ?? log.medicationId}</td>
              <td>${statusIcon} ${t(`status.${log.status}`)}</td>
              <td>${log.notes ?? "—"}</td>
            </tr>`;
          })
          .join("");
        return `<tr class="date-header"><td colspan="4">${formatDate(date + "T12:00")}</td></tr>${dayRows}`;
      }).join("")
    : `<tr><td colspan="4" class="empty">${t("report.noData")}</td></tr>`;

  const types: MeasurementType[] = ["blood_pressure", "glucose", "weight", "spo2", "heart_rate"];
  const healthHtml = types
    .filter((type) => (measurementsByType[type]?.length ?? 0) > 0)
    .map((type) => {
      const items = (measurementsByType[type] ?? []).slice(0, 20);
      const typeName = t(`health.${type}_name`);
      const rows = items.map((m) => `<tr>
        <td>${formatDateTime(m.measuredAt)}</td>
        <td><strong>${formatMeasurementValue(m)}</strong></td>
        <td>${m.notes ?? "—"}</td>
      </tr>`).join("");
      return `<h3 class="sub-section">${typeName}</h3>
        <table><thead><tr>
          <th>${t("health.fieldDate")} / ${t("health.fieldTime")}</th>
          <th>${t("health.latestValue")}</th>
          <th>${t("health.fieldNotes")}</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
    }).join("") || `<p class="empty">${t("report.noData")}</p>`;

  const checkinsHtml = checkins.length > 0
    ? `<table><thead><tr>
        <th>${t("health.fieldDate")}</th>
        <th>${t("checkin.moodLabel")}</th>
        <th>${t("checkin.symptomsLabel")}</th>
        <th>${t("health.fieldNotes")}</th>
      </tr></thead><tbody>` +
      checkins.slice(0, 30).map((c) => {
        const symptomLabels = c.symptoms
          .map((s) => t(`checkin.symptom_${s}`))
          .join(", ") || "—";
        return `<tr>
          <td>${formatDate(c.date + "T12:00")}</td>
          <td>${MOOD_EMOJIS[c.mood]} ${t(`checkin.${MOOD_LABELS[c.mood]}`)}</td>
          <td>${symptomLabels}</td>
          <td>${c.notes ?? "—"}</td>
        </tr>`;
      }).join("") +
      `</tbody></table>`
    : `<p class="empty">${t("report.noData")}</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
    .header { border-bottom: 3px solid #4f9cff; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; color: #4f9cff; }
    .header p { color: #64748b; margin-top: 4px; font-size: 11px; }
    h2 { font-size: 15px; color: #1e293b; margin: 24px 0 10px; padding: 8px 12px;
         background: #f1f5f9; border-left: 4px solid #4f9cff; border-radius: 4px; }
    h3.sub-section { font-size: 13px; color: #475569; margin: 14px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #f8fafc; color: #475569; font-size: 10px; text-transform: uppercase;
         letter-spacing: 0.5px; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px; vertical-align: top; }
    tr.date-header td { background: #e0f2fe; color: #0369a1; font-weight: bold; padding: 4px 8px; font-size: 11px; }
    .empty { color: #94a3b8; font-style: italic; padding: 12px 0; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0;
               color: #94a3b8; font-size: 10px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💊 ${t("report.sectionTitle")}</h1>
    <p>${t("report.generatedBy")} · ${generatedAt}</p>
    <p>${t("report.privacyNote")}</p>
  </div>

  <h2>💊 ${t("report.sectionMeds")}</h2>
  <table>
    <thead><tr>
      <th>${t("form.fieldName")}</th>
      <th>${t("form.fieldDoseAmount")}</th>
      <th>${t("form.fieldCategory")}</th>
      <th>${t("form.fieldNotes")}</th>
    </tr></thead>
    <tbody>${medsRows}</tbody>
  </table>

  <h2>📋 ${t("report.sectionHistory")}</h2>
  <table>
    <thead><tr>
      <th>${t("health.fieldTime")}</th>
      <th>${t("form.fieldName")}</th>
      <th>${t("history.adherenceLabel")}</th>
      <th>${t("doseCard.noteModalTitle")}</th>
    </tr></thead>
    <tbody>${logsHtml}</tbody>
  </table>

  <h2>❤️ ${t("report.sectionHealth")}</h2>
  ${healthHtml}

  <h2>🌡 ${t("report.sectionDiary")}</h2>
  ${checkinsHtml}

  <div class="footer">
    <span>${t("report.generatedBy")}</span>
    <span>${t("report.privacyNote")}</span>
  </div>
</body>
</html>`;
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function generateAndShareReport(): Promise<void> {
  const todayStr = today();
  const fromStr = toDateString(addDays(new Date(), -30));
  const generatedAt = formatDateTime(new Date().toISOString());

  const [medications, logs, measurements, checkins] = await Promise.all([
    getMedications(),
    getDoseLogsByDateRange(fromStr, todayStr),
    getHealthMeasurements(),
    getDailyCheckins(),
  ]);

  const html = buildHtml(medications, logs, measurements, checkins, generatedAt);

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const filename = `pilloclock-report-${todayStr}.pdf`;
  const destUri = uri.replace(/[^/]+$/, filename);

  // Rename the file for a friendly share name (not critical if it fails)
  try {
    const FileSystem = await import("expo-file-system");
    await FileSystem.default.moveAsync({ from: uri, to: destUri });
    await Sharing.shareAsync(destUri, {
      mimeType: "application/pdf",
      dialogTitle: t("report.sectionTitle"),
      UTI: "com.adobe.pdf",
    });
  } catch {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: t("report.sectionTitle"),
      UTI: "com.adobe.pdf",
    });
  }
}
