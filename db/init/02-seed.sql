-- ============================================================
-- Dev seed — one OPEN batch + catalog so the storefront has content.
-- Run after schema.sql:  mysql -u root -p wpo < db/seed.sql
--
-- The batch window is relative to NOW() so the PO reads as "open"
-- whatever day you run this. For production the Monday/Wednesday
-- cron in BatchesService owns the lifecycle instead.
-- ============================================================

-- Runs inside the database docker-entrypoint created from DB_NAME
-- (MYSQL_DATABASE), so there is deliberately no CREATE DATABASE / USE here.

SET @margin := 2000.00;

-- ---------- supplier ----------
INSERT INTO `suppliers` (`name`, `phone`, `address`)
VALUES ('Supplier Utama', '628123456789', 'Tangerang')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
SET @supplier_id := (SELECT id FROM suppliers WHERE name = 'Supplier Utama' LIMIT 1);

-- ---------- open batch ----------
INSERT INTO `po_batches` (`code`, `opens_at`, `closes_at`, `delivery_date`, `status`)
VALUES (
  CONCAT('PO-', YEAR(NOW()), '-W', LPAD(WEEK(NOW(), 3), 2, '0')),
  DATE_SUB(NOW(), INTERVAL 1 DAY),
  DATE_ADD(NOW(), INTERVAL 2 DAY),
  DATE_ADD(CURDATE(), INTERVAL 4 DAY),
  'open'
)
ON DUPLICATE KEY UPDATE
  `opens_at`  = VALUES(`opens_at`),
  `closes_at` = VALUES(`closes_at`),
  `status`    = 'open';
SET @batch_id := (SELECT id FROM po_batches ORDER BY opens_at DESC LIMIT 1);

-- ---------- catalog ----------
-- base_price = harga promo supplier, margin = micro-margin kita.
INSERT INTO `products`
  (`supplier_id`,`sku`,`slug`,`name`,`description`,`category`,`unit`,`image_url`,`base_price`,`margin`)
VALUES
  (@supplier_id,'BRS-PRM-5','beras-premium-5kg','Beras Premium 5 kg','Pulen, cocok untuk sehari-hari.','Sembako','pack','https://picsum.photos/seed/beras/600/600',62000,3000),
  (@supplier_id,'MYK-GRG-2','minyak-goreng-2l','Minyak Goreng 2 L','Minyak sawit kemasan pouch.','Sembako','pcs','https://picsum.photos/seed/minyak/600/600',33000,2000),
  (@supplier_id,'GLA-PSR-1','gula-pasir-1kg','Gula Pasir 1 kg','Gula kristal putih.','Sembako','kg','https://picsum.photos/seed/gula/600/600',15500,1500),
  (@supplier_id,'TLR-AYM-1','telur-ayam-1kg','Telur Ayam Negeri 1 kg','Isi sekitar 16 butir.','Protein','kg','https://picsum.photos/seed/telur/600/600',27000,2000),
  (@supplier_id,'TPG-TRG-1','tepung-terigu-1kg','Tepung Terigu 1 kg','Serbaguna untuk gorengan & kue.','Sembako','kg','https://picsum.photos/seed/tepung/600/600',12000,1000),
  (@supplier_id,'MIE-INS-40','mie-instan-dus','Mie Instan 1 Dus (40 pcs)','Rasa campur sesuai stok toko.','Makanan Instan','dus','https://picsum.photos/seed/mie/600/600',108000,3000),
  (@supplier_id,'KPI-BBK-200','kopi-bubuk-200g','Kopi Bubuk 200 g','Robusta lokal, giling halus.','Minuman','pack','https://picsum.photos/seed/kopi/600/600',18000,2000),
  (@supplier_id,'SUS-KTL-370','susu-kental-manis','Susu Kental Manis 370 g','Kaleng, untuk kopi & roti.','Minuman','pcs','https://picsum.photos/seed/susu/600/600',11500,1500),
  (@supplier_id,'SBN-CCI-800','sabun-cuci-piring-800','Sabun Cuci Piring 800 ml','Refill pouch, wangi jeruk nipis.','Kebersihan','pcs','https://picsum.photos/seed/sabun/600/600',14000,1500),
  (@supplier_id,'DTG-BBK-770','deterjen-bubuk-770g','Deterjen Bubuk 770 g','Untuk mesin cuci & tangan.','Kebersihan','pack','https://picsum.photos/seed/deterjen/600/600',19500,2000),
  (@supplier_id,'GAS-LPG-3','gas-lpg-3kg','Gas LPG 3 kg (Tukar Tabung)','Wajib tukar tabung kosong.','Rumah Tangga','tabung','https://picsum.photos/seed/lpg/600/600',22000,3000),
  (@supplier_id,'AQU-GLN-19','air-galon-19l','Air Mineral Galon 19 L','Tukar galon kosong.','Minuman','galon','https://picsum.photos/seed/galon/600/600',20000,2000)
ON DUPLICATE KEY UPDATE
  `name`       = VALUES(`name`),
  `base_price` = VALUES(`base_price`),
  `margin`     = VALUES(`margin`),
  `image_url`  = VALUES(`image_url`);

-- ---------- publish catalog into the open batch ----------
-- This is the row the storefront actually reads.
INSERT INTO `product_batch_prices`
  (`batch_id`,`product_id`,`base_price`,`margin`,`max_qty`,`po_status`,`sort_order`)
SELECT
  @batch_id,
  p.id,
  p.base_price,
  p.margin,
  CASE p.sku WHEN 'GAS-LPG-3' THEN 2 WHEN 'BRS-PRM-5' THEN 4 ELSE NULL END,
  CASE p.sku WHEN 'MIE-INS-40' THEN 'limited' WHEN 'AQU-GLN-19' THEN 'sold_out' ELSE 'available' END,
  ROW_NUMBER() OVER (ORDER BY p.category, p.name)
FROM `products` p
WHERE p.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  `base_price` = VALUES(`base_price`),
  `margin`     = VALUES(`margin`),
  `po_status`  = VALUES(`po_status`);

-- ---------- admin user ----------
-- Generate a real argon2id hash first (a hand-written one will never verify):
--   node -e "require('argon2').hash('YourPassword',{type:2}).then(console.log)"
-- then paste it below and run this block.
--
-- INSERT INTO `admin_users` (`email`, `password_hash`, `role`)
-- VALUES ('admin@websitepreorder.online', '<paste-argon2id-hash-here>', 'owner')
-- ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`);

SELECT
  (SELECT COUNT(*) FROM products) AS products,
  (SELECT COUNT(*) FROM product_batch_prices WHERE batch_id = @batch_id) AS published,
  (SELECT code FROM po_batches WHERE id = @batch_id) AS batch;
