import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MerchantCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ACTIVE_BOOKING_STATUSES } from './booking.constants';

export class CreateTemplateDto {
  @ApiProperty({ enum: MerchantCategory }) @IsEnum(MerchantCategory) category: MerchantCategory;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) nom: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) order?: number;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TemplateQueryDto {
  @ApiPropertyOptional({ enum: MerchantCategory }) @IsOptional() @IsEnum(MerchantCategory) category?: MerchantCategory;
}

/** Back-office: adoption figures, the service catalogue, and custom services worth adding to it. */
@Injectable()
export class BookingAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [enabled, configured, byStatus, upcoming, fromApp, customServices] = await Promise.all([
      this.prisma.bookingSettings.count({ where: { enabled: true } }),
      this.prisma.merchant.count({ where: { bookingResources: { some: {} } } }),
      this.prisma.booking.groupBy({ by: ['status'], where: { startsAt: { gte: since, lte: new Date() } }, _count: { _all: true } }),
      this.prisma.booking.count({ where: { status: { in: ACTIVE_BOOKING_STATUSES }, startsAt: { gt: new Date() } } }),
      this.prisma.booking.count({ where: { source: 'APP', createdAt: { gte: since } } }),
      this.prisma.bookableService.count({ where: { templateId: null, deletedAt: null } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>;
    const honoured = (counts.CHECKED_IN ?? 0) + (counts.COMPLETED ?? 0);
    const noShow = counts.NO_SHOW ?? 0;
    return {
      merchantsEnabled: enabled,
      merchantsConfigured: configured,
      upcomingBookings: upcoming,
      last30Days: {
        byStatus: counts,
        bookedFromApp: fromApp,
        /** honoured / (honoured + no-show), null without data */
        attendanceRate: honoured + noShow ? honoured / (honoured + noShow) : null,
      },
      customServices,
    };
  }

  listTemplates(category?: MerchantCategory) {
    return this.prisma.serviceTemplate.findMany({
      where: category ? { category } : {},
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { nom: 'asc' }],
      include: { _count: { select: { services: { where: { deletedAt: null } } } } },
    });
  }

  async createTemplate(dto: CreateTemplateDto) {
    try {
      return await this.prisma.serviceTemplate.create({
        data: { category: dto.category, nom: dto.nom.trim(), description: dto.description?.trim() || null, order: dto.order ?? 0 },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Cette prestation existe déjà dans cette catégorie');
      }
      throw err;
    }
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.serviceTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Prestation du catalogue introuvable');
    try {
      return await this.prisma.serviceTemplate.update({
        where: { id },
        data: {
          // `!= null`: @IsOptional() lets null through, only description is nullable.
          ...(dto.nom != null && { nom: dto.nom.trim() }),
          ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
          ...(dto.order != null && { order: dto.order }),
          ...(dto.isActive != null && { isActive: dto.isActive }),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Cette prestation existe déjà dans cette catégorie');
      }
      throw err;
    }
  }

  /**
   * Custom service names created by merchants, grouped case-insensitively per
   * category, most frequent first — candidates for the catalogue.
   */
  async customServiceSuggestions(category?: MerchantCategory) {
    const rows = await this.prisma.$queryRaw<{ category: MerchantCategory; nom: string; merchants: bigint; avg_duration: number }[]>`
      SELECT m."categorie" AS category,
             MIN(s."nom") AS nom,
             COUNT(DISTINCT s."merchant_id") AS merchants,
             ROUND(AVG(s."duration_min"))::int AS avg_duration
      FROM "bookable_services" s
      JOIN "merchants" m ON m."id" = s."merchant_id"
      WHERE s."template_id" IS NULL AND s."deleted_at" IS NULL
        ${category ? Prisma.sql`AND m."categorie" = ${category}::"MerchantCategory"` : Prisma.empty}
        AND NOT EXISTS (
          SELECT 1 FROM "service_templates" t
          WHERE t."category" = m."categorie" AND lower(t."nom") = lower(trim(s."nom"))
        )
      GROUP BY m."categorie", lower(trim(s."nom"))
      ORDER BY merchants DESC, nom ASC
      LIMIT 100`;
    return rows.map((r) => ({ category: r.category, nom: r.nom, merchants: Number(r.merchants), avgDurationMin: r.avg_duration }));
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/booking')
@UseGuards(JwtAuthGuard, AdminGuard)
export class BookingAdminController {
  constructor(private readonly svc: BookingAdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Booking adoption and attendance' })
  stats() {
    return this.svc.stats();
  }

  @Get('templates')
  listTemplates(@Query() q: TemplateQueryDto) {
    return this.svc.listTemplates(q.category);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Get('custom-services')
  @ApiOperation({ summary: 'Custom services most created by merchants, not yet in the catalogue' })
  customServices(@Query() q: TemplateQueryDto) {
    return this.svc.customServiceSuggestions(q.category);
  }
}
