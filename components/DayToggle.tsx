import { View, Text, TouchableOpacity } from "react-native";
import { DAY_NAMES_SHORT } from "../src/utils";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface DayToggleProps {
  selectedDays: number[];
  onChange: (days: number[]) => void;
}

export function DayToggle({ selectedDays, onChange }: DayToggleProps) {
  const isAllSelected =
    selectedDays.length === 0 || selectedDays.length === 7;

  const toggleAll = () => {
    if (isAllSelected) {
      // Already all days — keep as "all" (represented by empty array)
      // Do nothing or clear to empty; here we explicitly set [] so the
      // user can then pick specific days from scratch.
      onChange([]);
    } else {
      onChange(ALL_DAYS);
    }
  };

  const toggle = (day: number) => {
    if (selectedDays.includes(day)) {
      onChange(selectedDays.filter((d) => d !== day));
    } else {
      onChange([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  return (
    <View>
      <View className="flex-row gap-1.5 flex-wrap">
        {/* "Todos" shortcut chip */}
        <TouchableOpacity
          onPress={toggleAll}
          className={`rounded-full px-3 py-1.5 ${
            isAllSelected ? "bg-primary" : "bg-slate-100 dark:bg-slate-700"
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              isAllSelected ? "text-white" : "text-muted"
            }`}
          >
            Todos
          </Text>
        </TouchableOpacity>

        {/* Individual day chips */}
        {DAY_NAMES_SHORT.map((label, idx) => {
          const active =
            isAllSelected || selectedDays.includes(idx);
          return (
            <TouchableOpacity
              key={idx}
              onPress={() => toggle(idx)}
              className={`rounded-full px-3 py-1.5 ${
                active ? "bg-primary/20" : "bg-slate-100 dark:bg-slate-700"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="text-xs text-muted mt-1">
        {isAllSelected
          ? "Todos los días"
          : `${selectedDays.length} día${selectedDays.length !== 1 ? "s" : ""} seleccionado${selectedDays.length !== 1 ? "s" : ""}`}
      </Text>
    </View>
  );
}
