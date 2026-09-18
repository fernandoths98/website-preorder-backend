-- NusaPay payment gate for storefront orders.
-- Apply once. Do not rerun after it succeeds.

CREATE TABLE `payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'nusapay',
  `partner_reference_no` VARCHAR(64) NOT NULL,
  `provider_reference_no` VARCHAR(96) NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` ENUM('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
  `qr_content` TEXT NULL,
  `expires_at` DATETIME NULL,
  `paid_at` DATETIME NULL,
  `raw_callback` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_order` (`order_id`),
  UNIQUE KEY `uq_payments_partner_ref` (`partner_reference_no`),
  KEY `idx_payments_status_expires` (`status`, `expires_at`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

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
JOIN `payments` p ON p.order_id = o.id
WHERE p.status = 'paid'
  AND o.status IN ('confirmed','sourced')
GROUP BY o.batch_id, oi.product_id, oi.product_name, oi.unit, oi.base_price;
