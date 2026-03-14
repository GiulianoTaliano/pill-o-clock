import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CopilotStep, walkthroughable } from "react-native-copilot";
import { useTranslation } from "../../src/i18n";
import { useAppStore } from "../../src/store";
import { useAppTheme } from "../../src/hooks/useAppTheme";
import { AppointmentDetailModal } from "../../components/AppointmentDetailModal";
import { Appointment } from "../../src/types";

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
  const appointments = useAppStore((s) => s.appointments);
  const loadAppointments = useAppStore((s) => s.loadAppointments);
  const selectedAppointmentId = useAppStore((s) => s.selectedAppointmentId);
  const setSelectedAppointmentId = useAppStore((s) => s.setSelectedAppointmentId);
  const setPendingEditAppointmentId = useAppStore((s) => s.setPendingEditAppointmentId);
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);

  // Cold-start: ensure appointments are loaded even when the app is opened
  // directly from a notification (before the Appointments tab is ever visited)
  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  const selectedAppt = appointments.find((a) => a.id === selectedAppointmentId) ?? null;

  const handleEdit = (appt: Appointment) => {
    setSelectedAppointmentId(null);
    setPendingEditAppointmentId(appt.id);
    router.push("/(tabs)/appointments");
  };

  const handleDelete = (appt: Appointment) => {
    deleteAppointment(appt.id);
    setSelectedAppointmentId(null);
  };

  const theme = useAppTheme();

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
        tabBarActiveTintColor: "#4f9cff",
        tabBarInactiveTintColor: theme.isDark ? "#64748b" : "#94a3b8",
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.isDark ? "#1e293b" : "#e2e8f0",
          height: 65,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? "today" : "today-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('tabs.agenda'),
          tabBarIcon: ({ focused, color }) => (
            <CopilotStep
              text="tour.step2Title||tour.step2Desc"
              order={2}
              name="agendaTab"
            >
              <WalkthroughableView className="items-center justify-center pt-1">
                <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
              </WalkthroughableView>
            </CopilotStep>
          ),
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: t('tabs.medications'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? "medkit" : "medkit-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: t('tabs.health'),
          tabBarIcon: ({ focused, color }) => (
            <CopilotStep
              text="tour.step3Title||tour.step3Desc"
              order={3}
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
        name="appointments"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ focused, color }) => (
            <CopilotStep
              text="tour.step4Title||tour.step4Desc"
              order={4}
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
