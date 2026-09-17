import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PoBatch } from './entities/po-batch.entity';
import { BatchesService } from './batches.service';
import { BatchesController } from './batches.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PoBatch])],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService, TypeOrmModule],
})
export class BatchesModule {}
