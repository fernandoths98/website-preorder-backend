import { IsIn, IsUUID, Matches } from 'class-validator';

export class TrackViewDto {
  @IsUUID('4') eventId: string;
  @IsUUID('4') visitorId: string;
  @IsUUID('4') sessionId: string;
  // Never collect query strings, order numbers, login or account paths.
  @Matches(/^\/(?:product\/[a-z0-9-]{1,180}|paket\/[a-z0-9-]{1,180}|cart|checkout|mitra\/daftar)?$/)
  path: string;
  @IsIn(['direct', 'facebook', 'instagram', 'tiktok', 'google', 'other'])
  source: string;
  @IsIn(['mobile', 'tablet', 'desktop']) device: string;
}
