import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PoStatus } from '../entities/product-batch-price.entity';

export const CATALOG_SECTIONS = [
  'dapur',
  'sayur-buah',
  'rumah-tangga',
  'paketan',
  'umkm',
] as const;

export type CatalogSection = (typeof CATALOG_SECTIONS)[number];

export class QueryCatalogDto {
  /** Omit to resolve the currently open batch. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  batchId?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  q?: string;

  /** High-level storefront section, independent from supplier category names. */
  @IsOptional()
  @IsIn(CATALOG_SECTIONS)
  section?: CatalogSection;

  @IsOptional()
  @IsEnum(PoStatus)
  status?: PoStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 24;
}
