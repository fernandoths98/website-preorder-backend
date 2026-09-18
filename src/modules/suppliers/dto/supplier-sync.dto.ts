import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class SupplierSyncProductDto {
  @IsString() externalId: string;
  @IsString() sku: string;
  @IsString() name: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsNumber() @Min(0) basePrice: number;
  @IsOptional() @IsNumber() @Min(1000) margin?: number;
  @IsOptional() @IsInt() @Min(1) maxQty?: number;
  @IsOptional() @IsBoolean() available?: boolean;
}

export class SupplierSyncDto {
  @Type(() => Number) @IsInt() @Min(1) supplierId: number;
  @IsOptional() @IsString() source?: string;
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => SupplierSyncProductDto)
  products: SupplierSyncProductDto[];
}
