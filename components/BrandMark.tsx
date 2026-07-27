/**
 * Pill O-Clock brand mark.
 *
 * Replaces the 💊 emoji that used to stand in for the logo. An emoji is drawn
 * by the OS, so it changed shape between devices and Android versions, and it
 * is not ours to own — on the product's most visible surface.
 *
 * The mark fuses the two things the product is about: a capsule, split into
 * halves, and a clock reading off the blue half. Geometry notes worth keeping:
 *
 *  - The two halves are separate shapes with a real gap between them, not one
 *    shape with a painted white line. That way the mark sits on any
 *    background, including the dark alarm screen.
 *  - The clock sits on the CENTRE of the blue half, not on the split. Anchored
 *    at the split its navy hands touched the navy half and vanished; rendered
 *    at 24 px they were invisible.
 *  - `mono` masks the clock OUT of the capsule instead of drawing it on top,
 *    because a single-colour rendering — Android's themed launcher icon — would
 *    otherwise lose the clock entirely and leave a plain capsule.
 *
 * Legible down to ~24 px. Below that the hands close up; prefer a plain
 * capsule for 16 px surfaces such as favicons.
 */
import React from "react";
import Svg, { ClipPath, Defs, G, Mask, Path, Rect } from "react-native-svg";

interface Props {
  /** Rendered width/height in px. The artwork is square. */
  size?: number;
  /** Single-colour silhouette with the clock knocked out (themed icons). */
  mono?: boolean;
  /** Colour of the leading half — and of the whole mark when `mono`. */
  primary?: string;
  /** Colour of the trailing half and of the clock hands. */
  secondary?: string;
}

/** Hands are shared between the drawn and the masked-out variants. */
function Hands({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <G stroke={color} strokeOpacity={opacity} strokeLinecap="round" fill="none">
      <Path d="M18.3 18.3 L18.3 12.6" strokeWidth={2.9} />
      <Path d="M18.3 18.3 L23.4 18.3" strokeWidth={2.9} />
    </G>
  );
}

export default function BrandMark({
  size = 28,
  mono = false,
  primary = "#2f7de1",
  secondary = "#0e1a2d",
}: Props) {
  const uid = React.useId();
  const clipId = `poc-clip-${uid}`;
  const maskId = `poc-mask-${uid}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x="7" y="16" width="34" height="16" rx="8" transform="rotate(45 24 24)" />
        </ClipPath>
        {/* White keeps, black removes: the hands become holes. */}
        <Mask id={maskId}>
          <Rect x="0" y="0" width="48" height="48" fill="#fff" />
          <Hands color="#000" />
        </Mask>
      </Defs>

      <G clipPath={`url(#${clipId})`} mask={mono ? `url(#${maskId})` : undefined}>
        <Rect x="5" y="13" width="18.6" height="22" fill={primary} transform="rotate(45 24 24)" />
        <Rect
          x="24.4" y="13" width="18.6" height="22"
          fill={mono ? primary : secondary}
          transform="rotate(45 24 24)"
        />
      </G>

      {!mono && <Hands color={secondary} />}
    </Svg>
  );
}
