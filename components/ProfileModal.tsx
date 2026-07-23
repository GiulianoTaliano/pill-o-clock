/**
 * ProfileModal (F2 multi-profile): create or edit a profile. Editing a
 * non-default profile also offers deletion, which removes the person AND all
 * their data after an explicit destructive confirm (alarms cancelled first —
 * see profiles slice).
 */
import { View, Text, TextInput, TouchableOpacity, Modal, Alert } from "react-native";
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
  onSave: (name: string, color: string, contact: { name: string; phone: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ProfileModal({ visible, profile, onSave, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    if (visible) {
      setName(profile?.name ?? "");
      setColor(profile?.color ?? PALETTE[0]);
      setContactName(profile?.emergencyContactName ?? "");
      setContactPhone(profile?.emergencyContactPhone ?? "");
    }
  }, [visible, profile]);

  const isDefault = profile?.id === DEFAULT_PROFILE_ID;
  const canSave = name.trim().length > 0 || isDefault;

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
          onPress: () => onDelete(profile.id),
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full rounded-2xl bg-card p-5">
          <Text className="text-lg font-bold text-text mb-4">
            {profile ? t("profiles.editTitle") : t("profiles.addTitle")}
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={isDefault ? t("profiles.me") : t("profiles.namePlaceholder")}
            placeholderTextColor={theme.muted}
            className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
            autoFocus
            maxLength={30}
          />

          {/* Emergency contact (F3) — shown on the emergency card. */}
          <Text className="text-xs font-semibold text-muted mt-4 mb-1">{t("profiles.emergencyContact")}</Text>
          <TextInput
            value={contactName}
            onChangeText={setContactName}
            placeholder={t("profiles.contactNamePlaceholder")}
            placeholderTextColor={theme.muted}
            className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt"
            maxLength={50}
          />
          <TextInput
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder={t("profiles.contactPhonePlaceholder")}
            placeholderTextColor={theme.muted}
            keyboardType="phone-pad"
            className="border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card-alt mt-2"
            maxLength={30}
          />

          <View className="flex-row gap-2 mt-4">
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                accessibilityRole="button"
                accessibilityLabel={c}
                onPress={() => setColor(c)}
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{
                  backgroundColor: MEDICATION_COLORS[c]?.bg ?? "#3b82f6",
                  borderWidth: color === c ? 3 : 0,
                  borderColor: theme.primary,
                }}
              />
            ))}
          </View>

          <View className="flex-row items-center mt-5 gap-3">
            {profile && !isDefault && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("profiles.deleteConfirmButton")}
                onPress={confirmDelete}
                className="p-2"
              >
                <Ionicons name="trash-outline" size={22} color={theme.danger} />
              </TouchableOpacity>
            )}
            <View className="flex-1" />
            <TouchableOpacity onPress={onClose} className="py-2.5 px-4">
              <Text className="text-muted font-semibold">{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!canSave}
              onPress={() => {
                Haptics.selectionAsync();
                onSave(name.trim(), color, { name: contactName.trim(), phone: contactPhone.trim() });
              }}
              className={`rounded-xl py-2.5 px-5 ${canSave ? "bg-primary" : "bg-slate-300"}`}
            >
              <Text className="text-white font-bold">{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
