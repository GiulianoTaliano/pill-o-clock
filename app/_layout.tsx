import "../global.css";
import * as Sentry from "@sentry/react-native";
import { useEffect, useRef, useState } from "react";

// Initialise Sentry as early as possible (before any other imports render).
// Replace the DSN with your own from https://sentry.io — set it in EAS secrets
// as SENTRY_DSN and read it via expo-constants extra for production.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  // Only enable Sentry in production builds to keep dev logs clean.
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.2,
});
import { SplashScreen, Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Alert, AppState, Linking, View, Text, LogBox, Platform, UIManager } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { storage } from "../src/storage";
import { STORAGE_KEYS } from "../src/config";
import { initDatabase } from "../src/db/database";
import { setupNotifications, openExactAlarmSettings, rescheduleAllNotifications } from "../src/services/notifications";
import { checkFullScreenIntentPermission, requestFullScreenIntentPermission } from "expo-alarm";
// Side-effect import (registers TaskManager.defineTask) + named imports from same module.
import { registerBackgroundFetch, closeMissedDoses } from "../src/services/backgroundTask";
import { useAppStore } from "../src/store";
import { useNotificationResponseHandler } from "../src/hooks/useNotificationResponse";
import { initI18n, useTranslation } from "../src/i18n";
import { ToastProvider } from "../src/context/ToastContext";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { CopilotProvider } from "react-native-copilot";
import { CopilotTooltip } from "../components/CopilotTooltip";

// Enable LayoutAnimation on Android (must be called before any render).
if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const ONBOARDING_DONE_KEY = STORAGE_KEYS.ONBOARDING_DONE;

// Suppress known Expo Go informational warnings that are not actionable in our
// local-notification-only app.  These disappear automatically when running a
// production / development build instead of Expo Go.
LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "`expo-notifications` functionality is not fully supported in Expo Go",
  "SafeAreaView has been deprecated",
]);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { t } = useTranslation();
  const loadAll = useAppStore((s) => s.loadAll);
  const loadTodayLogs = useAppStore((s) => s.loadTodayLogs);
  const loadThemeMode = useAppStore((s) => s.loadThemeMode);
  const router = useRouter();

  // Navigate to onboarding exactly once after the layout is ready.
  // Using a one-shot effect (rather than a persistent <Redirect> component)
  // avoids an infinite loop: a persistent Redirect re-fires on every
  // re-render, which now happens on every pathname change after adding
  // route-awareness to the layout.
  const onboardingNavigatedRef = useRef(false);
  useEffect(() => {
    if (!ready || !showOnboarding || onboardingNavigatedRef.current) return;
    onboardingNavigatedRef.current = true;
    setShowOnboarding(false);
    router.replace("/onboarding");
  }, [ready, showOnboarding, router]);

  useNotificationResponseHandler();

  useEffect(() => {
    (async () => {
      try {
        await initI18n();
        await initDatabase();
        loadThemeMode();

        const onboardingDone = storage.getString(ONBOARDING_DONE_KEY);

        // Detect alarm deep-link cold-start.
        // When the app is opened from a notification tap or fullScreenIntent,
        // the initial URL contains the alarm route.  In that case we must run
        // the full notification/data setup even if onboarding has never been
        // completed — otherwise the alarm screen can't access store data, and
        // the onboarding Redirect would hijack the navigation stack.
        const initialUrl = await Linking.getInitialURL();
        const isAlarmColdStart =
          !!initialUrl &&
          (initialUrl.includes("pilloclock://alarm") || initialUrl.includes("/alarm?"));

        if (onboardingDone || isAlarmColdStart) {
          // Normal launch: setup notifications and reschedule if needed.
          const { needsExactAlarmPermission } = await setupNotifications();
          await loadAll();
          await registerBackgroundFetch();
          // Close missed doses from previous days so history is accurate.
          closeMissedDoses().catch((e) => {
            console.warn("[closeMissedDoses]", e);
            Sentry.captureException(e, { tags: { task: "closeMissedDoses" } });
          });

          if (needsExactAlarmPermission) {
            const alreadyPrompted = storage.getString(
              STORAGE_KEYS.EXACT_ALARM_PROMPTED
            );
            if (!alreadyPrompted) {
              storage.set(STORAGE_KEYS.EXACT_ALARM_PROMPTED, "1");
              Alert.alert(
                t('permissions.exactAlarmTitle'),
                t('permissions.exactAlarmMessage'),
                [
                  { text: t('permissions.exactAlarmLater'), style: "cancel" },
                  {
                    text: t('permissions.exactAlarmOpen'),
                    onPress: openExactAlarmSettings,
                  },
                ]
              );
            }
          }

          // Android 14+ (API 34): check USE_FULL_SCREEN_INTENT permission.
          // Without it the alarm screen won’t appear above the lock screen.
          if (Platform.OS === "android") {
            const hasFullScreen = await checkFullScreenIntentPermission();
            if (!hasFullScreen) {
              const alreadyPrompted = storage.getString(
                STORAGE_KEYS.FULLSCREEN_INTENT_PROMPTED
              );
              if (!alreadyPrompted) {
                storage.set(STORAGE_KEYS.FULLSCREEN_INTENT_PROMPTED, "1");
                Alert.alert(
                  t('permissions.fullScreenTitle'),
                  t('permissions.fullScreenMessage'),
                  [
                    { text: t('permissions.exactAlarmLater'), style: "cancel" },
                    {
                      text: t('permissions.exactAlarmOpen'),
                      onPress: () => requestFullScreenIntentPermission().catch(() => {}),
                    },
                  ]
                );
              }
            }
          }
          // alarm cold-start: data + notifications are set up; onboarding is
          // NOT forced here to avoid redirect loops. If the user has never
          // completed onboarding they will see it on the next regular launch.
        } else {
          // First launch (normal): load data and defer notification setup to onboarding.
          await loadAll();
          setShowOnboarding(true);
        }

        setReady(true);
      } catch (e) {
        setError(String(e));
        setReady(true);
      } finally {
        await SplashScreen.hideAsync();
      }
    })();
  // loadAll and t are intentionally omitted: re-running the init effect when
  // the language changes would re-initialize the database and notifications.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh today's logs and reschedule notifications whenever the app
  // comes back to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadTodayLogs();
        rescheduleAllNotifications().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [loadTodayLogs]);

  if (!ready) return null;

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-danger text-base text-center">{error}</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <CopilotProvider
          tooltipComponent={CopilotTooltip}
          animated
          overlay="svg"
          backdropColor="rgba(0,0,0,0.78)"
          arrowColor="#ffffff"
          margin={10}
          stepNumberComponent={() => null}
          verticalOffset={0}
          androidStatusBarVisible
        >
        <ToastProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="medication/new"
            options={{
              headerShown: true,
              title: t('form.newTitle'),
              presentation: "modal",
              headerStyle: { backgroundColor: "#f0f6ff" },
              headerTintColor: "#1e293b",
            }}
          />
          <Stack.Screen
            name="medication/[id]"
            options={{
              headerShown: true,
              title: t('form.editTitle'),
              presentation: "modal",
              headerStyle: { backgroundColor: "#f0f6ff" },
              headerTintColor: "#1e293b",
            }}
          />
          <Stack.Screen
            name="alarm"
            options={{
              headerShown: false,
              presentation: "fullScreenModal",
              gestureEnabled: false,
            }}
          />
        </Stack>
          {/* <Redirect> removed — onboarding navigation is handled by the
              one-shot useEffect above, which avoids re-render loops. */}
        </ToastProvider>
        </CopilotProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
