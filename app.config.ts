import { ConfigContext, ExpoConfig } from "expo/config";

// The Google Maps / Places API key is sourced exclusively from the environment
// variable EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. For local development, define it in
// .env.local (already listed in .gitignore). For EAS builds, add it as an EAS
// Secret in the Expo dashboard (expo.dev → project → Secrets).
//
// Native side: this value is injected into AndroidManifest.xml by the Gradle
// manifestPlaceholder defined in android/app/build.gradle, and into iOS via
// the react-native-maps config plugin below.
// JS side: accessible as process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY at runtime
// (Metro bakes EXPO_PUBLIC_* variables into the bundle at build time).
const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ios: {
    ...config.ios,
    config: {
      googleMapsApiKey: mapsApiKey,
    },
  },
  android: {
    ...config.android,
    config: {
      googleMapsApiKey: mapsApiKey,
    },
  },
});
