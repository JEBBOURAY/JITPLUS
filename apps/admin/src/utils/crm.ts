import { C } from '../theme';
import type { FollowUpKind, FollowUpStatus, PlanKind, PremiumGrant, SubscriptionPaymentMethod } from '../types';

export const FOLLOW_UP_STATUS: Record<FollowUpStatus, { label: string; color: string; hint: string }> = {
  TO_CONTACT: { label: 'À contacter', color: C.amber, hint: 'Personne ne l\'a encore contacté' },
  CONTACTED: { label: 'Contacté', color: C.blue, hint: 'Premier contact fait, pas encore de réponse claire' },
  INTERESTED: { label: 'Intéressé', color: C.primary, hint: 'Intéressé par Premium ou par une aide' },
  ONBOARDING: { label: 'Accompagnement', color: C.cyan, hint: 'On l\'aide à démarrer (récompense, premiers scans)' },
  CONVERTED: { label: 'Converti', color: C.green, hint: 'Objectif atteint : abonné ou actif' },
  LOST: { label: 'Perdu', color: C.textMuted, hint: 'Pas intéressé ou injoignable' },
};

export const FOLLOW_UP_ORDER: FollowUpStatus[] = ['TO_CONTACT', 'CONTACTED', 'INTERESTED', 'ONBOARDING', 'CONVERTED', 'LOST'];

export const NOTE_KIND: Record<FollowUpKind, { label: string; verb: string }> = {
  CALL: { label: 'Appel', verb: 'a appelé' },
  WHATSAPP: { label: 'WhatsApp', verb: 'a écrit sur WhatsApp' },
  EMAIL: { label: 'Email', verb: 'a envoyé un email' },
  VISIT: { label: 'Visite', verb: 'a rendu visite' },
  NOTE: { label: 'Note', verb: 'a noté' },
};

export const NOTE_KIND_ORDER: FollowUpKind[] = ['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'NOTE'];

export const PAYMENT_METHOD: Record<SubscriptionPaymentMethod, string> = {
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement',
  CHEQUE: 'Chèque',
  CARD: 'Carte',
  OTHER: 'Autre',
};

export const GRANT_LABEL: Record<PremiumGrant, string> = { PAID: 'Payant', OFFERED: 'Offert' };

export const PLAN_KIND: Record<PlanKind, { label: string; color: string; hint: string }> = {
  FREE: { label: 'Free', color: C.textMuted, hint: 'Plan gratuit' },
  TRIAL: { label: 'Essai', color: C.cyan, hint: 'Essai Premium automatique' },
  PAID: { label: 'Payant', color: C.green, hint: 'Premium payé' },
  OFFERED: { label: 'Offert', color: C.primary, hint: 'Premium offert gratuitement' },
  ADMIN: { label: 'Premium', color: C.amber, hint: 'Activé par un admin, payé ou offert non renseigné' },
};

/** Effective plan from the merchant fields the API returns. */
export function planKindOf(m: { plan: string; planActivatedByAdmin?: boolean; planExpiresAt?: string | null; isTrial?: boolean; premiumGrant?: PremiumGrant | null }): PlanKind {
  if (m.plan !== 'PREMIUM') return 'FREE';
  const trial = m.isTrial ?? (!m.planActivatedByAdmin && !!m.planExpiresAt);
  if (trial) return 'TRIAL';
  if (m.premiumGrant === 'PAID') return 'PAID';
  if (m.premiumGrant === 'OFFERED') return 'OFFERED';
  return 'ADMIN';
}

/** Whole days until `iso` (negative when past). */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Phone number for wa.me: digits only, Moroccan 06/07 numbers prefixed with 212. */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `212${d.slice(1)}`;
  d = d.replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}

export function waLink(phone: string | null | undefined, text?: string): string | null {
  const n = waNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Ready-to-send WhatsApp openers, per situation. */
export const WA_TEMPLATES = {
  trial: (nom: string, days: number) =>
    `Bonjour ${nom}, c'est l'équipe JitPlus. Votre essai Premium se termine dans ${days} jour${days > 1 ? 's' : ''}. On peut en parler 5 minutes pour voir si l'abonnement vous convient ?`,
  renewal: (nom: string, days: number) =>
    `Bonjour ${nom}, c'est l'équipe JitPlus. Votre abonnement Premium arrive à échéance dans ${days} jour${days > 1 ? 's' : ''}. Souhaitez-vous le renouveler ?`,
  stuck: (nom: string) =>
    `Bonjour ${nom}, c'est l'équipe JitPlus. On a vu que vous n'avez pas encore tamponné de carte client. Voulez-vous qu'on vous aide à configurer votre récompense et faire vos premiers scans ?`,
  dormant: (nom: string) =>
    `Bonjour ${nom}, c'est l'équipe JitPlus. On n'a pas vu de passage client sur votre compte depuis quelques semaines. Tout se passe bien ? On peut vous aider à relancer vos clients.`,
  generic: (nom: string) => `Bonjour ${nom}, c'est l'équipe JitPlus.`,
};

/** yyyy-mm-dd for <input type="date">, `days` from today (local). */
export function dateInput(days = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** yyyy-mm-dd → ISO at 09:00 local, so "due today" means this morning. */
export function dateInputToIso(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0).toISOString();
}

/** "En retard de 3 j", "Aujourd'hui", "Demain", "Dans 4 j" */
export function fmtDue(iso: string | null | undefined): { text: string; color: string } {
  if (!iso) return { text: 'Non planifié', color: C.textMuted };
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(due);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: `En retard de ${-diff} j`, color: C.red };
  if (diff === 0) return { text: 'Aujourd\'hui', color: C.amber };
  if (diff === 1) return { text: 'Demain', color: C.text };
  return { text: `Dans ${diff} j`, color: C.textMuted };
}

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** "2026-11" → "nov. 26" */
export function fmtMonth(ym: string, withYear = true): string {
  const [y, m] = ym.split('-').map(Number);
  return withYear ? `${MONTHS_FR[m - 1]} ${String(y).slice(2)}` : MONTHS_FR[m - 1];
}
