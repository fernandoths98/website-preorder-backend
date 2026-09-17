import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderStatus } from '../entities/order.entity';

export class QueryOrdersDto {
  @IsOptional() @Type(() => Number) @IsInt()
  batchId?: number;

  @IsOptional() @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** name / phone / order_no */
  @IsOptional() @IsString()
  q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 25;
}
