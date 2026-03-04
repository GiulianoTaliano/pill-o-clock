import "../global.css";
import "../src/services/backgroundTask"; // registers TaskManager.defineTask at module load
import { useEffect, useState } from "react";
import { Redirect, SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Alert, AppState, View, Text, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initDatabase } from "../src/db/database";
import { setupNotifications, openExactAlarmSettings, rescheduleAllNotifications } from "../src/services/notifications";
import { registerBackgroundFetch } from "../src/services/backgroundTask";
import { useAppStore } from "../src/store";
import { useNotificationResponseHandler } from "../src/hooks/useNotificationResponse";
import { initI18n, useTranslation } from "../src/i18n";
import { ToastProvider } from "../src/context/ToastContext";

const ONBOARDING_DONE_KEY = "@pilloclock/onboarding_done";

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

  useNotificationResponseHandler();

  useEffect(() => {
    (async () => {
      try {
        await initI18n();
        await initDatabase();

        const onboardingDone = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);

        if (onboardingDone) {
          // Normal launch: setup notifications and reschedule if needed.
          const { needsExactAlarmPermission } = await setupNotifications();
          await loadAll();
          await registerBackgroundFetch();

          if (needsExactAlarmPermission) {
            const alreadyPrompted = await AsyncStorage.getItem(
              "@pilloclock/exact_alarm_prompted"
            );
            if (!alreadyPrompted) {
              await AsyncStorage.setItem("@pilloclock/exact_alarm_prompted", "1");
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
        } else {
          // First launch: load data but defer notification setup to onboarding.
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
    <SafeAreaProvider>
      <ToastProvider>
        <StatusBar style="dark" />
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
            }}
          />
        </Stack>
        {showOnboarding && <Redirect href="/onboarding" />}
      </ToastProvider>
    </SafeAreaProvider>
  );
}
