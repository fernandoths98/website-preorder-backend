import { PoStatus } from '../entities/product-batch-price.entity';

/** Public shape — base_price and margin are NEVER exposed to the storefront. */
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
}

/** Admin shape — margin visibility is the whole point of the dashboard. */
export interface AdminCatalogItem extends CatalogItem {
  basePrice: number;
  margin: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
