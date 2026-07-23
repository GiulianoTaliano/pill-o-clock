/**
 * AppLockGate (F1: app lock) — renders its children always, plus an opaque
 * unlock overlay when the lock is engaged.
 *
 * Lock engages on cold start (if enabled) and when the app returns to the
 * foreground after more than LOCK_GRACE_MS in background.
 *
 * SAFETY RULE: the fullscreen alarm route (/alarm) is NEVER covered by the
 * overlay — a medication alarm must be answerable without unlocking. The lock
 * stays engaged underneath and re-covers the app as soon as the user leaves
 * the alarm screen.
 */
import { View, Text, AppState } from "react-native";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { PinPad, PinDots } from "./PinPad";
import {
  isAppLockEnabled,
  isBiometricPreferred,
  verifyPin,
  PIN_LENGTH,
  LOCK_GRACE_MS,
  MAX_ATTEMPTS,
  ATTEMPT_COOLDOWN_MS,
} from "../src/services/appLock";

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const pathname = usePathname();

  const [locked, setLocked] = useState(() => isAppLockEnabled());
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const biometricInFlight = useRef(false);

  const onAlarmRoute = pathname?.startsWith("/alarm") ?? false;
  const overlayVisible = locked && !onAlarmRoute;

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
          setPin("");
          setError(false);
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ── Biometric availability + auto-prompt when the overlay appears ────────
  const tryBiometrics = useCallback(async () => {
    if (biometricInFlight.current) return;
    biometricInFlight.current = true;
    try {
      const ok = await LocalAuthentication.authenticateAsync({
        promptMessage: t("appLock.biometricPrompt"),
        cancelLabel: t("appLock.usePin"),
        disableDeviceFallback: true, // our own PIN is the fallback
      });
      if (ok.success) {
        setLocked(false);
        setPin("");
        setError(false);
        setAttempts(0);
      }
    } catch {
      // fall through to PIN
    } finally {
      biometricInFlight.current = false;
    }
  }, [t]);

  useEffect(() => {
    if (!overlayVisible) return;
    let cancelled = false;
    (async () => {
      try {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        const available = hw && enrolled;
        if (cancelled) return;
        setBiometricAvailable(available);
        if (available && isBiometricPreferred()) tryBiometrics();
      } catch {
        if (!cancelled) setBiometricAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [overlayVisible, tryBiometrics]);

  // ── Wrong-attempt cooldown ticker ────────────────────────────────────────
  const cooldownActive = cooldownLeft > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(() => {
      setCooldownLeft((s) => {
        if (s <= 1) {
          setAttempts(0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownActive]);

  const onDigit = (d: string) => {
    if (cooldownLeft > 0 || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(async () => {
        const ok = await verifyPin(next);
        if (ok) {
          setLocked(false);
          setPin("");
          setError(false);
          setAttempts(0);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const n = attempts + 1;
          setAttempts(n);
          setError(true);
          setPin("");
          if (n >= MAX_ATTEMPTS) setCooldownLeft(Math.round(ATTEMPT_COOLDOWN_MS / 1000));
        }
      }, 60);
    }
  };

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
          <Text style={{ fontSize: 44 }}>💊</Text>
          <Text className="text-2xl font-bold text-text mt-2">Pill O-Clock</Text>
          <Text className="text-sm text-muted mt-1 mb-2">
            {cooldownLeft > 0
              ? t("appLock.tooManyAttempts", { seconds: cooldownLeft })
              : t("appLock.enterPin")}
          </Text>
          <PinDots filled={pin.length} error={error} />
          {error && cooldownLeft === 0 ? (
            <Text className="text-sm font-semibold mb-2" style={{ color: "#dc2626" }}>
              {t("appLock.wrongPin")}
            </Text>
          ) : null}
          <PinPad
            onDigit={onDigit}
            onBackspace={() => setPin(pin.slice(0, -1))}
            onBiometric={biometricAvailable ? tryBiometrics : undefined}
            disabled={cooldownLeft > 0}
          />
        </View>
      )}
    </View>
  );
}
