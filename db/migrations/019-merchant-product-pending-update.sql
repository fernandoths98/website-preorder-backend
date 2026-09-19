-- Keep approved merchant products live while edits await admin review.
-- Apply once.

ALTER TABLE products
  ADD COLUMN merchant_pending_update_json JSON NULL AFTER merchant_preorder_days,
  ADD COLUMN merchant_pending_update_at DATETIME NULL AFTER merchant_pending_update_json;
