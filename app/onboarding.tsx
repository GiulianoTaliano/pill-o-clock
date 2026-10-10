import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  AppState,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Illustration, { IllustrationName } from "../components/Illustration";
import { useRouter } from "expo-router";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import {
  setupNotifications,
  openExactAlarmSettings,
} from "../src/services/notifications";
import { registerBackgroundFetch } from "../src/services/backgroundTask";
import { requestFullScreenIntentPermission } from "expo-alarm";
import {
  getReminderReadiness,
  type ReminderReadiness,
} from "../src/services/reminderReadiness";

export const ONBOARDING_DONE_KEY = STORAGE_KEYS.ONBOARDING_DONE;
const SLIDES: { art: IllustrationName; title: string; desc: string }[] = [
  {
    art: "obMeds",
    title: "onboarding.slide1Title",
    desc: "onboarding.slide1Desc",
  },
  {
    art: "obAlarm",
    title: "onboarding.slide2Title",
    desc: "onboarding.slide2Desc",
  },
  {
    art: "obAppointments",
    title: "onboarding.slide3Title",
    desc: "onboarding.slide3Desc",
  },
  {
    art: "obHealth",
    title: "onboarding.slide4Title",
    desc: "onboarding.slide4Desc",
  },
  {
    art: "obPrivacy",
    title: "onboarding.slide6Title",
    desc: "onboarding.slide6Desc",
  },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);
  const [readiness, setReadiness] = useState<ReminderReadiness | null>(null);
  const refresh = useCallback(
    async () => setReadiness(await getReminderReadiness()),
    []
  );
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const last = step === SLIDES.length - 1;
  const slide = SLIDES[step];
  // Completion never triggers permissions: only the explicit enable action does.
  const start = () => {
    if (starting) return;
    setStarting(true);
    storage.set(ONBOARDING_DONE_KEY, "1");
    // The root layout skipped this setup on first launch: create the channels,
    // handler and background task now, still without asking for permission.
    void setupNotifications({ requestPermissions: false })
      .then(() => registerBackgroundFetch())
      .catch(() => {});
    router.replace("/(tabs)");
  };
  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await setupNotifications();
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const open = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      setError(true);
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-5 flex-row items-center justify-between">
        <Text className="text-sm text-muted" accessibilityLiveRegion="polite">
          {t("uxSettings.onboardingProgress", {
            step: step + 1,
            total: SLIDES.length,
          })}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={start}
          disabled={starting}
          className="min-h-[48px] justify-center px-3"
        >
          <Text className="text-primary font-semibold">
            {t("onboarding.skip")}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        key={step}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 28,
          paddingVertical: 24,
        }}
        showsVerticalScrollIndicator
      >
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          className="rounded-3xl bg-card-alt items-center justify-center mb-6"
          style={{
            width: Math.min(156, height * 0.23),
            height: Math.min(156, height * 0.23),
          }}
        >
          <Illustration name={slide.art} width={Math.min(132, height * 0.2)} />
        </View>
        <Text
          accessibilityRole="header"
          className="text-3xl font-bold text-text text-center mb-4"
        >
          {t(slide.title)}
        </Text>
        <Text className="text-base text-muted text-center leading-7">
          {t(slide.desc)}
        </Text>
        {last && (
          <View className="mt-6 w-full gap-3">
            <Text className="text-sm text-muted leading-6">
              {t("uxSettings.onboardingReminder")}
            </Text>
            {Platform.OS !== "web" && (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ busy, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    void enable();
                  }}
                  className="bg-action rounded-2xl min-h-[52px] justify-center items-center px-4 py-3"
                >
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text className="text-white font-bold text-base text-center">
                      {readiness?.notifications === "granted"
                        ? t("onboarding.notificationsGranted")
                        : t("onboarding.enableNotifications")}
                    </Text>
                  )}
                </TouchableOpacity>
                {readiness?.notifications === "denied" && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      void open(Linking.openSettings);
                    }}
                    className="min-h-[48px] justify-center"
                  >
                    <Text className="text-primary font-semibold">
                      {t("uxSettings.notifications")} · {t("uxSettings.denied")}
                    </Text>
                  </TouchableOpacity>
                )}
                {Platform.OS === "android" && readiness?.exact === "denied" && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      void open(openExactAlarmSettings);
                    }}
                    className="min-h-[48px] justify-center"
                  >
                    <Text className="text-primary font-semibold">
                      {t("onboarding.exactAlarmBtn")}
                    </Text>
                  </TouchableOpacity>
                )}
                {Platform.OS === "android" &&
                  readiness?.fullScreen === "denied" && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => {
                        void open(requestFullScreenIntentPermission);
                      }}
                      className="min-h-[48px] justify-center"
                    >
                      <Text className="text-primary font-semibold">
                        {t("onboarding.fullScreenBtn")}
                      </Text>
                    </TouchableOpacity>
                  )}
              </>
            )}
            {(error || readiness?.notifications === "error") && (
              <Text
                accessibilityLiveRegion="polite"
                className="text-danger text-sm"
              >
                {t("uxSettings.error")}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      <View className="px-5 pb-4">
        <View className="flex-row justify-center">
          {SLIDES.map((_, index) => (
            <TouchableOpacity
              key={index}
              accessibilityRole="button"
              accessibilityLabel={t("onboarding.goToSlide", {
                number: index + 1,
              })}
              accessibilityState={{ selected: step === index }}
              onPress={() => setStep(index)}
              style={{
                minWidth: 48,
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: step === index ? 24 : 8,
                  height: 8,
                  borderRadius: 8,
                  backgroundColor: step === index ? theme.primary : theme.muted,
                }}
              />
            </TouchableOpacity>
          ))}
        </View>
        <View className="flex-row gap-3">
          {step > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              onPress={() => setStep(step - 1)}
              className="bg-card border border-border rounded-2xl min-h-[52px] min-w-[52px] items-center justify-center"
            >
              <Ionicons name="arrow-back" size={24} color={theme.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={starting}
            accessibilityState={{ disabled: starting }}
            onPress={last ? start : () => setStep(step + 1)}
            className="flex-1 rounded-2xl bg-action min-h-[52px] px-4 py-3 items-center justify-center"
          >
            <Text className="font-bold text-white text-base text-center">
              {last ? t("uxSettings.onboardingLater") : t("onboarding.next")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
