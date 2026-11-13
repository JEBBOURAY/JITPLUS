import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getFollowUps, getInsights, getRevenue, getWorklist } from '../api';
import type { AdminInsights, FollowUpsResponse, InsightPeriod, MerchantBrief, RevenueReport, Worklist } from '../types';
import { BarChart, Card, DataTable, Empty, Funnel, KpiStrip, Legend, LineChart, type Column } from '../components/charts';
import { DeltaBadge } from '../components/StatCard';
import { ContactButtons, FollowUpBadge, MerchantCell, PlanKindBadge, QuickNoteModal } from '../components/crm';
import { Dash, LastActivity, Muted, useToast } from '../components/ui';
import { useAlertsContext } from '../utils/alerts';
import { C, S } from '../theme';
import { CATEGORY_LABELS, daysSince, deltaPct, fmtDate, fmtMAD, fmtNumber, fmtRelative, fmtTime, sharePct } from '../utils/format';
import { FOLLOW_UP_ORDER, PAYMENT_METHOD, WA_TEMPLATES, daysUntil, fmtDue, fmtMonth } from '../utils/crm';

const PERIODS: { value: InsightPeriod; label: string }[] = [
  { value: 7, label: '7 j' },
  { value: 30, label: '30 j' },
  { value: 90, label: '90 j' },
];

type QueueKey = 'followUpsDue' | 'trialsEnding' | 'renewals' | 'stuckNew' | 'dormantPremium' | 'payouts' | 'reportedDeals';

const QUEUES: { key: QueueKey; label: string; hint: string }[] = [
  { key: 'followUpsDue', label: 'Relances du jour', hint: 'Relances planifiées pour aujourd\'hui ou en retard' },
  { key: 'trialsEnding', label: 'Essais J-7', hint: 'Essais Premium qui se terminent dans 7 jours : proposer l\'abonnement' },
  { key: 'renewals', label: 'Renouvellements', hint: 'Abonnements Premium qui finissent dans 14 jours' },
  { key: 'stuckNew', label: 'Démarrage bloqué', hint: 'Inscrits depuis 3 à 30 jours, aucun scan' },
  { key: 'dormantPremium', label: 'Premium inactifs', hint: 'Premium (payé ou offert) sans scan depuis 21 jours : risque de départ' },
  { key: 'payouts', label: 'Retraits', hint: 'Demandes de paiement de parrainage en attente' },
  { key: 'reportedDeals', label: 'Bons plans signalés', hint: 'Bons plans en ligne avec au moins un signalement' },
];

function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const alerts = useAlertsContext();
  const [toastNode, showToast] = useToast();
  const [days, setDays] = useState<InsightPeriod>(() => {
    const v = Number(sessionStorage.getItem('overview_days'));
    return v === 7 || v === 90 ? v : 30;
  });
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [work, setWork] = useState<Worklist | null>(null);
  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [pipeline, setPipeline] = useState<FollowUpsResponse['counts'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueueKey | null>(null);
  const [noteFor, setNoteFor] = useState<MerchantBrief | null>(null);
  const [series, setSeries] = useState<Set<string>>(new Set(['transactions', 'activeClients']));

  const loadWork = useCallback(async () => {
    const [w, f] = await Promise.allSettled([getWorklist(), getFollowUps({ limit: 1 })]);
    if (w.status === 'fulfilled') setWork(w.value);
    if (f.status === 'fulfilled') setPipeline(f.value.counts);
  }, []);

  const load = useCallback(async (period: InsightPeriod) => {
    setLoading(true);
    setError('');
    try {
      const [ins, rev] = await Promise.allSettled([getInsights(period), getRevenue(12), loadWork()]);
      if (ins.status === 'fulfilled') setInsights(ins.value); else setError(getErrorMessage(ins.reason));
      if (rev.status === 'fulfilled') setRevenue(rev.value);
    } finally {
      setLoading(false);
    }
  }, [loadWork]);

  useEffect(() => {
    sessionStorage.setItem('overview_days', String(days));
    load(days);
  }, [days, load]);

  const counts = useMemo(() => {
    const out = {} as Record<QueueKey, number>;
    for (const q of QUEUES) out[q.key] = work ? (work[q.key] as unknown[]).length : 0;
    return out;
  }, [work]);

  // Open the first queue that has something in it
  const activeQueue: QueueKey = queue ?? QUEUES.find((q) => counts[q.key] > 0)?.key ?? 'followUpsDue';
  const totalTodo = Object.values(counts).reduce((a, b) => a + b, 0);

  const d = insights;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const actions = (m: MerchantBrief, waText: string) => (
    <ContactButtons phone={m.phone} email={m.email} waText={waText} onNote={() => setNoteFor(m)} />
  );

  const merchantColumns: Record<'followUpsDue' | 'trialsEnding' | 'renewals' | 'stuckNew' | 'dormantPremium', Column<MerchantBrief>[]> = {
    followUpsDue: [
      { header: 'Commerce', render: (m) => <MerchantCell m={m} /> },
      { header: 'Échéance', render: (m) => { const due = fmtDue(m.followUp?.nextActionAt); return <span style={{ color: due.color, whiteSpace: 'nowrap' }}>{due.text}</span>; } },
      { header: 'Action prévue', render: (m) => m.followUp?.nextAction ? <span style={{ fontSize: 12.5 }}>{m.followUp.nextAction}</span> : <Dash /> },
      { header: 'Statut', render: (m) => <FollowUpBadge status={m.followUp?.status} /> },
      { header: 'Plan', render: (m) => <PlanKindBadge kind={m.planKind} expiresAt={m.planExpiresAt} /> },
      { header: '', align: 'right', render: (m) => actions(m, WA_TEMPLATES.generic(m.nom)) },
    ],
    trialsEnding: [
      { header: 'Commerce', render: (m) => <MerchantCell m={m} /> },
      { header: 'Fin d\'essai', render: (m) => { const left = m.planExpiresAt ? daysUntil(m.planExpiresAt) : 0; return <span className="num" style={{ color: left <= 2 ? C.red : C.amber }}>J-{left}</span>; } },
      { header: 'Clients', align: 'right', render: (m) => fmtNumber(m.clients) },
      { header: 'Trans. 30 j', align: 'right', render: (m) => fmtNumber(m.transactions30d) },
      { header: 'Suivi', render: (m) => <FollowUpBadge status={m.followUp?.status} /> },
      { header: '', align: 'right', render: (m) => actions(m, WA_TEMPLATES.trial(m.nom, Math.max(1, m.planExpiresAt ? daysUntil(m.planExpiresAt) : 1))) },
    ],
    renewals: [
      { header: 'Commerce', render: (m) => <MerchantCell m={m} /> },
      { header: 'Échéance', render: (m) => <PlanKindBadge kind={m.planKind} expiresAt={m.planExpiresAt} /> },
      { header: 'Clients', align: 'right', render: (m) => fmtNumber(m.clients) },
      { header: 'Trans. 30 j', align: 'right', render: (m) => fmtNumber(m.transactions30d) },
      { header: 'Suivi', render: (m) => <FollowUpBadge status={m.followUp?.status} /> },
      { header: '', align: 'right', render: (m) => actions(m, WA_TEMPLATES.renewal(m.nom, Math.max(1, m.planExpiresAt ? daysUntil(m.planExpiresAt) : 1))) },
    ],
    stuckNew: [
      { header: 'Commerce', render: (m) => <MerchantCell m={m} /> },
      { header: 'Inscrit', render: (m) => <span style={{ whiteSpace: 'nowrap' }}>il y a {daysSince(m.createdAt)} j</span> },
      { header: 'Bloque à', render: (m) => <span style={{ fontSize: 12.5 }}>{!m.onboarded ? 'Onboarding non terminé' : !m.hasReward ? 'Pas de récompense' : 'Aucun scan'}</span> },
      { header: 'Plan', render: (m) => <PlanKindBadge kind={m.planKind} expiresAt={m.planExpiresAt} /> },
      { header: 'Suivi', render: (m) => <FollowUpBadge status={m.followUp?.status} /> },
      { header: '', align: 'right', render: (m) => actions(m, WA_TEMPLATES.stuck(m.nom)) },
    ],
    dormantPremium: [
      { header: 'Commerce', render: (m) => <MerchantCell m={m} /> },
      { header: 'Dernier scan', render: (m) => <LastActivity date={m.lastActivityAt} /> },
      { header: 'Plan', render: (m) => <PlanKindBadge kind={m.planKind} expiresAt={m.planExpiresAt} /> },
      { header: 'Clients', align: 'right', render: (m) => fmtNumber(m.clients) },
      { header: 'Suivi', render: (m) => <FollowUpBadge status={m.followUp?.status} /> },
      { header: '', align: 'right', render: (m) => actions(m, WA_TEMPLATES.dormant(m.nom)) },
    ],
  };

  const renderQueue = () => {
    if (!work) return <Empty>{loading ? 'Chargement…' : 'Liste indisponible'}</Empty>;
    const q = QUEUES.find((x) => x.key === activeQueue)!;
    if (counts[activeQueue] === 0) return <Empty>Rien dans « {q.label} ».</Empty>;
    if (activeQueue === 'payouts') {
      return (
        <DataTable
          rows={work.payouts}
          rowKey={(r) => r.id}
          onRowClick={() => navigate('/referrals?tab=payout&status=PENDING')}
          columns={[
            { header: 'Client', render: (r) => <div><Link to={`/clients/${r.client.id}`} onClick={(e) => e.stopPropagation()} style={{ color: C.text, fontWeight: 500, textDecoration: 'none' }}>{r.client.name ?? 'Sans nom'}</Link><div style={{ fontSize: 12, color: C.textMuted }}>{r.client.telephone ?? ''}</div></div> },
            { header: 'Montant', align: 'right', render: (r) => fmtMAD(r.amount) },
            { header: 'Moyen', render: (r) => <Muted>{r.method === 'BANK_TRANSFER' ? 'Virement' : r.method === 'CASH' ? 'Espèces' : r.method}</Muted> },
            { header: 'Demandé', render: (r) => <span style={{ color: daysSince(r.createdAt) >= 3 ? C.red : C.text }}>{fmtRelative(r.createdAt)}</span> },
            { header: '', align: 'right', render: () => <span style={{ color: C.primary, fontSize: 12.5 }}>Traiter →</span> },
          ]}
        />
      );
    }
    if (activeQueue === 'reportedDeals') {
      return (
        <DataTable
          rows={work.reportedDeals}
          rowKey={(r) => r.id}
          onRowClick={() => navigate('/deals?filter=reported')}
          columns={[
            { header: 'Bon plan', render: (r) => <b style={{ fontWeight: 500 }}>{r.title}</b> },
            { header: 'Commerce', render: (r) => <Link to={`/merchants/${r.merchant.id}`} onClick={(e) => e.stopPropagation()} style={{ color: C.text }}>{r.merchant.nom}</Link> },
            { header: 'Signalements', align: 'right', render: (r) => <span style={{ color: r.reportCount >= 3 ? C.red : C.amber }}>{r.reportCount}</span> },
            { header: 'Fin', render: (r) => <Muted>{fmtDate(r.endsAt)}</Muted> },
            { header: '', align: 'right', render: () => <span style={{ color: C.primary, fontSize: 12.5 }}>Modérer →</span> },
          ]}
        />
      );
    }
    return (
      <DataTable
        rows={work[activeQueue]}
        rowKey={(m) => m.id}
        onRowClick={(m) => navigate(`/merchants/${m.id}`)}
        columns={merchantColumns[activeQueue]}
      />
    );
  };

  const t = d?.transactions;
  const seriesDefs = [
    { key: 'transactions', label: 'Transactions', color: C.chart[0] },
    { key: 'activeClients', label: 'Clients actifs', color: C.chart[1] },
    { key: 'clients', label: 'Nouveaux clients', color: C.chart[2] },
    { key: 'merchants', label: 'Nouveaux commerçants', color: C.chart[3] },
  ] as const;
  const chartSeries = d
    ? seriesDefs.filter((s) => series.has(s.key)).map((s) => ({ key: s.key, label: s.label, color: s.color, values: d.daily.map((p) => p[s.key]) }))
    : [];
  const last6 = revenue?.monthly.slice(-6) ?? [];

  return (
    <div style={{ paddingBottom: 48 }}>
      {toastNode}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 600, fontSize: 19 }}>Tableau de bord</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.textMuted }}>
            <span style={{ textTransform: 'capitalize' }}>{today}</span>
            {d && <> · données de {fmtTime(d.generatedAt)}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {PERIODS.map((p, i) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                style={{ padding: '5px 12px', fontSize: 12.5, fontFamily: 'inherit', border: 'none', borderLeft: i ? `1px solid ${C.border}` : 'none', background: days === p.value ? C.ink : C.surface, color: days === p.value ? C.onInk : C.text, cursor: 'pointer' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(days)} disabled={loading} style={S.btnOutline()}>{loading ? 'Chargement…' : 'Actualiser'}</button>
        </div>
      </div>

      {error && <div style={{ ...S.card, borderColor: C.red, color: C.red, marginBottom: 16, whiteSpace: 'pre-line' }}>{error}</div>}

      {/* Last 24 h, one line */}
      {alerts && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: C.textMuted, marginBottom: 12 }}>
          <span style={{ color: C.text, fontWeight: 500 }}>Dernières 24 h</span>
          <span><b className="num" style={{ color: C.text, fontWeight: 500 }}>{fmtNumber(alerts.newMerchants24h)}</b> nouveaux commerçants</span>
          <span><b className="num" style={{ color: C.text, fontWeight: 500 }}>{fmtNumber(alerts.newClients24h)}</b> nouveaux clients</span>
          <span><b className="num" style={{ color: C.text, fontWeight: 500 }}>{fmtNumber(alerts.transactions24h)}</b> transactions{alerts.cancelled24h > 0 && <> (<span style={{ color: sharePct(alerts.cancelled24h, alerts.transactions24h) >= 10 ? C.red : C.textMuted }}>{fmtNumber(alerts.cancelled24h)} annulées</span>)</>}</span>
          <span>
            <b className="num" style={{ color: C.text, fontWeight: 500 }}>{fmtNumber(alerts.notifRecipients24h)}</b> notifications
            {alerts.notifSuccessRate24h !== null && <>, <span style={{ color: alerts.notifSuccessRate24h < 80 ? C.red : C.textMuted }}>{alerts.notifSuccessRate24h} % livrées</span></>}
          </span>
        </div>
      )}

      {/* KPIs */}
      {d && t && (
        <div style={{ marginBottom: 16 }}>
          <KpiStrip
            items={[
              {
                label: `Commerçants actifs · ${days} j`,
                value: fmtNumber(d.merchants.activePeriod),
                sub: <>{sharePct(d.merchants.activePeriod, d.merchants.activeAccounts)} % des {fmtNumber(d.merchants.activeAccounts)} comptes</>,
                hint: 'Au moins une transaction sur la période',
                onClick: () => navigate('/merchants?activity=active30'),
              },
              {
                label: 'Premium payants',
                value: fmtNumber(revenue?.premium.paid ?? d.merchants.plans.paid),
                sub: revenue ? <>{fmtNumber(revenue.premium.offered)} offerts{revenue.premium.unknown ? <> · <span style={{ color: C.amber }}>{revenue.premium.unknown} non renseignés</span></> : null}</> : undefined,
                onClick: () => navigate('/revenue'),
              },
              {
                label: 'Essais en cours',
                value: fmtNumber(d.merchants.plans.trialActive),
                sub: <>{fmtNumber(d.merchants.plans.trialEnding7d)} finissent sous 7 j · conv. {d.merchants.plans.trialConversionRate} %</>,
                onClick: () => setQueue('trialsEnding'),
              },
              {
                label: 'Encaissé ce mois',
                value: revenue ? fmtMAD(revenue.totals.thisMonth) : '—',
                sub: revenue ? <>mois dernier {fmtMAD(revenue.totals.lastMonth)}</> : 'paiements enregistrés',
                onClick: () => navigate('/revenue'),
              },
              {
                label: `Clients actifs · ${days} j`,
                value: fmtNumber(d.clients.activePeriod),
                sub: <>rétention {d.clients.retentionRate} % · {fmtNumber(d.activity.dau)} / jour</>,
                hint: 'Clients distincts avec au moins une transaction',
              },
              {
                label: `Transactions · ${days} j`,
                value: <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>{fmtNumber(t.total)}{t.totalPrev > 0 && <DeltaBadge delta={deltaPct(t.total, t.totalPrev)} />}</span>,
                sub: <>{fmtNumber(t.redeem)} récompenses · {t.cancelRate} % annulées</>,
              },
            ]}
          />
        </div>
      )}

      {/* Worklist + side panels */}
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start', marginBottom: 16 }}>
        <div style={{ ...S.card, padding: 0, minWidth: 0 }}>
          <div style={{ padding: '14px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>À traiter <span className="num" style={{ color: C.textMuted, fontWeight: 400 }}>{totalTodo}</span></h2>
            <Link to="/follow-ups" style={{ fontSize: 12.5, color: C.primary, textDecoration: 'none' }}>Tout le suivi →</Link>
          </div>
          <div style={{ display: 'flex', gap: 2, padding: '8px 12px 0', borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
            {QUEUES.map((q) => {
              const on = q.key === activeQueue;
              const n = counts[q.key];
              return (
                <button
                  key={q.key}
                  className="tab-btn"
                  title={q.hint}
                  onClick={() => setQueue(q.key)}
                  style={{ padding: '8px 8px', fontSize: 12.5, fontFamily: 'inherit', background: 'none', border: 'none', borderBottom: `2px solid ${on ? C.ink : 'transparent'}`, color: on ? C.text : C.textMuted, fontWeight: on ? 500 : 400, cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -1 }}
                >
                  {q.label} <span className="num" style={{ color: n ? (q.key === 'payouts' || q.key === 'followUpsDue' ? C.red : C.text) : C.textMuted }}>{n}{n >= 25 ? '+' : ''}</span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: '4px 6px 8px' }}>{renderQueue()}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Encaissements" right={<Link to="/revenue" style={{ fontSize: 12.5, color: C.primary, textDecoration: 'none' }}>Détail →</Link>}>
            {!revenue ? <Empty>…</Empty> : (
              <>
                <BarChart labels={last6.map((m) => fmtMonth(m.month, false))} values={last6.map((m) => m.amount)} format={(n) => fmtNumber(Math.round(n))} height={120} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, fontSize: 12.5 }}>
                  <span style={{ color: C.textMuted }}>12 derniers mois</span><span className="num" style={{ textAlign: 'right' }}>{fmtMAD(revenue.totals.window)}</span>
                  <span style={{ color: C.textMuted }}>Renouvellements sous 30 j</span><span className="num" style={{ textAlign: 'right' }}>{revenue.premium.renewals30d}</span>
                  {revenue.recentPayments[0] && <>
                    <span style={{ color: C.textMuted }}>Dernier paiement</span>
                    <span style={{ textAlign: 'right' }}>{fmtMAD(revenue.recentPayments[0].amount)} · {PAYMENT_METHOD[revenue.recentPayments[0].method]} · {fmtRelative(revenue.recentPayments[0].paidAt).toLowerCase()}</span>
                  </>}
                </div>
              </>
            )}
          </Card>

          <Card title="Suivi commercial" right={<Link to="/follow-ups" style={{ fontSize: 12.5, color: C.primary, textDecoration: 'none' }}>Ouvrir →</Link>}>
            {!pipeline ? <Empty>…</Empty> : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pipeline.overdue > 0 && (
                  <Link to="/follow-ups?due=overdue" className="row-link" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', color: C.red, textDecoration: 'none', fontSize: 12.5 }}>
                    <span>Relances en retard</span><span className="num">{pipeline.overdue}</span>
                  </Link>
                )}
                {FOLLOW_UP_ORDER.map((s) => (
                  <Link key={s} to={`/follow-ups?status=${s}`} className="row-link" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', color: C.text, textDecoration: 'none', fontSize: 12.5, borderTop: `1px solid ${C.borderLight}` }}>
                    <FollowUpBadge status={s} />
                    <span className="num" style={{ color: pipeline.byStatus[s] ? C.text : C.textMuted }}>{pipeline.byStatus[s]}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Activity */}
      {d && (
        <>
          <Card
            title={`Activité quotidienne · ${days} jours`}
            right={<Legend items={[...seriesDefs]} active={series} onToggle={(k) => setSeries((p) => { const n = new Set(p); if (n.has(k)) { if (n.size > 1) n.delete(k); } else n.add(k); return n; })} />}
            style={{ marginBottom: 16 }}
          >
            <LineChart labels={d.daily.map((p) => shortDay(p.date))} series={chartSeries} />
          </Card>

          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16, marginBottom: 16 }}>
            <Card title="Activation des commerçants">
              <Funnel
                color={C.chart[0]}
                steps={[
                  { label: 'Inscrits', value: d.merchants.funnel.registered },
                  { label: 'Récompense configurée', value: d.merchants.funnel.withReward },
                  { label: '1re transaction', value: d.merchants.funnel.firstTransaction },
                  { label: '10 clients ou plus', value: d.merchants.funnel.tenClients },
                  { label: 'Abonnement Premium', value: d.merchants.funnel.paid },
                ]}
              />
            </Card>
            <Card title={`Commerçants les plus actifs · ${days} j`} right={<Link to="/analytics?tab=merchants" style={{ fontSize: 12.5, color: C.primary, textDecoration: 'none' }}>Analyses →</Link>}>
              <DataTable
                rows={d.topMerchants.slice(0, 8)}
                rowKey={(r) => r.id}
                onRowClick={(r) => navigate(`/merchants/${r.id}`)}
                columns={[
                  { header: 'Commerce', render: (r) => <div><span style={{ fontWeight: 500 }}>{r.nom}</span><div style={{ fontSize: 12, color: C.textMuted }}>{[CATEGORY_LABELS[r.category] ?? r.category, r.ville].filter(Boolean).join(' · ')}</div></div> },
                  { header: 'Plan', render: (r) => <PlanKindBadge kind={r.plan !== 'PREMIUM' ? 'FREE' : r.paid ? 'ADMIN' : 'TRIAL'} /> },
                  { header: 'Trans.', align: 'right', render: (r) => fmtNumber(r.transactions) },
                  { header: 'Clients', align: 'right', render: (r) => fmtNumber(r.clients) },
                  { header: 'Récomp.', align: 'right', render: (r) => fmtNumber(r.redeems) },
                ]}
              />
            </Card>
          </div>
        </>
      )}

      <QuickNoteModal
        open={!!noteFor}
        merchant={noteFor}
        currentStatus={noteFor?.followUp?.status}
        onClose={() => setNoteFor(null)}
        onSaved={() => { showToast('Suivi enregistré'); loadWork(); }}
      />
    </div>
  );
}
