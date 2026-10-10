import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { format, subDays } from "date-fns";
import type {
  Medication,
  DoseLog,
  HealthMeasurement,
  DailyCheckin,
  Schedule,
  Allergy,
} from "../types";
import {
  getDoseLogsByDateRange,
  getActiveHealthMeasurements,
  getActiveDailyCheckins,
  getActiveMedications,
  getSchedulesByMedication,
  getProfiles,
  getActiveAllergies,
} from "../db/database";
import i18n, { getDateLocale } from "../i18n";
import { toDateString } from "../utils";
import {
  describeMedicationPlan,
  escapeHtml,
  isMedicationCurrent,
} from "./carePlan";
import { getActiveProfileId } from "./profileStore";

export interface ReportOptions {
  from?: string;
  to?: string;
  sections?: {
    medications: boolean;
    logs: boolean;
    measurements: boolean;
    checkins: boolean;
  };
}
export interface ReportData {
  displayName: string;
  profileId: string;
  from: string;
  to: string;
  generatedAt: string;
  medications: Medication[];
  schedules: Map<string, Schedule[]>;
  logs: DoseLog[];
  measurements: HealthMeasurement[];
  checkins: DailyCheckin[];
  allergies: Allergy[];
}
const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts) as string;
const text = (value: unknown) => escapeHtml(value).replace(/\r?\n/g, "<br/>");
const dateLabel = (date: string) =>
  format(new Date(`${date}T12:00`), "PPP", { locale: getDateLocale() });
const timestamp = (iso: string) =>
  format(new Date(iso), "Pp", { locale: getDateLocale() });

export async function collectReportData(
  options: ReportOptions = {}
): Promise<ReportData> {
  const from = options.from ?? toDateString(subDays(new Date(), 29));
  const to = options.to ?? toDateString(new Date());
  const validDate = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    !Number.isNaN(new Date(`${d}T12:00`).getTime()) &&
    toDateString(new Date(`${d}T12:00`)) === d;
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error(t("uxHealth.reportRangeError"));
  const profileId = getActiveProfileId();
  const [profiles, medications, allLogs, measurements, checkins, allergies] =
    await Promise.all([
      getProfiles(),
      getActiveMedications(),
      getDoseLogsByDateRange(from, to),
      getActiveHealthMeasurements(undefined, 0),
      getActiveDailyCheckins(from, to, 0),
      getActiveAllergies(),
    ]);
  const ids = new Set(medications.map((m) => m.id));
  const schedules = new Map(
    await Promise.all(
      medications.map(
        async (m) => [m.id, await getSchedulesByMedication(m.id)] as const
      )
    )
  );
  if (getActiveProfileId() !== profileId)
    throw new Error(t("uxHealth.profileRequired"));
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(t("uxHealth.profileRequired"));
  return {
    displayName: profile.name || t("profiles.me"),
    profileId,
    from,
    to,
    generatedAt: new Date().toISOString(),
    medications,
    schedules,
    logs: allLogs.filter((l) => ids.has(l.medicationId)),
    measurements: measurements.filter((m) => {
      const d = toDateString(new Date(m.measuredAt));
      return d >= from && d <= to;
    }),
    checkins,
    allergies,
  };
}

/** Every dynamic cell is escaped. Historical records keep archived medication names. */
export function buildReportHtml(
  data: ReportData,
  options: ReportOptions = {}
): string {
  const sections = options.sections ?? {
    medications: true,
    logs: true,
    measurements: true,
    checkins: true,
  };
  const table = (headers: string[], rows: string[][]) =>
    `<table><thead><tr>${headers
      .map((h) => `<th>${text(h)}</th>`)
      .join("")}</tr></thead><tbody>${
      rows.length
        ? rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell) => `<td>${text(cell)}</td>`)
                  .join("")}</tr>`
            )
            .join("")
        : `<tr><td colspan="${headers.length}">${text(
            t("report.noData")
          )}</td></tr>`
    }</tbody></table>`;
  const title = (label: string) => `<h2>${text(label)}</h2>`;
  const medMap = new Map(data.medications.map((m) => [m.id, m]));
  const active = data.medications.filter((m) => isMedicationCurrent(m));
  const meds = sections.medications
    ? title(t("uxHealth.reportMedication")) +
      table(
        [t("form.fieldName"), t("uxHealth.plan"), t("uxHealth.note")],
        active.map((m) => [
          m.name,
          describeMedicationPlan(m, data.schedules.get(m.id) ?? [], t),
          m.notes ?? "—",
        ])
      ) +
      title(t("emergency.allergies")) +
      `<p>${text(
        data.allergies.length
          ? data.allergies.map((a) => a.name).join(", ")
          : `${t("uxHealth.unknownAllergies")}. ${t(
              "uxHealth.unknownAllergiesHint"
            )}`
      )}</p>`
    : "";
  const logs = sections.logs
    ? title(t("uxHealth.reportLogs")) +
      table(
        [
          t("health.fieldDate"),
          t("form.fieldName"),
          t("health.fieldTime"),
          t("uxHealth.recorded"),
          t("uxHealth.note"),
        ],
        data.logs.map((l) => [
          dateLabel(l.scheduledDate),
          medMap.get(l.medicationId)?.name ?? t("uxHealth.unknownMedication"),
          l.scheduledTime,
          `${t(`status.${l.status}`)}${
            l.takenAt ? ` · ${timestamp(l.takenAt)}` : ""
          }`,
          [
            l.notes,
            l.skipReason ? t(`doseCard.skipReason_${l.skipReason}`) : "",
            l.injectionSite
              ? t(`sites.${l.injectionSite}`, { defaultValue: l.injectionSite })
              : "",
          ]
            .filter(Boolean)
            .join(" · ") || "—",
        ])
      )
    : "";
  const measurements = sections.measurements
    ? title(t("uxHealth.reportMeasurements")) +
      table(
        [
          t("health.fieldDate"),
          t("health.tabMeasurements"),
          t("health.latestValue"),
          t("uxHealth.note"),
        ],
        data.measurements.map((m) => [
          timestamp(m.measuredAt),
          t(`health.${m.type}_name`),
          `${m.value1}${m.value2 != null ? `/${m.value2}` : ""} ${t(
            `health.${m.type}_unit`
          )}`,
          m.notes ?? "—",
        ])
      )
    : "";
  const checkins = sections.checkins
    ? title(t("uxHealth.reportDiary")) +
      table(
        [
          t("health.fieldDate"),
          t("checkin.moodLabel"),
          t("checkin.symptomsLabel"),
          t("uxHealth.note"),
        ],
        data.checkins.map((c) => [
          dateLabel(c.date),
          t(`checkin.mood_${c.mood}`),
          c.symptoms
            .map((s) =>
              t(`checkin.symptom_${s}`, { defaultValue: s.replace(/_/g, " ") })
            )
            .join(", ") || t("uxHealth.noSymptoms"),
          c.notes ?? "—",
        ])
      )
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    @page { margin: 28px; } * { box-sizing: border-box; } body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; color: #17263c; }
    header { border-bottom: 3px solid #2459c4; padding-bottom: 16px; } h1 { font-size: 24px; margin-bottom: 8px; } h2 { font-size: 16px; margin-top: 24px; break-after: avoid; }
    p { line-height: 1.6; } .muted { color: #52647c; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } thead { display: table-header-group; } tr { break-inside: avoid; }
    th { background: #edf2f9; text-align: left; font-size: 11px; } td,th { padding: 8px; border-bottom: 1px solid #d9e2ef; vertical-align: top; overflow-wrap: anywhere; }
    footer { margin-top: 24px; color: #52647c; font-size: 10px; }
  </style></head><body><header><h1>${text(
    t("report.sectionTitle")
  )}</h1><p><strong>${text(t("uxHealth.patient"))}: ${text(
    data.displayName
  )}</strong><br/>${text(t("uxHealth.period"))}: ${text(
    dateLabel(data.from)
  )} — ${text(dateLabel(data.to))}<br/><span class="muted">${text(
    t("uxHealth.exportDate", { date: timestamp(data.generatedAt) })
  )}</span></p></header>${meds}${logs}${measurements}${checkins}<footer>${text(
    t("report.privacyNote")
  )} · ${text(t("report.generatedBy"))}</footer></body></html>`;
}

export async function generateAndShareReport(
  options: ReportOptions = {}
): Promise<void> {
  const data = await collectReportData(options);
  const { uri } = await Print.printToFileAsync({
    html: buildReportHtml(data, options),
    base64: false,
  });
  const person =
    data.displayName.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "profile";
  const dest = uri.replace(
    /[^/]+$/,
    `pilloclock-${person}-${data.from}-${data.to}.pdf`
  );
  let sharedUri = uri;
  try {
    await FileSystem.moveAsync({ from: uri, to: dest });
    sharedUri = dest;
  } catch {
    /* Friendly filename is optional. */
  }
  try {
    if (getActiveProfileId() !== data.profileId)
      throw new Error(t("uxHealth.profileChanged"));
    await Sharing.shareAsync(sharedUri, {
      mimeType: "application/pdf",
      dialogTitle: t("report.sectionTitle"),
      UTI: "com.adobe.pdf",
    });
  } finally {
    try {
      await FileSystem.deleteAsync(sharedUri, { idempotent: true });
    } catch {
      /* Best effort cache cleanup. */
    }
  }
}
