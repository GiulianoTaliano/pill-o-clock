import { ConfigContext, ExpoConfig } from "expo/config";

// The Google Maps / Places API key is sourced exclusively from the environment
// variable EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. For local development, define it in
// .env.local (already listed in .gitignore). For EAS builds, add it as an EAS
// Secret in the Expo dashboard (expo.dev → project → Secrets).
//
// Native side: this value is injected into AndroidManifest.xml by the Gradle
// manifestPlaceholder defined in android/app/build.gradle.
// iOS deliberately gets NO googleMapsApiKey: iOS renders Apple Maps
// (LocationPickerModal → provider undefined), and setting the key would make
// Expo link the Google Maps iOS SDK + init GMSServices for nothing.
// JS side: accessible as process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY at runtime
// (Metro bakes EXPO_PUBLIC_* variables into the bundle at build time) — the
// Places/Geocoding web calls use it on both platforms.
const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Pill O-Clock",
  slug: config.slug ?? "pill-o-clock",
  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: mapsApiKey,
      },
    },
  },
});
