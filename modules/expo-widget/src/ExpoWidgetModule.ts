import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export interface WidgetData {
  name?: string | null;
  time?: string | null;
  allDone?: boolean;
  title?: string;
  subtitle?: string;
  profile?: string;
  date?: string;
  fallbackText?: string;
}
const ExpoWidget =
  Platform.OS === "android" ? requireOptionalNativeModule("ExpoWidget") : null;
export function updateWidget(data: WidgetData): Promise<void> {
  return ExpoWidget?.updateWidget(data) ?? Promise.resolve();
}
export function isWidgetAvailable(): Promise<boolean> {
  return ExpoWidget?.isAvailable() ?? Promise.resolve(false);
}
