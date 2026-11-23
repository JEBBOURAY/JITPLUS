import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { moroccoCityLabel, type DealOffer } from '@jitplus/shared/src/deals';
import { getAdminDeals, getDealReports, removeDeal, restoreDeal } from '../api';
import type { AdminDealDisplayStatus, AdminDealFilter, AdminDealModeration, AdminDealRow, Pagination as PaginationInfo } from '../types';
import { C, S } from '../theme';
import { fmtDateTime, fmtDateShort, fmtNumber, tableCellStyle, tableHeaderStyle } from '../utils/format';
import { useDebouncedInput, useUrlFilters } from '../utils/useUrlFilters';
import { FilterBar, PageHeader, Pagination, PillGroup, SearchInput, useToast, type Option } from '../components/ui';
import ConfirmModal from '../components/ConfirmModal';

const FILTERS: Option<AdminDealFilter>[] = [
  { value: 'reported', label: 'Signalés', hint: 'Au moins un signalement, les plus signalés en premier' },
  { value: 'live', label: 'En cours' },
  { value: 'removed', label: 'Retirés' },
  { value: 'all', label: 'Tous' },
];

const STATUS: Record<AdminDealDisplayStatus, { label: string; color: string }> = {
  LIVE: { label: 'En cours', color: C.green },
  SCHEDULED: { label: 'Programmé', color: C.blue },
  ENDED: { label: 'Terminé', color: C.textMuted },
  REMOVED: { label: 'Retiré', color: C.red },
};

const REPORT_REASONS: Record<string, string> = {
  INAPPROPRIATE: 'Inapproprié',
  MISLEADING: 'Trompeur',
  OFF_TOPIC: 'Hors sujet',
  EXPIRED: 'Plus valable',
  OTHER: 'Autre',
};

const ENDED_REASONS: Record<string, string> = {
  EXPIRED: 'Date de fin atteinte',
  STOPPED: 'Arrêté par le commerçant',
  AUTO_REPORTS: 'Masqué automatiquement (signalements)',
};

const PAGE_SIZE = 20;

/** Links are validated server-side; this only guards the href against anything but https. */
function safeHttps(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** "-30 % · 120 → 84", enough to compare two versions of an offer. */
function offerSummary(o: DealOffer): string {
  const parts = [
    o.percentOff != null ? `-${o.percentOff} %` : null,
    o.buyQty != null && o.freeQty != null ? `${o.buyQty} + ${o.freeQty} offert` : null,
    o.originalPrice != null ? (o.dealPrice != null ? `${fmtNumber(o.originalPrice)} → ${fmtNumber(o.dealPrice)}` : fmtNumber(o.originalPrice)) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : o.type;
}

function where(d: AdminDealRow): string {
  if (d.scope === 'ONLINE') return 'En ligne';
  const cities = d.cityKeys.map((k) => moroccoCityLabel(k) || k);
  return cities.length ? cities.join(', ') : 'Ville inconnue';
}

export default function Deals() {
  const { filters, page, update } = useUrlFilters<{ filter: AdminDealFilter; search: string }>({ filter: 'reported', search: '' });
  const [search, setSearch] = useDebouncedInput(filters.search, (v) => update({ ...filters, search: v }));
  const [rows, setRows] = useState<AdminDealRow[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [moderation, setModeration] = useState<Record<string, AdminDealModeration | 'loading' | 'error'>>({});
  const [confirm, setConfirm] = useState<{ deal: AdminDealRow; action: 'remove' | 'restore' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAdminDeals({ filter: filters.filter, search: filters.search || undefined, page, limit: PAGE_SIZE });
      setRows(res.deals);
      setPagination(res.pagination);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filters.filter, filters.search, page]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (d: AdminDealRow) => {
    const next = expanded === d.id ? null : d.id;
    setExpanded(next);
    // Loaded even without a report: the offer may have been edited.
    if (!next || typeof moderation[d.id] === 'object') return;
    setModeration((m) => ({ ...m, [d.id]: 'loading' }));
    try {
      const res = await getDealReports(d.id);
      setModeration((m) => ({ ...m, [d.id]: res }));
    } catch {
      setModeration((m) => ({ ...m, [d.id]: 'error' }));
    }
  };

  const runConfirm = async (reason?: string) => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'remove') {
        await removeDeal(confirm.deal.id, reason ?? '');
        showToast('Bon plan retiré. Le commerçant a été prévenu.');
      } else {
        await restoreDeal(confirm.deal.id);
        showToast('Bon plan rétabli, ses signalements ont été effacés.');
        setModeration((m) => {
          const { [confirm.deal.id]: _, ...rest } = m;
          return rest;
        });
      }
      setConfirm(null);
      await load();
    } catch (e) {
      showToast(getErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {toast}
      <PageHeader
        title="Bons plans"
        count={pagination?.total}
        subtitle="Modération a posteriori : un bon plan signalé 5 fois est masqué automatiquement en attendant votre décision."
      />

      <FilterBar>
        <PillGroup options={FILTERS} value={filters.filter} onChange={(v) => update({ ...filters, filter: v })} />
        <SearchInput value={search} onChange={setSearch} placeholder="Titre ou commerçant…" />
      </FilterBar>

      <div style={S.card}>
        {loading ? (
          <p style={{ color: C.textMuted }}>Chargement…</p>
        ) : error ? (
          <p style={{ color: C.red }}>{error}</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left' }}>
                {['Bon plan', 'Commerçant', 'Où', 'Période', 'Statut', 'Vues', 'Signal.', ''].map((h) => (
                  <th key={h} style={tableHeaderStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const status = STATUS[d.displayStatus];
                const autoHidden = d.status === 'REMOVED' && d.endedReason === 'AUTO_REPORTS';
                return (
                  <React.Fragment key={d.id}>
                    <tr
                      style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer', background: expanded === d.id ? C.surfaceHover : 'transparent' }}
                      onClick={() => void toggle(d)}
                    >
                      <td style={{ ...tableCellStyle, maxWidth: 280 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {d.imageUrl ? (
                            <img src={d.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 40, height: 40, borderRadius: 8, background: C.primaryAlpha, flexShrink: 0 }} />
                          )}
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                        </div>
                      </td>
                      <td style={tableCellStyle}>
                        <Link to={`/merchants/${d.merchant.id}`} onClick={(e) => e.stopPropagation()} style={{ color: C.primary, textDecoration: 'none' }}>
                          {d.merchant.nom}
                        </Link>
                      </td>
                      <td style={{ ...tableCellStyle, color: C.textMuted }}>{where(d)}</td>
                      <td style={{ ...tableCellStyle, color: C.textMuted, whiteSpace: 'nowrap' }}>
                        {fmtDateShort(d.startsAt)} → {fmtDateShort(d.endsAt)}
                      </td>
                      <td style={tableCellStyle}>
                        <span style={S.badge(status.color)}>{autoHidden ? 'Masqué (auto)' : status.label}</span>
                      </td>
                      <td style={tableCellStyle}>{fmtNumber(d.viewCount)}</td>
                      <td style={{ ...tableCellStyle, color: d.reportCount > 0 ? C.red : C.textMuted, fontWeight: d.reportCount > 0 ? 700 : 400 }}>
                        {d.reportCount}
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {d.status === 'REMOVED' ? (
                          <button onClick={(e) => { e.stopPropagation(); setConfirm({ deal: d, action: 'restore' }); }} style={{ ...S.btnOutline(C.green), padding: '5px 12px', fontSize: 12 }}>
                            Rétablir
                          </button>
                        ) : null}
                        {d.status !== 'REMOVED' || autoHidden ? (
                          <button onClick={(e) => { e.stopPropagation(); setConfirm({ deal: d, action: 'remove' }); }} style={{ ...S.btnOutline(C.red), padding: '5px 12px', fontSize: 12, marginLeft: 6 }}>
                            Retirer
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === d.id && <DealDetails deal={d} moderation={moderation[d.id]} />}
                  </React.Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>
                    {filters.filter === 'reported' ? 'Aucun bon plan signalé.' : 'Aucun bon plan trouvé.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={(p) => update({ ...filters, page: p })} />
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.action === 'restore' ? 'Rétablir ce bon plan ?' : 'Retirer ce bon plan ?'}
        message={
          confirm?.action === 'restore'
            ? `« ${confirm.deal.title} » redevient visible s'il n'est pas terminé. Ses signalements seront effacés.`
            : `« ${confirm?.deal.title ?? ''} » ne sera plus visible. Le motif est envoyé au commerçant et enregistré dans le journal.`
        }
        confirmLabel={confirm?.action === 'restore' ? 'Rétablir' : 'Retirer'}
        confirmColor={confirm?.action === 'restore' ? C.green : C.red}
        requireReason={confirm?.action === 'remove'}
        loading={busy}
        onConfirm={(reason) => void runConfirm(reason)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function DealDetails({ deal, moderation }: { deal: AdminDealRow; moderation: AdminDealModeration | 'loading' | 'error' | undefined }) {
  const link = safeHttps(deal.linkUrl);
  const ended = deal.endedReason ? ENDED_REASONS[deal.endedReason] ?? `Motif : ${deal.endedReason}` : null;
  return (
    <tr>
      <td colSpan={8} style={{ padding: '12px 16px 18px', background: C.bg }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, fontSize: 13 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deal.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{deal.description}</p>}
            {deal.conditions && <p style={{ margin: 0, color: C.textMuted }}>Conditions : {deal.conditions}</p>}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer nofollow" style={{ color: C.primary, wordBreak: 'break-all' }}>
                {link}
              </a>
            )}
            <span style={{ color: C.textMuted }}>
              Créé le {fmtDateTime(deal.createdAt)} · {fmtNumber(deal.linkClickCount)} clic(s) sur le lien · {fmtNumber(deal.claimCount)} utilisation(s) · {deal.merchant.email}
            </span>
            {ended && <span style={{ color: deal.status === 'REMOVED' ? C.red : C.textMuted }}>{ended}</span>}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Signalements</div>
            {moderation === 'loading' || moderation === undefined ? (
              <span style={{ color: C.textMuted }}>Chargement…</span>
            ) : moderation === 'error' ? (
              <span style={{ color: C.red }}>Impossible de charger les signalements.</span>
            ) : moderation.reports.length === 0 ? (
              <span style={{ color: C.textMuted }}>Aucun signalement.</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {moderation.reports.map((r) => (
                  <li key={r.id}>
                    <strong>{REPORT_REASONS[r.reason] ?? r.reason}</strong>
                    <span style={{ color: C.textMuted }}>
                      {' '}· {fmtDateTime(r.createdAt)}
                      {r.client ? ` · ${[r.client.prenom, r.client.nom].filter(Boolean).join(' ') || 'Client'}` : ''}
                    </span>
                    {r.comment && <div style={{ whiteSpace: 'pre-wrap' }}>{r.comment}</div>}
                  </li>
                ))}
              </ul>
            )}
            {typeof moderation === 'object' && moderation.offerChanges.length > 0 && (
              <>
                <div style={{ fontWeight: 600, margin: '14px 0 8px' }}>Offre modifiée après publication</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {moderation.offerChanges.map((c) => (
                    <li key={c.id}>
                      {offerSummary(c.before)} <span style={{ color: C.textMuted }}>devient</span> <strong>{offerSummary(c.after)}</strong>
                      <span style={{ color: C.textMuted }}> · {fmtDateTime(c.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
