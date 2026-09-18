import {
  CacheInterceptor,
  CacheTTL,
} from '@nestjs/cache-manager';
import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';

import { BundlesService } from './bundles.service';
import { Public } from '../../common/decorators/public.decorator';

/** → /api/v1/bundles/** — storefront, no auth. */
@Public()
@Controller('bundles')
@UseInterceptors(CacheInterceptor)
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  /** Short TTL: prices move when the admin re-prices mid-week. */
  @Get()
  @CacheTTL(30_000)
  findAll(@Query('batchId') batchId?: string) {
    return this.bundlesService.findAll(batchId);
  }

  @Get(':slug')
  @CacheTTL(30_000)
  findOne(@Param('slug') slug: string, @Query('batchId') batchId?: string) {
    return this.bundlesService.findOneBySlug(slug, batchId);
  }
}
