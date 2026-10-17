import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminAlerts } from '../types';
import { C, S } from '../theme';
import { fmtNumber, fmtTime } from '../utils/format';
import { buildAlerts, type AlertLevel } from '../utils/alerts';

const LEVEL_COLOR: Record<AlertLevel, string> = {
  critical: C.red,
  warning: C.amber,
  info: C.blue,
};

/** "À traiter" block on the dashboard: actionable alerts plus the last 24 h at a glance. */
export default function AlertsPanel({ alerts }: { alerts: AdminAlerts | null }) {
  const navigate = useNavigate();
  if (!alerts) return null;
  const items = buildAlerts(alerts);

  return (
    <div style={{ ...S.card, padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: items.length ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>À traiter</span>
          {items.length === 0 && <span style={{ fontSize: 13, color: C.green }}>Rien d'urgent pour le moment.</span>}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: C.textMuted, flexWrap: 'wrap' }}>
          <span>Dernières 24 h :</span>
          <span><b style={{ color: C.text }}>{fmtNumber(alerts.newMerchants24h)}</b> commerçant(s)</span>
          <span><b style={{ color: C.text }}>{fmtNumber(alerts.newClients24h)}</b> client(s)</span>
          <span><b style={{ color: C.text }}>{fmtNumber(alerts.transactions24h)}</b> transaction(s)</span>
          <span><b style={{ color: C.text }}>{fmtNumber(alerts.notifRecipients24h)}</b> notification(s)</span>
          <span title="Heure de calcul (cache 60 s)">· {fmtTime(alerts.generatedAt)}</span>
        </div>
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => (
            <div
              key={it.key}
              onClick={it.to ? () => navigate(it.to!) : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                borderLeft: `3px solid ${LEVEL_COLOR[it.level]}`,
                background: C.bg,
                fontSize: 13,
                cursor: it.to ? 'pointer' : 'default',
              }}
            >
              <span style={{ flex: 1 }}>{it.text}</span>
              {it.to && <span style={{ color: C.primary, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>Voir →</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
