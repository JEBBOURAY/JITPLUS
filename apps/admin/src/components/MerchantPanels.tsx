import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@jitplus/shared';
import {
  addFollowUpNote, deleteFollowUpNote, getMerchantFollowUp, getMerchantPayments, setPremiumGrant, updateMerchantFollowUp, voidPayment,
} from '../api';
import type { FollowUp, FollowUpKind, FollowUpNote, FollowUpStatus, MerchantDetail, PremiumGrant, SubscriptionPayment } from '../types';
import { Card, Empty } from './charts';
import { PaymentModal, Segmented } from './crm';
import ConfirmModal from './ConfirmModal';
import { Muted } from './ui';
import { C, S } from '../theme';
import { fmtDate, fmtDateTime, fmtMAD, fmtRelative } from '../utils/format';
import {
  FOLLOW_UP_ORDER, FOLLOW_UP_STATUS, GRANT_LABEL, NOTE_KIND, NOTE_KIND_ORDER, PAYMENT_METHOD, dateInput, dateInputToIso, fmtDue,
} from '../utils/crm';

type Toast = (msg: string, tone?: 'ok' | 'error') => void;

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Follow-up: status, next action, contact log ───────────────────────────────

export function FollowUpPanel({ merchantId, toast }: { merchantId: string; toast: Toast }) {
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [notes, setNotes] = useState<FollowUpNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<FollowUpKind>('CALL');
  const [body, setBody] = useState('');
  const [next, setNext] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getMerchantFollowUp(merchantId);
      setFollowUp(r.followUp);
      setNotes(r.notes);
      setNext(isoToDateInput(r.followUp?.nextActionAt));
      setNextAction(r.followUp?.nextAction ?? '');
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoaded(true);
    }
  }, [merchantId]);

  useEffect(() => { load(); }, [load]);

  const patch = async (input: { status?: FollowUpStatus; nextActionAt?: string; nextAction?: string }, msg: string) => {
    try {
      const f = await updateMerchantFollowUp(merchantId, input);
      setFollowUp(f);
      setNext(isoToDateInput(f.nextActionAt));
      setNextAction(f.nextAction ?? '');
      toast(msg);
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    }
  };

  const addNote = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await addFollowUpNote(merchantId, { kind, body: body.trim(), nextActionAt: next ? dateInputToIso(next) : '', nextAction: nextAction.trim() });
      setBody('');
      toast('Contact enregistré');
      await load();
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async (id: string) => {
    try {
      await deleteFollowUpNote(id);
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    }
  };

  const due = fmtDue(followUp?.nextActionAt);
  const nextChanged = (followUp ? isoToDateInput(followUp.nextActionAt) : '') !== next || (followUp?.nextAction ?? '') !== nextAction;

  return (
    <Card title="Suivi commercial" right={followUp && <span style={{ fontSize: 12, color: due.color }}>{due.text}</span>}>
      {error ? <p style={{ color: C.red, margin: 0 }}>{error}</p> : !loaded ? <Muted>Chargement…</Muted> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 14 }}>
            <label>
              <span style={S.label}>Statut</span>
              <select
                value={followUp?.status ?? ''}
                onChange={(e) => e.target.value && patch({ status: e.target.value as FollowUpStatus }, 'Statut mis à jour')}
                style={{ ...S.input, color: followUp ? FOLLOW_UP_STATUS[followUp.status].color : C.textMuted, fontWeight: 500 }}
              >
                {!followUp && <option value="">Non suivi · choisir un statut pour l'ajouter</option>}
                {FOLLOW_UP_ORDER.map((s) => <option key={s} value={s}>{FOLLOW_UP_STATUS[s].label}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
              <label>
                <span style={S.label}>Prochaine relance</span>
                <input type="date" value={next} onChange={(e) => setNext(e.target.value)} style={S.input} />
              </label>
              <label>
                <span style={S.label}>Action prévue</span>
                <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} maxLength={200} placeholder="Ex. : rappeler pour l'offre annuelle" style={S.input} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[['Demain', 1], ['+3 j', 3], ['+1 sem.', 7]].map(([l, d]) => (
                <button key={l} type="button" onClick={() => setNext(dateInput(d as number))} style={{ ...S.btnOutline(C.textMuted), padding: '2px 8px', fontSize: 12 }}>{l}</button>
              ))}
              {nextChanged && (
                <button
                  onClick={() => patch({ nextActionAt: next ? dateInputToIso(next) : '', nextAction: nextAction.trim() }, 'Relance planifiée')}
                  style={{ ...S.btn(), padding: '3px 10px', fontSize: 12, marginLeft: 'auto' }}
                >
                  Enregistrer la relance
                </button>
              )}
            </div>
            {followUp?.owner && <span style={{ fontSize: 12, color: C.textMuted }}>Suivi par {followUp.owner}</span>}
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <Segmented options={NOTE_KIND_ORDER.map((k) => ({ value: k, label: NOTE_KIND[k].label }))} value={kind} onChange={setKind} />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Ce qui a été dit, ce qu'il demande…"
              style={{ ...S.input, resize: 'vertical', marginTop: 8 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
              <span style={{ fontSize: 11.5, color: C.textMuted }}>La relance ci-dessus est enregistrée avec la note.</span>
              <button onClick={addNote} disabled={saving || !body.trim()} style={{ ...S.btn(), opacity: saving || !body.trim() ? 0.5 : 1 }}>
                {saving ? '…' : 'Ajouter'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            {notes.length === 0 ? <Empty>Aucun contact enregistré.</Empty> : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {notes.map((n) => (
                  <li key={n.id} style={{ padding: '9px 0', borderTop: `1px solid ${C.borderLight}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: C.textMuted }}>
                      <span><b style={{ color: C.text, fontWeight: 500 }}>{NOTE_KIND[n.kind].label}</b> · {n.adminEmail?.split('@')[0] ?? 'admin'}</span>
                      <span title={fmtDateTime(n.createdAt)} style={{ display: 'inline-flex', gap: 8 }}>
                        {fmtRelative(n.createdAt)}
                        <button onClick={() => removeNote(n.id)} title="Supprimer (auteur uniquement)" style={{ ...S.btnGhost(), padding: 0, fontSize: 12 }}>×</button>
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Billing: paid or offered, and the payments received ──────────────────────

export function BillingPanel({ merchant, toast, onChanged }: { merchant: MerchantDetail; toast: Toast; onChanged: () => void }) {
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [totals, setTotals] = useState<{ count: number; amount: number; lastPaidAt: string | null } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [editGrant, setEditGrant] = useState(false);
  const [grant, setGrant] = useState<PremiumGrant>(merchant.premiumGrant ?? 'PAID');
  const [note, setNote] = useState(merchant.premiumGrantNote ?? '');

  const load = useCallback(async () => {
    try {
      const r = await getMerchantPayments(merchant.id);
      setPayments(r.payments);
      setTotals(r.totals);
    } catch { /* panel stays empty */ }
  }, [merchant.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setGrant(merchant.premiumGrant ?? 'PAID'); setNote(merchant.premiumGrantNote ?? ''); }, [merchant.premiumGrant, merchant.premiumGrantNote]);

  const adminPremium = merchant.plan === 'PREMIUM' && merchant.planActivatedByAdmin;

  const saveGrant = async () => {
    try {
      await setPremiumGrant(merchant.id, grant, note.trim() || undefined);
      setEditGrant(false);
      toast('Type de Premium enregistré');
      onChanged();
    } catch (e) {
      toast(getErrorMessage(e), 'error');
    }
  };

  return (
    <Card
      title="Facturation"
      right={<button onClick={() => setPayOpen(true)} style={{ ...S.btnOutline(), padding: '3px 10px', fontSize: 12 }}>+ Paiement</button>}
    >
      {adminPremium && (
        <div style={{ marginBottom: 14 }}>
          {!editGrant ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <span style={{ fontSize: 12, color: C.textMuted }}>Premium </span>
                {merchant.premiumGrant
                  ? <b style={{ fontWeight: 500, color: merchant.premiumGrant === 'PAID' ? C.green : C.primary }}>{GRANT_LABEL[merchant.premiumGrant].toLowerCase()}</b>
                  : <b style={{ fontWeight: 500, color: C.amber }}>non renseigné</b>}
                {merchant.premiumGrantNote && <div style={{ fontSize: 12, color: C.textMuted }}>{merchant.premiumGrantNote}</div>}
              </div>
              <button onClick={() => setEditGrant(true)} style={{ ...S.btnGhost(C.primary), fontSize: 12 }}>Modifier</button>
            </div>
          ) : (
            <div>
              <Segmented options={[{ value: 'PAID', label: 'Payant' }, { value: 'OFFERED', label: 'Offert' }]} value={grant} onChange={setGrant} />
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={grant === 'OFFERED' ? 'Pourquoi c\'est offert' : 'Note (facultatif)'} style={{ ...S.input, marginTop: 8 }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setEditGrant(false)} style={{ ...S.btnOutline(), padding: '3px 10px', fontSize: 12 }}>Annuler</button>
                <button onClick={saveGrant} style={{ ...S.btn(), padding: '3px 10px', fontSize: 12 }}>Enregistrer</button>
              </div>
            </div>
          )}
        </div>
      )}

      {totals && totals.count > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
          <span style={{ color: C.textMuted }}>{totals.count} paiement(s)</span>
          <b className="num" style={{ fontWeight: 500 }}>{fmtMAD(totals.amount)}</b>
        </div>
      )}
      {payments.length === 0 ? <Empty>Aucun paiement enregistré.</Empty> : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {payments.map((p) => (
            <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: `1px solid ${C.borderLight}`, fontSize: 12.5, opacity: p.voidedAt ? 0.55 : 1 }}>
              <div>
                <span className="num" style={{ textDecoration: p.voidedAt ? 'line-through' : 'none' }}>{fmtMAD(p.amount)}</span>
                <Muted> · {PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ''}</Muted>
                {p.periodEnd && <div style={{ fontSize: 11.5, color: C.textMuted }}>couvre jusqu'au {fmtDate(p.periodEnd)}</div>}
                {p.voidedAt && <div style={{ fontSize: 11.5, color: C.red }}>Annulé : {p.voidReason}</div>}
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div>{fmtDate(p.paidAt)}</div>
                {!p.voidedAt && <button onClick={() => setVoiding(p.id)} style={{ ...S.btnGhost(), padding: 0, fontSize: 11.5 }}>Annuler</button>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <PaymentModal
        open={payOpen}
        merchant={merchant}
        defaultEnd={merchant.planExpiresAt}
        onClose={() => setPayOpen(false)}
        onDone={(msg) => { toast(msg); load(); }}
      />
      <ConfirmModal
        open={!!voiding}
        title="Annuler ce paiement"
        message="Il reste dans l'historique, barré, et ne compte plus dans les revenus."
        confirmLabel="Annuler le paiement"
        requireReason
        onCancel={() => setVoiding(null)}
        onConfirm={async (reason) => {
          try { await voidPayment(voiding!, reason ?? ''); toast('Paiement annulé'); load(); } catch (e) { toast(getErrorMessage(e), 'error'); } finally { setVoiding(null); }
        }}
      />
    </Card>
  );
}
