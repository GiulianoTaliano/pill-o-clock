/**
 * Caregiver snapshot (F2 — local handoff, no accounts, no cloud).
 *
 * A compact one-page PDF a family member can receive by share-sheet when they
 * take over care for a few days: what to give and when, today's status, PRN
 * rules, low-stock and prescription-renewal warnings, 7-day adherence. It is
 * an OPERATIONAL handoff — the full historical report (pdfReport.ts) already
 * covers doctors' visits. 100% local by design; a machine-readable JSON
 * export stays in the parking lot until an import path exists.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { format, subDays } from "date-fns";
import { Medication, Schedule, DoseLog } from "../types";
import { getActiveMedications, getSchedulesByMedication, getDoseLogsByDateRange, getActiveAllergies } from "../db/database";
import i18n, { getDateLocale } from "../i18n";
import { toDateString } from "../utils";

function t(key: string, opts?: Record<string, unknown>): string {
  return i18n.t(key, opts) as string;
}

/** Minimum non-pending logs in the window before we show an adherence %. */
const MIN_LOGS_FOR_RATE = 3;

export interface SnapshotTodayDose {
  time: string;
  status: DoseLog["status"] | "unlogged";
}

export interface SnapshotMed {
  med: Medication;
  /** Active schedule times with their day sets (empty days = daily). */
  schedules: { time: string; days: number[] }[];
  /** Taken / (all non-pending logs) over the last 7 days; null = too little data. */
  adherence7d: number | null;
  /** Today's scheduled doses with their logged status. */
  today: SnapshotTodayDose[];
  lowStock: boolean;
}

export interface CaregiverSnapshot {
  regular: SnapshotMed[];
  prn: { med: Medication }[];
  /** Active profile's recorded allergies (F3) — names only. */
  allergyNames?: string[];
  generatedAt: string;
}

/** Pure core — testable without the database or native modules. */
export function computeCaregiverSnapshot(
  meds: Medication[],
  schedulesByMed: Map<string, Schedule[]>,
  logs: DoseLog[],
  now: Date
): CaregiverSnapshot {
  const todayStr = toDateString(now);
  const active = meds.filter((m) => m.isActive);

  const regular: SnapshotMed[] = active
    .filter((m) => !m.isPRN)
    .map((med) => {
      const scheds = (schedulesByMed.get(med.id) ?? []).filter((s) => s.isActive);
      const medLogs = logs.filter((l) => l.medicationId === med.id);

      const settled = medLogs.filter((l) => l.status !== "pending");
      const taken = settled.filter((l) => l.status === "taken").length;
      const adherence7d =
        settled.length >= MIN_LOGS_FOR_RATE ? taken / settled.length : null;

      const dow = now.getDay();
      const today: SnapshotTodayDose[] = scheds
        .filter((s) => s.days.length === 0 || s.days.includes(dow))
        .map((s) => {
          const log = medLogs.find(
            (l) => l.scheduledDate === todayStr && l.scheduledTime === s.time
          );
          return { time: s.time, status: log?.status ?? ("unlogged" as const) };
        })
        .sort((a, b) => a.time.localeCompare(b.time));

      const lowStock =
        med.stockQuantity != null &&
        med.stockAlertThreshold != null &&
        med.stockQuantity <= med.stockAlertThreshold;

      return {
        med,
        schedules: scheds.map((s) => ({ time: s.time, days: s.days })),
        adherence7d,
        today,
        lowStock,
      };
    });

  return {
    regular,
    prn: active.filter((m) => m.isPRN).map((med) => ({ med })),
    generatedAt: now.toISOString(),
  };
}

// ─── HTML rendering ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function daysLabel(days: number[]): string {
  if (days.length === 0) return t("snapshot.daily");
  return days.map((d) => t(`insights.weekday_${d}`)).join(", ");
}

function statusLabel(status: SnapshotTodayDose["status"]): string {
  return t(`snapshot.status_${status}`);
}

function medRow(s: SnapshotMed): string {
  const scheduleText = s.schedules
    .map((sc) => `${sc.time} · ${daysLabel(sc.days)}`)
    .join("<br/>");
  const todayText =
    s.today.length === 0
      ? t("snapshot.noDosesToday")
      : s.today.map((d) => `${d.time} — ${statusLabel(d.status)}`).join("<br/>");
  const adherence =
    s.adherence7d == null ? "—" : `${Math.round(s.adherence7d * 100)}%`;
  const warnings = [
    s.lowStock ? `⚠️ ${t("snapshot.lowStock", { qty: s.med.stockQuantity })}` : "",
    s.med.renewalDate
      ? `📄 ${t("snapshot.renewal", { date: s.med.renewalDate })}`
      : "",
  ]
    .filter(Boolean)
    .join("<br/>");

  return `<tr>
    <td><strong>${esc(s.med.name)}</strong><br/><span class="muted">${esc(s.med.dosage)}</span>${
      s.med.notes ? `<br/><span class="muted">${esc(s.med.notes)}</span>` : ""
    }</td>
    <td>${scheduleText || "—"}</td>
    <td>${todayText}</td>
    <td class="center">${adherence}</td>
    <td>${warnings || ""}</td>
  </tr>`;
}

function prnRow(med: Medication): string {
  const limits = [
    med.prnMaxPerDay != null ? t("snapshot.prnMax", { n: med.prnMaxPerDay }) : "",
    med.prnMinIntervalMinutes != null
      ? t("snapshot.prnInterval", { n: med.prnMinIntervalMinutes })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<tr>
    <td><strong>${esc(med.name)}</strong><br/><span class="muted">${esc(med.dosage)}</span>${
      med.notes ? `<br/><span class="muted">${esc(med.notes)}</span>` : ""
    }</td>
    <td>${limits || t("snapshot.prnNoLimits")}</td>
  </tr>`;
}

export function buildSnapshotHtml(snapshot: CaregiverSnapshot): string {
  const generated = format(new Date(snapshot.generatedAt), "PPPp", {
    locale: getDateLocale(),
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, Roboto, sans-serif; font-size: 12px; color: #0f172a; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 18px 0 6px; }
    .muted { color: #64748b; } .center { text-align: center; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 11px; }
    .footer { margin-top: 16px; font-size: 10px; color: #64748b; }
  </style></head><body>
  <h1>💊 ${t("snapshot.title")}</h1>
  <div class="muted">${t("snapshot.generatedAt", { date: generated })}</div>

  ${
    snapshot.allergyNames && snapshot.allergyNames.length > 0
      ? `<h2>${t("snapshot.sectionAllergies")}</h2>
        <div><strong>${snapshot.allergyNames.map(esc).join(", ")}</strong></div>`
      : ""
  }

  <h2>${t("snapshot.sectionRegular")}</h2>
  ${
    snapshot.regular.length === 0
      ? `<div class="muted">${t("snapshot.empty")}</div>`
      : `<table><tr>
          <th>${t("snapshot.colMed")}</th><th>${t("snapshot.colSchedule")}</th>
          <th>${t("snapshot.colToday")}</th><th>${t("snapshot.colAdherence")}</th>
          <th>${t("snapshot.colWarnings")}</th>
        </tr>${snapshot.regular.map(medRow).join("")}</table>`
  }

  ${
    snapshot.prn.length > 0
      ? `<h2>${t("snapshot.sectionPrn")}</h2>
        <table><tr><th>${t("snapshot.colMed")}</th><th>${t("snapshot.colPrnRules")}</th></tr>
        ${snapshot.prn.map((p) => prnRow(p.med)).join("")}</table>`
      : ""
  }

  <div class="footer">${t("snapshot.footer")}</div>
  </body></html>`;
}

// ─── Generation + share (mirrors pdfReport.ts, incl. cache cleanup) ────────

export async function generateAndShareCaregiverSnapshot(): Promise<void> {
  const now = new Date();
  const todayStr = toDateString(now);
  const fromStr = toDateString(subDays(now, 6));

  const meds = await getActiveMedications();
  const schedulesByMed = new Map<string, Schedule[]>();
  for (const m of meds) {
    if (m.isActive && !m.isPRN) {
      schedulesByMed.set(m.id, await getSchedulesByMedication(m.id));
    }
  }
  const logs = await getDoseLogsByDateRange(fromStr, todayStr);

  const allergyNames = (await getActiveAllergies()).map((a) => a.name);
  const snapshot = { ...computeCaregiverSnapshot(meds, schedulesByMed, logs, now), allergyNames };
  const html = buildSnapshotHtml(snapshot);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const FileSystem = await import("expo-file-system");
  const destUri = uri.replace(/[^/]+$/, `pilloclock-caregiver-${todayStr}.pdf`);
  let sharedUri = uri;
  try {
    await FileSystem.default.moveAsync({ from: uri, to: destUri });
    sharedUri = destUri;
  } catch {
    sharedUri = uri;
  }

  try {
    await Sharing.shareAsync(sharedUri, {
      mimeType: "application/pdf",
      dialogTitle: t("snapshot.title"),
      UTI: "com.adobe.pdf",
    });
  } finally {
    // The PDF holds the full regimen — don't let it linger in cache.
    try {
      await FileSystem.default.deleteAsync(sharedUri, { idempotent: true });
    } catch {
      /* ignore cleanup failure */
    }
  }
}
