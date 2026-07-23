import { View, Text, ScrollView, TouchableOpacity, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppStore } from "../../src/store";
import { MedicationCard } from "../../components/MedicationCard";
import { EmptyState } from "../../components/EmptyState";
import { useState } from "react";
import { useTranslation } from "../../src/i18n";
import { prnWarningMessage } from "../../src/services/prnLimits";
import { useAppTheme } from "../../src/hooks/useAppTheme";

export default function MedicationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const todayLogs = useAppStore((s) => s.todayLogs);
  const deleteMedication = useAppStore((s) => s.deleteMedication);
  const toggleActive = useAppStore((s) => s.toggleMedicationActive);
  const logPRNDose = useAppStore((s) => s.logPRNDose);
  const loadAll = useAppStore((s) => s.loadAll);
  const resetAllData = useAppStore((s) => s.resetAllData);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleToggleActive = (id: string, val: boolean) => {
    toggleActive(id, val);
  };

  // Archive instead of delete (F3): reason picker via Alert buttons.
  const archiveMedication = useAppStore((st) => st.archiveMedication);
  const unarchiveMedication = useAppStore((st) => st.unarchiveMedication);

  const handleArchive = (id: string, name: string) => {
    const reasons = ["finished", "doctor", "side_effects", "other"] as const;
    Alert.alert(
      t("archive.confirmTitle", { name }),
      t("archive.confirmMsg"),
      [
        ...reasons.map((r) => ({
          text: t(`archive.reason_${r}`),
          onPress: () => archiveMedication(id, r),
        })),
        { text: t("common.cancel"), style: "cancel" as const },
      ]
    );
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      t('medications.deleteTitle'),
      t('medications.deleteMessage', { name }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: () => {
            deleteMedication(id);
          },
        },
      ]
    );
  };

  const handleLogPRN = (id: string, name: string) => {
    // Confirm before logging so an accidental tap can't record a phantom dose
    // (as-needed logs are permanent and decrement stock) — audit UX I2.
    Alert.alert(
      t('medicationCard.logPRNTitle'),
      t('medicationCard.logPRNConfirm', { name }),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('medicationCard.logPRNConfirmBtn'),
          onPress: async () => {
            const med = medications.find((m) => m.id === id);
            if (!med) return;
            const check = await logPRNDose(med);
            if (check?.blocked) {
              // PRN safety limit hit — warn, allow explicit override (F2).
              Alert.alert(
                t('prn.limitTitle'),
                prnWarningMessage(t, med, check),
                [
                  { text: t('common.cancel'), style: "cancel" },
                  {
                    text: t('prn.logAnyway'),
                    style: "destructive",
                    onPress: () => { logPRNDose(med, { force: true }); },
                  },
                ]
              );
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleReset = () => {
    Alert.alert(
      t('medications.resetTitle'),
      t('medications.resetMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('medications.resetButton'),
          style: "destructive",
          onPress: () => {
            resetAllData();
          },
        },
      ]
    );
  };

  const active = medications.filter((m) => m.isActive);
  const inactive = medications.filter((m) => !m.isActive && !m.archivedAt);
  const archived = medications.filter((m) => !!m.archivedAt);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-black text-text">{t('medications.title')}</Text>
          <Text className="text-sm text-muted">{t('medications.subtitle', { count: medications.length })}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('form.addButton')}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/medication/new"); }}
          className="bg-primary w-11 h-11 rounded-full items-center justify-center shadow-sm"
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-2"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4f9cff" />
        }
        showsVerticalScrollIndicator={false}
      >
        {medications.length === 0 ? (
          <EmptyState
            icon="medkit-outline"
            title={t('medications.noMeds')}
            subtitle={t('medications.noMedsSubtitle')}
          />
        ) : (
          <>
            {active.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                  {t('medications.sectionActive')}
                </Text>
                {active.map((med) => (
                  <MedicationCard
                    key={med.id}
                    medication={med}
                    schedules={schedules.filter((s) => s.medicationId === med.id)}
                    todayLogs={todayLogs}
                    onEdit={() => router.push(`/medication/${med.id}`)}
                    onDelete={() => handleDelete(med.id, med.name)}
                    onToggleActive={(val) => handleToggleActive(med.id, val)}
                    onLogPRN={() => handleLogPRN(med.id, med.name)}
                    onArchive={() => handleArchive(med.id, med.name)}
                  />
                ))}
              </>
            )}

            {/* Separator — only rendered when both sections coexist */}
            {active.length > 0 && inactive.length > 0 && (
              <View className="h-px bg-border my-4" />
            )}

            {inactive.length > 0 && (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                  {t('medications.sectionInactive')}
                </Text>
                {inactive.map((med) => (
                  <MedicationCard
                    key={med.id}
                    medication={med}
                    schedules={schedules.filter((s) => s.medicationId === med.id)}
                    todayLogs={todayLogs}
                    onEdit={() => router.push(`/medication/${med.id}`)}
                    onDelete={() => handleDelete(med.id, med.name)}
                    onToggleActive={(val) => handleToggleActive(med.id, val)}
                    onArchive={() => handleArchive(med.id, med.name)}
                  />
                ))}
              </>
            )}

            {/* Archived (F3): history kept, compact rows, unarchive action */}
            {archived.length > 0 && (
              <>
                <View className="h-px bg-border my-4" />
                <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
                  {t("archive.section")}
                </Text>
                {archived.map((med) => (
                  <View
                    key={med.id}
                    className="flex-row items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 mb-2 opacity-80"
                  >
                    <Ionicons name="archive-outline" size={18} color={theme.muted} />
                    <View className="flex-1">
                      <Text className="text-[15px] font-semibold text-text" numberOfLines={1}>
                        {med.name}
                      </Text>
                      <Text className="text-[11px] text-muted mt-0.5">
                        {t(`archive.reason_${med.archiveReason ?? "other"}` as never)} · {med.archivedAt?.slice(0, 10)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("archive.restore")}
                      onPress={() => unarchiveMedication(med.id)}
                      className="p-2"
                    >
                      <Ionicons name="refresh-outline" size={18} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t("common.delete")}
                      onPress={() => handleDelete(med.id, med.name)}
                      className="p-2"
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <View className="h-6" />

            {/* Dev / danger zone */}
            {__DEV__ && (
              <TouchableOpacity
                onPress={handleReset}
                className="flex-row items-center justify-center gap-2 border border-red-200 dark:border-red-800 rounded-2xl p-4 mb-8 bg-red-50 dark:bg-red-950/30"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text className="text-red-700 dark:text-red-400 text-sm font-semibold">{t('medications.resetButtonFull')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
