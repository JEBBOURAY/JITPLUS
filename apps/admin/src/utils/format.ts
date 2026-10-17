import { C } from '../theme';

// ── Date formatting ─────────────────────────────────────────────────────────

/** Format date: "02 mars 2025" */
export function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Format date short: "02 mars" */
export function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

/** Format date + time: "02 mars 2025, 14:30" */
export function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format time only: "14:30" */
export function fmtTime(d: string): string {
  return new Date(d).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Whole days elapsed since `d` (0 = today). */
export function daysSince(d: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
}

/** "aujourd'hui", "hier", "il y a 5 j", "il y a 3 mois"… */
export function fmtRelative(d: string | null | undefined): string {
  if (!d) return 'Jamais';
  const days = daysSince(d);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 30) return `Il y a ${days} j`;
  if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`;
  const y = Math.floor(days / 365);
  return `Il y a ${y} an${y > 1 ? 's' : ''}`;
}

/** Colour for a "last activity" date: recent = green, 1 month+ = red. */
export function activityColor(d: string | null | undefined): string {
  if (!d) return C.textMuted;
  const days = daysSince(d);
  return days <= 7 ? C.green : days <= 30 ? C.amber : C.red;
}

// ── Transactions & channels ─────────────────────────────────────────────────

export const TX_TYPE_LABELS: Record<string, string> = {
  EARN_STAMPS: 'Tampons gagnés',
  REDEEM_REWARD: 'Récompense échangée',
  ADJUST_STAMPS: 'Ajustement manuel',
  LOYALTY_PROGRAM_CHANGE: 'Changement de programme',
  LUCKY_WHEEL_WIN: 'Gain roue de la fortune',
  COUPON_REDEEM: 'Coupon utilisé',
};

export const TX_TYPE_COLOR: Record<string, string> = {
  EARN_STAMPS: C.green,
  REDEEM_REWARD: C.amber,
  ADJUST_STAMPS: C.blue,
  LOYALTY_PROGRAM_CHANGE: C.textMuted,
  LUCKY_WHEEL_WIN: C.primary,
  COUPON_REDEEM: C.cyan,
};

export const CHANNEL_LABELS: Record<string, string> = {
  PUSH: 'Push',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
};

export const CHANNEL_COLOR: Record<string, string> = {
  PUSH: C.primary,
  WHATSAPP: '#25D366',
  EMAIL: '#EA4335',
};

export const AUDIENCE_LABELS: Record<string, string> = {
  MERCHANT_CLIENTS: 'Clients d\'un commerçant',
  ALL_CLIENTS: 'Tous les clients',
  ALL_MERCHANTS: 'Tous les commerçants',
  ADMIN: 'Broadcast admin',
};

// ── Audit action mappings ───────────────────────────────────────────────────

/** Human-readable labels for audit actions */
export const ACTION_LABELS: Record<string, string> = {
  ADMIN_LOGIN: 'Connexion admin',
  ACTIVATE_PREMIUM: 'Premium activé',
  REVOKE_PREMIUM: 'Premium révoqué',
  BAN_MERCHANT: 'Compte banni',
  UNBAN_MERCHANT: 'Compte débanni',
  DELETE_MERCHANT: 'Compte supprimé',
  DEACTIVATE_CLIENT: 'Client désactivé',
  ACTIVATE_CLIENT: 'Client réactivé',
  DELETE_CLIENT: 'Client supprimé',
  ADMIN_SEND_NOTIFICATION: 'Notification envoyée',
  UPDATE_PLAN_DURATION: 'Durée du plan modifiée',
  UPDATE_PAYOUT: 'Modifier demande de retrait',
  CREATE_REWARD: 'Récompense créée',
  DELETE_REWARD: 'Récompense supprimée',
  CREATE_TEAM_MEMBER: 'Membre d\'équipe ajouté',
  DELETE_TEAM_MEMBER: 'Membre d\'équipe supprimé',
  CREATE_STORE: 'Boutique créée',
  DELETE_STORE: 'Boutique supprimée',
  CANCEL_TRANSACTION: 'Transaction annulée',
  UPDATE_LOYALTY_SETTINGS: 'Programme fidélité modifié',
  CREATE_SCRATCH_CAMPAIGN: 'Campagne grattage créée',
  CANCEL_SCRATCH_CAMPAIGN: 'Campagne grattage annulée',
  REDEEM_COUPON: 'Coupon utilisé',
  RESET_PASSWORD: 'Mot de passe réinitialisé',
};

/** Color mapping for audit actions */
export const ACTION_COLOR: Record<string, string> = {
  ADMIN_LOGIN: C.primary,
  ACTIVATE_PREMIUM: C.cyan,
  REVOKE_PREMIUM: C.amber,
  BAN_MERCHANT: C.red,
  UNBAN_MERCHANT: C.green,
  DELETE_MERCHANT: C.red,
  DEACTIVATE_CLIENT: C.red,
  ACTIVATE_CLIENT: C.green,
  DELETE_CLIENT: C.red,
  ADMIN_SEND_NOTIFICATION: C.cyan,
  UPDATE_PLAN_DURATION: C.cyan,
  UPDATE_PAYOUT: C.amber,
  CREATE_REWARD: C.green,
  DELETE_REWARD: C.red,
  CREATE_TEAM_MEMBER: C.green,
  DELETE_TEAM_MEMBER: C.red,
  CREATE_STORE: C.green,
  DELETE_STORE: C.red,
  CANCEL_TRANSACTION: C.amber,
  UPDATE_LOYALTY_SETTINGS: C.blue,
  CREATE_SCRATCH_CAMPAIGN: C.primary,
  CANCEL_SCRATCH_CAMPAIGN: C.amber,
  REDEEM_COUPON: C.cyan,
  RESET_PASSWORD: C.amber,
};

// ── Merchant categories ─────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  CAFE: 'Café',
  RESTAURANT: 'Restaurant',
  EPICERIE: 'Épicerie',
  BOULANGERIE: 'Boulangerie',
  PHARMACIE: 'Pharmacie',
  LIBRAIRIE: 'Librairie',
  VETEMENTS: 'Vêtements',
  ELECTRONIQUE: 'Électronique',
  COIFFURE: 'Coiffure',
  BEAUTE: 'Beauté',
  SPORT: 'Sport',
  SUPERMARCHE: 'Supermarché',
  BOUCHERIE: 'Boucherie',
  PATISSERIE: 'Pâtisserie',
  FASTFOOD: 'Fast-food',
  HAMMAM: 'Hammam',
  ANIMALERIE: 'Animalerie',
  FLEURISTE: 'Fleuriste',
  BIJOUTERIE: 'Bijouterie',
  OPTIQUE: 'Opticien',
  TELEPHONE: 'Téléphonie',
  BRICOLAGE: 'Bricolage',
  AUTO: 'Auto',
  HOTEL: 'Hôtel',
  PARFUMERIE: 'Parfumerie',
  TRAITEUR: 'Traiteur',
  LOCATION_VOITURE: 'Location de voiture',
  SALLE_JEU: 'Salle de jeu',
  AUTRE: 'Autre',
};

// ── Numbers ─────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat('fr-FR');

export function fmtNumber(n: number): string {
  return nf.format(n);
}

export function fmtMAD(n: number): string {
  return `${nf.format(Math.round(n))} MAD`;
}

/** Share of `part` in `total`, as a 0-100 integer. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Relative change vs previous period, in %. null when there is no baseline. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Shared table styles ─────────────────────────────────────────────────────

export const tableHeaderStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 700,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

export const tableCellStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: C.text,
};
