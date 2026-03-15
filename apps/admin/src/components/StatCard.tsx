import React from 'react';
import { C, S } from '../theme';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

export default function StatCard({ label, value, sub, color = C.primary }: Props) {
  return (
    <div
      style={{
        ...S.card,
        borderLeft: `3px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 30, fontWeight: 800, color }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: C.textMuted }}>{sub}</span>}
    </div>
  );
}
