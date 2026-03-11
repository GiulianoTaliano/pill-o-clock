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

export default function MedicationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const medications = useAppStore((s) => s.medications);
  const schedules = useAppStore((s) => s.schedules);
  const todayLogs = useAppStore((s) => s.todayLogs);
  const deleteMedication = useAppStore((s) => s.deleteMedication);
  const toggleActive = useAppStore((s) => s.toggleMedicationActive);
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
  const inactive = medications.filter((m) => !m.isActive);

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className="text-2xl font-black text-text">{t('medications.title')}</Text>
          <Text className="text-sm text-muted">{t('medications.subtitle', { count: medications.length })}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/medication/new"); }}
          className="bg-primary w-10 h-10 rounded-full items-center justify-center shadow-sm"
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
                  />
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
                <Text className="text-red-500 text-sm font-semibold">{t('medications.resetButtonFull')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
