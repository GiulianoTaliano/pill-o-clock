/**
 * Expo Config Plugin for expo-widget.
 *
 * The widget receiver and its meta-data are declared in the module's own
 * AndroidManifest.xml and get merged automatically by Gradle.
 * This plugin is present for symmetry with expo-alarm and in case future
 * customisation hooks are needed (e.g. widget label override).
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const withExpoWidget = (config) => {
  return withAndroidManifest(config, (modConfig) => {
    // The widget receiver is already declared in the module's
    // AndroidManifest.xml and merged by Gradle — nothing extra to do here.
    return modConfig;
  });
};

module.exports = withExpoWidget;
