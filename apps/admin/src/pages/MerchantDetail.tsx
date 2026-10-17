import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import {
  activatePremium,
  banMerchant,
  deleteMerchant,
  getMerchantActivity,
  getMerchantDetail,
  getMerchantSubscriptionHistory,
  revokePremium,
  setPlanDates,
  unbanMerchant,
} from '../api';
import type { MerchantActivity, MerchantDetail, SubscriptionHistoryEvent } from '../types';
import PlanBadge from '../components/PlanBadge';
import ConfirmModal from '../components/ConfirmModal';
import StatCard from '../components/StatCard';
import { Card, DataTable, Empty, Grid, Legend, LineChart, MiniStat } from '../components/charts';
import { CheckItem, Dash, KeyValue, LastActivity, Muted, Progress, useToast } from '../components/ui';
import { C, S } from '../theme';
import {
  CATEGORY_LABELS, CHANNEL_COLOR, CHANNEL_LABELS, TX_TYPE_COLOR, TX_TYPE_LABELS,
  daysSince, deltaPct, fmtDate, fmtDateShort, fmtDateTime, fmtMAD, fmtNumber, fmtRelative,
} from '../utils/format';

const PROFILE_LABELS: Record<keyof MerchantActivity['profile']['checks'], { label: string; hint: string }> = {
  logo: { label: 'Logo', hint: 'Affiché sur la carte de fidélité et dans Découvrir' },
  cover: { label: 'Photo de couverture', hint: 'En-tête de la fiche commerce' },
  location: { label: 'Localisation sur la carte', hint: 'Nécessaire pour apparaître dans la recherche à proximité' },
  description: { label: 'Description', hint: 'Texte de présentation de la fiche' },
  openingHours: { label: 'Horaires d\'ouverture', hint: 'Évite aux clients de venir commerce fermé' },
  socialLinks: { label: 'Réseaux sociaux', hint: 'Instagram, Facebook, site web…' },
  reward: { label: 'Au moins une récompense', hint: 'Sans récompense, la carte n\'a pas de valeur pour le client' },
  pushEnabled: { label: 'Push JitPlus Pro activé', hint: 'Le commerçant reçoit les rappels et conseils' },
};

const SERIES = [
  { key: 'transactions', label: 'Transactions', color: 'var(--theme-primary)' },
  { key: 'clients', label: 'Clients venus', color: 'var(--theme-cyan)' },
  { key: 'newCards', label: 'Nouvelles cartes', color: 'var(--theme-green)' },
] as const;

const EARNING_MODE: Record<string, string> = {
  PER_VISIT: '1 tampon par visite',
  PER_AMOUNT: 'Selon le montant d\'achat',
};

interface Signal {
  tone: string;
  text: string;
}

function buildSignals(m: MerchantDetail, a: MerchantActivity): Signal[] {
  const out: Signal[] = [];
  const t = a.transactions;
  if (!m.isActive) out.push({ tone: C.red, text: 'Compte banni : le commerçant ne peut plus se connecter.' });
  if (t.total === 0 && daysSince(m.createdAt) >= 7) {
    out.push({ tone: C.amber, text: `Inscrit il y a ${daysSince(m.createdAt)} jours sans aucune transaction : proposer une aide à la mise en place.` });
  } else if (t.lastAt && daysSince(t.lastAt) > 30) {
    out.push({ tone: C.amber, text: `Dormant : dernière transaction ${fmtRelative(t.lastAt).toLowerCase()}. À relancer.` });
  }
  if (m.plan === 'PREMIUM' && m.planExpiresAt) {
    const left = Math.ceil((new Date(m.planExpiresAt).getTime() - Date.now()) / 86_400_000);
    if (left > 0 && left <= 7) {
      out.push({ tone: C.amber, text: `${m.isTrial ? 'Essai' : 'Abonnement'} Premium : expire dans ${left} jour(s).` });
    }
  }
  if (a.rewards.length === 0) out.push({ tone: C.amber, text: 'Aucune récompense configurée : la carte de fidélité n\'a pas de valeur.' });
  if (a.profile.score < 50) out.push({ tone: C.blue, text: `Fiche complétée à ${a.profile.score}% : elle sera moins visible dans Découvrir.` });
  if (t.pendingGifts > 0) out.push({ tone: C.blue, text: `${t.pendingGifts} cadeau(x) en attente de remise au client.` });
  if (t.cancelRate >= 10 && t.total + t.cancelled >= 20) out.push({ tone: C.amber, text: `${t.cancelRate}% des transactions annulées : possible erreur de saisie ou abus.` });
  if (a.clients.blocks > 0) out.push({ tone: C.blue, text: `${a.clients.blocks} client(s) ont bloqué ce commerçant (souvent trop de notifications).` });
  return out;
}

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [activity, setActivity] = useState<MerchantActivity | null>(null);
  const [activityError, setActivityError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastNode, showToast] = useToast();
  const [dateForm, setDateForm] = useState({ startDate: '', endDate: '' });
  const [savingDates, setSavingDates] = useState(false);
  const [history, setHistory] = useState<SubscriptionHistoryEvent[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [series, setSeries] = useState<Set<string>>(new Set(['transactions', 'clients']));
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    requireReason?: boolean;
    requireText?: string;
    onConfirm: (reason?: string) => Promise<unknown>;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [m, h, a] = await Promise.allSettled([getMerchantDetail(id), getMerchantSubscriptionHistory(id), getMerchantActivity(id)]);
      if (m.status === 'rejected') throw m.reason;
      setMerchant(m.value);
      setDateForm({
        startDate: m.value.trialStartedAt ? m.value.trialStartedAt.slice(0, 10) : '',
        endDate: m.value.planExpiresAt ? m.value.planExpiresAt.slice(0, 10) : '',
      });
      if (h.status === 'fulfilled') { setHistory(h.value.events); setHistoryError(''); } else setHistoryError(getErrorMessage(h.reason));
      if (a.status === 'fulfilled') { setActivity(a.value); setActivityError(''); } else setActivityError(getErrorMessage(a.reason));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setActionLoading(true);
    try {
      await fn();
      showToast(label);
      await load();
    } catch (e) {
      showToast(getErrorMessage(e), 'error');
    } finally {
      setActionLoading(false);
      setConfirmModal(null);
    }
  };

  const chart = useMemo(() => {
    if (!activity) return null;
    return {
      labels: activity.daily.map((d) => fmtDateShort(d.date)),
      series: SERIES.filter((s) => series.has(s.key)).map((s) => ({ ...s, values: activity.daily.map((d) => d[s.key]) })),
    };
  }, [activity, series]);

  if (loading) return <p style={{ color: C.textMuted }}>Chargement…</p>;
  if (error) return <p style={{ color: C.red }}>{error}</p>;
  if (!merchant) return null;

  const isPremium = merchant.plan === 'PREMIUM';
  const isTrial = isPremium && !merchant.planActivatedByAdmin && !!merchant.planExpiresAt;
  const deleted = !!merchant.deletedAt;
  const a = activity;
  const signals = a ? buildSignals(merchant, a) : [];
  const waNumber = merchant.phoneNumber?.replace(/[^\d]/g, '');

  return (
    <div style={{ paddingBottom: 48 }}>
      {toastNode}

      <button onClick={() => navigate(-1)} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, marginBottom: 16, padding: '6px 12px' }}>
        ← Retour
      </button>

      {/* Header */}
      <div style={{ ...S.card, marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{merchant.nom}</h2>
            {deleted ? <span style={S.badge(C.textMuted)}>Supprimé</span> : <PlanBadge plan={merchant.plan} isTrial={isTrial} isActive={merchant.isActive} />}
            {a && !a.settings.onboardingCompleted && <span style={S.badge(C.amber)}>Onboarding non terminé</span>}
            {a && !a.settings.emailVerified && <span style={S.badge(C.textMuted)}>Email non vérifié</span>}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: C.textMuted, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>{CATEGORY_LABELS[merchant.categorie] ?? merchant.categorie}</span>
            {merchant.ville && <span>{merchant.ville}{a?.settings.quartier ? ` · ${a.settings.quartier}` : ''}</span>}
            <span>Inscrit le {fmtDate(merchant.createdAt)}</span>
            {a && <span>Dernière activité : <LastActivity date={a.transactions.lastAt} /></span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!deleted && <a href={`mailto:${merchant.email}`} style={{ ...S.btnOutline(C.cyan), textDecoration: 'none' }}>Email</a>}
          {merchant.phoneNumber && <a href={`tel:${merchant.phoneNumber}`} style={{ ...S.btnOutline(C.green), textDecoration: 'none' }}>Appeler</a>}
          {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" style={{ ...S.btnOutline('#25D366'), textDecoration: 'none' }}>WhatsApp</a>}
          <Link to={`/notifications?merchantId=${merchant.id}`} style={{ ...S.btnOutline(C.primary), textDecoration: 'none' }}>Ses notifications</Link>
        </div>
      </div>

      {/* Signals */}
      {signals.length > 0 && (
        <div style={{ ...S.card, marginBottom: 16, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signals.map((s) => (
            <div key={s.text} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.tone, flexShrink: 0 }} />
              {s.text}
            </div>
          ))}
        </div>
      )}

      {activityError && <p style={{ color: C.red, fontSize: 13 }}>Statistiques indisponibles : {activityError}</p>}

      {a && (
        <>
          <Grid min={170} style={{ marginBottom: 16 }}>
            <StatCard label="Clients (cartes)" value={fmtNumber(a.clients.active)} sub={`+${fmtNumber(a.clients.new30)} sur 30 j`} color={C.primary} />
            <StatCard label="Clients actifs 30 j" value={fmtNumber(a.clients.active30)} sub={`${fmtNumber(a.clients.cards)} cartes au total`} color={C.cyan} />
            <StatCard label="Transactions 30 j" value={fmtNumber(a.transactions.last30)} delta={deltaPct(a.transactions.last30, a.transactions.prev30)} sub={`${fmtNumber(a.transactions.total)} depuis le début`} color={C.green} />
            <StatCard label="Clients fidèles" value={`${a.clients.returningRate}%`} sub={`${fmtNumber(a.clients.returning)} venus 2 fois ou +`} color={C.blue} hint="Part des cartes avec au moins 2 passages tamponnés" />
            <StatCard label="Récompenses échangées" value={fmtNumber(a.transactions.byType.redeem)} sub={`${fmtNumber(a.clients.rewardReady)} prêtes à échanger`} color={C.amber} />
            <StatCard label="CA suivi" value={fmtMAD(a.transactions.amount)} sub="montants saisis en caisse" color={C.primary} />
            <StatCard label="Vues de la fiche 30 j" value={fmtNumber(a.features.views30)} sub={`${fmtNumber(merchant.profileViews)} au total`} color={C.cyan} />
          </Grid>

          <Card
            title="Activité sur 90 jours"
            right={<Legend items={[...SERIES]} active={series} onToggle={(k) => setSeries((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />}
            style={{ marginBottom: 16 }}
          >
            {chart && chart.series.length > 0 ? <LineChart labels={chart.labels} series={chart.series} /> : <Empty>Sélectionnez une série</Empty>}
          </Card>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {a && (
            <>
              <Card title="Meilleurs clients">
                <DataTable
                  rows={a.topClients}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => navigate(`/clients/${r.id}`)}
                  columns={[
                    {
                      header: 'Client',
                      render: (r) => (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <b>{r.name ?? 'Sans nom'}</b>
                          {r.isAnonymous && <span style={S.badge(C.amber)}>Ajout rapide</span>}
                          {r.deleted && <span style={S.badge(C.red)}>Désactivé</span>}
                        </span>
                      ),
                    },
                    { header: 'Téléphone', render: (r) => r.telephone ?? <Dash /> },
                    { header: 'Passages', align: 'right', render: (r) => fmtNumber(r.visits) },
                    { header: 'Tampons', render: (r) => <Progress value={r.stamps} max={a.settings.stampsForReward} label={`${r.stamps}/${a.settings.stampsForReward}`} /> },
                    { header: 'Dernière visite', render: (r) => <LastActivity date={r.lastAt} /> },
                  ]}
                />
              </Card>

              <Card title="Dernières transactions">
                <DataTable
                  rows={a.recentTransactions}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => navigate(`/clients/${r.client.id}`)}
                  columns={[
                    { header: 'Date', render: (r) => <span style={{ whiteSpace: 'nowrap', color: C.textMuted }}>{fmtDateTime(r.createdAt)}</span> },
                    {
                      header: 'Type',
                      render: (r) => (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <span style={S.badge(TX_TYPE_COLOR[r.type] ?? C.textMuted)}>{TX_TYPE_LABELS[r.type] ?? r.type}</span>
                          {r.status === 'CANCELLED' && <span style={S.badge(C.red)}>Annulée</span>}
                        </span>
                      ),
                    },
                    { header: 'Client', render: (r) => r.client.name ?? <Muted>Sans nom</Muted> },
                    { header: 'Détail', render: (r) => <Muted>{r.reward ?? (r.stamps ? `${r.stamps > 0 ? '+' : ''}${r.stamps} tampon(s)` : '')}{r.amount ? ` · ${fmtMAD(r.amount)}` : ''}</Muted> },
                    { header: 'Par', render: (r) => r.performedBy ?? <Dash /> },
                  ]}
                />
              </Card>

              <Card title="Programme de fidélité">
                <Grid min={150} style={{ marginBottom: 16 }}>
                  <MiniStat label="Mode" value={<span style={{ fontSize: 14 }}>{EARNING_MODE[a.settings.stampEarningMode] ?? a.settings.stampEarningMode}</span>} />
                  <MiniStat label="Tampons / récompense" value={a.settings.stampsForReward} />
                  {a.settings.stampEarningMode === 'PER_AMOUNT' && <MiniStat label="Montant / tampon" value={fmtMAD(a.settings.amountPerStamp)} />}
                  <MiniStat label="Expiration tampons" value={<span style={{ fontSize: 14 }}>{a.settings.stampValidityDays ? `${a.settings.stampValidityDays} j sans visite` : 'Jamais'}</span>} />
                  <MiniStat label="Moyenne / carte" value={a.clients.avgStamps} hint="Tampons moyens sur les cartes actives" />
                  <MiniStat label="Tampons distribués" value={fmtNumber(a.transactions.stampsGiven)} />
                </Grid>
                <DataTable
                  rows={a.rewards}
                  rowKey={(r) => r.id}
                  columns={[
                    { header: 'Récompense', render: (r) => <b>{r.titre}</b> },
                    { header: 'Coût', align: 'right', render: (r) => `${r.cout} tampons` },
                    { header: 'Échangée', align: 'right', render: (r) => `${fmtNumber(r.redeemed)} fois` },
                  ]}
                />
              </Card>
            </>
          )}

          {/* Plan */}
          <Card title="Plan et abonnement">
            <KeyValue label="Plan actuel" value={deleted ? 'Supprimé' : isTrial ? 'Premium (essai)' : merchant.plan === 'PREMIUM' ? 'Premium (payant)' : 'Free'} />
            <KeyValue label="Activé par un admin" value={merchant.planActivatedByAdmin ? 'Oui' : 'Non'} />
            <KeyValue label="Expiration" value={merchant.planExpiresAt ? fmtDateTime(merchant.planExpiresAt) : 'Aucune'} />
            <KeyValue label="Essai démarré" value={merchant.trialStartedAt ? fmtDateTime(merchant.trialStartedAt) : '—'} />

            <p style={{ margin: '18px 0 10px', fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Modifier les dates manuellement
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Date de début</span>
                <input type="date" value={dateForm.startDate} onChange={(e) => setDateForm((f) => ({ ...f, startDate: e.target.value }))} style={S.input} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Date de fin (expiration)</span>
                <input type="date" value={dateForm.endDate} onChange={(e) => setDateForm((f) => ({ ...f, endDate: e.target.value }))} style={S.input} />
              </label>
            </div>
            <button
              disabled={savingDates || deleted || (!dateForm.startDate && !dateForm.endDate)}
              onClick={async () => {
                setSavingDates(true);
                try {
                  await setPlanDates(merchant.id, dateForm.startDate || undefined, dateForm.endDate || undefined);
                  showToast('Dates mises à jour');
                  await load();
                } catch (e) {
                  showToast(getErrorMessage(e), 'error');
                } finally {
                  setSavingDates(false);
                }
              }}
              style={{ ...S.btn(C.primary), opacity: savingDates || deleted ? 0.5 : 1 }}
            >
              {savingDates ? '…' : 'Enregistrer les dates'}
            </button>
          </Card>

          <Card title="Historique d'abonnement">
            {historyError ? (
              <p style={{ margin: 0, color: C.red, fontSize: 13 }}>{historyError}</p>
            ) : history.length === 0 ? (
              <Empty>Aucun événement d'abonnement.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((event) => (
                  <div
                    key={event.id}
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderLeft: `4px solid ${historyEventColor(event.action)}`, borderRadius: 8, padding: '10px 12px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{historyEventLabel(event.action)}</span>
                      <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtDateTime(event.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>{event.summary}</p>
                    {event.adminEmail && <p style={{ margin: '6px 0 0', fontSize: 11, color: C.textMuted }}>Par : {event.adminEmail}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Informations">
            <KeyValue label="Email" value={deleted ? <Dash /> : merchant.email} />
            <KeyValue label="Téléphone" value={merchant.phoneNumber ?? <Dash />} />
            <KeyValue label="Adresse" value={a?.settings.adresse ?? <Dash />} />
            <KeyValue label="Site web" value={merchant.socialLinks?.website ?? <Dash />} />
            <KeyValue label="Langue de l'app" value={a?.settings.language.toUpperCase() ?? <Dash />} />
            <KeyValue label="Boutiques" value={fmtNumber(merchant.storeCount)} />
            <KeyValue label="1re transaction" value={a?.transactions.firstAt ? fmtDate(a.transactions.firstAt) : <Dash />} />
            <KeyValue label="Transactions annulées" value={a ? `${fmtNumber(a.transactions.cancelled)} (${a.transactions.cancelRate}%)` : <Dash />} color={a && a.transactions.cancelRate >= 10 ? C.red : undefined} />
            {deleted && <KeyValue label="Supprimé le" value={fmtDateTime(merchant.deletedAt!)} color={C.red} />}
          </Card>

          {a && (
            <>
              <Card title="Complétude de la fiche" right={<span style={S.badge(a.profile.score >= 75 ? C.green : a.profile.score >= 50 ? C.amber : C.red)}>{a.profile.score}%</span>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {(Object.keys(PROFILE_LABELS) as (keyof typeof PROFILE_LABELS)[]).map((k) => (
                    <CheckItem key={k} done={a.profile.checks[k]} label={PROFILE_LABELS[k].label} hint={PROFILE_LABELS[k].hint} />
                  ))}
                </div>
              </Card>

              <Card title="Fonctionnalités utilisées">
                <KeyValue label="Cartes à gratter" value={a.features.scratchCampaigns ? `${a.features.scratchCampaigns} campagne(s) · ${a.features.scratchScratched}/${a.features.scratchCards} grattées` : <Muted>Jamais</Muted>} />
                <KeyValue label="Roue de la fortune" value={a.features.wheelCampaigns ? `${a.features.wheelCampaigns} campagne(s)${a.features.wheelActive ? ' · active' : ''}` : <Muted>Jamais</Muted>} />
                <KeyValue label="Coupons" value={a.features.coupons ? `${a.features.couponsRedeemed}/${a.features.coupons} utilisés` : <Muted>Aucun</Muted>} />
                <KeyValue label="Ajout rapide WhatsApp" value={a.features.claims ? `${a.features.claimsConsumed}/${a.features.claims} réclamés` : <Muted>Jamais</Muted>} />
                <KeyValue label="Équipe" value={a.team.length ? `${a.team.filter((t) => t.isActive).length} membre(s) actif(s)` : <Muted>Seul</Muted>} />
                {a.notifications.length === 0 ? (
                  <KeyValue label="Campagnes de notification" value={<Muted>Jamais</Muted>} />
                ) : (
                  a.notifications.map((n) => (
                    <KeyValue
                      key={n.channel}
                      label={`Campagnes ${CHANNEL_LABELS[n.channel] ?? n.channel}`}
                      value={<span><span style={{ color: CHANNEL_COLOR[n.channel] ?? C.text, fontWeight: 600 }}>{n.campaigns}</span> · {fmtNumber(n.recipients)} dest. · {n.successRate}% livrés</span>}
                    />
                  ))
                )}
              </Card>

              {a.team.length > 0 && (
                <Card title="Équipe">
                  {a.team.map((t) => (
                    <KeyValue key={t.id} label={`${t.nom}${t.isActive ? '' : ' (inactif)'}`} value={`${fmtNumber(t.transactions)} transactions`} />
                  ))}
                </Card>
              )}

              {a.stores.length > 0 && (
                <Card title={`Boutiques (${a.stores.length})`}>
                  {a.stores.map((s) => (
                    <KeyValue key={s.id} label={s.nom} value={[s.ville, s.quartier].filter(Boolean).join(' · ') || <Dash />} color={s.isActive ? undefined : C.textMuted} />
                  ))}
                </Card>
              )}

              <Card title="Quotas du mois">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>WhatsApp</div>
                    <Progress value={a.quotas.whatsapp.used} max={a.quotas.whatsapp.max} color="#25D366" label={`${a.quotas.whatsapp.used} / ${a.quotas.whatsapp.max}`} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Email</div>
                    <Progress value={a.quotas.email.used} max={a.quotas.email.max} color="#EA4335" label={`${a.quotas.email.used} / ${a.quotas.email.max}`} />
                  </div>
                </div>
              </Card>

              <Card title="Parrainage">
                <KeyValue label="Code" value={a.referral.code ?? <Dash />} color={C.cyan} />
                <KeyValue label="Commerçants parrainés" value={fmtNumber(a.referral.referrals)} />
                <KeyValue label="Mois gagnés" value={fmtNumber(a.referral.monthsEarned)} />
                <KeyValue
                  label="Parrainé par"
                  value={a.referral.referredBy ? <Link to={`/merchants/${a.referral.referredBy.id}`} style={{ color: C.primary }}>{a.referral.referredBy.nom}</Link> : <Dash />}
                />
              </Card>
            </>
          )}

          {/* Actions */}
          <Card title="Actions">
            {deleted ? (
              <Muted>Compte supprimé : aucune action possible.</Muted>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!isPremium || isTrial ? (
                  <button disabled={actionLoading} onClick={() => run(() => activatePremium(merchant.id), 'Premium activé')} style={S.btn(C.primary)}>
                    Activer Premium
                  </button>
                ) : merchant.planActivatedByAdmin ? (
                  <button
                    disabled={actionLoading}
                    onClick={() => setConfirmModal({
                      title: 'Révoquer Premium',
                      message: `Le commerçant "${merchant.nom}" repassera en Free immédiatement.`,
                      onConfirm: () => revokePremium(merchant.id),
                    })}
                    style={S.btnOutline(C.amber)}
                  >
                    Révoquer Premium
                  </button>
                ) : null}

                {merchant.isActive ? (
                  <button
                    disabled={actionLoading}
                    onClick={() => setConfirmModal({
                      title: 'Bannir ce commerçant',
                      message: `Vous allez bannir "${merchant.nom}". Une raison est obligatoire.`,
                      requireReason: true,
                      onConfirm: (reason) => banMerchant(merchant.id, reason),
                    })}
                    style={S.btnOutline(C.red)}
                  >
                    Bannir
                  </button>
                ) : (
                  <button disabled={actionLoading} onClick={() => run(() => unbanMerchant(merchant.id), 'Commerçant débanni')} style={S.btn(C.green)}>
                    Débannir
                  </button>
                )}

                <button
                  disabled={actionLoading}
                  onClick={() => setConfirmModal({
                    title: 'Suppression irréversible',
                    message: `Pour confirmer la suppression de "${merchant.nom}" et l'anonymisation de ses données, tapez SUPPRIMER ci-dessous.`,
                    requireText: 'SUPPRIMER',
                    onConfirm: () => deleteMerchant(merchant.id).then(() => navigate('/merchants')),
                  })}
                  style={S.btn(C.red)}
                >
                  Supprimer définitivement
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        requireReason={confirmModal?.requireReason}
        requireText={confirmModal?.requireText}
        loading={actionLoading}
        onConfirm={(reason) => run(() => confirmModal!.onConfirm(reason), confirmModal!.title)}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

function historyEventLabel(action: string) {
  switch (action) {
    case 'ACCOUNT_CREATED': return 'Création du compte';
    case 'ACTIVATE_PREMIUM': return 'Premium activé';
    case 'REVOKE_PREMIUM': return 'Premium révoqué';
    case 'UPDATE_PLAN_DURATION': return 'Dates modifiées';
    case 'CURRENT_STATE': return 'État actuel';
    default: return action;
  }
}

function historyEventColor(action: string) {
  switch (action) {
    case 'ACCOUNT_CREATED': return C.blue;
    case 'ACTIVATE_PREMIUM': return C.green;
    case 'REVOKE_PREMIUM': return C.red;
    case 'UPDATE_PLAN_DURATION': return C.amber;
    case 'CURRENT_STATE': return C.cyan;
    default: return C.textMuted;
  }
}
