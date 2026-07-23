/**
 * PassphraseModal (F3 encrypted backup).
 *  - mode "set": choosing a passphrase for export — optional (skip = plain).
 *  - mode "enter": unlocking an encrypted backup on import — required.
 */
import { View, Text, TextInput, TouchableOpacity, Modal } from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface Props {
  visible: boolean;
  mode: "set" | "enter";
  /** null = user skipped (set-mode) or cancelled. */
  onDone: (passphrase: string | null) => void;
}

const MIN_LEN = 6;

export function PassphraseModal({ visible, mode, onDone }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (visible) {
      setPass("");
      setConfirm("");
    }
  }, [visible]);

  const canConfirm =
    mode === "enter" ? pass.length > 0 : pass.length >= MIN_LEN && pass === confirm;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onDone(null)}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full rounded-2xl bg-card p-5">
          <View className="flex-row items-center gap-2 mb-1">
            <Ionicons name="lock-closed-outline" size={18} color={theme.primary} />
            <Text className="text-lg font-bold text-text">
              {mode === "set" ? t("backupCrypto.setTitle") : t("backupCrypto.enterTitle")}
            </Text>
          </View>
          <Text className="text-xs text-muted mb-4">
            {mode === "set" ? t("backupCrypto.setSubtitle") : t("backupCrypto.enterSubtitle")}
          </Text>

          <TextInput
            value={pass}
            onChangeText={setPass}
            placeholder={t("backupCrypto.passphrasePlaceholder")}
            placeholderTextColor={theme.muted}
            secureTextEntry
            autoFocus
            className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
          />
          {mode === "set" && (
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={t("backupCrypto.confirmPlaceholder")}
              placeholderTextColor={theme.muted}
              secureTextEntry
              className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt mt-2"
            />
          )}
          {mode === "set" && (
            <Text className="text-[11px] text-muted mt-2">{t("backupCrypto.warning")}</Text>
          )}

          <View className="flex-row items-center justify-end mt-4 gap-3">
            <TouchableOpacity onPress={() => onDone(null)} className="py-2.5 px-4">
              <Text className="text-muted font-semibold">
                {mode === "set" ? t("backupCrypto.skip") : t("common.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!canConfirm}
              onPress={() => onDone(pass)}
              className={`rounded-xl py-2.5 px-5 ${canConfirm ? "bg-primary" : "bg-slate-300"}`}
            >
              <Text className="text-white font-bold">
                {mode === "set" ? t("backupCrypto.encrypt") : t("backupCrypto.unlock")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
