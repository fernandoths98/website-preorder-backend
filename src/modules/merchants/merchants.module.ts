import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { MerchantsController } from './merchants.controller';
import { MerchantsAdminController } from './merchants.admin.controller';
import { MerchantsService } from './merchants.service';
@Module({imports:[TypeOrmModule.forFeature([Merchant])],controllers:[MerchantsController,MerchantsAdminController],providers:[MerchantsService]})
export class MerchantsModule {}
