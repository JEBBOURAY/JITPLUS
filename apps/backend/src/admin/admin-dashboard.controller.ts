import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminDetailsService } from './admin-details.service';
import { AdminUsageService } from './admin-usage.service';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { SignupFunnelService } from '../client-auth/signup-funnel.service';

/** Global stats, product insights and navigation alert badges. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly insightsService: AdminInsightsService,
    private readonly detailsService: AdminDetailsService,
    private readonly usageService: AdminUsageService,
    private readonly signupFunnel: SignupFunnelService,
  ) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Global platform statistics' })
  async getGlobalStats() {
    return this.dashboardService.getGlobalStats();
  }

  @Get('stats/insights')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Product analytics: growth, activation, retention, games, geography' })
  async getInsights(@Query() query: InsightsQueryDto) {
    return this.insightsService.getInsights(query.days ?? 30);
  }

  @Get('stats/usage')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Feature usage per merchant: used in the period, before, never; what is switched on now' })
  async getUsage(@Query() query: InsightsQueryDto) {
    return this.usageService.getUsage(query.days ?? 30);
  }

  @Get('stats/signup-funnel')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'JitPlus sign-up funnel: people per step, method and platform' })
  async getSignupFunnel(@Query() query: InsightsQueryDto) {
    const days = query.days ?? 30;
    return { days, rows: await this.signupFunnel.totals(days) };
  }

  @Get('alerts')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Lightweight counters for the navigation alert badges' })
  async getAlerts() {
    return this.detailsService.getAlerts();
  }
}
