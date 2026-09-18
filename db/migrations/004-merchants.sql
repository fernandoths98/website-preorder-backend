CREATE TABLE IF NOT EXISTS `merchants` (
 `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 `businessName` VARCHAR(160) NOT NULL,
 `slug` VARCHAR(160) NOT NULL,
 `ownerName` VARCHAR(120) NOT NULL,
 `phone` VARCHAR(24) NOT NULL,
 `email` VARCHAR(160) NULL,
 `category` VARCHAR(80) NOT NULL,
 `address` VARCHAR(255) NOT NULL,
 `description` TEXT NULL,
 `instagram` VARCHAR(160) NULL,
 `logo_url` VARCHAR(512) NULL,
 `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
 `review_note` VARCHAR(500) NULL,
 `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(`id`), UNIQUE KEY `uq_merchants_slug`(`slug`),
 KEY `idx_merchants_phone`(`phone`), KEY `idx_merchants_status_created`(`status`,`created_at`)
) ENGINE=InnoDB;
