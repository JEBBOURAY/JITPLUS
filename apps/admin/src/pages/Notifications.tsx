import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getNotifications } from '../api';
import { NotificationRow, Pagination } from '../types';
import { C, S } from '../theme';
import { fmtDateTime, tableHeaderStyle, tableCellStyle } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';
import { useDebouncedSearch } from '../utils/useDebouncedSearch';

const CHANNELS = [
  { value: '', label: 'Tous' },
  { value: 'PUSH', label: 'Push' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
];

const CHANNEL_BADGE: Record<string, { color: string; label: string }> = {
  PUSH: { color: C.primary, label: 'Push' },
  WHATSAPP: { color: '#25D366', label: 'WhatsApp' },
  EMAIL: { color: '#EA4335', label: 'Email' },
};


export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState('');
  const [search, setSearch, debouncedSearch] = useDebouncedSearch(() => setPage(1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setError('');
    setLoading(true);
    try {
      const r = await getNotifications(page, 20, channel || undefined, debouncedSearch || undefined);
      setNotifications(r.notifications);
      setPagination(r.pagination);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [page, channel, debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ paddingBottom: 48 }}>
      <h2 style={{ margin: '0 0 4px', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 22, color: C.text }}>Notifications</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: C.textMuted }}>
        Suivi de toutes les notifications envoyées par les commerçants
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Channel filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {CHANNELS.map((ch) => (
            <button
              key={ch.value}
              onClick={() => { setChannel(ch.value); setPage(1); }}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'inherit',
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${channel === ch.value ? C.primary : C.border}`,
                background: channel === ch.value ? C.primary : 'transparent',
                color: channel === ch.value ? '#fff' : C.textMuted,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: C.border }} />

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par titre, contenu ou commercant..."
          style={{
            ...S.input,
            flex: 1,
            minWidth: 200,
          }}
        />
      </div>

      {error && <p style={{ color: C.red }}>{error}</p>}

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.surfaceHover, textAlign: 'left' }}>
              <th style={th}>Commerçant</th>
              <th style={th}>Canal</th>
              <th style={th}>Titre</th>
              <th style={th}>Contenu</th>
              <th style={{ ...th, textAlign: 'center' }}>Destinataires</th>
              <th style={{ ...th, textAlign: 'center' }}>Succès</th>
              <th style={{ ...th, textAlign: 'center' }}>Échecs</th>
              <th style={th}>Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: C.textMuted, padding: 40 }}>Chargement…</td></tr>
            ) : notifications.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: C.textMuted, padding: 40 }}>Aucune notification trouvée</td></tr>
            ) : (
              notifications.map((n) => {
                const badge = CHANNEL_BADGE[n.channel ?? ''] ?? { color: C.textMuted, label: n.channel ?? 'N/A' };
                return (
                  <tr key={n.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={td}>
                      {n.merchant ? (
                        <>
                          <div style={{ fontWeight: 600, color: C.text }}>{n.merchant.nom}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{n.merchant.email}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600, color: C.primary }}>Admin JitPlus</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>
                            {n.audience === 'ALL_MERCHANTS' ? 'Tous les commerçants' : n.audience === 'ALL_CLIENTS' ? 'Tous les clients' : 'Broadcast admin'}
                          </div>
                        </>
                      )}
                    </td>
                    <td style={td}>
                      <span style={S.badge(badge.color)}>{badge.label}</span>
                    </td>
                    <td style={{ ...td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title}
                    </td>
                    <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.textMuted }}>
                      {n.body}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: C.cyan }}>{n.recipientCount}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: C.green }}>{n.successCount}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: n.failureCount > 0 ? C.red : C.textMuted }}>{n.failureCount}</td>
                    <td style={{ ...td, fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtDateTime(n.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{ ...S.btn(C.surfaceHover), padding: '6px 12px', fontSize: 12, opacity: page <= 1 ? 0.4 : 1, border: `1px solid ${C.border}` }}
          >
            ← Précédent
          </button>
          <span style={{ fontSize: 12, color: C.textMuted }}>
            Page {pagination.page} / {pagination.totalPages} — {pagination.total} résultats
          </span>
          <button
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{ ...S.btn(C.surfaceHover), padding: '6px 12px', fontSize: 12, opacity: page >= pagination.totalPages ? 0.4 : 1, border: `1px solid ${C.border}` }}
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}

const th = tableHeaderStyle;
const td = tableCellStyle;
