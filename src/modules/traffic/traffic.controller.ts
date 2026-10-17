import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { TrackViewDto } from './traffic.dto';
import { TrafficService } from './traffic.service';

@Controller()
export class TrafficController {
  // IP is used only in a bounded, one-minute in-memory abuse limit; never saved.
  private readonly requests = new Map<string, { until: number; count: number }>();
  constructor(private readonly service: TrafficService) {}

  @Public()
  @Post('traffic/views')
  @HttpCode(204)
  async track(@Body() dto: TrackViewDto, @Req() req: Request): Promise<void> {
    if (/bot|crawler|spider|headless|preview|facebookexternalhit/i.test(req.get('user-agent') ?? '')) return;
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    let bucket = this.requests.get(key);
    if (!bucket || bucket.until <= now) {
      if (this.requests.size >= 10000) {
        for (const [ip, value] of this.requests) if (value.until <= now) this.requests.delete(ip);
        if (this.requests.size >= 10000) return;
      }
      bucket = { until: now + 60000, count: 0 };
      this.requests.set(key, bucket);
    }
    if (++bucket.count > 60) return;
    await this.service.track(dto);
  }

  @Roles(AdminRole.OWNER, AdminRole.ADMIN)
  @Get('admin/traffic/summary')
  @Header('Cache-Control', 'no-store')
  summary(@Query('days') raw?: string) {
    const days = raw === undefined ? 7 : Number(raw);
    if (![7, 30].includes(days)) throw new BadRequestException('Periode harus 7 atau 30 hari.');
    return this.service.summary(days);
  }
}
