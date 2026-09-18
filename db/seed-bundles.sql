-- ============================================================
-- seed-bundles.sql  — run AFTER migration-003-bundles.sql
--
-- Part A inserts the member products the pakets need and that the base
-- seed does not have (small oil, 500 g sugar, margarine sizes, condiments).
-- Part B defines the three pakets. Both are idempotent.
--
--   mysql -u root -p wpo < seed-bundles.sql
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

SET @supplier_id := (SELECT `id` FROM `suppliers` ORDER BY `id` LIMIT 1);

-- ------------------------------------------------------------
-- A. MEMBER PRODUCTS
-- base_price = supplier cost. Re-price weekly via /admin/import.
-- ------------------------------------------------------------
INSERT INTO `products`
  (`supplier_id`,`sku`,`slug`,`name`,`description`,`category`,`unit`,`image_url`,`base_price`,`margin`)
VALUES
  (@supplier_id,'MYK-GRG-1','minyak-goreng-1l','Minyak Goreng 1 L','Kemasan pouch, pas untuk satu orang.','Sembako','pcs','https://picsum.photos/seed/minyak1l/600/600',17500,1500),
  (@supplier_id,'GLA-PSR-500','gula-pasir-500g','Gula Pasir 500 g','Kemasan kecil, tidak mudah menggumpal.','Sembako','pack','https://picsum.photos/seed/gula500/600/600',8000,1000),
  (@supplier_id,'MRG-CUP-200','margarin-cup-200g','Margarin Cup 200 g','Serbaguna untuk masak & oles roti.','Sembako','cup','https://picsum.photos/seed/margarin200/600/600',6500,1000),
  (@supplier_id,'MRG-CUP-250','margarin-cup-250g','Margarin Cup 250 g','Ukuran keluarga kecil.','Sembako','cup','https://picsum.photos/seed/margarin250/600/600',8000,1000),
  (@supplier_id,'MRG-KLG-500','margarin-kaleng-500g','Margarin Kaleng 500 g','Stok sebulan, tahan lama.','Sembako','kaleng','https://picsum.photos/seed/margarin500/600/600',15000,2000),
  (@supplier_id,'TEH-CLP-25','teh-celup-25s','Teh Celup Isi 25','Teh hitam, seduh cepat.','Minuman','box','https://picsum.photos/seed/teh/600/600',5500,1000),
  (@supplier_id,'MIE-INS-1','mie-instan-pcs','Mie Instan (per pcs)','Rasa campur sesuai stok toko.','Makanan Instan','pcs','https://picsum.photos/seed/mie1/600/600',2800,1000),
  (@supplier_id,'KCP-MNS-520','kecap-manis-520ml','Kecap Manis 520 ml','Botol, kental dan legit.','Bumbu','btl','https://picsum.photos/seed/kecap/600/600',12500,2000),
  (@supplier_id,'SAS-SMB-335','saus-sambal-335ml','Saus Sambal 335 ml','Botol, pedas sedang.','Bumbu','btl','https://picsum.photos/seed/sambal/600/600',11000,1500),
  (@supplier_id,'SNT-INS-65','santan-instan-65ml','Santan Instan 65 ml','Sekali pakai, tanpa peras kelapa.','Bumbu','pcs','https://picsum.photos/seed/santan/600/600',4000,1000)
ON DUPLICATE KEY UPDATE
  `name`       = VALUES(`name`),
  `base_price` = VALUES(`base_price`),
  `margin`     = VALUES(`margin`),
  `image_url`  = VALUES(`image_url`);

-- ------------------------------------------------------------
-- B. PAKET DEFINITIONS
-- ------------------------------------------------------------
INSERT INTO `bundles`
  (`slug`,`name`,`tagline`,`description`,`target_market`,`image_url`,`margin`,`max_qty`,`sort_order`)
VALUES
  ('paket-hemat-anak-kost','Paket Hemat Anak Kost',
   'Stok dapur secukupnya buat yang tinggal sendiri — di bawah Rp50rb.',
   'Isi secukupnya untuk satu orang: minyak kemasan kecil, gula 500 g, margarin, teh celup, dan mie instan. Tidak ada ukuran besar yang keburu basi sebelum habis.',
   'Anak kost & pekerja yang tinggal sendiri',
   '/img/paket-anak-kost.svg', 2500, 5, 1),

  ('paket-hemat-1-minggu','Paket Hemat 1 Minggu',
   'Belanja mingguan keluarga kecil, sekali angkut.',
   'Cukup untuk 2-3 orang selama seminggu: minyak 2 L, gula 1 kg, tepung terigu 1 kg, margarin 250 g, dan satu kaleng susu kental manis.',
   'Keluarga kecil 2-3 orang',
   '/img/paket-hemat-mingguan.svg', 4000, 5, 2),

  ('paket-bulanan-rumah-tangga','Paket Bulanan Rumah Tangga',
   'Sekali belanja, aman sebulan. Hemat paling besar.',
   'Stok bulanan lengkap: minyak 4 L, gula 2 kg, tepung 2 kg, margarin kaleng 500 g, plus bumbu dasar — kecap manis, saus sambal, dan santan instan.',
   'Rumah tangga yang belanja bulanan',
   '/img/paket-bulanan-rumah-tangga.svg', 6000, 3, 3)
ON DUPLICATE KEY UPDATE
  `name`          = VALUES(`name`),
  `tagline`       = VALUES(`tagline`),
  `description`   = VALUES(`description`),
  `target_market` = VALUES(`target_market`),
  `image_url`     = VALUES(`image_url`),
  `margin`        = VALUES(`margin`),
  `max_qty`       = VALUES(`max_qty`),
  `sort_order`    = VALUES(`sort_order`),
  `deleted_at`    = NULL;

-- ------------------------------------------------------------
-- C. PAKET CONTENTS  (resolved by SKU, so order of inserts is irrelevant)
-- ------------------------------------------------------------
INSERT INTO `bundle_items` (`bundle_id`, `product_id`, `qty`, `sort_order`)
SELECT b.`id`, p.`id`, x.`qty`, x.`sort_order`
FROM (
  -- Paket Hemat Anak Kost
  SELECT 'paket-hemat-anak-kost' AS bundle_slug, 'MYK-GRG-1'   AS sku, 1 AS qty, 1 AS sort_order UNION ALL
  SELECT 'paket-hemat-anak-kost', 'GLA-PSR-500',  1, 2 UNION ALL
  SELECT 'paket-hemat-anak-kost', 'MRG-CUP-200',  1, 3 UNION ALL
  SELECT 'paket-hemat-anak-kost', 'TEH-CLP-25',   1, 4 UNION ALL
  SELECT 'paket-hemat-anak-kost', 'MIE-INS-1',    2, 5 UNION ALL
  -- Paket Hemat 1 Minggu
  SELECT 'paket-hemat-1-minggu', 'MYK-GRG-2',     1, 1 UNION ALL
  SELECT 'paket-hemat-1-minggu', 'GLA-PSR-1',     1, 2 UNION ALL
  SELECT 'paket-hemat-1-minggu', 'TPG-TRG-1',     1, 3 UNION ALL
  SELECT 'paket-hemat-1-minggu', 'MRG-CUP-250',   1, 4 UNION ALL
  SELECT 'paket-hemat-1-minggu', 'SUS-KTL-370',   1, 5 UNION ALL
  -- Paket Bulanan Rumah Tangga
  SELECT 'paket-bulanan-rumah-tangga', 'MYK-GRG-2',   2, 1 UNION ALL
  SELECT 'paket-bulanan-rumah-tangga', 'GLA-PSR-1',   2, 2 UNION ALL
  SELECT 'paket-bulanan-rumah-tangga', 'TPG-TRG-1',   2, 3 UNION ALL
  SELECT 'paket-bulanan-rumah-tangga', 'MRG-KLG-500', 1, 4 UNION ALL
  SELECT 'paket-bulanan-rumah-tangga', 'KCP-MNS-520', 1, 5 UNION ALL
  SELECT 'paket-bulanan-rumah-tangga', 'SAS-SMB-335', 1, 6 UNION ALL
  SELECT 'paket-bulanan-rumah-tangga', 'SNT-INS-65',  2, 7
) x
JOIN `bundles`  b ON b.`slug` = x.`bundle_slug`
JOIN `products` p ON p.`sku`  = x.`sku`
ON DUPLICATE KEY UPDATE
  `qty`        = VALUES(`qty`),
  `sort_order` = VALUES(`sort_order`);

-- Sanity check — every paket should show a positive `savings`.
SELECT `slug`, `items_count`, `modal`, `bundle_price`, `loose_price`, `savings`
FROM `v_bundle_pricing`
ORDER BY `bundle_id`;
