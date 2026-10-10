/**
 * ProfileChip (F2 multi-profile): compact active-profile indicator for the
 * Today header. Hidden with a single profile; tapping opens a quick switcher.
 * Switching only changes what lists show — alarms keep covering everyone.
 */
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "../src/store";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { MEDICATION_COLORS } from "../src/utils";
import type { Profile } from "../src/types";

export function ProfileChip() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const switchProfile = useAppStore((s) => s.switchProfile);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const displayName = (p: Profile) => p.name || t("profiles.me");
  const active = profiles.find((p) => p.id === activeProfileId);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          t("uxSettings.activePerson", {
            name: active ? displayName(active) : t("profiles.me"),
          }) +
          ". " +
          t("profiles.switcherLabel")
        }
        accessibilityState={{ expanded: open }}
        onPress={() => {
          Haptics.selectionAsync();
          setError(false);
          setOpen(true);
        }}
        className="flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 min-h-[48px]"
        style={{ maxWidth: "100%" }}
      >
        <View
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor:
              MEDICATION_COLORS[active?.color ?? "blue"]?.bg ?? "#3b82f6",
          }}
        />
        <Text
          className="text-sm font-semibold text-text"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {active ? displayName(active) : t("profiles.me")}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.muted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <View className="flex-1 bg-black/50 justify-center px-6 py-8">
          <View
            className="rounded-2xl bg-card overflow-hidden"
            style={{ maxHeight: "85%" }}
            accessibilityViewIsModal
          >
            <Text className="text-lg font-bold text-text px-4 pt-4">
              {t("profiles.switcherLabel")}
            </Text>
            <Text className="text-sm text-muted px-4 py-3">
              {t("profiles.alarmsNote")}
            </Text>
            {error && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-sm text-danger px-4 py-3"
              >
                {t("uxSettings.operationError")}
              </Text>
            )}
            <ScrollView>
              {profiles.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={displayName(p)}
                  accessibilityState={{
                    selected: p.id === activeProfileId,
                    disabled: pending,
                    busy: pending,
                  }}
                  disabled={pending}
                  onPress={async () => {
                    setPending(true);
                    setError(false);
                    try {
                      if (p.id !== activeProfileId) await switchProfile(p.id);
                      setOpen(false);
                    } catch {
                      setError(true);
                    } finally {
                      setPending(false);
                    }
                  }}
                  className={`flex-row items-center gap-3 px-4 py-3.5 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <View
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        MEDICATION_COLORS[p.color]?.bg ?? "#3b82f6",
                    }}
                  />
                  <Text className="flex-1 text-base text-text font-medium">
                    {displayName(p)}
                  </Text>
                  {p.id === activeProfileId && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={theme.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {pending && <ActivityIndicator color={theme.primary} />}
            <TouchableOpacity
              accessibilityRole="button"
              disabled={pending}
              onPress={() => setOpen(false)}
              className="min-h-[48px] items-center justify-center px-4"
            >
              <Text className="font-semibold text-primary">
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
