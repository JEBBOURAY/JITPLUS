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
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'hidden',
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
      <span style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 400 }}>{sub}</span>}
    </div>
  );
}
