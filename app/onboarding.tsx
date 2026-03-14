import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";
import * as IntentLauncher from "expo-intent-launcher";
import { useTranslation } from "../src/i18n";
import { setupNotifications, openExactAlarmSettings } from "../src/services/notifications";
import { checkFullScreenIntentPermission } from "expo-alarm";
import * as Haptics from "expo-haptics";

export const ONBOARDING_DONE_KEY = STORAGE_KEYS.ONBOARDING_DONE;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Slide data ────────────────────────────────────────────────────────────

type SlideConfig = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  iconBg: string;
  titleKey: string;
  subKey?: string;
  descKey: string;
};

const SLIDES: SlideConfig[] = [
  {
    icon: "medical",
    iconColor: "#4f9cff",
    iconBg: "#e0eeff",
    titleKey: "onboarding.slide1Title",
    subKey: "onboarding.slide1Sub",
    descKey: "onboarding.slide1Desc",
  },
  {
    icon: "notifications",
    iconColor: "#f59e0b",
    iconBg: "#fef3c7",
    titleKey: "onboarding.slide2Title",
    descKey: "onboarding.slide2Desc",
  },
  {
    icon: "calendar",
    iconColor: "#16a34a",
    iconBg: "#dcfce7",
    titleKey: "onboarding.slide3Title",
    descKey: "onboarding.slide3Desc",
  },
  {
    icon: "fitness",
    iconColor: "#e11d48",
    iconBg: "#ffe4e6",
    titleKey: "onboarding.slide4Title",
    descKey: "onboarding.slide4Desc",
  },
  {
    icon: "shield-checkmark",
    iconColor: "#4f9cff",
    iconBg: "#e0eeff",
    titleKey: "onboarding.slide5Title",
    descKey: "onboarding.slide5Desc",
  },
];

const LAST = SLIDES.length - 1;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [needsExactAlarm, setNeedsExactAlarm] = useState(false);
  const [needsFullScreen, setNeedsFullScreen] = useState(false);

  // ── Navigation ──────────────────────────────────────────────────────────

  function scrollTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setCurrentIndex(index);
  }

  function handleNext() {
    if (currentIndex < LAST) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      scrollTo(currentIndex + 1);
    }
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  }

  async function handleRequestPermission() {
    setRequestingPermission(true);
    try {
      const result = await setupNotifications();
      setPermissionGranted(result.granted);
      if (result.granted && Platform.OS === "android") {
        setNeedsExactAlarm(result.needsExactAlarmPermission);
        const hasFS = await checkFullScreenIntentPermission();
        setNeedsFullScreen(!hasFS);
      }
    } catch {
      setPermissionGranted(false);
    } finally {
      setRequestingPermission(false);
    }
  }

  async function handleOpenFullScreen() {
    try {
      await IntentLauncher.startActivityAsync(
        "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
        { data: "package:com.pilloclock.app" }
      );
    } catch {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: "package:com.pilloclock.app" }
      );
    }
  }

  async function handleStart() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Request permissions if not yet asked
    if (permissionGranted === null) {
      await handleRequestPermission();
    }
    storage.set(ONBOARDING_DONE_KEY, "1");
    router.replace("/(tabs)");
  }

  async function handleSkip() {
    // Request notification permission even when the user skips the onboarding
    // flow — otherwise alarms will never show without an explicit re-prompt.
    await setupNotifications().catch(() => {});
    storage.set(ONBOARDING_DONE_KEY, "1");
    router.replace("/(tabs)");
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const isLast = currentIndex === LAST;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Skip button */}
      {!isLast && (
        <View className="absolute top-12 right-5 z-10">
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text className="text-sm font-semibold text-muted">{t("onboarding.skip")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Slide carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        className="flex-1"
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={{ width: SCREEN_WIDTH }} className="flex-1 items-center justify-center px-8">
            {/* Icon bubble */}
            <View
              className="w-28 h-28 rounded-3xl items-center justify-center mb-8"
              style={{ backgroundColor: slide.iconBg }}
            >
              <Ionicons name={slide.icon} size={60} color={slide.iconColor} />
            </View>

            {/* Title */}
            <Text className="text-3xl font-bold text-text text-center mb-2">
              {t(slide.titleKey)}
            </Text>

            {/* Subtitle (optional) */}
            {slide.subKey && (
              <Text className="text-base font-semibold text-primary text-center mb-3">
                {t(slide.subKey)}
              </Text>
            )}

            {/* Description */}
            <Text className="text-base text-muted text-center leading-6">
              {t(slide.descKey)}
            </Text>

            {/* Feature chips (slide 1 only) */}
            {i === 0 && (
              <View className="mt-7 w-full gap-2.5">
                <View className="flex-row gap-2.5">
                  <View className="flex-1 flex-row items-center gap-2 rounded-2xl px-3 py-3 border border-primary/20 bg-primary/10">
                    <Ionicons name="medkit-outline" size={15} color="#4f9cff" />
                    <Text className="text-xs font-semibold text-primary">{t("onboarding.chip1")}</Text>
                  </View>
                  <View className="flex-1 flex-row items-center gap-2 rounded-2xl px-3 py-3 border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                    <Ionicons name="notifications-outline" size={15} color="#f59e0b" />
                    <Text className="text-xs font-semibold text-amber-600">{t("onboarding.chip2")}</Text>
                  </View>
                </View>
                <View className="flex-row gap-2.5">
                  <View className="flex-1 flex-row items-center gap-2 rounded-2xl px-3 py-3 border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                    <Ionicons name="calendar-outline" size={15} color="#16a34a" />
                    <Text className="text-xs font-semibold text-green-700">{t("onboarding.chip3")}</Text>
                  </View>
                  <View className="flex-1 flex-row items-center gap-2 rounded-2xl px-3 py-3 border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800">
                    <Ionicons name="fitness-outline" size={15} color="#e11d48" />
                    <Text className="text-xs font-semibold text-rose-600">{t("onboarding.chip4")}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Permission button on last slide */}
            {i === LAST && (
              <View className="mt-8 w-full gap-3">
                {/* Notifications */}
                {permissionGranted === null ? (
                  <TouchableOpacity
                    className="bg-primary rounded-2xl py-4 items-center"
                    onPress={handleRequestPermission}
                    disabled={requestingPermission}
                    activeOpacity={0.85}
                  >
                    <Text className="text-white font-bold text-base">
                      {t("onboarding.enableNotifications")}
                    </Text>
                  </TouchableOpacity>
                ) : permissionGranted ? (
                  <View className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl py-4 items-center">
                    <Text className="text-green-700 dark:text-green-400 font-bold text-base">
                      {t("onboarding.notificationsGranted")}
                    </Text>
                  </View>
                ) : (
                  <View className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-2xl py-4 px-4 items-center">
                    <Text className="text-amber-700 dark:text-amber-400 text-sm text-center">
                      {t("onboarding.notificationsDenied")}
                    </Text>
                  </View>
                )}

                {/* Exact alarm permission — Android 12/12L only */}
                {needsExactAlarm && (
                  <TouchableOpacity
                    className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-2xl py-3 px-4 flex-row items-center"
                    onPress={openExactAlarmSettings}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="alarm-outline" size={22} color="#f59e0b" />
                    <View className="flex-1 mx-3">
                      <Text className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        {t("onboarding.exactAlarmBtn")}
                      </Text>
                      <Text className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        {t("onboarding.exactAlarmHint")}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#f59e0b" />
                  </TouchableOpacity>
                )}

                {/* Full-screen intent permission — Android 14+ */}
                {needsFullScreen && (
                  <TouchableOpacity
                    className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-2xl py-3 px-4 flex-row items-center"
                    onPress={handleOpenFullScreen}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="phone-portrait-outline" size={22} color="#f59e0b" />
                    <View className="flex-1 mx-3">
                      <Text className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        {t("onboarding.fullScreenBtn")}
                      </Text>
                      <Text className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        {t("onboarding.fullScreenHint")}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#f59e0b" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Bottom bar: dots + button */}
      <View className="px-6 pb-8 pt-4">
        {/* Dots */}
        <View className="flex-row justify-center mb-6 gap-2">
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => scrollTo(i)}>
              <View
                className="rounded-full"
                style={{
                  width: i === currentIndex ? 20 : 8,
                  height: 8,
                  backgroundColor: i === currentIndex ? "#4f9cff" : "#cbd5e1",
                }}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA button */}
        {isLast ? (
          <TouchableOpacity
            className="bg-primary rounded-2xl py-4 items-center"
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-lg">{t("onboarding.start")}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className="bg-primary rounded-2xl py-4 items-center"
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-lg">{t("onboarding.next")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
