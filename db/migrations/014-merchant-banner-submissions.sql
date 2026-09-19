-- Merchant banner submissions for approved UMKM products.
-- Apply once. Do not rerun after success.

CREATE TABLE merchant_banner_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  merchant_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(512) NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  status ENUM('pending','approved','rejected','published') NOT NULL DEFAULT 'pending',
  review_note VARCHAR(500) NULL,
  final_image_url VARCHAR(512) NULL,
  promotion_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_merchant_banners_status_created (status, created_at),
  KEY idx_merchant_banners_merchant (merchant_id, created_at),
  KEY idx_merchant_banners_product (product_id),
  CONSTRAINT fk_merchant_banners_merchant FOREIGN KEY (merchant_id)
    REFERENCES merchants(id) ON DELETE CASCADE,
  CONSTRAINT fk_merchant_banners_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_merchant_banners_promotion FOREIGN KEY (promotion_id)
    REFERENCES promotions(id) ON DELETE SET NULL
) ENGINE=InnoDB;
