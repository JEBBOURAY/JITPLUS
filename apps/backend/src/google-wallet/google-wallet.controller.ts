import {
  Controller,
  Get,
  Param,
  UseGuards,
  ServiceUnavailableException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { GoogleWalletService } from './google-wallet.service';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
} from '../common/repositories';
import { ConfigService } from '@nestjs/config';

@ApiTags('Google Wallet')
@ApiBearerAuth()
@Controller('client/google-wallet-pass')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class GoogleWalletController {
  constructor(
    private readonly walletService: GoogleWalletService,
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    private config: ConfigService,
  ) {}

  /** Check if Google Wallet integration is available */
  @Get('status')
  async getStatus() {
    return { available: this.walletService.configured };
  }

  /**
   * Generate a Google Wallet "save" URL for a specific merchant loyalty card.
   * Returns { saveUrl: string } which the client opens in a browser / WebView.
   */
  @Get(':merchantId')
  async generatePass(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId') merchantId: string,
  ) {
    if (!this.walletService.configured) {
      throw new ServiceUnavailableException('Google Wallet is not configured on this server.');
    }

    // Find the loyalty card for this client + merchant
    const card = await this.loyaltyCardRepo.findFirst({
      where: { clientId: user.userId, merchantId },
    });

    if (!card) {
      throw new NotFoundException('Aucune carte de fidélité trouvée pour ce commerçant.');
    }

    // Load merchant details
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        nom: true,
        categorie: true,
        loyaltyType: true,
        stampsForReward: true,
        logoUrl: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Commerçant non trouvé.');
    }

    // Load client details
    const client = await this.clientRepo.findUnique({
      where: { id: user.userId },
      select: { id: true, prenom: true, nom: true, email: true },
    });

    if (!client) {
      throw new NotFoundException('Client non trouvé.');
    }

    const clientName = `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Client JitPlus';

    // Resolve logo URL (absolute)
    const serverBase = this.config.get<string>('SERVER_BASE_URL', 'https://api.jitplus.ma');
    const logoUrl = merchant.logoUrl
      ? (merchant.logoUrl.startsWith('http') ? merchant.logoUrl : `${serverBase}${merchant.logoUrl}`)
      : undefined;

    const saveUrl = this.walletService.generateSaveUrl({
      passId: `${user.userId}-${merchantId}`,
      merchantName: merchant.nom,
      category: merchant.categorie,
      loyaltyType: merchant.loyaltyType,
      balance: card.points,
      stampsForReward: merchant.stampsForReward,
      clientName,
      clientEmail: client.email ?? undefined,
      qrValue: `jitplus://scan/${user.userId}`,
      logoUrl,
    });

    return { saveUrl };
  }
}
