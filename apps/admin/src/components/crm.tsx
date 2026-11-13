import React, { useEffect, useState } from 'react';
import { getErrorMessage } from '@jitplus/shared';
import { activatePremium, addFollowUpNote, recordMerchantPayment } from '../api';
import type { FollowUpKind, FollowUpStatus, PlanKind, PremiumGrant, SubscriptionPaymentMethod } from '../types';
import { Link } from 'react-router-dom';
import { C, S } from '../theme';
import { CATEGORY_LABELS } from '../utils/format';
import {
  FOLLOW_UP_ORDER, FOLLOW_UP_STATUS, NOTE_KIND, NOTE_KIND_ORDER, PAYMENT_METHOD, PLAN_KIND,
  dateInput, dateInputToIso, daysUntil, waLink,
} from '../utils/crm';

// ── Merchant cell (name link + category · city · phone) ──────────────────────

export function MerchantCell({ m }: { m: { id: string; nom: string; categorie: string; ville?: string | null; phone?: string | null } }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Link to={`/merchants/${m.id}`} onClick={(e) => e.stopPropagation()} style={{ color: C.text, fontWeight: 500, textDecoration: 'none' }}>{m.nom}</Link>
      <div style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>
        {[CATEGORY_LABELS[m.categorie] ?? m.categorie, m.ville, m.phone].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

function Modal({ open, title, subtitle, onClose, children, footer, width = 480 }: {
  open: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '8vh 16px 16px', overflowY: 'auto' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: width }}
      >
        <div style={{ padding: '16px 20px 0' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: C.textMuted }}>{subtitle}</p>}
        </div>
        <div style={{ padding: '16px 20px' }}>{children}</div>
        {footer && (
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: C.surfaceHover, borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={S.label}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

/** Row of mutually exclusive buttons. */
export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexWrap: 'wrap' }}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            padding: '5px 11px',
            fontSize: 12.5,
            fontFamily: 'inherit',
            border: 'none',
            borderLeft: i ? `1px solid ${C.border}` : 'none',
            background: value === o.value ? C.ink : C.surface,
            color: value === o.value ? C.onInk : C.text,
            cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────

export function PlanKindBadge({ kind, expiresAt, deleted, banned }: { kind: PlanKind; expiresAt?: string | null; deleted?: boolean; banned?: boolean }) {
  if (deleted) return <span style={S.badge(C.textMuted)}>Supprimé</span>;
  if (banned) return <span style={S.badge(C.red)}>Banni</span>;
  const k = PLAN_KIND[kind];
  const left = kind !== 'FREE' && expiresAt ? daysUntil(expiresAt) : null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} title={k.hint}>
      <span style={S.badge(k.color)}>{k.label}</span>
      {left !== null && (
        <span className="num" style={{ fontSize: 11.5, color: left <= 7 ? C.red : C.textMuted }}>{left > 0 ? `J-${left}` : 'expiré'}</span>
      )}
    </span>
  );
}

export function FollowUpBadge({ status }: { status: FollowUpStatus | null | undefined }) {
  if (!status) return <span style={{ fontSize: 12, color: C.textMuted }}>Non suivi</span>;
  const s = FOLLOW_UP_STATUS[status];
  return (
    <span title={s.hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ── Contact buttons ──────────────────────────────────────────────────────────

const iconPaths = {
  phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.49a1 1 0 01-.5 1.21l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.49 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8a9.86 9.86 0 01-4.26-.95L3 20l1.4-3.72A7.96 7.96 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z',
  mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  note: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.41-9.41a2 2 0 112.83 2.83L11.83 15H9v-2.83l8.59-8.58z',
};

function Icon({ name, size = 15 }: { name: keyof typeof iconPaths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={iconPaths[name]} />
    </svg>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-sm)',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.textMuted,
  cursor: 'pointer',
  textDecoration: 'none',
  padding: 0,
  flexShrink: 0,
};

/** Call / WhatsApp (with a ready message) / email / log-a-note buttons. Clicks never bubble to the row. */
export function ContactButtons({ phone, email, waText, onNote }: { phone?: string | null; email?: string | null; waText?: string; onNote?: () => void }) {
  const wa = waLink(phone, waText);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <span style={{ display: 'inline-flex', gap: 4 }} onClick={stop}>
      {phone && <a className="icon-btn" href={`tel:${phone}`} title={`Appeler ${phone}`} style={iconBtn}><Icon name="phone" /></a>}
      {wa && <a className="icon-btn" href={wa} target="_blank" rel="noreferrer" title="WhatsApp (message pré-rempli)" style={{ ...iconBtn, color: C.whatsapp }}><Icon name="chat" /></a>}
      {email && <a className="icon-btn" href={`mailto:${email}`} title={email} style={iconBtn}><Icon name="mail" /></a>}
      {onNote && <button className="icon-btn" type="button" onClick={onNote} title="Noter un contact / planifier une relance" style={iconBtn}><Icon name="note" /></button>}
    </span>
  );
}

// ── Quick note (log a contact + plan the next one) ────────────────────────────

export function QuickNoteModal({ merchant, open, onClose, onSaved, defaultKind = 'CALL', currentStatus }: {
  merchant: { id: string; nom: string } | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultKind?: FollowUpKind;
  currentStatus?: FollowUpStatus | null;
}) {
  const [kind, setKind] = useState<FollowUpKind>(defaultKind);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<FollowUpStatus | ''>('');
  const [next, setNext] = useState(dateInput(3));
  const [nextAction, setNextAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setKind(defaultKind); setBody(''); setStatus(''); setNext(dateInput(3)); setNextAction(''); setError(''); }
  }, [open, defaultKind]);

  const save = async () => {
    if (!merchant || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      await addFollowUpNote(merchant.id, {
        kind,
        body: body.trim(),
        ...(status ? { status } : {}),
        nextActionAt: next ? dateInputToIso(next) : '',
        nextAction: nextAction.trim(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open && !!merchant}
      onClose={onClose}
      title={`Suivi · ${merchant?.nom ?? ''}`}
      subtitle="Ce qui s'est passé, et la prochaine relance."
      footer={
        <>
          <button onClick={onClose} style={S.btnOutline()}>Annuler</button>
          <button onClick={save} disabled={saving || !body.trim()} style={{ ...S.btn(), opacity: saving || !body.trim() ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <Field label="Type de contact">
        <Segmented options={NOTE_KIND_ORDER.map((k) => ({ value: k, label: NOTE_KIND[k].label }))} value={kind} onChange={setKind} />
      </Field>
      <Field label="Compte rendu">
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Ex. : joint au téléphone, veut tester la roue avant de payer. Rappeler jeudi."
          style={{ ...S.input, resize: 'vertical' }}
        />
      </Field>
      <Field label="Nouveau statut" hint={currentStatus ? `Actuel : ${FOLLOW_UP_STATUS[currentStatus].label}` : 'Un appel, WhatsApp, email ou visite passe le statut à « Contacté » s\'il était « À contacter ».'}>
        <select value={status} onChange={(e) => setStatus(e.target.value as FollowUpStatus | '')} style={S.input}>
          <option value="">Ne pas changer</option>
          {FOLLOW_UP_ORDER.map((s) => <option key={s} value={s}>{FOLLOW_UP_STATUS[s].label}</option>)}
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
        <Field label="Prochaine relance">
          <input type="date" value={next} onChange={(e) => setNext(e.target.value)} style={S.input} />
        </Field>
        <Field label="Action prévue">
          <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} maxLength={200} placeholder="Ex. : proposer l'abonnement annuel" style={S.input} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: -4, flexWrap: 'wrap' }}>
        {[['Demain', 1], ['+3 j', 3], ['+1 sem.', 7], ['+1 mois', 30]].map(([l, d]) => (
          <button key={l} type="button" onClick={() => setNext(dateInput(d as number))} style={{ ...S.btnOutline(C.textMuted), padding: '3px 8px', fontSize: 12 }}>{l}</button>
        ))}
        <button type="button" onClick={() => setNext('')} style={{ ...S.btnGhost(), padding: '3px 8px', fontSize: 12 }}>Aucune</button>
      </div>
      {error && <p style={{ color: C.red, fontSize: 12.5, margin: '12px 0 0' }}>{error}</p>}
    </Modal>
  );
}

// ── Payment form (shared by activation and "record a payment") ───────────────

interface PaymentForm {
  amount: string;
  method: SubscriptionPaymentMethod;
  paidAt: string;
  reference: string;
  note: string;
}

const emptyPayment = (): PaymentForm => ({ amount: '', method: 'CASH', paidAt: dateInput(0), reference: '', note: '' });

function PaymentFields({ value, onChange }: { value: PaymentForm; onChange: (v: PaymentForm) => void }) {
  const set = (patch: Partial<PaymentForm>) => onChange({ ...value, ...patch });
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Montant reçu (MAD)">
          <input type="number" min="0" step="1" inputMode="decimal" value={value.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" style={S.input} />
        </Field>
        <Field label="Date de paiement">
          <input type="date" value={value.paidAt} max={dateInput(0)} onChange={(e) => set({ paidAt: e.target.value })} style={S.input} />
        </Field>
      </div>
      <Field label="Moyen de paiement">
        <Segmented options={(Object.keys(PAYMENT_METHOD) as SubscriptionPaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD[m] }))} value={value.method} onChange={(m) => set({ method: m })} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Référence (facultatif)">
          <input value={value.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={120} placeholder="N° de reçu, virement…" style={S.input} />
        </Field>
        <Field label="Note (facultatif)">
          <input value={value.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} style={S.input} />
        </Field>
      </div>
    </>
  );
}

function paymentPayload(f: PaymentForm, periodEnd?: string) {
  return {
    amount: Number(f.amount),
    method: f.method,
    paidAt: f.paidAt ? dateInputToIso(f.paidAt) : undefined,
    reference: f.reference.trim() || undefined,
    note: f.note.trim() || undefined,
    ...(periodEnd ? { periodStart: new Date().toISOString(), periodEnd } : {}),
  };
}

export function PaymentModal({ merchant, open, onClose, onDone, defaultEnd }: {
  merchant: { id: string; nom: string } | null;
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  /** Current plan end, shown as the period covered */
  defaultEnd?: string | null;
}) {
  const [form, setForm] = useState<PaymentForm>(emptyPayment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setForm(emptyPayment()); setError(''); } }, [open]);
  const valid = Number(form.amount) > 0;

  const save = async () => {
    if (!merchant || !valid) return;
    setSaving(true);
    setError('');
    try {
      await recordMerchantPayment(merchant.id, paymentPayload(form, defaultEnd && new Date(defaultEnd) > new Date() ? defaultEnd : undefined));
      onDone('Paiement enregistré');
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open && !!merchant}
      onClose={onClose}
      title="Enregistrer un paiement"
      subtitle={`${merchant?.nom ?? ''} · argent effectivement reçu pour l'abonnement`}
      footer={
        <>
          <button onClick={onClose} style={S.btnOutline()}>Annuler</button>
          <button onClick={save} disabled={saving || !valid} style={{ ...S.btn(), opacity: saving || !valid ? 0.5 : 1 }}>{saving ? '…' : 'Enregistrer'}</button>
        </>
      }
    >
      <PaymentFields value={form} onChange={setForm} />
      {error && <p style={{ color: C.red, fontSize: 12.5, margin: 0 }}>{error}</p>}
    </Modal>
  );
}

// ── Activate PREMIUM: paid or offered, how long, payment received ────────────

const DURATIONS: { value: string; label: string; months: number | null }[] = [
  { value: '1', label: '1 mois', months: 1 },
  { value: '3', label: '3 mois', months: 3 },
  { value: '6', label: '6 mois', months: 6 },
  { value: '12', label: '1 an', months: 12 },
  { value: 'none', label: 'Sans fin', months: null },
  { value: 'date', label: 'Date…', months: null },
];

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export function ActivatePremiumModal({ merchant, open, onClose, onDone }: {
  merchant: { id: string; nom: string } | null;
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [grant, setGrant] = useState<PremiumGrant>('PAID');
  const [duration, setDuration] = useState('1');
  const [customEnd, setCustomEnd] = useState(dateInput(30));
  const [grantNote, setGrantNote] = useState('');
  const [withPayment, setWithPayment] = useState(true);
  const [payment, setPayment] = useState<PaymentForm>(emptyPayment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setGrant('PAID'); setDuration('1'); setCustomEnd(dateInput(30)); setGrantNote('');
      setWithPayment(true); setPayment(emptyPayment()); setError('');
    }
  }, [open]);

  const d = DURATIONS.find((x) => x.value === duration)!;
  const endDate = duration === 'date' ? (customEnd ? new Date(`${customEnd}T23:59:00`).toISOString() : undefined) : d.months ? addMonths(d.months) : undefined;
  const paymentOk = grant !== 'PAID' || !withPayment || Number(payment.amount) > 0;
  const noteOk = grant !== 'OFFERED' || grantNote.trim().length >= 3;
  const canSave = paymentOk && noteOk && (duration !== 'date' || !!customEnd);

  const save = async () => {
    if (!merchant || !canSave) return;
    setSaving(true);
    setError('');
    try {
      await activatePremium(merchant.id, {
        grant,
        grantNote: grantNote.trim() || undefined,
        endDate,
        payment: grant === 'PAID' && withPayment ? paymentPayload(payment) : undefined,
      });
      onDone(grant === 'PAID' ? 'Premium payant activé' : 'Premium offert activé');
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open && !!merchant}
      onClose={onClose}
      width={520}
      title="Activer Premium"
      subtitle={merchant?.nom}
      footer={
        <>
          <button onClick={onClose} style={S.btnOutline()}>Annuler</button>
          <button onClick={save} disabled={saving || !canSave} style={{ ...S.btn(), opacity: saving || !canSave ? 0.5 : 1 }}>{saving ? '…' : 'Activer'}</button>
        </>
      }
    >
      <Field label="Type">
        <Segmented options={[{ value: 'PAID', label: 'Payant' }, { value: 'OFFERED', label: 'Offert (gratuit)' }]} value={grant} onChange={setGrant} />
      </Field>
      <Field label="Durée" hint={endDate ? `Fin le ${new Date(endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Reste Premium jusqu\'à révocation manuelle.'}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Segmented options={DURATIONS.map((x) => ({ value: x.value, label: x.label }))} value={duration} onChange={setDuration} />
          {duration === 'date' && <input type="date" min={dateInput(1)} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...S.input, width: 150 }} />}
        </div>
      </Field>
      <Field label={grant === 'OFFERED' ? 'Pourquoi c\'est offert (obligatoire)' : 'Note (facultatif)'}>
        <input
          value={grantNote}
          onChange={(e) => setGrantNote(e.target.value)}
          maxLength={300}
          placeholder={grant === 'OFFERED' ? 'Ex. : partenaire de lancement, compte de démo, geste commercial' : 'Ex. : offre annuelle -20 %'}
          style={S.input}
        />
      </Field>
      {grant === 'OFFERED' && (
        <p style={{ margin: '0 0 4px', fontSize: 12, color: C.textMuted }}>
          Un Premium offert ne déclenche pas les récompenses de parrainage (elles sont réservées aux commerçants qui paient).
        </p>
      )}
      {grant === 'PAID' && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={withPayment} onChange={(e) => setWithPayment(e.target.checked)} />
            Enregistrer le paiement reçu maintenant
          </label>
          {withPayment && <PaymentFields value={payment} onChange={setPayment} />}
        </div>
      )}
      {error && <p style={{ color: C.red, fontSize: 12.5, margin: 0 }}>{error}</p>}
    </Modal>
  );
}
