import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Medication } from "../src/types";
import { MEDICATION_COLORS } from "../src/utils";

interface ColorPickerProps {
  value: Medication["color"];
  onChange: (color: Medication["color"]) => void;
}

const COLOR_ORDER: Medication["color"][] = [
  "blue", "green", "purple", "orange", "red", "teal", "pink",
];

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <View className="flex-row gap-2 flex-wrap">
      {COLOR_ORDER.map((color) => {
        const c = MEDICATION_COLORS[color];
        const selected = value === color;
        return (
          <TouchableOpacity
            key={color}
            onPress={() => onChange(color)}
            style={{
              backgroundColor: c.bg,
              borderColor: selected ? "#1e293b" : "transparent",
            }}
            className="w-9 h-9 rounded-full border-2 items-center justify-center"
          >
            {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
