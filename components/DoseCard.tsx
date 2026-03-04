import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TodayDose } from "../src/types";
import { MEDICATION_COLORS, CATEGORY_CONFIG, getCategoryLabel } from "../src/utils";
import { useTranslation } from "../src/i18n";

interface DoseCardProps {
  dose: TodayDose;
  onTake: () => void;
  onSkip: () => void;
  onSnooze: () => void;
}

const STATUS_CONFIG = {
  pending: { icon: "time-outline" as const,            bg: "#fffbeb", border: "#fde68a" },
  taken:   { icon: "checkmark-circle" as const,        bg: "#f0fdf4", border: "#86efac" },
  skipped: { icon: "close-circle" as const,            bg: "#fff1f2", border: "#fca5a5" },
  missed:  { icon: "alert-circle-outline" as const,    bg: "#f8fafc", border: "#cbd5e1" },
};

export function DoseCard({ dose, onTake, onSkip, onSnooze }: DoseCardProps) {
  const { t } = useTranslation();
  const colors = MEDICATION_COLORS[dose.medication.color];
  const statusCfg = STATUS_CONFIG[dose.status];
  const isPending = dose.status === "pending";
  const isMissed  = dose.status === "missed";

  return (
    <View
      style={{ backgroundColor: statusCfg.bg, borderColor: statusCfg.border }}
      className="rounded-2xl border p-4 mb-3 shadow-sm"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          {/* Pill color dot */}
          <View
            style={{ backgroundColor: colors.bg }}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <Ionicons name="medical" size={20} color="#fff" />
          </View>
          <View>
            <Text className="text-base font-bold text-text">{dose.medication.name}</Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Text className="text-sm text-muted">{dose.medication.dosage}</Text>
              <Text className="text-slate-300">·</Text>
              <Ionicons
                name={CATEGORY_CONFIG[dose.medication.category].icon as any}
                size={11}
                color={CATEGORY_CONFIG[dose.medication.category].tint}
              />
              <Text
                style={{ color: CATEGORY_CONFIG[dose.medication.category].tint }}
                className="text-xs font-semibold"
              >
                {getCategoryLabel(dose.medication.category, t)}
              </Text>
            </View>
          </View>
        </View>

        {/* Time badge */}
        <View
          style={{ backgroundColor: colors.light, borderColor: colors.border }}
          className="rounded-xl px-3 py-1 border"
        >
          <Text style={{ color: colors.text }} className="text-sm font-bold">
            {dose.scheduledTime}
          </Text>
        </View>
      </View>

      {/* Notes */}
      {dose.medication.notes ? (
        <Text className="text-sm text-muted mb-2 ml-12">{dose.medication.notes}</Text>
      ) : null}

      {/* Status or Actions */}
      {(!isPending && !isMissed) ? (
        <View className="flex-row items-center gap-2 ml-12">
          <Ionicons
            name={statusCfg.icon}
            size={16}
            color={dose.status === "taken" ? "#22c55e" : "#ef4444"}
          />
          <Text
            style={{ color: dose.status === "taken" ? "#15803d" : "#b91c1c" }}
            className="text-sm font-semibold"
          >
            {t(`status.${dose.status}`)}
            {dose.takenAt
              ? t('doseCard.takenAt', { time: new Date(dose.takenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })
              : ""}
          </Text>
        </View>
      ) : isPending ? (
        <View className="flex-row gap-2 mt-2">
          {/* Snooze */}
          <TouchableOpacity
            onPress={onSnooze}
            className="flex-row items-center gap-1 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2"
          >
            <Ionicons name="alarm-outline" size={15} color="#d97706" />
            <Text className="text-amber-700 text-xs font-semibold">{t('doseCard.snooze')}</Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity
            onPress={onSkip}
            className="flex-row items-center gap-1 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
          >
            <Ionicons name="close-outline" size={15} color="#ef4444" />
            <Text className="text-red-500 text-xs font-semibold">{t('doseCard.skip')}</Text>
          </TouchableOpacity>

          {/* Take */}
          <TouchableOpacity
            onPress={onTake}
            className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text className="text-white text-sm font-bold">{t('doseCard.take')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Missed: allow recording a late dose, but no snooze */
        <View className="flex-row gap-2 mt-2 items-center">
          <View className="flex-row items-center gap-1.5 mr-1">
            <Ionicons name={statusCfg.icon} size={14} color="#94a3b8" />
            <Text className="text-xs text-muted font-semibold">{t(`status.${dose.status}`)}</Text>
          </View>

          <TouchableOpacity
            onPress={onSkip}
            className="flex-row items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2"
          >
            <Ionicons name="close-outline" size={15} color="#64748b" />
            <Text className="text-slate-500 text-xs font-semibold">{t('doseCard.skip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onTake}
            className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-xl px-4 py-2"
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text className="text-white text-sm font-bold">{t('doseCard.takeLate')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
