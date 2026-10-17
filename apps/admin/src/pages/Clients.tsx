import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getClients } from '../api';
import type { ClientListParams, ClientRow, Pagination as PaginationT } from '../types';
import { DataTable, type Column } from '../components/charts';
import {
  Dash, Divider, ExportButton, FilterBar, LastActivity, PageHeader, Pagination, PillGroup, SearchInput, SelectFilter, pillStyle,
} from '../components/ui';
import { C, S } from '../theme';
import { fmtDate, fmtNumber } from '../utils/format';
import { exportCsv, fetchAllPages } from '../utils/csv';
import { useDebouncedInput, useUrlFilters } from '../utils/useUrlFilters';

const DEFAULTS = { search: '', status: '', activity: '', type: '', sort: 'recent' };
type Filters = typeof DEFAULTS;

const STATUSES = [
  { value: '', label: 'Actifs' },
  { value: 'deactivated', label: 'Désactivés' },
  { value: 'deleted', label: 'Supprimés' },
];

const ACTIVITY = [
  { value: '', label: 'Toute activité' },
  { value: 'active30', label: 'Actifs 30 j', hint: 'Au moins un passage en caisse ces 30 derniers jours' },
  { value: 'inactive', label: 'Inactifs', hint: 'Déjà venus, mais pas depuis 30 jours' },
  { value: 'never', label: 'Jamais venus', hint: 'Inscrits sans aucune transaction' },
];

const TYPES = [
  { value: '', label: 'Tous' },
  { value: 'registered', label: 'Inscrits', hint: 'Compte créé dans l\'app JitPlus' },
  { value: 'anonymous', label: 'Ajout rapide', hint: 'Créés en caisse par un commerçant, pas encore réclamés' },
];

const SORTS = [
  { value: 'recent', label: 'Plus récents' },
  { value: 'oldest', label: 'Plus anciens' },
  { value: 'cards', label: 'Plus de cartes' },
  { value: 'name', label: 'Prénom (A→Z)' },
];

function toParams(f: Filters, page: number, limit = 20): ClientListParams {
  return {
    page,
    limit,
    search: f.search || undefined,
    status: f.status as ClientListParams['status'],
    activity: f.activity as ClientListParams['activity'],
    type: f.type as ClientListParams['type'],
    sort: f.sort as ClientListParams['sort'],
  };
}

const fullName = (c: ClientRow) => [c.prenom, c.nom].filter(Boolean).join(' ');

export default function Clients() {
  const navigate = useNavigate();
  const { filters, page, update, reset, active } = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useDebouncedInput(filters.search, (v) => update({ search: v }));
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [pagination, setPagination] = useState<PaginationT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getClients(toParams(filters, page));
      setRows(res.clients);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const exportAll = async (progress: (n: number) => void) => {
    const all = await fetchAllPages(async (p, limit) => {
      const r = await getClients(toParams(filters, p, limit));
      return { rows: r.clients, totalPages: r.pagination.totalPages };
    }, progress);
    exportCsv('clients', all, [
      { header: 'Prénom', value: (c) => c.prenom },
      { header: 'Nom', value: (c) => c.nom },
      { header: 'Email', value: (c) => c.email },
      { header: 'Téléphone', value: (c) => c.telephone },
      { header: 'Pays', value: (c) => c.countryCode },
      { header: 'Type', value: (c) => (c.isAnonymous ? 'Ajout rapide' : 'Inscrit') },
      { header: 'Joignable push', value: (c) => (c.pushReachable ? 'Oui' : 'Non') },
      { header: 'Cartes actives', value: (c) => c.merchantCount },
      { header: 'Transactions', value: (c) => c.transactionCount },
      { header: 'Dernière visite', value: (c) => c.lastActivityAt?.slice(0, 10) },
      { header: 'Inscrit le', value: (c) => c.createdAt.slice(0, 10) },
    ]);
  };

  const columns: Column<ClientRow>[] = [
    {
      header: 'Client',
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            {fullName(c) || <span style={{ color: C.textMuted, fontWeight: 400 }}>Sans nom</span>}
            {c.isAnonymous && <span style={S.badge(C.amber)}>Ajout rapide</span>}
            {c.deletedAt && <span style={S.badge(C.red)}>{filters.status === 'deleted' ? 'Supprimé' : 'Désactivé'}</span>}
          </div>
          {c.email && !c.email.startsWith('deleted_') && <div style={{ fontSize: 11, color: C.textMuted }}>{c.email}</div>}
        </div>
      ),
    },
    {
      header: 'Téléphone',
      render: (c) => c.telephone
        ? <a href={`tel:${c.telephone}`} onClick={(e) => e.stopPropagation()} style={{ color: C.green, textDecoration: 'none', whiteSpace: 'nowrap' }}>{c.telephone}</a>
        : <Dash />,
    },
    { header: 'Pays', render: (c) => <span style={S.badge(C.blue)}>{c.countryCode}</span> },
    {
      header: 'Push',
      align: 'center',
      render: (c) => (
        <span title={c.pushReachable ? 'Joignable par notification push' : 'Push désactivé ou jamais autorisé'} style={{ color: c.pushReachable ? C.green : C.textMuted, fontWeight: 600 }}>
          {c.pushReachable ? 'Oui' : 'Non'}
        </span>
      ),
    },
    { header: 'Cartes', align: 'right', render: (c) => <b>{fmtNumber(c.merchantCount)}</b> },
    { header: 'Transactions', align: 'right', render: (c) => fmtNumber(c.transactionCount) },
    { header: 'Dernière visite', render: (c) => <LastActivity date={c.lastActivityAt} /> },
    { header: 'Inscrit le', render: (c) => <span style={{ color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</span> },
  ];

  return (
    <div style={{ paddingBottom: 48 }}>
      <PageHeader
        title="Clients (JitPlus)"
        count={pagination?.total}
        subtitle="Utilisateurs de l'app JitPlus : fréquentation, cartes de fidélité et joignabilité."
        right={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Nom, email ou téléphone…" />
            <ExportButton onExport={exportAll} />
          </>
        }
      />

      <FilterBar>
        <PillGroup label="Compte" options={STATUSES} value={filters.status} onChange={(v) => update({ status: v })} />
        <Divider />
        <PillGroup options={ACTIVITY} value={filters.activity} onChange={(v) => update({ activity: v })} />
        <Divider />
        <PillGroup label="Type" options={TYPES} value={filters.type} onChange={(v) => update({ type: v })} />
        <Divider />
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
          <p style={{ textAlign: 'center', padding: 32, color: C.textMuted, margin: 0 }}>Aucun client ne correspond à ces filtres.</p>
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => navigate(`/clients/${c.id}`)} />
        )}
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={(p) => update({ page: p })} />
        )}
      </div>
    </div>
  );
}
