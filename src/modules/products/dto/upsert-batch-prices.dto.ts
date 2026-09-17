import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PoStatus } from '../entities/product-batch-price.entity';

export class BatchPriceItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1000)
  @Max(3000)
  margin: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxQty?: number | null;

  @IsOptional()
  @IsEnum(PoStatus)
  poStatus?: PoStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpsertBatchPricesDto {
  @Type(() => Number)
  @IsInt()
  batchId: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BatchPriceItemDto)
  items: BatchPriceItemDto[];
}
