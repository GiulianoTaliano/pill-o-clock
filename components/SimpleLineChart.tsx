import React, { useMemo, useState } from "react";
import { View, Text } from "react-native";
import Svg, { Polyline, Circle, Line } from "react-native-svg";
import { format } from "date-fns";
import { useTranslation, getDateLocale } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";

interface SimpleLineChartProps {
  data: number[];
  data2?: number[];
  timestamps?: string[];
  color?: string;
  color2?: string;
  width: number;
  height: number;
  mini?: boolean;
  unit?: string;
}
/** Coordinates use elapsed time when supplied, never observation index. */
export function chartCoordinates(
  data: number[],
  data2: number[] | undefined,
  timestamps: string[] | undefined,
  width: number,
  height: number,
  pad = 28
) {
  const values = [...data, ...(data2 ?? [])].filter(Number.isFinite);
  const low = Math.min(...values),
    high = Math.max(...values);
  const margin = (high - low || Math.max(Math.abs(high) * 0.02, 1)) * 0.1;
  const min = low - margin,
    max = high + margin;
  const rawTimes = timestamps?.map((s) => new Date(s).getTime());
  const times =
    rawTimes?.length === data.length && rawTimes.every(Number.isFinite)
      ? rawTimes
      : data.map((_, i) => i);
  const start = Math.min(...times),
    end = Math.max(...times);
  const x = (i: number) =>
    pad +
    ((times[i] - start) / (end - start || 1)) * Math.max(1, width - pad * 2);
  const y = (value: number) =>
    pad +
    (1 - (value - min) / (max - min || 1)) * Math.max(1, height - pad * 2);
  return {
    low,
    high,
    primary: data.map((v, i) => ({ x: x(i), y: y(v), value: v })),
    secondary: data2?.map((v, i) => ({ x: x(i), y: y(v), value: v })),
  };
}

export function SimpleLineChart({
  data,
  data2,
  timestamps,
  color,
  color2,
  width,
  height,
  mini = false,
  unit = "",
}: SimpleLineChartProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);
  const coords = useMemo(
    () =>
      chartCoordinates(data, data2, timestamps, width, height, mini ? 3 : 28),
    [data, data2, timestamps, width, height, mini]
  );
  if (!data.length) return null;
  const primary = color ?? theme.primary,
    secondary = color2 ?? theme.muted;
  const summary = t("uxHealth.chartSummary", {
    count: data.length,
    min: coords.low,
    max: coords.high,
    unit,
  });
  const selectedIndex =
    selected == null ? data.length - 1 : Math.min(selected, data.length - 1);
  const dateAt = (i: number) =>
    timestamps?.[i]
      ? format(new Date(timestamps[i]), "Pp", { locale: getDateLocale() })
      : "";
  return (
    <View
      accessible={!mini}
      accessibilityRole="image"
      accessibilityLabel={mini ? undefined : summary}
    >
      {!mini && (
        <View className="flex-row justify-between mb-1">
          <Text className="text-xs text-muted">
            {coords.high} {unit}
          </Text>
          <Text className="text-xs text-muted">
            {coords.low}–{coords.high} {unit}
          </Text>
        </View>
      )}
      <Svg width={Math.max(1, width)} height={height} accessible={false}>
        {!mini && (
          <Line
            x1={28}
            y1={height - 28}
            x2={width - 28}
            y2={height - 28}
            stroke={theme.muted}
            strokeOpacity={0.3}
          />
        )}
        {coords.secondary && (
          <Polyline
            points={coords.secondary.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={secondary}
            strokeWidth={2}
            strokeDasharray="5,4"
          />
        )}
        <Polyline
          points={coords.primary.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={primary}
          strokeWidth={mini ? 1.8 : 2.5}
          strokeLinejoin="round"
        />
        {!mini &&
          coords.primary.map((p, i) => (
            <React.Fragment key={i}>
              <Circle
                cx={p.x}
                cy={p.y}
                r={i === selectedIndex ? 5 : 3}
                fill={primary}
              />
              <Circle
                cx={p.x}
                cy={p.y}
                r={16}
                fill="transparent"
                onPress={() => setSelected(i)}
              />
            </React.Fragment>
          ))}
      </Svg>
      {!mini && (
        <>
          <View className="flex-row justify-between">
            <Text className="text-xs text-muted">
              {timestamps?.[0]
                ? format(new Date(timestamps[0]), "d MMM", {
                    locale: getDateLocale(),
                  })
                : ""}
            </Text>
            <Text className="text-xs text-muted">
              {timestamps?.at(-1)
                ? format(new Date(timestamps.at(-1)!), "d MMM", {
                    locale: getDateLocale(),
                  })
                : ""}
            </Text>
          </View>
          <Text className="text-sm text-text mt-2">
            {dateAt(selectedIndex)} · {data[selectedIndex]}
            {data2 ? `/${data2[selectedIndex]}` : ""} {unit}
          </Text>
        </>
      )}
    </View>
  );
}
