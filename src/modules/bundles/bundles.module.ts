import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Bundle } from './entities/bundle.entity';
import { BundleItem } from './entities/bundle-item.entity';
import { Product } from '../products/entities/product.entity';
import { ProductBatchPrice } from '../products/entities/product-batch-price.entity';

import { BundlesService } from './bundles.service';
import { BundlesAdminService } from './bundles.admin.service';
import { BundlesController } from './bundles.controller';
import { BundlesAdminController } from './bundles.admin.controller';
import { BatchesModule } from '../batches/batches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bundle, BundleItem, Product, ProductBatchPrice]),
    // Registered locally so CacheInterceptor resolves here regardless of the
    // global registration — same fix as ProductsModule.
    CacheModule.register({ ttl: 30_000, max: 200 }),
    BatchesModule,
  ],
  controllers: [BundlesController, BundlesAdminController],
  providers: [BundlesService, BundlesAdminService],
  // OrdersService rebuilds paket lines at checkout.
  exports: [BundlesService],
})
export class BundlesModule {}
