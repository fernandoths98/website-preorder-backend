-- Repair/ensure merchant activation schema.
-- Safe to apply once in production even when migration 013 was already applied.

SET @db := DATABASE();

SET @has_token_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'merchants'
    AND COLUMN_NAME = 'activation_token_hash'
);
SET @sql := IF(
  @has_token_col = 0,
  'ALTER TABLE merchants ADD COLUMN activation_token_hash CHAR(64) NULL AFTER password_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_expiry_col := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'merchants'
    AND COLUMN_NAME = 'activation_expires_at'
);
SET @sql := IF(
  @has_expiry_col = 0,
  'ALTER TABLE merchants ADD COLUMN activation_expires_at DATETIME NULL AFTER activation_token_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_token_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'merchants'
    AND INDEX_NAME = 'idx_merchants_activation_token'
);
SET @sql := IF(
  @has_token_index = 0,
  'CREATE INDEX idx_merchants_activation_token ON merchants (activation_token_hash)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
