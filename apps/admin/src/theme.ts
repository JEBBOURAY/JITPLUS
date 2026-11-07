import type React from 'react';

// ── Design tokens ────────────────────────────────────────────────────────────
// Values live in index.html (light + dark). Neutral surfaces, one accent
// (JitPlus violet) for links and selection, status colours only for status.
export const C = {
  bg: 'var(--theme-bg)',
  surface: 'var(--theme-surface)',
  surfaceHover: 'var(--theme-surface-hover)',
  surfaceAlt: 'var(--theme-surface-alt)',
  border: 'var(--theme-border)',
  borderLight: 'var(--theme-border-light)',
  text: 'var(--theme-text)',
  textMuted: 'var(--theme-text-muted)',
  ink: 'var(--theme-ink)',
  onInk: 'var(--theme-on-ink)',
  primary: 'var(--theme-primary)',
  primaryLight: 'var(--theme-primary-light)',
  primaryDark: 'var(--theme-primary-dark)',
  primaryAlpha: 'var(--theme-primary-alpha)',
  cyan: 'var(--theme-cyan)',
  green: 'var(--theme-green)',
  greenAlpha: 'var(--theme-green-alpha)',
  red: 'var(--theme-red)',
  redAlpha: 'var(--theme-red-alpha)',
  amber: 'var(--theme-amber)',
  blue: 'var(--theme-blue)',
  whatsapp: '#1DA851',
  chart: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'] as const,
  chartGrid: 'var(--chart-grid)',
} as const;

const btnBase: React.CSSProperties = {
  borderRadius: 'var(--radius-sm)',
  padding: '7px 12px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  lineHeight: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
  textDecoration: 'none',
};

export const S = {
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 'var(--radius-lg)',
    padding: 20,
  } as React.CSSProperties,
  /** Filled button. Default = ink (neutral primary action). */
  btn: (color: string = C.ink): React.CSSProperties => ({
    ...btnBase,
    background: color,
    color: color === C.ink ? C.onInk : '#fff',
    border: `1px solid ${color}`,
  }),
  /** Secondary button: surface with a border; `color` tints the label. */
  btnOutline: (color: string = C.text): React.CSSProperties => ({
    ...btnBase,
    background: C.surface,
    color,
    border: `1px solid ${C.border}`,
  }),
  /** Text-only button / link. */
  btnGhost: (color: string = C.textMuted): React.CSSProperties => ({
    ...btnBase,
    background: 'transparent',
    color,
    border: '1px solid transparent',
    padding: '5px 8px',
  }),
  badge: (color: string, alphaColor?: string): React.CSSProperties => ({
    background: alphaColor || `color-mix(in srgb, ${color} 11%, transparent)`,
    color,
    borderRadius: 4,
    padding: '1px 7px',
    fontSize: 11.5,
    fontWeight: 500,
    display: 'inline-block',
    lineHeight: '18px',
    whiteSpace: 'nowrap',
  }),
  input: {
    width: '100%',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 'var(--radius-sm)',
    padding: '7px 10px',
    color: C.text,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 5,
    fontWeight: 500,
  } as React.CSSProperties,
} as const;
