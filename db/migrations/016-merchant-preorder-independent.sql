-- Merchant products have their own preorder lead time and do not depend on weekly PO batches.
-- Apply once.

ALTER TABLE products
  ADD COLUMN merchant_preorder_days INT UNSIGNED NULL AFTER merchant_review_note;

ALTER TABLE orders
  MODIFY COLUMN batch_id BIGINT UNSIGNED NULL;
