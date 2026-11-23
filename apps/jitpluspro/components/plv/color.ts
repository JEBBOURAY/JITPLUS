// Colour math for the printed and shared visuals (PLV posters, social posts).
// Inputs are `#RRGGBB` strings, already validated by the caller.

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` blended towards `b` (0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * amount));
  return `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')}`;
}

/** Darker (amount < 0) or lighter (amount > 0) by that fraction, towards black or white. */
export function shade(hex: string, amount: number): string {
  return amount < 0 ? mix(hex, '#000000', -amount) : mix(hex, '#FFFFFF', amount);
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
