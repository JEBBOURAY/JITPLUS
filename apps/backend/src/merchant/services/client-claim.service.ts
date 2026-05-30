import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
  ConflictException,
  GoneException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { MerchantTransactionService } from './merchant-transaction.service';

// ── Constants ────────────────────────────────────────────────────────────────
/** Effectively never — set far in the future so the merchant’s WhatsApp link never goes stale. */
const CLAIM_TOKEN_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;
/** 256-bit cryptographically random token, base64url-encoded → 43 chars. */
const CLAIM_TOKEN_BYTES = 32;
/** Hard limit to avoid runaway loops if data has been seeded oddly. */
const MAX_CLAIM_MERGE_CARDS = 200;

/** Default fallback (used only if env var is unset — production MUST set it). */
const DEFAULT_PUBLIC_WEB_URL = 'https://jitplus.com';

export interface QuickAddInput {
  merchantId: string;
  telephone: string;
  countryCode?: string;
  prenom?: string;
  type: 'EARN_POINTS' | 'REDEEM_REWARD';
  amount: number;
  points: number;
  rewardId?: string;
  teamMemberId?: string;
  performedByName?: string;
  idempotencyKey?: string;
}

@Injectable()
export class ClientClaimService {
  private readonly logger = new Logger(ClientClaimService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    private transactionService: MerchantTransactionService,
  ) {}

  /**
   * Normalize a Moroccan phone number to E.164 (+212…).
   * Accepts: '0612345678', '+212612345678', '212 612 345 678', etc.
   * Throws BadRequest if it cannot produce a valid E.164 form.
   */
  private normalizePhone(raw: string, countryCode = 'MA'): string {
    const digits = (raw ?? '').replace(/[^\d+]/g, '');
    if (!digits) throw new BadRequestException('Numéro de téléphone requis');

    let e164: string;
    if (digits.startsWith('+')) {
      e164 = digits;
    } else if (digits.startsWith('00')) {
      e164 = '+' + digits.slice(2);
    } else if (countryCode === 'MA') {
      // Local Moroccan format: 06xxxxxxxx / 07xxxxxxxx → +2126xxxxxxxx
      const local = digits.startsWith('0') ? digits.slice(1) : digits;
      e164 = '+212' + local;
    } else {
      e164 = '+' + digits;
    }

    // Basic E.164 sanity check: 8–15 digits after the +
    if (!/^\+\d{8,15}$/.test(e164)) {
      throw new BadRequestException('Numéro de téléphone invalide');
    }
    return e164;
  }

  private sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private buildClaimUrl(rawToken: string): string {
    const base = (process.env.PUBLIC_WEB_URL?.trim() || DEFAULT_PUBLIC_WEB_URL).replace(/\/+$/, '');
    return `${base}/d/claim?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Create (or reuse) an anonymous Client for a walk-in customer, credit the
   * loyalty transaction, and return a single-use magic-link the merchant can
   * share via WhatsApp (zero SMS cost).
   *
   * Returns `claimUrl` (raw token included once — never persisted) and the
   * full transaction payload so the Pro app can render its usual success UI.
   */
  async quickAddAndClaim(input: QuickAddInput) {
    const telephone = this.normalizePhone(input.telephone, input.countryCode);
    const merchantExists = await this.merchantRepo.findUnique({
      where: { id: input.merchantId },
      select: { id: true, isActive: true, deletedAt: true, nom: true },
    });
    if (!merchantExists || !merchantExists.isActive || merchantExists.deletedAt) {
      throw new NotFoundException('Commerce non trouvé');
    }

    // 1. Try to reuse an existing record (idempotent per phone)
    const existing = await this.clientRepo.findUnique({
      where: { telephone },
      select: { id: true, isAnonymous: true, deletedAt: true, email: true },
    });

    let clientId: string;
    if (existing && !existing.deletedAt) {
      if (!existing.isAnonymous) {
        // Real registered user — reject; merchant should use the normal QR flow
        throw new ConflictException(
          'Ce numéro appartient déjà à un client inscrit. Demandez-lui de scanner son QR code.',
        );
      }
      clientId = existing.id;
    } else {
      // Create a fresh anonymous account
      const created = await this.clientRepo.create({
        data: {
          telephone,
          isAnonymous: true,
          prenom: input.prenom?.trim() || null,
          termsAccepted: false,
          notifPush: false,
          notifEmail: false,
        },
        select: { id: true },
      });
      clientId = created.id;
    }

    // 2. Credit the transaction using the existing audited flow
    //    (covers idempotency, points/stamps rules, anti-fraud caps, etc.)
    const transaction = await this.transactionService.createTransaction(
      clientId,
      input.merchantId,
      input.type,
      input.amount,
      input.points,
      input.rewardId,
      input.teamMemberId,
      input.performedByName,
      input.idempotencyKey,
    );

    // 3. Mint a single-use claim token (only the SHA-256 digest hits the DB)
    const rawToken = randomBytes(CLAIM_TOKEN_BYTES).toString('base64url');
    const tokenHash = this.sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_MS);

    await this.txRunner.run(async (tx) => {
      // Replace any older un-consumed claim for the SAME (client, merchant) pair
      // so each merchant always has at most one live link, while parallel claims
      // from other merchants on the same anonymous client stay valid.
      await tx.clientClaim.deleteMany({
        where: { clientId, merchantId: input.merchantId, consumedAt: null },
      });
      await tx.clientClaim.create({
        data: {
          tokenHash,
          clientId,
          merchantId: input.merchantId,
          createdByName: input.performedByName ?? null,
          expiresAt,
        },
      });
    }, { isolationLevel: 'Serializable' });

    return {
      transaction,
      claim: {
        url: this.buildClaimUrl(rawToken),
        expiresAt,
      },
      client: {
        id: clientId,
        telephone,
        isAnonymous: true,
      },
    };
  }

  /**
   * Consume a claim token: merge the anonymous Client's loyalty data into the
   * authenticated real Client. Idempotent — calling it twice with the same
   * (token, real client) returns the cached success payload.
   */
  async consumeClaim(realClientId: string, rawToken: string) {
    if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(rawToken)) {
      throw new BadRequestException('Token invalide');
    }
    const tokenHash = this.sha256Hex(rawToken);

    const claim = await this.txRunner.run(async (tx) => {
      const found = await tx.clientClaim.findUnique({
        where: { tokenHash },
        include: {
          merchant: { select: { id: true, nom: true } },
        },
      });
      if (!found) throw new NotFoundException('Lien invalide ou déjà utilisé');
      if (found.expiresAt < new Date()) {
        throw new GoneException('Lien expiré');
      }

      // Already consumed by the SAME client → idempotent success
      if (found.consumedAt) {
        if (found.clientId === realClientId) {
          return { claim: found, alreadyConsumed: true, anonymousClient: null, mergedCards: 0 };
        }
        throw new ForbiddenException('Lien déjà utilisé');
      }

      // Edge case: token belongs to the SAME client (anonymous → real merge
      // already happened in the past). Should be unreachable in practice but
      // guarded so we don't try to merge a client into itself.
      if (found.clientId === realClientId) {
        await tx.clientClaim.update({
          where: { id: found.id },
          data: { consumedAt: new Date() },
        });
        return { claim: found, alreadyConsumed: false, anonymousClient: null, mergedCards: 0 };
      }

      const anonymousId = found.clientId;
      const anonymous = await tx.client.findUnique({
        where: { id: anonymousId },
        select: { id: true, isAnonymous: true, deletedAt: true },
      });
      if (!anonymous || anonymous.deletedAt) {
        throw new NotFoundException('Compte introuvable');
      }
      if (!anonymous.isAnonymous) {
        // Safety net: only anonymous accounts can be merged
        throw new ForbiddenException('Ce lien ne peut pas être utilisé');
      }

      // 1) Merge loyalty cards (sum points if the real client already has one
      //    for the same merchant, otherwise reassign).
      const anonCards = await tx.loyaltyCard.findMany({
        where: { clientId: anonymousId },
        take: MAX_CLAIM_MERGE_CARDS,
      });
      let mergedCards = 0;
      for (const card of anonCards) {
        const existing = await tx.loyaltyCard.findUnique({
          where: { clientId_merchantId: { clientId: realClientId, merchantId: card.merchantId } },
          select: { id: true, points: true, deactivatedAt: true },
        });
        if (existing) {
          await tx.loyaltyCard.update({
            where: { id: existing.id },
            data: {
              points: existing.points + card.points,
              // Re-activate if the real client had previously left the program
              deactivatedAt: existing.deactivatedAt && card.deactivatedAt === null ? null : existing.deactivatedAt,
            },
          });
          // The duplicate anonymous card is deleted in the deleteMany below
        } else {
          await tx.loyaltyCard.update({
            where: { id: card.id },
            data: { clientId: realClientId },
          });
        }
        mergedCards++;
      }
      // Wipe any remaining anonymous cards (the ones we summed into real cards)
      await tx.loyaltyCard.deleteMany({ where: { clientId: anonymousId } });

      // 2) Reassign all FKs that would otherwise block the soft-delete.
      //    Transactions & LuckyWheelTickets use onDelete: Restrict.
      await tx.transaction.updateMany({
        where: { clientId: anonymousId },
        data: { clientId: realClientId },
      });
      await tx.luckyWheelTicket.updateMany({
        where: { clientId: anonymousId },
        data: { clientId: realClientId },
      });

      // 3) Mark the claim consumed (single-use)
      await tx.clientClaim.update({
        where: { id: found.id },
        data: { consumedAt: new Date() },
      });

      // 4) Soft-delete the anonymous shell and free its unique phone slot
      //    (so the same phone can be re-used later if the customer ever
      //    deletes their real account).
      await tx.client.update({
        where: { id: anonymousId },
        data: {
          deletedAt: new Date(),
          telephone: null,
          isAnonymous: false,
        },
      });

      return { claim: found, alreadyConsumed: false, anonymousClient: { id: anonymousId }, mergedCards };
    }, { isolationLevel: 'Serializable' });

    return {
      success: true,
      alreadyConsumed: claim.alreadyConsumed,
      mergedCards: claim.mergedCards,
      merchant: {
        id: claim.claim.merchantId,
        nom: (claim.claim as any).merchant?.nom ?? null,
      },
    };
  }

  /**
   * List every un-consumed claim attached to an anonymous client (one per
   * merchant who used Quick-Add on this phone). Used by the auth flow to
   * surface a helpful message when a real user tries to register with a phone
   * that’s already attached to one or more merchant-created anonymous claims.
   */
  async findPendingClaimsForClient(clientId: string): Promise<Array<{ merchantId: string; merchantName: string | null; createdAt: Date }>> {
    const claims = await this.txRunner.run(async (tx) => {
      return tx.clientClaim.findMany({
        where: { clientId, consumedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { merchant: { select: { id: true, nom: true } } },
      });
    });
    // Deduplicate by merchant just in case (one row per merchant is the norm).
    const seen = new Set<string>();
    const out: Array<{ merchantId: string; merchantName: string | null; createdAt: Date }> = [];
    for (const c of claims) {
      if (seen.has(c.merchantId)) continue;
      seen.add(c.merchantId);
      out.push({
        merchantId: c.merchantId,
        merchantName: (c as any).merchant?.nom ?? null,
        createdAt: c.createdAt,
      });
    }
    return out;
  }

  /**
   * Back-compat: return only the most recent pending claim. Kept for callers
   * that just need a single merchant reference.
   */
  async findPendingClaimForClient(clientId: string): Promise<{ merchantId: string; merchantName: string | null } | null> {
    const all = await this.findPendingClaimsForClient(clientId);
    if (all.length === 0) return null;
    return { merchantId: all[0].merchantId, merchantName: all[0].merchantName };
  }

  /**
   * Build the structured 409 payload used by the client-auth flow when a real
   * user tries to claim a phone number already attached to an anonymous
   * Quick-Add account. Lists every merchant who has a pending link so the
   * client knows exactly whom to ask.
   */
  async buildAnonymousPhoneConflictPayload(anonymousClientId: string): Promise<{
    errorCode: 'ANONYMOUS_PHONE_NEEDS_CLAIM';
    merchantName: string | null;
    merchantNames: string[];
    message: string;
  }> {
    const pending = await this.findPendingClaimsForClient(anonymousClientId);
    const names = pending.map((p) => p.merchantName).filter((n): n is string => !!n);
    const primary = names[0] ?? null;

    let message: string;
    if (names.length === 0) {
      message = "Ce numéro est déjà lié à une carte de fidélité créée par un commerçant sur WhatsApp. Pour l’utiliser, tu dois d’abord ouvrir le lien WhatsApp qu’il t’a envoyé et cliquer sur « Récupérer mes points ». Si tu as supprimé le message, demande-lui de te renvoyer le lien.";
    } else if (names.length === 1) {
      message = `Ce numéro est déjà lié à une carte de fidélité créée par ${names[0]} sur WhatsApp. Pour activer ton compte avec ce numéro, tu dois d’abord ouvrir le lien WhatsApp envoyé par ${names[0]} et cliquer sur « Récupérer mes points ». Si tu as supprimé le message, demande à ${names[0]} de te renvoyer le lien.`;
    } else {
      const list = names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
      message = `Ce numéro est déjà lié à plusieurs cartes de fidélité créées sur WhatsApp par : ${list}. Pour activer ton compte avec ce numéro, ouvre n’importe lequel de leurs liens WhatsApp et clique sur « Récupérer mes points » — toutes tes cartes seront fusionnées automatiquement. Si tu as supprimé les messages, demande à l’un d’eux de te renvoyer le lien.`;
    }

    return {
      errorCode: 'ANONYMOUS_PHONE_NEEDS_CLAIM',
      merchantName: primary,
      merchantNames: names,
      message,
    };
  }
}
