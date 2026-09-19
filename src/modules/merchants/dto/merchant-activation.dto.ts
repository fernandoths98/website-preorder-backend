import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateMerchantActivationDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}

export class ActivateMerchantDto {
  @IsString()
  @Length(32, 200)
  token: string;

  @IsString()
  @Length(8, 72)
  password: string;
}
