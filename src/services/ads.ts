/**
 * Monetization: low-intrusion ad banners (F1 — stakeholder decision 2026-07).
 *
 * Policy (do not regress):
 *  - Banners ONLY on secondary screens (History, Health). NEVER on the alarm
 *    screen, the Today list, or the medication form. No interstitials, ever.
 *  - Non-personalized ad requests only (privacy posture).
 *
 * FLIPPED ON 2026-07-23 (AdMob account giuliano.taliano1@gmail.com):
 *  ✓ Real app/unit IDs below and in app.json + android AndroidManifest.
 *  ✓ The four tools:node="remove" ad-permission strips removed from the
 *    persistent manifest (AD_ID + ACCESS_ADSERVICES_* are declared again).
 *  ✓ Store listing copy no longer claims "no ads".
 *  ✓ app-ads.txt published at giulianotaliano.github.io/app-ads.txt.
 *  ⚠ REMAINING (manual, at the org-account resubmission): Play Console
 *    declarations "Anuncios" = Sí and "ID de publicidad" = Sí + Data
 *    safety advertising entries. Shipping a release before those are set
 *    is a Play-policy violation.
 * Dev builds keep Google's TEST ids (clicking real ads in dev violates
 * AdMob policy); release builds use the real units.
 *
 * DEP PIN: react-native-google-mobile-ads is pinned to ^15.7.0
 * (play-services-ads 24.5.0). Do NOT bump to 16.x until the project's Kotlin
 * is ≥ 2.3 — 16.x pulls play-services-ads 25.x whose Kotlin metadata (2.3.0)
 * fails to compile against RN 0.81 / Expo 54's Kotlin 2.1.
 */
import { Platform } from "react-native";

export const ADS_ENABLED = true;

/** Google's official test banner unit ids — used in dev builds only. */
const TEST_BANNER_ANDROID = "ca-app-pub-3940256099942544/9214589741";
const TEST_BANNER_IOS = "ca-app-pub-3940256099942544/2435281174";

/** Real units (AdMob app Pill O-Clock, Android). One per surface so revenue
 *  and fill can be compared per screen in AdMob reporting. */
const REAL_BANNER_HISTORY = "ca-app-pub-6639820412660854/2454231920";
const REAL_BANNER_HEALTH = "ca-app-pub-6639820412660854/4331400319";

export type BannerScreen = "history" | "health";

export function adsEnabled(): boolean {
  return ADS_ENABLED && Platform.OS !== "web";
}

export function getBannerUnitId(screen: BannerScreen = "history"): string {
  if (__DEV__ || Platform.OS === "ios") {
    // No iOS app registered in AdMob yet — test id keeps iOS dev builds safe.
    return Platform.OS === "ios" ? TEST_BANNER_IOS : TEST_BANNER_ANDROID;
  }
  return screen === "health" ? REAL_BANNER_HEALTH : REAL_BANNER_HISTORY;
}
