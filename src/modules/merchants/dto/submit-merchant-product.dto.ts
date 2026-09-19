import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
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
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  @Matches(/^(?:https?:\/\/|\/api\/v1\/uploads\/products\/)/, {
    each: true,
    message: 'Foto produk harus berupa URL http(s) atau hasil upload Website Preorder',
  })
  imageUrls: string[];
}
