import { Controller, Get, Header, ParseIntPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';

/** → /api/v1/admin/reports/** */
@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  summary(@Query('batchId', new ParseIntPipe({ optional: true })) batchId?: number) {
    return this.reportsService.batchSummary(batchId);
  }

  @Get('sourcing')
  sourcing(@Query('batchId', new ParseIntPipe({ optional: true })) batchId?: number) {
    return this.reportsService.sourcingSheet(batchId);
  }

  @Get('sourcing.csv')
  @Header('Cache-Control', 'no-store')
  async sourcingCsv(
    @Res({ passthrough: true }) res: Response,
    @Query('batchId', new ParseIntPipe({ optional: true })) batchId?: number,
  ): Promise<string> {
    const { filename, csv } = await this.reportsService.sourcingCsv(batchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
