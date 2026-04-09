import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClients } from '../api';
import { ClientRow, Pagination } from '../types';
import { C, S } from '../theme';
import { fmtDate } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';
import { useDebouncedSearch } from '../utils/useDebouncedSearch';

const STATUSES = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'deactivated', label: 'Desactives' },
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

export default function Clients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(() => setPage(1));
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getClients(page, 20, debouncedSearch || undefined, status || undefined);
      setClients(res.clients);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => { load(); }, [load]);

  const resetPage = () => setPage(1);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>
          Clients (JitPlus){' '}
          {pagination && <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 400 }}>({pagination.total})</span>}
        </h2>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Rechercher par nom, email ou telephone..."
          style={{
            ...S.input,
            width: 280,
            background: C.surface,
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {STATUSES.map((s) => (
          <button key={s.value} onClick={() => { setStatus(s.value); resetPage(); }} style={pillStyle(status === s.value)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? (
          <p style={{ color: C.textMuted }}>Chargement…</p>
        ) : error ? (
          <p style={{ color: C.red }}>{error}</p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Prénom', 'Nom', 'Email', 'Téléphone', 'Pays', 'Commerçants', 'Inscrit le'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clients/${c.id}`)}
                    style={{ borderBottom: `1px solid `, cursor: 'pointer' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = C.surfaceHover)}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 10px', fontWeight: 600, color: C.text }}>
                      {c.prenom ?? '—'}
                    </td>
                    <td style={{ padding: '10px 10px', fontWeight: 600, color: C.text }}>
                      {c.nom ?? '—'}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} style={{ color: C.cyan, textDecoration: 'none' }}>
                          {c.email}
                        </a>
                      ) : (
                        <span style={{ color: C.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      {c.telephone ? (
                        <a href={`tel:${c.telephone}`} onClick={(e) => e.stopPropagation()} style={{ color: C.green, textDecoration: 'none' }}>
                          {c.telephone}
                        </a>
                      ) : (
                        <span style={{ color: C.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 10px', color: C.textMuted }}>
                      <span style={S.badge(C.blue)}>{c.countryCode}</span>
                    </td>
                    <td style={{ padding: '10px 10px', color: C.textMuted }}>{c.merchantCount}</td>
                    <td style={{ padding: '10px 10px', color: C.textMuted }}>{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>
                      Aucun client trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p style={{ color: C.textMuted, fontSize: 11, marginTop: 8 }}>
              Cliquez sur un client pour voir son profil complet.
            </p>
          </>
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
            <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} style={S.btnOutline()}>
              Suivant →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
