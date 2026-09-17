import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DeliveryType } from '../entities/order.entity';

export class DeliveryAddressDto {
  @IsString()
  @Length(8, 255)
  line1: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  district?: string;

  @IsString()
  @Length(3, 120)
  city: string;

  @IsOptional()
  @Matches(/^\d{5}$/, { message: 'Kode pos harus 5 digit' })
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 160)
  landmark?: string;
}

export class OrderCustomerDto {
  @IsString()
  @Length(2, 120)
  name: string;

  /** Normalized to 62… on the client; re-checked here because clients lie. */
  @Matches(/^62\d{8,13}$/, { message: 'Nomor WhatsApp tidak valid' })
  phone: string;

  /** Office drop point (desk / floor). */
  @IsOptional()
  @IsString()
  @Length(2, 255)
  deliveryNote?: string;
}

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsEnum(DeliveryType)
  deliveryType: DeliveryType;

  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer: OrderCustomerDto;

  /**
   * Required only for deliveries outside the office. ValidateIf keeps this a
   * single endpoint instead of two — and makes the rule server-side, so a
   * client that skips the address form still gets rejected.
   */
  @ValidateIf((o: CreateOrderDto) => o.deliveryType === DeliveryType.OUTSIDE)
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  address: DeliveryAddressDto;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  note?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
