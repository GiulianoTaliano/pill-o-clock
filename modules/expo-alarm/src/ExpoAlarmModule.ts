import { requireOptionalNativeModule } from "expo-modules-core";
import type { AlarmParams } from "./ExpoAlarm.types";

/**
 * Low-level native module declaration.
 * Prefer importing from `./index` which adds platform guards.
 *
 * requireOptionalNativeModule returns null when the native module is absent
 * (i.e. on iOS/web), preventing an import-time crash.
 */
interface ExpoAlarmNativeModule {
  scheduleAlarm(params: AlarmParams): Promise<void>;
  cancelAlarm(scheduleId: string, scheduledDate: string): Promise<void>;
  stopAlarm(): Promise<void>;
  checkFullScreenIntentPermission(): Promise<boolean>;
}

export default requireOptionalNativeModule<ExpoAlarmNativeModule>("ExpoAlarm");
