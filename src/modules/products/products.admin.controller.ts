import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { UpsertBatchPricesDto } from './dto/upsert-batch-prices.dto';
import { CommitImportDto, PreviewImportDto } from './dto/import-products.dto';
import { PricingSuggestionDto } from './dto/pricing-suggestion.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';

/** → /api/v1/admin/products/** — JwtAuthGuard + RolesGuard are global. */
@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/products')
export class ProductsAdminController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly importService: ProductsImportService,
  ) {}

  @Get()
  findAll(@Query() query: QueryCatalogDto) {
    return this.productsService.findAdminCatalog(query);
  }

  @Post('pricing-suggestion')
  @HttpCode(HttpStatus.OK)
  pricingSuggestion(@Body() dto: PricingSuggestionDto) {
    return this.productsService.pricingSuggestion(
      dto.basePrice,
      dto.marketReferencePrice,
    );
  }

  @Post('apply-pricing-policy')
  @HttpCode(HttpStatus.OK)
  applyPricingPolicy(@Body() body: { batchId?: number }) {
    return this.productsService.applyPricingPolicy(body.batchId);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.productsService.softRemove(id);
  }

  /**
   * Dry run — validates every row and reports what would change.
   * Writes nothing, so the operator can review before committing.
   */
  @Post('import/preview')
  @HttpCode(HttpStatus.OK)
  previewImport(@Body() dto: PreviewImportDto) {
    return this.importService.preview(dto.rows, dto.batchId);
  }

  /** Applies the approved rows in one transaction. */
  @Post('import/commit')
  @HttpCode(HttpStatus.OK)
  commitImport(@Body() dto: CommitImportDto) {
    return this.importService.commit(dto.rows, dto.batchId, dto.publishToBatch);
  }

  /** Weekly catalog publish / promo re-price. */
  @Post('batch-prices')
  @HttpCode(HttpStatus.OK)
  async upsertBatchPrices(@Body() dto: UpsertBatchPricesDto) {
    const affected = await this.productsService.upsertBatchPrices(
      dto.batchId,
      dto.items,
    );
    return { affected };
  }
}
