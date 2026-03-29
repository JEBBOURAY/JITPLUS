import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getMerchantDetail,
  getMerchantSubscriptionHistory,
  activatePremium,
  revokePremium,
  banMerchant,
  unbanMerchant,
  deleteMerchant,
  setPlanDates,
} from '../api';
import { MerchantDetail, SubscriptionHistoryEvent } from '../types';
import PlanBadge from '../components/PlanBadge';
import { C, S } from '../theme';
import { fmtDateTime } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

interface ActionBtnProps {
  label: string;
  color?: string;
  outline?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ActionBtn({ label, color = C.primary, outline, disabled, onClick }: ActionBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...(outline ? S.btnOutline(color) : S.btn(color)),
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [dateForm, setDateForm] = useState({ startDate: '', endDate: '' });
  const [savingDates, setSavingDates] = useState(false);
  const [history, setHistory] = useState<SubscriptionHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  // Confirmation modal state for destructive actions
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    requireReason?: boolean;
    requireTyping?: string; // user must type this to confirm
    onConfirm: (reason?: string) => Promise<unknown>;
  } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmTyping, setConfirmTyping] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const m = await getMerchantDetail(id);
      setMerchant(m);
      setDateForm({
        startDate: m.trialStartedAt ? m.trialStartedAt.slice(0, 10) : '',
        endDate: m.planExpiresAt ? m.planExpiresAt.slice(0, 10) : '',
      });

      try {
        const h = await getMerchantSubscriptionHistory(id);
        setHistory(h.events);
      } catch (e) {
        setHistoryError(getErrorMessage(e));
      } finally {
        setHistoryLoading(false);
      }
    } catch (e) {
      setError(getErrorMessage(e));
      setHistoryLoading(false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handle = async (fn: () => Promise<unknown>, label: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setActionLoading(true);
    try {
      await fn();
      showToast(`✅ ${label}`);
      load();
    } catch (e) {
      showToast(`❌ ${getErrorMessage(e)}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithModal = async (onConfirm: (reason?: string) => Promise<unknown>, label: string) => {
    setActionLoading(true);
    try {
      await onConfirm();
      showToast(`✅ ${label}`);
      load();
    } catch (e) {
      showToast(`❌ ${getErrorMessage(e)}`);
    } finally {
      setActionLoading(false);
      setConfirmModal(null);
      setConfirmReason('');
      setConfirmTyping('');
    }
  };

  if (loading) return <p style={{ color: C.textMuted }}>Chargement…</p>;
  if (error) return <p style={{ color: C.red }}>{error}</p>;
  if (!merchant) return null;

  const isPremium = merchant.plan === 'PREMIUM';
  const isTrial = isPremium && !merchant.planActivatedByAdmin && !!merchant.planExpiresAt;

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '12px 20px',
            color: C.text,
            fontSize: 13,
            zIndex: 999,
            boxShadow: '0 8px 30px #0009',
          }}
        >
          {toast}
        </div>
      )}

      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ ...S.btnOutline(), marginBottom: 20 }}>
        ← Retour
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>
            {merchant.nom}
          </h2>
          <span style={{ color: C.textMuted, fontSize: 13 }}>{merchant.email}</span>
        </div>
        <PlanBadge plan={merchant.plan} isTrial={isTrial} isActive={merchant.isActive} />
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {[
          ['Catégorie', merchant.categorie],
          ['Ville', merchant.ville ?? '—'],
          ['Téléphone', merchant.phoneNumber ?? '—'],
          ['Inscrit le', fmtDateTime(merchant.createdAt)],
          ['Clients', merchant.clientCount],
          ['Boutiques', merchant.storeCount],
          ['Transactions', merchant.transactionCount],
          ['Notifications envoyées', merchant.notificationCount],
          ['Vues du profil', merchant.profileViews],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ ...S.card, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              {label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{String(value)}</div>
          </div>
        ))}
      </div>

      {/* Plan detail */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Détails du plan</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, marginBottom: 16 }}>
          <Row label="Plan actuel" value={merchant.plan} />
          <Row label="Activé par admin" value={merchant.planActivatedByAdmin ? 'Oui' : 'Non'} />
          <Row
            label="Expiration"
            value={merchant.planExpiresAt ? fmtDateTime(merchant.planExpiresAt) : 'Aucune'}
          />
          <Row
            label="Essai démarré"
            value={merchant.trialStartedAt ? fmtDateTime(merchant.trialStartedAt) : '—'}
          />
        </div>

        {/* Manual date editor */}
        <div style={{ borderTop: `1px solid `, paddingTop: 14 }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Modifier les dates manuellement
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Date de début</span>
              <input
                type="date"
                value={dateForm.startDate}
                onChange={(e) => setDateForm((f) => ({ ...f, startDate: e.target.value }))}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  padding: '7px 10px',
                  fontSize: 13,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Date de fin (expiration)</span>
              <input
                type="date"
                value={dateForm.endDate}
                onChange={(e) => setDateForm((f) => ({ ...f, endDate: e.target.value }))}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  padding: '7px 10px',
                  fontSize: 13,
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          </div>
          <button
            disabled={savingDates || (!dateForm.startDate && !dateForm.endDate)}
            onClick={async () => {
              setSavingDates(true);
              try {
                await setPlanDates(
                  merchant.id,
                  dateForm.startDate || undefined,
                  dateForm.endDate || undefined,
                );
                showToast('✅ Dates mises à jour !');
                load();
              } catch (e) {
                showToast(`❌ ${getErrorMessage(e)}`);
              } finally {
                setSavingDates(false);
              }
            }}
            style={{ ...S.btn(C.primary), opacity: savingDates ? 0.5 : 1 }}
          >
            {savingDates ? '…' : '💾 Enregistrer les dates'}
          </button>
        </div>
      </div>

      {/* Subscription history */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>Historique d'abonnement</h3>

        {historyLoading ? (
          <p style={{ margin: 0, color: C.textMuted, fontSize: 13 }}>Chargement de l'historique…</p>
        ) : historyError ? (
          <p style={{ margin: 0, color: C.red, fontSize: 13 }}>{historyError}</p>
        ) : history.length === 0 ? (
          <p style={{ margin: 0, color: C.textMuted, fontSize: 13 }}>Aucun événement d'abonnement trouvé.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((event) => (
              <div
                key={event.id}
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderLeft: `4px solid ${historyEventColor(event.action)}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{historyEventLabel(event.action)}</span>
                  <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtDateTime(event.createdAt)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>{event.summary}</p>
                {event.adminEmail && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: C.textMuted }}>Par: {event.adminEmail}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ ...S.card }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Actions</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!isPremium || isTrial ? (
            <ActionBtn
              label="✨ Activer Premium"
              color={C.primary}
              disabled={actionLoading}
              onClick={() =>
                handle(() => activatePremium(merchant.id), 'Premium activé !')
              }
            />
          ) : merchant.planActivatedByAdmin ? (
            <ActionBtn
              label="⬇ Révoquer Premium"
              color={C.amber}
              outline
              disabled={actionLoading}
              onClick={() =>
                handle(
                  () => revokePremium(merchant.id),
                  'Premium révoqué.',
                  'Révoquer le plan Premium de ce commerçant ?',
                )
              }
            />
          ) : null}

          {merchant.isActive ? (
            <ActionBtn
              label="🚫 Bannir"
              color={C.red}
              outline
              disabled={actionLoading}
              onClick={() =>
                setConfirmModal({
                  title: 'Bannir ce commerçant',
                  message: `Vous allez bannir "${merchant.nom}". Une raison est obligatoire.`,
                  requireReason: true,
                  onConfirm: (reason) => banMerchant(merchant.id, reason),
                })
              }
            />
          ) : (
            <ActionBtn
              label="✅ Débannir"
              color={C.green}
              disabled={actionLoading}
              onClick={() =>
                handle(() => unbanMerchant(merchant.id), 'Commerçant débanni.')
              }
            />
          )}

          <ActionBtn
            label="🗑 Supprimer définitivement"
            color={C.red}
            disabled={actionLoading}
            onClick={() =>
              setConfirmModal({
                title: 'Suppression irréversible',
                message: `Pour confirmer la suppression de "${merchant.nom}" et toutes ses données, tapez SUPPRIMER ci-dessous.`,
                requireTyping: 'SUPPRIMER',
                onConfirm: () => deleteMerchant(merchant.id).then(() => navigate('/merchants')),
              })
            }
          />
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ ...S.card, width: 420, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 12px', color: C.red }}>{confirmModal.title}</h3>
            <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 16 }}>{confirmModal.message}</p>

            {confirmModal.requireReason && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                  Raison (obligatoire)
                </label>
                <textarea
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13,
                    boxSizing: 'border-box', resize: 'vertical',
                  }}
                />
              </div>
            )}

            {confirmModal.requireTyping && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
                  Tapez « {confirmModal.requireTyping} » pour confirmer
                </label>
                <input
                  value={confirmTyping}
                  onChange={(e) => setConfirmTyping(e.target.value)}
                  style={{
                    width: '100%', background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setConfirmModal(null); setConfirmReason(''); setConfirmTyping(''); }}
                style={{ ...S.btnOutline(C.textMuted), padding: '8px 16px' }}
              >
                Annuler
              </button>
              <button
                disabled={
                  actionLoading ||
                  !!(confirmModal.requireReason && confirmReason.trim().length < 3) ||
                  !!(confirmModal.requireTyping && confirmTyping !== confirmModal.requireTyping)
                }
                onClick={() =>
                  handleWithModal(
                    () => confirmModal.onConfirm(confirmReason.trim() || undefined),
                    confirmModal.title,
                  )
                }
                style={{
                  ...S.btn(C.red), padding: '8px 16px',
                  opacity: actionLoading ? 0.5 : 1,
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid `, paddingBottom: 5 }}>
      <span style={{ color: C.textMuted }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function historyEventLabel(action: string) {
  switch (action) {
    case 'ACCOUNT_CREATED':
      return 'Création du compte';
    case 'ACTIVATE_PREMIUM':
      return 'Premium activé';
    case 'REVOKE_PREMIUM':
      return 'Premium révoqué';
    case 'UPDATE_PLAN_DURATION':
      return 'Dates modifiées';
    case 'CURRENT_STATE':
      return 'État actuel';
    default:
      return action;
  }
}

function historyEventColor(action: string) {
  switch (action) {
    case 'ACCOUNT_CREATED':
      return C.blue;
    case 'ACTIVATE_PREMIUM':
      return C.green;
    case 'REVOKE_PREMIUM':
      return C.red;
    case 'UPDATE_PLAN_DURATION':
      return C.amber;
    case 'CURRENT_STATE':
      return C.cyan;
    default:
      return C.textMuted;
  }
}
