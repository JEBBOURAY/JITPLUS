import React, { useEffect, useState, useCallback } from 'react';
import { getAuditLogs } from '../api';
import { AuditLogRow, Pagination } from '../types';
import { C, S } from '../theme';
import { fmtDateTime, ACTION_COLOR } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await getAuditLogs(p, 30);
      setLogs(res.logs);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontWeight: 800, fontSize: 22 }}>
        Audit Logs{' '}
        {pagination && (
          <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 400 }}>
            ({pagination.total})
          </span>
        )}
      </h2>

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
                    style={{ borderBottom: `1px solid ${C.border}22`, cursor: 'pointer' }}
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
