import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BundleItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(99)
  qty: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class CreateBundleDto {
  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  targetMarket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  imageUrl?: string;

  /**
   * Flat margin for the whole paket. Upper bound is deliberately loose here;
   * the service rejects a margin that would make the paket cost more than
   * buying the same items loose, which is the rule that actually matters.
   */
  @IsNumber()
  @Min(0)
  @Max(100_000)
  margin: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  maxQty?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BundleItemDto)
  items: BundleItemDto[];
}

/** Every field optional — the admin form PATCHes only what changed.
 *  Omitting `items` leaves the paket contents untouched. */
export class UpdateBundleDto extends PartialType(CreateBundleDto) {}
