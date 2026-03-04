import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../../src/i18n";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4f9cff",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e2e8f0",
          height: 60,
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
          title: t('tabs.calendar'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? "calendar" : "calendar-outline"} focused={focused} color={color} />
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
        options={{
          title: t('tabs.history'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "bar-chart" : "bar-chart-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              name={focused ? "settings" : "settings-outline"}
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
