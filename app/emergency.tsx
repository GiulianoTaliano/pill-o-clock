/**
 * Emergency card (F3): who this person is, what they take, what they're
 * allergic to, and who to call — big type, first-aid oriented.
 *
 * SAFETY/PRIVACY TRADEOFF (deliberate): like /alarm, this route is EXEMPT
 * from the app lock — an emergency card behind a PIN is useless to a
 * bystander. The screen exists only if the user set it up, and Settings
 * says so explicitly next to the entry point.
 */
import { View, Text, ScrollView, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import {
  getActiveMedications,
  getActiveAllergies,
  getProfiles,
} from "../src/db/database";
import { getActiveProfileId } from "../src/services/profileStore";
import { getLocalizedDosageLong } from "../src/utils";
import type { Allergy, Medication, Profile } from "../src/types";

export default function EmergencyScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);

  useEffect(() => {
    (async () => {
      const [profiles, m, a] = await Promise.all([
        getProfiles(),
        getActiveMedications(),
        getActiveAllergies(),
      ]);
      setProfile(profiles.find((p) => p.id === getActiveProfileId()) ?? null);
      setMeds(m.filter((x) => x.isActive));
      setAllergies(a);
    })();
  }, []);

  const displayName = profile?.name || t("profiles.me");

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View className="flex-row items-center gap-3 mb-4">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color={theme.primary} />
          </TouchableOpacity>
          <View className="flex-row items-center gap-2 flex-1">
            <Ionicons name="medkit" size={24} color={theme.danger} />
            <Text className="text-2xl font-black text-text">{t("emergency.title")}</Text>
          </View>
        </View>

        {/* Who */}
        <View className="bg-card border border-border rounded-2xl p-5 mb-3">
          <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-1">
            {t("emergency.person")}
          </Text>
          <Text className="text-3xl font-black text-text">{displayName}</Text>
        </View>

        {/* Allergies — the first thing a first responder needs */}
        <View
          className="rounded-2xl p-5 mb-3 border"
          style={{
            backgroundColor: theme.isDark ? "#450a0a55" : "#fef2f2",
            borderColor: theme.danger,
          }}
        >
          <Text className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: theme.danger }}>
            {t("emergency.allergies")}
          </Text>
          {allergies.length === 0 ? (
            <Text className="text-xl font-bold text-text">{t("emergency.noKnownAllergies")}</Text>
          ) : (
            allergies.map((a) => (
              <Text key={a.id} className="text-xl font-bold text-text leading-8">
                • {a.name}
              </Text>
            ))
          )}
        </View>

        {/* Current medications */}
        <View className="bg-card border border-border rounded-2xl p-5 mb-3">
          <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-2">
            {t("emergency.medications")}
          </Text>
          {meds.length === 0 ? (
            <Text className="text-base text-muted">{t("emergency.noMeds")}</Text>
          ) : (
            meds.map((m) => (
              <Text key={m.id} className="text-lg font-semibold text-text leading-7">
                • {m.name} — {getLocalizedDosageLong(m, t)}
              </Text>
            ))
          )}
        </View>

        {/* Emergency contact */}
        {(profile?.emergencyContactName || profile?.emergencyContactPhone) && (
          <View className="bg-card border border-border rounded-2xl p-5 mb-3">
            <Text className="text-xs font-bold text-muted uppercase tracking-widest mb-1">
              {t("emergency.contact")}
            </Text>
            <Text className="text-xl font-bold text-text">{profile?.emergencyContactName}</Text>
            {profile?.emergencyContactPhone && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("emergency.call")}
                onPress={() => Linking.openURL(`tel:${profile.emergencyContactPhone}`)}
                className="flex-row items-center gap-2 mt-2 bg-primary rounded-xl px-4 py-3 self-start"
              >
                <Ionicons name="call" size={18} color="#ffffff" />
                <Text className="text-white text-lg font-bold">{profile.emergencyContactPhone}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text className="text-xs text-muted text-center mt-2">{t("emergency.footer")}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
