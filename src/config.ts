/**
 * JS-accessible Google Maps / Places API key.
 *
 * This is the same key injected into native code by the react-native-maps
 * config plugin in app.json (plugins → react-native-maps):
 *   Android: injects into AndroidManifest.xml meta-data (Maps SDK for Android)
 *   iOS    : injects into AppDelegate via [GMSServices provideAPIKey:...]
 *            (Maps SDK for iOS)
 *
 * Required APIs in Google Cloud Console for this key:
 *   • Maps SDK for Android  (native MapView tiles on Android)
 *   • Maps SDK for iOS      (native MapView tiles on iOS via PROVIDER_GOOGLE)
 *   • Places API            (autocomplete + place details in LocationPickerModal)
 *   • Geocoding API         (optional — expo-location uses the device geocoder otherwise)
 *
 * Platform note: the same key is used for both platforms here for simplicity.
 * In production, consider restricting each key by platform (bundle ID / SHA-1)
 * in the Google Cloud Console to reduce abuse risk.
 *
 * ⚠️  Do NOT commit a production key to public source control.
 *     For open-source projects use an environment variable instead.
 */
// Baked into the JS bundle at build time by Metro (Expo reads EXPO_PUBLIC_* from .env.local).
// For CI/EAS builds, set this as an EAS Secret in the Expo dashboard.
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// ─── Centralized storage keys (MMKV / AsyncStorage) ──────────────────────

export const STORAGE_KEYS = {
  THEME_MODE:               "@pilloclock/theme_mode",
  LANGUAGE:                 "@pilloclock/language",
  ONBOARDING_DONE:          "@pilloclock/onboarding_done",
  TOUR_DONE:                "@pilloclock/tour_done",
  TIP_RESCHEDULE_SEEN:      "@pilloclock/tip_reschedule_seen",
  CHECKIN_DISMISSED_DATE:   "@pilloclock/checkin_dismissed_date",
  FIRST_LAUNCH:             "@pilloclock/first_launch",
  DOSES_TAKEN_COUNT:        "@pilloclock/doses_taken_count",
  REVIEW_PROMPTED:          "@pilloclock/review_prompted",
  EXACT_ALARM_PROMPTED:     "@pilloclock/exact_alarm_prompted",
  FULLSCREEN_INTENT_PROMPTED: "@pilloclock/fullscreen_intent_prompted",
  RECENT_COLORS:            "custom_colors_recent",
  // Legacy keys kept for migration only (notifications.ts)
  NOTIF_MAP:                "@pilloclock/notif_map",
  HEALTH_NOTIF_ID:          "@pilloclock/health_reminder_notif_id",
  HEALTH_REMINDER_TIME:     "@pilloclock/health_reminder_time",
} as const;
