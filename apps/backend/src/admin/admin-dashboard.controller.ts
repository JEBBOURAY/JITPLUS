import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminDetailsService } from './admin-details.service';
import { InsightsQueryDto } from './dto/insights-query.dto';

/** Global stats, product insights and navigation alert badges. */
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly insightsService: AdminInsightsService,
    private readonly detailsService: AdminDetailsService,
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

  @Get('alerts')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Lightweight counters for the navigation alert badges' })
  async getAlerts() {
    return this.detailsService.getAlerts();
  }
}
