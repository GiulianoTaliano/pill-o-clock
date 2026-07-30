/**
 * AppLockGate (app lock) — renders its children always, plus an opaque
 * unlock overlay when the lock is engaged.
 *
 * Lock engages on cold start (if enabled) and when the app returns to the
 * foreground after more than LOCK_GRACE_MS in background.
 *
 * Unlocking is delegated to the OS (biometrics with device-passcode fallback);
 * the app has no PIN pad of its own. The overlay therefore only needs a single
 * retry affordance for when the user dismisses the system prompt.
 *
 * SAFETY RULE: the fullscreen alarm route (/alarm) is NEVER covered by the
 * overlay — a medication alarm must be answerable without unlocking. The lock
 * stays engaged underneath and re-covers the app as soon as the user leaves
 * the alarm screen.
 */
import { View, Text, AppState, TouchableOpacity } from "react-native";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import BrandMark from "./BrandMark";
import {
  isAppLockEnabled,
  authenticateAsync,
  hasBiometricsAsync,
  LOCK_GRACE_MS,
} from "../src/services/appLock";

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const pathname = usePathname();

  const [locked, setLocked] = useState(() => isAppLockEnabled());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const authInFlight = useRef(false);

  const onAlarmRoute = pathname?.startsWith("/alarm") ?? false;
  // /emergency is exempt like /alarm: a first-aid card behind a lock is
  // useless to a bystander (F3, deliberate privacy tradeoff — see emergency.tsx).
  const onEmergencyRoute = pathname?.startsWith("/emergency") ?? false;
  const overlayVisible = locked && !onAlarmRoute && !onEmergencyRoute;

  // ── Re-lock on return from background (with grace period) ───────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        // Keep the earliest background timestamp of this excursion.
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
      } else if (next === "active") {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          isAppLockEnabled() &&
          since !== null &&
          Date.now() - since >= LOCK_GRACE_MS
        ) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ── OS authentication ────────────────────────────────────────────────────
  const unlock = useCallback(async () => {
    if (authInFlight.current) return;
    authInFlight.current = true;
    setPrompting(true);
    try {
      if (await authenticateAsync(t("appLock.biometricPrompt"))) {
        setLocked(false);
      }
    } finally {
      authInFlight.current = false;
      setPrompting(false);
    }
  }, [t]);

  // Auto-prompt as soon as the overlay appears. If the user dismisses the
  // system sheet they stay locked and can retry with the button below.
  useEffect(() => {
    if (!overlayVisible) return;
    let cancelled = false;
    (async () => {
      const available = await hasBiometricsAsync();
      if (cancelled) return;
      setBiometricAvailable(available);
      unlock();
    })();
    return () => {
      cancelled = true;
    };
  }, [overlayVisible, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {overlayVisible && (
        <View
          className="absolute inset-0 items-center justify-center px-8 bg-background"
          // Solid fallback color in case NativeWind's bg-background var fails:
          // the overlay must NEVER be transparent (it hides health data).
          style={{ backgroundColor: theme.isDark ? "#0b1220" : "#f1f5f9", zIndex: 999, elevation: 999 }}
          accessibilityViewIsModal
        >
          <BrandMark size={52} />
          <Text className="text-2xl font-bold text-text mt-2">Pill O-Clock</Text>
          <Text className="text-sm text-muted mt-1 mb-6 text-center">
            {t("appLock.lockedSubtitle")}
          </Text>

          <TouchableOpacity
            onPress={unlock}
            disabled={prompting}
            accessibilityRole="button"
            accessibilityLabel={t("appLock.unlock")}
            className="flex-row items-center rounded-2xl px-6 py-4"
            style={{ backgroundColor: theme.primary, opacity: prompting ? 0.6 : 1, gap: 10 }}
          >
            <Ionicons
              name={biometricAvailable ? "finger-print" : "lock-open-outline"}
              size={22}
              color="#ffffff"
            />
            <Text className="text-base font-bold" style={{ color: "#ffffff" }}>
              {t("appLock.unlock")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
