import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaymentStatus } from '../entities/payment.entity';

export class QueryPaymentsDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  /** order number / customer / phone / provider reference */
  @IsOptional()
  @IsString()
  q?: string;

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
  limit = 25;
}
