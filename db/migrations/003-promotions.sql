CREATE TABLE IF NOT EXISTS `promotions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(160) NOT NULL,
  `eyebrow` VARCHAR(80) NULL,
  `subtitle` VARCHAR(240) NULL,
  `image_url` VARCHAR(512) NULL,
  `cta_label` VARCHAR(80) NULL,
  `cta_url` VARCHAR(512) NULL,
  `starts_at` DATETIME NULL,
  `ends_at` DATETIME NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_promotions_active_schedule_sort` (`is_active`, `starts_at`, `ends_at`, `sort_order`)
) ENGINE=InnoDB;
