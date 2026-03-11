/**
 * Expo Config Plugin for expo-alarm.
 *
 * The service, receiver, and permission declarations are already in the
 * module's AndroidManifest.xml and get merged automatically by Gradle.
 *
 * This plugin ensures the module is properly linked and can be used as an
 * entry in app.json's `plugins` array for future customisation hooks.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Idempotently ensures that a <uses-permission> entry exists in the manifest.
 */
function ensurePermission(androidManifest, permissionName) {
  const permissions = androidManifest.manifest["uses-permission"] ?? [];
  const exists = permissions.some((p) => p.$["android:name"] === permissionName);
  if (!exists) {
    permissions.push({ $: { "android:name": permissionName } });
    androidManifest.manifest["uses-permission"] = permissions;
  }
}

/**
 * Idempotently ensures that a <uses-feature> entry with required="false" exists.
 * This prevents Play Store from auto-excluding devices that lack the hardware
 * implied by certain permissions (e.g. GPS implied by ACCESS_FINE_LOCATION).
 */
function ensureOptionalFeature(androidManifest, featureName) {
  const features = androidManifest.manifest["uses-feature"] ?? [];
  const exists = features.some((f) => f.$["android:name"] === featureName);
  if (!exists) {
    features.push({ $: { "android:name": featureName, "android:required": "false" } });
    androidManifest.manifest["uses-feature"] = features;
  }
}

const withExpoAlarm = (config) => {
  // Merge required permissions that some build environments may not pick up
  // from the module's own AndroidManifest.xml.
  return withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;

    ensurePermission(androidManifest, "android.permission.WAKE_LOCK");
    ensurePermission(androidManifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(androidManifest, "android.permission.FOREGROUND_SERVICE_ALARM");
    ensurePermission(androidManifest, "android.permission.USE_FULL_SCREEN_INTENT");

    // Location permissions imply GPS/network hardware as required by default.
    // Marking them optional ensures tablets and devices without GPS are not excluded.
    ensureOptionalFeature(androidManifest, "android.hardware.location");
    ensureOptionalFeature(androidManifest, "android.hardware.location.gps");
    ensureOptionalFeature(androidManifest, "android.hardware.location.network");

    return modConfig;
  });
};

module.exports = withExpoAlarm;
