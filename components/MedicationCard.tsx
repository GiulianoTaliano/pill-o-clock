import { View, Text, TouchableOpacity, Switch, Image } from "react-native";
import { nextDueDate } from "../src/services/injectionSites";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Medication, Schedule, DoseLog } from "../src/types";
import { CATEGORY_CONFIG, getCategoryLabel, getDayNamesShort, getColorConfig, isScheduleActiveOnDate, toDateString, formatTimeForDisplay, getLocalizedDosage, estimateDaysOfSupply } from "../src/utils";
import { format } from "date-fns";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface MedicationCardProps {
  medication: Medication;
  schedules: Schedule[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
  /** Today's dose logs — used to compute the "next dose" indicator. */
  todayLogs?: DoseLog[];
  /** When provided (and the med is PRN + active), shows a "Log a dose" button
   *  so an as-needed dose can be recorded from where the med lives (audit UX I2). */
  onLogPRN?: () => void;
}

export function MedicationCard({
  medication,
  schedules,
  onEdit,
  onDelete,
  onToggleActive,
  todayLogs = [],
  onLogPRN,
}: MedicationCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const colors = getColorConfig(medication.color);

  function scheduleLabel(s: Schedule): string {
    const dayNames = getDayNamesShort(t);
    if (s.days.length === 0) return t('medications.scheduleDaily', { time: formatTimeForDisplay(s.time) });
    const dayStr = s.days
      .sort((a, b) => a - b)
      .map((d) => dayNames[d])
      .join(", ");
    return `${dayStr} · ${formatTimeForDisplay(s.time)}`;
  }

  // Compute next-dose indicator
  const nextDoseLabel: string | null = (() => {
    if (!medication.isActive) return null;
    if (medication.isPRN) return t('medicationCard.nextDosePRN');

    const now = new Date();
    const todayStr = toDateString(now);
    const nowHHmm = format(now, "HH:mm");
    const todayDate = new Date(todayStr + "T12:00");

    const activeToday = schedules.filter((s) => isScheduleActiveOnDate(s, todayDate, medication));
    if (activeToday.length === 0) return null;

    // Check which schedules already have a "taken" log today
    const takenScheduleIds = new Set(
      todayLogs
        .filter((l) => l.medicationId === medication.id && l.scheduledDate === todayStr && l.status === "taken")
        .map((l) => l.scheduleId)
    );

    const pending = activeToday
      .filter((s) => !takenScheduleIds.has(s.id))
      .sort((a, b) => a.time.localeCompare(b.time));

    if (pending.length === 0) return t('medicationCard.todayComplete');

    // Next upcoming time (could be future or already past but not yet taken)
    const upcoming = pending.find((s) => s.time >= nowHHmm) ?? pending[0];
    return t('medicationCard.nextDose', { time: formatTimeForDisplay(upcoming.time) });
  })();

  return (
    <View
      style={{ borderLeftColor: colors.bg, backgroundColor: medication.isActive ? theme.card : theme.cardAlt }}
      className="rounded-2xl border border-border border-l-4 p-4 mb-3 shadow-sm"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          {medication.photoUri ? (
            <Image
              source={{ uri: medication.photoUri }}
              className="w-10 h-10 rounded-full"
              resizeMode="cover"
            />
          ) : (
            <View
              style={{ backgroundColor: colors.light }}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <Ionicons name="medical" size={20} color={colors.bg} />
            </View>
          )}
          <View className="flex-1">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text
                className={`text-base font-bold ${medication.isActive ? "text-text" : "text-muted"}`}
                numberOfLines={1}
              >
                {medication.name}
              </Text>
              {/* Category badge */}
              <View
                style={{ backgroundColor: CATEGORY_CONFIG[medication.category].tint + "20",
                          borderColor: CATEGORY_CONFIG[medication.category].tint + "60" }}
                className="flex-row items-center gap-1 rounded-lg px-2 py-1 border"
              >
                <Ionicons
                  name={CATEGORY_CONFIG[medication.category].icon as any}
                  size={12}
                  color={CATEGORY_CONFIG[medication.category].tint}
                />
                <Text
                  style={{ color: theme.isDark
                    ? CATEGORY_CONFIG[medication.category].labelDark
                    : CATEGORY_CONFIG[medication.category].labelLight }}
                  className="text-xs font-semibold"
                >
                  {getCategoryLabel(medication.category, t)}
                </Text>
              </View>
            </View>
            <Text className="text-sm text-muted">{getLocalizedDosage(medication, t)}</Text>
          </View>
        </View>

        <Switch
          accessibilityRole="switch"
          accessibilityLabel={medication.name}
          accessibilityHint={t(medication.isActive ? 'medications.toggleOffHint' : 'medications.toggleOnHint')}
          accessibilityState={{ checked: medication.isActive }}
          value={medication.isActive}
          onValueChange={(v) => { Haptics.selectionAsync(); onToggleActive(v); }}
          trackColor={{ false: theme.isDark ? "#334155" : "#e2e8f0", true: colors.light }}
          thumbColor={medication.isActive ? colors.bg : theme.muted}
        />
      </View>

      {/* Time-bound info */}
      {(medication.startDate || medication.endDate) && (
        <View className="flex-row items-center gap-1 mt-2 ml-12">
          <Ionicons name="calendar-outline" size={15} color={theme.muted} />
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

      {/* Stock badge */}
      {medication.stockQuantity != null && (() => {
        const qty = medication.stockQuantity!;
        const threshold = medication.stockAlertThreshold;
        const isLow = threshold != null && qty <= threshold;
        const isWarning = threshold != null && qty <= threshold + 3 && !isLow;
        // On the light card the bright status colors fail AA as text (green
        // 2.28:1, orange 2.8:1); use darkened -700 variants in light, keep the
        // dark-adaptive theme colors in dark mode (audit OM3).
        const stockColor = isLow
          ? (theme.isDark ? theme.danger : "#b91c1c")
          : isWarning
            ? (theme.isDark ? theme.warning : "#b45309")
            : (theme.isDark ? theme.success : "#15803d");
        return (
          <View className="flex-row items-center gap-1.5 mt-2 ml-12">
            <Ionicons
              name="cube-outline"
              size={15}
              color={stockColor}
            />
            <Text
              style={{ color: stockColor }}
              className="text-xs font-semibold"
            >
              {t('stock.badge', { count: qty })}
              {(() => {
                const days = estimateDaysOfSupply(medication, schedules);
                return days != null ? ` · ${t('stock.daysLeft', { count: days })}` : "";
              })()}
              {isLow ? ` · ${t('stock.low')}` : ""}
            </Text>
          </View>
        );
      })()}

      {/* Weekly-injectable countdown (F3): next application date */}
      {medication.isInjectable && medication.isActive && (() => {
        const next = nextDueDate(medication, schedules, new Date());
        if (!next) return null;
        return (
          <View className="flex-row items-center gap-1.5 mt-2">
            <Ionicons name="timer-outline" size={14} color={theme.primary} />
            <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
              {next.inDays === 1
                ? t('sites.nextDoseTomorrow')
                : t('sites.nextDoseInDays', { count: next.inDays })}
            </Text>
          </View>
        );
      })()}

      {/* Schedules */}
      {schedules.length > 0 && (
        <View className="mt-3 gap-1">
          {schedules.map((s) => (
            <View
              key={s.id}
              style={{ backgroundColor: theme.isDark ? colors.bg + "26" : colors.light }}
              className="flex-row items-center gap-2 rounded-xl px-3 py-1.5"
            >
              <Ionicons name="alarm-outline" size={15} color={theme.isDark ? colors.bg : colors.text} />
              <Text style={{ color: theme.isDark ? colors.bg : colors.text }} className="text-xs font-medium">
                {scheduleLabel(s)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* PRN badge when no schedules */}
      {medication.isPRN && schedules.length === 0 && (
        <View
          style={{ backgroundColor: theme.isDark ? colors.bg + "26" : colors.light }}
          className="flex-row items-center gap-2 rounded-xl px-3 py-1.5 mt-3 self-start"
        >
          <Ionicons name="hand-left-outline" size={15} color={theme.isDark ? colors.bg : colors.text} />
          <Text style={{ color: theme.isDark ? colors.bg : colors.text }} className="text-xs font-medium">
            {t('medicationCard.nextDosePRN')}
          </Text>
        </View>
      )}

      {/* Log-a-dose action for as-needed meds — lets the user record a dose
          from the Medications tab instead of hunting the bottom of Home (UX I2). */}
      {medication.isPRN && medication.isActive && onLogPRN && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('medicationCard.logPRNDose')}
          onPress={onLogPRN}
          className="flex-row items-center justify-center gap-2 bg-primary rounded-xl px-4 py-3 min-h-[44px] mt-3"
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text className="text-white text-sm font-bold">{t('medicationCard.logPRNDose')}</Text>
        </TouchableOpacity>
      )}

      {/* Next dose indicator */}
      {nextDoseLabel && !medication.isPRN && (
        <View className="flex-row items-center gap-1 mt-2 ml-0.5">
          <Ionicons
            name={nextDoseLabel === t('medicationCard.todayComplete') ? "checkmark-circle" : "time-outline"}
            size={15}
            color={nextDoseLabel === t('medicationCard.todayComplete') ? theme.success : theme.primary}
          />
          <Text
            className="text-xs font-semibold"
            style={{ color: nextDoseLabel === t('medicationCard.todayComplete') ? theme.success : theme.primary }}
          >
            {nextDoseLabel}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View className="flex-row justify-end gap-4 mt-3">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${t('common.edit')} ${medication.name}`}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEdit(); }}
          className="flex-row items-center justify-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl px-4 py-3 min-h-[44px] min-w-[44px]"
        >
          <Ionicons name="pencil-outline" size={16} color="#3b82f6" />
          <Text className="text-blue-600 dark:text-blue-400 text-sm font-semibold">{t('common.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${t('common.delete')} ${medication.name}`}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); }}
          className="flex-row items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950/30 rounded-xl px-4 py-3 min-h-[44px] min-w-[44px]"
        >
          <Ionicons name="trash-outline" size={16} color={theme.danger} />
          <Text className="text-red-700 dark:text-red-400 text-sm font-semibold">{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

