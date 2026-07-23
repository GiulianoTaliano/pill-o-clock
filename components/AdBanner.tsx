/**
 * Anchored adaptive banner (F1 monetization). Renders NOTHING unless the
 * master switch in src/services/ads.ts is on — see the policy there.
 * Fails closed: any load error collapses the slot silently.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { adsEnabled, getBannerUnitId } from "../src/services/ads";

export function AdBanner() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!adsEnabled()) return;
    let cancelled = false;
    // Deferred import: the ads SDK is only initialized when banners are on.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mobileAds = require("react-native-google-mobile-ads").default;
    mobileAds()
      .initialize()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (!adsEnabled() || failed || !ready) return null;

  // Required lazily so the native module never loads while ads are disabled.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BannerAd, BannerAdSize } = require("react-native-google-mobile-ads");

  return (
    <View className="items-center">
      <BannerAd
        unitId={getBannerUnitId()}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
