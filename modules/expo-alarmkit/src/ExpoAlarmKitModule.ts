import { requireOptionalNativeModule } from "expo-modules-core";

/** AlarmKit authorization, plus "unsupported" for iOS < 26 / no module. */
export type AlarmKitAuthorization =
  | "notDetermined"
  | "authorized"
  | "denied"
  | "unsupported";

export interface AlarmKitAlarm {
  /** UUID string. The caller keeps it to cancel the alarm later. */
  id: string;
  /** Fire instant, epoch milliseconds. */
  fireTimestamp: number;
  /** Text on the system alarm (Lock Screen / Dynamic Island). */
  title: string;
  /**
   * Label of the button that silences the alarm (iOS 26.0; from 26.1 the
   * system draws its own). There is deliberately no secondary button: it
   * would need App Intents in the app target. The dose notification keeps
   * the Take / Snooze / Skip actions.
   */
  stopLabel: string;
  /** Hex tint for the alarm UI, e.g. "#2f7de1". */
  tintColor?: string;
  /** Sound file bundled with the app (e.g. "alarm.wav"); system sound if absent. */
  soundName?: string;
}

/**
 * Low-level native declaration. Prefer `./index`, which adds platform guards.
 * requireOptionalNativeModule returns null on Android/web, so importing this
 * never crashes there.
 */
interface ExpoAlarmKitNativeModule {
  /** True only on iOS 26+ (AlarmKit present). */
  isSupported(): boolean;
  getAuthorizationStatus(): Promise<AlarmKitAuthorization>;
  requestAuthorization(): Promise<AlarmKitAuthorization>;
  schedule(alarm: AlarmKitAlarm): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  getScheduledIds(): Promise<string[]>;
}

export default requireOptionalNativeModule<ExpoAlarmKitNativeModule>(
  "ExpoAlarmKit"
);
