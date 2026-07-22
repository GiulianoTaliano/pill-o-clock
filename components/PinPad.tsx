/**
 * Reusable 4-digit PIN entry: dots + numeric keypad (F1: app lock).
 * Purely presentational — the parent owns the entered value.
 */
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppPressable } from "./AppPressable";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { PIN_LENGTH } from "../src/services/appLock";

export function PinDots({ filled, error }: { filled: number; error?: boolean }) {
  const theme = useAppTheme();
  return (
    <View className="flex-row justify-center gap-4 my-6" accessibilityLabel={`${filled}/${PIN_LENGTH}`}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <View
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: error ? "#dc2626" : theme.primary,
            backgroundColor: i < filled ? (error ? "#dc2626" : theme.primary) : "transparent",
          }}
        />
      ))}
    </View>
  );
}

interface PinPadProps {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  /** When provided, shows a biometric button in the bottom-left slot. */
  onBiometric?: () => void;
  disabled?: boolean;
}

export function PinPad({ onDigit, onBackspace, onBiometric, disabled }: PinPadProps) {
  const theme = useAppTheme();

  const Key = ({
    label,
    onPress,
    icon,
    a11y,
  }: {
    label?: string;
    onPress?: () => void;
    icon?: React.ComponentProps<typeof Ionicons>["name"];
    a11y: string;
  }) => (
    <AppPressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={disabled || !onPress}
      onPress={() => {
        if (!onPress) return;
        Haptics.selectionAsync();
        onPress();
      }}
      className="items-center justify-center rounded-2xl bg-card"
      style={{ width: 76, height: 64, opacity: disabled && onPress ? 0.4 : 1 }}
    >
      {icon ? (
        <Ionicons name={icon} size={26} color={theme.primary} />
      ) : (
        <Text className="text-2xl font-bold text-text">{label}</Text>
      )}
    </AppPressable>
  );

  const rows: (string | null)[][] = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [onBiometric ? "BIO" : null, "0", "DEL"],
  ];

  return (
    <View className="items-center gap-3">
      {rows.map((row, ri) => (
        <View key={ri} className="flex-row gap-3">
          {row.map((key, ki) => {
            if (key === null) return <View key={ki} style={{ width: 76, height: 64 }} />;
            if (key === "BIO")
              return <Key key={ki} icon="finger-print" a11y="biometrics" onPress={onBiometric} />;
            if (key === "DEL")
              return <Key key={ki} icon="backspace-outline" a11y="backspace" onPress={onBackspace} />;
            return <Key key={ki} label={key} a11y={key} onPress={() => onDigit(key)} />;
          })}
        </View>
      ))}
    </View>
  );
}
