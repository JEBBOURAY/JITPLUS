import React, { useEffect, useState, useCallback, useRef } from 'react';
import { C, S } from '../theme';
import {
  getUpgradeRequests,
  approveUpgradeRequest,
  rejectUpgradeRequest,
} from '../api';
import type { UpgradeRequestsResponse } from '../types';
import { fmtDate, fmtDateShort } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

const STATUS_COLORS: Record<string, string> = {
  PENDING: C.amber,
  APPROVED: C.green,
  REJECTED: C.red,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
};

type Filter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function UpgradeRequests() {
  const [data, setData] = useState<UpgradeRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{
    id: string;
    type: 'approve' | 'reject';
    merchantNom: string;
  } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getUpgradeRequests(
        filter === 'ALL' ? undefined : filter,
        page,
      );
      setData(result);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Erreur de chargement'));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [filter, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const openModal = (id: string, type: 'approve' | 'reject', merchantNom: string) => {
    setAdminNote('');
    setNoteModal({ id, type, merchantNom });
  };

  const handleConfirm = async () => {
    if (!noteModal) return;
    setActionLoading(noteModal.id);
    try {
      if (noteModal.type === 'approve') {
        await approveUpgradeRequest(noteModal.id, adminNote || undefined);
      } else {
        await rejectUpgradeRequest(noteModal.id, adminNote || undefined);
      }
      setNoteModal(null);
      await fetchData();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setActionLoading(null);
    }
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: C.text, margin: 0, fontSize: 22, fontWeight: 700 }}>
            Demandes Premium
          </h1>
          {data && (
            <p style={{ color: C.textMuted, margin: '4px 0 0', fontSize: 14 }}>
              {data.pending} en attente · {data.total} au total ({filter !== 'ALL' ? filter.toLowerCase() : 'tous filtres'})
            </p>
          )}
        </div>
        <button onClick={fetchData} disabled={loading} style={S.btnOutline(C.primary)}>
          ↻ Rafraîchir
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={
              filter === f
                ? S.btn(f === 'PENDING' ? C.amber : f === 'APPROVED' ? C.green : f === 'REJECTED' ? C.red : C.primary)
                : S.btnOutline(C.textMuted)
            }
          >
            {f === 'ALL' ? 'Toutes' : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: C.red, color: C.red, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Chargement…</div>
        ) : !data || data.requests.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>
            Aucune demande {filter !== 'ALL' ? STATUS_LABELS[filter].toLowerCase() : ''}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Commerçant', 'Plan actuel', 'Message', 'Demandé le', 'Statut', 'Note admin', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{ padding: '12px 16px', textAlign: 'left', color: C.textMuted, fontWeight: 600 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: `1px solid ${C.border}20` }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ color: C.text, fontWeight: 600 }}>{r.merchant.nom}</div>
                    <div style={{ color: C.textMuted, fontSize: 11 }}>{r.merchant.email}</div>
                    <div style={{ color: C.textMuted, fontSize: 11 }}>{r.merchant.categorie} · {r.merchant.ville ?? '—'}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={S.badge(r.merchant.plan === 'PREMIUM' ? C.cyan : C.textMuted)}>
                      {r.merchant.plan}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: C.textMuted, maxWidth: 200 }}>
                    {r.message ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: C.textMuted, whiteSpace: 'nowrap' }}>
                    {fmtDate(r.createdAt)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={S.badge(STATUS_COLORS[r.status] ?? C.textMuted)}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: C.textMuted, maxWidth: 160, fontSize: 12 }}>
                    {r.adminNote ?? <span style={{ fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {r.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          disabled={actionLoading === r.id}
                          onClick={() => openModal(r.id, 'approve', r.merchant.nom)}
                          style={S.btn(C.green)}
                        >
                          ✓ Activer
                        </button>
                        <button
                          disabled={actionLoading === r.id}
                          onClick={() => openModal(r.id, 'reject', r.merchant.nom)}
                          style={S.btn(C.red)}
                        >
                          ✗ Rejeter
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: C.textMuted, fontStyle: 'italic', fontSize: 12 }}>
                        {r.reviewedAt
                          ? fmtDateShort(r.reviewedAt)
                          : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={S.btnOutline(C.primary)}
          >
            ← Préc.
          </button>
          <span style={{ color: C.textMuted, padding: '8px 12px', fontSize: 13 }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={S.btnOutline(C.primary)}
          >
            Suiv. →
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {noteModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: '#000a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={(e) => e.target === e.currentTarget && setNoteModal(null)}
        >
          <div style={{ ...S.card, width: 420, maxWidth: '90vw' }}>
            <h2 style={{ color: C.text, margin: '0 0 8px', fontSize: 17 }}>
              {noteModal.type === 'approve' ? '✓ Activer le Premium' : '✗ Rejeter la demande'}
            </h2>
            <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 16px' }}>
              Commerçant : <strong style={{ color: C.text }}>{noteModal.merchantNom}</strong>
            </p>
            <label style={{ color: C.textMuted, fontSize: 13, display: 'block', marginBottom: 6 }}>
              Note pour le commerçant (optionnel)
            </label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder={
                noteModal.type === 'approve'
                  ? 'Ex : Premium activé suite à votre demande.'
                  : 'Ex : Dossier incomplet. Merci de nous recontacter.'
              }
              rows={3}
              style={{
                width: '100%',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                padding: '8px 12px',
                fontSize: 13,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setNoteModal(null)} style={S.btnOutline(C.textMuted)}>
                Annuler
              </button>
              <button
                disabled={!!actionLoading}
                onClick={handleConfirm}
                style={S.btn(noteModal.type === 'approve' ? C.green : C.red)}
              >
                {actionLoading ? '…' : noteModal.type === 'approve' ? 'Confirmer l\'activation' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
