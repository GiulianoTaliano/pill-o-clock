/**
 * Product illustrations — empty states and onboarding.
 *
 * These are SVG rather than bitmaps for one concrete reason: the app has a dark
 * theme. A generated PNG carries its own background and its own dark navy, so
 * on a dark screen it lands as a bright rectangle and its dark shapes vanish.
 * Drawing them here lets every colour come from the theme, so one asset serves
 * both modes and costs a couple of kilobytes.
 *
 * Every scene is built from the same module as the brand mark — the capsule at
 * 45° split into two halves — so the illustrations, the icon and the logo read
 * as one family. See components/BrandMark.tsx.
 */
import React from "react";
import Svg, { Circle, ClipPath, Defs, G, Path, Polyline, Rect } from "react-native-svg";
import { useAppTheme } from "../src/hooks/useAppTheme";

export type IllustrationName =
  | "noMeds"
  | "noDoses"
  | "noHistory"
  | "noAllergies"
  | "obMeds"
  | "obAlarm"
  | "obAppointments"
  | "obHealth"
  | "obPrivacy";

interface Props {
  name: IllustrationName;
  /** Rendered width in px; height follows the artboard ratio. */
  width?: number;
}

interface Palette {
  /** Leading half of every capsule — the brand blue. */
  lead: string;
  /** Trailing half and fine detail. Inverts in dark mode so it stays visible. */
  trail: string;
  /** Supporting masses: containers, grids, timelines. */
  wash: string;
  /** Reserved for the alarm, matching where the app already uses warmth. */
  warm: string;
}

/**
 * A two-tone capsule with a straight split. The halves are clipped rather than
 * drawn as two rounded shapes so the inner edge stays flat, and a real gap is
 * left between them so the form works on any background.
 */
function Capsule({
  id, cx, cy, len, thick, rot = 45, gap = 2, pal,
}: {
  id: string; cx: number; cy: number; len: number; thick: number;
  rot?: number; gap?: number; pal: Palette;
}) {
  const x = cx - len / 2;
  const y = cy - thick / 2;
  const r = `rotate(${rot} ${cx} ${cy})`;
  return (
    <>
      <Defs>
        <ClipPath id={id}>
          <Rect x={x} y={y} width={len} height={thick} rx={thick / 2} transform={r} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        <Rect x={x - 3} y={y - 5} width={len / 2 - gap / 2 + 3} height={thick + 10} fill={pal.lead} transform={r} />
        <Rect x={cx + gap / 2} y={y - 5} width={len / 2 + 3} height={thick + 10} fill={pal.trail} transform={r} />
      </G>
    </>
  );
}

function Scene({ name, pal, uid }: { name: IllustrationName; pal: Palette; uid: string }) {
  const cap = (k: string, cx: number, cy: number, len: number, thick: number, rot?: number) => (
    <Capsule id={`${uid}-${k}`} cx={cx} cy={cy} len={len} thick={thick} rot={rot} pal={pal} />
  );

  switch (name) {
    case "noMeds":
      // An open pill-organiser compartment with a single dose left in it.
      return (
        <>
          <Path d="M32 30 h10 v34 h36 V30 h10 v40 a8 8 0 0 1-8 8 H40 a8 8 0 0 1-8-8 Z" fill={pal.wash} />
          {cap("a", 60, 66, 24, 10)}
        </>
      );

    case "noDoses":
      // The even gaps between the three doses are the message.
      return (
        <>
          {cap("a", 26, 50, 26, 11)}
          {cap("b", 60, 50, 26, 11)}
          {cap("c", 94, 50, 26, 11)}
        </>
      );

    case "noHistory":
      // A timeline with unfilled marks: "nothing recorded yet" rather than bars,
      // which read as a barcode.
      return (
        <>
          <Rect x={24} y={56} width={72} height={4} rx={2} fill={pal.wash} />
          <Circle cx={40} cy={58} r={6} fill={pal.wash} />
          <Circle cx={60} cy={58} r={6} fill={pal.wash} />
          <Circle cx={80} cy={58} r={6} fill={pal.wash} />
          {cap("a", 60, 34, 26, 11)}
        </>
      );

    case "noAllergies":
      return (
        <>
          <Path d="M48 28 L68 22 L88 28 v22 c0 14-11 23-20 27-9-4-20-13-20-27 Z" fill={pal.wash} />
          {cap("a", 30, 62, 24, 10)}
        </>
      );

    case "obMeds":
      return (
        <>
          {cap("a", 46, 38, 30, 12)}
          {cap("b", 76, 46, 22, 10)}
          {cap("c", 44, 66, 22, 10)}
          {cap("d", 74, 72, 16, 8)}
        </>
      );

    case "obAlarm":
      // The arcs already say "ringing"; an extra clock face only crowded it.
      return (
        <>
          <G stroke={pal.warm} strokeWidth={4} fill="none" strokeLinecap="round">
            <Path d="M40 40 a14 14 0 0 0 0 22" />
            <Path d="M31 32 a23 23 0 0 0 0 38" />
            <Path d="M80 40 a14 14 0 0 1 0 22" />
            <Path d="M89 32 a23 23 0 0 1 0 38" />
          </G>
          {cap("a", 60, 51, 42, 20, 90)}
        </>
      );

    case "obAppointments":
      return (
        <>
          <G fill={pal.wash}>
            <Rect x={30} y={24} width={15} height={15} rx={4} />
            <Rect x={50} y={24} width={15} height={15} rx={4} />
            <Rect x={70} y={24} width={15} height={15} rx={4} />
            <Rect x={30} y={44} width={15} height={15} rx={4} />
            <Rect x={70} y={44} width={15} height={15} rx={4} />
            <Rect x={30} y={64} width={15} height={15} rx={4} />
            <Rect x={50} y={64} width={15} height={15} rx={4} />
          </G>
          <Rect x={50} y={44} width={15} height={15} rx={4} fill={pal.lead} />
          {cap("a", 84, 73, 22, 10)}
        </>
      );

    case "obHealth":
      return (
        <>
          <Polyline
            points="30,70 48,56 66,62 90,32"
            fill="none" stroke={pal.lead} strokeWidth={4}
            strokeLinecap="round" strokeLinejoin="round"
          />
          <G fill={pal.lead}>
            <Circle cx={48} cy={56} r={4.5} />
            <Circle cx={66} cy={62} r={4.5} />
            <Circle cx={90} cy={32} r={4.5} />
          </G>
          {cap("a", 30, 70, 20, 9)}
        </>
      );

    case "obPrivacy":
      // The capsule IS the shackle — drawn as a thick split arc with round caps.
      return (
        <>
          <G fill="none" strokeWidth={13} strokeLinecap="round">
            <Path d="M45 52 v-8 a15 15 0 0 1 15-15" stroke={pal.lead} />
            <Path d="M60 29 a15 15 0 0 1 15 15 v8" stroke={pal.trail} />
          </G>
          <Rect x={35} y={50} width={50} height={32} rx={8} fill={pal.wash} />
          <Circle cx={60} cy={63} r={5} fill={pal.trail} />
          <Rect x={57.8} y={63} width={4.4} height={10} rx={2.2} fill={pal.trail} />
        </>
      );
  }
}

export default function Illustration({ name, width = 150 }: Props) {
  const theme = useAppTheme();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");

  const pal: Palette = theme.isDark
    ? { lead: "#60a5fa", trail: "#e2e8f0", wash: "#24344a", warm: "#fbbf24" }
    : { lead: "#2f7de1", trail: "#0e1a2d", wash: "#dce9fb", warm: "#a8541a" };

  return (
    <Svg width={width} height={(width * 70) / 96} viewBox="12 16 96 70">
      <Scene name={name} pal={pal} uid={uid} />
    </Svg>
  );
}
