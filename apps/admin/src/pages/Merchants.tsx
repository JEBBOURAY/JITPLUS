import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMerchants } from '../api';
import { MerchantRow, Pagination } from '../types';
import PlanBadge from '../components/PlanBadge';
import { C, S } from '../theme';
import { fmtDate } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';
import { useDebouncedSearch } from '../utils/useDebouncedSearch';

const PLANS = [
  { value: '', label: 'Tous les plans' },
  { value: 'FREE', label: 'Free' },
  { value: 'PREMIUM', label: 'Premium' },
];

const STATUSES = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'banned', label: 'Bannis' },
  { value: 'deleted', label: 'Supprimes' },
];

const CATEGORIES = [
  { value: '', label: 'Toutes categories' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'EPICERIE', label: 'Epicerie' },
  { value: 'BOULANGERIE', label: 'Boulangerie' },
  { value: 'PHARMACIE', label: 'Pharmacie' },
  { value: 'LIBRAIRIE', label: 'Librairie' },
  { value: 'VETEMENTS', label: 'Vetements' },
  { value: 'ELECTRONIQUE', label: 'Electronique' },
  { value: 'COIFFURE', label: 'Coiffure' },
  { value: 'BEAUTE', label: 'Beaute' },
  { value: 'SPORT', label: 'Sport' },
  { value: 'SUPERMARCHE', label: 'Supermarche' },
  { value: 'AUTRE', label: 'Autre' },
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

export default function Merchants() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch, debouncedSearch] = useDebouncedSearch();
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [categorie, setCategorie] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMerchants(page, 20, debouncedSearch || undefined, plan || undefined, status || undefined, categorie || undefined);
      setMerchants(res.merchants);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, plan, status, categorie]);

  useEffect(() => { load(); }, [load]);

  const resetPage = () => setPage(1);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>
          Commercants {pagination && <span style={{ color: C.textMuted, fontSize: 14, fontWeight: 400 }}>({pagination.total})</span>}
        </h2>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          placeholder="Rechercher par nom, email ou telephone..."
          style={{
            ...S.input,
            width: 280,
            background: C.surface,
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Plan */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PLANS.map((p) => (
            <button key={p.value} onClick={() => { setPlan(p.value); resetPage(); }} style={pillStyle(plan === p.value)}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: C.border }} />

        {/* Status */}
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUSES.map((s) => (
            <button key={s.value} onClick={() => { setStatus(s.value); resetPage(); }} style={pillStyle(status === s.value)}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: C.border }} />

        {/* Category */}
        <select
          value={categorie}
          onChange={(e) => { setCategorie(e.target.value); resetPage(); }}
          style={{
            ...S.input,
            width: 'auto',
            padding: '5px 10px',
            fontSize: 12,
            background: categorie ? C.primary : C.surface,
            color: categorie ? '#fff' : C.text,
            cursor: 'pointer',
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Reset */}
        {(plan || status || categorie) && (
          <button
            onClick={() => { setPlan(''); setStatus(''); setCategorie(''); resetPage(); }}
            style={{ ...pillStyle(false), color: C.red, borderColor: C.red }}
          >
            Reinitialiser
          </button>
        )}
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
              {merchants.map((m) => (
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
              {merchants.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>
                    Aucun commerçant trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p style={{ color: C.textMuted, fontSize: 11, marginTop: 8 }}>Cliquez sur un commercant pour voir son profil complet.</p>
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
