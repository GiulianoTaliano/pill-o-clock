import { storage } from "../storage";
import { format, subDays } from "date-fns";

const KEY = "pilloclock:snoozed_doses_v1";

export function loadSnoozedDoses(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage.getString(KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const oldest = format(subDays(new Date(), 1), "yyyy-MM-dd");
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          key.slice(-10) >= oldest &&
          typeof value === "string" &&
          (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ||
            Number.isFinite(new Date(value).getTime()))
      )
    );
  } catch {
    return {};
  }
}

export function saveSnoozedDoses(values: Record<string, string>): void {
  storage.set(KEY, JSON.stringify(values));
}
