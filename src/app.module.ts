import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';

import { validationSchema } from './config/validation.schema';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuthModule } from './modules/auth/auth.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { BatchesModule } from './modules/batches/batches.module';
import { ProductsModule } from './modules/products/products.module';
import { ReportsModule } from './modules/reports/reports.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema }),
    ScheduleModule.forRoot(),
    CacheModule.register({ isGlobal: true, ttl: 60_000 }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME'),
        autoLoadEntities: true,
        // Never true: the schema has generated columns migrations must own.
        synchronize: false,
        timezone: '+07:00',
        charset: 'utf8mb4',
        extra: { connectionLimit: 10, decimalNumbers: false },
      }),
    }),
    AuthModule,
    SuppliersModule,
    BatchesModule,
    ProductsModule,
    OrdersModule,
    ReportsModule,
  ],
  providers: [
    // Order matters: authentication resolves req.user before roles are checked.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
