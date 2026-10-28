const DEG = Math.PI / 180;

/** Inner / outer vertex radius of a khatam, the zellige 8-point star made of two overlapping squares. */
export const KHATAM_INNER = Math.cos(45 * DEG) / Math.cos(22.5 * DEG);

/** Khatam as an SVG path centred on (cx, cy), first point up, turned by `rotation` degrees. */
export function khatamPath(cx: number, cy: number, r: number, rotation = 0): string {
  'worklet';
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a = (-90 + rotation + i * 22.5) * DEG;
    const rr = i % 2 ? r * KHATAM_INNER : r;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)} `;
  }
  return `${d}Z`;
}

/** Zellige: khatam outlines on a staggered grid covering `width` × `height`. */
export function zelligePath(width: number, height: number, tile: number, r: number): string {
  let d = '';
  for (let row = 0, y = -tile / 4; y < height + tile; row++, y += tile) {
    for (let x = (row % 2) * (tile / 2) - tile / 4; x < width + tile; x += tile) d += khatamPath(x, y, r);
  }
  return d;
}

/** Ease-out with a small overshoot, for stars popping into place. */
export function easeOutBack(p: number): number {
  'worklet';
  const s = 1.70158;
  return 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
}
