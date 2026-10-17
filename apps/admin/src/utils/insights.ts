import type { AdminInsights } from '../types';
import { deltaPct, fmtMAD, fmtNumber } from './format';

export type InsightLevel = 'critical' | 'warning' | 'info' | 'success';

export type OverviewTab = 'summary' | 'merchants' | 'clients' | 'games' | 'communication';

export interface Recommendation {
  id: string;
  level: InsightLevel;
  title: string;
  detail: string;
  /** Route to open, or a tab of the overview page */
  link?: { label: string; to?: string; tab?: OverviewTab };
}

const LEVEL_ORDER: Record<InsightLevel, number> = { critical: 0, warning: 1, info: 2, success: 3 };

const ratio = (part: number, total: number) => (total > 0 ? part / total : 0);

/**
 * Rule-based product recommendations derived from the insights payload.
 * Thresholds only fire once there is enough volume to be meaningful.
 */
export function buildRecommendations(d: AdminInsights): Recommendation[] {
  const out: Recommendation[] = [];
  const m = d.merchants;
  const c = d.clients;
  const days = d.period.days;

  // ── Ops queues ──────────────────────────────────────────────────────────
  if (d.ops.payoutsPending > 0) {
    out.push({
      id: 'payouts',
      level: 'critical',
      title: `${d.ops.payoutsPending} demande(s) de retrait en attente`,
      detail: `${fmtMAD(d.ops.payoutsPendingAmount)} à traiter. Un délai de paiement long décourage le parrainage client.`,
      link: { label: 'Traiter', to: '/referrals' },
    });
  }

  if (d.engagement.notifRecipients >= 20 && d.engagement.notifSuccessRate < 80) {
    out.push({
      id: 'delivery',
      level: 'critical',
      title: `Taux de livraison des notifications faible (${d.engagement.notifSuccessRate}%)`,
      detail: 'Vérifier la configuration FCM/APNs, les jetons push expirés et les quotas email/WhatsApp.',
      link: { label: 'Voir', tab: 'communication' },
    });
  }

  if (d.transactions.cancelRate >= 5 && d.transactions.total >= 30) {
    out.push({
      id: 'cancel',
      level: 'warning',
      title: `${d.transactions.cancelRate}% des transactions sont annulées`,
      detail: 'Signe d\'erreurs de saisie en caisse ou d\'abus. Vérifier l\'ergonomie du scan dans JitPlus Pro.',
    });
  }

  // ── Revenue / plans ─────────────────────────────────────────────────────
  if (m.plans.trialEnding7d > 0) {
    out.push({
      id: 'trials-ending',
      level: 'warning',
      title: `${m.plans.trialEnding7d} essai(s) Premium expirent sous 7 jours`,
      detail: 'Moment idéal pour un appel commercial : la liste avec les contacts est dans l\'onglet Commerçants.',
      link: { label: 'Voir la liste', tab: 'merchants' },
    });
  }
  if (m.plans.paidEnding7d > 0) {
    out.push({
      id: 'paid-ending',
      level: 'warning',
      title: `${m.plans.paidEnding7d} abonnement(s) payant(s) arrivent à échéance sous 7 jours`,
      detail: 'Relancer le renouvellement avant la rétrogradation automatique en Free.',
      link: { label: 'Commerçants', to: '/merchants' },
    });
  }
  if (m.plans.trialsFinished >= 5 && m.plans.trialConversionRate < 20) {
    out.push({
      id: 'trial-conv',
      level: 'warning',
      title: `Conversion essai → payant : ${m.plans.trialConversionRate}%`,
      detail: 'Mettre en avant les fonctions Premium pendant l\'essai (cartes à gratter, roue, campagnes) et relancer à J-3.',
      link: { label: 'Analyse', tab: 'merchants' },
    });
  }

  // ── Merchant activation ─────────────────────────────────────────────────
  if (m.neverUsed > 0) {
    out.push({
      id: 'never-used',
      level: 'warning',
      title: `${m.neverUsed} commerçant(s) inscrit(s) n'ont jamais scanné de client`,
      detail: 'Inscrits depuis plus de 7 jours sans aucune transaction : proposer un accompagnement à la mise en place (affiche QR, 1re récompense).',
      link: { label: 'Entonnoir', tab: 'merchants' },
    });
  }
  if (m.dormant > 0) {
    out.push({
      id: 'dormant',
      level: 'warning',
      title: `${m.dormant} commerçant(s) dormant(s) depuis 30 jours`,
      detail: 'Ils utilisaient l\'app puis ont arrêté. Contacter les plus gros (liste triée par nombre de clients).',
      link: { label: 'Voir la liste', tab: 'merchants' },
    });
  }
  if (m.total >= 10 && ratio(m.funnel.withReward, m.total) < 0.7) {
    out.push({
      id: 'no-reward',
      level: 'info',
      title: `${m.total - m.funnel.withReward} commerçant(s) sans récompense configurée`,
      detail: 'Sans récompense, la carte de fidélité n\'a aucune valeur pour le client. Ajouter une étape guidée à l\'onboarding Pro.',
    });
  }
  if (m.total >= 10 && ratio(m.profile.logo, m.total) < 0.5) {
    out.push({
      id: 'logo',
      level: 'info',
      title: `Seulement ${Math.round(ratio(m.profile.logo, m.total) * 100)}% des commerçants ont un logo`,
      detail: 'Les fiches sans logo convertissent moins dans l\'onglet Découvrir de JitPlus. Relancer via l\'inbox Pro.',
    });
  }
  if (m.total >= 10 && ratio(m.profile.pushEnabled, m.activeAccounts) < 0.5) {
    out.push({
      id: 'merchant-push',
      level: 'info',
      title: `${Math.round(ratio(m.profile.pushEnabled, m.activeAccounts) * 100)}% des commerçants reçoivent les push Pro`,
      detail: 'Les rappels d\'essai et conseils n\'atteignent pas les autres. Demander la permission au bon moment dans l\'app Pro.',
    });
  }

  // ── Clients ─────────────────────────────────────────────────────────────
  if (c.registered >= 20 && ratio(c.reachability.push, c.registered) < 0.5) {
    out.push({
      id: 'client-push',
      level: 'warning',
      title: `Seuls ${Math.round(ratio(c.reachability.push, c.registered) * 100)}% des clients sont joignables par push`,
      detail: 'Les cartes à gratter et les campagnes dépendent du push. Expliquer le bénéfice avant de demander la permission.',
      link: { label: 'Clients', tab: 'clients' },
    });
  }
  if (c.activePrev >= 10 && c.retentionRate < 40) {
    out.push({
      id: 'retention',
      level: 'warning',
      title: `Rétention ${days} j : ${c.retentionRate}%`,
      detail: `Sur ${fmtNumber(c.activePrev)} clients actifs la période précédente, seuls ${fmtNumber(c.retained)} sont revenus. Activer l\'expiration des tampons et les rappels de récompense.`,
      link: { label: 'Clients', tab: 'clients' },
    });
  }
  if (d.engagement.claimsCreated >= 5 && d.engagement.claimRate < 30) {
    out.push({
      id: 'claims',
      level: 'info',
      title: `Ajout rapide : ${d.engagement.claimRate}% des liens WhatsApp réclamés`,
      detail: 'Beaucoup de clients ajoutés en caisse ne créent pas de compte. Retravailler le message WhatsApp et la page de réclamation.',
    });
  }
  if (d.loyalty.rewardsReady >= 10) {
    out.push({
      id: 'rewards-ready',
      level: 'info',
      title: `${fmtNumber(d.loyalty.rewardsReady)} carte(s) ont atteint une récompense non échangée`,
      detail: 'Rappel push "votre récompense vous attend" : excellent levier pour faire revenir le client.',
    });
  }
  if (d.loyalty.pendingGiftsOld > 0) {
    out.push({
      id: 'gifts',
      level: 'info',
      title: `${d.loyalty.pendingGiftsOld} cadeau(x) en attente de remise depuis plus de 7 jours`,
      detail: 'Les commerçants oublient de confirmer la remise. Ajouter un rappel dans JitPlus Pro.',
    });
  }

  // ── Games ───────────────────────────────────────────────────────────────
  if (d.scratch.cards >= 20 && ratio(d.scratch.expired, d.scratch.cards) > 0.3) {
    out.push({
      id: 'scratch-expired',
      level: 'info',
      title: `${Math.round(ratio(d.scratch.expired, d.scratch.cards) * 100)}% des cartes à gratter expirent sans être grattées`,
      detail: 'Allonger la durée de validité ou envoyer un rappel plus tôt.',
      link: { label: 'Jeux', tab: 'games' },
    });
  }
  if (d.coupons.totals.total >= 10 && d.coupons.totals.redemptionRate < 20) {
    out.push({
      id: 'coupons',
      level: 'info',
      title: `Seulement ${d.coupons.totals.redemptionRate}% des coupons sont utilisés`,
      detail: 'Vérifier les conditions trop strictes (montant minimum, créneaux) et le rappel avant expiration.',
      link: { label: 'Jeux', tab: 'games' },
    });
  }
  if (d.luckyWheel.outOfStock > 0) {
    out.push({
      id: 'wheel-stock',
      level: 'info',
      title: `${d.luckyWheel.outOfStock} lot(s) de roue en rupture dans des campagnes actives`,
      detail: 'Les commerçants concernés devraient réapprovisionner leurs lots.',
    });
  }
  if (m.total >= 10 && m.features.scratchCards + m.features.luckyWheel === 0) {
    out.push({
      id: 'games-adoption',
      level: 'info',
      title: 'Aucun commerçant n\'utilise encore les jeux',
      detail: 'Cartes à gratter et roue de la fortune sont de bons arguments Premium : les mettre en avant dans l\'app Pro.',
    });
  }

  // ── Moderation ──────────────────────────────────────────────────────────
  if (d.moderation.blocksPeriod > 0) {
    out.push({
      id: 'blocks',
      level: 'info',
      title: `${d.moderation.blocksPeriod} blocage(s) de commerçant par des clients sur la période`,
      detail: 'Souvent lié à trop de notifications. Vérifier les commerçants les plus bloqués.',
      link: { label: 'Voir', tab: 'communication' },
    });
  }

  // ── Good news ───────────────────────────────────────────────────────────
  const txGrowth = deltaPct(d.transactions.total, d.transactions.totalPrev);
  if (txGrowth !== null && txGrowth >= 10) {
    out.push({
      id: 'growth',
      level: 'success',
      title: `Transactions en hausse de ${txGrowth}% vs période précédente`,
      detail: `${fmtNumber(d.transactions.total)} transactions sur ${days} jours.`,
    });
  }
  const clientGrowth = deltaPct(c.newPeriod, c.newPrev);
  if (clientGrowth !== null && clientGrowth >= 10) {
    out.push({
      id: 'client-growth',
      level: 'success',
      title: `Inscriptions clients en hausse de ${clientGrowth}%`,
      detail: `${fmtNumber(c.newPeriod)} nouveaux clients sur ${days} jours.`,
    });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
