import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/** Data needed to build a Google Wallet loyalty pass */
export interface WalletPassInput {
  /** Unique identifier for this pass (clientId + merchantId) */
  passId: string;
  /** Merchant / program display name */
  merchantName: string;
  /** Merchant category */
  category: string;
  /** Loyalty type: POINTS or STAMPS */
  loyaltyType: 'POINTS' | 'STAMPS';
  /** Current balance (points or stamps) */
  balance: number;
  /** For STAMPS: total stamps needed */
  stampsForReward?: number;
  /** Client full name */
  clientName: string;
  /** Client email (optional, shown on pass) */
  clientEmail?: string;
  /** QR code value to embed in the pass */
  qrValue: string;
  /** Merchant logo URL (absolute) */
  logoUrl?: string;
  /** Hex color for the pass header */
  hexColor?: string;
}

@Injectable()
export class GoogleWalletService {
  private readonly logger = new Logger(GoogleWalletService.name);
  private readonly issuerId: string;
  private readonly serviceAccountEmail: string;
  private readonly privateKey: string;
  private readonly isConfigured: boolean;

  constructor(private config: ConfigService) {
    this.issuerId = this.config.get<string>('GOOGLE_WALLET_ISSUER_ID', '');
    this.serviceAccountEmail = this.config.get<string>('GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL', '');

    // The private key can be stored as a single-line env var with literal \n
    const rawKey = this.config.get<string>('GOOGLE_WALLET_PRIVATE_KEY', '');
    this.privateKey = rawKey.replace(/\\n/g, '\n');

    this.isConfigured = !!(this.issuerId && this.serviceAccountEmail && this.privateKey);
    if (!this.isConfigured) {
      this.logger.warn(
        'Google Wallet is not configured. Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL, and GOOGLE_WALLET_PRIVATE_KEY env vars.',
      );
    }
  }

  /** Returns true if all required env vars are set */
  get configured(): boolean {
    return this.isConfigured;
  }

  /**
   * Generate a "Save to Google Wallet" URL containing a signed JWT.
   * Uses the Generic Pass type (suitable for loyalty / membership cards).
   * @see https://developers.google.com/wallet/generic/web/prerequisites
   */
  generateSaveUrl(input: WalletPassInput): string {
    const classId = `${this.issuerId}.jitplus-loyalty-${this.sanitizeId(input.passId)}`;
    const objectId = `${this.issuerId}.${this.sanitizeId(input.passId)}`;

    const isStamps = input.loyaltyType === 'STAMPS';
    const balanceLabel = isStamps ? 'Tampons' : 'Points';
    const balanceValue = isStamps
      ? `${input.balance} / ${input.stampsForReward || 10}`
      : String(input.balance);

    const hexColor = input.hexColor || '#7C3AED'; // violet by default

    const genericObject = {
      id: objectId,
      classId,
      genericType: 'GENERIC_TYPE_UNSPECIFIED',
      hexBackgroundColor: hexColor,
      logo: {
        sourceUri: {
          uri: input.logoUrl || 'https://jitplus.ma/logo.png',
        },
        contentDescription: {
          defaultValue: {
            language: 'fr',
            value: input.merchantName,
          },
        },
      },
      cardTitle: {
        defaultValue: {
          language: 'fr',
          value: input.merchantName,
        },
      },
      subheader: {
        defaultValue: {
          language: 'fr',
          value: 'Carte Fidélité JitPlus',
        },
      },
      header: {
        defaultValue: {
          language: 'fr',
          value: input.clientName,
        },
      },
      textModulesData: [
        {
          id: 'balance',
          header: balanceLabel,
          body: balanceValue,
        },
        {
          id: 'category',
          header: 'Catégorie',
          body: input.category,
        },
        {
          id: 'type',
          header: 'Programme',
          body: isStamps ? 'Tampons' : 'Points',
        },
      ],
      barcode: {
        type: 'QR_CODE',
        value: input.qrValue,
        alternateText: input.clientName,
      },
      heroImage: {
        sourceUri: {
          uri: input.logoUrl || 'https://jitplus.ma/logo.png',
        },
        contentDescription: {
          defaultValue: {
            language: 'fr',
            value: input.merchantName,
          },
        },
      },
    };

    const genericClass = {
      id: classId,
      genericType: 'GENERIC_TYPE_UNSPECIFIED',
      // Multiple passes flag — each merchant = separate class
      multipleDevicesAndHoldersAllowedStatus: 'MULTIPLE_HOLDERS',
    };

    const claims = {
      iss: this.serviceAccountEmail,
      aud: 'google',
      origins: ['https://jitplus.ma'],
      typ: 'savetowallet',
      payload: {
        genericClasses: [genericClass],
        genericObjects: [genericObject],
      },
    };

    const token = jwt.sign(claims, this.privateKey, {
      algorithm: 'RS256',
    });

    return `https://pay.google.com/gp/v/save/${token}`;
  }

  /** Sanitize an ID for Google Wallet (alphanumeric, dots, dashes, underscores) */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
