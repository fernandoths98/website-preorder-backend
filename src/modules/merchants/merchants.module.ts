import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './entities/merchant.entity';
import { MerchantsController } from './merchants.controller';
import { MerchantsAdminController } from './merchants.admin.controller';
import { MerchantPortalController } from './merchant-portal.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MerchantsService } from './merchants.service';
@Module({imports:[TypeOrmModule.forFeature([Merchant]), JwtModule.registerAsync({imports:[ConfigModule],inject:[ConfigService],useFactory:(config:ConfigService)=>({secret:config.getOrThrow<string>('JWT_SECRET'),signOptions:{expiresIn:config.get('JWT_EXPIRES_IN','12h')}})})],controllers:[MerchantsController,MerchantsAdminController],providers:[MerchantsService]})
export class MerchantsModule {}
