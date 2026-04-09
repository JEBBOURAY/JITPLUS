// ── Email blast provider abstraction ─────────────────────────────────────────
// Follows the same pattern as IMailProvider, IPushProvider, etc.
// NotificationsService injects this interface via EMAIL_BLAST_PROVIDER token
// instead of the concrete ResendService, keeping the DI graph consistent.

export interface EmailBlastResult {
  total: number;
  successCount: number;
  failureCount: number;
}

export interface MerchantBlastInfo {
  nom: string;
  email?: string | null;
  phoneNumber?: string | null;
  adresse?: string | null;
  ville?: string | null;
  quartier?: string | null;
  logoUrl?: string | null;
}

export interface IEmailBlastProvider {
  sendBlast(
    recipients: { email: string; prenom?: string | null }[],
    subject: string,
    body: string,
    merchant: MerchantBlastInfo,
  ): Promise<EmailBlastResult>;
}
