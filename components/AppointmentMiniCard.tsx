import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Appointment } from "../src/types";
import { getDateLocale, useTranslation } from "../src/i18n";
import { formatTimeForDisplay } from "../src/utils";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface AppointmentMiniCardProps {
  appt: Appointment;
  onPress: () => void;
}

export function AppointmentMiniCard({
  appt,
  onPress,
}: AppointmentMiniCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const dateLabel = format(new Date(appt.date + "T12:00"), "PPP", {
    locale: getDateLocale(),
  });
  const dateCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={[
        appt.title,
        dateCap,
        appt.time ? formatTimeForDisplay(appt.time) : t("uxHealth.noTime"),
        appt.doctor,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      className="bg-card rounded-2xl border border-border p-4 mb-2 flex-row items-center gap-3 min-h-[64px]"
    >
      <View className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
        <Ionicons name="calendar" size={20} color={theme.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-text" numberOfLines={2}>
          {appt.title}
        </Text>
        <Text className="text-sm text-muted mt-0.5">
          {dateCap}
          {appt.time ? ` · ${formatTimeForDisplay(appt.time)}` : ""}
          {appt.doctor ? ` · ${appt.doctor}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.muted} />
    </TouchableOpacity>
  );
}
