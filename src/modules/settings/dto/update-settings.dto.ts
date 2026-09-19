import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^(?:\+?62|0)8\d{7,11}$/, {
    message: 'Nomor WhatsApp tidak valid',
  })
  adminWhatsAppPhone?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  storefrontShipFromLabel?: string;

  @IsOptional()
  @IsString()
  @Length(2, 180)
  storefrontFreeDeliveryText?: string;

  @IsOptional()
  @IsString()
  @Length(2, 220)
  storefrontDeliveryNote?: string;
}
