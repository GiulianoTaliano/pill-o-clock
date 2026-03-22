import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Appointment } from "../src/types";
import { getDateLocale } from "../src/i18n";
import { formatTimeForDisplay } from "../src/utils";

interface AppointmentMiniCardProps {
  appt: Appointment;
  onPress: () => void;
}

export function AppointmentMiniCard({ appt, onPress }: AppointmentMiniCardProps) {
  const dateLabel = format(new Date(appt.date + "T12:00"), "PPP", { locale: getDateLocale() });
  const dateCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-card rounded-2xl border border-border p-3 mb-2 flex-row items-center gap-3"
    >
      <View className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
        <Ionicons name="calendar" size={17} color="#4f9cff" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-text" numberOfLines={1}>{appt.title}</Text>
        <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
          {dateCap}{appt.time ? ` · ${formatTimeForDisplay(appt.time)}` : ""}{appt.doctor ? ` · ${appt.doctor}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
    </TouchableOpacity>
  );
}
