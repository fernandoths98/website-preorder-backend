import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator'; import { Type } from 'class-transformer';
export class SubmitMerchantProductDto {
 @IsString() @Length(2,160) name:string; @IsOptional() @IsString() description?:string; @IsString() @Length(2,60) category:string;
 @IsString() @Length(1,24) unit:string; @Type(()=>Number) @IsNumber() @Min(0) basePrice:number; @Type(()=>Number) @IsNumber() @Min(1000) @Max(3000) margin:number;
 @IsArray() @ArrayMinSize(2) @ArrayMaxSize(3) @IsUrl({require_tld:false},{each:true}) imageUrls:string[];
}