import { IsString, Matches } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @Matches(/^(?:\+?62|0)8\d{7,11}$/, {
    message: 'Nomor WhatsApp tidak valid',
  })
  adminWhatsAppPhone: string;
}
