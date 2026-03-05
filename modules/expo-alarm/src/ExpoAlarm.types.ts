// ─── AlarmParams ──────────────────────────────────────────────────────────────

export interface AlarmParams {
  /** Schedule ID — used as part of the deterministic alarm request code. */
  scheduleId: string;
  medicationId: string;
  scheduledDate: string;
  /** HH:mm — displayed on the alarm screen. */
  scheduledTime: string;
  medicationName: string;
  /** Human-readable dose string, e.g. "500 mg" */
  dose: string;
  /** Exact fire time as a Unix timestamp in milliseconds. */
  fireTimestamp: number;
}
