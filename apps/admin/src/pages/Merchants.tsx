import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMerchants } from '../api';
import { MerchantRow, Pagination } from '../types';
import PlanBadge from '../components/PlanBadge';
import { C, S } from '../theme';
import { fmtDate } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

export default function Merchants() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search input
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const load = useCallback(async (p: number, q?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await getMerchants(p, 20, q || undefined);
      setMerchants(res.merchants);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, debouncedSearch); }, [load, page, debouncedSearch]);

  const filtered = merchants;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: 22 }}>
          Commerçants {pagination && <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 400 }}>({pagination.total})</span>}
        </h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍  Nom, email ou téléphone…"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 14px',
            color: C.text,
            fontSize: 13,
            outline: 'none',
            width: 260,
          }}
        />
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
                {['Nom', 'Email', 'Téléphone', 'Ville', 'Catégorie', 'Plan', 'Clients', 'Vues', 'Inscrit le'].map((h) => (
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
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/merchants/${m.id}`)}
                  style={{ borderBottom: `1px solid `, cursor: 'pointer' }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = C.surfaceHover)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 10px', fontWeight: 600, color: m.isActive ? C.text : C.red }}>
                    {m.nom}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <a href={`mailto:${m.email}`} onClick={(e) => e.stopPropagation()} style={{ color: C.cyan, textDecoration: 'none' }}>{m.email}</a>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    {m.phoneNumber
                      ? <a href={`tel:${m.phoneNumber}`} onClick={(e) => e.stopPropagation()} style={{ color: C.green, textDecoration: 'none' }}>{m.phoneNumber}</a>
                      : <span style={{ color: C.textMuted }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 10px', color: C.textMuted }}>{m.ville ?? '—'}</td>
                  <td style={{ padding: '10px 10px', color: C.textMuted, textTransform: 'capitalize', fontSize: 12 }}>
                    {m.categorie.toLowerCase()}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <PlanBadge plan={m.plan} isActive={m.isActive} />
                  </td>
                  <td style={{ padding: '10px 10px', color: C.textMuted }}>{m.clientCount}</td>
                  <td style={{ padding: '10px 10px', color: C.textMuted }}>{m.profileViews}</td>
                  <td style={{ padding: '10px 10px', color: C.textMuted }}>{fmtDate(m.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>
                    Aucun commerçant trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p style={{ color: C.textMuted, fontSize: 11, marginTop: 8 }}>Cliquez sur un commerçant pour voir son profil complet.</p>
          </>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              style={S.btnOutline()}
            >
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
