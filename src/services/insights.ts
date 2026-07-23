/**
 * On-device adherence insights (F2) — pure computation over local history.
 *
 * Honesty thresholds everywhere: an insight is only produced when there is
 * enough data AND the signal is meaningful (see constants). With thin data
 * everything returns null and the UI hides the card entirely — no noise,
 * no fake certainty. The mood link is an OBSERVATION, never causation.
 */
import { DoseLog, Medication, DailyCheckin } from "../types";

// Minimum evidence requirements.
const MIN_TOTAL_DOSES = 10;
const MIN_BUCKET_DOSES = 5;
const MIN_WEEKDAY_DOSES = 3;
const MIN_MED_DOSES = 5;
const MIN_MOOD_DAYS = 5;
/** A bucket must underperform the overall rate by ≥ this many points. */
const MEANINGFUL_GAP = 0.15;
const LOW_MED_RATE = 0.8;
const MIN_MOOD_DIFF = 0.5;

export type TimeBand = "morning" | "afternoon" | "night";

export interface TimeBandInsight { band: TimeBand; rate: number; total: number }
export interface WeekdayInsight { weekday: number; rate: number; total: number }
export interface MedAdherenceInsight { name: string; rate: number; taken: number; total: number }
export interface MoodInsight {
  avgFullDays: number;
  avgMissedDays: number;
  fullDays: number;
  missedDays: number;
}

export interface AdherenceInsights {
  /** null when there isn't enough history to say anything. */
  overallRate: number | null;
  totalDoses: number;
  worstBand: TimeBandInsight | null;
  worstWeekday: WeekdayInsight | null;
  /** Up to 2 meds under LOW_MED_RATE, worst first. */
  lowMeds: MedAdherenceInsight[];
  mood: MoodInsight | null;
}

function bandOf(scheduledTime: string): TimeBand {
  const h = Number(scheduledTime.split(":")[0]);
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 19) return "afternoon";
  return "night";
}

function weekdayOf(scheduledDate: string): number {
  const [y, m, d] = scheduledDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

interface Bucket { taken: number; total: number }
const rate = (b: Bucket) => (b.total > 0 ? b.taken / b.total : 0);
const bump = (map: Map<string | number, Bucket>, key: string | number, taken: boolean) => {
  const b = map.get(key) ?? { taken: 0, total: 0 };
  b.total += 1;
  if (taken) b.taken += 1;
  map.set(key, b);
};

export function computeInsights(
  logs: DoseLog[],
  medications: Medication[],
  checkins: DailyCheckin[]
): AdherenceInsights {
  // Only resolved doses count — pending says nothing about behaviour.
  const resolved = logs.filter(
    (l) => l.status === "taken" || l.status === "skipped" || l.status === "missed"
  );
  const empty: AdherenceInsights = {
    overallRate: null,
    totalDoses: resolved.length,
    worstBand: null,
    worstWeekday: null,
    lowMeds: [],
    mood: null,
  };
  if (resolved.length < MIN_TOTAL_DOSES) return empty;

  const takenCount = resolved.filter((l) => l.status === "taken").length;
  const overall = takenCount / resolved.length;

  // ── Time-of-day pattern ──────────────────────────────────────────────────
  const bands = new Map<string | number, Bucket>();
  for (const l of resolved) bump(bands, bandOf(l.scheduledTime), l.status === "taken");
  let worstBand: TimeBandInsight | null = null;
  for (const [band, b] of bands) {
    if (b.total < MIN_BUCKET_DOSES) continue;
    const r = rate(b);
    if (r <= overall - MEANINGFUL_GAP && (!worstBand || r < worstBand.rate)) {
      worstBand = { band: band as TimeBand, rate: r, total: b.total };
    }
  }

  // ── Weekday pattern ──────────────────────────────────────────────────────
  const days = new Map<string | number, Bucket>();
  for (const l of resolved) bump(days, weekdayOf(l.scheduledDate), l.status === "taken");
  let worstWeekday: WeekdayInsight | null = null;
  for (const [wd, b] of days) {
    if (b.total < MIN_WEEKDAY_DOSES) continue;
    const r = rate(b);
    if (r <= overall - MEANINGFUL_GAP && (!worstWeekday || r < worstWeekday.rate)) {
      worstWeekday = { weekday: wd as number, rate: r, total: b.total };
    }
  }

  // ── Per-medication adherence ─────────────────────────────────────────────
  const byMed = new Map<string | number, Bucket>();
  for (const l of resolved) bump(byMed, l.medicationId, l.status === "taken");
  const nameById = new Map(medications.map((m) => [m.id, m.name]));
  const lowMeds: MedAdherenceInsight[] = Array.from(byMed.entries())
    .filter(([, b]) => b.total >= MIN_MED_DOSES && rate(b) < LOW_MED_RATE)
    .map(([id, b]) => ({
      name: nameById.get(id as string) ?? String(id),
      rate: rate(b),
      taken: b.taken,
      total: b.total,
    }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 2);

  // ── Mood observation (full-adherence days vs days with a missed dose) ────
  let mood: MoodInsight | null = null;
  const moodByDate = new Map(checkins.map((c) => [c.date, c.mood]));
  const byDate = new Map<string, { anyMissed: boolean; allTaken: boolean }>();
  for (const l of resolved) {
    const e = byDate.get(l.scheduledDate) ?? { anyMissed: false, allTaken: true };
    if (l.status === "missed") e.anyMissed = true;
    if (l.status !== "taken") e.allTaken = false;
    byDate.set(l.scheduledDate, e);
  }
  const fullMoods: number[] = [];
  const missedMoods: number[] = [];
  for (const [date, e] of byDate) {
    const m = moodByDate.get(date);
    if (m == null) continue;
    if (e.allTaken) fullMoods.push(m);
    else if (e.anyMissed) missedMoods.push(m);
  }
  if (fullMoods.length >= MIN_MOOD_DAYS && missedMoods.length >= MIN_MOOD_DAYS) {
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const avgFull = avg(fullMoods);
    const avgMissed = avg(missedMoods);
    if (Math.abs(avgFull - avgMissed) >= MIN_MOOD_DIFF) {
      mood = {
        avgFullDays: Math.round(avgFull * 10) / 10,
        avgMissedDays: Math.round(avgMissed * 10) / 10,
        fullDays: fullMoods.length,
        missedDays: missedMoods.length,
      };
    }
  }

  return {
    overallRate: overall,
    totalDoses: resolved.length,
    worstBand,
    worstWeekday,
    lowMeds,
    mood,
  };
}
