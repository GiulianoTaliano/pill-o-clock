import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { addDays, format } from "date-fns";
import type { Medication, Schedule, DoseLog } from "../src/types";
import {
  getColorConfig,
  isScheduleActiveOnDate,
  formatTimeForDisplay,
  getLocalizedDosage,
  estimateDaysOfSupply,
} from "../src/utils";
import { withEffectiveDose } from "../src/services/regimen";
import {
  effectiveDoseDateTime,
  formatSnoozedTime,
} from "../src/services/doseTime";
import { useAppStore } from "../src/store";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface MedicationCardProps {
  medication: Medication;
  schedules: Schedule[];
  onEdit: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onToggleActive: (active: boolean) => void;
  todayLogs?: DoseLog[];
  onLogPRN?: () => void;
  disabled?: boolean;
}
export function MedicationCard({
  medication,
  schedules,
  onEdit,
  onDelete,
  onArchive,
  onRestore,
  onToggleActive,
  todayLogs = [],
  onLogPRN,
  disabled,
}: MedicationCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [menu, setMenu] = useState(false);
  const snoozedTimes = useAppStore((state) => state.snoozedTimes);
  const colors = getColorConfig(medication.color);
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const resolved = new Set(
    todayLogs
      .filter(
        (log) =>
          log.medicationId === medication.id &&
          (log.status === "taken" || log.status === "skipped")
      )
      .map((log) => `${log.scheduleId}-${log.scheduledDate}`)
  );
  let next: { date: string; time: string; postponed?: string } | undefined;
  if (medication.isActive && !medication.isPRN) {
    for (let day = 0; day < 62 && !next; day++) {
      const date = addDays(now, day);
      const dateStr = format(date, "yyyy-MM-dd");
      const candidates = schedules
        .filter(
          (schedule) =>
            isScheduleActiveOnDate(schedule, date, medication) &&
            !resolved.has(`${schedule.id}-${dateStr}`)
        )
        .map((schedule) => ({
          date: dateStr,
          time: schedule.time,
          postponed: snoozedTimes[`${schedule.id}-${dateStr}`],
        }))
        .filter(
          (candidate) =>
            effectiveDoseDateTime(
              candidate.date,
              candidate.time,
              candidate.postponed
            ) > now
        )
        .sort(
          (a, b) =>
            effectiveDoseDateTime(a.date, a.time, a.postponed).getTime() -
            effectiveDoseDateTime(b.date, b.time, b.postponed).getTime()
        );
      next = candidates[0];
    }
    for (const schedule of schedules) {
      for (const [key, postponed] of Object.entries(snoozedTimes)) {
        const date = key.slice(-10);
        if (
          key.slice(0, -11) !== schedule.id ||
          date >= today ||
          !postponed.includes("T") ||
          resolved.has(`${schedule.id}-${date}`)
        )
          continue;
        const candidate = { date, time: schedule.time, postponed };
        const fireDate = effectiveDoseDateTime(date, schedule.time, postponed);
        if (
          fireDate > now &&
          (!next ||
            fireDate <
              effectiveDoseDateTime(next.date, next.time, next.postponed))
        )
          next = candidate;
      }
    }
  }
  const latestPRN = todayLogs
    .filter(
      (log) => log.medicationId === medication.id && log.status === "taken"
    )
    .sort((a, b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? ""))[0];
  const days = estimateDaysOfSupply(medication, schedules);
  const status = medication.archivedAt
    ? "archived"
    : medication.isActive
    ? "active"
    : "paused";
  return (
    <View className="bg-card rounded-2xl border border-border p-4 mb-3">
      <View className="flex-row items-start gap-3">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${t("common.edit")} ${medication.name}`}
          disabled={disabled}
          onPress={onEdit}
          className="flex-1 flex-row gap-3 items-start min-h-[48px]"
        >
          {medication.photoUri ? (
            <Image
              source={{ uri: medication.photoUri }}
              className="w-11 h-11 rounded-xl"
            />
          ) : (
            <View
              style={{ backgroundColor: colors.light }}
              className="w-11 h-11 rounded-xl items-center justify-center"
            >
              <Ionicons name="medical-outline" size={22} color={colors.text} />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-lg font-bold text-text">
              {medication.name}
            </Text>
            <Text className="text-base text-text mt-1">
              {getLocalizedDosage(withEffectiveDose(medication, today), t)}
            </Text>
            <Text className="text-sm text-muted mt-1">
              {t(`uxMedication.${status}`)}
            </Text>
          </View>
        </TouchableOpacity>
        {!medication.archivedAt && (
          <Switch
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityLabel={`${medication.name}: ${t(
              "uxMedication." + status
            )}`}
            accessibilityState={{ checked: medication.isActive, disabled }}
            accessibilityHint={t(
              medication.isActive
                ? "medications.toggleOffHint"
                : "medications.toggleOnHint"
            )}
            value={medication.isActive}
            onValueChange={onToggleActive}
            trackColor={{ true: theme.primary }}
          />
        )}
      </View>
      {next && (
        <View className="flex-row items-start gap-2 mt-3">
          <Ionicons name="time-outline" size={18} color={theme.primary} />
          <Text className="flex-1 text-base text-primary font-semibold">
            {t("medicationCard.nextDose", {
              time: next.postponed
                ? formatSnoozedTime(next.postponed)
                : `${
                    next.date === today
                      ? ""
                      : format(new Date(next.date + "T12:00"), "d MMM", {
                          locale: getDateLocale(),
                        }) + " · "
                  }${formatTimeForDisplay(next.time)}`,
            })}
          </Text>
        </View>
      )}
      {medication.isPRN && latestPRN?.takenAt && (
        <Text className="text-sm text-muted mt-3">
          {t("uxMedication.prnLast", {
            time: format(new Date(latestPRN.takenAt), "d MMM HH:mm", {
              locale: getDateLocale(),
            }),
          })}
        </Text>
      )}
      {medication.stockQuantity != null && (
        <Text
          className={`text-sm mt-3 ${
            medication.stockAlertThreshold != null &&
            medication.stockQuantity <= medication.stockAlertThreshold
              ? "text-danger font-semibold"
              : "text-muted"
          }`}
        >
          {medication.stockQuantity} {t("uxMedication.stockUnit")}
          {days != null ? ` · ${t("stock.daysLeft", { count: days })}` : ""}
        </Text>
      )}
      <View className="flex-row items-center gap-2 mt-3">
        {medication.isPRN && medication.isActive && onLogPRN && (
          <TouchableOpacity
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${t("medicationCard.logPRNDose")} ${
              medication.name
            }`}
            onPress={onLogPRN}
            className="flex-1 bg-action rounded-xl py-3 px-4 min-h-[48px] items-center"
          >
            <Text className="text-white font-bold text-base">
              {t("medicationCard.logPRNDose")}
            </Text>
          </TouchableOpacity>
        )}
        {onRestore && (
          <TouchableOpacity
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${t("archive.restore")} ${medication.name}`}
            onPress={onRestore}
            className="flex-1 border border-border rounded-xl py-3 px-4 min-h-[48px] items-center"
          >
            <Text className="text-primary font-semibold text-base">
              {t("archive.restore")}
            </Text>
          </TouchableOpacity>
        )}
        {!medication.archivedAt && (
          <TouchableOpacity
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${t("common.edit")} ${medication.name}`}
            onPress={onEdit}
            className="flex-1 py-3 px-4 min-h-[48px] items-center rounded-xl border border-border"
          >
            <Text className="text-primary font-semibold text-base">
              {t("common.edit")}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${t("uxMedication.manage")} ${medication.name}`}
          onPress={() => setMenu(true)}
          className="w-12 h-12 rounded-xl border border-border items-center justify-center"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={theme.secondaryText}
          />
        </TouchableOpacity>
      </View>
      <Modal
        visible={menu}
        transparent
        animationType="slide"
        onRequestClose={() => setMenu(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => setMenu(false)}
        >
          <Pressable
            onPress={() => {}}
            className="bg-card rounded-t-3xl px-5 pt-5 pb-10"
          >
            <Text
              accessibilityRole="header"
              className="text-xl font-bold text-text mb-3"
            >
              {medication.name}
            </Text>
            {onArchive && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  setMenu(false);
                  onArchive();
                }}
                className="min-h-[52px] py-4"
              >
                <Text className="text-base text-text">
                  {t("uxMedication.archive")}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setMenu(false);
                onDelete();
              }}
              className="min-h-[52px] py-4"
            >
              <Text className="text-base text-danger">
                {t("common.delete")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setMenu(false)}
              className="min-h-[52px] py-4 border-t border-border"
            >
              <Text className="text-base text-text font-semibold">
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
