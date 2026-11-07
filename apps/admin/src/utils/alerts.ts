import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAlerts } from '../api';
import type { AdminAlerts } from '../types';
import { fmtMAD, fmtNumber } from './format';

const REFRESH_MS = 2 * 60_000;

export type AlertLevel = 'critical' | 'warning' | 'info';

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

export type NavBadges = Record<string, { count: number; level: AlertLevel; title: string }>;

/** Sidebar badges: things waiting for an admin, per section. */
export function navBadges(a: AdminAlerts): NavBadges {
  const out: NavBadges = {};
  if (a.followUpsDue > 0) {
    out['/follow-ups'] = { count: a.followUpsDue, level: 'warning', title: `${fmtNumber(a.followUpsDue)} relance(s) prévue(s) aujourd'hui ou en retard` };
  }
  if (a.payoutsPending > 0) {
    out['/referrals'] = { count: a.payoutsPending, level: 'critical', title: `${fmtNumber(a.payoutsPending)} demande(s) de retrait en attente (${fmtMAD(a.payoutsPendingAmount)})` };
  }
  if (a.dealsReported > 0) {
    out['/deals'] = { count: a.dealsReported, level: 'warning', title: `${fmtNumber(a.dealsReported)} bon(s) plan(s) en ligne signalé(s)` };
  }
  if (a.notifSuccessRate24h !== null && a.notifSuccessRate24h < 80) {
    out['/notifications'] = { count: 1, level: 'critical', title: `Seulement ${a.notifSuccessRate24h} % des notifications délivrées sur 24 h` };
  }
  return out;
}
