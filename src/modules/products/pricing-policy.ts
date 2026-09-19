export interface PricingSuggestion {
  margin: number;
  sellingPrice: number;
  policySellingPrice: number;
  marketReferencePrice: number | null;
  reason: string;
}

function roundTo(value: number, step: number) {
  return Math.max(0, Math.round(value / step) * step);
}

/**
 * Convenience-first pricing:
 * - cheap items need a meaningful rupiah profit, not a tiny percentage;
 * - staples / mid-priced items stay close to common market pricing;
 * - expensive items use a lower percentage;
 * - when a market reference is known, allow at most Rp1.000 convenience premium.
 */
export function suggestPricing(
  basePrice: number,
  marketReferencePrice?: number | null,
): PricingSuggestion {
  const base = Math.max(0, Number(basePrice) || 0);

  let rawMargin: number;
  let reason: string;

  if (base <= 5_000) {
    rawMargin = 2_000;
    reason = 'Barang murah: minimum profit Rp2.000 supaya biaya layanan tetap kebayar.';
  } else if (base <= 10_000) {
    rawMargin = Math.max(2_500, base * 0.25);
    reason = 'Barang murah-menengah: sekitar 25% dengan minimum profit Rp2.500.';
  } else if (base <= 25_000) {
    rawMargin = Math.max(3_000, base * 0.20);
    reason = 'Barang menengah: sekitar 20% dengan minimum profit Rp3.000.';
  } else if (base <= 50_000) {
    rawMargin = Math.max(4_000, base * 0.10);
    reason = 'Sembako / barang sensitif harga: sekitar 10% dengan minimum profit Rp4.000.';
  } else if (base <= 100_000) {
    rawMargin = Math.max(5_000, base * 0.10);
    reason = 'Barang lebih mahal: sekitar 10% dengan minimum profit Rp5.000.';
  } else {
    rawMargin = Math.max(8_000, base * 0.08);
    reason = 'Barang mahal: persentase diturunkan supaya harga jual tetap masuk akal.';
  }

  const step = base <= 10_000 ? 500 : 1_000;
  const policyMargin = roundTo(rawMargin, step);
  const policySellingPrice = base + policyMargin;

  const market =
    marketReferencePrice != null && Number(marketReferencePrice) > 0
      ? Number(marketReferencePrice)
      : null;

  let sellingPrice = policySellingPrice;
  if (market !== null && market > base) {
    const marketCeiling = market + 1_000;
    if (sellingPrice > marketCeiling) {
      sellingPrice = Math.max(base, roundTo(marketCeiling, step));
      reason += ' Disesuaikan ke harga pasar + maksimal Rp1.000 convenience premium.';
    }
  }

  return {
    margin: Math.max(0, sellingPrice - base),
    sellingPrice,
    policySellingPrice,
    marketReferencePrice: market,
    reason,
  };
}
