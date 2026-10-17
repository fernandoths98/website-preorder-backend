# Storefront traffic

Deploy the backend before enabling the frontend collector. No historic traffic is backfilled.

From `/var/www/backend`, after merging the backend PR:

```bash
(
  set -e
  git pull --ff-only origin main
  docker compose build api
  docker compose exec -T mysql sh -c 'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"' < db/migrations/020-site-traffic.sql
  docker compose up -d --no-deps api
  docker compose ps
)
```

The migration only creates `site_page_views`; it does not modify products, batches, orders, or merchant data. It is safe to rerun. Fresh installs also get the table through `db/init/05-site-traffic.sql`.

After merging the frontend PR, from `/var/www/websitepreorder/frontend`:

```bash
(
  set -e
  git pull --ff-only origin main
  docker run --rm -v "$PWD:/app" -w /app node:24-alpine sh -c 'npm ci && npm run build'
  docker compose up -d --force-recreate web
)
```

Open the storefront in a private browser window (not logged into admin), browse two different public pages, then open Admin → Ringkasan in your normal window and reload Trafik website. There should be one unique browser, one session, and two page views. Wait up to a minute for automatic refresh. Use `?utm_source=facebook` on the first storefront link to attribute that session to Facebook; sources are kept for the session.

Metrics:
- Unique visitors: distinct random browser IDs, persisted in local storage; not verified individual people. If storage is blocked, identity lasts only for the current tab runtime.
- Sessions: random tab-session ID renewed after 30 minutes without a tracked page navigation; not an exact online-user count.
- Page views: successful public route navigation/reload. Query/filter and hash-only changes do not count again. Excludes admin-authenticated browsers, admin/merchant-account/order paths, DNT-enabled browsers, and common bot user agents.
- Attribution: referrer host or `utm_source` (`facebook`, `instagram`, `tiktok`, `google`); unknown or suppressed referrers appear as direct/unknown. No referrer URL/query, IP, names, order numbers, or contact info are stored.
- Day boundaries: Asia/Jakarta; periods: 7 or 30 days. Collector uses server UTC time. Events older than 90 days are deleted in hourly batches (10,000 per run).
- The public collector is best-effort browser analytics, not an audited traffic counter. It uses event-ID deduplication and a per-process 60-event/IP/minute limit; sophisticated bots, client blocking, multiple devices, or cleared browser storage affect counts.

`GET /api/v1/admin/traffic/summary?days=7` requires owner/admin authentication. `POST /api/v1/traffic/views` is anonymous, accepts only validated public paths and random IDs, and returns 204.

Validation performed: backend Nest build, frontend Vue typecheck/Vite build, 12 backend unit tests, 5 frontend tracker tests. Real MySQL migration/execution and live authenticated dashboard still need deployment verification.
