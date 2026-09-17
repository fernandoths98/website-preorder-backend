/**
 * Paket pricing — the single source of truth.
 *
 * The storefront card, the paket detail page and the order lines all call
 * this, so what a customer is shown is exactly what the order_items rows add
 * up to. Never re-derive a paket price anywhere else.
 *
 * ── Why margin has to be distributed ──────────────────────────────────────
 * order_items stores (base_price, margin) per unit and MySQL generates
 * line_total = (base_price + margin) * qty. A paket has ONE flat margin for
 * the whole set, so that margin has to be spread over the member lines. The
 * spread is proportional to each line's modal, in integer cents, so that:
 *
 *   SUM(unitMargin_i * qty_i) == realizedMargin   (exact, no drift)
 *
 * realizedMargin can land a few cents under the configured margin when no
 * combination of line quantities can consume the remainder. `price` is
 * therefore always computed from the realized figure, never from the
 * configured one — that is what keeps display and charge identical.
 *
 * All arithmetic is in integer cents. IDR is never a float here.
 */

const CENTS = 100;

export interface PricingMember {
  productId: string;
  /** Supplier cost per unit, IDR. */
  basePrice: number;
  /** The product's own per-unit margin when bought loose, IDR. */
  looseMargin: number;
  /** Units of this product in ONE paket. */
  qty: number;
}

export interface PricedMember extends PricingMember {
  /** Per-unit margin this line carries inside the paket, IDR. */
  bundleUnitMargin: number;
  /** (basePrice + bundleUnitMargin) * qty, IDR. */
  lineTotal: number;
}

export interface BundlePricing {
  /** SUM(basePrice * qty) — what sourcing actually pays. */
  modal: number;
  /** Margin actually carried by the lines (≤ configured margin). */
  realizedMargin: number;
  /** modal + realizedMargin — the paket's selling price. */
  price: number;
  /** SUM((basePrice + looseMargin) * qty) — the same items bought loose. */
  loosePrice: number;
  /** loosePrice - price. The number on the card. */
  savings: number;
  members: PricedMember[];
}

const toCents = (idr: number): number => Math.round(idr * CENTS);
const toIdr = (cents: number): number => cents / CENTS;

/**
 * Spreads `bundleMargin` across the members and prices the set.
 * Members with qty <= 0 are ignored. An empty set prices at zero.
 */
export function priceBundle(
  members: PricingMember[],
  bundleMargin: number,
): BundlePricing {
  const live = members.filter((m) => m.qty > 0);

  if (live.length === 0) {
    return {
      modal: 0,
      realizedMargin: 0,
      price: 0,
      loosePrice: 0,
      savings: 0,
      members: [],
    };
  }

  const baseCents = live.map((m) => toCents(m.basePrice));
  const weights = live.map((m, i) => baseCents[i] * m.qty);
  const modalCents = weights.reduce((a, b) => a + b, 0);
  const totalWeight = modalCents;
  const marginCents = Math.max(0, toCents(bundleMargin));

  // 1. Proportional floor, kept divisible by qty so the per-unit value is a
  //    whole number of cents.
  const unitMargin = live.map((m, i) => {
    if (totalWeight === 0) return 0;
    const share = Math.floor((marginCents * weights[i]) / totalWeight);
    return Math.floor(share / m.qty);
  });

  // 2. Hand out what the flooring left behind. Smallest quantities first —
  //    a qty-1 line can absorb any remainder, so a paket containing one
  //    always realizes the configured margin exactly.
  let remainder = marginCents - unitMargin.reduce((sum, u, i) => sum + u * live[i].qty, 0);
  const order = live
    .map((m, i) => ({ i, qty: m.qty }))
    .sort((a, b) => a.qty - b.qty);

  let progressed = true;
  while (remainder > 0 && progressed) {
    progressed = false;
    for (const { i, qty } of order) {
      if (qty <= remainder) {
        unitMargin[i] += 1;
        remainder -= qty;
        progressed = true;
        if (remainder === 0) break;
      }
    }
  }

  const realizedCents = unitMargin.reduce((sum, u, i) => sum + u * live[i].qty, 0);
  const looseCents = live.reduce(
    (sum, m, i) => sum + (baseCents[i] + toCents(m.looseMargin)) * m.qty,
    0,
  );

  const priced: PricedMember[] = live.map((m, i) => ({
    ...m,
    bundleUnitMargin: toIdr(unitMargin[i]),
    lineTotal: toIdr((baseCents[i] + unitMargin[i]) * m.qty),
  }));

  const priceCents = modalCents + realizedCents;

  return {
    modal: toIdr(modalCents),
    realizedMargin: toIdr(realizedCents),
    price: toIdr(priceCents),
    loosePrice: toIdr(looseCents),
    savings: toIdr(looseCents - priceCents),
    members: priced,
  };
}
