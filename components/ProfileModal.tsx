/**
 * ProfileModal (F2 multi-profile): create or edit a profile. Editing a
 * non-default profile also offers deletion, which removes the person AND all
 * their data after an explicit destructive confirm (alarms cancelled first —
 * see profiles slice).
 */
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { MEDICATION_COLORS } from "../src/utils";
import type { Profile } from "../src/types";
import { DEFAULT_PROFILE_ID } from "../src/services/profileStore";

const PALETTE = ["blue", "green", "orange", "purple", "pink", "teal"] as const;

interface Props {
  visible: boolean;
  /** null = create mode. */
  profile: Profile | null;
  onSave: (
    name: string,
    color: string,
    contact: { name: string; phone: string }
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function ProfileModal({
  visible,
  profile,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(profile?.name ?? "");
      setColor(profile?.color ?? PALETTE[0]);
      setContactName(profile?.emergencyContactName ?? "");
      setContactPhone(profile?.emergencyContactPhone ?? "");
      setError(false);
    }
  }, [visible, profile]);

  const isDefault = profile?.id === DEFAULT_PROFILE_ID;
  const phoneValid =
    !contactPhone.trim() ||
    (/^[+\d\s().-]+$/.test(contactPhone.trim()) &&
      contactPhone.replace(/\D/g, "").length >= 5);
  const canSave =
    (name.trim().length > 0 || isDefault) && phoneValid && !pending;
  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setError(false);
    try {
      await work();
      onClose();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = () => {
    if (!profile || isDefault) return;
    Alert.alert(
      t("profiles.deleteConfirmTitle"),
      t("profiles.deleteConfirmMsg", { name: profile.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profiles.deleteConfirmButton"),
          style: "destructive",
          onPress: () => {
            void run(() => onDelete(profile.id));
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!pending) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-black/50"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            className="w-full rounded-2xl bg-card p-5"
            accessibilityViewIsModal
          >
            <Text className="text-lg font-bold text-text mb-4">
              {profile ? t("profiles.editTitle") : t("profiles.addTitle")}
            </Text>

            <TextInput
              accessibilityLabel={t("uxSettings.profileName")}
              editable={!pending}
              value={name}
              onChangeText={setName}
              placeholder={
                isDefault ? t("profiles.me") : t("profiles.namePlaceholder")
              }
              placeholderTextColor={theme.muted}
              className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
              autoFocus
              maxLength={30}
            />

            {/* Emergency contact (F3) — shown on the emergency card. */}
            <Text className="text-xs font-semibold text-muted mt-4 mb-1">
              {t("profiles.emergencyContact")}
            </Text>
            <TextInput
              accessibilityLabel={t("uxSettings.contactName")}
              editable={!pending}
              value={contactName}
              onChangeText={setContactName}
              placeholder={t("profiles.contactNamePlaceholder")}
              placeholderTextColor={theme.muted}
              className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
              maxLength={50}
            />
            <TextInput
              accessibilityLabel={t("uxSettings.contactPhone")}
              editable={!pending}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder={t("profiles.contactPhonePlaceholder")}
              placeholderTextColor={theme.muted}
              keyboardType="phone-pad"
              className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt mt-2"
              maxLength={30}
            />
            {!phoneValid && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-danger mt-2"
              >
                {t("uxSettings.phoneInvalid")}
              </Text>
            )}
            {error && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-danger mt-2"
              >
                {t("uxSettings.operationError")}
              </Text>
            )}

            <View className="flex-row flex-wrap gap-2 mt-4">
              {PALETTE.map((c) => (
                <TouchableOpacity
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={t("uxSettings.color", {
                    name: t("uxSettings." + c),
                  })}
                  accessibilityState={{
                    selected: color === c,
                    disabled: pending,
                  }}
                  disabled={pending}
                  onPress={() => setColor(c)}
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: MEDICATION_COLORS[c]?.bg ?? "#3b82f6",
                    borderWidth: color === c ? 3 : 0,
                    borderColor: theme.primary,
                  }}
                >
                  {color === c && (
                    <Ionicons name="checkmark" size={22} color="#ffffff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View className="flex-row flex-wrap items-center mt-5 gap-3">
              {profile && !isDefault && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("profiles.deleteConfirmButton")}
                  onPress={confirmDelete}
                  disabled={pending}
                  className="min-w-[48px] min-h-[48px] items-center justify-center"
                >
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color={theme.danger}
                  />
                </TouchableOpacity>
              )}
              <View className="flex-1" />
              <TouchableOpacity
                accessibilityRole="button"
                disabled={pending}
                onPress={onClose}
                className="min-h-[48px] justify-center px-4"
              >
                <Text className="text-muted font-semibold">
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!canSave}
                accessibilityState={{ disabled: !canSave, busy: pending }}
                onPress={() => {
                  Haptics.selectionAsync();
                  void run(() =>
                    onSave(name.trim(), color, {
                      name: contactName.trim(),
                      phone: contactPhone.trim(),
                    })
                  );
                }}
                className="rounded-xl min-h-[48px] justify-center px-5 bg-action"
                style={{ opacity: canSave ? 1 : 0.5 }}
              >
                {pending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold">
                    {t("common.save")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
