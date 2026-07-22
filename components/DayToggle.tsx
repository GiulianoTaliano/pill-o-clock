import { View, Text, TouchableOpacity } from "react-native";
import { getDayNamesShort } from "../src/utils";
import { useTranslation } from "../src/i18n";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

interface DayToggleProps {
  selectedDays: number[];
  onChange: (days: number[]) => void;
}

export function DayToggle({ selectedDays, onChange }: DayToggleProps) {
  const { t } = useTranslation();
  const dayNames = getDayNamesShort(t);
  const isAllSelected = selectedDays.length === 7;

  const toggleAll = () => {
    if (isAllSelected) {
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
        {/* "All" shortcut chip */}
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAllSelected }}
          accessibilityLabel={t('form.dayToggleAll')}
          onPress={toggleAll}
          className={`rounded-full px-3 min-h-[44px] min-w-[44px] items-center justify-center ${
            isAllSelected ? "bg-primary" : "bg-slate-100 dark:bg-slate-700"
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              isAllSelected ? "text-white" : "text-muted"
            }`}
          >
            {t('form.dayToggleAll')}
          </Text>
        </TouchableOpacity>

        {/* Individual day chips */}
        {dayNames.map((label, idx) => {
          const active = selectedDays.includes(idx);
          return (
            <TouchableOpacity
              key={idx}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={label}
              onPress={() => toggle(idx)}
              className={`rounded-full px-3 min-h-[44px] min-w-[44px] items-center justify-center ${
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
          ? t('form.dayToggleEveryDay')
          : t('form.dayToggleSelected', { count: selectedDays.length })}
      </Text>
    </View>
  );
}
