import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

/** SKU is immutable once issued. */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['sku'] as const),
) {}
