import React, { useRef, useState } from 'react';
import { C, S } from '../theme';
import { fmtNumber } from '../utils/format';

// ── Section helpers ──────────────────────────────────────────────────────────

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text, letterSpacing: '-0.01em' }}>{children}</h3>
      {right}
    </div>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </p>
  );
}

export function Card({ title, right, children, style }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ ...S.card, ...style }}>
      {title && <SectionTitle right={right}>{title}</SectionTitle>}
      {children}
    </div>
  );
}

export function Grid({ min = 180, gap = 14, children, style }: { min?: number; gap?: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap, ...style }}>
      {children}
    </div>
  );
}

export function Empty({ children = 'Aucune donnée sur la période' }: { children?: React.ReactNode }) {
  return <p style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '20px 0', margin: 0 }}>{children}</p>;
}

/** Compact label/value pair used inside cards. */
export function MiniStat({ label, value, color, hint }: { label: string; value: React.ReactNode; color?: string; hint?: string }) {
  return (
    <div title={hint}>
      <p style={{ margin: 0, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 700, color: color ?? C.text, letterSpacing: '-0.01em' }}>{value}</p>
    </div>
  );
}

// ── Horizontal bar row ───────────────────────────────────────────────────────

export function BarRow({
  label,
  value,
  max,
  color = C.primary,
  suffix,
  hint,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  color?: string;
  /** Text shown on the right instead of the raw value */
  suffix?: React.ReactNode;
  hint?: string;
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div title={hint}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>{suffix ?? fmtNumber(value)}</span>
      </div>
      <div style={{ background: C.borderLight, borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}

/** Bars expressed as a share of a common denominator ("x / total — y%"). */
export function ShareList({ items, total, color }: { items: { label: string; value: number; color?: string; hint?: string }[]; total: number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((it) => {
        const p = total > 0 ? Math.round((it.value / total) * 100) : 0;
        return (
          <BarRow
            key={it.label}
            label={it.label}
            value={it.value}
            max={total}
            color={it.color ?? color}
            hint={it.hint}
            suffix={`${fmtNumber(it.value)} · ${p}%`}
          />
        );
      })}
    </div>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────────────

export function Funnel({ steps, color = C.primary }: { steps: { label: string; value: number; hint?: string }[]; color?: string }) {
  const top = steps[0]?.value ?? 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {steps.map((st, i) => {
        const prev = i > 0 ? steps[i - 1].value : st.value;
        const ofTop = top > 0 ? Math.round((st.value / top) * 100) : 0;
        const step = prev > 0 ? Math.round((st.value / prev) * 100) : 0;
        const width = top > 0 ? Math.max(2, (st.value / top) * 100) : 0;
        return (
          <div key={st.label} title={st.hint}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: C.text, fontWeight: 500 }}>{st.label}</span>
              <span style={{ color: C.textMuted, whiteSpace: 'nowrap' }}>
                <b style={{ color: C.text }}>{fmtNumber(st.value)}</b>
                {i > 0 && <> · {ofTop}% du total · <span style={{ color: step < 50 ? C.red : step < 75 ? C.amber : C.green, fontWeight: 600 }}>{step}% étape</span></>}
              </span>
            </div>
            <div style={{ background: C.borderLight, borderRadius: 6, height: 22, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${width}%`,
                  height: '100%',
                  background: color,
                  opacity: 1 - i * (0.5 / Math.max(1, steps.length - 1)),
                  borderRadius: 6,
                  transition: 'width .4s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Line chart with hover tooltip ────────────────────────────────────────────

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export function LineChart({ labels, series, height = 200 }: { labels: string[]; series: LineSeries[]; height?: number }) {
  const W = 720;
  const H = height;
  const PAD = { top: 14, right: 12, bottom: 28, left: 40 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = labels.length;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = Math.ceil(maxVal / 4) * 4 || 4;
  const x = (i: number) => PAD.left + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const y = (v: number) => PAD.top + chartH - (v / niceMax) * chartH;
  const ticks = [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / chartW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} y1={y(t)} x2={W - PAD.right} y2={y(t)} stroke={C.border} strokeDasharray="4 4" />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill={C.textMuted}>
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 || (i === n - 1 && (n - 1) % labelEvery >= labelEvery / 2) ? (
            <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill={C.textMuted}>
              {l}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          const area = `${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`;
          return (
            <g key={s.key}>
              <polygon points={area} fill={s.color} opacity={0.07} />
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} y1={PAD.top} x2={x(hover)} y2={PAD.top + chartH} stroke={C.textMuted} strokeOpacity={0.4} />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={3.5} fill={s.color} stroke="#fff" strokeWidth={1.5} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: `${Math.min(80, Math.max(2, (x(hover) / W) * 100))}%`,
            transform: 'translateX(-50%)',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: 'var(--shadow-sm)',
            padding: '8px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            minWidth: 140,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: C.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                {s.label}
              </span>
              <b>{fmtNumber(s.values[hover] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items, active, onToggle }: { items: { key: string; label: string; color: string }[]; active?: Set<string>; onToggle?: (key: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((it) => {
        const on = !active || active.has(it.key);
        return (
          <button
            key={it.key}
            onClick={() => onToggle?.(it.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'inherit',
              padding: '4px 10px',
              borderRadius: 999,
              border: `1px solid ${on ? it.color : C.border}`,
              background: on ? `color-mix(in srgb, ${it.color} 10%, transparent)` : 'transparent',
              color: on ? C.text : C.textMuted,
              cursor: onToggle ? 'pointer' : 'default',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color, opacity: on ? 1 : 0.35 }} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Weekday × hour heatmap ───────────────────────────────────────────────────

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function Heatmap({ matrix, color = '108, 71, 255' }: { matrix: number[][]; color?: string }) {
  const max = Math.max(1, ...matrix.flat());
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  if (total === 0) return <Empty />;

  let peak = { d: 0, h: 0, v: 0 };
  matrix.forEach((row, d) => row.forEach((v, h) => { if (v > peak.v) peak = { d, h, v }; }));
  const byDay = matrix.map((row) => row.reduce((a, b) => a + b, 0));
  const bestDay = byDay.indexOf(Math.max(...byDay));

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `36px repeat(24, minmax(14px, 1fr))`, gap: 3, minWidth: 460 }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ fontSize: 9, color: C.textMuted, textAlign: 'center' }}>{h % 3 === 0 ? `${h}h` : ''}</span>
          ))}
          {matrix.map((row, d) => (
            <React.Fragment key={d}>
              <span style={{ fontSize: 10, color: C.textMuted, alignSelf: 'center' }}>{DAYS[d]}</span>
              {row.map((v, h) => (
                <div
                  key={h}
                  title={`${DAYS[d]} ${h}h–${h + 1}h : ${v} transaction(s)`}
                  style={{
                    height: 16,
                    borderRadius: 3,
                    background: v === 0 ? C.borderLight : `rgba(${color}, ${0.15 + 0.85 * (v / max)})`,
                  }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: C.textMuted }}>
        Pic : <b style={{ color: C.text }}>{DAYS[peak.d]} {peak.h}h–{peak.h + 1}h</b> ({peak.v} transactions) · Jour le plus actif :{' '}
        <b style={{ color: C.text }}>{DAYS[bestDay]}</b>. Idéal pour programmer les campagnes juste avant ces créneaux.
      </p>
    </div>
  );
}

// ── Simple table ─────────────────────────────────────────────────────────────

export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

export function DataTable<T>({ rows, columns, onRowClick, rowKey }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; rowKey: (row: T) => string }) {
  if (rows.length === 0) return <Empty />;
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {columns.map((c) => (
              <th
                key={c.header}
                style={{ textAlign: c.align ?? 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: onRowClick ? 'pointer' : 'default' }}
              onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = C.surfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map((c) => (
                <td key={c.header} style={{ padding: '9px 10px', textAlign: c.align ?? 'left', color: C.text }}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
