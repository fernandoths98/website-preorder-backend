import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
export class CreateMerchantDto {
  @IsString() @Length(2,160) businessName:string;
  @IsString() @Length(2,120) ownerName:string;
  @IsString() @Length(8,24) phone:string;
  @IsOptional() @IsEmail() @MaxLength(160) email?:string;
  @IsString() @Length(2,80) category:string;
  @IsString() @Length(5,255) address:string;
  @IsOptional() @IsString() @MaxLength(2000) description?:string;
  @IsOptional() @IsString() @MaxLength(160) instagram?:string;
  @IsOptional() @IsString() @MaxLength(512) logoUrl?:string;
}
