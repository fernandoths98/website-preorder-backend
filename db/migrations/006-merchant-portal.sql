ALTER TABLE merchants ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;
ALTER TABLE products ADD COLUMN merchant_status ENUM('draft','pending','approved','rejected') NULL AFTER merchant_id,
 ADD COLUMN merchant_review_note VARCHAR(500) NULL AFTER merchant_status;
CREATE INDEX idx_products_merchant_status ON products(merchant_id, merchant_status);