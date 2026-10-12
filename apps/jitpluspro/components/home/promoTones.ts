/**
 * Colour tones of the Accueil promo cards and sheets.
 *
 * - `fill`: backgrounds, buttons with white text, gradients (white text ≥ 4.5:1).
 * - `deep`: end of the hero / banner gradient.
 * - `light` / `dark`: the same hue used as text or icon on the light / dark
 *   sheet surfaces (≥ 4.5:1). Never use `fill` as text: most fills are too
 *   dark on the dark theme and too light for small text on white.
 */
export const PROMO_TONES = {
  violet: { fill: '#7C3AED', deep: '#4C1D95', light: '#6D28D9', dark: '#A78BFA' },
  orange: { fill: '#C2410C', deep: '#7C2D12', light: '#9A3412', dark: '#FB923C' },
  emerald: { fill: '#047857', deep: '#064E3B', light: '#047857', dark: '#34D399' },
  sky: { fill: '#0369A1', deep: '#0C4A6E', light: '#0369A1', dark: '#38BDF8' },
  green: { fill: '#15803D', deep: '#14532D', light: '#166534', dark: '#4ADE80' },
  pink: { fill: '#BE185D', deep: '#831843', light: '#BE185D', dark: '#F472B6' },
  red: { fill: '#EF4444', deep: '#991B1B', light: '#B91C1C', dark: '#F87171' },
  amber: { fill: '#D97706', deep: '#78350F', light: '#92400E', dark: '#FBBF24' },
  blue: { fill: '#2563EB', deep: '#1E3A8A', light: '#1D4ED8', dark: '#60A5FA' },
} as const;

export type PromoTone = keyof typeof PROMO_TONES;
