import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class QueryBundleProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  /** Selected members are resolved independently of search and batch publication. */
  @IsOptional()
  @Matches(/^\d+(,\d+){0,29}$/)
  ids?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
