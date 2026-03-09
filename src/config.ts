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
export const GOOGLE_MAPS_API_KEY = "AIzaSyBerHuVkW3DcTFtA1by3hH96voGthL7o3o";
