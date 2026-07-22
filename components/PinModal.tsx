/**
 * PIN setup / verification modal (F1: app lock), used from Settings.
 *
 * Modes:
 *  - "setup":  enter new PIN → confirm → onSuccess(pin)
 *  - "verify": enter current PIN → onSuccess()
 *  - "change": verify current → enter new → confirm → onSuccess(newPin)
 */
import { Modal, View, Text } from "react-native";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { AppPressable } from "./AppPressable";
import { PinPad, PinDots } from "./PinPad";
import { PIN_LENGTH, verifyPin } from "../src/services/appLock";

type Mode = "setup" | "verify" | "change";
type Step = "verify" | "enter" | "confirm";

interface PinModalProps {
  visible: boolean;
  mode: Mode;
  onClose: () => void;
  /** setup/change: receives the new PIN. verify: receives the verified current PIN. */
  onSuccess: (pin: string) => void;
}

export function PinModal({ visible, mode, onClose, onSuccess }: PinModalProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [step, setStep] = useState<Step>("enter");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(mode === "setup" ? "enter" : "verify");
      setPin("");
      setFirstPin("");
      setError(null);
    }
  }, [visible, mode]);

  const fail = (msg: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setError(msg);
    setPin("");
  };

  const handleComplete = async (entered: string) => {
    setBusy(true);
    try {
      if (step === "verify") {
        const ok = await verifyPin(entered);
        if (!ok) return fail(t("appLock.wrongPin"));
        setError(null);
        if (mode === "verify") {
          onSuccess(entered);
          return;
        }
        // change: continue to the new-PIN step
        setStep("enter");
        setPin("");
      } else if (step === "enter") {
        setFirstPin(entered);
        setPin("");
        setError(null);
        setStep("confirm");
      } else {
        if (entered !== firstPin) {
          setStep("enter");
          setFirstPin("");
          return fail(t("appLock.pinMismatch"));
        }
        onSuccess(entered);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDigit = (d: string) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // Let the last dot paint before the async check.
      setTimeout(() => handleComplete(next), 60);
    }
  };

  const title =
    step === "verify"
      ? t("appLock.enterCurrentPin")
      : step === "enter"
        ? t("appLock.enterNewPin")
        : t("appLock.confirmNewPin");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-3xl bg-background px-6 pt-5 pb-8">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-lg font-bold text-text">{title}</Text>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t("common.cancel")}
              onPress={onClose}
              className="p-2"
            >
              <Ionicons name="close" size={22} color={theme.muted} />
            </AppPressable>
          </View>
          <Text className="text-xs text-muted mb-1">{t("appLock.pinHint")}</Text>
          <PinDots filled={pin.length} error={!!error} />
          {error ? (
            <Text className="text-center text-sm font-semibold mb-3" style={{ color: "#dc2626" }}>
              {error}
            </Text>
          ) : null}
          <PinPad onDigit={onDigit} onBackspace={() => setPin(pin.slice(0, -1))} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}
