import React from 'react';
import { C, S } from '../theme';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  /** % change vs previous period; null = no baseline */
  delta?: number | null;
  /** Set when a decrease is good news (e.g. cancellations) */
  invertDelta?: boolean;
  hint?: string;
  onClick?: () => void;
}

export function DeltaBadge({ delta, invert = false }: { delta: number | null | undefined; invert?: boolean }) {
  if (delta === undefined) return null;
  if (delta === null) {
    return <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>nouveau</span>;
  }
  const good = invert ? delta < 0 : delta > 0;
  const color = delta === 0 ? C.textMuted : good ? C.green : C.red;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      {arrow} {Math.abs(delta)}%
    </span>
  );
}

export default function StatCard({ label, value, sub, color = C.primary, delta, invertDelta, hint, onClick }: Props) {
  return (
    <div
      title={hint}
      onClick={onClick}
      style={{
        ...S.card,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: color,
        borderRadius: '14px 14px 0 0',
      }} />
      <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</span>
        <DeltaBadge delta={delta} invert={invertDelta} />
      </div>
      {sub && <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 400 }}>{sub}</span>}
    </div>
  );
}
