import { requireNativeModule, Platform } from "expo-modules-core";

export interface WidgetData {
  /** Medication name of the next pending dose. Omit or pass null when allDone. */
  name?: string | null;
  /** Scheduled time as "HH:mm". */
  time?: string | null;
  /** Pass true when all doses for today are taken. */
  allDone?: boolean;
}

// On iOS / web the module doesn't exist — provide a no-op shim.
const ExpoWidget =
  Platform.OS === "android"
    ? requireNativeModule("ExpoWidget")
    : null;

/** Write next-dose data to the widget. Safe to call even when no widget is placed. */
export function updateWidget(data: WidgetData): Promise<void> {
  return ExpoWidget?.updateWidget(data) ?? Promise.resolve();
}

/** Returns true if at least one widget instance is placed on the home screen. */
export function isWidgetAvailable(): Promise<boolean> {
  return ExpoWidget?.isAvailable() ?? Promise.resolve(false);
}
