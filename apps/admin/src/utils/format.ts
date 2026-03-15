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

// ── Audit action mappings ───────────────────────────────────────────────────

/** Human-readable labels for audit actions */
export const ACTION_LABELS: Record<string, string> = {
  ADMIN_LOGIN: 'Connexion admin',
  ACTIVATE_PREMIUM: 'Premium activé',
  REVOKE_PREMIUM: 'Premium révoqué',
  BAN_MERCHANT: 'Compte banni',
  UNBAN_MERCHANT: 'Compte débanni',
  DELETE_MERCHANT: 'Compte supprimé',
  RESET_PASSWORD: 'Mot de passe réinitialisé',
  UPDATE_PLAN_DURATION: 'Durée du plan modifiée',
  APPROVE_UPGRADE_REQUEST: 'Demande approuvée',
  REJECT_UPGRADE_REQUEST: 'Demande rejetée',
};

/** Color mapping for audit actions */
export const ACTION_COLOR: Record<string, string> = {
  ADMIN_LOGIN: C.primary,
  ACTIVATE_PREMIUM: C.cyan,
  REVOKE_PREMIUM: C.amber,
  BAN_MERCHANT: C.red,
  UNBAN_MERCHANT: C.green,
  DELETE_MERCHANT: C.red,
  RESET_PASSWORD: C.amber,
  UPDATE_PLAN_DURATION: C.cyan,
  APPROVE_UPGRADE_REQUEST: C.green,
  REJECT_UPGRADE_REQUEST: C.red,
};

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
