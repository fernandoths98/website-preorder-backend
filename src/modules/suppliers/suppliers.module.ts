import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SupplierSyncRun } from './entities/supplier-sync-run.entity';
import { Product } from '../products/entities/product.entity';
import { ProductBatchPrice } from '../products/entities/product-batch-price.entity';
import { BatchesModule } from '../batches/batches.module';
import { SupplierSyncService } from './supplier-sync.service';
import { SupplierSyncController } from './supplier-sync.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierSyncRun, Product, ProductBatchPrice]), BatchesModule],
  controllers: [SupplierSyncController],
  providers: [SupplierSyncService],
  exports: [TypeOrmModule, SupplierSyncService],
})
export class SuppliersModule {}
