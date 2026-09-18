-- Run this if you already created the schema before delivery addresses existed.
USE `wpo`;

ALTER TABLE `orders`
  ADD COLUMN `delivery_type` ENUM('office','outside') NOT NULL DEFAULT 'office' AFTER `customer_note`,
  ADD COLUMN `address_line1`    VARCHAR(255) NULL AFTER `delivery_type`,
  ADD COLUMN `address_district` VARCHAR(120) NULL AFTER `address_line1`,
  ADD COLUMN `address_city`     VARCHAR(120) NULL AFTER `address_district`,
  ADD COLUMN `address_postal`   VARCHAR(10)  NULL AFTER `address_city`,
  ADD COLUMN `address_landmark` VARCHAR(160) NULL AFTER `address_postal`;

-- Outside-office orders cluster by city on the weekend route.
CREATE INDEX `idx_orders_batch_delivery` ON `orders` (`batch_id`, `delivery_type`, `address_city`);
