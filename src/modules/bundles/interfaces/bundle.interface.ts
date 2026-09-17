import { PoStatus } from '../../products/entities/product-batch-price.entity';

export interface BundleMemberView {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  /** Units of this product in one paket. */
  qty: number;
  /** Per-unit price if bought loose, for the "vs beli satuan" column. */
  loosePrice: number;
  poStatus: PoStatus;
}

export interface BundleView {
  bundleId: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  targetMarket: string | null;
  imageUrl: string | null;
  /** Total units across all members — "8 item". */
  itemsCount: number;
  /** SUM(base_price * qty) — what sourcing pays for one paket. */
  modal: number;
  /** The configured flat margin. The admin form edits this. */
  margin: number;
  /** modal + realized margin. What the customer pays for one paket. */
  price: number;
  /** Same items bought one by one. */
  loosePrice: number;
  /** loosePrice - price, always >= 0 when the paket is configured sanely. */
  savings: number;
  maxQty: number | null;
  /** available | limited | sold_out — the worst status among members. */
  poStatus: PoStatus;
  /** Names of members that are blocking this paket, for the admin view. */
  blockedBy: string[];
  members: BundleMemberView[];
}
