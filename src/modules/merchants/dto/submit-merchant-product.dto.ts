import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitMerchantProductDto {
  @IsString()
  @Length(2, 160)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @Length(2, 60)
  category: string;

  @IsString()
  @Length(1, 24)
  unit: string;

  /** Harga yang mitra ingin terima sebelum margin layanan WPO. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice: number;

  /** Opsional. Jika kosong, pricing policy WPO yang menentukan margin. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  margin?: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @IsUrl({ require_tld: false }, { each: true })
  imageUrls: string[];
}
