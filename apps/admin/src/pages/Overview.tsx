import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getInsights, getStats } from '../api';
import type { AdminInsights, AuditLogBrief, GlobalStats, InsightPeriod, MerchantRow } from '../types';
import StatCard from '../components/StatCard';
import PlanBadge from '../components/PlanBadge';
import AlertsPanel from '../components/AlertsPanel';
import { ExportButton } from '../components/ui';
import { exportCsv } from '../utils/csv';
import { useAlertsContext } from '../utils/alerts';
import {
  BarRow, Card, DataTable, Empty, Funnel, GroupLabel, Grid, Heatmap, Legend, LineChart, MiniStat, ShareList,
} from '../components/charts';
import { C, S } from '../theme';
import {
  ACTION_COLOR, ACTION_LABELS, CATEGORY_LABELS, deltaPct, fmtDate, fmtDateShort, fmtMAD, fmtNumber, fmtTime, sharePct,
} from '../utils/format';
import { buildRecommendations, type InsightLevel, type OverviewTab, type Recommendation } from '../utils/insights';

const PERIODS: { value: InsightPeriod; label: string }[] = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
];

const TABS: { key: OverviewTab; label: string }[] = [
  { key: 'summary', label: 'Synthèse' },
  { key: 'merchants', label: 'Commerçants (Pro)' },
  { key: 'clients', label: 'Clients (JitPlus)' },
  { key: 'games', label: 'Jeux & coupons' },
  { key: 'communication', label: 'Communication & ops' },
];

const LEVEL_STYLE: Record<InsightLevel, { color: string; label: string }> = {
  critical: { color: C.red, label: 'Urgent' },
  warning: { color: C.amber, label: 'À surveiller' },
  info: { color: C.blue, label: 'Opportunité' },
  success: { color: C.green, label: 'Bonne nouvelle' },
};

const COUPON_TYPE_LABELS: Record<string, string> = {
  PERCENT_DISCOUNT: 'Remise en %',
  FIXED_DISCOUNT: 'Remise fixe (MAD)',
  FREE_PRODUCT: 'Produit offert',
  BONUS_STAMPS: 'Tampons bonus',
};

const COUPON_SOURCE_LABELS: Record<string, string> = {
  SCRATCH_CARD: 'Cartes à gratter',
  LUCKY_WHEEL: 'Roue de la fortune',
  MANUAL: 'Manuel',
};

const LANGUAGE_LABELS: Record<string, string> = { fr: 'Français', ar: 'Arabe', en: 'Anglais', es: 'Espagnol' };

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  borderRadius: 'var(--radius-sm)',
  border: `1px solid ${active ? C.primary : C.border}`,
  background: active ? C.primary : C.surface,
  color: active ? '#fff' : C.textMuted,
  cursor: 'pointer',
});

function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function ActionBadge({ action }: { action: string }) {
  return <span style={S.badge(ACTION_COLOR[action] ?? C.textMuted)}>{ACTION_LABELS[action] ?? action}</span>;
}

// ── Recommendations panel ─────────────────────────────────────────────────────

function RecommendationsPanel({ items, onOpen }: { items: Recommendation[]; onOpen: (r: Recommendation) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 6);
  return (
    <Card
      title={`Actions recommandées (${items.length})`}
      right={items.length > 6 && (
        <button onClick={() => setExpanded((v) => !v)} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '5px 12px', fontSize: 12 }}>
          {expanded ? 'Réduire' : 'Tout afficher'}
        </button>
      )}
    >
      {items.length === 0 ? (
        <Empty>Rien d'urgent : tous les indicateurs sont dans le vert.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
          {visible.map((r) => {
            const st = LEVEL_STYLE[r.level];
            return (
              <div
                key={r.id}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${C.borderLight}`,
                  borderLeft: `3px solid ${st.color}`,
                  background: C.bg,
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...S.badge(st.color), padding: '1px 8px', fontSize: 10 }}>{st.label}</span>
                  {r.link && (
                    <button
                      onClick={() => onOpen(r)}
                      style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    >
                      {r.link.label} →
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.title}</span>
                <span style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.45 }}>{r.detail}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function SummaryTab({ d, stats, navigate }: { d: AdminInsights; stats: GlobalStats | null; navigate: (to: string) => void }) {
  const seriesDefs = [
    { key: 'transactions', label: 'Transactions', color: '#6C47FF' },
    { key: 'activeClients', label: 'Clients actifs', color: '#0EA5E9' },
    { key: 'clients', label: 'Nouveaux clients', color: '#12B76A' },
    { key: 'merchants', label: 'Nouveaux commerçants', color: '#F79009' },
  ] as const;
  const [activeSeries, setActiveSeries] = useState<Set<string>>(new Set(['transactions', 'activeClients']));
  const toggle = (k: string) =>
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
      return next;
    });

  const labels = d.daily.map((p) => shortDay(p.date));
  const series = seriesDefs
    .filter((s) => activeSeries.has(s.key))
    .map((s) => ({ key: s.key, label: s.label, color: s.color, values: d.daily.map((p) => p[s.key]) }));

  const t = d.transactions;
  const txMix = [
    { label: 'Tampons gagnés', value: t.earn, color: C.green },
    { label: 'Récompenses échangées', value: t.redeem, color: C.amber },
    { label: 'Coupons utilisés', value: t.couponRedeem, color: C.cyan },
    { label: 'Gains roue de la fortune', value: t.luckyWheelWin, color: C.primary },
    { label: 'Ajustements manuels', value: t.adjust, color: C.blue },
  ];
  const txMixTotal = txMix.reduce((a, b) => a + b.value, 0);

  return (
    <>
      <GroupLabel>Croissance sur la période (vs période précédente)</GroupLabel>
      <Grid style={{ marginBottom: 24 }}>
        <StatCard label="Nouveaux commerçants" value={fmtNumber(d.merchants.newPeriod)} delta={deltaPct(d.merchants.newPeriod, d.merchants.newPrev)} sub={`${fmtNumber(d.merchants.total)} au total`} color={C.primary} onClick={() => navigate('/merchants')} />
        <StatCard label="Nouveaux clients" value={fmtNumber(d.clients.newPeriod)} delta={deltaPct(d.clients.newPeriod, d.clients.newPrev)} sub={`${fmtNumber(d.clients.registered)} inscrits`} color={C.green} onClick={() => navigate('/clients')} />
        <StatCard label="Transactions" value={fmtNumber(t.total)} delta={deltaPct(t.total, t.totalPrev)} sub={`${t.avgPerActiveMerchant} / commerçant actif`} color={C.amber} />
        <StatCard label="Tampons distribués" value={fmtNumber(t.stampsIssued)} delta={deltaPct(t.stampsIssued, t.stampsIssuedPrev)} sub={`${fmtNumber(t.stampsRedeemed)} dépensés`} color={C.cyan} />
        <StatCard label="Récompenses échangées" value={fmtNumber(t.redeem)} delta={deltaPct(t.redeem, t.redeemPrev)} sub={`${sharePct(t.redeem, t.earn)}% des passages`} color={C.primaryLight} />
        <StatCard label="Nouvelles cartes" value={fmtNumber(d.loyalty.newCards)} delta={deltaPct(d.loyalty.newCards, d.loyalty.newCardsPrev)} sub="cartes de fidélité créées" color={C.blue} />
        <StatCard label="CA suivi" value={fmtMAD(t.amountTracked)} delta={deltaPct(t.amountTracked, t.amountTrackedPrev)} sub="achats saisis (mode montant)" color={C.green} hint="Somme des montants saisis lors des passages en mode 'tampon par montant'" />
        <StatCard label="Vues de fiches" value={fmtNumber(d.engagement.profileViews)} delta={deltaPct(d.engagement.profileViews, d.engagement.profileViewsPrev)} sub="onglet Découvrir" color={C.primary} />
      </Grid>

      <GroupLabel>Usage réel (fenêtres glissantes)</GroupLabel>
      <Grid style={{ marginBottom: 24 }}>
        <StatCard label="Clients actifs / jour" value={fmtNumber(d.activity.dau)} sub={`${fmtNumber(d.activity.wau)} / 7 j · ${fmtNumber(d.activity.mau)} / 30 j`} color={C.cyan} hint="Clients distincts avec au moins une transaction" />
        <StatCard label="Stickiness" value={`${d.activity.stickiness}%`} sub="clients actifs jour / mois" color={d.activity.stickiness >= 20 ? C.green : C.amber} hint="DAU / MAU : plus c'est haut, plus l'usage est fréquent" />
        <StatCard label="Commerçants actifs" value={fmtNumber(d.activity.merchantWau)} sub={`/ 7 j · ${fmtNumber(d.activity.merchantMau)} / 30 j`} color={C.primary} />
        <StatCard label={`Rétention ${d.period.days} j`} value={`${d.clients.retentionRate}%`} sub={`${fmtNumber(d.clients.retained)} / ${fmtNumber(d.clients.activePrev)} clients revenus`} color={d.clients.retentionRate >= 40 ? C.green : C.amber} hint="Part des clients actifs la période précédente qui sont revenus sur la période" />
        <StatCard label="Visites / client actif" value={t.avgPerActiveClient} sub={`${fmtNumber(d.clients.returningPeriod)} clients venus 2 fois ou +`} color={C.green} />
        <StatCard label="Annulations" value={`${t.cancelRate}%`} sub={`${fmtNumber(t.cancelled)} transactions annulées`} color={t.cancelRate >= 5 ? C.red : C.textMuted} />
      </Grid>

      <Card
        title={`Activité quotidienne (${d.period.days} jours)`}
        right={<Legend items={[...seriesDefs]} active={activeSeries} onToggle={toggle} />}
        style={{ marginBottom: 16 }}
      >
        <LineChart labels={labels} series={series} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Heures de pointe (heure du Maroc)">
          <Heatmap matrix={d.heatmap} />
        </Card>
        <Card title="Répartition des transactions">
          {txMixTotal === 0 ? <Empty /> : <ShareList items={txMix} total={txMixTotal} />}
          {t.byTeam > 0 && (
            <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
              {sharePct(t.byTeam, t.total)}% des transactions sont faites par des membres d'équipe.
            </p>
          )}
        </Card>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <Card
            title="Dernières actions"
            right={<button onClick={() => navigate('/audit-logs')} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '5px 12px', fontSize: 12 }}>Historique</button>}
          >
            {stats.recentAuditLogs.length === 0 ? (
              <Empty>Aucune action</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.recentAuditLogs.map((log: AuditLogBrief) => (
                  <div key={log.id} style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: C.bg, border: `1px solid ${C.borderLight}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <ActionBadge action={log.action} />
                      {log.targetLabel && (
                        <p style={{ margin: '5px 0 0', fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.targetLabel}</p>
                      )}
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: C.textMuted, opacity: 0.7 }}>par {log.adminEmail ?? 'un commerçant'}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>{fmtDateShort(log.createdAt)}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: C.textMuted, opacity: 0.6 }}>{fmtTime(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card
            title="Derniers commerçants inscrits"
            right={<button onClick={() => navigate('/merchants')} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '5px 12px', fontSize: 12 }}>Voir tout</button>}
          >
            <DataTable<MerchantRow>
              rows={stats.recentMerchants}
              rowKey={(m) => m.id}
              onRowClick={(m) => navigate(`/merchants/${m.id}`)}
              columns={[
                { header: 'Nom', render: (m) => <b>{m.nom}</b> },
                { header: 'Plan', render: (m) => <PlanBadge plan={m.plan} isActive={m.isActive} /> },
                { header: 'Inscrit le', render: (m) => <span style={{ color: C.textMuted }}>{fmtDate(m.createdAt)}</span> },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}

function MerchantsTab({ d, navigate }: { d: AdminInsights; navigate: (to: string) => void }) {
  const m = d.merchants;
  const f = m.funnel;
  const total = m.total;
  const maxCat = Math.max(1, ...d.categories.map((c) => c.merchants));

  return (
    <>
      <GroupLabel>Santé de la base commerçants</GroupLabel>
      <Grid style={{ marginBottom: 24 }}>
        <StatCard label="Comptes actifs" value={fmtNumber(m.activeAccounts)} sub={`${fmtNumber(m.banned)} bannis`} color={C.primary} />
        <StatCard label={`Actifs sur ${d.period.days} j`} value={fmtNumber(m.activePeriod)} sub={`${sharePct(m.activePeriod, m.activeAccounts)}% des comptes`} color={C.green} hint="Au moins une transaction sur la période" />
        <StatCard label="Dormants" value={fmtNumber(m.dormant)} sub="aucune transaction depuis 30 j" color={C.amber} />
        <StatCard label="Jamais utilisé" value={fmtNumber(m.neverUsed)} sub="inscrits depuis +7 j, 0 scan" color={C.red} />
        <StatCard label="Payants" value={fmtNumber(m.plans.paid)} sub={`${sharePct(m.plans.paid, total)}% de la base`} color={C.cyan} />
        <StatCard label="En essai" value={fmtNumber(m.plans.trialActive)} sub={`${fmtNumber(m.plans.trialEnding7d)} expirent sous 7 j`} color={C.amber} />
        <StatCard label="Conversion essai" value={`${m.plans.trialConversionRate}%`} sub={`${fmtNumber(m.plans.trialsConverted)} / ${fmtNumber(m.plans.trialsFinished)} essais terminés`} color={C.green} />
        <StatCard label="Équipe & boutiques" value={fmtNumber(d.engagement.teamMembers)} sub={`membres · ${fmtNumber(d.engagement.stores)} boutiques`} color={C.blue} />
      </Grid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Entonnoir d'activation (JitPlus Pro)">
          <Funnel
            steps={[
              { label: 'Inscrits', value: f.registered },
              { label: 'Récompense configurée', value: f.withReward },
              { label: '+ 1re transaction', value: f.firstTransaction },
              { label: '+ 10 clients ou plus', value: f.tenClients },
              { label: '+ abonnement payant', value: f.paid },
            ]}
          />
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
            Onboarding de l'app Pro terminé : <b style={{ color: C.text }}>{fmtNumber(m.onboarded)}</b> ({sharePct(m.onboarded, total)}%) ·
            au moins une transaction : <b style={{ color: C.text }}>{fmtNumber(m.withTransaction)}</b>.
          </p>
        </Card>
        <Card title="Répartition des plans (effective)">
          <ShareList
            total={total}
            items={[
              { label: 'Premium payant', value: m.plans.paid, color: C.cyan },
              { label: 'Essai Premium en cours', value: m.plans.trialActive, color: C.amber },
              { label: 'Free (dont essais expirés)', value: m.plans.free, color: C.blue },
            ]}
          />
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MiniStat label="Essais finissant < 7 j" value={m.plans.trialEnding7d} color={m.plans.trialEnding7d ? C.amber : undefined} />
            <MiniStat label="Payants finissant < 7 j" value={m.plans.paidEnding7d} color={m.plans.paidEnding7d ? C.red : undefined} />
            <MiniStat label="Parrainés (commerçant)" value={m.acquisition.referredByMerchant} />
            <MiniStat label="Parrainés (client)" value={m.acquisition.referredByClient} />
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Adoption des fonctionnalités">
          <ShareList
            total={total}
            color={C.primary}
            items={[
              { label: 'Campagnes de notifications', value: m.features.notifications },
              { label: 'Mode tampon par montant', value: m.features.perAmountMode },
              { label: 'Équipe (membres)', value: m.features.team },
              { label: 'Multi-boutiques', value: m.features.multiStore },
              { label: 'Ajout rapide WhatsApp', value: m.features.quickAdd },
              { label: 'Cartes à gratter', value: m.features.scratchCards },
              { label: 'Roue de la fortune', value: m.features.luckyWheel },
              { label: 'Expiration des tampons', value: m.features.stampExpiry },
            ]}
          />
        </Card>
        <Card title="Complétude des fiches commerce">
          <ShareList
            total={total}
            color={C.green}
            items={[
              { label: 'Localisation (carte)', value: m.profile.location },
              { label: 'Description', value: m.profile.description },
              { label: 'Réseaux sociaux', value: m.profile.socialLinks },
              { label: 'Logo', value: m.profile.logo },
              { label: 'Photo de couverture', value: m.profile.cover },
              { label: 'Horaires d\'ouverture', value: m.profile.openingHours },
              { label: 'Push Pro activé', value: m.profile.pushEnabled },
            ]}
          />
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
            Récompense moyenne après <b style={{ color: C.text }}>{m.avgStampsForReward}</b> tampons.
          </p>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card
          title={`Essais qui expirent sous 7 jours (${d.trialsEnding.length})`}
          right={d.trialsEnding.length > 0 && <ExportButton small label="CSV" onExport={async () => exportCsv('essais-expirant', d.trialsEnding, [
            { header: 'Commerce', value: (r) => r.nom },
            { header: 'Email', value: (r) => r.email },
            { header: 'Téléphone', value: (r) => r.phone },
            { header: 'Expire le', value: (r) => r.expiresAt.slice(0, 10) },
            { header: 'Clients', value: (r) => r.clients },
            { header: 'Transactions', value: (r) => r.transactions },
          ])} />}
        >
          <DataTable
            rows={d.trialsEnding}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/merchants/${r.id}`)}
            columns={[
              { header: 'Commerce', render: (r) => <div><b>{r.nom}</b><div style={{ fontSize: 11, color: C.textMuted }}>{r.phone ?? r.email}</div></div> },
              { header: 'Expire', render: (r) => <span style={S.badge(daysUntil(r.expiresAt) <= 2 ? C.red : C.amber)}>J-{daysUntil(r.expiresAt)}</span> },
              { header: 'Clients', align: 'right', render: (r) => fmtNumber(r.clients) },
              { header: 'Trans.', align: 'right', render: (r) => fmtNumber(r.transactions) },
            ]}
          />
        </Card>
        <Card
          title={`Commerçants dormants à relancer (${d.dormantMerchants.length})`}
          right={d.dormantMerchants.length > 0 && <ExportButton small label="CSV" onExport={async () => exportCsv('commercants-dormants', d.dormantMerchants, [
            { header: 'Commerce', value: (r) => r.nom },
            { header: 'Email', value: (r) => r.email },
            { header: 'Téléphone', value: (r) => r.phone },
            { header: 'Plan', value: (r) => r.plan },
            { header: 'Dernière activité', value: (r) => r.lastActivityAt?.slice(0, 10) },
            { header: 'Jours d\'inactivité', value: (r) => daysSince(r.lastActivityAt) },
            { header: 'Clients', value: (r) => r.clients },
          ])} />}
        >
          <DataTable
            rows={d.dormantMerchants}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/merchants/${r.id}`)}
            columns={[
              { header: 'Commerce', render: (r) => <div><b>{r.nom}</b><div style={{ fontSize: 11, color: C.textMuted }}>{r.phone ?? r.email}</div></div> },
              { header: 'Inactif', render: (r) => <span style={{ color: C.textMuted }}>{daysSince(r.lastActivityAt)} j</span> },
              { header: 'Clients', align: 'right', render: (r) => fmtNumber(r.clients) },
              { header: 'Plan', render: (r) => <span style={S.badge(r.plan === 'PREMIUM' ? C.cyan : C.blue)}>{r.plan}</span> },
            ]}
          />
        </Card>
      </div>

      <Card
        title={`Top commerçants sur ${d.period.days} jours`}
        style={{ marginBottom: 16 }}
        right={d.topMerchants.length > 0 && <ExportButton small label="CSV" onExport={async () => exportCsv(`top-commercants-${d.period.days}j`, d.topMerchants, [
          { header: 'Rang', value: (r) => d.topMerchants.indexOf(r) + 1 },
          { header: 'Commerce', value: (r) => r.nom },
          { header: 'Catégorie', value: (r) => CATEGORY_LABELS[r.category] ?? r.category },
          { header: 'Ville', value: (r) => r.ville },
          { header: 'Plan', value: (r) => (r.plan === 'PREMIUM' ? (r.paid ? 'Payant' : 'Essai') : 'Free') },
          { header: 'Transactions', value: (r) => r.transactions },
          { header: 'Clients', value: (r) => r.clients },
          { header: 'Récompenses', value: (r) => r.redeems },
        ])} />}
      >
        <DataTable
          rows={d.topMerchants}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/merchants/${r.id}`)}
          columns={[
            { header: '#', render: (r) => <span style={{ color: C.textMuted }}>{d.topMerchants.indexOf(r) + 1}</span> },
            { header: 'Commerce', render: (r) => <b>{r.nom}</b> },
            { header: 'Catégorie', render: (r) => <span style={{ color: C.textMuted }}>{CATEGORY_LABELS[r.category] ?? r.category}</span> },
            { header: 'Ville', render: (r) => <span style={{ color: C.textMuted }}>{r.ville ?? '—'}</span> },
            { header: 'Plan', render: (r) => <span style={S.badge(r.plan === 'PREMIUM' ? C.cyan : C.blue)}>{r.plan === 'PREMIUM' ? (r.paid ? 'Payant' : 'Essai') : 'Free'}</span> },
            { header: 'Transactions', align: 'right', render: (r) => <b>{fmtNumber(r.transactions)}</b> },
            { header: 'Clients', align: 'right', render: (r) => fmtNumber(r.clients) },
            { header: 'Récompenses', align: 'right', render: (r) => fmtNumber(r.redeems) },
          ]}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        <Card
          title="Catégories : offre vs usage"
          right={d.categories.length > 0 && <ExportButton small label="CSV" onExport={async () => exportCsv('categories', d.categories, [
            { header: 'Catégorie', value: (r) => CATEGORY_LABELS[r.category] ?? r.category },
            { header: 'Commerces', value: (r) => r.merchants },
            { header: 'Actifs', value: (r) => r.active },
            { header: 'Cartes', value: (r) => r.cards },
            { header: 'Transactions', value: (r) => r.transactions },
          ])} />}
        >
          <DataTable
            rows={d.categories}
            rowKey={(r) => r.category}
            columns={[
              { header: 'Catégorie', render: (r) => CATEGORY_LABELS[r.category] ?? r.category },
              { header: 'Commerces', render: (r) => <div style={{ minWidth: 90 }}><BarRow label="" value={r.merchants} max={maxCat} suffix={fmtNumber(r.merchants)} /></div> },
              { header: 'Actifs', align: 'right', render: (r) => <span style={{ color: r.active ? C.green : C.textMuted }}>{r.active}</span> },
              { header: 'Cartes', align: 'right', render: (r) => fmtNumber(r.cards) },
              { header: 'Trans.', align: 'right', render: (r) => fmtNumber(r.transactions) },
            ]}
          />
        </Card>
        <Card
          title="Villes"
          right={d.cities.length > 0 && <ExportButton small label="CSV" onExport={async () => exportCsv('villes', d.cities, [
            { header: 'Ville', value: (r) => r.city },
            { header: 'Commerces', value: (r) => r.merchants },
            { header: 'Actifs', value: (r) => r.active },
            { header: 'Taux actif (%)', value: (r) => sharePct(r.active, r.merchants) },
            { header: 'Transactions', value: (r) => r.transactions },
          ])} />}
        >
          <DataTable
            rows={d.cities}
            rowKey={(r) => r.city}
            columns={[
              { header: 'Ville', render: (r) => r.city },
              { header: 'Commerces', align: 'right', render: (r) => fmtNumber(r.merchants) },
              { header: 'Actifs', align: 'right', render: (r) => <span style={{ color: r.active ? C.green : C.textMuted }}>{r.active}</span> },
              { header: 'Taux actif', align: 'right', render: (r) => `${sharePct(r.active, r.merchants)}%` },
              { header: 'Trans.', align: 'right', render: (r) => fmtNumber(r.transactions) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

function ClientsTab({ d }: { d: AdminInsights }) {
  const c = d.clients;
  const l = d.loyalty;
  const reg = c.registered;
  const cardHolders = c.cards.one + c.cards.twoToThree + c.cards.fourPlus;

  return (
    <>
      <GroupLabel>Base clients</GroupLabel>
      <Grid style={{ marginBottom: 24 }}>
        <StatCard label="Clients inscrits" value={fmtNumber(reg)} sub={`+${fmtNumber(c.newPeriod)} sur ${d.period.days} j`} delta={deltaPct(c.newPeriod, c.newPrev)} color={C.green} />
        <StatCard label="Clients anonymes" value={fmtNumber(c.anonymous)} sub="ajoutés en caisse (ajout rapide)" color={C.textMuted} />
        <StatCard label={`Actifs sur ${d.period.days} j`} value={fmtNumber(c.activePeriod)} sub={`${fmtNumber(c.returningPeriod)} venus 2 fois ou +`} color={C.cyan} />
        <StatCard label="Cartes / client" value={c.cards.average} sub={`${fmtNumber(c.cards.none)} inscrits sans carte`} color={C.primary} />
        <StatCard label="Cartes actives" value={fmtNumber(l.activeCards)} sub={`moyenne ${l.avgStamps} tampons`} color={C.blue} />
        <StatCard label="Récompenses prêtes" value={fmtNumber(l.rewardsReady)} sub="cartes au seuil, non échangées" color={C.amber} hint="Levier de réactivation : notifier ces clients" />
        <StatCard label="Cartes inactives" value={fmtNumber(l.inactiveCards)} sub="sans visite depuis 30 j" color={C.red} />
        <StatCard label="Réclamation ajout rapide" value={`${d.engagement.claimRate}%`} sub={`${fmtNumber(d.engagement.claimsConsumed)} / ${fmtNumber(d.engagement.claimsCreated)} liens`} color={C.green} />
      </Grid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Joignabilité (opt-in)">
          <ShareList
            total={reg}
            items={[
              { label: 'Push (jeton + opt-in)', value: c.reachability.push, color: C.primary },
              { label: 'Email', value: c.reachability.email, color: '#EA4335' },
              { label: 'WhatsApp', value: c.reachability.whatsapp, color: '#25D366' },
            ]}
          />
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
            {fmtNumber(c.noShareInfo)} client(s) refusent de partager leurs infos avec les commerçants.
          </p>
        </Card>
        <Card title="Méthode d'inscription">
          <ShareList
            total={reg}
            items={[
              { label: 'Téléphone (OTP)', value: c.acquisition.phone, color: C.green },
              { label: 'Google', value: c.acquisition.google, color: C.blue },
              { label: 'Apple', value: c.acquisition.apple, color: C.text },
              { label: 'Email', value: c.acquisition.email, color: C.amber },
            ]}
          />
        </Card>
        <Card title="Nombre de cartes par client">
          <ShareList
            total={cardHolders + c.cards.none}
            items={[
              { label: 'Aucune carte', value: c.cards.none, color: C.red },
              { label: '1 commerce', value: c.cards.one, color: C.amber },
              { label: '2 à 3 commerces', value: c.cards.twoToThree, color: C.cyan },
              { label: '4 commerces ou +', value: c.cards.fourPlus, color: C.green },
            ]}
          />
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
            Les clients multi-commerces sont la preuve de l'effet réseau JitPlus.
          </p>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card title="Santé du programme de fidélité">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <MiniStat label="Cartes vides (0 tampon)" value={fmtNumber(l.emptyCards)} />
            <MiniStat label="Cadeaux à remettre" value={fmtNumber(l.pendingGifts)} color={l.pendingGiftsOld ? C.amber : undefined} hint={`${l.pendingGiftsOld} en attente depuis +7 jours`} />
            <MiniStat label="Taux d'échange" value={`${sharePct(d.transactions.redeem, d.transactions.earn)}%`} hint="Récompenses échangées / passages avec tampons" />
            <MiniStat label="Clients avec anniversaire" value={`${sharePct(c.withBirthday, reg)}%`} hint="Permet des campagnes anniversaire" />
          </div>
        </Card>
        <Card title="Langues de l'application">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {(['clients', 'merchants'] as const).map((aud) => {
              const rows = d.languages[aud];
              const tot = rows.reduce((a, b) => a + b.count, 0);
              return (
                <div key={aud}>
                  <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: C.textMuted }}>{aud === 'clients' ? 'JitPlus (clients)' : 'JitPlus Pro'}</p>
                  {rows.length === 0 ? <Empty /> : (
                    <ShareList total={tot} items={rows.map((r) => ({ label: LANGUAGE_LABELS[r.language] ?? r.language, value: r.count }))} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

function GamesTab({ d }: { d: AdminInsights }) {
  const s = d.scratch;
  const w = d.luckyWheel;
  const ct = d.coupons.totals;

  return (
    <>
      <GroupLabel>Jeux & coupons sur {d.period.days} jours</GroupLabel>
      <Grid style={{ marginBottom: 24 }}>
        <StatCard label="Campagnes grattage" value={fmtNumber(s.campaignsPeriod)} sub={`${s.live} en cours · ${s.scheduled} programmées`} color={C.primary} />
        <StatCard label="Taux de grattage" value={`${s.scratchRate}%`} sub={`${fmtNumber(s.scratched)} / ${fmtNumber(s.cards)} cartes`} color={C.green} />
        <StatCard label="Coupons gagnés" value={fmtNumber(ct.total)} sub={`${ct.redemptionRate}% utilisés`} color={C.cyan} />
        <StatCard label="Remises accordées" value={fmtMAD(ct.discount)} sub={`sur ${fmtMAD(ct.purchase)} d'achats`} color={C.amber} />
        <StatCard label="Roues actives" value={fmtNumber(w.live)} sub={`${w.campaignsPeriod} lancées sur la période`} color={C.primaryLight} />
        <StatCard label="Taux de gain roue" value={`${w.winRate}%`} sub={`${fmtNumber(w.won)} / ${fmtNumber(w.draws)} tirages`} color={C.blue} />
        <StatCard label="Lots remis" value={`${w.claimRate}%`} sub={`${fmtNumber(w.pendingAll)} lots en attente`} color={C.green} />
        <StatCard label="Lots en rupture" value={fmtNumber(w.outOfStock)} sub="dans des roues actives" color={w.outOfStock ? C.red : C.textMuted} />
      </Grid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Entonnoir cartes à gratter">
          {s.cards === 0 ? <Empty /> : (
            <Funnel
              color={C.primary}
              steps={[
                { label: 'Cartes distribuées', value: s.cards },
                { label: 'Push envoyé', value: s.pushed },
                { label: 'Ouvertes', value: s.opened },
                { label: 'Grattées', value: s.scratched },
                { label: 'Coupons utilisés', value: d.coupons.bySource.find((x) => x.source === 'SCRATCH_CARD')?.redeemed ?? 0 },
              ]}
            />
          )}
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
            {fmtNumber(s.expired)} expirées · {fmtNumber(s.pending)} en attente · {fmtNumber(s.cancelled)} campagne(s) annulée(s).
          </p>
        </Card>
        <Card title="Entonnoir roue de la fortune">
          {w.tickets === 0 ? <Empty /> : (
            <Funnel
              color={C.cyan}
              steps={[
                { label: 'Tickets gagnés', value: w.tickets },
                { label: 'Tickets joués', value: w.used },
                { label: 'Lots gagnés', value: w.won },
                { label: 'Lots remis', value: w.claimed },
              ]}
            />
          )}
          <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textMuted }}>
            {fmtNumber(w.expired)} lot(s) expiré(s) sans être récupéré(s).
          </p>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card title="Quelle offre convertit le mieux ?">
          <DataTable
            rows={d.coupons.byType}
            rowKey={(r) => r.type}
            columns={[
              { header: 'Type de coupon', render: (r) => COUPON_TYPE_LABELS[r.type] ?? r.type },
              { header: 'Gagnés', align: 'right', render: (r) => fmtNumber(r.total) },
              { header: 'Utilisés', align: 'right', render: (r) => fmtNumber(r.redeemed) },
              { header: 'Conversion', align: 'right', render: (r) => <b style={{ color: r.redemptionRate >= 30 ? C.green : r.redemptionRate >= 15 ? C.amber : C.red }}>{r.redemptionRate}%</b> },
            ]}
          />
        </Card>
        <Card title="Coupons par origine">
          <DataTable
            rows={d.coupons.bySource}
            rowKey={(r) => r.source}
            columns={[
              { header: 'Origine', render: (r) => COUPON_SOURCE_LABELS[r.source] ?? r.source },
              { header: 'Total', align: 'right', render: (r) => fmtNumber(r.total) },
              { header: 'Actifs', align: 'right', render: (r) => fmtNumber(r.active) },
              { header: 'Utilisés', align: 'right', render: (r) => fmtNumber(r.redeemed) },
              { header: 'Expirés', align: 'right', render: (r) => fmtNumber(r.expired) },
              { header: 'Remise', align: 'right', render: (r) => fmtMAD(r.discount) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

function CommunicationTab({ d, stats, navigate }: { d: AdminInsights; stats: GlobalStats | null; navigate: (to: string) => void }) {
  const e = d.engagement;
  const n = stats?.notifications;

  return (
    <>
      <GroupLabel>Notifications sur {d.period.days} jours</GroupLabel>
      <Grid style={{ marginBottom: 24 }}>
        <StatCard label="Campagnes commerçants" value={fmtNumber(e.merchantCampaigns)} sub={`${fmtNumber(e.adminCampaigns)} campagnes admin`} color={C.primary} onClick={() => navigate('/notifications')} />
        <StatCard label="Destinataires" value={fmtNumber(e.notifRecipients)} sub={`${e.notifSuccessRate}% livrés`} color={e.notifSuccessRate >= 80 || e.notifRecipients === 0 ? C.green : C.red} />
        <StatCard label="Lues par les clients" value={`${e.clientNotifReadRate}%`} sub={`${fmtNumber(e.clientNotifRead)} / ${fmtNumber(e.clientNotifDelivered)} dans l'app`} color={C.cyan} />
        <StatCard label="Inbox Pro lue" value={`${e.inboxReadRate}%`} sub={`${fmtNumber(e.inboxRead)} / ${fmtNumber(e.inboxSent)} messages auto`} color={C.blue} hint="Messages automatiques envoyés aux commerçants (sécurité, plan, conseils...)" />
      </Grid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Canaux (depuis le lancement)">
          {!n ? <Empty /> : (
            <>
              <ShareList
                total={n.total || 1}
                items={[
                  { label: 'Push', value: n.pushCount, color: C.primary },
                  { label: 'WhatsApp', value: n.whatsappCount, color: '#25D366' },
                  { label: 'Email', value: n.emailCount, color: '#EA4335' },
                ]}
              />
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MiniStat label="Envois total" value={fmtNumber(n.totalSent)} />
                <MiniStat label="Taux succès" value={`${n.successRate}%`} color={n.successRate >= 80 ? C.green : C.amber} />
              </div>
            </>
          )}
        </Card>

        <Card title="File d'attente opérationnelle">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Demandes de retrait en attente', value: d.ops.payoutsPending, extra: fmtMAD(d.ops.payoutsPendingAmount), color: d.ops.payoutsPending ? C.red : C.green, to: '/referrals' },
              { label: 'Parrainages clients à valider', value: d.ops.clientReferralsPending, color: d.ops.clientReferralsPending ? C.amber : C.green, to: '/referrals' },
              { label: 'Cadeaux non remis (+7 j)', value: d.loyalty.pendingGiftsOld, color: d.loyalty.pendingGiftsOld ? C.amber : C.green },
              { label: 'Lots de roue en attente', value: d.luckyWheel.pendingAll, color: d.luckyWheel.pendingAll ? C.amber : C.green },
              { label: `Parrainages commerçants (${d.period.days} j)`, value: d.ops.merchantReferralsPeriod, color: C.primary, to: '/referrals' },
            ].map((row) => (
              <div
                key={row.label}
                onClick={row.to ? () => navigate(row.to!) : undefined}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: C.bg, border: `1px solid ${C.borderLight}`, cursor: row.to ? 'pointer' : 'default' }}
              >
                <span style={{ fontSize: 13 }}>{row.label}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {row.extra && <span style={{ fontSize: 12, color: C.textMuted }}>{row.extra}</span>}
                  <span style={S.badge(row.color)}>{fmtNumber(row.value)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Modération : blocages clients">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <MiniStat label="Blocages total" value={fmtNumber(d.moderation.blocksTotal)} />
            <MiniStat label={`Sur ${d.period.days} j`} value={fmtNumber(d.moderation.blocksPeriod)} color={d.moderation.blocksPeriod ? C.amber : undefined} />
          </div>
          <DataTable
            rows={d.moderation.topBlocked}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/merchants/${r.id}`)}
            columns={[
              { header: 'Commerce le plus bloqué', render: (r) => <div><b>{r.nom}</b><div style={{ fontSize: 11, color: C.textMuted }}>{CATEGORY_LABELS[r.category] ?? r.category}</div></div> },
              { header: 'Blocages', align: 'right', render: (r) => <span style={S.badge(C.red)}>{r.blocks}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Overview() {
  const navigate = useNavigate();
  const [days, setDays] = useState<InsightPeriod>(() => {
    const v = Number(sessionStorage.getItem('overview_days'));
    return v === 7 || v === 90 ? v : 30;
  });
  const [tab, setTab] = useState<OverviewTab>('summary');
  const alerts = useAlertsContext();
  const [insights, setInsights] = useState<AdminInsights | null>(null);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (period: InsightPeriod) => {
    setLoading(true);
    setError('');
    try {
      const [ins, st] = await Promise.all([getInsights(period), getStats()]);
      setInsights(ins);
      setStats(st);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem('overview_days', String(days));
    load(days);
  }, [days, load]);

  const recommendations = useMemo(() => (insights ? buildRecommendations(insights) : []), [insights]);

  const openRecommendation = (r: Recommendation) => {
    if (r.link?.tab) {
      setTab(r.link.tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (r.link?.to) navigate(r.link.to);
  };

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22, color: C.text, letterSpacing: '-0.02em' }}>Vue d'ensemble</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted, textTransform: 'capitalize' }}>
            {today}
            {insights && <span style={{ textTransform: 'none' }}> · données à {fmtTime(insights.generatedAt)} (cache 2 min)</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setDays(p.value)} style={pillStyle(days === p.value)} disabled={loading && days === p.value}>
              {p.label}
            </button>
          ))}
          <button onClick={() => load(days)} disabled={loading} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, padding: '6px 12px', fontSize: 12 }}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: C.red, color: C.red, fontSize: 13, marginBottom: 16, whiteSpace: 'pre-line' }}>{error}</div>
      )}

      {alerts && (
        <div style={{ marginBottom: 16 }}>
          <AlertsPanel alerts={alerts} />
        </div>
      )}

      {!insights && loading && <p style={{ color: C.textMuted, fontSize: 13 }}>Chargement des statistiques…</p>}

      {insights && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <div style={{ marginBottom: 20 }}>
            <RecommendationsPanel items={recommendations} onOpen={openRecommendation} />
          </div>

          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 20, overflowX: 'auto' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: tab === t.key ? 600 : 500,
                  fontFamily: 'inherit',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${tab === t.key ? C.primary : 'transparent'}`,
                  color: tab === t.key ? C.primary : C.textMuted,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'summary' && <SummaryTab d={insights} stats={stats} navigate={navigate} />}
          {tab === 'merchants' && <MerchantsTab d={insights} navigate={navigate} />}
          {tab === 'clients' && <ClientsTab d={insights} />}
          {tab === 'games' && <GamesTab d={insights} />}
          {tab === 'communication' && <CommunicationTab d={insights} stats={stats} navigate={navigate} />}
        </div>
      )}
    </div>
  );
}
