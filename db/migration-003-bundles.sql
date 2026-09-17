-- ============================================================
-- migration-003-bundles.sql
-- Paket (bundle) support.
--
-- Model: a bundle is a FIXED SET priced as one unit.
--   * It stores NO cached price. Price is derived live from the member
--     products' base_price, so a supplier promo flows straight through.
--   * Margin is FLAT PER BUNDLE (not per item). That is the whole customer
--     advantage: 5 items bought loose carry 5x margin, the paket carries one.
--   * At order time the bundle EXPANDS into order_items rows tagged with
--     bundle_id, and the bundle margin is distributed across those rows.
--     v_sourcing_sheet therefore needs no change - it already groups by
--     product_id, so paket items land on the Thursday shopping list
--     alongside loose items automatically.
--
-- Run once:  mysql -u root -p wpo < migration-003-bundles.sql
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- ------------------------------------------------------------
-- 1. BUNDLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bundles` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`          VARCHAR(160)    NOT NULL,
  `name`          VARCHAR(160)    NOT NULL,
  `tagline`       VARCHAR(200)    NULL COMMENT 'one-liner on the card',
  `description`   TEXT            NULL,
  `target_market` VARCHAR(160)    NULL COMMENT 'anak kost, keluarga kecil, ...',
  `image_url`     VARCHAR(512)    NULL,
  -- Flat margin for the WHOLE paket, IDR. Keep it at or below the sum of the
  -- per-item margins it replaces, otherwise the paket is not a deal.
  `margin`        DECIMAL(12,2)   NOT NULL DEFAULT 3000.00,
  `max_qty`       INT UNSIGNED    NULL COMMENT 'cap per order, NULL = uncapped',
  `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
  `sort_order`    INT             NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    TIMESTAMP       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bundles_slug` (`slug`),
  KEY `idx_bundles_active_sort` (`is_active`, `sort_order`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. BUNDLE_ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bundle_items` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bundle_id`   BIGINT UNSIGNED NOT NULL,
  `product_id`  BIGINT UNSIGNED NOT NULL,
  `qty`         INT UNSIGNED    NOT NULL DEFAULT 1,
  `sort_order`  INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bundle_items` (`bundle_id`, `product_id`),
  KEY `idx_bundle_items_product` (`product_id`),
  CONSTRAINT `fk_bundle_items_bundle` FOREIGN KEY (`bundle_id`)
    REFERENCES `bundles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bundle_items_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. ORDER_ITEMS gains bundle provenance
--
-- The old UNIQUE (order_id, product_id) has to go: a customer can buy a
-- paket AND the same item loose in one order, and those must stay separate
-- lines so the paket's own price stays auditable. Sourcing still aggregates
-- correctly because the view GROUPs BY product_id.
-- ------------------------------------------------------------
ALTER TABLE `order_items`
  DROP INDEX `uq_order_items_order_product`;

ALTER TABLE `order_items`
  ADD COLUMN `bundle_id`   BIGINT UNSIGNED NULL AFTER `order_id`,
  ADD COLUMN `bundle_name` VARCHAR(160)    NULL AFTER `bundle_id`
    COMMENT 'snapshot - paket this line came from, NULL = bought loose',
  ADD KEY `idx_order_items_order` (`order_id`),
  ADD KEY `idx_order_items_bundle` (`bundle_id`),
  ADD CONSTRAINT `fk_order_items_bundle` FOREIGN KEY (`bundle_id`)
    REFERENCES `bundles` (`id`) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 4. LIVE BUNDLE PRICING VIEW
--
-- modal  = sum of member base_price * qty
-- price  = modal + bundle margin
-- loose  = what the same items cost bought individually (modal + per-item
--          margins). price < loose is the saving shown on the card.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW `v_bundle_pricing` AS
SELECT
  b.id                                  AS bundle_id,
  b.slug,
  b.name,
  COUNT(bi.id)                          AS line_count,
  SUM(bi.qty)                           AS items_count,
  SUM(p.base_price * bi.qty)            AS modal,
  b.margin                              AS bundle_margin,
  SUM(p.base_price * bi.qty) + b.margin AS bundle_price,
  SUM((p.base_price + p.margin) * bi.qty) AS loose_price,
  SUM((p.base_price + p.margin) * bi.qty)
    - (SUM(p.base_price * bi.qty) + b.margin) AS savings,
  MIN(p.is_active)                      AS all_members_active
FROM `bundles` b
JOIN `bundle_items` bi ON bi.bundle_id = b.id
JOIN `products` p      ON p.id = bi.product_id AND p.deleted_at IS NULL
WHERE b.deleted_at IS NULL
GROUP BY b.id, b.slug, b.name, b.margin;
