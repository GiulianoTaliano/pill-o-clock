import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useState } from "react";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import {
  getActiveMedications,
  getActiveAllergies,
  getProfiles,
  getSchedulesByMedication,
} from "../src/db/database";
import { getActiveProfileId } from "../src/services/profileStore";
import {
  describeMedicationPlan,
  isMedicationCurrent,
} from "../src/services/carePlan";
import { withEffectiveDose } from "../src/services/regimen";
import { getLocalizedDosageLong, toDateString } from "../src/utils";
import type { Allergy, Medication, Profile, Schedule } from "../src/types";

/** Intentionally available during app lock. Unknown information must remain unknown. */
export default function EmergencyScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [schedules, setSchedules] = useState<Map<string, Schedule[]>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const profileId = getActiveProfileId();
      const [profiles, m, a] = await Promise.all([
        getProfiles(),
        getActiveMedications(),
        getActiveAllergies(),
      ]);
      const current = m.filter((x) => isMedicationCurrent(x));
      const plan = new Map(
        await Promise.all(
          current.map(
            async (x) => [x.id, await getSchedulesByMedication(x.id)] as const
          )
        )
      );
      if (getActiveProfileId() !== profileId)
        throw new Error("Profile changed");
      const person = profiles.find((p) => p.id === profileId);
      if (!person) throw new Error("Profile unavailable");
      setProfile(person);
      setMeds(current);
      setAllergies(a);
      setSchedules(plan);
      setLoadedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const call = async () => {
    try {
      await Linking.openURL(`tel:${profile!.emergencyContactPhone}`);
    } catch {
      Alert.alert(t("common.error"), t("uxHealth.callError"));
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View className="flex-row items-center gap-3 mb-5">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={() => router.back()}
            className="w-12 h-12 bg-card border border-border rounded-2xl items-center justify-center"
          >
            <Ionicons name="arrow-back" size={22} color={theme.primary} />
          </TouchableOpacity>
          <Text
            accessibilityRole="header"
            className="text-2xl font-bold text-text flex-1"
          >
            {t("emergency.title")}
          </Text>
        </View>
        {loading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color={theme.primary} />
            <Text accessibilityLiveRegion="polite" className="text-muted mt-4">
              {t("uxHealth.loading")}
            </Text>
          </View>
        ) : error ? (
          <View className="bg-card border border-border rounded-2xl p-5">
            <Text
              accessibilityRole="alert"
              className="text-lg font-semibold text-text"
            >
              {t("uxHealth.cannotLoadProfile")}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void load()}
              className="min-h-[48px] bg-action rounded-2xl p-3 items-center mt-4"
            >
              <Text className="text-white font-semibold">
                {t("uxHealth.retry")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="bg-card border border-border rounded-2xl p-5 mb-4">
              <Text className="text-sm text-muted mb-2">
                {t("emergency.person")}
              </Text>
              <Text className="text-3xl font-bold text-text">
                {profile?.name || t("profiles.me")}
              </Text>
              {loadedAt && (
                <Text className="text-sm text-muted mt-3">
                  {t("uxHealth.exportDate", {
                    date: format(loadedAt, "Pp", { locale: getDateLocale() }),
                  })}
                </Text>
              )}
            </View>
            <View className="bg-card border-2 border-danger rounded-2xl p-5 mb-4">
              <Text
                accessibilityRole="header"
                className="text-lg font-bold text-danger mb-3"
              >
                {t("emergency.allergies")}
              </Text>
              {allergies.length ? (
                allergies.map((a) => (
                  <Text
                    key={a.id}
                    className="text-2xl font-semibold text-text leading-9"
                  >
                    • {a.name}
                  </Text>
                ))
              ) : (
                <>
                  <Text className="text-xl font-semibold text-text">
                    {t("uxHealth.unknownAllergies")}
                  </Text>
                  <Text className="text-base text-muted mt-2">
                    {t("uxHealth.unknownAllergiesHint")}
                  </Text>
                </>
              )}
            </View>
            {(profile?.emergencyContactName ||
              profile?.emergencyContactPhone) && (
              <View className="bg-card border border-border rounded-2xl p-5 mb-4">
                <Text className="text-sm text-muted mb-2">
                  {t("emergency.contact")}
                </Text>
                <Text className="text-2xl font-semibold text-text">
                  {profile.emergencyContactName}
                </Text>
                {profile.emergencyContactPhone && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${t("emergency.call")}, ${
                      profile.emergencyContactPhone
                    }`}
                    onPress={() => void call()}
                    className="min-h-[56px] bg-action rounded-2xl p-4 mt-4 flex-row items-center justify-center gap-3"
                  >
                    <Ionicons name="call" size={22} color="#fff" />
                    <Text className="text-white text-xl font-bold">
                      {profile.emergencyContactPhone}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <View className="bg-card border border-border rounded-2xl p-5 mb-4">
              <Text
                accessibilityRole="header"
                className="text-lg font-bold text-text mb-4"
              >
                {t("emergency.medications")}
              </Text>
              {!meds.length ? (
                <Text className="text-base text-muted">
                  {t("emergency.noMeds")}
                </Text>
              ) : (
                meds.map((m) => (
                  <View key={m.id} className="mb-5">
                    <Text className="text-xl font-semibold text-text">
                      {m.name} ·{" "}
                      {getLocalizedDosageLong(
                        withEffectiveDose(m, toDateString(new Date())),
                        t
                      )}
                    </Text>
                    <Text className="text-base text-muted mt-2 leading-6">
                      {describeMedicationPlan(m, schedules.get(m.id) ?? [], t)}
                    </Text>
                  </View>
                ))
              )}
            </View>
            <Text className="text-sm text-muted leading-5">
              {t("emergency.footer")}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
