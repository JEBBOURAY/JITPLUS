import React from 'react';
import { Circle, G, Path } from 'react-native-svg';

/**
 * Line illustrations of the Accueil promo cards, drawn from Moroccan craft:
 * fanous (lantern), bab (gate), berrad (teapot), tajine, zellige rosette and
 * khatam star. Each one is a group on a 64 × 64 grid, meant to be placed and
 * scaled inside the caller's Svg; the soft fills give depth without adding a
 * second colour.
 */
export const PROMO_ICON_GRID = 64;

interface IconProps {
  color: string;
}

export type PromoIcon = React.ComponentType<IconProps>;

const SOFT = 0.16;
const DETAIL = 1.3;
const DEG = Math.PI / 180;
// Inner-vertex radius of an 8-point star made of two overlapping squares.
const KHATAM_INNER = Math.cos(45 * DEG) / Math.cos(22.5 * DEG);

/** Point at `r` from (cx, cy), `deg` clockwise from the x axis; rounded to keep paths short. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  return [
    Number((cx + r * Math.cos(deg * DEG)).toFixed(2)),
    Number((cy + r * Math.sin(deg * DEG)).toFixed(2)),
  ];
}

/** Khatam (zellige 8-point star) as an SVG path, first point up. */
function khatamPath(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 16 }, (_, i) =>
    polar(cx, cy, i % 2 ? r * KHATAM_INNER : r, -90 + i * 22.5).join(' '),
  );
  return `M${points.join(' L')} Z`;
}

function Frame({ color, children }: IconProps & { children: React.ReactNode }) {
  return (
    <G stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {children}
    </G>
  );
}

const LANTERN_STAR = khatamPath(32, 35, 3.6);

/** Comprendre: the fanous that sheds light. */
export function LanternIcon({ color }: IconProps) {
  return (
    <Frame color={color}>
      <Circle cx={32} cy={5.5} r={2} />
      <Path d="M32 7.5 V11 M24 17 L32 11 L40 17" />
      <Path d="M24 17 L20 31 L24 47 H40 L44 31 L40 17 Z" fill={color} fillOpacity={SOFT} />
      <Path d="M27.5 43 V31 C27.5 26.5 30 24 32 22 C34 24 36.5 26.5 36.5 31 V43 Z" strokeWidth={DETAIL} />
      <Path d={LANTERN_STAR} fill={color} stroke="none" />
      <Path d="M25 47 L28 52 H36 L39 47 M32 52 V56" />
      <Path
        d="M13 31 H9 M51 31 H55 M15.5 20 L12.5 17 M48.5 20 L51.5 17 M15.5 42 L12.5 45 M48.5 42 L51.5 45"
        opacity={0.7}
      />
    </Frame>
  );
}

const GATE_STARS = `${khatamPath(18, 18, 3.2)} ${khatamPath(46, 18, 3.2)}`;

/** Démarrer: the bab, a horseshoe-arch gate, as the way in. */
export function GateIcon({ color }: IconProps) {
  return (
    <Frame color={color}>
      <Path d="M6 58 H58 M12 58 V12 H52 V58" />
      <Path d="M21 58 V40.66 A14 14 0 1 1 43 40.66 V58" />
      <Path d="M24.5 58 V37.83 A9.5 9.5 0 1 1 39.5 37.83 V58 Z" fill={color} fillOpacity={SOFT} />
      <Path d="M32 22.5 V58" strokeWidth={DETAIL} />
      <Circle cx={29.5} cy={42} r={1.1} fill={color} stroke="none" />
      <Circle cx={34.5} cy={42} r={1.1} fill={color} stroke="none" />
      <Path d={GATE_STARS} strokeWidth={DETAIL} />
    </Frame>
  );
}

const TEAPOT_STAR = khatamPath(32, 41, 4.2);

/** Vos clients: the berrad of mint tea, served to welcome guests. */
export function TeapotIcon({ color }: IconProps) {
  return (
    <Frame color={color}>
      <Circle cx={32} cy={9} r={1.8} />
      <Path d="M32 10.8 V16.9 M26.5 21 C27.5 15.5 36.5 15.5 37.5 21 M25 21 H39" />
      <Path d="M27 21 C27 25 24 27 23 31 M37 21 C37 25 40 27 41 31" />
      <Path d="M23 31 H41 C49 35 49 48 41 51 H23 C15 48 15 35 23 31 Z" fill={color} fillOpacity={SOFT} />
      <Path d="M25 51 L23 56 H41 L39 51" />
      <Path d="M46 46 C53.5 44 55 33 59 24.5 L57 23.5 C53 31 51 37 46.8 38.9" />
      <Path d="M25.4 26 C15.5 23.5 12.5 37 17.5 45" />
      <Path d={TEAPOT_STAR} strokeWidth={DETAIL} />
      <Circle cx={24.5} cy={41} r={1} fill={color} stroke="none" />
      <Circle cx={39.5} cy={41} r={1} fill={color} stroke="none" />
    </Frame>
  );
}

const TAJINE_STAR = khatamPath(32, 35, 2.8);

/** Partager: the tajine, a dish set in the middle to be shared. */
export function TajineIcon({ color }: IconProps) {
  return (
    <Frame color={color}>
      <Path d="M20 14 C18 11 22 9 20 6 M44 14 C42 11 46 9 44 6" opacity={0.7} />
      <Circle cx={32} cy={12} r={2.6} />
      <Path d="M32 14.6 V18" />
      <Path d="M13 46 C21 43 27 31 29.5 18 H34.5 C37 31 43 43 51 46 Z" fill={color} fillOpacity={SOFT} />
      <Path d="M19.6 41.1 Q32 38.6 44.4 41.1 M26.35 29.2 Q32 28 37.65 29.2" strokeWidth={DETAIL} />
      <Path d={TAJINE_STAR} fill={color} stroke="none" />
      <Circle cx={25.5} cy={35.6} r={1} fill={color} stroke="none" />
      <Circle cx={38.5} cy={35.6} r={1} fill={color} stroke="none" />
      <Path d="M7 46 H57 M9 46 C11 53 53 53 55 46" />
    </Frame>
  );
}

const WHEEL_CX = 32;
const WHEEL_CY = 34;
const WHEEL_R = 22;
const WHEEL_HUB = 8;
const wheelPt = (r: number, deg: number) => polar(WHEEL_CX, WHEEL_CY, r, deg).join(' ');
const spoke = (deg: number) => `M${wheelPt(WHEEL_HUB, deg)} L${wheelPt(WHEEL_R, deg)}`;
// Segment edges sit 22.5° off the top so the pointer faces a segment centre.
const WHEEL_EDGES = Array.from({ length: 8 }, (_, k) => -112.5 + k * 45);
const WHEEL_WEDGES = WHEEL_EDGES.filter((_, k) => k % 2 === 0)
  .map((a) =>
    `${spoke(a)} A${WHEEL_R} ${WHEEL_R} 0 0 1 ${wheelPt(WHEEL_R, a + 45)}`
    + ` L${wheelPt(WHEEL_HUB, a + 45)} A${WHEEL_HUB} ${WHEEL_HUB} 0 0 0 ${wheelPt(WHEEL_HUB, a)} Z`)
  .join(' ');
const WHEEL_SPOKES = WHEEL_EDGES.map(spoke).join(' ');
const WHEEL_DOTS = WHEEL_EDGES.map((a) => polar(WHEEL_CX, WHEEL_CY, 16, a + 22.5));
const WHEEL_STAR = khatamPath(WHEEL_CX, WHEEL_CY, 5);

/** Aller plus loin: a zellige rosette turned into a prize wheel. */
export function WheelIcon({ color }: IconProps) {
  return (
    <Frame color={color}>
      <Path d={WHEEL_WEDGES} fill={color} fillOpacity={SOFT} stroke="none" />
      <Circle cx={WHEEL_CX} cy={WHEEL_CY} r={WHEEL_R} />
      <Circle cx={WHEEL_CX} cy={WHEEL_CY} r={WHEEL_HUB} />
      <Path d={WHEEL_SPOKES} strokeWidth={DETAIL} />
      <Path d={WHEEL_STAR} strokeWidth={DETAIL} />
      {WHEEL_DOTS.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.2} fill={color} stroke="none" />
      ))}
      <Path d="M28.5 5 H35.5 L32 11 Z" fill={color} />
    </Frame>
  );
}

const BADGE_STAR = khatamPath(32, 32, 25);
const BADGE_DOTS = Array.from({ length: 8 }, (_, k) => polar(32, 32, 19.5, -90 + k * 45));

/** Gratuit: a khatam star seal carrying the deal. */
export function StarBadgeIcon({ color }: IconProps) {
  return (
    <Frame color={color}>
      <Path d={BADGE_STAR} fill={color} fillOpacity={SOFT} />
      <Circle cx={32} cy={32} r={13} strokeWidth={DETAIL} />
      {BADGE_DOTS.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.1} fill={color} stroke="none" />
      ))}
      <Path d="M37.5 26.5 L26.5 37.5" strokeWidth={2.2} />
      <Circle cx={27.5} cy={27.5} r={2.4} strokeWidth={2} />
      <Circle cx={36.5} cy={36.5} r={2.4} strokeWidth={2} />
    </Frame>
  );
}
