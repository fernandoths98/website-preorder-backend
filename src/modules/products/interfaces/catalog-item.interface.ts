import { PoStatus } from '../entities/product-batch-price.entity';

export interface CatalogFulfillment {
  sourceType: 'wpo' | 'merchant';
  sourceLabel: string;
  shippingLabel: string;
  deliveryNote: string;
}

export interface CatalogItem {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  category: string | null;
  unit: string;
  imageUrl: string | null;
  price: number;
  maxQty: number | null;
  poStatus: PoStatus;
  fulfillment: CatalogFulfillment;
}

export interface AdminCatalogItem extends CatalogItem {
  basePrice: number;
  margin: number;
  marketReferencePrice: number | null;
  suggestedMargin: number;
  suggestedPrice: number;
  pricingReason: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
