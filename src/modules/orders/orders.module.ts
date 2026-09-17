import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { OrdersAdminService } from './orders.admin.service';
import { OrdersAdminController } from './orders.admin.controller';
import { BatchesModule } from '../batches/batches.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Customer]),
    BatchesModule,
    ProductsModule,
  ],
  controllers: [OrdersAdminController],
  providers: [OrdersAdminService],
  exports: [OrdersAdminService, TypeOrmModule],
})
export class OrdersModule {}
