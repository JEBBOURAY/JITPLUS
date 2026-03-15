// ── Design tokens ────────────────────────────────────────────────────────────
export const C = {
  bg: '#0f0f1a',
  surface: '#16162a',
  surfaceHover: '#1e1e35',
  border: '#2a2a45',
  text: '#e2e0f0',
  textMuted: '#8b88b0',
  primary: '#7C3AED',
  primaryLight: '#9d6cf5',
  cyan: '#06B6D4',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
} as const;

export const S = {
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 20,
  } as React.CSSProperties,
  btn: (color: string = C.primary): React.CSSProperties => ({
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  }),
  btnOutline: (color: string = C.primary): React.CSSProperties => ({
    background: 'transparent',
    color: color,
    border: `1px solid ${color}`,
    borderRadius: 8,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  }),
  badge: (color: string): React.CSSProperties => ({
    background: color + '22',
    color: color,
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 700,
    display: 'inline-block',
  }),
} as const;
