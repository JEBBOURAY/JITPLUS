import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MerchantPlanService } from '../../merchant/services/merchant-plan.service';

/**
 * Guard that restricts access to merchants with an active PREMIUM plan.
 * Must be placed AFTER JwtAuthGuard + MerchantTypeGuard.
 *
 * Usage: @UseGuards(JwtAuthGuard, MerchantTypeGuard, PremiumGuard)
 */
@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private readonly planService: MerchantPlanService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.userId) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    const isPremium = await this.planService.isPremium(user.userId);
    if (!isPremium) {
      throw new ForbiddenException(
        'Cette fonctionnalité est réservée au plan Pro. Contactez notre équipe sur WhatsApp pour activer votre abonnement et débloquer toutes les fonctionnalités.',
      );
    }

    return true;
  }
}
