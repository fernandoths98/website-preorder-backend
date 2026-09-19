import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { StorefrontSettingsController } from './storefront-settings.controller';

@Module({
  controllers: [SettingsController, StorefrontSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
