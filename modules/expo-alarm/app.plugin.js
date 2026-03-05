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

const withExpoAlarm = (config) => {
  // Merge required permissions that some build environments may not pick up
  // from the module's own AndroidManifest.xml.
  return withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;

    ensurePermission(androidManifest, "android.permission.WAKE_LOCK");
    ensurePermission(androidManifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(androidManifest, "android.permission.FOREGROUND_SERVICE_ALARM");
    ensurePermission(androidManifest, "android.permission.USE_FULL_SCREEN_INTENT");

    return modConfig;
  });
};

module.exports = withExpoAlarm;
