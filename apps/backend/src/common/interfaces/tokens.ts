// ── Provider Interface Tokens ────────────────────────────────────────────────
// DI tokens for abstract provider interfaces.
// Services inject these tokens instead of concrete classes, enabling
// swappable implementations (Strategy Pattern via NestJS DI).

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
export const EMAIL_BLAST_PROVIDER = Symbol('EMAIL_BLAST_PROVIDER');
