import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { PoBatch } from '../batches/entities/po-batch.entity';
import { BatchesModule } from '../batches/batches.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, PoBatch]), BatchesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
