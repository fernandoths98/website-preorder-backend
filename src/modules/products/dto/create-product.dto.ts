import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @Length(2, 48)
  sku: string;

  @IsString()
  @Length(2, 160)
  name: string;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(2, 60)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(1, 24)
  unit?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  /** Supplier cost in IDR. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice: number;

  /** Platform margin in IDR. Flexible because pricing is value/market based. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  margin: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
