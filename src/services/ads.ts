/**
 * Monetization: low-intrusion ad banners (F1 — stakeholder decision 2026-07).
 *
 * Policy (do not regress):
 *  - Banners ONLY on secondary screens (History, Health). NEVER on the alarm
 *    screen, the Today list, or the medication form. No interstitials, ever.
 *  - Non-personalized ad requests only (privacy posture).
 *
 * MASTER SWITCH: ADS_ENABLED stays false until ALL of the following happen —
 *  1. A real AdMob account exists and real app/unit IDs replace the Google
 *     TEST IDs below (app IDs live in app.json + android AndroidManifest).
 *  2. Play Console declarations are updated: "Anuncios" = Sí, "ID de
 *     publicidad" = Sí, Data safety + advertising category.
 *  3. Store listing copy no longer claims "no ads" (see store/play-store-*).
 * Flipping this flag without (2)/(3) is a Play-policy violation.
 *
 * DEP PIN: react-native-google-mobile-ads is pinned to ^15.7.0
 * (play-services-ads 24.5.0). Do NOT bump to 16.x until the project's Kotlin
 * is ≥ 2.3 — 16.x pulls play-services-ads 25.x whose Kotlin metadata (2.3.0)
 * fails to compile against RN 0.81 / Expo 54's Kotlin 2.1.
 */
import { Platform } from "react-native";

export const ADS_ENABLED = false;

/** Google's official test banner unit ids — safe to ship, never monetize. */
const TEST_BANNER_ANDROID = "ca-app-pub-3940256099942544/9214589741";
const TEST_BANNER_IOS = "ca-app-pub-3940256099942544/2435281174";

export function adsEnabled(): boolean {
  return ADS_ENABLED && Platform.OS !== "web";
}

export function getBannerUnitId(): string {
  // Swap for real unit ids at launch (keep test ids for dev builds).
  return Platform.OS === "ios" ? TEST_BANNER_IOS : TEST_BANNER_ANDROID;
}
