import { Type } from 'class-transformer'; import { IsArray, IsBoolean, IsEmail, IsEnum, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { DeliveryFeeType, DeliveryMethod, OutsideRadiusPolicy } from '../entities/merchant.entity';
export class CreateMerchantDto {
 @IsString() @Length(2,160) businessName:string; @IsString() @Length(2,120) ownerName:string; @IsString() @Length(8,24) phone:string;
 @IsEmail() @MaxLength(160) email:string; @IsString() @Length(2,80) category:string; @IsString() @Length(5,255) address:string;
 @Type(()=>Number) @IsLatitude() latitude:number; @Type(()=>Number) @IsLongitude() longitude:number;
 @IsOptional() @IsString() @MaxLength(2000) description?:string; @IsOptional() @IsString() @MaxLength(160) instagram?:string;
 @IsOptional() @IsString() @MaxLength(512) logoUrl?:string; @IsEnum(DeliveryMethod) deliveryMethod:DeliveryMethod;
 @IsBoolean() freeDeliveryEnabled:boolean; @IsOptional() @Type(()=>Number) @IsNumber() @Min(0) @Max(500) freeDeliveryRadiusKm?:number;
 @IsOptional() @IsEnum(OutsideRadiusPolicy) outsideRadiusPolicy?:OutsideRadiusPolicy; @IsOptional() @IsEnum(DeliveryFeeType) deliveryFeeType?:DeliveryFeeType;
 @IsOptional() @Type(()=>Number) @IsNumber() @Min(0) deliveryFee?:number; @IsOptional() @Type(()=>Number) @IsNumber() @Min(0.1) @Max(1000) maxDeliveryRadiusKm?:number;
 @IsOptional() @IsArray() @IsString({each:true}) thirdPartyProviders?:string[];
}