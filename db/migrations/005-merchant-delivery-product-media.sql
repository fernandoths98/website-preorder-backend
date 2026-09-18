ALTER TABLE `merchants`
 ADD COLUMN `latitude` DECIMAL(10,7) NULL AFTER `address`, ADD COLUMN `longitude` DECIMAL(10,7) NULL AFTER `latitude`,
 ADD COLUMN `delivery_method` ENUM('own_courier','third_party','both') NULL AFTER `logo_url`,
 ADD COLUMN `free_delivery_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `delivery_method`,
 ADD COLUMN `free_delivery_radius_km` DECIMAL(6,2) NULL AFTER `free_delivery_enabled`,
 ADD COLUMN `outside_radius_policy` ENUM('unavailable','paid') NULL AFTER `free_delivery_radius_km`,
 ADD COLUMN `delivery_fee_type` ENUM('flat','per_km') NULL AFTER `outside_radius_policy`,
 ADD COLUMN `delivery_fee` DECIMAL(12,2) NULL AFTER `delivery_fee_type`,
 ADD COLUMN `max_delivery_radius_km` DECIMAL(6,2) NULL AFTER `delivery_fee`,
 ADD COLUMN `third_party_providers` JSON NULL AFTER `max_delivery_radius_km`;

ALTER TABLE `products` ADD COLUMN `merchant_id` BIGINT UNSIGNED NULL AFTER `supplier_id`,
 ADD CONSTRAINT `fk_products_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE SET NULL,
 ADD KEY `idx_products_merchant` (`merchant_id`);

CREATE TABLE IF NOT EXISTS `product_images` (
 `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `product_id` BIGINT UNSIGNED NOT NULL,
 `image_url` VARCHAR(512) NOT NULL, `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0,
 `is_primary` TINYINT(1) NOT NULL DEFAULT 0, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(`id`), KEY `idx_product_images_product_sort`(`product_id`,`sort_order`),
 CONSTRAINT `fk_product_images_product` FOREIGN KEY(`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `campaigns` (
 `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(160) NOT NULL,
 `type` ENUM('giveaway','new_product','featured') NOT NULL, `status` ENUM('draft','active','ended') NOT NULL DEFAULT 'draft',
 `starts_at` DATETIME NULL, `ends_at` DATETIME NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY(`id`)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS `campaign_products` (
 `campaign_id` BIGINT UNSIGNED NOT NULL, `product_id` BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(`campaign_id`,`product_id`), CONSTRAINT `fk_cp_campaign` FOREIGN KEY(`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
 CONSTRAINT `fk_cp_product` FOREIGN KEY(`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;