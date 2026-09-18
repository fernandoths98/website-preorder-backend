import { chromium } from 'playwright';

const DEFAULT_URL = 'https://klikindogrosir.com/searchByListCustom?div=51&&product_name=Kebutuhan%20Dapur&&kategori_name=Kebutuhan%20Dapur';

function parseEffectivePrice(text) {
  const unitMatch = text.match(/\/\s*([A-Z]+)/i);
  const unit = unitMatch?.[1]?.toLowerCase() || 'pcs';
  const beforeUnit = unitMatch ? text.slice(0, unitMatch.index) : text;
  const prices = [...beforeUnit.matchAll(/Rp\s*([\d.]+)/gi)]
    .map((m) => Number(m[1].replace(/\./g, '')))
    .filter(Number.isFinite);
  return { basePrice: prices.at(-1) ?? 0, unit };
}

export async function scrapeKlikIndogrosir() {
  const url = process.env.KLIKINDOGROSIR_URL || DEFAULT_URL;
  const minExpected = Number(process.env.MIN_EXPECTED_PRODUCTS || 30);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.product', { timeout: 30_000 });

    let previousCount = 0;
    let stableRounds = 0;
    let scrollIterations = 0;

    while (stableRounds < 4 && scrollIterations < 100) {
      const count = await page.locator('.product').count();
      stableRounds = count === previousCount ? stableRounds + 1 : 0;
      previousCount = count;
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1500);
      scrollIterations += 1;
    }

    const raw = await page.locator('.product').evaluateAll((cards) =>
      cards.map((card) => {
        const button = card.querySelector('.product-button button');
        return {
          externalId:
            card.id?.replace(/^plu_/, '') ||
            button?.getAttribute('plu') ||
            '',
          name: card.querySelector('.product-description')?.textContent?.trim() || '',
          imageUrl: card.querySelector('.product-img img')?.getAttribute('src') || '',
          storeCode: card.getAttribute('store_code') || '',
          priceText:
            card.querySelector('.pricelist-pr-unitt')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          available:
            Boolean(button?.classList.contains('btn-beli-available')) &&
            !(button?.disabled ?? false),
        };
      }),
    );

    const unique = new Map();
    for (const row of raw) {
      if (!/^\d+$/.test(row.externalId) || !row.name || !row.priceText) continue;
      const { basePrice, unit } = parseEffectivePrice(row.priceText);
      if (basePrice <= 0) continue;
      unique.set(row.externalId, {
        externalId: row.externalId,
        sku: `KIG-${row.externalId}`,
        name: row.name,
        category: 'Kebutuhan Dapur',
        unit,
        imageUrl: row.imageUrl || undefined,
        basePrice,
        available: row.available,
      });
    }

    const products = [...unique.values()];
    if (stableRounds < 4) throw new Error('snapshot incomplete: page never reached a stable product count');
    if (products.length < minExpected) {
      throw new Error(`snapshot rejected: only ${products.length} valid products, expected at least ${minExpected}`);
    }

    return { products, scrollIterations };
  } finally {
    await browser.close();
  }
}
