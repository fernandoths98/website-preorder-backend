import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class NusapayCallbackDto {
  @IsString()
  partnerReferenceNo: string;

  @IsString()
  @IsIn(['00'])
  transactionStatus: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsObject()
  payload: Record<string, unknown>;
}
