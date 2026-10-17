import React, { useCallback, useRef, useState } from 'react';
import { C, S } from '../theme';
import { activityColor, fmtDate, fmtNumber, fmtRelative } from '../utils/format';

// ── Page header ──────────────────────────────────────────────────────────────

export function PageHeader({ title, count, subtitle, right }: { title: React.ReactNode; count?: number; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', color: C.text }}>
          {title}
          {count !== undefined && <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 400 }}> ({fmtNumber(count)})</span>}
        </h2>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted }}>{subtitle}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

export const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'inherit',
  borderRadius: 'var(--radius-sm)',
  border: `1px solid ${active ? C.primary : C.border}`,
  background: active ? C.primary : 'transparent',
  color: active ? '#fff' : C.textMuted,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
});

export interface Option<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

export function PillGroup<V extends string>({ label, options, value, onChange }: { label?: string; options: Option<V>[]; value: V; onChange: (v: V) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {label && <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>{label}</span>}
      {options.map((o) => (
        <button key={o.value} title={o.hint} onClick={() => onChange(o.value)} style={pillStyle(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectFilter({ value, onChange, options, style }: { value: string; onChange: (v: string) => void; options: Option[]; style?: React.CSSProperties }) {
  const on = value !== options[0]?.value;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...S.input,
        width: 'auto',
        padding: '5px 10px',
        fontSize: 12,
        background: on ? C.primary : C.surface,
        color: on ? '#fff' : C.text,
        cursor: 'pointer',
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...S.card, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
    </div>
  );
}

export function Divider() {
  return <div style={{ width: 1, height: 24, background: C.border }} />;
}

export function SearchInput({ value, onChange, placeholder, width = 280 }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number | string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...S.input, width, background: C.surface }}
    />
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total?: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 }}>
      {total !== undefined && <span style={{ fontSize: 12, color: C.textMuted, marginRight: 'auto' }}>{fmtNumber(total)} résultats</span>}
      <button disabled={page <= 1} onClick={() => onPage(1)} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '6px 10px', opacity: page <= 1 ? 0.4 : 1 }}>«</button>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '6px 12px', opacity: page <= 1 ? 0.4 : 1 }}>← Précédent</button>
      <span style={{ color: C.textMuted, fontSize: 13 }}>Page {page} / {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '6px 12px', opacity: page >= totalPages ? 0.4 : 1 }}>Suivant →</button>
      <button disabled={page >= totalPages} onClick={() => onPage(totalPages)} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '6px 10px', opacity: page >= totalPages ? 0.4 : 1 }}>»</button>
    </div>
  );
}

// ── Export button ────────────────────────────────────────────────────────────

/** Button that runs an async export and shows progress ("1 200 lignes…") while it runs. */
export function ExportButton({ onExport, label = 'Exporter CSV', small }: { onExport: (progress: (n: number) => void) => Promise<void>; label?: string; small?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; n: number; error?: string }>({ busy: false, n: 0 });
  const run = async () => {
    setState({ busy: true, n: 0 });
    try {
      await onExport((n) => setState({ busy: true, n }));
      setState({ busy: false, n: 0 });
    } catch (e) {
      setState({ busy: false, n: 0, error: e instanceof Error ? e.message : 'Erreur' });
    }
  };
  return (
    <button
      onClick={run}
      disabled={state.busy}
      title={state.error ?? 'Télécharger les lignes filtrées (ouvrable dans Excel)'}
      style={{
        ...S.btnOutline(state.error ? C.red : C.textMuted),
        borderColor: state.error ? C.red : C.border,
        padding: small ? '5px 10px' : '7px 14px',
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        opacity: state.busy ? 0.7 : 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      {state.busy ? (state.n ? `${fmtNumber(state.n)} lignes…` : 'Export…') : state.error ? 'Échec, réessayer' : label}
    </button>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────────

export function useToast(): [React.ReactNode, (msg: string, tone?: 'ok' | 'error') => void] {
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ msg, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const node = toast ? (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        background: C.surface,
        border: `1px solid ${toast.tone === 'error' ? C.red : C.border}`,
        borderLeft: `4px solid ${toast.tone === 'error' ? C.red : C.green}`,
        borderRadius: 10,
        padding: '12px 18px',
        color: C.text,
        fontSize: 13,
        zIndex: 999,
        boxShadow: 'var(--shadow-sm)',
        maxWidth: 380,
      }}
    >
      {toast.msg}
    </div>
  ) : null;
  return [node, show];
}

// ── Small display helpers ────────────────────────────────────────────────────

export function LastActivity({ date }: { date: string | null | undefined }) {
  return (
    <span title={date ? fmtDate(date) : 'Aucune transaction'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: date ? C.text : C.textMuted, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: activityColor(date), flexShrink: 0 }} />
      {fmtRelative(date)}
    </span>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: C.textMuted }}>{children}</span>;
}

export function Dash() {
  return <span style={{ color: C.textMuted }}>—</span>;
}

/** Linear progress bar with a label on the right. */
export function Progress({ value, max, color = C.primary, label }: { value: number; max: number; color?: string; label?: React.ReactNode }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 90 }}>
      <div style={{ flex: 1, background: C.borderLight, borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      {label !== undefined && <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  );
}

/** Check-list row: green tick when done, grey circle otherwise. */
export function CheckItem({ done, label, hint }: { done: boolean; label: string; hint?: string }) {
  return (
    <div title={hint} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: done ? C.text : C.textMuted }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: done ? C.green : 'transparent',
          border: done ? 'none' : `1.5px solid ${C.border}`,
        }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </div>
  );
}

export function KeyValue({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.borderLight}`, fontSize: 13 }}>
      <span style={{ color: C.textMuted }}>{label}</span>
      <span style={{ color: color ?? C.text, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
