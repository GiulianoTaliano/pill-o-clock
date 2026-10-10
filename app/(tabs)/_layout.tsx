import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CopilotStep, walkthroughable } from "react-native-copilot";
import { useTranslation } from "../../src/i18n";
import { useAppStore } from "../../src/store";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { AppointmentDetailModal } from "../../components/AppointmentDetailModal";
import { Appointment } from "../../src/types";
import { useToast } from "../../src/context/ToastContext";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const WalkthroughableView = walkthroughable(View);

function TabIcon({
  name,
  focused,
  color,
}: {
  name: IconName;
  focused: boolean;
  color: string;
}) {
  return (
    <View className="items-center justify-center pt-1">
      <Ionicons name={name} size={24} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { showToast } = useToast();
  const appointments = useAppStore((s) => s.appointments);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const selectedAppointmentId = useAppStore((s) => s.selectedAppointmentId);
  const setSelectedAppointmentId = useAppStore(
    (s) => s.setSelectedAppointmentId
  );
  const setPendingEditAppointmentId = useAppStore(
    (s) => s.setPendingEditAppointmentId
  );
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);

  // Cold-start: ensure appointments are loaded even when the app is opened
  // directly from a notification (before the Appointments tab is ever visited)
  useEffect(() => {
    loadAppointments().catch(() => showToast(t("ux.refreshFailed"), "error"));
  }, [loadAppointments, showToast, t]);

  const selectedAppt =
    appointments.find((a) => a.id === selectedAppointmentId) ?? null;

  const handleEdit = (appt: Appointment) => {
    setSelectedAppointmentId(null);
    setPendingEditAppointmentId(appt.id);
    router.push("/(tabs)/appointments");
  };

  const handleDelete = async (appt: Appointment) => {
    await deleteAppointment(appt.id);
    setSelectedAppointmentId(null);
  };

  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const { fontScale } = useWindowDimensions();
  const labelLines = fontScale > 1.4 ? 3 : 2;

  return (
    <>
      <AppointmentDetailModal
        appt={selectedAppt}
        visible={!!selectedAppt}
        onClose={() => setSelectedAppointmentId(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
            height: 40 + 15 * fontScale * labelLines + bottomInset,
            paddingBottom: bottomInset,
          },
          tabBarLabelPosition: "below-icon",
          tabBarItemStyle: { paddingHorizontal: 2, paddingTop: 4 },
          tabBarLabel: ({ color, children }) => (
            <Text
              style={{
                color,
                fontSize: 12,
                lineHeight: 15,
                fontWeight: "600",
                textAlign: "center",
                alignSelf: "stretch",
              }}
            >
              {children === t("tabs.medications")
                ? t("ux.medicinesTab")
                : children}
            </Text>
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("tabs.today"),
            tabBarIcon: ({ focused, color }) => (
              <TabIcon
                name={focused ? "today" : "today-outline"}
                focused={focused}
                color={color}
              />
            ),
          }}
        />
        {/* Adherence History — the app's headline value — gets a permanent,
          labeled tab (audit UX I12). Appointments moves to a Home header
          shortcut; its route file stays mounted (href:null) so deep links
          and edit-from-detail still resolve. */}
        <Tabs.Screen
          name="history"
          options={{
            title: t("tabs.history"),
            tabBarIcon: ({ focused, color }) => (
              <CopilotStep
                text="tour.step3Title||tour.step3Desc"
                order={3}
                name="historyTab"
              >
                <WalkthroughableView className="items-center justify-center pt-1">
                  <Ionicons
                    name={focused ? "bar-chart" : "bar-chart-outline"}
                    size={24}
                    color={color}
                  />
                </WalkthroughableView>
              </CopilotStep>
            ),
          }}
        />
        <Tabs.Screen
          name="medications"
          options={{
            title: t("tabs.medications"),
            tabBarAccessibilityLabel: t("tabs.medications"),
            tabBarIcon: ({ focused, color }) => (
              <TabIcon
                name={focused ? "medkit" : "medkit-outline"}
                focused={focused}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="appointments" options={{ href: null }} />
        <Tabs.Screen
          name="health"
          options={{
            title: t("tabs.health"),
            tabBarIcon: ({ focused, color }) => (
              <CopilotStep
                text="tour.step5Title||tour.step5Desc"
                order={5}
                name="healthTab"
              >
                <WalkthroughableView className="items-center justify-center pt-1">
                  <Ionicons
                    name={focused ? "heart" : "heart-outline"}
                    size={24}
                    color={color}
                  />
                </WalkthroughableView>
              </CopilotStep>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t("tabs.settings"),
            tabBarIcon: ({ focused, color }) => (
              <CopilotStep
                text="tour.step6Title||tour.step6Desc"
                order={6}
                name="settingsTab"
              >
                <WalkthroughableView className="items-center justify-center pt-1">
                  <Ionicons
                    name={focused ? "settings" : "settings-outline"}
                    size={24}
                    color={color}
                  />
                </WalkthroughableView>
              </CopilotStep>
            ),
          }}
        />
      </Tabs>
    </>
  );
}
