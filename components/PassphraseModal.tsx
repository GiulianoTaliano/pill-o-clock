/**
 * PassphraseModal (F3 encrypted backup).
 *  - mode "set": choosing a passphrase for export — optional (skip = plain).
 *  - mode "enter": unlocking an encrypted backup on import — required.
 */
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

export type PassphraseResult =
  | { kind: "cancel" }
  | { kind: "plain" }
  | { kind: "passphrase"; passphrase: string };
interface Props {
  visible: boolean;
  mode: "set" | "enter";
  onDone: (result: PassphraseResult) => void;
}

const MIN_LEN = 6;

export function PassphraseModal({ visible, mode, onDone }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (visible) {
      setPass("");
      setConfirm("");
      setShown(false);
    }
  }, [visible]);

  const canConfirm =
    mode === "enter"
      ? pass.length > 0
      : pass.length >= MIN_LEN && pass === confirm;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onDone({ kind: "cancel" })}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-black/50"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            className="w-full rounded-2xl bg-card p-5"
            accessibilityViewIsModal
          >
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={theme.primary}
              />
              <Text className="text-lg font-bold text-text">
                {mode === "set"
                  ? t("backupCrypto.setTitle")
                  : t("backupCrypto.enterTitle")}
              </Text>
            </View>
            <Text className="text-xs text-muted mb-4">
              {mode === "set"
                ? t("backupCrypto.setSubtitle")
                : t("backupCrypto.enterSubtitle")}
            </Text>

            <TextInput
              accessibilityLabel={t("backupCrypto.passphrasePlaceholder")}
              value={pass}
              onChangeText={setPass}
              placeholder={t("backupCrypto.passphrasePlaceholder")}
              placeholderTextColor={theme.muted}
              secureTextEntry={!shown}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
            />
            {mode === "set" && (
              <TextInput
                accessibilityLabel={t("backupCrypto.confirmPlaceholder")}
                value={confirm}
                onChangeText={setConfirm}
                placeholder={t("backupCrypto.confirmPlaceholder")}
                placeholderTextColor={theme.muted}
                secureTextEntry={!shown}
                autoCapitalize="none"
                autoCorrect={false}
                className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt mt-2"
              />
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: shown }}
              onPress={() => setShown(!shown)}
              className="min-h-[48px] justify-center"
            >
              <Text className="text-primary font-semibold">
                {t(shown ? "uxSettings.hidePass" : "uxSettings.showPass")}
              </Text>
            </TouchableOpacity>
            {mode === "set" && pass.length > 0 && !canConfirm && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-danger"
              >
                {t(
                  pass.length < MIN_LEN
                    ? "uxSettings.minPass"
                    : "uxSettings.mismatch"
                )}
              </Text>
            )}
            {mode === "set" && (
              <Text className="text-[11px] text-muted mt-2">
                {t("backupCrypto.warning")}
              </Text>
            )}

            {mode === "set" && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onDone({ kind: "plain" })}
                className="min-h-[48px] justify-center mt-3"
              >
                <Text className="text-primary font-semibold">
                  {t("uxSettings.plain")}
                </Text>
              </TouchableOpacity>
            )}
            <View className="flex-row flex-wrap items-center justify-end mt-4 gap-3">
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onDone({ kind: "cancel" })}
                className="min-h-[48px] justify-center px-4"
              >
                <Text className="text-muted font-semibold">
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!canConfirm}
                accessibilityState={{ disabled: !canConfirm }}
                onPress={() => onDone({ kind: "passphrase", passphrase: pass })}
                className="rounded-xl min-h-[48px] justify-center px-5 bg-action"
                style={{ opacity: canConfirm ? 1 : 0.5 }}
              >
                <Text className="text-white font-bold">
                  {mode === "set"
                    ? t("backupCrypto.encrypt")
                    : t("backupCrypto.unlock")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
