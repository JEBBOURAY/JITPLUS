import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAlerts } from '../api';
import type { AdminAlerts } from '../types';
import { fmtMAD, fmtNumber, sharePct } from './format';

const REFRESH_MS = 2 * 60_000;

export type AlertLevel = 'critical' | 'warning' | 'info';

export interface AlertItem {
  key: string;
  level: AlertLevel;
  count: number;
  text: string;
  /** Filtered page that lists the items behind the alert */
  to?: string;
  /** Sidebar entry that shows the badge */
  nav: string;
}

/** Operational alerts, refreshed on navigation and every 2 minutes (the API caches them for 60 s). */
export function useAlerts(): AdminAlerts | null {
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let alive = true;
    const load = () => getAlerts().then((a) => { if (alive) setAlerts(a); }).catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [pathname]);

  return alerts;
}

/** Filled by Layout so pages reuse the sidebar's alerts instead of fetching them again. */
export const AlertsContext = createContext<AdminAlerts | null>(null);
export const useAlertsContext = () => useContext(AlertsContext);

export function buildAlerts(a: AdminAlerts): AlertItem[] {
  const out: AlertItem[] = [];
  if (a.payoutsPending > 0) {
    out.push({
      key: 'payouts',
      level: 'critical',
      count: a.payoutsPending,
      text: `${fmtNumber(a.payoutsPending)} demande(s) de paiement de parrainage en attente (${fmtMAD(a.payoutsPendingAmount)})`,
      to: '/referrals?tab=payout&status=PENDING',
      nav: '/referrals',
    });
  }
  if (a.notifSuccessRate24h !== null && a.notifSuccessRate24h < 80) {
    out.push({
      key: 'notif-success',
      level: 'critical',
      count: 1,
      text: `Seulement ${a.notifSuccessRate24h}% des notifications délivrées sur 24 h (${fmtNumber(a.notifRecipients24h)} destinataires)`,
      to: '/notifications?days=7',
      nav: '/notifications',
    });
  }
  if (a.trialsEnding7d > 0) {
    out.push({
      key: 'trials',
      level: 'warning',
      count: a.trialsEnding7d,
      text: `${fmtNumber(a.trialsEnding7d)} essai(s) Premium expirent sous 7 jours : moment idéal pour proposer l'abonnement`,
      to: '/merchants?plan=TRIAL&sort=expiring',
      nav: '/merchants',
    });
  }
  if (a.paidEnding7d > 0) {
    out.push({
      key: 'paid',
      level: 'warning',
      count: a.paidEnding7d,
      text: `${fmtNumber(a.paidEnding7d)} abonnement(s) payant(s) arrivent à échéance sous 7 jours`,
      to: '/merchants?plan=PAID&sort=expiring',
      nav: '/merchants',
    });
  }
  if (a.stuckNewMerchants > 0) {
    out.push({
      key: 'stuck',
      level: 'warning',
      count: a.stuckNewMerchants,
      text: `${fmtNumber(a.stuckNewMerchants)} commerçant(s) inscrits il y a 7 à 30 jours, toujours sans aucune transaction`,
      to: '/merchants?activity=never&status=active',
      nav: '/merchants',
    });
  }
  const cancelRate = sharePct(a.cancelled24h, a.transactions24h);
  if (a.cancelled24h >= 5 && cancelRate >= 10) {
    out.push({
      key: 'cancelled',
      level: 'warning',
      count: a.cancelled24h,
      text: `${fmtNumber(a.cancelled24h)} transactions annulées sur 24 h (${cancelRate}%) : vérifier les erreurs de saisie ou les abus`,
      nav: '/',
    });
  }
  if (a.referralsPending > 0) {
    out.push({
      key: 'referrals',
      level: 'info',
      count: a.referralsPending,
      text: `${fmtNumber(a.referralsPending)} parrainage(s) client en attente de validation`,
      to: '/referrals?tab=client&status=PENDING',
      nav: '/referrals',
    });
  }
  return out;
}

/** Badge per sidebar entry: only critical and warning alerts count. */
export function navBadges(items: AlertItem[]): Record<string, { count: number; level: AlertLevel; title: string }> {
  const out: Record<string, { count: number; level: AlertLevel; title: string }> = {};
  for (const it of items) {
    if (it.level === 'info') continue;
    const cur = out[it.nav];
    if (!cur) out[it.nav] = { count: it.count, level: it.level, title: it.text };
    else {
      cur.count += it.count;
      if (it.level === 'critical') cur.level = 'critical';
      cur.title += `\n${it.text}`;
    }
  }
  return out;
}
