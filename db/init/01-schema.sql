-- ============================================================
-- websitepreorder.online — MySQL 8.0 schema (MVP)
-- Engine: InnoDB / utf8mb4_0900_ai_ci
-- Money: DECIMAL(12,2) in IDR (no float, ever)
-- ============================================================

-- Runs inside the database docker-entrypoint created from DB_NAME
-- (MYSQL_DATABASE), so there is deliberately no CREATE DATABASE / USE here.

-- ------------------------------------------------------------
-- 1. SUPPLIERS (anchor stores you source from)
-- ------------------------------------------------------------
CREATE TABLE `suppliers` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)    NOT NULL,
  `phone`         VARCHAR(20)     NULL,
  `address`       VARCHAR(255)    NULL,
  `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_suppliers_active` (`is_active`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. PO_BATCHES (the weekly operational cycle)
--    One row per week. Everything hangs off a batch so the
--    catalog, prices and aggregation are naturally scoped.
-- ------------------------------------------------------------
CREATE TABLE `po_batches` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(20)     NOT NULL COMMENT 'e.g. PO-2026-W38',
  `opens_at`      DATETIME        NOT NULL COMMENT 'Mon 00:00 WIB',
  `closes_at`     DATETIME        NOT NULL COMMENT 'Wed 23:59 WIB',
  `delivery_date` DATE            NULL     COMMENT 'Sat/Sun',
  `status`        ENUM('draft','open','closed','sourcing','delivered','cancelled')
                                  NOT NULL DEFAULT 'draft',
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_po_batches_code` (`code`),
  KEY `idx_po_batches_status_window` (`status`, `opens_at`, `closes_at`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. PRODUCTS (master catalog — stable identity, no weekly price)
-- ------------------------------------------------------------
CREATE TABLE `products` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `supplier_id`   BIGINT UNSIGNED NULL,
  `sku`           VARCHAR(48)     NOT NULL,
  `slug`          VARCHAR(160)    NOT NULL,
  `name`          VARCHAR(160)    NOT NULL,
  `description`   TEXT            NULL,
  `category`      VARCHAR(60)     NULL,
  `unit`          VARCHAR(24)     NOT NULL DEFAULT 'pcs' COMMENT 'pcs/kg/pack/liter',
  `image_url`     VARCHAR(512)    NULL,
  -- Reference pricing (the "normal" price; weekly promo lives in product_batch_prices)
  `base_price`    DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT 'supplier cost',
  `margin`        DECIMAL(12,2)   NOT NULL DEFAULT 2000.00 COMMENT 'flat micro-margin IDR',
  `selling_price` DECIMAL(12,2)   AS (`base_price` + `margin`) STORED,
  `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    TIMESTAMP       NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_sku` (`sku`),
  UNIQUE KEY `uq_products_slug` (`slug`),
  KEY `idx_products_active_category` (`is_active`, `category`),
  KEY `idx_products_supplier` (`supplier_id`),
  FULLTEXT KEY `ft_products_name` (`name`, `description`),
  CONSTRAINT `fk_products_supplier` FOREIGN KEY (`supplier_id`)
    REFERENCES `suppliers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. PRODUCT_BATCH_PRICES (weekly catalog + promo overrides)
--    This is what the storefront actually reads.
-- ------------------------------------------------------------
CREATE TABLE `product_batch_prices` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_id`      BIGINT UNSIGNED NOT NULL,
  `product_id`    BIGINT UNSIGNED NOT NULL,
  `base_price`    DECIMAL(12,2)   NOT NULL COMMENT 'supplier promo price this week',
  `margin`        DECIMAL(12,2)   NOT NULL,
  `selling_price` DECIMAL(12,2)   AS (`base_price` + `margin`) STORED,
  `max_qty`       INT UNSIGNED    NULL COMMENT 'NULL = unlimited (zero inventory)',
  `po_status`     ENUM('available','limited','sold_out','hidden')
                                  NOT NULL DEFAULT 'available',
  `sort_order`    SMALLINT        NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pbp_batch_product` (`batch_id`, `product_id`),
  KEY `idx_pbp_batch_status_sort` (`batch_id`, `po_status`, `sort_order`),
  CONSTRAINT `fk_pbp_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `po_batches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pbp_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. CUSTOMERS (lightweight — WA number is the identity)
-- ------------------------------------------------------------
CREATE TABLE `customers` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(120)    NOT NULL,
  `phone`         VARCHAR(20)     NOT NULL COMMENT 'E.164 without +, e.g. 62812...',
  `delivery_note` VARCHAR(255)    NULL COMMENT 'desk / floor / address',
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_phone` (`phone`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. ORDERS (header — totals are snapshots, never recomputed from products)
-- ------------------------------------------------------------
CREATE TABLE `orders` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`        VARCHAR(24)     NOT NULL COMMENT 'WPO-20260915-0001',
  `batch_id`        BIGINT UNSIGNED NOT NULL,
  `customer_id`     BIGINT UNSIGNED NOT NULL,
  `status`          ENUM('pending','confirmed','sourced','delivered','cancelled')
                                    NOT NULL DEFAULT 'pending',
  `items_count`     INT UNSIGNED    NOT NULL DEFAULT 0,
  `subtotal_base`   DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT 'SUM(base_price*qty) = modal',
  `subtotal_margin` DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT 'SUM(margin*qty) = gross profit',
  `grand_total`     DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  `customer_note`   VARCHAR(255)    NULL,
  -- Delivery snapshot. Address is stored on the ORDER, not the customer:
  -- someone can order to the office one week and home the next.
  `delivery_type`   ENUM('office','outside') NOT NULL DEFAULT 'office',
  `address_line1`   VARCHAR(255)    NULL,
  `address_district` VARCHAR(120)   NULL,
  `address_city`    VARCHAR(120)    NULL,
  `address_postal`  VARCHAR(10)     NULL,
  `address_landmark` VARCHAR(160)   NULL,
  `wa_message_hash` CHAR(40)        NULL COMMENT 'idempotency for WA redirect resubmits',
  `created_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_order_no` (`order_no`),
  KEY `idx_orders_batch_status` (`batch_id`, `status`),
  KEY `idx_orders_customer` (`customer_id`, `created_at`),
  CONSTRAINT `fk_orders_batch` FOREIGN KEY (`batch_id`)
    REFERENCES `po_batches` (`id`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. ORDER_ITEMS (full price snapshot — immutable after creation)
-- ------------------------------------------------------------
CREATE TABLE `order_items` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL,
  `product_id`    BIGINT UNSIGNED NOT NULL,
  `product_name`  VARCHAR(160)    NOT NULL COMMENT 'snapshot',
  `unit`          VARCHAR(24)     NOT NULL,
  `qty`           INT UNSIGNED    NOT NULL,
  `base_price`    DECIMAL(12,2)   NOT NULL COMMENT 'snapshot of supplier cost',
  `margin`        DECIMAL(12,2)   NOT NULL COMMENT 'snapshot of margin',
  `unit_price`    DECIMAL(12,2)   AS (`base_price` + `margin`) STORED,
  `line_total`    DECIMAL(12,2)   AS ((`base_price` + `margin`) * `qty`) STORED,
  `line_base`     DECIMAL(12,2)   AS (`base_price` * `qty`) STORED,
  `line_margin`   DECIMAL(12,2)   AS (`margin` * `qty`) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_items_order_product` (`order_id`, `product_id`),
  KEY `idx_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. ADMIN_USERS
-- ------------------------------------------------------------
CREATE TABLE `admin_users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`         VARCHAR(160)    NOT NULL,
  `password_hash` VARCHAR(255)    NOT NULL COMMENT 'argon2id',
  `role`          ENUM('owner','admin') NOT NULL DEFAULT 'admin',
  `is_active`     TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_users_email` (`email`)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. SOURCING SHEET — the Thursday/Friday shopping list
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW `v_sourcing_sheet` AS
SELECT
  o.batch_id,
  oi.product_id,
  oi.product_name,
  oi.unit,
  SUM(oi.qty)         AS total_qty,
  oi.base_price,
  SUM(oi.line_base)   AS total_modal,
  SUM(oi.line_margin) AS total_margin,
  SUM(oi.line_total)  AS total_revenue
FROM `order_items` oi
JOIN `orders` o ON o.id = oi.order_id
WHERE o.status IN ('pending','confirmed','sourced')
GROUP BY o.batch_id, oi.product_id, oi.product_name, oi.unit, oi.base_price;
