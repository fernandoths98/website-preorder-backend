import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Rows arrive as raw strings straight from the CSV — validation and coercion
 * happen in the service so every problem can be reported per row instead of
 * the whole upload failing on one bad cell.
 */
export class ImportRowDto {
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() basePrice?: string;
  @IsOptional() @IsString() margin?: string;
  @IsOptional() @IsString() maxQty?: string;
  @IsOptional() @IsString() poStatus?: string;
}

export class PreviewImportDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows: ImportRowDto[];

  /** Omit to target the currently open batch. */
  @IsOptional() @Type(() => Number) @IsInt()
  batchId?: number;
}

export class CommitImportDto extends PreviewImportDto {
  /** Also publish each row into the batch's price list. */
  @IsOptional() @IsBoolean()
  publishToBatch?: boolean = true;
}
