import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "../src/i18n";
import { setupNotifications } from "../src/services/notifications";

export const ONBOARDING_DONE_KEY = "@pilloclock/onboarding_done";

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
    icon: "bar-chart",
    iconColor: "#16a34a",
    iconBg: "#dcfce7",
    titleKey: "onboarding.slide3Title",
    descKey: "onboarding.slide3Desc",
  },
  {
    icon: "shield-checkmark",
    iconColor: "#4f9cff",
    iconBg: "#e0eeff",
    titleKey: "onboarding.slide4Title",
    descKey: "onboarding.slide4Desc",
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

  // ── Navigation ──────────────────────────────────────────────────────────

  function scrollTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setCurrentIndex(index);
  }

  function handleNext() {
    if (currentIndex < LAST) {
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
    } catch {
      setPermissionGranted(false);
    } finally {
      setRequestingPermission(false);
    }
  }

  async function handleStart() {
    // Request permissions if not yet asked
    if (permissionGranted === null) {
      await handleRequestPermission();
    }
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
    router.replace("/(tabs)");
  }

  async function handleSkip() {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, "1");
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
              className="w-28 h-28 rounded-3xl items-center justify-center mb-10"
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
              <Text className="text-base font-semibold text-primary text-center mb-4">
                {t(slide.subKey)}
              </Text>
            )}

            {/* Description */}
            <Text className="text-base text-muted text-center leading-6">
              {t(slide.descKey)}
            </Text>

            {/* Permission button on last slide */}
            {i === LAST && (
              <View className="mt-8 w-full">
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
                  <View className="bg-green-50 border border-green-200 rounded-2xl py-4 items-center">
                    <Text className="text-green-700 font-bold text-base">
                      {t("onboarding.notificationsGranted")}
                    </Text>
                  </View>
                ) : (
                  <View className="bg-amber-50 border border-amber-200 rounded-2xl py-4 px-4 items-center">
                    <Text className="text-amber-700 text-sm text-center">
                      {t("onboarding.notificationsDenied")}
                    </Text>
                  </View>
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
