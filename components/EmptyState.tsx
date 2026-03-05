import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View className="w-20 h-20 rounded-full bg-blue-50 dark:bg-slate-800 items-center justify-center mb-4">
        <Ionicons name={icon} size={36} color="#94a3b8" />
      </View>
      <Text className="text-lg font-bold text-text text-center mb-2">{title}</Text>
      {subtitle ? (
        <Text className="text-sm text-muted text-center">{subtitle}</Text>
      ) : null}
    </View>
  );
}
