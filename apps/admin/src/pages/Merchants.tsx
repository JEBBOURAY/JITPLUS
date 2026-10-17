import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getMerchantFacets, getMerchants } from '../api';
import type { MerchantFacets, MerchantListParams, MerchantRow, Pagination as PaginationT } from '../types';
import PlanBadge from '../components/PlanBadge';
import { DataTable, type Column } from '../components/charts';
import {
  Dash, Divider, ExportButton, FilterBar, LastActivity, Muted, PageHeader, Pagination, PillGroup, SearchInput, SelectFilter, pillStyle,
} from '../components/ui';
import { C, S } from '../theme';
import { CATEGORY_LABELS, daysSince, fmtDate, fmtNumber } from '../utils/format';
import { exportCsv, fetchAllPages } from '../utils/csv';
import { useDebouncedInput, useUrlFilters } from '../utils/useUrlFilters';

const DEFAULTS = { search: '', plan: '', status: '', activity: '', categorie: '', ville: '', sort: 'recent' };
type Filters = typeof DEFAULTS;

const PLANS = [
  { value: '', label: 'Tous' },
  { value: 'FREE', label: 'Free' },
  { value: 'TRIAL', label: 'Essai', hint: 'Premium en période d\'essai, non expiré' },
  { value: 'PAID', label: 'Payant', hint: 'Premium activé par un admin' },
];

const ACTIVITY = [
  { value: '', label: 'Toute activité' },
  { value: 'active30', label: 'Actifs 30 j', hint: 'Au moins une transaction ces 30 derniers jours' },
  { value: 'dormant', label: 'Dormants', hint: 'Ont déjà utilisé l\'app, mais rien depuis 30 jours' },
  { value: 'never', label: 'Jamais utilisé', hint: 'Aucune transaction depuis l\'inscription' },
];

const STATUSES = [
  { value: '', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'banned', label: 'Bannis' },
  { value: 'deleted', label: 'Supprimés' },
];

const SORTS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'oldest', label: 'Plus anciens' },
  { value: 'clients', label: 'Plus de clients' },
  { value: 'views', label: 'Plus de vues' },
  { value: 'expiring', label: 'Expiration proche', hint: 'Plans Premium avec une date de fin à venir, la plus proche en premier' },
  { value: 'name', label: 'Nom (A→Z)' },
];

function toParams(f: Filters, page: number, limit = 20): MerchantListParams {
  return {
    page,
    limit,
    search: f.search || undefined,
    plan: f.plan as MerchantListParams['plan'],
    status: f.status as MerchantListParams['status'],
    activity: f.activity as MerchantListParams['activity'],
    categorie: f.categorie || undefined,
    ville: f.ville || undefined,
    sort: f.sort as MerchantListParams['sort'],
  };
}

function planLabel(m: MerchantRow): string {
  if (m.plan !== 'PREMIUM') return 'Free';
  return m.isTrial ? 'Essai' : 'Payant';
}

function statusLabel(m: MerchantRow): string {
  if (m.deletedAt) return 'Supprimé';
  return m.isActive ? 'Actif' : 'Banni';
}

export default function Merchants() {
  const navigate = useNavigate();
  const { filters, page, update, reset, active } = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useDebouncedInput(filters.search, (v) => update({ search: v }));
  const [rows, setRows] = useState<MerchantRow[]>([]);
  const [pagination, setPagination] = useState<PaginationT | null>(null);
  const [facets, setFacets] = useState<MerchantFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { getMerchantFacets().then(setFacets).catch(() => setFacets(null)); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getMerchants(toParams(filters, page));
      setRows(res.merchants);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const categoryOptions = useMemo(() => {
    const counts = new Map(facets?.categories.map((c) => [c.value, c.count]) ?? []);
    return [
      { value: '', label: 'Toutes catégories' },
      ...Object.entries(CATEGORY_LABELS)
        .filter(([v]) => !facets || counts.has(v) || v === filters.categorie)
        .map(([value, label]) => ({ value, label: counts.has(value) ? `${label} (${counts.get(value)})` : label })),
    ];
  }, [facets, filters.categorie]);

  const cityOptions = useMemo(() => [
    { value: '', label: 'Toutes villes' },
    ...(facets?.cities.map((c) => ({ value: c.value, label: `${c.value} (${c.count})` })) ?? []),
    ...(filters.ville && !facets?.cities.some((c) => c.value === filters.ville) ? [{ value: filters.ville, label: filters.ville }] : []),
  ], [facets, filters.ville]);

  const exportAll = async (progress: (n: number) => void) => {
    const all = await fetchAllPages(async (p, limit) => {
      const r = await getMerchants(toParams(filters, p, limit));
      return { rows: r.merchants, totalPages: r.pagination.totalPages };
    }, progress);
    exportCsv('commercants', all, [
      { header: 'Nom', value: (m) => m.nom },
      { header: 'Email', value: (m) => m.email },
      { header: 'Téléphone', value: (m) => m.phoneNumber },
      { header: 'Ville', value: (m) => m.ville },
      { header: 'Catégorie', value: (m) => CATEGORY_LABELS[m.categorie] ?? m.categorie },
      { header: 'Plan', value: planLabel },
      { header: 'Expiration du plan', value: (m) => m.planExpiresAt?.slice(0, 10) },
      { header: 'Clients', value: (m) => m.clientCount },
      { header: 'Boutiques', value: (m) => m.storeCount },
      { header: 'Transactions 30 j', value: (m) => m.transactions30d ?? 0 },
      { header: 'Dernière activité', value: (m) => m.lastActivityAt?.slice(0, 10) },
      { header: 'Vues du profil', value: (m) => m.profileViews },
      { header: 'Statut', value: statusLabel },
      { header: 'Inscrit le', value: (m) => m.createdAt.slice(0, 10) },
    ]);
  };

  const columns: Column<MerchantRow>[] = [
    {
      header: 'Commerçant',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 600, color: m.isActive && !m.deletedAt ? C.text : C.red }}>{m.nom}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{m.email}</div>
        </div>
      ),
    },
    {
      header: 'Téléphone',
      render: (m) => m.phoneNumber
        ? <a href={`tel:${m.phoneNumber}`} onClick={(e) => e.stopPropagation()} style={{ color: C.green, textDecoration: 'none', whiteSpace: 'nowrap' }}>{m.phoneNumber}</a>
        : <Dash />,
    },
    { header: 'Ville', render: (m) => m.ville ?? <Dash /> },
    { header: 'Catégorie', render: (m) => <Muted>{CATEGORY_LABELS[m.categorie] ?? m.categorie}</Muted> },
    {
      header: 'Plan',
      render: (m) => {
        if (m.deletedAt) return <span style={S.badge(C.textMuted)}>Supprimé</span>;
        const left = m.planExpiresAt ? Math.ceil((new Date(m.planExpiresAt).getTime() - Date.now()) / 86_400_000) : null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <PlanBadge plan={m.plan} isTrial={m.isTrial} isActive={m.isActive} />
            {m.plan === 'PREMIUM' && left !== null && (
              <span style={{ fontSize: 10, color: left <= 7 ? C.red : C.textMuted }}>
                {left > 0 ? `expire dans ${left} j` : 'expiré'}
              </span>
            )}
          </div>
        );
      },
    },
    { header: 'Clients', align: 'right', render: (m) => <b>{fmtNumber(m.clientCount)}</b> },
    {
      header: 'Trans. 30 j',
      align: 'right',
      render: (m) => <span style={{ color: (m.transactions30d ?? 0) > 0 ? C.text : C.textMuted }}>{fmtNumber(m.transactions30d ?? 0)}</span>,
    },
    { header: 'Dernière activité', render: (m) => <LastActivity date={m.lastActivityAt} /> },
    {
      header: 'Inscrit le',
      render: (m) => (
        <span title={`${daysSince(m.createdAt)} jours`} style={{ color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</span>
      ),
    },
  ];

  return (
    <div style={{ paddingBottom: 48 }}>
      <PageHeader
        title="Commerçants"
        count={pagination?.total}
        subtitle="Comptes JitPlus Pro : plan, activité réelle et contacts. Les filtres sont dans l'URL, vous pouvez partager une vue."
        right={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Nom, email ou téléphone…" />
            <ExportButton onExport={exportAll} />
          </>
        }
      />

      <FilterBar>
        <PillGroup label="Plan" options={PLANS} value={filters.plan} onChange={(v) => update({ plan: v })} />
        <Divider />
        <PillGroup options={ACTIVITY} value={filters.activity} onChange={(v) => update({ activity: v })} />
        <Divider />
        <PillGroup label="Statut" options={STATUSES} value={filters.status} onChange={(v) => update({ status: v })} />
        <Divider />
        <SelectFilter value={filters.categorie} onChange={(v) => update({ categorie: v })} options={categoryOptions} />
        <SelectFilter value={filters.ville} onChange={(v) => update({ ville: v })} options={cityOptions} />
        <SelectFilter value={filters.sort} onChange={(v) => update({ sort: v })} options={SORTS} style={{ background: C.surface, color: C.text }} />
        {active && (
          <button onClick={reset} style={{ ...pillStyle(false), color: C.red, borderColor: C.red }}>Réinitialiser</button>
        )}
      </FilterBar>

      <div style={S.card}>
        {loading ? (
          <p style={{ color: C.textMuted, margin: 0 }}>Chargement…</p>
        ) : error ? (
          <p style={{ color: C.red, margin: 0 }}>{error}</p>
        ) : rows.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 32, color: C.textMuted, margin: 0 }}>Aucun commerçant ne correspond à ces filtres.</p>
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(m) => m.id} onRowClick={(m) => navigate(`/merchants/${m.id}`)} />
        )}
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={(p) => update({ page: p })} />
        )}
      </div>
    </div>
  );
}
