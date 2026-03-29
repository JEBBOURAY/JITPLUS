import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClientDetail, deactivateClient, activateClient, deleteClient } from '../api';
import { ClientDetail as ClientDetailType } from '../types';
import { C, S } from '../theme';
import { fmtDate, fmtDateTime } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

// ── Confirmation modal ─────────────────────────────────────────────────────────
function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  confirmColor,
  requireText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const canConfirm = requireText ? typed === requireText : true;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#000a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{ ...S.card, maxWidth: 420, width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 12px', color: C.text, fontSize: 16 }}>{title}</h3>
        <p style={{ margin: '0 0 16px', color: C.textMuted, fontSize: 13, lineHeight: 1.5 }}>{message}</p>
        {requireText && (
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Tapez « ${requireText} » pour confirmer`}
            style={{
              width: '100%', padding: '8px 12px', marginBottom: 16,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={S.btnOutline()}>Annuler</button>
          <button
            onClick={() => { onConfirm(); setTyped(''); }}
            disabled={!canConfirm}
            style={{ ...S.btn(confirmColor), opacity: canConfirm ? 1 : 0.4 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Info row ───────────────────────────────────────────────────────────────────
function InfoRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ` }}>
      <span style={{ color: C.textMuted, fontSize: 13 }}>{label}</span>
      <span style={{ color: color ?? C.text, fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [modal, setModal] = useState<'deactivate' | 'activate' | 'delete' | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getClientDetail(id)
      .then(setClient)
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleAction = async (action: () => Promise<{ success: boolean }>, successMsg: string) => {
    setActionLoading(true);
    try {
      await action();
      showToast(successMsg);
      // Reload client data
      if (id) {
        const updated = await getClientDetail(id);
        setClient(updated);
      }
    } catch (e) {
      showToast(`❌ ${getErrorMessage(e)}`);
    } finally {
      setActionLoading(false);
      setModal(null);
    }
  };

  if (loading) return <p style={{ color: C.textMuted }}>Chargement…</p>;
  if (error) return <p style={{ color: C.red }}>{error}</p>;
  if (!client) return null;

  const isDeactivated = !!client.deletedAt;
  const fullName = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client anonyme';

  return (
    <div style={{ paddingBottom: 48 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '12px 20px', color: C.text, fontSize: 13, zIndex: 999,
          boxShadow: '0 4px 20px #0008',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/clients')} style={{ ...S.btnOutline(), padding: '6px 12px' }}>
            ← Retour
          </button>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 22, color: C.text }}>{fullName}</h2>
          {isDeactivated && <span style={S.badge(C.red)}>Désactivé</span>}
        </div>
      </div>

      {/* Content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Profile info */}
        <div style={S.card}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text }}>Profil</h3>
          <InfoRow label="ID" value={<span style={{ fontSize: 11, fontFamily: 'monospace' }}>{client.id}</span>} />
          <InfoRow label="Prénom" value={client.prenom ?? '—'} />
          <InfoRow label="Nom" value={client.nom ?? '—'} />
          <InfoRow label="Email" value={client.email ?? '—'} color={client.emailVerified ? C.green : C.textMuted} />
          <InfoRow label="Email vérifié" value={client.emailVerified ? '✅ Oui' : '❌ Non'} />
          <InfoRow label="Téléphone" value={client.telephone ?? '—'} color={client.telephoneVerified ? C.green : C.textMuted} />
          <InfoRow label="Tél. vérifié" value={client.telephoneVerified ? '✅ Oui' : '❌ Non'} />
          <InfoRow label="Pays" value={<span style={S.badge(C.blue)}>{client.countryCode}</span>} />
          <InfoRow label="Date de naissance" value={client.dateNaissance ? fmtDate(client.dateNaissance) : '—'} />
          <InfoRow label="Inscrit le" value={fmtDateTime(client.createdAt)} />
          <InfoRow label="Dernière MAJ" value={fmtDateTime(client.updatedAt)} />
          {client.deletedAt && <InfoRow label="Désactivé le" value={fmtDateTime(client.deletedAt)} color={C.red} />}
        </div>

        {/* Stats & Preferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stats */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text }}>Statistiques</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.primary }}>{client.merchantCount}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Commerçants</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.cyan }}>{client.transactionCount}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Transactions</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.amber }}>{client.notificationCount}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>Notifications</p>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text }}>Préférences</h3>
            <InfoRow label="Notif. Push" value={client.notifPush ? '✅ Activé' : '❌ Désactivé'} />
            <InfoRow label="Notif. Email" value={client.notifEmail ? '✅ Activé' : '❌ Désactivé'} />
            <InfoRow label="Notif. WhatsApp" value={client.notifWhatsapp ? '✅ Activé' : '❌ Désactivé'} />
            <InfoRow label="Partage info" value={client.shareInfoMerchants ? '✅ Oui' : '❌ Non'} />
            <InfoRow label="CGU acceptées" value={client.termsAccepted ? '✅ Oui' : '❌ Non'} />
          </div>

          {/* Referral */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text }}>Parrainage</h3>
            <InfoRow label="Code parrain" value={client.referralCode ?? '—'} color={C.cyan} />
            <InfoRow label="Solde parrainage" value={`${client.referralBalance} pts`} color={C.green} />
          </div>
        </div>
      </div>

      {/* Loyalty Cards */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text }}>
          Cartes de fidélité ({client.loyaltyCards.length})
        </h3>
        {client.loyaltyCards.length === 0 ? (
          <p style={{ color: C.textMuted, fontSize: 13 }}>Aucune carte de fidélité.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Commerçant', 'Catégorie', 'Points', 'Statut', 'Créée le'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {client.loyaltyCards.map((card) => (
                <tr
                  key={card.id}
                  style={{ borderBottom: `1px solid `, cursor: 'pointer' }}
                  onClick={() => navigate(`/merchants/${card.merchant.id}`)}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = C.surfaceHover)}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 10px', fontWeight: 600, color: C.text }}>
                    {card.merchant.nom}
                  </td>
                  <td style={{ padding: '10px 10px', color: C.textMuted, textTransform: 'capitalize', fontSize: 12 }}>
                    {card.merchant.categorie.toLowerCase()}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontWeight: 700, color: C.primary }}>{card.points}</span>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    {card.deactivatedAt ? (
                      <span style={S.badge(C.red)}>Désactivée</span>
                    ) : (
                      <span style={S.badge(C.green)}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 10px', color: C.textMuted }}>{fmtDate(card.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Actions */}
      <div style={{ ...S.card }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text }}>Actions</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isDeactivated ? (
            <button
              disabled={actionLoading}
              onClick={() => setModal('activate')}
              style={S.btn(C.green)}
            >
              ✅ Réactiver le compte
            </button>
          ) : (
            <button
              disabled={actionLoading}
              onClick={() => setModal('deactivate')}
              style={S.btn(C.amber)}
            >
              ⛔ Désactiver le compte
            </button>
          )}
          <button
            disabled={actionLoading}
            onClick={() => setModal('delete')}
            style={S.btn(C.red)}
          >
            🗑️ Supprimer définitivement
          </button>
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal
        open={modal === 'deactivate'}
        title="Désactiver ce client ?"
        message={`Le compte de ${fullName} sera désactivé. Le client ne pourra plus se connecter à l'application JitPlus.`}
        confirmLabel="Désactiver"
        confirmColor={C.amber}
        onConfirm={() => handleAction(() => deactivateClient(client.id), '✅ Client désactivé')}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === 'activate'}
        title="Réactiver ce client ?"
        message={`Le compte de ${fullName} sera réactivé. Le client pourra de nouveau se connecter.`}
        confirmLabel="Réactiver"
        confirmColor={C.green}
        onConfirm={() => handleAction(() => activateClient(client.id), '✅ Client réactivé')}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === 'delete'}
        title="Supprimer définitivement ce client ?"
        message={`Cette action est IRRÉVERSIBLE. Toutes les données personnelles de ${fullName} seront anonymisées.`}
        confirmLabel="Supprimer"
        confirmColor={C.red}
        requireText="SUPPRIMER"
        onConfirm={() => handleAction(() => deleteClient(client.id).then(r => { navigate('/clients'); return r; }), '✅ Client supprimé')}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
