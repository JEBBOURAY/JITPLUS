import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { C, S } from '../theme';
import {
  getReferralStats,
  getMerchantReferrals,
  getClientReferrals,
  getTopReferrers,
} from '../api';
import type {
  ReferralStats,
  MerchantReferralRow,
  ClientReferralRow,
  TopReferrer,
  Pagination,
} from '../types';
import { fmtDate } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

type Tab = 'merchant' | 'client' | 'top';
type ClientFilter = 'ALL' | 'PENDING' | 'VALIDATED';

const PLAN_COLORS: Record<string, string> = {
  FREE: C.textMuted,
  PREMIUM: C.amber,
  TRIAL: C.cyan,
};

export default function Referrals() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [tab, setTab] = useState<Tab>('merchant');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Merchant referrals
  const [merchantRefs, setMerchantRefs] = useState<MerchantReferralRow[]>([]);
  const [merchantPag, setMerchantPag] = useState<Pagination | null>(null);
  const [merchantPage, setMerchantPage] = useState(1);
  const [merchantSearch, setMerchantSearch] = useState('');

  // Client referrals
  const [clientRefs, setClientRefs] = useState<ClientReferralRow[]>([]);
  const [clientPag, setClientPag] = useState<Pagination | null>(null);
  const [clientPage, setClientPage] = useState(1);
  const [clientFilter, setClientFilter] = useState<ClientFilter>('ALL');
  const [clientSearch, setClientSearch] = useState('');

  // Top referrers
  const [topRefs, setTopRefs] = useState<TopReferrer[]>([]);

  const fetchingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load stats once
  useEffect(() => {
    getReferralStats()
      .then(setStats)
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  // Load current tab data
  const loadData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError('');
    try {
      if (tab === 'merchant') {
        const res = await getMerchantReferrals(merchantPage, 20, merchantSearch || undefined);
        setMerchantRefs(res.referrals);
        setMerchantPag(res.pagination);
      } else if (tab === 'client') {
        const res = await getClientReferrals(
          clientPage, 20,
          clientFilter === 'ALL' ? undefined : clientFilter,
          clientSearch || undefined,
        );
        setClientRefs(res.referrals);
        setClientPag(res.pagination);
      } else {
        const res = await getTopReferrers(30);
        setTopRefs(res);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [tab, merchantPage, merchantSearch, clientPage, clientFilter, clientSearch]);

  useEffect(() => { loadData(); }, [loadData]);

  // Debounced search
  const handleMerchantSearch = (val: string) => {
    setMerchantSearch(val);
    setMerchantPage(1);
  };
  const handleClientSearch = (val: string) => {
    setClientSearch(val);
    setClientPage(1);
  };

  // Reset page on filter change
  useEffect(() => { setClientPage(1); }, [clientFilter]);

  // ── Stat cards ─────────────────────────────────────────────────────────────
  const StatCard = ({ icon, label, value, color, alphaColor }: { icon: string; label: string; value: string | number; color: string; alphaColor?: string }) => (
    <div style={{
      ...S.card, flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, background: alphaColor || 'var(--theme-primary-alpha)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{value}</div>
        <div style={{ fontSize: 11, color: C.textMuted }}>{label}</div>
      </div>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    padding: '8px 14px',
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13,
    outline: 'none',
    width: 260,
  };

  const pag = tab === 'merchant' ? merchantPag : tab === 'client' ? clientPag : null;
  const page = tab === 'merchant' ? merchantPage : clientPage;
  const setPage = tab === 'merchant' ? setMerchantPage : setClientPage;

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontWeight: 800, fontSize: 22, color: C.text }}>
        🤝 Gestion des parrainages
      </h2>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard icon="🏪" label="Parrainages M→M" value={stats.merchantToMerchant.total} color={C.primary} alphaColor={C.primaryAlpha} />
          <StatCard icon="📅" label="Mois offerts (total)" value={stats.merchantToMerchant.totalMonthsEarned} color={C.cyan} alphaColor="rgba(6, 182, 212, 0.15)" />
          <StatCard icon="👥" label="Parrainages C→M" value={stats.clientToMerchant.total} color={C.green} alphaColor={C.greenAlpha} />
          <StatCard icon="⏳" label="En attente" value={stats.clientToMerchant.pending} color={C.amber} alphaColor="rgba(245, 158, 11, 0.15)" />
          <StatCard icon="✅" label="Validés" value={stats.clientToMerchant.validated} color={C.green} alphaColor={C.greenAlpha} />
          <StatCard icon="💰" label="Balance totale" value={`${stats.clientToMerchant.totalBalance} DH`} color={C.blue} alphaColor="rgba(59, 130, 246, 0.15)" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { key: 'merchant' as Tab, label: '🏪 Commerçant → Commerçant' },
          { key: 'client' as Tab, label: '👥 Client → Commerçant' },
          { key: 'top' as Tab, label: '🏆 Top Parrains' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...S.btn(tab === t.key ? C.primary : 'transparent'),
              color: tab === t.key ? '#fff' : C.textMuted,
              border: tab === t.key ? 'none' : `1px solid ${C.border}`,
              fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>❌ {error}</p>}

      {/* ── Merchant → Merchant tab ─────────────────────────────────────── */}
      {tab === 'merchant' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
              Parrainages Commerçant → Commerçant
            </h3>
            <input
              value={merchantSearch}
              onChange={(e) => handleMerchantSearch(e.target.value)}
              placeholder="🔍 Rechercher…"
              style={inputStyle}
            />
          </div>

          {loading ? (
            <p style={{ color: C.textMuted, textAlign: 'center', padding: 40 }}>Chargement…</p>
          ) : merchantRefs.length === 0 ? (
            <p style={{ color: C.textMuted, textAlign: 'center', padding: 40 }}>Aucun parrainage trouvé</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Filleul', 'Catégorie', 'Plan', 'Parrain', 'Code', 'Bonus', 'Date'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: C.textMuted, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {merchantRefs.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ` }}>
                    <td style={{ padding: '10px' }}>
                      <span
                        onClick={() => navigate(`/merchants/${r.id}`)}
                        style={{ color: C.primary, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                      >
                        {r.nom}
                      </span>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{r.email}</div>
                    </td>
                    <td style={{ padding: '10px', fontSize: 12, color: C.textMuted }}>{r.categorie}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={S.badge(PLAN_COLORS[r.plan] ?? C.textMuted)}>{r.plan}</span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {r.referrer ? (
                        <>
                          <span
                            onClick={() => navigate(`/merchants/${r.referrer!.id}`)}
                            style={{ color: C.cyan, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                          >
                            {r.referrer.nom}
                          </span>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{r.referrer.email}</div>
                        </>
                      ) : (
                        <span style={{ color: C.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {r.referrer?.referralCode ? (
                        <code style={{
                          background: C.bg, padding: '2px 8px', borderRadius: 4,
                          fontSize: 12, color: C.cyan, fontFamily: 'monospace',
                        }}>
                          {r.referrer.referralCode}
                        </code>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={S.badge(r.bonusCredited ? C.green : C.amber)}>
                        {r.bonusCredited ? '✅ Crédité' : '⏳ En attente'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: 12, color: C.textMuted }}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Client → Merchant tab ─────────────────────────────────────── */}
      {tab === 'client' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>
              Parrainages Client → Commerçant
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['ALL', 'PENDING', 'VALIDATED'] as ClientFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setClientFilter(f)}
                    style={{
                      ...S.btn(clientFilter === f ? (f === 'PENDING' ? C.amber : f === 'VALIDATED' ? C.green : C.primary) : 'transparent'),
                      color: clientFilter === f ? '#fff' : C.textMuted,
                      border: clientFilter === f ? 'none' : `1px solid ${C.border}`,
                      padding: '5px 12px',
                      fontSize: 11,
                    }}
                  >
                    {f === 'ALL' ? 'Tous' : f === 'PENDING' ? '⏳ En attente' : '✅ Validés'}
                  </button>
                ))}
              </div>
              <input
                value={clientSearch}
                onChange={(e) => handleClientSearch(e.target.value)}
                placeholder="🔍 Rechercher…"
                style={inputStyle}
              />
            </div>
          </div>

          {loading ? (
            <p style={{ color: C.textMuted, textAlign: 'center', padding: 40 }}>Chargement…</p>
          ) : clientRefs.length === 0 ? (
            <p style={{ color: C.textMuted, textAlign: 'center', padding: 40 }}>Aucun parrainage trouvé</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Client (parrain)', 'Code', 'Commerçant (filleul)', 'Plan', 'Statut', 'Montant', 'Date', 'Validé le'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: C.textMuted, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientRefs.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ` }}>
                    <td style={{ padding: '10px' }}>
                      <span
                        onClick={() => navigate(`/clients/${r.client.id}`)}
                        style={{ color: C.primary, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                      >
                        {[r.client.prenom, r.client.nom].filter(Boolean).join(' ') || '—'}
                      </span>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{r.client.email ?? '—'}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {r.client.referralCode ? (
                        <code style={{
                          background: C.bg, padding: '2px 8px', borderRadius: 4,
                          fontSize: 12, color: C.cyan, fontFamily: 'monospace',
                        }}>
                          {r.client.referralCode}
                        </code>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        onClick={() => navigate(`/merchants/${r.merchant.id}`)}
                        style={{ color: C.cyan, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                      >
                        {r.merchant.nom}
                      </span>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{r.merchant.email}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={S.badge(PLAN_COLORS[r.merchant.plan] ?? C.textMuted)}>{r.merchant.plan}</span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={S.badge(r.status === 'VALIDATED' ? C.green : C.amber)}>
                        {r.status === 'VALIDATED' ? '✅ Validé' : '⏳ En attente'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', fontSize: 13, fontWeight: 600, color: r.amount > 0 ? C.green : C.textMuted }}>
                      {r.amount > 0 ? `${r.amount} DH` : '—'}
                    </td>
                    <td style={{ padding: '10px', fontSize: 12, color: C.textMuted }}>{fmtDate(r.createdAt)}</td>
                    <td style={{ padding: '10px', fontSize: 12, color: C.textMuted }}>
                      {r.validatedAt ? fmtDate(r.validatedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Top Referrers tab ─────────────────────────────────────────── */}
      {tab === 'top' && (
        <div style={S.card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: C.text }}>
            🏆 Top Parrains (Commerçants)
          </h3>

          {loading ? (
            <p style={{ color: C.textMuted, textAlign: 'center', padding: 40 }}>Chargement…</p>
          ) : topRefs.length === 0 ? (
            <p style={{ color: C.textMuted, textAlign: 'center', padding: 40 }}>Aucun parrain trouvé</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['#', 'Commerçant', 'Code', 'Plan', 'Filleuls', 'Mois gagnés'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: C.textMuted, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topRefs.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ` }}>
                    <td style={{ padding: '10px', fontSize: 16, fontWeight: 800, color: i < 3 ? C.amber : C.textMuted }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        onClick={() => navigate(`/merchants/${r.id}`)}
                        style={{ color: C.primary, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                      >
                        {r.nom}
                      </span>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{r.email}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {r.referralCode ? (
                        <code style={{
                          background: C.bg, padding: '2px 8px', borderRadius: 4,
                          fontSize: 12, color: C.cyan, fontFamily: 'monospace',
                        }}>
                          {r.referralCode}
                        </code>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={S.badge(PLAN_COLORS[r.plan] ?? C.textMuted)}>{r.plan}</span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{r.referredCount}</span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: C.green }}>{r.monthsEarned}</span>
                      <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>mois</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {pag && pag.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{ ...S.btnOutline(C.primary), opacity: page <= 1 ? 0.3 : 1, padding: '6px 14px', fontSize: 12 }}
          >
            ← Préc.
          </button>
          <span style={{ color: C.textMuted, fontSize: 13 }}>
            Page {pag.page} / {pag.totalPages} ({pag.total} résultats)
          </span>
          <button
            onClick={() => setPage(Math.min(pag.totalPages, page + 1))}
            disabled={page >= pag.totalPages}
            style={{ ...S.btnOutline(C.primary), opacity: page >= pag.totalPages ? 0.3 : 1, padding: '6px 14px', fontSize: 12 }}
          >
            Suiv. →
          </button>
        </div>
      )}
    </div>
  );
}
