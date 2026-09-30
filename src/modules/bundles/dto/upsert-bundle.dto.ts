import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
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

export class BundleRecipeDto {
  @IsInt() @Min(1) @Max(50) servings: number;
  @IsInt() @Min(1) @Max(31) sessions: number;
  @IsInt() @Min(1) @Max(600) minutes: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(500, { each: true }) ingredients: string[];
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(500, { each: true }) pantry: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(1000, { each: true }) steps: string[];
  @IsString() @MaxLength(1000) storage: string;
}
export class BundlePlanDto {
  @IsIn(['weekly', 'monthly']) period: 'weekly' | 'monthly';
  @IsIn(['dapur', 'cleaning', 'kulkas']) category: 'dapur' | 'cleaning' | 'kulkas';
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(500, { each: true }) missing: string[];
  @IsOptional() @ValidateNested() @Type(() => BundleRecipeDto) recipe?: BundleRecipeDto;
}

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
  @IsOptional()
  @ValidateNested()
  @Type(() => BundlePlanDto)
  plan?: BundlePlanDto | null;

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
