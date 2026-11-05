import { Controller, Post, Get, Delete, Param, Query, UseGuards, HttpCode, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminClientService } from './admin-clients.service';
import { AdminDetailsService } from './admin-details.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ClientListQueryDto } from '../common/dto/pagination-query.dto';
import { buildCtx } from './admin-request.util';

/** Client list, drill-down and account lifecycle. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminClientsController {
  constructor(
    private readonly clientService: AdminClientService,
    private readonly detailsService: AdminDetailsService,
    private readonly auditLog: AuditLogService,
  ) {}

  @Get('clients')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated list of all registered clients with contact info' })
  async listClients(@Query() query: ClientListQueryDto) {
    return this.clientService.listClients(query.page, query.limit, query.search, query.status, {
      activity: query.activity,
      type: query.type,
      sort: query.sort,
    });
  }

  // ── Client management ───────────────────────────────────────────────────

  @Get('clients/:id/activity')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Usage analytics of a single client (visits, cards, games, notifications)' })
  async getClientActivity(@Param('id', ParseUUIDPipe) clientId: string) {
    return this.detailsService.getClientActivity(clientId);
  }

  @Get('clients/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Detailed profile of a single client' })
  async getClientDetail(@Param('id', ParseUUIDPipe) clientId: string) {
    return this.clientService.getClientDetail(clientId);
  }

  @Post('clients/:id/deactivate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Deactivate a client account (soft-delete)' })
  async deactivateClient(
    @Param('id', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.clientService.deactivateClient(clientId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.DEACTIVATE_CLIENT,
      targetType: 'CLIENT',
      targetId: clientId,
      targetLabel: `${nom ?? 'N/A'} <${email ?? 'N/A'}>`,
    });

    return { success: true, message: `Client ${nom ?? clientId} désactivé.` };
  }

  @Post('clients/:id/activate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivate a client account' })
  async activateClient(
    @Param('id', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.clientService.activateClient(clientId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.ACTIVATE_CLIENT,
      targetType: 'CLIENT',
      targetId: clientId,
      targetLabel: `${nom ?? 'N/A'} <${email ?? 'N/A'}>`,
    });

    return { success: true, message: `Client ${nom ?? clientId} réactivé.` };
  }

  @Delete('clients/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Permanently delete a client and anonymise data' })
  async deleteClient(
    @Param('id', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const { nom, email } = await this.clientService.deleteClient(clientId);

    await this.auditLog.log({
      ctx: buildCtx(user, req),
      action: AuditAction.DELETE_CLIENT,
      targetType: 'CLIENT',
      targetId: clientId,
      targetLabel: `${nom ?? 'N/A'} <${email ?? 'N/A'}>`,
    });

    return { success: true, message: `Client supprimé définitivement.` };
  }
}
