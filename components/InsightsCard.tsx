/**
 * InsightsCard (F2): the single, focused insights surface — rendered at the
 * top of the History tab. Computes 30-day patterns fully on-device via
 * src/services/insights.ts and hides itself entirely when there is nothing
 * meaningful to say (see the honesty thresholds in the service).
 */
import { View, Text } from "react-native";
import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { useAppStore } from "../src/store";
import { getDoseLogsByDateRange, getDailyCheckins } from "../src/db/database";
import { computeInsights, AdherenceInsights } from "../src/services/insights";
import { toDateString } from "../src/utils";

const DAYS = 30;

function InsightRow({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; text: string }) {
  return (
    <View className="flex-row items-start gap-2.5 py-1.5">
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 1 }} />
      <Text className="text-[13px] text-text flex-1 leading-5">{text}</Text>
    </View>
  );
}

export function InsightsCard() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const medications = useAppStore((s) => s.medications);
  const [insights, setInsights] = useState<AdherenceInsights | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const to = toDateString(new Date());
          const from = toDateString(new Date(Date.now() - DAYS * 86_400_000));
          const [logs, checkins] = await Promise.all([
            getDoseLogsByDateRange(from, to),
            getDailyCheckins(from, to),
          ]);
          if (!cancelled) setInsights(computeInsights(logs, medications, checkins));
        } catch {
          if (!cancelled) setInsights(null);
        }
      })();
      return () => { cancelled = true; };
    }, [medications])
  );

  if (!insights || insights.overallRate == null) return null;

  const rows: { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; text: string }[] = [];

  if (insights.worstBand) {
    rows.push({
      icon: "time-outline",
      color: theme.warning,
      text: t("insights.worstBand", {
        band: t(`insights.band_${insights.worstBand.band}`),
        rate: Math.round(insights.worstBand.rate * 100),
      }),
    });
  }
  if (insights.worstWeekday) {
    rows.push({
      icon: "calendar-outline",
      color: theme.warning,
      text: t("insights.worstWeekday", {
        day: t(`insights.weekday_${insights.worstWeekday.weekday}`),
        rate: Math.round(insights.worstWeekday.rate * 100),
      }),
    });
  }
  for (const med of insights.lowMeds) {
    rows.push({
      icon: "medkit-outline",
      color: theme.danger,
      text: t("insights.lowMed", { name: med.name, rate: Math.round(med.rate * 100), taken: med.taken, total: med.total }),
    });
  }
  if (insights.mood) {
    rows.push({
      icon: "happy-outline",
      color: theme.primary,
      text: t("insights.moodLink", {
        full: insights.mood.avgFullDays,
        missed: insights.mood.avgMissedDays,
      }),
    });
  }

  if (rows.length === 0) return null;

  return (
    <View className="mx-5 mb-4 rounded-2xl bg-card border border-border p-4">
      <View className="flex-row items-center gap-2 mb-1">
        <Ionicons name="bulb-outline" size={16} color={theme.primary} />
        <Text className="text-sm font-bold text-text">{t("insights.title", { days: DAYS })}</Text>
      </View>
      {rows.map((r, i) => (
        <InsightRow key={i} icon={r.icon} color={r.color} text={r.text} />
      ))}
      <Text className="text-[10px] text-muted mt-1.5">{t("insights.disclaimer")}</Text>
    </View>
  );
}
