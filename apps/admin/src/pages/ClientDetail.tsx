import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { activateClient, deactivateClient, deleteClient, getClientActivity, getClientDetail } from '../api';
import type { ClientActivity, ClientDetail } from '../types';
import ConfirmModal from '../components/ConfirmModal';
import StatCard from '../components/StatCard';
import { Card, DataTable, Empty, Grid, MiniStat } from '../components/charts';
import { CheckItem, Dash, KeyValue, LastActivity, Muted, Progress, useToast } from '../components/ui';
import { C, S } from '../theme';
import {
  CATEGORY_LABELS, TX_TYPE_COLOR, TX_TYPE_LABELS, daysSince, fmtDate, fmtDateTime, fmtMAD, fmtNumber, fmtRelative,
} from '../utils/format';

type LoyaltyCard = ClientActivity['cards'][number];

interface Signal {
  tone: string;
  text: string;
}

function buildSignals(c: ClientDetail, a: ClientActivity, readyCards: LoyaltyCard[]): Signal[] {
  const out: Signal[] = [];
  const t = a.transactions;
  if (c.deletedAt) out.push({ tone: C.red, text: 'Compte désactivé : le client ne peut plus se connecter à JitPlus.' });
  if (a.isAnonymous) out.push({ tone: C.amber, text: 'Client ajouté en caisse par un commerçant : il n\'a pas encore installé l\'app JitPlus.' });
  if (t.total === 0 && daysSince(c.createdAt) >= 7) {
    out.push({ tone: C.amber, text: `Inscrit il y a ${daysSince(c.createdAt)} jours sans aucun passage en caisse.` });
  } else if (t.lastAt && daysSince(t.lastAt) > 30) {
    out.push({ tone: C.amber, text: `Inactif : dernier passage ${fmtRelative(t.lastAt).toLowerCase()}.` });
  }
  if (readyCards.length > 0) {
    out.push({ tone: C.green, text: `Récompense disponible chez ${readyCards.map((r) => r.merchant.nom).join(', ')} : pas encore échangée.` });
  }
  if (!a.pushReachable && !a.isAnonymous && !c.deletedAt) {
    out.push({ tone: C.blue, text: 'Injoignable par push (notifications désactivées ou jamais autorisées).' });
  }
  if (a.blocks.length > 0) out.push({ tone: C.blue, text: `A bloqué ${a.blocks.length} commerçant(s).` });
  if (t.cancelled >= 3 && t.cancelled / Math.max(1, t.total + t.cancelled) >= 0.2) {
    out.push({ tone: C.amber, text: `${t.cancelled} transactions annulées sur ${t.total + t.cancelled} : à vérifier.` });
  }
  return out;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [activity, setActivity] = useState<ClientActivity | null>(null);
  const [activityError, setActivityError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [modal, setModal] = useState<'deactivate' | 'activate' | 'delete' | null>(null);
  const [toastNode, showToast] = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [c, a] = await Promise.allSettled([getClientDetail(id), getClientActivity(id)]);
      if (c.status === 'rejected') throw c.reason;
      setClient(c.value);
      if (a.status === 'fulfilled') { setActivity(a.value); setActivityError(''); } else setActivityError(getErrorMessage(a.reason));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, label: string, after?: () => void) => {
    setActionLoading(true);
    try {
      await fn();
      showToast(label);
      if (after) after();
      else await load();
    } catch (e) {
      showToast(getErrorMessage(e), 'error');
    } finally {
      setActionLoading(false);
      setModal(null);
    }
  };

  if (loading) return <p style={{ color: C.textMuted }}>Chargement…</p>;
  if (error) return <p style={{ color: C.red }}>{error}</p>;
  if (!client) return null;

  const a = activity;
  const anonymised = !!client.email?.startsWith('deleted_');
  const deactivated = !!client.deletedAt && !anonymised;
  const fullName = [client.prenom, client.nom].filter(Boolean).join(' ') || (anonymised ? 'Client supprimé' : 'Client sans nom');
  const activeCards = a ? a.cards.filter((c) => !c.deactivatedAt) : [];
  const readyCards = activeCards.filter((c) => c.stampsForReward > 0 && c.stamps >= c.stampsForReward);
  const signals = a ? buildSignals(client, a, readyCards) : [];
  const waNumber = client.telephone?.replace(/[^\d]/g, '');

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
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{fullName}</h2>
            {anonymised && <span style={S.badge(C.textMuted)}>Supprimé</span>}
            {deactivated && <span style={S.badge(C.red)}>Désactivé</span>}
            {a?.isAnonymous && <span style={S.badge(C.amber)}>Ajout rapide</span>}
            {a && !client.deletedAt && (
              <span style={S.badge(a.pushReachable ? C.green : C.textMuted)}>{a.pushReachable ? 'Joignable push' : 'Push off'}</span>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: C.textMuted, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={S.badge(C.blue)}>{client.countryCode}</span>
            <span>Inscrit le {fmtDate(client.createdAt)}</span>
            {a && <span>Dernier passage : <LastActivity date={a.transactions.lastAt} /></span>}
            {a && <span>App en {a.language.toUpperCase()}</span>}
          </div>
        </div>
        {!anonymised && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {client.email && <a href={`mailto:${client.email}`} style={{ ...S.btnOutline(C.cyan), textDecoration: 'none' }}>Email</a>}
            {client.telephone && <a href={`tel:${client.telephone}`} style={{ ...S.btnOutline(C.green), textDecoration: 'none' }}>Appeler</a>}
            {waNumber && <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" style={{ ...S.btnOutline('#25D366'), textDecoration: 'none' }}>WhatsApp</a>}
          </div>
        )}
      </div>

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
        <Grid min={170} style={{ marginBottom: 16 }}>
          <StatCard label="Cartes actives" value={fmtNumber(activeCards.length)} sub={`${fmtNumber(a.transactions.merchantsVisited)} commerces visités`} color={C.primary} />
          <StatCard label="Passages" value={fmtNumber(a.transactions.earn)} sub={`${fmtNumber(a.transactions.last30)} transactions sur 30 j`} color={C.cyan} />
          <StatCard label="Tampons gagnés" value={fmtNumber(a.transactions.stampsEarned)} sub={`${fmtNumber(readyCards.length)} récompense(s) prête(s)`} color={C.green} />
          <StatCard label="Récompenses échangées" value={fmtNumber(a.transactions.redeem)} color={C.amber} />
          <StatCard label="Montant dépensé" value={fmtMAD(a.transactions.amount)} sub="montants saisis en caisse" color={C.blue} />
          <StatCard
            label="Notifications lues"
            value={a.notifications.received ? `${a.notifications.readRate}%` : '—'}
            sub={`${fmtNumber(a.notifications.read)} / ${fmtNumber(a.notifications.received)} reçues`}
            color={C.primary}
            hint="Part des notifications de la boîte de réception ouvertes par le client"
          />
        </Grid>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {a && (
            <>
              <Card title={`Cartes de fidélité (${a.cards.length})`}>
                {a.cards.length === 0 ? (
                  <Empty>Aucune carte de fidélité.</Empty>
                ) : (
                  <DataTable
                    rows={a.cards}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => navigate(`/merchants/${r.merchant.id}`)}
                    columns={[
                      { header: 'Commerçant', render: (r) => <b>{r.merchant.nom}</b> },
                      { header: 'Catégorie', render: (r) => <Muted>{CATEGORY_LABELS[r.merchant.categorie] ?? r.merchant.categorie}</Muted> },
                      {
                        header: 'Tampons',
                        render: (r) => (
                          <Progress
                            value={r.stamps}
                            max={r.stampsForReward}
                            color={r.stampsForReward > 0 && r.stamps >= r.stampsForReward ? C.green : C.primary}
                            label={`${r.stamps}/${r.stampsForReward}`}
                          />
                        ),
                      },
                      { header: 'Passages', align: 'right', render: (r) => fmtNumber(r.visits) },
                      { header: 'Dernière visite', render: (r) => <LastActivity date={r.lastVisitAt} /> },
                      {
                        header: 'Statut',
                        render: (r) => (r.deactivatedAt ? <span style={S.badge(C.red)}>Désactivée</span> : <span style={S.badge(C.green)}>Active</span>),
                      },
                    ]}
                  />
                )}
              </Card>

              <Card title="Dernières transactions">
                <DataTable
                  rows={a.recentTransactions}
                  rowKey={(r) => r.id}
                  onRowClick={(r) => navigate(`/merchants/${r.merchant.id}`)}
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
                    { header: 'Commerçant', render: (r) => r.merchant.nom },
                    { header: 'Détail', render: (r) => <Muted>{r.reward ?? (r.stamps ? `${r.stamps > 0 ? '+' : ''}${r.stamps} tampon(s)` : '')}{r.amount ? ` · ${fmtMAD(r.amount)}` : ''}</Muted> },
                  ]}
                />
              </Card>

              <Card title="Jeux et coupons">
                <Grid min={140}>
                  <MiniStat label="Cartes à gratter" value={`${fmtNumber(a.games.scratchScratched)} / ${fmtNumber(a.games.scratchTotal)}`} hint="Grattées / reçues" />
                  <MiniStat label="Coupons gagnés" value={fmtNumber(a.games.couponsTotal)} />
                  <MiniStat label="Coupons utilisés" value={fmtNumber(a.games.couponsRedeemed)} color={C.green} />
                  <MiniStat label="Coupons en cours" value={fmtNumber(a.games.couponsActive)} color={C.amber} />
                  <MiniStat label="Tickets roue" value={fmtNumber(a.games.wheelTickets)} />
                </Grid>
              </Card>
            </>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Profil">
            <KeyValue label="Email" value={anonymised || !client.email ? <Dash /> : client.email} color={client.emailVerified ? C.green : undefined} />
            <KeyValue label="Email vérifié" value={client.emailVerified ? 'Oui' : 'Non'} />
            <KeyValue label="Téléphone" value={client.telephone ?? <Dash />} color={client.telephoneVerified ? C.green : undefined} />
            <KeyValue label="Téléphone vérifié" value={client.telephoneVerified ? 'Oui' : 'Non'} />
            <KeyValue label="Date de naissance" value={client.dateNaissance ? fmtDate(client.dateNaissance) : <Dash />} />
            <KeyValue label="1er passage" value={a?.transactions.firstAt ? fmtDate(a.transactions.firstAt) : <Dash />} />
            <KeyValue label="Transactions annulées" value={a ? fmtNumber(a.transactions.cancelled) : <Dash />} />
            <KeyValue label="Dernière mise à jour" value={fmtDateTime(client.updatedAt)} />
            {client.deletedAt && <KeyValue label={anonymised ? 'Supprimé le' : 'Désactivé le'} value={fmtDateTime(client.deletedAt)} color={C.red} />}
            <KeyValue label="ID" value={<span style={{ fontSize: 11, fontFamily: 'monospace' }}>{client.id}</span>} />
          </Card>

          <Card title="Préférences">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <CheckItem done={client.notifPush} label="Notifications push" />
              <CheckItem done={client.notifEmail} label="Notifications email" />
              <CheckItem done={client.notifWhatsapp} label="Notifications WhatsApp" />
              <CheckItem done={client.shareInfoMerchants} label="Partage des infos avec les commerçants" />
              <CheckItem done={client.termsAccepted} label="CGU acceptées" />
            </div>
          </Card>

          {a && (
            <Card title="Notifications reçues">
              <KeyValue label="Dans la boîte de réception" value={fmtNumber(a.notifications.received)} />
              <KeyValue label="Ouvertes" value={fmtNumber(a.notifications.read)} />
              <div style={{ marginTop: 10 }}>
                <Progress value={a.notifications.read} max={a.notifications.received} color={C.cyan} label={`${a.notifications.readRate}% lues`} />
              </div>
            </Card>
          )}

          <Card title="Parrainage">
            <KeyValue label="Code" value={client.referralCode ?? <Dash />} color={C.cyan} />
            <KeyValue label="Solde" value={`${fmtNumber(client.referralBalance)} pts`} color={C.green} />
            {a && <KeyValue label="Commerçants parrainés" value={fmtNumber(a.referrals)} />}
          </Card>

          {a && a.blocks.length > 0 && (
            <Card title={`Commerçants bloqués (${a.blocks.length})`}>
              {a.blocks.map((b) => (
                <KeyValue
                  key={b.merchantId}
                  label={b.nom}
                  value={<span style={{ color: C.textMuted, fontWeight: 400 }}>{fmtDate(b.createdAt)}</span>}
                />
              ))}
            </Card>
          )}

          {!anonymised && (
            <Card title="Actions">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {deactivated ? (
                  <button disabled={actionLoading} onClick={() => setModal('activate')} style={S.btn(C.green)}>Réactiver le compte</button>
                ) : (
                  <button disabled={actionLoading} onClick={() => setModal('deactivate')} style={S.btn(C.amber)}>Désactiver le compte</button>
                )}
                <button disabled={actionLoading} onClick={() => setModal('delete')} style={S.btn(C.red)}>Supprimer définitivement</button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmModal
        open={modal === 'deactivate'}
        title="Désactiver ce client ?"
        message={`Le compte de ${fullName} sera désactivé. Le client ne pourra plus se connecter à l'application JitPlus.`}
        confirmLabel="Désactiver"
        confirmColor={C.amber}
        loading={actionLoading}
        onConfirm={() => run(() => deactivateClient(client.id), 'Client désactivé')}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === 'activate'}
        title="Réactiver ce client ?"
        message={`Le compte de ${fullName} sera réactivé. Le client pourra de nouveau se connecter.`}
        confirmLabel="Réactiver"
        confirmColor={C.green}
        loading={actionLoading}
        onConfirm={() => run(() => activateClient(client.id), 'Client réactivé')}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === 'delete'}
        title="Supprimer définitivement ce client ?"
        message={`Cette action est IRRÉVERSIBLE. Toutes les données personnelles de ${fullName} seront anonymisées.`}
        confirmLabel="Supprimer"
        confirmColor={C.red}
        requireText="SUPPRIMER"
        loading={actionLoading}
        onConfirm={() => run(() => deleteClient(client.id), 'Client supprimé', () => navigate('/clients'))}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
