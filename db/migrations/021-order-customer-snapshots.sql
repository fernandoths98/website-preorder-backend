-- Additive, repeatable migration. Apply BEFORE deploying the security release.
SET @wpo_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_name_snapshot');
SET @wpo_ddl = IF(@wpo_has_column = 0,
  'ALTER TABLE orders ADD COLUMN customer_name_snapshot VARCHAR(120) NULL', 'SELECT 1');
PREPARE wpo_stmt FROM @wpo_ddl;
EXECUTE wpo_stmt;
DEALLOCATE PREPARE wpo_stmt;
SET @wpo_has_column = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_delivery_note_snapshot');
SET @wpo_ddl = IF(@wpo_has_column = 0,
  'ALTER TABLE orders ADD COLUMN customer_delivery_note_snapshot VARCHAR(255) NULL', 'SELECT 1');
PREPARE wpo_stmt FROM @wpo_ddl;
EXECUTE wpo_stmt;
DEALLOCATE PREPARE wpo_stmt;
-- Legacy records retain the currently known customer details; historical overwritten details cannot be recovered here.
UPDATE orders o JOIN customers c ON c.id = o.customer_id
SET o.customer_name_snapshot = c.name, o.customer_delivery_note_snapshot = c.delivery_note
WHERE o.customer_name_snapshot IS NULL;
