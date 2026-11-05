import { Controller, Post, Get, Query, Body, UseGuards, HttpCode, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { Request } from 'express';
import { AuditAction, AuditTargetType } from '@prisma/client';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminAuthService } from './admin.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { extractIp } from './admin-request.util';

/**
 * Admin session (login / logout) and the audit log. The other admin routes
 * live in the sibling Admin*Controller classes under the same 'admin' prefix.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminAuthService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ── Public: Admin login ───────────────────────────────────────────────────

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: THROTTLE_TTL } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin login — returns a JWT token' })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const result = await this.adminService.login(dto.email, dto.password);

    // Log login using the freshly-returned admin identity (no JWT available yet)
    await this.auditLog.log({
      ctx: {
        adminId: result.admin.id,
        adminEmail: result.admin.email,
        ipAddress: extractIp(req),
        userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
      },
      action: AuditAction.ADMIN_LOGIN,
      targetType: 'ADMIN',
      targetId: result.admin.id,
      targetLabel: `${result.admin.nom} <${result.admin.email}>`,
    });

    return result;
  }

  // ── Admin logout ──────────────────────────────────────────────────────────

  @Post('logout')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin logout — revokes the current session token' })
  async logout(@CurrentUser() user: JwtPayload) {
    if (user.sessionId) {
      await this.adminService.logout(user.sessionId);
    }
    return { message: 'Déconnecté' };
  }

  // ── Audit logs ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Paginated audit logs with optional filters' })
  async getAuditLogs(@Query() query: AuditLogQueryDto): Promise<unknown> {
    return this.auditLog.findAll({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      action: query.action,
      adminId: query.adminId,
      // Free-form string: Prisma rejects values outside AuditTargetType (unchanged behaviour)
      targetType: query.targetType as AuditTargetType | undefined,
      targetId: query.targetId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
