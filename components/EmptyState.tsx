import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  const theme = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View
        className="w-20 h-20 rounded-full items-center justify-center mb-4"
        style={{ backgroundColor: theme.isDark ? '#1e293b' : '#dbeafe' }}
      >
        <Ionicons name={icon} size={36} color={theme.isDark ? '#cbd5e1' : '#64748b'} />
      </View>
      <Text className="text-lg font-bold text-text text-center mb-2">{title}</Text>
      {subtitle ? (
        <Text className="text-sm text-center" style={{ color: theme.isDark ? '#cbd5e1' : '#475569' }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
