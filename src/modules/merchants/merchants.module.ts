import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Merchant } from './entities/merchant.entity';
import { MerchantBannerSubmission } from './entities/merchant-banner-submission.entity';
import { MerchantsController } from './merchants.controller';
import { MerchantsAdminController } from './merchants.admin.controller';
import { MerchantPortalController } from './merchant-portal.controller';
import { MerchantProductsController } from './merchant-products.controller';
import { MerchantProductsAdminController } from './merchant-products.admin.controller';
import { MerchantBannersController } from './merchant-banners.controller';
import { MerchantBannersAdminController } from './merchant-banners.admin.controller';
import { MerchantProductsService } from './merchant-products.service';
import { MerchantBannersService } from './merchant-banners.service';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { MerchantsService } from './merchants.service';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Merchant,
      Product,
      ProductImage,
      MerchantBannerSubmission,
    ]),
    PromotionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '12h') },
      }),
    }),
  ],
  controllers: [
    MerchantsController,
    MerchantsAdminController,
    MerchantPortalController,
    MerchantProductsController,
    MerchantProductsAdminController,
    MerchantBannersController,
    MerchantBannersAdminController,
  ],
  providers: [MerchantsService, MerchantProductsService, MerchantBannersService],
})
export class MerchantsModule {}
