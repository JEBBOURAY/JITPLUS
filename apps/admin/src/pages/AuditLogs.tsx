import React, { useEffect, useState, useCallback } from 'react';
import { getAuditLogs } from '../api';
import { AuditLogRow, Pagination } from '../types';
import { C, S } from '../theme';
import { fmtDateTime, ACTION_COLOR } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

const ACTIONS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'ADMIN_LOGIN', label: 'Login' },
  { value: 'ACTIVATE_PREMIUM', label: 'Activer Premium' },
  { value: 'REVOKE_PREMIUM', label: 'Revoquer Premium' },
  { value: 'BAN_MERCHANT', label: 'Bannir' },
  { value: 'UNBAN_MERCHANT', label: 'Debannir' },
  { value: 'DELETE_MERCHANT', label: 'Suppr. commercant' },
  { value: 'DEACTIVATE_CLIENT', label: 'Desactiver client' },
  { value: 'ACTIVATE_CLIENT', label: 'Activer client' },
  { value: 'DELETE_CLIENT', label: 'Suppr. client' },
  { value: 'ADMIN_SEND_NOTIFICATION', label: 'Notification' },
  { value: 'UPDATE_PLAN_DURATION', label: 'Modifier plan' },
  { value: 'UPDATE_PAYOUT', label: 'Modifier retrait' },
];

const TARGET_TYPES = [
  { value: '', label: 'Toutes les cibles' },
  { value: 'MERCHANT', label: 'Commercant' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'ADMIN', label: 'Admin' },
];

const pillStyle = (active: boolean): React.CSSProperties => ({
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
});

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAuditLogs(
        page,
        30,
        action || undefined,
        targetType || undefined,
        dateFrom || undefined,
        dateTo || undefined,
      );
      setLogs(res.logs);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, action, targetType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const resetPage = () => setPage(1);
  const hasFilters = action || targetType || dateFrom || dateTo;

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>
        Journal d'audit{' '}
        {pagination && (
          <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 400 }}>
            ({pagination.total})
          </span>
        )}
      </h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Action filter */}
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); resetPage(); }}
          style={{
            ...S.input,
            width: 'auto',
            padding: '5px 10px',
            fontSize: 12,
            background: action ? C.primary : C.surface,
            color: action ? '#fff' : C.text,
            cursor: 'pointer',
          }}
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>

        {/* Target type pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TARGET_TYPES.map((t) => (
            <button key={t.value} onClick={() => { setTargetType(t.value); resetPage(); }} style={pillStyle(targetType === t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: C.border }} />

        {/* Date range */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>Du</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            style={{ ...S.input, width: 'auto', padding: '4px 8px', fontSize: 12 }}
          />
          <span style={{ fontSize: 12, color: C.textMuted }}>au</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            style={{ ...S.input, width: 'auto', padding: '4px 8px', fontSize: 12 }}
          />
        </div>

        {/* Reset */}
        {hasFilters && (
          <button
            onClick={() => { setAction(''); setTargetType(''); setDateFrom(''); setDateTo(''); resetPage(); }}
            style={{ ...pillStyle(false), color: C.red, borderColor: C.red }}
          >
            Reinitialiser
          </button>
        )}
      </div>

      <div style={S.card}>
        {loading ? (
          <p style={{ color: C.textMuted }}>Chargement…</p>
        ) : error ? (
          <p style={{ color: C.red }}>{error}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Date', 'Admin', 'Action', 'Cible', 'IP', 'Détails'].map((h) => (
                  <th
                    key={h}
                    style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    style={{ borderBottom: `1px solid `, cursor: 'pointer' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = C.surfaceHover)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                    onClick={() => setExpanded((prev) => (prev === log.id ? null : log.id))}
                  >
                    <td style={{ padding: '9px 10px', color: C.textMuted, whiteSpace: 'nowrap' }}>
                      {fmtDateTime(log.createdAt)}
                    </td>
                    <td style={{ padding: '9px 10px' }}>{log.adminEmail}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span
                        style={{
                          ...S.badge(ACTION_COLOR[log.action] ?? C.textMuted),
                          fontSize: 10,
                          letterSpacing: 0.5,
                        }}
                      >
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', color: C.textMuted, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.targetLabel ?? log.targetType}
                    </td>
                    <td style={{ padding: '9px 10px', color: C.textMuted }}>{log.ipAddress ?? '—'}</td>
                    <td style={{ padding: '9px 10px', color: C.primary }}>
                      {log.metadata ? (expanded === log.id ? '▲' : '▼') : '—'}
                    </td>
                  </tr>
                  {expanded === log.id && log.metadata && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ padding: '8px 16px 12px', background: C.bg }}
                      >
                        <pre
                          style={{
                            margin: 0,
                            fontSize: 11,
                            color: C.cyan,
                            background: C.surface,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            padding: '10px 14px',
                            overflow: 'auto',
                          }}
                        >
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>
                    Aucun log trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={S.btnOutline()}>
              ← Précédent
            </button>
            <span style={{ display: 'flex', alignItems: 'center', color: C.textMuted, fontSize: 13 }}>
              Page {page} / {pagination.totalPages}
            </span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={S.btnOutline()}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
