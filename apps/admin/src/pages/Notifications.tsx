import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getNotificationStats, getNotifications } from '../api';
import type { InsightPeriod, NotificationListParams, NotificationRow, NotificationStats, Pagination as PaginationT } from '../types';
import StatCard from '../components/StatCard';
import { Card, DataTable, Empty, Grid, Legend, LineChart, ShareList, type Column } from '../components/charts';
import {
  Dash, Divider, ExportButton, FilterBar, Muted, PageHeader, Pagination, PillGroup, Progress, SearchInput, pillStyle,
} from '../components/ui';
import { C, S } from '../theme';
import {
  AUDIENCE_LABELS, CHANNEL_COLOR, CHANNEL_LABELS, deltaPct, fmtDateShort, fmtDateTime, fmtNumber, fmtRelative, sharePct,
} from '../utils/format';
import { exportCsv, fetchAllPages } from '../utils/csv';
import { useDebouncedInput, useUrlFilters } from '../utils/useUrlFilters';

const DEFAULTS = { search: '', channel: '', sender: '', merchantId: '', days: '30' };
type Filters = typeof DEFAULTS;

const PERIODS = [
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
];

const SENDERS = [
  { value: '', label: 'Tous' },
  { value: 'merchant', label: 'Commerçants' },
  { value: 'admin', label: 'Admin JitPlus' },
];

const CHANNELS = [
  { value: '', label: 'Tous' },
  { value: 'PUSH', label: 'Push' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
];

const SERIES = [
  { key: 'recipients', label: 'Destinataires', color: 'var(--theme-primary)' },
  { key: 'success', label: 'Délivrées', color: 'var(--theme-green)' },
  { key: 'campaigns', label: 'Campagnes', color: 'var(--theme-amber)' },
] as const;

function toParams(f: Filters, page: number, limit = 20): NotificationListParams {
  return {
    page,
    limit,
    search: f.search || undefined,
    channel: f.channel || undefined,
    sender: f.sender as NotificationListParams['sender'],
    merchantId: f.merchantId || undefined,
  };
}

const successRate = (n: NotificationRow) => sharePct(n.successCount, n.recipientCount);
const readRate = (n: NotificationRow) => sharePct(n.inboxRead, n.inboxDelivered);
const rateColor = (p: number) => (p >= 80 ? C.green : p >= 50 ? C.amber : C.red);

function senderLabel(n: NotificationRow): string {
  return n.merchant ? n.merchant.nom : 'Admin JitPlus';
}

export default function Notifications() {
  const navigate = useNavigate();
  const { filters, page, update, reset, active } = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useDebouncedInput(filters.search, (v) => update({ search: v }));
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [pagination, setPagination] = useState<PaginationT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [series, setSeries] = useState<Set<string>>(new Set(['recipients', 'success']));

  const days = (Number(filters.days) || 30) as InsightPeriod;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getNotifications(toParams(filters, page));
      setRows(res.notifications);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
    // `days` only drives the stats block, so changing it must not refetch the list
  }, [filters.search, filters.channel, filters.sender, filters.merchantId, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    setStatsError('');
    getNotificationStats(days)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setStatsError(getErrorMessage(e)); });
    return () => { cancelled = true; };
  }, [days]);

  const chart = useMemo(() => {
    if (!stats) return null;
    return {
      labels: stats.daily.map((d) => fmtDateShort(d.date)),
      series: SERIES.filter((s) => series.has(s.key)).map((s) => ({ ...s, values: stats.daily.map((d) => d[s.key]) })),
    };
  }, [stats, series]);

  const merchantName = filters.merchantId
    ? rows.find((r) => r.merchant?.id === filters.merchantId)?.merchant?.nom
      ?? stats?.topSenders.find((s) => s.id === filters.merchantId)?.nom
      ?? 'ce commerçant'
    : null;

  const exportAll = async (progress: (n: number) => void) => {
    const all = await fetchAllPages(async (p, limit) => {
      const r = await getNotifications(toParams(filters, p, limit));
      return { rows: r.notifications, totalPages: r.pagination.totalPages };
    }, progress);
    exportCsv('notifications', all, [
      { header: 'Date', value: (n) => n.createdAt.replace('T', ' ').slice(0, 16) },
      { header: 'Expéditeur', value: senderLabel },
      { header: 'Email expéditeur', value: (n) => n.merchant?.email },
      { header: 'Canal', value: (n) => (n.channel ? CHANNEL_LABELS[n.channel] ?? n.channel : '') },
      { header: 'Audience', value: (n) => (n.audience ? AUDIENCE_LABELS[n.audience] ?? n.audience : '') },
      { header: 'Titre', value: (n) => n.title },
      { header: 'Message', value: (n) => n.body },
      { header: 'Destinataires', value: (n) => n.recipientCount },
      { header: 'Succès', value: (n) => n.successCount },
      { header: 'Échecs', value: (n) => n.failureCount },
      { header: 'Taux de succès (%)', value: successRate },
      { header: 'Reçues dans l\'app', value: (n) => n.inboxDelivered },
      { header: 'Lues', value: (n) => n.inboxRead },
      { header: 'Taux de lecture (%)', value: (n) => (n.inboxDelivered ? readRate(n) : '') },
    ]);
  };

  const columns: Column<NotificationRow>[] = [
    {
      header: 'Expéditeur',
      render: (n) => n.merchant ? (
        <div>
          <span
            onClick={(e) => { e.stopPropagation(); navigate(`/merchants/${n.merchant!.id}`); }}
            style={{ fontWeight: 600, color: C.text, cursor: 'pointer' }}
          >
            {n.merchant.nom}
          </span>
          <div style={{ fontSize: 11, color: C.textMuted }}>{n.merchant.email}</div>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, color: C.primary }}>Admin JitPlus</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{n.audience ? AUDIENCE_LABELS[n.audience] ?? n.audience : 'Broadcast'}</div>
        </div>
      ),
    },
    {
      header: 'Canal',
      render: (n) => <span style={S.badge(CHANNEL_COLOR[n.channel ?? ''] ?? C.textMuted)}>{n.channel ? CHANNEL_LABELS[n.channel] ?? n.channel : 'N/A'}</span>,
    },
    {
      header: 'Message',
      render: (n) => (
        <div title={n.body} style={{ maxWidth: 340 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>
          <div style={{ fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
        </div>
      ),
    },
    { header: 'Destinataires', align: 'right', render: (n) => <b>{fmtNumber(n.recipientCount)}</b> },
    {
      header: 'Succès',
      render: (n) => n.recipientCount > 0
        ? <Progress value={n.successCount} max={n.recipientCount} color={rateColor(successRate(n))} label={`${successRate(n)}%${n.failureCount ? ` · ${fmtNumber(n.failureCount)} échec(s)` : ''}`} />
        : <Dash />,
    },
    {
      header: 'Lues',
      render: (n) => n.inboxDelivered > 0
        ? <span title={`${fmtNumber(n.inboxRead)} lues sur ${fmtNumber(n.inboxDelivered)} reçues dans l'app`}><Progress value={n.inboxRead} max={n.inboxDelivered} color={C.cyan} label={`${readRate(n)}%`} /></span>
        : <Dash />,
    },
    { header: 'Date', render: (n) => <span title={fmtDateTime(n.createdAt)} style={{ whiteSpace: 'nowrap', color: C.textMuted }}>{fmtRelative(n.createdAt)}</span> },
  ];

  const t = stats?.totals;

  return (
    <div style={{ paddingBottom: 48 }}>
      <PageHeader
        title="Notifications"
        count={pagination?.total}
        subtitle="Campagnes envoyées par les commerçants et par l'équipe JitPlus : volume, délivrabilité et lecture."
        right={
          <>
            <PillGroup label="Période" options={PERIODS} value={filters.days} onChange={(v) => update({ days: v, page })} />
            <ExportButton onExport={exportAll} />
          </>
        }
      />

      {statsError && <p style={{ color: C.red, fontSize: 13 }}>Statistiques indisponibles : {statsError}</p>}

      {t && stats && (
        <>
          <Grid min={170} style={{ marginBottom: 16 }}>
            <StatCard label="Campagnes" value={fmtNumber(t.campaigns)} delta={deltaPct(t.campaigns, t.campaignsPrev)} sub={`dont ${fmtNumber(t.adminCampaigns)} par l'admin`} color={C.primary} />
            <StatCard label="Destinataires" value={fmtNumber(t.recipients)} delta={deltaPct(t.recipients, t.recipientsPrev)} sub="messages envoyés" color={C.cyan} />
            <StatCard label="Taux de succès" value={t.recipients ? `${t.successRate}%` : '—'} sub={`${fmtNumber(t.success)} délivrés`} color={t.recipients ? rateColor(t.successRate) : C.textMuted} hint="Envois acceptés par le service (Expo, WhatsApp, email)" />
            <StatCard label="Taux de lecture" value={t.inboxDelivered ? `${t.readRate}%` : '—'} sub={`${fmtNumber(t.inboxRead)} / ${fmtNumber(t.inboxDelivered)} ouvertes`} color={C.blue} hint="Notifications de la boîte de réception JitPlus ouvertes par le client" />
            <StatCard label="Commerçants expéditeurs" value={fmtNumber(t.senders)} color={C.green} />
            <StatCard label="Blocages" value={fmtNumber(t.blocks)} sub="clients ayant bloqué un commerçant" color={t.blocks ? C.amber : C.textMuted} />
          </Grid>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, marginBottom: 16, alignItems: 'start' }}>
            <Card
              title={`Envois par jour (${days} j)`}
              right={<Legend items={[...SERIES]} active={series} onToggle={(k) => setSeries((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />}
            >
              {chart && chart.series.length > 0 && t.campaigns > 0 ? <LineChart labels={chart.labels} series={chart.series} /> : <Empty />}
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card title="Par canal">
                {stats.channels.length === 0 ? <Empty /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {stats.channels.map((c) => (
                      <div key={c.channel} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: CHANNEL_COLOR[c.channel] ?? C.text }}>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                          <Muted>{fmtNumber(c.campaigns)} campagne(s) · {fmtNumber(c.recipients)} dest.</Muted>
                        </div>
                        <Progress value={c.success} max={c.recipients} color={rateColor(c.successRate)} label={`${c.successRate}% succès`} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Par audience">
                {stats.audiences.length === 0 ? <Empty /> : (
                  <ShareList
                    total={stats.audiences.reduce((s, a) => s + a.recipients, 0)}
                    items={stats.audiences.map((a) => ({ label: AUDIENCE_LABELS[a.audience] ?? a.audience, value: a.recipients, hint: `${a.campaigns} campagne(s)` }))}
                  />
                )}
              </Card>
            </div>
          </div>

          <Card title="Commerçants les plus actifs" style={{ marginBottom: 16 }}>
            <DataTable
              rows={stats.topSenders}
              rowKey={(r) => r.id}
              onRowClick={(r) => update({ merchantId: r.id, sender: '' })}
              columns={[
                { header: 'Commerçant', render: (r) => <b>{r.nom}</b> },
                { header: 'Campagnes', align: 'right', render: (r) => fmtNumber(r.campaigns) },
                { header: 'Destinataires', align: 'right', render: (r) => fmtNumber(r.recipients) },
                { header: 'Succès', render: (r) => <Progress value={r.successRate} max={100} color={rateColor(r.successRate)} label={`${r.successRate}%`} /> },
                { header: 'Lecture', render: (r) => <Progress value={r.readRate} max={100} color={C.cyan} label={`${r.readRate}%`} /> },
                { header: 'Blocages', align: 'right', render: (r) => (r.blocks ? <span style={{ color: C.amber, fontWeight: 600 }}>{r.blocks}</span> : <Dash />) },
                { header: 'Dernier envoi', render: (r) => <Muted>{fmtRelative(r.lastAt)}</Muted> },
              ]}
            />
          </Card>
        </>
      )}

      <FilterBar>
        <PillGroup label="Expéditeur" options={SENDERS} value={filters.sender} onChange={(v) => update({ sender: v, merchantId: '' })} />
        <Divider />
        <PillGroup label="Canal" options={CHANNELS} value={filters.channel} onChange={(v) => update({ channel: v })} />
        {merchantName && (
          <>
            <Divider />
            <span style={{ ...pillStyle(true), display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'default' }}>
              {merchantName}
              <button
                onClick={() => update({ merchantId: '' })}
                title="Retirer ce filtre"
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {active && (
            <button onClick={reset} style={{ ...pillStyle(false), color: C.red, borderColor: C.red }}>Réinitialiser</button>
          )}
          <SearchInput value={search} onChange={setSearch} placeholder="Titre, message ou commerçant…" width={260} />
        </div>
      </FilterBar>

      <div style={S.card}>
        {loading ? (
          <p style={{ color: C.textMuted, margin: 0 }}>Chargement…</p>
        ) : error ? (
          <p style={{ color: C.red, margin: 0 }}>{error}</p>
        ) : rows.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 32, color: C.textMuted, margin: 0 }}>Aucune notification ne correspond à ces filtres.</p>
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(n) => n.id} />
        )}
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={(p) => update({ page: p })} />
        )}
      </div>
    </div>
  );
}
