import React from "react";
import Svg, { Polyline, Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SimpleLineChartProps {
  /** Primary data series */
  data: number[];
  /** Secondary series — used for diastolic BP */
  data2?: number[];
  color?: string;
  color2?: string;
  width: number;
  height: number;
  /** When true: no labels, thinner lines, no end dot */
  mini?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function SimpleLineChart({
  data,
  data2,
  color = "#4f9cff",
  color2 = "#f97316",
  width,
  height,
  mini = false,
}: SimpleLineChartProps) {
  const pad = mini ? 2 : 20;
  const w = width - pad * 2;
  const h = height - pad * 2;

  if (data.length === 0) return null;

  const allValues = [...data, ...(data2 ?? [])];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const range = rawMax - rawMin || 1;

  // Add 10% margin so the line doesn't touch the very top/bottom
  const margin = range * 0.1;
  const min = rawMin - margin;
  const max = rawMax + margin;
  const span = max - min;

  const toX = (i: number, total: number) =>
    pad + (i / Math.max(total - 1, 1)) * w;

  const toY = (v: number) =>
    pad + h - ((v - min) / span) * h;

  // Build points strings
  const pts1 = data.map((v, i) => `${toX(i, data.length)},${toY(v)}`).join(" ");
  const pts2 = data2?.map((v, i) => `${toX(i, data2.length)},${toY(v)}`).join(" ");

  // Fill gradient path (under data1 line)
  const firstX = toX(0, data.length);
  const lastX = toX(data.length - 1, data.length);
  const baseY = pad + h;
  const fillPath =
    `M${firstX},${baseY} ` +
    data.map((v, i) => `L${toX(i, data.length)},${toY(v)}`).join(" ") +
    ` L${lastX},${baseY} Z`;

  const lastDotX = toX(data.length - 1, data.length);
  const lastDotY = toY(data[data.length - 1]);
  const gradId = `g${Math.round(color.replace("#", "").slice(0, 4).split("").reduce((a, c) => a + c.charCodeAt(0), 0))}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* Gradient fill */}
      <Path d={fillPath} fill={`url(#${gradId})`} />

      {/* Secondary line (diastolic) */}
      {pts2 && data2 && data2.length > 1 && (
        <Polyline
          points={pts2}
          fill="none"
          stroke={color2}
          strokeWidth={mini ? 1.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={mini ? undefined : "5,3"}
        />
      )}

      {/* Primary line */}
      {data.length > 1 && (
        <Polyline
          points={pts1}
          fill="none"
          stroke={color}
          strokeWidth={mini ? 1.5 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* End dot */}
      {!mini && (
        <>
          <Circle cx={lastDotX} cy={lastDotY} r={5} fill={color} />
          <Circle cx={lastDotX} cy={lastDotY} r={3} fill="#fff" />
        </>
      )}
    </Svg>
  );
}
