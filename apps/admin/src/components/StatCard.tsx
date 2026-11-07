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
    return <span style={{ fontSize: 11.5, color: C.textMuted }}>nouveau</span>;
  }
  const good = invert ? delta < 0 : delta > 0;
  const color = delta === 0 ? C.textMuted : good ? C.green : C.red;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return (
    <span className="num" title="vs période précédente" style={{ fontSize: 12, fontWeight: 500, color, whiteSpace: 'nowrap' }}>
      {sign}{Math.abs(delta)} %
    </span>
  );
}

/** KPI tile: label, big number, change vs previous period, one line of context. `color` only tints a warning value. */
export default function StatCard({ label, value, sub, color, delta, invertDelta, hint, onClick }: Props) {
  const tinted = color === C.red || color === C.amber;
  return (
    <div
      title={hint}
      onClick={onClick}
      className={onClick ? 'row-link' : undefined}
      style={{
        ...S.card,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        cursor: onClick ? 'pointer' : 'default',
        minWidth: 0,
      }}
    >
      <span style={{ color: C.textMuted, fontSize: 12, fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="num" style={{ fontSize: 24, fontWeight: 500, color: tinted ? color : C.text, lineHeight: 1.15 }}>{value}</span>
        <DeltaBadge delta={delta} invert={invertDelta} />
      </div>
      {sub && <span style={{ fontSize: 12, color: C.textMuted }}>{sub}</span>}
    </div>
  );
}
