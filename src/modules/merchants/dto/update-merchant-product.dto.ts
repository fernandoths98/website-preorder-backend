import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMerchantProductDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  preorderDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  @Matches(/^(?:https?:\/\/|\/api\/v1\/uploads\/products\/)/, {
    each: true,
    message: 'Foto produk harus berupa URL http(s) atau hasil upload Website Preorder',
  })
  imageUrls?: string[];
}
