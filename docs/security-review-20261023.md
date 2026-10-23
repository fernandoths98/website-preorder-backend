# Security review — Website Preorder, 23 October 2026

Scope: frontend and backend application source at b5cf9b4 / 6bb2ec6 and the accompanying fixes. This is a source review and regression suite, not a penetration-test certificate or a guarantee of zero vulnerabilities. No production payment, customer order, credential reset, or VPS configuration was changed during this work.

## Fixed findings

| Area | Previous behavior | Change |
| --- | --- | --- |
| Sessions | JWT claims remained authoritative after disabling an account or changing its password | Verify HS256, current database account status/role, and a password-derived HMAC session stamp on each authenticated request |
| Portal boundaries | Merchant routes lacked role checks; undefined merchant IDs could reach repository filters | Require merchant role on merchant profile, products, banners; require admin roles on admin routes |
| Login/activation | Unlimited guessing and activation-token reuse race | Bounded IP/email attempt windows; conditional one-time activation update; validated admin-set merchant passwords; dummy Argon2 verification for missing accounts |
| Public orders | Sequential order number alone exposed order/customer/payment recap | A separate signed, order-scoped 30-day capability is required before database lookup and payment recheck; never accept this capability as a login JWT |
| Checkout deduplication | Guessable phone/cart fingerprint could retrieve an existing order | Include an unpredictable checkout UUID in the fingerprint; no legacy fingerprint fallback |
| Customer integrity | New unauthenticated checkout by phone overwrote older orders' shared customer details | Immutable order-level name/delivery-note snapshots; leave existing customer records intact |
| Payment state | Stale provider queries/expiry could overwrite paid status; concurrent QR creation and callback writes could race | Serialize order/payment writes; conditional expiry/observation updates; paid state is monotonic; duplicate callbacks do not write twice |
| Payment validation | Currency/reference validation incomplete | Require exact IDR amount, validate references/status and callback key; recheck amount against locked order total before recording paid |
| Payment reference | Regeneration replaced references needed for late callbacks | Preserve issued QR references, retain failed generation references, reconcile failed attempts too; expired issued QR is shown as expired and requires a new checkout rather than replacement |
| Manual confirmation | Admin could confirm unpaid orders and overwrite a concurrent status change | Compare previous status atomically and require a paid payment for individual/bulk confirmation |
| Uploads | Trusted declared MIME and browser-supplied dimensions | Decode bounded JPEG/PNG/WebP, inspect actual dimensions, re-encode WebP, discard source metadata, use UUID filenames rather than route IDs; apply security headers before static assets |
| CSV | User-controlled text could become spreadsheet formulas | Escape formula-leading text; frontend CSV downloads use authenticated requests |
| Frontend | Tokens attached too broadly, route guard trusted local token existence, external QR rendering | Isolate portal token attachment, validate sessions on navigation, constrain login redirects, preserve sessions on network failure, render QR locally |
| Dependencies | Known vulnerable transitive/build packages | Update compatible package ranges/locks, align Nest core/platform, remove unused Nest cloud-deploy scaffold dependency and script; retain VPS Docker workflow |

Frontend also compacts the admin rail, moves six equal KPI tiles above the fold, places traffic beside operational status, makes traffic detail collapsible, and labels order value separately from settled payment revenue. Brand colors and logo are retained.

## Verification

- Backend production build and Jest regression suite; tests cover account revocation/roles, order-token tampering/expiry, login windows, callback key/amount/currency/reference, duplicate/stale payment updates, expired-reference preservation, manual confirmation gating, customer snapshots, and decoded upload validation.
- Frontend production build, `npm run test:security`, and existing bundle-editor suite. Security tests cover token isolation, recap/recheck headers, redirects, network/session failures, KPI ordering, and CSV action.
- `npm audit` reported zero known vulnerabilities for both final dependency trees on 23 October 2026. This is a registry snapshot, not proof that all dependencies are safe.
- Real-browser layout QA could not run in this environment: local Chromium download failed and the cloud browser could not reach the local preview. Dashboard component rendering/actions were checked with JSDOM; verify desktop/mobile appearance in staging.
- MySQL migration and transaction concurrency have not been exercised against a live MySQL instance here. Payment tests use controlled repository/transaction mocks. Run the staging checks below before release.

## Deployment contract

Deploy the companion frontend and backend together in a short checkout maintenance window. Back up the production database first. Apply **db/migrations/021-order-customer-snapshots.sql before starting the new API**. It adds nullable columns and backfills known legacy details; it does not delete orders/products. Re-running it leaves existing snapshots intact. Historical details overwritten before this release cannot be reconstructed by this migration.

All existing admin/merchant JWTs will be rejected once, requiring login again. Existing public order URLs do not contain a checkout capability and will require admin assistance. Do not restore number-only public lookup to work around this. New recap access works in the checkout browser, lasts 30 days, and is lost if site storage is cleared; cross-device customer access requires a future authenticated recovery flow.

VPS repository paths observed in this session:

- `/srv/kotdee-migration-20261021/var/www/backend`
- `/srv/kotdee-migration-20261021/var/www/websitepreorder/frontend`

Preserve `/root/wpo-deploy-20261023/api.compose.json`, the loopback API binding `127.0.0.1:23000`, existing networks, database volumes and uploads. Do not recreate the migrated deployment using stale `/var/www` compose labels. Do not use `down -v` or `--remove-orphans`. Rebuild frontend into the existing mounted `dist`, validate nginx configuration, then reload the existing `wpo-web` container. These PRs do not deploy automatically.

### Staging and post-deploy checks

1. Apply migration to a restored database copy, apply it again, verify unchanged order/product counts and snapshot values. Keep the additional columns if rolling back application images.
2. Log in separately as admin and approved merchant; verify each is denied access to the other portal's API. Change/reset a test password and suspend a test account; its existing JWT must stop working.
3. Complete a sandbox checkout. Refresh its recap in the same browser; verify missing/tampered access headers and different order numbers return 401 without customer data. Confirm that a random UUID on another checkout cannot recover the previous order.
4. Run provider sandbox payment/callback/query flows including wrong amount/currency/key, duplicate callback, concurrent expiry/query, timeout recovery and late successful payment. Check that paid never becomes pending/expired, unpaid cannot be manually confirmed, and cancelled-but-paid orders trigger operational refund review.
5. Test decoded product/banner upload and CSV download while authenticated. Check desktop/mobile layout and navigation.
6. Verify public HTTPS responses and headers through OpenLiteSpeed/Traefik, API health, error logs, and production payment alerts after rollout.

## Items outside verified scope

- VPS SSH/firewall, reverse proxy/TLS settings, backups, runtime environment/secrets and container images were not accessed. Independently verify patch levels and restrictive file permissions.
- `kotdee-nusapay-gateway` source and provider credential/signature verification are outside these repositories. The shared backend callback key does not replace verifying NusaPay signatures at that gateway. Check TLS, secret rotation and callback authenticity there before claiming end-to-end payment security.
- Attempt limiting is bounded **per API process**, resets on restart and may count a proxy IP if the forwarded chain is wrong. Validate Express `trust proxy` against the actual OLS/Traefik chain. Use a shared/edge limiter before scaling replicas; do not trust arbitrary client-supplied forwarding headers.
- JWTs and order capabilities remain browser storage credentials; XSS or a compromised extension can steal them. A strict production-tested CSP and HttpOnly session-cookie migration require separate integration work; headers here do not imply XSS immunity.
- Refunds, merchant settlements, disputes and verified phone ownership are not introduced by this change. Customer identity at guest checkout is still self-declared.
