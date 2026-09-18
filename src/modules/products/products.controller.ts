import {
  CacheInterceptor,
  CacheTTL,
} from '@nestjs/cache-manager';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';

import { ProductsService } from './products.service';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { Public } from '../../common/decorators/public.decorator';
import {
  CatalogItem,
  Paginated,
} from './interfaces/catalog-item.interface';

/**
 * Storefront catalog. Mounted under the global prefix `api/v1`
 * → GET /api/v1/products  (proxy_pass /api/ upstream, no path rewrite needed)
 */
@Public()
@Controller('products')
@UseInterceptors(CacheInterceptor)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @CacheTTL(60_000)
  findAll(@Query() query: QueryCatalogDto): Promise<Paginated<CatalogItem>> {
    return this.productsService.findCatalog(query);
  }

  @Get('categories')
  @CacheTTL(60_000)
  findCategories(
    @Query('batchId', new ParseIntPipe({ optional: true })) batchId?: number,
  ): Promise<Array<{ name: string; count: number }>> {
    return this.productsService.findCategories(batchId);
  }

  @Get(':slug')
  @CacheTTL(60_000)
  findOne(
    @Param('slug') slug: string,
    @Query('batchId', new ParseIntPipe({ optional: true })) batchId?: number,
  ): Promise<CatalogItem> {
    return this.productsService.findOneBySlug(slug, batchId);
  }
}
