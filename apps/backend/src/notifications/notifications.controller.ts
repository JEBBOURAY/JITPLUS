import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { PremiumGuard } from '../auth/guards/premium.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { SendEmailBlastDto } from './dto/send-email-blast.dto';
import { SendWhatsappBlastDto } from './dto/send-whatsapp-blast.dto';
import { RecordWhatsappBlastDto } from './dto/record-whatsapp-blast.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, MerchantTypeGuard, MerchantOwnerGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('send-to-all')
  async sendToAll(@Body() dto: SendNotificationDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.sendToAll(user.userId, dto);
  }

  @Post('send-email-to-all')
  @UseGuards(PremiumGuard)
  async sendEmailToAll(@Body() dto: SendEmailBlastDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.sendEmailToAll(user.userId, dto);
  }

  @Get('email-quota')
  async getEmailQuota(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getEmailQuota(user.userId);
  }

  @Get('history')
  async getHistory(@Query() { page, limit }: PaginationQueryDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.getHistory(user.userId, page, limit);
  }

  @Post('send-whatsapp-to-all')
  @UseGuards(PremiumGuard)
  async sendWhatsAppToAll(@Body() dto: SendWhatsappBlastDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.sendWhatsAppToAll(user.userId, dto.body);
  }

  @Post('record-whatsapp-blast')
  @UseGuards(PremiumGuard)
  async recordWhatsappBlast(
    @Body() dto: RecordWhatsappBlastDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.recordWhatsappBlast(
      user.userId,
      dto.body,
      dto.recipientCount,
      dto.sentCount,
    );
  }
}
