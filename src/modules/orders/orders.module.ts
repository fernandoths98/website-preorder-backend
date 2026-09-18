import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { ProductBatchPrice } from '../products/entities/product-batch-price.entity';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersAdminService } from './orders.admin.service';
import { OrdersAdminController } from './orders.admin.controller';

import { BatchesModule } from '../batches/batches.module';
import { ProductsModule } from '../products/products.module';
import { BundlesModule } from '../bundles/bundles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Customer, ProductBatchPrice]),
    BatchesModule,
    ProductsModule,
    BundlesModule,
  ],
  controllers: [OrdersController, OrdersAdminController],
  providers: [OrdersService, OrdersAdminService],
  exports: [OrdersService, OrdersAdminService, TypeOrmModule],
})
export class OrdersModule {}
