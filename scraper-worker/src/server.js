import express from 'express';
import { scrapeKlikIndogrosir } from './klikindogrosir.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

let running = false;

app.get('/health', (_req, res) => {
  res.json({ ok: true, running });
});

app.post('/jobs/klikindogrosir', async (_req, res) => {
  if (running) return res.status(409).json({ ok: false, error: 'scrape already running' });

  const token = process.env.SUPPLIER_SYNC_TOKEN;
  const supplierId = Number(process.env.KLIKINDOGROSIR_SUPPLIER_ID);
  const backendUrl = process.env.BACKEND_URL || 'http://wpo-api:3000';
  if (!token || !Number.isInteger(supplierId) || supplierId < 1) {
    return res.status(500).json({ ok: false, error: 'worker configuration incomplete' });
  }

  running = true;
  try {
    const snapshot = await scrapeKlikIndogrosir();
    const response = await fetch(`${backendUrl}/api/v1/internal/supplier-sync/reconcile`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-supplier-sync-token': token,
      },
      body: JSON.stringify({
        supplierId,
        source: 'klikindogrosir-playwright',
        snapshotComplete: true,
        products: snapshot.products,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`backend reconcile failed (${response.status}): ${JSON.stringify(body)}`);

    return res.json({
      ok: true,
      scraped: snapshot.products.length,
      scrollIterations: snapshot.scrollIterations,
      reconcile: body,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, '0.0.0.0', () => console.log(`wpo-scraper-worker listening on :${port}`));
