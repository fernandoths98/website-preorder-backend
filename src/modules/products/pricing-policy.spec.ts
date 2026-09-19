import { suggestPricing } from './pricing-policy';

describe('suggestPricing', () => {
  it('turns a Rp3.000 item into Rp5.000', () => {
    expect(suggestPricing(3_000)).toMatchObject({
      margin: 2_000,
      sellingPrice: 5_000,
    });
  });

  it('keeps a Rp42.000 staple around Rp46.000', () => {
    expect(suggestPricing(42_000)).toMatchObject({
      margin: 4_000,
      sellingPrice: 46_000,
    });
  });

  it('uses market reference as a sanity ceiling', () => {
    expect(suggestPricing(42_000, 44_000)).toMatchObject({
      sellingPrice: 45_000,
      marketReferencePrice: 44_000,
    });
  });

  it('uses lower percentage on expensive items', () => {
    expect(suggestPricing(120_000).sellingPrice).toBe(130_000);
  });
});
