import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Payment } from './entities/payment.entity';
import { Customer } from '../customers/entities/customer.entity';
import { ProductBatchPrice } from '../products/entities/product-batch-price.entity';

import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersAdminService } from './orders.admin.service';
import { OrdersAdminController } from './orders.admin.controller';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsAdminController } from './payments.admin.controller';

import { BatchesModule } from '../batches/batches.module';
import { ProductsModule } from '../products/products.module';
import { BundlesModule } from '../bundles/bundles.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Payment, Customer, ProductBatchPrice]),
    BatchesModule,
    ProductsModule,
    BundlesModule,
    SettingsModule,
  ],
  controllers: [OrdersController, OrdersAdminController, PaymentsController, PaymentsAdminController],
  providers: [OrdersService, OrdersAdminService, PaymentsService],
  exports: [OrdersService, OrdersAdminService, PaymentsService, TypeOrmModule],
})
export class OrdersModule {}
