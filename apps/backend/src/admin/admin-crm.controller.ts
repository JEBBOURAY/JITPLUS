import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AuditLogService } from './audit-log.service';
import { AdminCrmService, type AdminActor } from './admin-crm.service';
import { AdminMerchantService } from './admin-merchants.service';
import { buildCtx } from './admin-request.util';
import {
  AddFollowUpNoteDto, FollowUpListQueryDto, PaymentInputDto, RevenueQueryDto, SetPremiumGrantDto, UpdateFollowUpDto, VoidPaymentDto,
} from './dto/crm.dto';

const actor = (user: JwtPayload): AdminActor => ({ adminId: user.sub, adminEmail: user.email ?? 'unknown' });

/** Back-office: worklist, merchant follow-up (CRM), PREMIUM billing and revenue. */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminCrmController {
  constructor(
    private readonly crm: AdminCrmService,
    private readonly merchants: AdminMerchantService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('worklist')
  @ApiOperation({ summary: 'Merchants and requests that need an action today, with contact details' })
  getWorklist() {
    return this.crm.getWorklist();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Subscription payments received per month and PREMIUM split paid / offered / trial' })
  getRevenue(@Query() q: RevenueQueryDto) {
    return this.crm.getRevenue(q.months ?? 12);
  }

  // ── Follow-up ───────────────────────────────────────────────────────────────

  @Get('follow-ups')
  @ApiOperation({ summary: 'Merchants followed by the team, soonest action first' })
  listFollowUps(@Query() q: FollowUpListQueryDto) {
    return this.crm.listFollowUps(q);
  }

  @Get('merchants/:id/follow-up')
  @ApiOperation({ summary: 'Follow-up status and contact timeline of a merchant' })
  getFollowUp(@Param('id', ParseUUIDPipe) id: string) {
    return this.crm.getFollowUp(id);
  }

  @Patch('merchants/:id/follow-up')
  @ApiOperation({ summary: 'Set follow-up status, next action and owner' })
  updateFollowUp(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFollowUpDto, @CurrentUser() user: JwtPayload) {
    return this.crm.updateFollowUp(id, dto, actor(user));
  }

  @Post('merchants/:id/follow-up/notes')
  @ApiOperation({ summary: 'Log a call, WhatsApp, email, visit or note about a merchant' })
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddFollowUpNoteDto, @CurrentUser() user: JwtPayload) {
    return this.crm.addNote(id, dto, actor(user));
  }

  @Delete('follow-up-notes/:noteId')
  @ApiOperation({ summary: 'Delete one of your own follow-up notes' })
  deleteNote(@Param('noteId', ParseUUIDPipe) noteId: string, @CurrentUser() user: JwtPayload) {
    return this.crm.deleteNote(noteId, actor(user));
  }

  // ── Billing ─────────────────────────────────────────────────────────────────

  @Get('merchants/:id/payments')
  @ApiOperation({ summary: 'Subscription payments recorded for a merchant' })
  listPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.crm.listPayments(id);
  }

  @Post('merchants/:id/payments')
  @ApiOperation({ summary: 'Record money received for a PREMIUM subscription' })
  async recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentInputDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const detail = await this.merchants.getMerchantDetail(id);
    const payment = await this.crm.recordPayment(id, dto, actor(user));
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.RECORD_SUBSCRIPTION_PAYMENT,
      targetType: 'MERCHANT',
      targetId: id,
      targetLabel: `${detail.nom} <${detail.email}>`,
      metadata: { paymentId: payment.id, amount: payment.amount, method: payment.method, paidAt: payment.paidAt.toISOString() },
    });
    return payment;
  }

  @Post('payments/:paymentId/void')
  @HttpCode(200)
  @ApiOperation({ summary: 'Void a mistaken payment (kept in history)' })
  async voidPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: VoidPaymentDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const payment = await this.crm.voidPayment(paymentId, dto.reason);
    const detail = await this.merchants.getMerchantDetail(payment.merchantId);
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.VOID_SUBSCRIPTION_PAYMENT,
      targetType: 'MERCHANT',
      targetId: payment.merchantId,
      targetLabel: `${detail.nom} <${detail.email}>`,
      metadata: { paymentId, amount: payment.amount, reason: dto.reason },
    });
    return payment;
  }

  @Patch('merchants/:id/premium-grant')
  @ApiOperation({ summary: 'Record whether the current PREMIUM is paid or offered' })
  async setPremiumGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPremiumGrantDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const detail = await this.merchants.getMerchantDetail(id);
    await this.crm.setPremiumGrant(id, dto.grant, dto.note ?? null);
    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.UPDATE_PREMIUM_GRANT,
      targetType: 'MERCHANT',
      targetId: id,
      targetLabel: `${detail.nom} <${detail.email}>`,
      metadata: { previous: detail.premiumGrant ?? null, grant: dto.grant, note: dto.note ?? null },
    });
    return { success: true };
  }
}
