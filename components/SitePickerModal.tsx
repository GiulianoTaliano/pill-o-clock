/**
 * SitePickerModal (F3 injectables): records where an injection went, with
 * the least-recently-used site suggested. Optional by design — skipping
 * never blocks the dose log (we don't fabricate medical data).
 */
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { INJECTION_SITES, InjectionSite } from "../src/services/injectionSites";

interface Props {
  visible: boolean;
  suggested: InjectionSite | null;
  current?: string;
  onPick: (site: InjectionSite) => void;
  onClose: () => void;
}

export function SitePickerModal({ visible, suggested, current, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 bg-black/50 justify-center px-8" activeOpacity={1} onPress={onClose}>
        <View className="rounded-2xl bg-card p-5">
          <Text className="text-lg font-bold text-text">{t("sites.title")}</Text>
          <Text className="text-xs text-muted mt-1 mb-4">{t("sites.subtitle")}</Text>

          <View className="flex-row flex-wrap gap-2">
            {INJECTION_SITES.map((site) => {
              const isSuggested = site === suggested;
              const isCurrent = site === current;
              return (
                <TouchableOpacity
                  key={site}
                  accessibilityRole="button"
                  accessibilityLabel={t(`sites.${site}`)}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onPick(site);
                  }}
                  className={`rounded-xl px-3 py-2.5 border ${
                    isCurrent
                      ? "bg-primary border-primary"
                      : isSuggested
                        ? "border-primary bg-blue-50 dark:bg-blue-950/30"
                        : "bg-card-alt border-border"
                  }`}
                  style={{ width: "48%" }}
                >
                  <Text className={`text-sm font-semibold ${isCurrent ? "text-white" : "text-text"}`}>
                    {t(`sites.${site}`)}
                  </Text>
                  {isSuggested && !isCurrent && (
                    <Text className="text-[10px] font-bold mt-0.5" style={{ color: theme.primary }}>
                      {t("sites.suggested")}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={onClose} className="self-end mt-4 py-2 px-3 flex-row items-center gap-1">
            <Ionicons name="close" size={14} color={theme.muted} />
            <Text className="text-muted font-semibold text-sm">{t("sites.skip")}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
