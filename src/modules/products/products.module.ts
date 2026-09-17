import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';

import { Product } from './entities/product.entity';
import { ProductBatchPrice } from './entities/product-batch-price.entity';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { ProductsController } from './products.controller';
import { ProductsAdminController } from './products.admin.controller';
import { BatchesModule } from '../batches/batches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductBatchPrice]),
    // CacheInterceptor is applied inside this module, so CACHE_MANAGER must be
    // resolvable here. Registering locally keeps the module self-contained
    // instead of depending on a global registration in AppModule.
    CacheModule.register({ ttl: 60_000, max: 500 }),
    BatchesModule,
  ],
  controllers: [ProductsController, ProductsAdminController],
  providers: [ProductsService, ProductsImportService],
  exports: [ProductsService, ProductsImportService, TypeOrmModule],
})
export class ProductsModule {}
