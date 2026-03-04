import { View, Text, TouchableOpacity, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Medication, Schedule } from "../src/types";
import { MEDICATION_COLORS, CATEGORY_CONFIG, getCategoryLabel, getDayNamesShort } from "../src/utils";
import { format } from "date-fns";
import { useTranslation, getDateLocale } from "../src/i18n";

interface MedicationCardProps {
  medication: Medication;
  schedules: Schedule[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
}

export function MedicationCard({
  medication,
  schedules,
  onEdit,
  onDelete,
  onToggleActive,
}: MedicationCardProps) {
  const { t } = useTranslation();
  const colors = MEDICATION_COLORS[medication.color];

  function scheduleLabel(s: Schedule): string {
    const dayNames = getDayNamesShort(t);
    if (s.days.length === 0) return t('medications.scheduleDaily', { time: s.time });
    const dayStr = s.days
      .sort((a, b) => a - b)
      .map((d) => dayNames[d])
      .join(", ");
    return `${dayStr} · ${s.time}`;
  }

  return (
    <View
      style={{ borderLeftColor: colors.bg, backgroundColor: medication.isActive ? "#fff" : "#f8fafc" }}
      className="rounded-2xl border border-slate-100 border-l-4 p-4 mb-3 shadow-sm"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <View
            style={{ backgroundColor: colors.light }}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <Ionicons name="medical" size={20} color={colors.bg} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text
                className={`text-base font-bold ${medication.isActive ? "text-text" : "text-muted"}`}
              >
                {medication.name}
              </Text>
              {/* Category badge */}
              <View
                style={{ backgroundColor: CATEGORY_CONFIG[medication.category].tint + "20",
                          borderColor: CATEGORY_CONFIG[medication.category].tint + "60" }}
                className="flex-row items-center gap-1 rounded-lg px-1.5 py-0.5 border"
              >
                <Ionicons
                  name={CATEGORY_CONFIG[medication.category].icon as any}
                  size={10}
                  color={CATEGORY_CONFIG[medication.category].tint}
                />
                <Text
                  style={{ color: CATEGORY_CONFIG[medication.category].tint }}
                  className="text-xs font-semibold"
                >
                  {getCategoryLabel(medication.category, t)}
                </Text>
              </View>
            </View>
            <Text className="text-sm text-muted">{medication.dosage}</Text>
          </View>
        </View>

        <Switch
          value={medication.isActive}
          onValueChange={onToggleActive}
          trackColor={{ false: "#e2e8f0", true: colors.light }}
          thumbColor={medication.isActive ? colors.bg : "#94a3b8"}
        />
      </View>

      {/* Time-bound info */}
      {(medication.startDate || medication.endDate) && (
        <View className="flex-row items-center gap-1 mt-2 ml-12">
          <Ionicons name="calendar-outline" size={13} color="#94a3b8" />
          <Text className="text-xs text-muted">
            {medication.startDate
              ? format(new Date(medication.startDate + "T12:00"), "d MMM", { locale: getDateLocale() })
              : t('common.start')}
            {" → "}
            {medication.endDate
              ? format(new Date(medication.endDate + "T12:00"), "d MMM yyyy", { locale: getDateLocale() })
              : t('common.end')}
          </Text>
        </View>
      )}

      {/* Notes */}
      {medication.notes ? (
        <Text className="text-xs text-muted mt-1 ml-12">{medication.notes}</Text>
      ) : null}

      {/* Schedules */}
      {schedules.length > 0 && (
        <View className="mt-3 gap-1">
          {schedules.map((s) => (
            <View
              key={s.id}
              style={{ backgroundColor: colors.light }}
              className="flex-row items-center gap-2 rounded-xl px-3 py-1.5"
            >
              <Ionicons name="alarm-outline" size={13} color={colors.text} />
              <Text style={{ color: colors.text }} className="text-xs font-medium">
                {scheduleLabel(s)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View className="flex-row justify-end gap-3 mt-3">
        <TouchableOpacity
          onPress={onEdit}
          className="flex-row items-center gap-1 bg-blue-50 rounded-xl px-3 py-1.5"
        >
          <Ionicons name="pencil-outline" size={14} color="#3b82f6" />
          <Text className="text-blue-500 text-xs font-semibold">Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          className="flex-row items-center gap-1 bg-red-50 rounded-xl px-3 py-1.5"
        >
          <Ionicons name="trash-outline" size={14} color="#ef4444" />
          <Text className="text-red-500 text-xs font-semibold">Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
