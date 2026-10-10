import { useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { useToast } from "../src/context/ToastContext";
import { useReducedMotion } from "../src/hooks/useReducedMotion";
import {
  INJECTION_SITES,
  type InjectionSite,
} from "../src/services/injectionSites";
import { AppPressable } from "./AppPressable";
interface Props {
  visible: boolean;
  suggested: InjectionSite | null;
  current?: string;
  onPick: (site: InjectionSite) => void | Promise<void>;
  onClose: () => void;
}
export function SitePickerModal({
  visible,
  suggested,
  current,
  onPick,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { showToast } = useToast();
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (!lock.current) onClose();
  };
  async function pick(site: InjectionSite) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      await onPick(site);
    } catch {
      showToast(t("ux.saveFailed"), "error");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "slide"}
      onRequestClose={close}
    >
      <Pressable
        onPress={close}
        accessible={false}
        className="flex-1 bg-black/50 justify-end"
      >
        <Pressable
          onPress={() => {}}
          accessible={false}
          accessibilityViewIsModal
          className="bg-card rounded-t-3xl p-5"
          style={{
            maxHeight: "85%",
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-text"
          >
            {t("sites.title")}
          </Text>
          <Text className="text-base text-muted mt-2 mb-4">
            {t("sites.subtitle")}
          </Text>
          <ScrollView>
            <View className="flex-row flex-wrap gap-2">
              {INJECTION_SITES.map((site) => (
                <AppPressable
                  key={site}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: current === site }}
                  onPress={() => pick(site)}
                  style={{
                    width: "48%",
                    minHeight: 64,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor:
                      current === site ? theme.primary : theme.border,
                    backgroundColor:
                      current === site ? theme.actionFill : theme.cardAlt,
                  }}
                >
                  <View className="flex-row items-center gap-2">
                    <Ionicons
                      name={
                        current === site
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={20}
                      color={current === site ? "#fff" : theme.primary}
                    />
                    <Text
                      style={{
                        flex: 1,
                        color: current === site ? "#fff" : theme.text,
                        fontSize: 16,
                        fontWeight: "600",
                      }}
                    >
                      {t("sites." + site)}
                    </Text>
                  </View>
                  {site === suggested && site !== current && (
                    <Text className="text-primary text-sm mt-1">
                      {t("sites.suggested")}
                    </Text>
                  )}
                </AppPressable>
              ))}
            </View>
            {saving && (
              <ActivityIndicator
                color={theme.primary}
                style={{ marginTop: 16 }}
              />
            )}
            <AppPressable
              disabled={saving}
              onPress={close}
              className="items-center py-3 mt-3"
            >
              <Text className="text-muted text-base font-semibold">
                {t("sites.skip")}
              </Text>
            </AppPressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
