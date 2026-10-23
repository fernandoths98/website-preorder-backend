# Continuous preorder with scheduled delivery

Customers can order regular products and bundles every day. The next eligible delivery date is displayed at checkout and confirmed in the request with `expectedDeliveryDate`. Products that are sold out/hidden, inactive, supplier-unavailable, or above the per-order limit remain unavailable.

The existing batch tables remain internal delivery/accounting groups so historic orders, prices and reports stay intact. Customers no longer select or see a batch code. The API resolves the earliest open delivery schedule with a future processing cutoff and a delivery date on/after today (Jakarta), even when its legacy `opensAt` lies in the future.

If the processing cutoff has passed, the API creates the next delivery group on demand by rolling the latest configured dated schedule forward in weekly increments. This preserves the delivery weekday, cutoff time, and lead time of the existing schedule. A fresh installation with no dated schedule uses Wednesday 23:59:59 WIB processing cutoff and Saturday delivery. Explicitly draft/cancelled/historical groups are never reopened. Concurrent creation reuses the unique schedule code. No cron run or manual opening is required for shopping to continue.

The existing idempotent catalog carry-forward seeds an empty new delivery group from the latest prior priced catalog, preserving prices, limits, and hidden/sold-out states. Existing priced groups are not overwritten. Bundles are priced from these member-product rows as before. Daily supplier imports/admin product and price updates still determine current availability and prices.

The Monday job only prepares/resolves the next schedule, and the closing job finalizes elapsed processing groups; neither blocks ordering for the next available delivery. The storefront cart keeps both regular products and bundles when the schedule changes, and restores persisted bundle savings. Before requesting QRIS, checkout refreshes the date. If it changed, it shows the new date and requires another click. The server also rejects a mismatched expected date before creating a payment. Legacy clients can continue sending a matching `batchId`; stale IDs get a refresh instruction rather than silently ordering for an unseen date.

Deploy backend first, then frontend. No database migration is needed.

```bash
cd /var/www/backend
(
  set -e
  git pull --ff-only origin main
  docker compose build api
  docker compose up -d --no-deps api
)
```

```bash
cd /var/www/websitepreorder/frontend
(
  set -e
  git pull --ff-only origin main
  docker run --rm -v "$PWD:/app" -w /app node:24-alpine sh -c 'npm ci && npm run build'
  docker compose up -d --force-recreate web
)
```

Smoke test: hard refresh the storefront, add an available regular item and a bundle, check that the cart remains populated and checkout shows a future delivery date without any closed-window notice or batch code. Confirm stock/limit validation. Do not create real QRIS payments merely to test deployment. The public `/api/v1/batches/current` still exists for compatibility and should resolve a bookable date; admin reporting continues using internal schedule IDs.

Validation: Nest production build; full Vue typecheck/Vite build; 16 focused Jest cases covering cutoff/weekly rollover, Jakarta dates, future-start scheduling, cancellation, concurrent schedule creation, checkout without client batch IDs, date confirmation, stock/quantity checks, and independent merchant ordering. DOM tests exercise the real checkout component and cart store: cart/savings persistence, regular+bundle payload, and reconfirmation before payment after a date change. Live MySQL schedule creation/carry-forward and real payment handling still require deployment verification.
